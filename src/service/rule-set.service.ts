import type { z } from "zod";
import { BadRequestException, NotFoundException } from "../exception/http.exception";
import { deepFreeze } from "../helper/commission-rules.default";
import { currentPeriod } from "../helper/period.helper";
import type {
  CommissionRuleSetItem,
  CommissionRuleSetRow,
  ICommissionRuleRepository,
} from "../interface/commission-rules.interface";
import type { IEmployeeService } from "../interface/employee.interface";

/** How long a period's resolved rules stay cached; publishing clears the cache immediately. */
const CACHE_TTL_MS = 5 * 60 * 1000;

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export type RuleSetOptions<R> = {
  schema: z.ZodType<R>;
  /** Rules for any period with no published set. */
  defaults: R;
  /** Table name, only for the "table missing" warning. */
  table: string;
};

/**
 * Versioned rules. Commission is recomputed live from snapshots on every
 * request, so rules are never edited in place: an admin drafts a full rule
 * set with an "effective from" period and publishes it, and each period then
 * uses the latest published set effective on or before it. Periods with none
 * fall back to the defaults. Home (CommissionRuleService) and SDR
 * (SdrCommissionRuleService) each keep their own table and versions.
 */
export abstract class RuleSetService<R> {
  private readonly cache = new Map<string, { rules: Promise<R>; expiresAt: number }>();

  constructor(
    private readonly repository: ICommissionRuleRepository<R>,
    private readonly employeeService: IEmployeeService,
    private readonly options: RuleSetOptions<R>,
  ) {}

  getForPeriod(period: string): Promise<R> {
    const cached = this.cache.get(period);
    if (cached && cached.expiresAt > Date.now()) return cached.rules;

    const { defaults, table } = this.options;
    const rules = this.repository.findPublishedForPeriod(period).then(
      (row) => (row ? this.parseRules(row) : defaults),
      (error) => {
        // Deployed before the table's migration ran: keep commission
        // working on the default rules instead of failing every request.
        if (error?.code === "ER_NO_SUCH_TABLE") {
          console.warn(`${table} table missing — using default rules`);
          return defaults;
        }
        throw error;
      },
    );
    // Don't cache a failed lookup — the next request should retry.
    rules.catch(() => this.cache.delete(period));
    this.cache.set(period, { rules, expiresAt: Date.now() + CACHE_TTL_MS });
    return rules;
  }

  /** The rules in force for a period plus where they come from, for the admin page and tooltips. */
  async getEffective(period: string): Promise<{ ruleSetId: number | null; effectivePeriod: string | null; rules: R }> {
    const row = await this.repository.findPublishedForPeriod(period);
    if (!row) return { ruleSetId: null, effectivePeriod: null, rules: this.options.defaults };
    return { ruleSetId: row.id, effectivePeriod: row.effective_period, rules: this.parseRules(row) };
  }

  async list(): Promise<CommissionRuleSetItem<R>[]> {
    return this.toItems(await this.repository.findAll());
  }

  async get(id: number): Promise<CommissionRuleSetItem<R>> {
    const [item] = await this.toItems([await this.findOrFail(id)]);
    return item!;
  }

  /** New draft starting from an existing set's rules, or from whatever is in force for the target period. */
  async createDraft(effectivePeriod: string, note: string, createdBy: string, copyFromId?: number): Promise<CommissionRuleSetItem<R>> {
    this.assertEditablePeriod(effectivePeriod);
    const rules = copyFromId
      ? this.parseRules(await this.findOrFail(copyFromId))
      : await this.getForPeriod(effectivePeriod);
    const id = await this.repository.insertDraft(effectivePeriod, rules, note, createdBy);
    return this.get(id);
  }

  async updateDraft(id: number, effectivePeriod: string, rules: unknown, note: string, updatedBy: string): Promise<CommissionRuleSetItem<R>> {
    const row = await this.findOrFail(id);
    if (row.status !== "draft") throw new BadRequestException("Aturan yang sudah diterbitkan tidak bisa diubah. Buat versi baru.");
    this.assertEditablePeriod(effectivePeriod);
    await this.repository.updateDraft(id, effectivePeriod, this.validate(rules), note, updatedBy);
    return this.get(id);
  }

  async publish(id: number, publishedBy: string): Promise<CommissionRuleSetItem<R>> {
    const row = await this.findOrFail(id);
    if (row.status !== "draft") throw new BadRequestException("Aturan ini sudah diterbitkan");
    if (!row.note.trim()) throw new BadRequestException("Catatan perubahan wajib diisi sebelum diterbitkan");
    // Re-checked at publish time: a draft created last month may now point at a locked period.
    this.assertEditablePeriod(row.effective_period);
    this.validate(this.parseRules(row));

    await this.repository.publish(id, publishedBy);
    this.cache.clear();
    return this.get(id);
  }

  async deleteDraft(id: number): Promise<void> {
    const row = await this.findOrFail(id);
    if (row.status !== "draft") throw new BadRequestException("Aturan yang sudah diterbitkan tidak bisa dihapus");
    await this.repository.deleteDraft(id);
  }

  /** A draft's rules, for previewing it against the published ones. */
  protected async getDraftRules(id: number): Promise<R> {
    return this.parseRules(await this.findOrFail(id));
  }

  private validate(rules: unknown): R {
    const result = this.options.schema.safeParse(rules);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
        .join("; ");
      throw new BadRequestException("Aturan tidak valid", message);
    }
    return result.data;
  }

  /** Past periods are locked so already-reported commission can't change retroactively. */
  private assertEditablePeriod(period: string) {
    if (!/^\d{6}$/.test(period)) throw new BadRequestException("Periode berlaku harus berformat YYYYMM");
    if (period < currentPeriod()) {
      throw new BadRequestException("Periode berlaku tidak boleh sebelum periode berjalan");
    }
  }

  private async findOrFail(id: number): Promise<CommissionRuleSetRow<R>> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException("Aturan komisi tidak ditemukan");
    return row;
  }

  private parseRules(row: CommissionRuleSetRow<R>): R {
    // mysql2 returns JSON columns already parsed; tolerate a string just in case.
    const raw = typeof row.rules === "string" ? JSON.parse(row.rules) : row.rules;
    // Re-parsing fills in settings added after this set was saved with their defaults.
    return deepFreeze(this.options.schema.parse(raw));
  }

  /** Rows -> API items, with the admins' names resolved so the page can show who did what. */
  private async toItems(rows: CommissionRuleSetRow<R>[]): Promise<CommissionRuleSetItem<R>[]> {
    const ids = [...new Set(rows.flatMap((r) => [r.created_by, r.updated_by, r.published_by]).filter((id): id is string => !!id))];
    const employees = ids.length > 0 ? await this.employeeService.findByEmployeeIds(ids) : [];
    const nameById = new Map(employees.map((e) => [e.employee_id, e.name]));
    const nameOf = (id: string | null) => (id ? (nameById.get(id) ?? id) : null);

    return rows.map((row) => ({
      id: row.id,
      effectivePeriod: row.effective_period,
      status: row.status,
      rules: this.parseRules(row),
      note: row.note,
      createdBy: row.created_by,
      createdByName: nameOf(row.created_by),
      createdAt: toIso(row.created_at) ?? "",
      updatedBy: row.updated_by,
      updatedByName: nameOf(row.updated_by),
      updatedAt: toIso(row.updated_at),
      publishedBy: row.published_by,
      publishedByName: nameOf(row.published_by),
      publishedAt: toIso(row.published_at),
    }));
  }
}

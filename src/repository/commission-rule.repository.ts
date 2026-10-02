import type { AppDatabase } from "../lib/app-database";
import type {
  CommissionRules,
  CommissionRuleSetRow,
  ICommissionRuleRepository,
} from "../interface/commission-rules.interface";

const COLUMNS = `id, effective_period, status, rules, note, created_by, created_at, updated_by, updated_at, published_by, published_at`;

export class CommissionRuleRepository implements ICommissionRuleRepository {
  constructor(private readonly db: AppDatabase) {}

  findAll(): Promise<CommissionRuleSetRow[]> {
    return this.db.query<CommissionRuleSetRow[]>(
      `SELECT ${COLUMNS} FROM commission_rule_set ORDER BY effective_period DESC, id DESC`,
    );
  }

  async findById(id: number): Promise<CommissionRuleSetRow | null> {
    const rows = await this.db.query<CommissionRuleSetRow[]>(
      `SELECT ${COLUMNS} FROM commission_rule_set WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** The published set with the latest effective_period not after `period`; later publishes win ties. */
  async findPublishedForPeriod(period: string): Promise<CommissionRuleSetRow | null> {
    const rows = await this.db.query<CommissionRuleSetRow[]>(
      `SELECT ${COLUMNS} FROM commission_rule_set
       WHERE status = 'published' AND effective_period <= ?
       ORDER BY effective_period DESC, published_at DESC, id DESC
       LIMIT 1`,
      [period],
    );
    return rows[0] ?? null;
  }

  async insertDraft(effectivePeriod: string, rules: CommissionRules, note: string, createdBy: string): Promise<number> {
    const result = await this.db.query<{ insertId: number }>(
      `INSERT INTO commission_rule_set (effective_period, status, rules, note, created_by) VALUES (?, 'draft', ?, ?, ?)`,
      [effectivePeriod, JSON.stringify(rules), note, createdBy],
    );
    return result.insertId;
  }

  async updateDraft(id: number, effectivePeriod: string, rules: CommissionRules, note: string, updatedBy: string): Promise<void> {
    await this.db.query(
      `UPDATE commission_rule_set SET effective_period = ?, rules = ?, note = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ? AND status = 'draft'`,
      [effectivePeriod, JSON.stringify(rules), note, updatedBy, id],
    );
  }

  async publish(id: number, publishedBy: string): Promise<void> {
    await this.db.query(
      `UPDATE commission_rule_set SET status = 'published', published_by = ?, published_at = NOW() WHERE id = ? AND status = 'draft'`,
      [publishedBy, id],
    );
  }

  async deleteDraft(id: number): Promise<void> {
    await this.db.query(`DELETE FROM commission_rule_set WHERE id = ? AND status = 'draft'`, [id]);
  }
}

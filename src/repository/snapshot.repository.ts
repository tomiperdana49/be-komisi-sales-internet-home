import type { AppDatabase } from "../lib/app-database";
import type { ISnapshotRepository } from "../interface/snapshot.interface";
import type {
  CommissionSnapshotRow,
  ISnapshotReadRepository,
} from "../interface/commission.interface";
import {
  ADJUSTABLE_FIELD_COLUMNS,
  type AdjustableSnapshotFields,
  type SnapshotAdjustmentRow,
} from "../interface/adjustment.interface";

const SNAPSHOT_COLUMNS = `
  period, ai_invoice, ai_receipt, customer_id, customer_name, customer_company,
  customer_service_id, customer_service_account, service_id, service_name, category,
  sales, manager, vendor, subscription, line_rental, paid_date, month,
  late_month, type, referral_fee, referral_name, business_operation, is_renewal
`;

/** Index of `ai_invoice` in the positional row tuples INSERTed via SNAPSHOT_COLUMNS above. */
const AI_INVOICE_COLUMN_INDEX = 1;

export class SnapshotRepository implements ISnapshotRepository, ISnapshotReadRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * Joining `employee` is what enforces the "only real salespeople earn
   * commission" rule: rows whose `sales` holds an unresolved raw name
   * (or the Customer Relation Officer placeholder) simply don't match.
   */
  findBySales(employeeId: string, period: string): Promise<CommissionSnapshotRow[]> {
    return this.db.query<CommissionSnapshotRow[]>(
      `SELECT s.* FROM snapshots s
       JOIN employee e ON e.employee_id = s.sales
       WHERE s.sales = ? AND s.period = ?`,
      [employeeId, period],
    );
  }

  findBySalesIds(employeeIds: string[], period: string): Promise<CommissionSnapshotRow[]> {
    if (employeeIds.length === 0) return Promise.resolve([]);
    return this.db.query<CommissionSnapshotRow[]>(
      `SELECT s.* FROM snapshots s
       JOIN employee e ON e.employee_id = s.sales
       WHERE s.sales IN (?) AND s.period = ?`,
      [employeeIds, period],
    );
  }

  /**
   * Recurring rows credited to a manager directly via the `manager`
   * column. Unlike findBySales this deliberately does NOT require a real
   * salesperson — that's what lets Customer Relation Officer invoices
   * still count toward the manager's recurring pool (KOMISI.md 6.D).
   * Renewal price increases (is_renewal, stored as type 'new') stay out of
   * the pool (KOMISI.md 1.3).
   */
  findRecurringByManager(managerId: string, period: string): Promise<CommissionSnapshotRow[]> {
    return this.db.query<CommissionSnapshotRow[]>(
      `SELECT * FROM snapshots
       WHERE manager = ? AND period = ? AND type = 'recurring'`,
      [managerId, period],
    );
  }

  async updateApproval(aiInvoice: number, isApproved: boolean): Promise<void> {
    await this.db.query(`UPDATE snapshots SET is_approved = ? WHERE ai_invoice = ?`, [
      isApproved ? 1 : 0,
      aiInvoice,
    ]);
  }

  async findByAiInvoice(aiInvoice: number): Promise<CommissionSnapshotRow | null> {
    const rows = await this.db.query<CommissionSnapshotRow[]>(
      `SELECT * FROM snapshots WHERE ai_invoice = ? LIMIT 1`,
      [aiInvoice],
    );
    return rows[0] ?? null;
  }

  async updateAdjustableFields(aiInvoice: number, fields: AdjustableSnapshotFields): Promise<void> {
    const entries = (Object.keys(fields) as (keyof AdjustableSnapshotFields)[]).filter(
      (key) => ADJUSTABLE_FIELD_COLUMNS[key] !== undefined,
    );
    if (entries.length === 0) return;

    const setClause = entries.map((key) => `${ADJUSTABLE_FIELD_COLUMNS[key]} = ?`).join(", ");
    const values = entries.map((key) => fields[key] ?? null);

    await this.db.query(
      `UPDATE snapshots SET ${setClause}, is_adjusted = TRUE WHERE ai_invoice = ?`,
      [...values, aiInvoice],
    );
  }

  async insertAdjustmentLog(
    aiInvoice: number,
    employeeId: string,
    oldValue: Partial<AdjustableSnapshotFields>,
    newValue: Partial<AdjustableSnapshotFields>,
    note: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO snapshot_adjustment (ai_invoice, employee_id, old_value, new_value, note) VALUES (?, ?, ?, ?, ?)`,
      [aiInvoice, employeeId, JSON.stringify(oldValue), JSON.stringify(newValue), note],
    );
  }

  findAdjustmentsByAiInvoice(aiInvoice: number): Promise<SnapshotAdjustmentRow[]> {
    return this.db.query<SnapshotAdjustmentRow[]>(
      `SELECT * FROM snapshot_adjustment WHERE ai_invoice = ? ORDER BY created_at DESC`,
      [aiInvoice],
    );
  }

  /**
   * Replaces every snapshots row for `period` whose `type` is in `types`
   * with `rows`, inside one transaction — so a re-run swaps that slice of
   * the period's data atomically (other queries never observe an empty
   * table in between, since MySQL hides uncommitted changes from other
   * sessions). Scoping the delete by `type` keeps this job's re-run from
   * wiping out rows a different job (e.g. old-customer vs new-customer)
   * wrote for the same period.
   *
   * Rows flagged `is_adjusted` (an admin has manually corrected them) are
   * frozen: never deleted, and any freshly-crawled row for the same
   * ai_invoice is dropped rather than inserted alongside it — otherwise
   * the invoice would be double-counted once as the adjusted row and once
   * as the freshly re-crawled one.
   */
  async replaceForPeriod(
    period: string,
    rows: any[][],
    types: string[],
  ): Promise<void> {
    await this.db.withTransaction(async (txQuery) => {
      const adjustedRows = await txQuery<{ ai_invoice: number }[]>(
        "SELECT ai_invoice FROM snapshots WHERE period = ? AND type IN (?) AND is_adjusted = TRUE",
        [period, types],
      );
      const adjustedAiInvoices = new Set(adjustedRows.map((r) => r.ai_invoice));

      await txQuery("DELETE FROM snapshots WHERE period = ? AND type IN (?) AND is_adjusted = FALSE", [
        period,
        types,
      ]);

      const freshRows = adjustedAiInvoices.size > 0
        ? rows.filter((row) => !adjustedAiInvoices.has(row[AI_INVOICE_COLUMN_INDEX]))
        : rows;

      if (freshRows.length > 0) {
        await txQuery(
          `INSERT INTO snapshots (${SNAPSHOT_COLUMNS}) VALUES ?`,
          [freshRows],
        );
      }
    });
  }
}

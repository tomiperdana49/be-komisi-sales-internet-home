import type { AppDatabase } from "../lib/app-database";
import { MANAGER_OWN_SALES_OUT_OF_POOL_SINCE, SDR_JOB_POSITION } from "../helper/commission.helper";
import type { ISnapshotRepository } from "../interface/snapshot.interface";
import type {
  CommissionSnapshotRow,
  InvoiceApprovalLogRow,
  SnapshotAdjustmentLogRow,
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
  sales, manager, vendor, subscription, line_rental, paid_date, transaction_date, activation_date, month,
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
   * the pool (KOMISI.md 1.3). SDR sales stay out too: SDRs sit outside
   * the Manager Area (KOMISI.md 7). The manager's own sales stay out as well:
   * billing sometimes names the manager as their own customer's manager, and
   * those rows already earn commission as Penjualan Pribadi (KOMISI.md 6.F).
   * Applies from MANAGER_OWN_SALES_OUT_OF_POOL_SINCE.
   */
  findRecurringByManager(managerId: string, period: string): Promise<CommissionSnapshotRow[]> {
    return this.db.query<CommissionSnapshotRow[]>(
      `SELECT * FROM snapshots s
       WHERE s.manager = ? AND s.period = ? AND s.type = 'recurring'
         AND (? < ? OR s.sales IS NULL OR s.sales <> ?)
         AND NOT EXISTS (
           SELECT 1 FROM employee e WHERE e.employee_id = s.sales AND e.job_position = ?
         )`,
      [managerId, period, period, MANAGER_OWN_SALES_OUT_OF_POOL_SINCE, managerId, SDR_JOB_POSITION],
    );
  }

  async updateApproval(aiInvoice: number, isApproved: boolean): Promise<void> {
    await this.db.query(`UPDATE snapshots SET is_approved = ? WHERE ai_invoice = ?`, [
      isApproved ? 1 : 0,
      aiInvoice,
    ]);
  }

  async insertApprovalLog(aiInvoice: number, isApproved: boolean, note: string | null, employeeId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO invoice_approval_log (ai_invoice, is_approved, note, employee_id) VALUES (?, ?, ?, ?)`,
      [aiInvoice, isApproved ? 1 : 0, note, employeeId],
    );
  }

  findLatestApprovalLogs(aiInvoices: number[]): Promise<InvoiceApprovalLogRow[]> {
    if (aiInvoices.length === 0) return Promise.resolve([]);
    return this.db.query<InvoiceApprovalLogRow[]>(
      `SELECT l.ai_invoice, l.is_approved, l.note, l.employee_id, l.created_at
       FROM invoice_approval_log l
       JOIN (SELECT MAX(id) id FROM invoice_approval_log WHERE ai_invoice IN (?) GROUP BY ai_invoice) latest ON latest.id = l.id`,
      [aiInvoices],
    );
  }

  findAdjustments(aiInvoices: number[]): Promise<SnapshotAdjustmentLogRow[]> {
    if (aiInvoices.length === 0) return Promise.resolve([]);
    return this.db.query<SnapshotAdjustmentLogRow[]>(
      `SELECT ai_invoice, note, employee_id, created_at FROM snapshot_adjustment
       WHERE ai_invoice IN (?) ORDER BY id`,
      [aiInvoices],
    );
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
   *
   * Admin approvals (is_approved) on the replaced rows are carried over to
   * the re-crawled row for the same ai_invoice and type, so an hourly
   * re-import never undoes an approval.
   */
  async replaceForPeriod(
    period: string,
    rows: any[][],
    types: string[],
  ): Promise<void> {
    await this.db.withTransaction(async (txQuery) => {
      // Also an adjusted row whose type an admin changed away from these types
      // (e.g. a recurring invoice made "new"): its original type is in the
      // adjustment log, and re-inserting it would count the invoice twice.
      // Likewise an invoice an admin moved to another period (period edited
      // by hand, e.g. a wrong NIS activation date): it counts there, not here.
      const adjustedRows = await txQuery<{ ai_invoice: number }[]>(
        `SELECT s.ai_invoice FROM snapshots s
         WHERE s.is_adjusted = TRUE
           AND (
             s.period != ?
             OR s.type IN (?)
             OR EXISTS (
               SELECT 1 FROM snapshot_adjustment sa
               WHERE sa.ai_invoice = s.ai_invoice
                 AND JSON_UNQUOTE(JSON_EXTRACT(sa.old_value, '$.type')) IN (?)
             )
           )`,
        [period, types, types],
      );
      const adjustedAiInvoices = new Set(adjustedRows.map((r) => r.ai_invoice));

      const approvedRows = await txQuery<{ ai_invoice: number; type: string }[]>(
        "SELECT ai_invoice, type FROM snapshots WHERE period = ? AND type IN (?) AND is_adjusted = FALSE AND is_approved = TRUE",
        [period, types],
      );

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

      for (const { ai_invoice, type } of approvedRows) {
        await txQuery("UPDATE snapshots SET is_approved = TRUE WHERE period = ? AND ai_invoice = ? AND type = ?", [
          period,
          ai_invoice,
          type,
        ]);
      }
    });
  }
}

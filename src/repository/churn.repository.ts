import type { AppDatabase } from "../lib/app-database";
import type { BillingDatabase } from "../lib/billing-database";
import type {
  ChurnRow,
  ChurnSummaryRow,
  ChurnApprovalState,
  ChurnUpsertInput,
  IChurnRepository,
  LogCallWaiver,
  RawChurnRow,
  RawStoppedServiceRow,
  WaiverLogCallRow,
} from "../interface/churn.interface";

// A customer service counts as churned if it unregistered within the
// window, only lasted up to a year, and the customer had at least one
// real invoice (excludes services that never actually billed). One that
// already paid for a full year and stopped after it, or that paid its
// termination invoice, is not a churn.
//
// Its close reason (latest ServiceCloseCategoryDetails row) must also count;
// that is filtered in ChurnService against the period's Aturan Komisi
// (countsAsChurnClose), so the query returns the raw ids and names.
const SQL_CHURN_COLUMNS = `
      cs.CustId AS customer_id,
      c.CustName AS customer_name,
      cs.CustServId AS customer_service_id,
      cs.CustAccName AS customer_service_account,
      cs.ServiceId AS service_id,
      s.ServiceType AS service_name,
      cs.CustActivationDate AS registration_date,
      cs.CustUnregDate AS unregistration_date,
      cs.CustCloseReason AS reason,
      scs.name AS close_status,
      TRIM(scdd.name) AS close_reason,
      scd.id AS close_category_id,
      scd.closeCatExistingStatus AS close_status_id,
      cs.SalesId AS sales_id,
      cs.ManagerSalesId AS manager_id,
      cs.Subscription AS subscription,
      cs.Discount AS discount,
      IFNULL(itm.Month, 1) AS period,
      (cs.Subscription - cs.Discount) / IFNULL(itm.Month, 1) AS price,
      i.TotalInvoice
`;

const SQL_CHURN_FROM = `
  FROM CustomerServices cs
  LEFT JOIN Customer c ON c.CustId = cs.CustId
  LEFT JOIN Services s ON s.ServiceId = cs.ServiceId
  LEFT JOIN InvoiceTypeMonth itm ON itm.InvoiceType = cs.InvoiceType
  LEFT JOIN (
    SELECT CustId, CustServId, count(*) TotalInvoice
    FROM CustomerInvoiceTemp
    WHERE Reverse = 0 AND RInvoiceNum = 0
    GROUP BY CustServId
  ) AS i ON i.CustServId = cs.CustServId
  LEFT JOIN ServiceCloseCategoryDetails scd ON scd.id = (
    SELECT MAX(x.id) FROM ServiceCloseCategoryDetails x WHERE x.custServId = cs.CustServId
  )
  LEFT JOIN ServiceCloseCategoryDetail scdd ON scdd.id = scd.closeCategoryDetail
  LEFT JOIN ServiceCloseStatusExisting scs ON scs.id = scd.closeCatExistingStatus
`;

const SQL_CHURN_SELECT = `SELECT ${SQL_CHURN_COLUMNS} ${SQL_CHURN_FROM}`;

// Branches whose services count for commission.
const SQL_IN_BRANCH = `(
      IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
      OR (
        IFNULL(c.DisplayBranchId, c.BranchId) = '028'
        AND cs.SalesId NOT IN ('0208801')
      )
    )`;

const SQL_WITHIN_YEAR = `cs.CustUnregDate <= DATE_ADD(cs.CustRegDate, INTERVAL 1 YEAR)`;

// 12 full months were paid (monthly or prepaid) and it stopped after the
// 12th: the customer finished a year and didn't renew.
const SQL_PAID_12_MONTHS = `IFNULL((
      SELECT SUM(PERIOD_DIFF(cit.AkhirPeriode, cit.AwalPeriode) + 1) >= 12
        AND cs.CustUnregDate >= LAST_DAY(STR_TO_DATE(CONCAT(PERIOD_ADD(MIN(cit.AwalPeriode), 11), '01'), '%Y%m%d'))
      FROM CustomerInvoiceTemp cit
      WHERE cit.CustServId = cs.CustServId
        AND cit.Reverse = 0 AND cit.RInvoiceNum = 0 AND cit.InvProrata = 0
        AND EXISTS (
          SELECT 1
          FROM NewCustomerInvoice nci
          JOIN NewCustomerInvoiceBatch ncib ON ncib.AI = nci.AI
          WHERE nci.Id = cit.InvoiceNum AND nci.No = cit.Urut AND nci.Type = 'internet'
        )
    ), FALSE)`;

// The termination invoice (early-termination fee) is paid.
const SQL_TERMINATION_PAID = `EXISTS (
      SELECT 1
      FROM CustomerInvoiceTemp cit
      JOIN NewCustomerInvoice nci ON nci.Id = cit.InvoiceNum AND nci.No = cit.Urut AND nci.Type = 'internet'
      JOIN NewCustomerInvoiceBatch ncib ON ncib.AI = nci.AI
      WHERE cit.CustServId = cs.CustServId
        AND cit.InvTermination = 1 AND cit.Reverse = 0 AND cit.RInvoiceNum = 0
    )`;

const SQL_CHURN_FROM_BILLING = `${SQL_CHURN_SELECT}
  WHERE cs.ServiceId IN (?)
    AND cs.CustStatus = 'NA'
    AND cs.CustUnregDate BETWEEN ? AND ?
    AND ${SQL_WITHIN_YEAR}
    AND ${SQL_IN_BRANCH}
    AND NOT ${SQL_PAID_12_MONTHS}
    AND NOT ${SQL_TERMINATION_PAID}
  HAVING i.TotalInvoice > 0
`;

// Every service stopped (NA) in the window, whatever its product or branch,
// with each churn condition above as a flag — for the admin's "Layanan NA"
// review of why a stopped service is or isn't a churn.
const SQL_STOPPED_IN_RANGE = `SELECT ${SQL_CHURN_COLUMNS},
      IFNULL(c.DisplayBranchId, c.BranchId) AS customer_branch,
      ${SQL_IN_BRANCH} AS in_branch,
      ${SQL_WITHIN_YEAR} AS within_year,
      ${SQL_PAID_12_MONTHS} AS paid_12_months,
      ${SQL_TERMINATION_PAID} AS termination_paid
  ${SQL_CHURN_FROM}
  WHERE cs.CustStatus = 'NA'
    AND cs.CustUnregDate BETWEEN ? AND ?
  ORDER BY cs.CustUnregDate DESC
`;

// Churns deducted by hand in a later period (churn:carry): the named stopped
// services as they are, without the eligibility rules above.
const SQL_CHURN_BY_ACCOUNT = `${SQL_CHURN_SELECT}
  WHERE cs.CustAccName IN (?) AND cs.CustStatus = 'NA'
`;

// A churn counts in the period holding deduct_date when set (a carried-over
// churn), otherwise in the one holding its unregistration_date.
const CHURN_DATE = "IFNULL(deduct_date, unregistration_date)";

export class ChurnRepository implements IChurnRepository {
  constructor(
    private readonly billingDb: BillingDatabase,
    private readonly appDb: AppDatabase,
  ) {}

  findFromBilling(serviceIds: string[], startDate: string, endDate: string): Promise<RawChurnRow[]> {
    if (serviceIds.length === 0) return Promise.resolve([]);
    return this.billingDb.query<RawChurnRow[]>(SQL_CHURN_FROM_BILLING, [serviceIds, startDate, endDate]);
  }

  findStoppedFromBilling(startDate: string, endDate: string): Promise<RawStoppedServiceRow[]> {
    return this.billingDb.query<RawStoppedServiceRow[]>(SQL_STOPPED_IN_RANGE, [startDate, endDate]);
  }

  findFromBillingByAccounts(accounts: string[]): Promise<RawChurnRow[]> {
    if (accounts.length === 0) return Promise.resolve([]);
    return this.billingDb.query<RawChurnRow[]>(SQL_CHURN_BY_ACCOUNT, [accounts]);
  }

  async findChurnDate(customerServiceId: string): Promise<string | null> {
    const rows = await this.appDb.query<{ churn_date: string }[]>(
      `SELECT DATE_FORMAT(${CHURN_DATE}, '%Y-%m-%d') AS churn_date FROM churn WHERE customer_service_id = ?`,
      [customerServiceId],
    );
    return rows[0]?.churn_date ?? null;
  }

  async setDeductDate(customerServiceId: number, deductDate: string): Promise<void> {
    await this.appDb.query(`UPDATE churn SET deduct_date = ? WHERE customer_service_id = ?`, [
      deductDate,
      customerServiceId,
    ]);
  }

  async upsert(data: ChurnUpsertInput): Promise<void> {
    await this.appDb.query(
      `
      INSERT INTO churn (
        customer_service_id, customer_id, customer_name,
        customer_service_account, service_id, service_name,
        registration_date, unregistration_date, reason,
        close_status, close_reason,
        period, price, sales_id, manager_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        customer_id = VALUES(customer_id),
        customer_name = VALUES(customer_name),
        customer_service_account = VALUES(customer_service_account),
        service_id = VALUES(service_id),
        service_name = VALUES(service_name),
        registration_date = VALUES(registration_date),
        unregistration_date = VALUES(unregistration_date),
        reason = VALUES(reason),
        close_status = VALUES(close_status),
        close_reason = VALUES(close_reason),
        period = VALUES(period),
        price = VALUES(price),
        sales_id = VALUES(sales_id),
        manager_id = VALUES(manager_id)
      `,
      [
        data.customer_service_id,
        data.customer_id,
        data.customer_name,
        data.customer_service_account,
        data.service_id,
        data.service_name,
        data.registration_date,
        data.unregistration_date,
        data.reason,
        data.close_status,
        data.close_reason,
        data.period,
        data.price,
        data.sales_id,
        data.manager_id,
      ],
    );
  }

  async findLocalCsIdsInRange(startDate: string, endDate: string): Promise<number[]> {
    // Carried-over churns were added by hand, so a crawl never deletes them.
    const rows = await this.appDb.query<{ customer_service_id: number }[]>(
      `SELECT customer_service_id FROM churn WHERE deduct_date IS NULL AND unregistration_date BETWEEN ? AND ?`,
      [startDate, endDate],
    );
    return rows.map((row) => Number(row.customer_service_id));
  }

  async deleteByCsIds(csIds: number[]): Promise<void> {
    if (csIds.length === 0) return;
    await this.appDb.query(`DELETE FROM churn WHERE customer_service_id IN (?)`, [csIds]);
  }

  findByEmployeeId(employeeId: string, startDate: string, endDate: string): Promise<ChurnRow[]> {
    return this.appDb.query<ChurnRow[]>(
      `SELECT * FROM churn WHERE sales_id = ? AND ${CHURN_DATE} BETWEEN ? AND ?`,
      [employeeId, startDate, endDate],
    );
  }

  findByEmployeeIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<ChurnRow[]> {
    if (employeeIds.length === 0) return Promise.resolve([]);
    return this.appDb.query<ChurnRow[]>(
      `SELECT * FROM churn WHERE sales_id IN (?) AND ${CHURN_DATE} BETWEEN ? AND ?`,
      [employeeIds, startDate, endDate],
    );
  }

  findSummary(startDate: string, endDate: string, search?: string): Promise<ChurnSummaryRow[]> {
    let query = `
      SELECT c.*,
             e.name AS employee_name, e.employee_id AS employee_eid, e.photo_profile AS employee_photo,
             e.branch AS employee_branch,
             ap.name AS approved_by_name
      FROM churn c
      LEFT JOIN employee e ON c.sales_id = e.employee_id
      LEFT JOIN employee ap ON c.approved_by = ap.employee_id
      WHERE IFNULL(c.deduct_date, c.unregistration_date) BETWEEN ? AND ?
    `;
    const params: any[] = [startDate, endDate];

    if (search) {
      query += ` AND (
        c.customer_id LIKE ? OR
        c.customer_name LIKE ? OR
        c.customer_service_account LIKE ? OR
        c.service_name LIKE ? OR
        e.name LIKE ? OR
        e.employee_id LIKE ? OR
        c.customer_service_id LIKE ?
      )`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }

    query += ` ORDER BY c.unregistration_date DESC`;

    return this.appDb.query<ChurnSummaryRow[]>(query, params);
  }

  async updateApproval(customerServiceId: string, isApproved: boolean, note: string | null, approvedBy: string): Promise<void> {
    await this.appDb.query(
      isApproved
        ? `UPDATE churn SET is_approved = 1, approval_note = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP,
             approval_log_call_id = NULL
           WHERE customer_service_id = ?`
        : `UPDATE churn SET is_approved = 0, approval_note = NULL, approved_by = NULL, approved_at = NULL,
             approval_log_call_id = NULL
           WHERE customer_service_id = ?`,
      isApproved ? [note, approvedBy, customerServiceId] : [customerServiceId],
    );
  }

  findWaiverLogCalls(approverIds: string[], since: string): Promise<WaiverLogCallRow[]> {
    if (approverIds.length === 0) return Promise.resolve([]);
    return this.billingDb.query<WaiverLogCallRow[]>(
      `SELECT LogCallId AS log_call_id, EmpId AS emp_id, CustId AS customer_id, Posted AS posted, Subject AS text
       FROM CustomerLogCall
       WHERE EmpId IN (?) AND Posted >= ? AND Subject LIKE '%churn%'
       ORDER BY LogCallId`,
      [approverIds, since],
    );
  }

  findApprovalStatesInRange(startDate: string, endDate: string): Promise<ChurnApprovalState[]> {
    return this.appDb.query<ChurnApprovalState[]>(
      `SELECT customer_service_id, customer_id, customer_service_account, is_approved, approval_log_call_id
       FROM churn WHERE ${CHURN_DATE} BETWEEN ? AND ?`,
      [startDate, endDate],
    );
  }

  async setLogCallWaiver(customerServiceId: number, waiver: LogCallWaiver): Promise<void> {
    await this.appDb.query(
      `UPDATE churn SET is_approved = 1, approval_note = ?, approved_by = ?, approved_at = ?, approval_log_call_id = ?
       WHERE customer_service_id = ?`,
      [waiver.note, waiver.empId, waiver.posted, waiver.logCallId, customerServiceId],
    );
  }

  async clearLogCallWaiver(customerServiceId: number): Promise<void> {
    await this.appDb.query(
      `UPDATE churn SET is_approved = 0, approval_note = NULL, approved_by = NULL, approved_at = NULL, approval_log_call_id = NULL
       WHERE customer_service_id = ? AND approval_log_call_id IS NOT NULL`,
      [customerServiceId],
    );
  }
}

import type { AppDatabase } from "../lib/app-database";
import type { BillingDatabase } from "../lib/billing-database";
import type {
  ChurnRow,
  ChurnSummaryRow,
  ChurnUpsertInput,
  IChurnRepository,
  RawChurnRow,
} from "../interface/churn.interface";

// A customer service counts as churned if it unregistered within the
// window, only lasted up to a year, and the customer had at least one
// real invoice (excludes services that never actually billed). One that
// already paid for a full year and stopped after it is not a churn.
//
// The close reason (latest ServiceCloseCategoryDetails row) must also count:
// closed while Active (2) or at Renewal (3) always does; at New Installation
// (1) only "Paid not yet to install"; SYSTEM (4) never. Services with no
// close-category row (legacy closings) still count.
const SQL_CHURN_FROM_BILLING = `
  SELECT
      cs.CustId AS customer_id,
      c.CustName AS customer_name,
      cs.CustServId AS customer_service_id,
      cs.CustAccName AS customer_service_account,
      cs.ServiceId AS service_id,
      s.ServiceType AS service_name,
      cs.CustActivationDate AS registration_date,
      cs.CustUnregDate AS unregistration_date,
      cs.CustCloseReason AS reason,
      cs.SalesId AS sales_id,
      cs.ManagerSalesId AS manager_id,
      cs.Subscription AS subscription,
      cs.Discount AS discount,
      IFNULL(itm.Month, 1) AS period,
      (cs.Subscription - cs.Discount) / IFNULL(itm.Month, 1) AS price,
      i.TotalInvoice
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
  WHERE cs.ServiceId IN (?)
    AND cs.CustStatus = 'NA'
    AND cs.CustUnregDate BETWEEN ? AND ?
    AND cs.CustUnregDate <= DATE_ADD(cs.CustRegDate, INTERVAL 1 YEAR)
    AND (
      scd.id IS NULL
      OR scd.closeCatExistingStatus IN (2, 3)
      OR (scd.closeCatExistingStatus = 1 AND TRIM(scdd.name) = 'Paid not yet to install')
    )
    AND (
      IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
      OR (
        IFNULL(c.DisplayBranchId, c.BranchId) = '028'
        AND cs.SalesId NOT IN ('0208801')
      )
    )
    -- Not a churn once 12 full months were paid (monthly or prepaid) and it
    -- stopped after the 12th: the customer finished a year and didn't renew.
    AND NOT IFNULL((
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
    ), FALSE)
  HAVING i.TotalInvoice > 0
`;

export class ChurnRepository implements IChurnRepository {
  constructor(
    private readonly billingDb: BillingDatabase,
    private readonly appDb: AppDatabase,
  ) {}

  findFromBilling(serviceIds: string[], startDate: string, endDate: string): Promise<RawChurnRow[]> {
    if (serviceIds.length === 0) return Promise.resolve([]);
    return this.billingDb.query<RawChurnRow[]>(SQL_CHURN_FROM_BILLING, [serviceIds, startDate, endDate]);
  }

  async upsert(data: ChurnUpsertInput): Promise<void> {
    await this.appDb.query(
      `
      INSERT INTO churn (
        customer_service_id, customer_id, customer_name,
        customer_service_account, service_id, service_name,
        registration_date, unregistration_date, reason,
        period, price, sales_id, manager_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        customer_id = VALUES(customer_id),
        customer_name = VALUES(customer_name),
        customer_service_account = VALUES(customer_service_account),
        service_id = VALUES(service_id),
        service_name = VALUES(service_name),
        registration_date = VALUES(registration_date),
        unregistration_date = VALUES(unregistration_date),
        reason = VALUES(reason),
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
        data.period,
        data.price,
        data.sales_id,
        data.manager_id,
      ],
    );
  }

  async findLocalCsIdsInRange(startDate: string, endDate: string): Promise<number[]> {
    const rows = await this.appDb.query<{ customer_service_id: number }[]>(
      `SELECT customer_service_id FROM churn WHERE unregistration_date BETWEEN ? AND ?`,
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
      `SELECT * FROM churn WHERE sales_id = ? AND unregistration_date BETWEEN ? AND ?`,
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
      `SELECT * FROM churn WHERE sales_id IN (?) AND unregistration_date BETWEEN ? AND ?`,
      [employeeIds, startDate, endDate],
    );
  }

  findSummary(startDate: string, endDate: string, search?: string): Promise<ChurnSummaryRow[]> {
    let query = `
      SELECT c.*,
             e.name AS employee_name, e.employee_id AS employee_eid, e.photo_profile AS employee_photo,
             ap.name AS approved_by_name
      FROM churn c
      LEFT JOIN employee e ON c.sales_id = e.employee_id
      LEFT JOIN employee ap ON c.approved_by = ap.employee_id
      WHERE c.unregistration_date BETWEEN ? AND ?
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
        ? `UPDATE churn SET is_approved = 1, approval_note = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP
           WHERE customer_service_id = ?`
        : `UPDATE churn SET is_approved = 0, approval_note = NULL, approved_by = NULL, approved_at = NULL
           WHERE customer_service_id = ?`,
      isApproved ? [note, approvedBy, customerServiceId] : [customerServiceId],
    );
  }
}

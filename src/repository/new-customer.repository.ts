import type { GoogleSpreadsheetRow } from "google-spreadsheet";
import type { BillingDatabase } from "../lib/billing-database";
import type { GoogleSheetsClient } from "../lib/google-sheets-client";
import { googleConfig } from "../config/google.config";
import type {
  INewCustomerRepository,
  NewCustomerAccountRow,
  NewCustomerInvoiceRow,
  NewCustomerServiceRow,
} from "../interface/new-customer.interface";

const SQL_INVOICE_RECEIPT = `
(SELECT
    cit.CustId \`CID\`,
    cit.CustServId 'CSID',
    cit.ServiceGroup \`SG\`,
    IFNULL(citc.InvoiceDate, cit.InvoiceDate) \`Tanggal Invoice\`,
    IFNULL(citc.InvoiceExpDate, cit.InvoiceExpDate) \`Tanggal Jatuh Tempo\`,
    cit.AwalPeriode \`Period Start\`,
    cit.AkhirPeriode \`Period End\`,
    IFNULL(itm.Month, 1) \`Bulan\`,
    nciic.new_subscription \`DPP\`,
    IF(ncib.batchNo IS NULL, 0, 1) \`Paid\`,
    MAX(DATE(nci2.InsertDate)) \`Tanggal Input Pembayaran\`,
    MAX(IFNULL(nciic.trx_date, nci2.TransDate)) \`Tanggal Transaksi Pembayaran\`,
    nciic.new_subscription \`New Subscription\`,
    nciic.counter \`Counter\`,
    nciic.is_prorata \`Invoice Prorata\`,
    '' \`Code\`,
    fvs.tagihan \`Tagihan FO\`,
    nciic.is_upgrade \`Is Upgrade\`,
    nciic.line_rental \`Line Rental\`,
    nci.AI \`AI Invoice\`,
    MAX(nci2.AI) \`AI Receipt\`,
    IFNULL(rs.Name, "") \`Reseller Name\`
FROM
    CustomerInvoiceTemp cit
    LEFT JOIN CustomerInvoiceTemp_Custom citc ON cit.InvoiceNum = citc.InvoiceNum AND cit.Urut = citc.Urut
    LEFT JOIN InvoiceTypeMonth itm ON itm.InvoiceType = cit.InvoiceType
    LEFT JOIN NewCustomerInvoice nci ON cit.InvoiceNum = nci.Id AND nci.No = cit.Urut AND nci.Type = 'internet'
    LEFT JOIN CustomerInvoiceDiscount cid ON cid.InvoiceNum = cit.InvoiceNum AND cid.Urut = cit.Urut
    LEFT JOIN NewCustomerInvoiceBatch ncib ON nci.AI = ncib.AI
    LEFT JOIN NewCustomerInvoiceBatch ncib2 ON ncib.batchNo = ncib2.batchNo and ncib2.AI != ncib.AI and ncib2.total > 0
    LEFT JOIN NewCustomerInvoice nci2 ON ncib2.AI = nci2.AI
    LEFT JOIN CustomerServices cs ON cit.CustServId = cs.CustServId
    LEFT JOIN Services s ON s.ServiceId = cs.ServiceId
    LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = s.ServiceGroup
    LEFT JOIN Customer c ON c.CustId = cs.CustId
    LEFT JOIN Reseller rs ON c.ResellerId = rs.Id
    LEFT JOIN FiberVendorServices fvs ON fvs.type = 'CustomerServices' AND cs.CustServId = fvs.typeId
    LEFT JOIN NewCustomerInvoiceInternetCounter nciic ON nciic.AI = nci.AI
WHERE cit.RInvoiceNum = 0
    AND (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
    AND (
      IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
      OR (
        IFNULL(c.DisplayBranchId, c.BranchId) IN ('028')
        AND nciic.new_subscription > 110000
        AND cs.SalesId NOT IN ('0208801')
      )
    )
    AND nciic.new_subscription > 0
    AND (
      (DATE(nci.InsertDate) BETWEEN ? AND ?)
      OR (nci2.TransDate IS NOT NULL AND IFNULL(nciic.trx_date, nci2.TransDate) BETWEEN ? AND ?)
      -- Paid earlier but activated in the period: counts here (activationCommissionDate).
      OR EXISTS (
        SELECT 1 FROM CustomerServicesHistoryNew h
        WHERE h.cust_serv_id = cs.CustServId
          AND (h.description LIKE 'Free\n%' OR h.description LIKE 'Activation\n%')
          AND DATE(h.insert_time) BETWEEN ? AND ?
      ))
    AND cs.CustServId IS NOT NULL
GROUP BY nci.AI
ORDER BY nci.AI)
UNION ALL
(SELECT
    cit.cid \`CID\`,
    cit.csid \`CSID\`,
    'Alat' \`SG\`,
    cit.date \`Tanggal Invoice\`,
    cit.due_date \`Tanggal Jatuh Tempo\`,
    DATE_FORMAT(cit.date, '%Y%m') \`Period Start\`,
    DATE_FORMAT(cit.date, '%Y%m') \`Period End\`,
    1 \`Bulan\`,
    cit.dpp \`DPP\`,
    IF(ncib.batchNo IS NULL, 0, 1) \`Paid\`,
    MAX(DATE(nci2.InsertDate)) \`Tanggal Input Pembayaran\`,
    MAX(nci2.TransDate) \`Tanggal Transaksi Pembayaran\`,
    '' \`New Subscription\`,
    '' \`Counter\`,
    '' \`Invoice Prorata\`,
    cit.Code \`Code\`,
    0 \`Tagihan FO\`,
    0 \`Is Upgrade\`,
    0 \`Line Rental\`,
    nci.AI \`AI Invoice\`,
    MAX(nci2.AI) \`AI Receipt\`,
    IFNULL(rs.Name, "") \`Reseller Name\`
FROM
    (
        SELECT
            sih.CustId cid,
            sih.No siid,
            sh.CustServId csid,
            sih.Date date,
            sih.DueDate due_date,
            ROUND(SUM((si.Unit - si.Free) * si.Price) / 1.11, 2) dpp,
            si.Code
        FROM StockInvoice si
        LEFT JOIN StockInvoiceHead sih ON sih.No = si.No
        LEFT JOIN SPMBHead sh ON sh.No = sih.Spmb
        WHERE sih.Status = 'BL' AND sih.RNo = 0
            AND (sh.CustServId != 0 OR sih.No IN (0000130674))
            AND si.Code NOT IN ('SETUP000', 'TRKKBLBI', 'JSTRKKBL', 'TARIKKBL', 'TOWER000', 'TARIKKBV', 'INSTALWF', 'TRKKBLDT', 'TRKKBLFO', 'MNTNCE00', 'JSSETTAP', 'TARKBLFO')
        GROUP BY sih.No
        HAVING DPP != 0
        ORDER BY sih.No
    ) cit
    LEFT JOIN NewCustomerInvoice nci ON nci.Id = cit.siid AND nci.Type = 'stock'
    LEFT JOIN NewCustomerInvoiceBatch ncib ON nci.AI = ncib.AI
    LEFT JOIN NewCustomerInvoiceBatch ncib2 ON ncib.batchNo = ncib2.batchNo and ncib2.AI != ncib.AI and ncib2.total > 0
    LEFT JOIN NewCustomerInvoice nci2 ON ncib2.AI = nci2.AI
    LEFT JOIN Customer c ON c.CustId = cit.cid
    LEFT JOIN Reseller rs ON c.ResellerId = rs.Id
WHERE
    (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
    AND (
      IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
    )
    AND (
      (cit.date BETWEEN ? AND ?) OR (nci2.TransDate BETWEEN ? AND ?)
    )
GROUP BY nci.AI
ORDER BY nci.AI)
UNION ALL
(SELECT
    cit.cid \`CID\`,
    cit.csid \`CSID\`,
    'Alat' \`SG\`,
    cit.date \`Tanggal Invoice\`,
    cit.due_date \`Tanggal Jatuh Tempo\`,
    DATE_FORMAT(cit.date, '%Y%m') \`Period Start\`,
    DATE_FORMAT(cit.date, '%Y%m') \`Period End\`,
    1 \`Bulan\`,
    cit.dpp \`DPP\`,
    IF(ncib.batchNo IS NULL, 0, 1) \`Paid\`,
    MAX(DATE(nci2.InsertDate)) \`Tanggal Input Pembayaran\`,
    MAX(nci2.TransDate) \`Tanggal Transaksi Pembayaran\`,
    '' \`New Subscription\`,
    '' \`Counter\`,
    '' \`Invoice Prorata\`,
    cit.Code \`Code\`,
    0 \`Tagihan FO\`,
    0 \`Is Upgrade\`,
    0 \`Line Rental\`,
    nci.AI \`AI Invoice\`,
    MAX(nci2.AI) \`AI Receipt\`,
    IFNULL(rs.Name, "") \`Reseller Name\`
FROM
    (
        SELECT
            sih.CustId cid,
            sih.No siid,
            sh.CustServId csid,
            sih.Date date,
            sih.DueDate due_date,
            ROUND(SUM((si.Unit - si.Free) * si.Price) / 1.11, 2) dpp,
            si.Code
        FROM StockInvoice si
        LEFT JOIN StockInvoiceHead sih ON sih.No = si.No
        LEFT JOIN SPMBHead sh ON sh.No = sih.Spmb
        WHERE sih.Status = 'BL' AND sih.RNo = 0
            AND sh.CustServId != 0
            AND si.Code IN ('SETUP000', 'TRKKBLBI', 'JSTRKKBL', 'TARIKKBL', 'TARIKKBV', 'TRKKBLDT', 'TRKKBLFO', 'INSTALWF', 'MNTNCE00', 'JSSETTAP', 'TARKBLFO')
        GROUP BY sih.No
        HAVING DPP != 0
        ORDER BY sih.No
    ) cit
    LEFT JOIN NewCustomerInvoice nci ON nci.Id = cit.siid AND nci.Type = 'stock'
    LEFT JOIN NewCustomerInvoiceBatch ncib ON nci.AI = ncib.AI
    LEFT JOIN NewCustomerInvoiceBatch ncib2 ON ncib.batchNo = ncib2.batchNo and ncib2.AI != ncib.AI and ncib2.total > 0
    LEFT JOIN NewCustomerInvoice nci2 ON ncib2.AI = nci2.AI
    LEFT JOIN Customer c ON c.CustId = cit.cid
    LEFT JOIN Reseller rs ON c.ResellerId = rs.Id
WHERE
    (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
    AND (
      IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
    )
    AND (
      (cit.date BETWEEN ? AND ?) OR (nci2.TransDate BETWEEN ? AND ?)
    )
GROUP BY nci.AI
ORDER BY nci.AI);
`;

const SQL_ACCOUNT = `
SELECT
    c.CustId AS \`CID\`,
    cs.CustServId AS \`CSID\`,
    c.CustName AS \`Nama Customer\`,
    c.CustCompany AS \`Company\`,
    cs.CustAccName AS \`Account\`,
    IFNULL(cs.ServiceType, s.ServiceType) AS \`Nama Service\`,
    s.ServiceId \`Service Id\`,
    s.ServiceGroup AS \`Category\`,
    IFNULL(csa.first_active, cs.CustActivationDate) AS \`Awal Aktif\`,
    csa.first_active AS \`Aktivasi Tercatat\`,
    IF(ss.NormalUpCeil > ss.NormalDownCeil, FLOOR(ss.NormalUpCeil/1024), FLOOR(ss.NormalDownCeil/1024)) AS \`Bandwidth (Mbps)\`,
    v.Vendor,
    vt.tagihan \`Line Rental\`,
    nb.BranchCity \`Cabang\`,
    TRIM(CONCAT(TRIM(e1.EmpFName), ' ', TRIM(e1.EmpLName))) \`Sales\`,
    TRIM(CONCAT(TRIM(e2.EmpFName), ' ', TRIM(e2.EmpLName))) \`Manager Sales\`,
    cs.CustStatus,
    IFNULL(c.DisplayBranchId, c.BranchId) \`Branch ID\`
FROM
    Customer c
    LEFT JOIN CustomerServices cs ON c.CustId = cs.CustId
    LEFT JOIN Services s ON cs.ServiceId = s.ServiceId
    LEFT JOIN ServiceGroup sg ON sg.ServiceGroup = s.ServiceGroup
    LEFT JOIN ServiceShaping ss ON ss.ServiceId = s.ServiceId
    LEFT JOIN (
        SELECT
            cstl.custServId \`CSID\`,
            group_concat(distinct fv.name) \`Vendor\`
        FROM
            CustomerServiceTechnicalLink cstl
            LEFT JOIN noc_fiber nf ON cstl.foVendorId = nf.id
            LEFT JOIN fiber_vendor fv ON fv.id = nf.vendorId
        WHERE cstl.type = 'fo'
        GROUP BY cstl.custServId
    ) v ON cs.CustServId = v.CSID
    LEFT JOIN (
        SELECT
            typeId csid,
            sum(tagihan) tagihan
        FROM FiberVendorServices
        WHERE
            type = 'CustomerServices' AND
            \`show\` = 1 AND
            typeId != 0
        GROUP BY typeId
        HAVING tagihan != 0
    ) vt ON vt.csid = cs.CustServId
    LEFT JOIN Employee e1 ON e1.EmpId = IFNULL(cs.SalesId, c.SalesId)
    LEFT JOIN Employee e2 ON e2.EmpId = IFNULL(cs.ManagerSalesId, c.ManagerSalesId)
    LEFT JOIN NusaBranch nb ON nb.BranchId = IFNULL(c.DisplayBranchId, c.BranchId)
    LEFT JOIN (
        SELECT cust_serv_id csid, DATE(MIN(insert_time)) first_active
        FROM CustomerServicesHistoryNew
        WHERE description LIKE 'Free\n%' OR description LIKE 'Activation\n%'
        GROUP BY cust_serv_id
    ) csa ON csa.csid = cs.CustServId
WHERE
    (
      IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '028', '029')
    );
`;

const SQL_SERVICE = `
SELECT nci.AI, cit.ServiceId, cit.ServiceIdFor, s.ServiceType
FROM
  NewCustomerInvoice nci
    LEFT JOIN CustomerInvoiceTemp cit ON nci.Id = cit.InvoiceNum AND nci.No = cit.Urut
    LEFT JOIN Services s ON cit.ServiceId = s.ServiceId
WHERE
  nci.Type = 'internet' AND
  ((cit.date BETWEEN ? AND ?) OR (nci.TransDate BETWEEN ? AND ?))
`;

export class NewCustomerRepository implements INewCustomerRepository {
  constructor(
    private readonly billingDb: BillingDatabase,
    private readonly sheets: GoogleSheetsClient,
  ) {}

  findInvoices(params: string[]): Promise<NewCustomerInvoiceRow[]> {
    return this.billingDb.query<NewCustomerInvoiceRow[]>(SQL_INVOICE_RECEIPT, params);
  }

  findAccounts(): Promise<NewCustomerAccountRow[]> {
    return this.billingDb.query<NewCustomerAccountRow[]>(SQL_ACCOUNT);
  }

  findServices(params: string[]): Promise<NewCustomerServiceRow[]> {
    return this.billingDb.query<NewCustomerServiceRow[]>(SQL_SERVICE, params);
  }

  findSheetRows(period: string): Promise<GoogleSpreadsheetRow[]> {
    return this.sheets.getRows(period, googleConfig.newCustomerSpreadsheetId);
  }
}

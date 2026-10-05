import type { GoogleSpreadsheetRow } from "google-spreadsheet";
import { getDateRangeForPeriod } from "../helper/period.helper";
import { parseNumber } from "../helper/parse.helper";
import { normalizeBusinessOperation } from "../helper/business-operation.helper";
import type { ServiceCatalogEntry } from "../interface/service-catalog.interface";
import type { IEmployeeService } from "../interface/employee.interface";
import type {
  IOldCustomerRepository,
  IOldCustomerService,
  OldCustomerAccountRow,
} from "../interface/old-customer.interface";
import type { IServiceCatalogService } from "../interface/service-catalog.interface";
import type { ISnapshotService, RawSnapshotInput } from "../interface/snapshot.interface";

const CPE_RENTAL_SERVICE_IDS = [
  "CPERENT",
  "CPESTD",
  "CPEHIGH",
  "CPEPNM",
  "CPESTDPNM",
];

const VPS_SERVICE_IDS = [
  "VPSSG200",
  "VPSSG400",
  "VPS320ID",
  "VPSSG55",
  "VPSSG160GB",
  "VPSSG640",
  "VPSSG1280",
];

const FO_CATEGORIES = ["FO", "FO Prepaid"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toSqlDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isNaN(num) ? null : num;
}

function mapCategory(sg: string | null, serviceId: string | null): string {
  if (serviceId && CPE_RENTAL_SERVICE_IDS.includes(serviceId)) return "CPE Rental";
  if (serviceId && VPS_SERVICE_IDS.includes(serviceId)) return "Digital Business";
  if (serviceId === "GCP") return "Digital Business";

  switch (sg) {
    case "IC":
    case "II":
    case "WL":
    case "VB":
      return "Wireless";
    case "FD":
    case "FB":
    case "PFO":
      return "FO";
    case "FBP":
      return "FO Prepaid";
    case "ST":
      return "Setup";
    case "SA":
      if (serviceId === "CICILALAT") return "Cicilan";
      if (serviceId === "CPERENT") return "Rental";
      return "Lain-lain";
    case "GS":
    case "SV":
    case "WH":
    case "DO":
    case "CM":
    case "ZH":
    case "NW":
    case "NP":
    case "CL":
    case "M3":
      return "Digital Business";
    case "IP":
      return "IP Public";
    case "SL":
    case "SLP":
      return "Starlink";
    default:
      return "Lain-lain";
  }
}

/**
 * A recurring invoice counts in the period its payment falls in (start..end,
 * inclusive), not just "paid at some point". The invoice query also matches
 * on AwalPeriode >= period, so an invoice paid early — e.g. October's service
 * paid on 22 Sep — would otherwise count in September (paid then) AND again in
 * October. Mirrors how the old Apps Script/sheet assigns rows to periods.
 */
/**
 * IS-1508 (old Apps Script): an invoice paid on/before the 25th but only
 * entered by finance on/after the 27th of the same month — the invoice's own
 * month — counts in the next period, so its input date is what places it.
 * Otherwise the transaction date does (falling back to the input date).
 */
export function effectivePaymentDate(invoiceDate: unknown, transactionDate: unknown, inputDate: unknown): unknown {
  const toDate = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const d = new Date(v as any);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const invoice = toDate(invoiceDate);
  const transaction = toDate(transactionDate);
  const input = toDate(inputDate);
  const month = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  if (
    invoice && transaction && input &&
    month(transaction) === month(invoice) && month(input) === month(invoice) &&
    transaction.getDate() <= 25 && input.getDate() >= 27
  ) {
    return inputDate;
  }
  return transactionDate ?? inputDate;
}

export function isPaidWithinPeriod(paid: unknown, paymentDateRaw: unknown, start: Date, end: Date): boolean {
  if (Number(paid) !== 1 || paymentDateRaw === null || paymentDateRaw === undefined) return false;
  const paymentDate = new Date(paymentDateRaw as any);
  if (Number.isNaN(paymentDate.getTime())) return false;
  return paymentDate >= start && paymentDate <= end;
}

function getLateInMonth(dueDate: unknown, paymentDateRaw: unknown): number | null {
  if (paymentDateRaw === null || paymentDateRaw === undefined) return null;
  const paymentDate = new Date(paymentDateRaw as any);
  if (Number.isNaN(paymentDate.getTime())) return null;
  if (dueDate === null || dueDate === undefined) return null;
  const expDate = new Date(dueDate as any);
  if (Number.isNaN(expDate.getTime())) return null;

  let month = 0;
  month += paymentDate.getFullYear() * 12 + paymentDate.getMonth() + 1;
  month -= expDate.getFullYear() * 12 + expDate.getMonth() + 2;
  month += paymentDate.getDate() > expDate.getDate() ? 1 : 0;

  const result = Math.max(month, 0);
  return result || null;
}

export class OldCustomerService implements IOldCustomerService {
  // `type` value this domain writes — used to scope replaceForPeriod so a
  // re-run never touches the new-customer rows for the same period.
  static readonly TYPES = ["recurring"];

  constructor(
    private readonly oldCustomerRepository: IOldCustomerRepository,
    private readonly employeeService: IEmployeeService,
    private readonly serviceCatalogService: IServiceCatalogService,
    private readonly snapshotService: ISnapshotService,
  ) {}

  /** Pulls recurring invoice/account rows from the billing DB and shapes them into RawSnapshotInput. */
  async fetchSnapshotInputs(period: string): Promise<RawSnapshotInput[]> {
    const { start, end } = getDateRangeForPeriod(period);
    const startStr = toSqlDate(start);
    const endStr = toSqlDate(end);

    // Sequential — the billing pool has been observed to drop the connection
    // under concurrent heavy queries (see new-customer.service.ts).
    const invoiceRows = await this.oldCustomerRepository.findInvoices([
      period,
      startStr, endStr,
      startStr, endStr,
      startStr, endStr,
    ]);
    const accountRows = await this.oldCustomerRepository.findAccounts();
    const resellerFees = await this.oldCustomerRepository.findResellerFees(period);

    const accountByCsid = new Map<number, OldCustomerAccountRow>();
    for (const row of accountRows) {
      if (row.CSID) accountByCsid.set(row.CSID, row);
    }

    const results: RawSnapshotInput[] = [];

    for (const inv of invoiceRows) {
      const account = inv.CSID ? accountByCsid.get(inv.CSID) : undefined;
      if (!account) continue;

      const category = mapCategory(inv.SG, inv.SID);
      const isFo = FO_CATEGORIES.includes(category);

      const vendor = isFo ? account.Vendor : null;
      const lineRental = isFo ? toNumber(inv["Line Rental"]) : 0;

      const late = getLateInMonth(
        inv["Tanggal Jatuh Tempo"],
        inv["Tanggal Transaksi Pembayaran"],
      );

      const paymentDate = effectivePaymentDate(
        inv["Tanggal Invoice"],
        inv["Tanggal Transaksi Pembayaran"],
        inv["Tanggal Input Pembayaran"],
      );
      const paid = isPaidWithinPeriod(inv.Paid, paymentDate, start, end) ? 1 : 0;

      results.push({
        category,
        paid,
        serviceId: inv.SID,
        namaService: inv["Nama Service"],
        dpp: toNumber(inv.DPP),
        prorate: null,
        upgrade: null,
        biayaAlat: null,
        setup: null,
        sales: account.Sales,
        managerSales: account["Manager Sales"],
        aiInvoice: inv["AI Invoice"],
        aiReceipt: inv["AI Receipt"],
        cid: inv.CID,
        namaCustomer: account["Nama Customer"],
        company: account.Company,
        csid: inv.CSID,
        account: account.Account,
        vendor,
        lineRental,
        paidDate: inv["Tanggal Input Pembayaran"] as any,
        bulan: inv.Bulan,
        telatBulan: late,
        // Referral fee comes from the reseller spreadsheet, keyed by account name; prorata invoices carry none.
        biayaReferral: Number(inv["Is Prorata"]) ? null : (resellerFees.get(account.Account?.trim() ?? "") ?? null),
        // Same source as the sheet's "Reseller" column.
        referralName: account.Reseller,
        businessOperation:
          category === "Digital Business"
            ? normalizeBusinessOperation(inv["Business Operation"])
            : null,
      });
    }

    return results;
  }

  /**
   * Maps an old-customer Google Sheet row into RawSnapshotInput. The sheet has
   * no ServiceId or BusinessOperation column, so both are resolved by looking
   * the service name up against the billing DB's Services catalog (see
   * service-catalog.service.ts for why this is best-effort, not a guaranteed
   * match).
   */
  mapSheetRowToSnapshotInput(
    row: GoogleSpreadsheetRow,
    catalog: Map<string, ServiceCatalogEntry>,
  ): RawSnapshotInput {
    const get = (header: string): string | null | undefined => row.get(header);
    const category = get("Category");
    return {
      category,
      paid: get("Paid"),
      serviceId: this.serviceCatalogService.resolveServiceId(get("Nama Service"), catalog),
      businessOperation:
        category?.trim() === "Digital Business"
          ? this.serviceCatalogService.resolveBusinessOperation(get("Nama Service"), catalog)
          : null,
      namaService: get("Nama Service"),
      dpp: get("DPP"),
      prorate: null,
      upgrade: null,
      biayaAlat: null,
      setup: null,
      sales: get("Sales"),
      managerSales: get("Manager Sales"),
      aiInvoice: get("AI Invoice"),
      aiReceipt: get("AI Receipt"),
      cid: get("CID"),
      namaCustomer: get("Nama Customer"),
      company: get("Company"),
      csid: get("CSID"),
      account: get("Account"),
      vendor: get("Vendor"),
      lineRental: get("Line Rental"),
      paidDate: get("Tanggal Input Pembayaran"),
      bulan: get("Bulan"),
      telatBulan: get("Telat (Bulan)"),
      biayaReferral: get("Biaya Referral"),
      referralName: get("Reseller"),
    };
  }

  /**
   * Old-customer variant: no category allowlist (every category is kept)
   * except the period's excluded categories (Domain by
   * default, admin-configurable), which never earn commission and are
   * dropped outright. Subscription comes straight from DPP, and type is
   * always "recurring". Paid gate and sales/manager resolution stay
   * identical to the new-customer path.
   */
  buildRecurringSnapshotValues(
    input: RawSnapshotInput,
    employeeMap: Map<string, string>,
    /** Categories that never earn commission (CommissionRules.excludedRecurringCategories) — dropped outright rather than rated at 0%. */
    excludedCategories: string[],
  ): any[] | null {
    const category = input.category?.toString().trim() || null;
    const paid = input.paid?.toString().trim();

    if (category && excludedCategories.some((c) => c.toLowerCase() === category.toLowerCase())) return null;
    if (paid !== "1") return null;

    // Digital Business commission is driven entirely by Internal vs Resell
    // (1% vs 0.5%), so a row we can't classify has no defined rate — drop it
    // rather than guess. Applies to both the DB and sheet sources.
    if (category === "Digital Business" && !input.businessOperation) {
      return null;
    }

    const { value: sales, skip: skipSales } = this.employeeService.resolveSales(
      input.sales?.toString(),
      employeeMap,
    );
    if (skipSales) return null;

    const manager = this.employeeService.resolveEmployee(
      input.managerSales?.toString(),
      employeeMap,
    );

    return this.snapshotService.assembleValues(
      input,
      category,
      sales,
      manager,
      parseNumber(input.dpp),
      "recurring",
    );
  }
}

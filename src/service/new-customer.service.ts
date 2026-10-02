import type { GoogleSpreadsheetRow } from "google-spreadsheet";
import { getDateRangeForPeriod } from "../helper/period.helper";
import { parseNumber } from "../helper/parse.helper";
import type { IEmployeeService } from "../interface/employee.interface";
import type {
  INewCustomerRepository,
  INewCustomerService,
  NewCustomerAccountRow,
} from "../interface/new-customer.interface";
import type {
  IServiceCatalogService,
  ServiceCatalogEntry,
} from "../interface/service-catalog.interface";
import type { ISnapshotService, RawSnapshotInput, Scalar } from "../interface/snapshot.interface";

export const ALLOWED_CATEGORIES = ["Alat", "Setup", "FO Prepaid"] as const;
export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

// Stock-invoice codes that represent a setup charge rather than equipment.
const SETUP_CODE = [
  "SETUP000",
  "JSTRKKBL",
  "TARIKKBL",
  "TRKKBLDT",
  "INSTALWF",
  "TRKKBLFO",
  "MNTNCE00",
  "JSSETTAP",
  "TARKBLFO",
  "TARIKKBV",
];

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

function mapCategory(sg: string | null, serviceName: string | null): string {
  const name = (serviceName ?? "").toLowerCase();
  switch (sg) {
    case "IC":
    case "II":
    case "WL":
    case "VB":
      return name.includes("bandwidth on demand") ? "BOD" : "Wireless";
    case "FD":
      return name.includes("bandwidth on demand") ? "BOD" : "FO";
    case "FB":
      return "FO";
    case "FBP":
      return "FO Prepaid";
    case "ST":
      return "Setup";
    case "Alat":
      return "Alat";
    case "SA":
      if (name.includes("cicilan")) return "Cicilan";
      if (name === "biaya rental cpe") return "Rental";
      return "Lain-lain";
    case "GS":
    case "SV":
    case "WH":
    case "DO":
    case "CM":
    case "ZH":
    case "NW":
      return "Digital Business";
    default:
      return "Lain-lain";
  }
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

export class NewCustomerService implements INewCustomerService {
  // `type` values this domain writes — used to scope replaceForPeriod so a
  // re-run never touches the old-customer (recurring) rows for the same period.
  static readonly TYPES = ["new", "upgrade", "prorate"];

  constructor(
    private readonly newCustomerRepository: INewCustomerRepository,
    private readonly employeeService: IEmployeeService,
    private readonly serviceCatalogService: IServiceCatalogService,
    private readonly snapshotService: ISnapshotService,
  ) {}

  /** Pulls invoice/account/service rows from the billing DB and shapes them into RawSnapshotInput. */
  async fetchSnapshotInputs(period: string): Promise<RawSnapshotInput[]> {
    const { start, end } = getDateRangeForPeriod(period);
    const startStr = toSqlDate(start);
    const endStr = toSqlDate(end);

    // Run sequentially — these are heavy queries (tens of thousands of rows)
    // and running them concurrently on the pool has been observed to trip a
    // "Connection lost" error against this server.
    const invoiceRows = await this.newCustomerRepository.findInvoices([
      startStr, endStr, startStr, endStr,
      startStr, endStr, startStr, endStr,
      startStr, endStr, startStr, endStr,
    ]);
    const accountRows = await this.newCustomerRepository.findAccounts();
    const serviceRows = await this.newCustomerRepository.findServices([
      startStr, endStr, startStr, endStr,
    ]);

    const accountByCsid = new Map<number, NewCustomerAccountRow>();
    const accountByCid = new Map<string, NewCustomerAccountRow>();
    for (const row of accountRows) {
      if (row.CSID) accountByCsid.set(row.CSID, row);
      accountByCid.set(row.CID, row);
    }

    const serviceLabelByAi = new Map<number, string>();
    const serviceIdByAi = new Map<number, string>();
    for (const row of serviceRows) {
      if (row.ServiceType) serviceLabelByAi.set(row.AI, row.ServiceType);
      if (row.ServiceId) serviceIdByAi.set(row.AI, row.ServiceId);
    }

    const results: RawSnapshotInput[] = [];

    for (const inv of invoiceRows) {
      const account =
        (inv.CSID && accountByCsid.get(inv.CSID)) || accountByCid.get(inv.CID);

      let late: number | null = null;
      if (account && (account.CustStatus !== "BL" || inv.SG === "ST" || inv.SG === "Alat")) {
        late = getLateInMonth(inv["Tanggal Jatuh Tempo"], inv["Tanggal Transaksi Pembayaran"]);
      }

      let isPaid = 0;
      let inputPaymentDate: unknown = null;
      let aiReceipt: number | null = null;
      const transPaymentDateRaw = inv["Tanggal Transaksi Pembayaran"];
      if (transPaymentDateRaw !== null && transPaymentDateRaw !== undefined) {
        const paymentDate = new Date(transPaymentDateRaw as any);
        if (!Number.isNaN(paymentDate.getTime()) && paymentDate <= end) {
          isPaid = 1;
          inputPaymentDate = inv["Tanggal Input Pembayaran"];
          aiReceipt = inv["AI Receipt"];
        }
      }

      let serviceLabel = serviceLabelByAi.get(inv["AI Invoice"]) ?? "";
      if (!serviceLabel && account) {
        serviceLabel = account["Nama Service"] ?? "";
      }

      let serviceId = serviceIdByAi.get(inv["AI Invoice"]) ?? "";
      if (!serviceId && account) {
        serviceId = account["Service Id"] ?? "";
      }

      let bulan: number = inv.Bulan;
      if (account?.["Branch ID"] === "028") {
        bulan = 1;
      }

      let sg = inv.SG;
      let dpp = toNumber(inv.DPP);
      let biayaAlat: number | null = null;
      let setup: number | null = null;
      let upgrade: number | null = null;
      let prorate: number | null = null;
      let lineRental = toNumber(inv["Line Rental"]);
      if (lineRental !== null && bulan) lineRental = lineRental / bulan;
      let bandwidth = account?.["Bandwidth (Mbps)"] ?? null;
      let vendor = account?.Vendor ?? null;

      if (sg === "ST") {
        bandwidth = null;
        vendor = null;
        lineRental = null;
        dpp = null;
        setup = toNumber(inv["New Subscription"]);
      }

      if (sg === "Alat") {
        bandwidth = null;
        vendor = null;
        lineRental = null;
        dpp = null;
        if (inv.Code && SETUP_CODE.includes(inv.Code)) {
          setup = toNumber(inv.DPP);
          sg = "ST";
        } else {
          biayaAlat = toNumber(inv.DPP);
        }
      }

      if ((inv["Is Upgrade"] ?? 0) > 0) {
        dpp = null;
        upgrade = toNumber(inv["New Subscription"]);
      }

      if (toNumber(inv["Invoice Prorata"]) === 1) {
        dpp = null;
        prorate = toNumber(inv.DPP);
      }

      // Billing flags part of a renewal's price (e.g. promo pricing ending) as
      // new_subscription, but the customer isn't new: counter > 1 means an
      // earlier invoice exists. Kept as a "new" row (this job owns those) and
      // commissioned as recurring instead (KOMISI.md 1.3).
      const isRenewal =
        inv.SG !== "Alat" && inv.SG !== "ST" && upgrade === null && prorate === null && (toNumber(inv.Counter) ?? 0) > 1;

      const categorySourceName = account?.["Nama Service"] ?? "";
      const category = mapCategory(sg, categorySourceName);

      results.push({
        category,
        paid: isPaid,
        serviceId: serviceId || null,
        namaService: serviceLabel,
        dpp,
        prorate,
        upgrade,
        biayaAlat,
        setup,
        sales: account?.Sales ?? null,
        managerSales: account?.["Manager Sales"] ?? null,
        aiInvoice: inv["AI Invoice"],
        aiReceipt,
        cid: inv.CID,
        namaCustomer: account?.["Nama Customer"] ?? null,
        company: account?.Company ?? null,
        csid: inv.CSID,
        account: account?.Account ?? null,
        vendor,
        lineRental,
        paidDate: inputPaymentDate as any,
        bulan,
        telatBulan: late,
        biayaReferral: null,
        referralName: null,
        isRenewal,
      });
    }

    return results;
  }

  /**
   * Maps a new-customer Google Sheet row into RawSnapshotInput. The sheet has
   * no ServiceId column, so it's resolved by looking the service name up
   * against the billing DB's Services catalog (see service-catalog.service.ts
   * for why this is best-effort, not a guaranteed match).
   */
  mapSheetRowToSnapshotInput(
    row: GoogleSpreadsheetRow,
    catalog: Map<string, ServiceCatalogEntry>,
  ): RawSnapshotInput {
    const get = (header: string): string | null | undefined => row.get(header);
    return {
      category: get("Category"),
      paid: get("Paid"),
      serviceId: this.serviceCatalogService.resolveServiceId(get("Nama Service"), catalog),
      namaService: get("Nama Service"),
      dpp: get("DPP"),
      prorate: get("Prorate"),
      upgrade: get("Upgrade"),
      biayaAlat: get("Biaya Alat"),
      setup: get("Setup"),
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
      referralName: get("Referral"),
    };
  }

  private resolveSubscription(
    category: AllowedCategory,
    fields: {
      dpp: Scalar;
      prorate: Scalar;
      upgrade: Scalar;
      biayaAlat: Scalar;
      setup: Scalar;
    },
  ): { subscription: number | null; type: "new" | "upgrade" | "prorate" } {
    if (category === "FO Prepaid") {
      const dpp = parseNumber(fields.dpp);
      if (dpp !== null) {
        return { subscription: dpp, type: "new" };
      }

      const prorateEmpty = parseNumber(fields.prorate) === null;
      if (prorateEmpty) {
        return { subscription: parseNumber(fields.upgrade), type: "upgrade" };
      }

      return { subscription: parseNumber(fields.prorate), type: "prorate" };
    }

    if (category === "Alat") {
      return { subscription: parseNumber(fields.biayaAlat), type: "new" };
    }

    // Setup
    return { subscription: parseNumber(fields.setup), type: "new" };
  }

  /**
   * Applies the new-customer category allowlist, the paid gate, the Alat/Setup
   * service-name prefix rule, and the subscription+type derivation. Returns
   * the ordered values for the snapshots INSERT, or null if the row should be
   * skipped.
   */
  buildSnapshotValues(
    input: RawSnapshotInput,
    employeeMap: Map<string, string>,
  ): any[] | null {
    const category = input.category?.toString().trim() as
      | AllowedCategory
      | undefined;
    const paid = input.paid?.toString().trim();

    if (!category || !ALLOWED_CATEGORIES.includes(category) || paid !== "1") {
      return null;
    }

    const { subscription, type } = this.resolveSubscription(category, {
      dpp: input.dpp,
      prorate: input.prorate,
      upgrade: input.upgrade,
      biayaAlat: input.biayaAlat,
      setup: input.setup,
    });

    const { value: sales, skip: skipSales } = this.employeeService.resolveSales(
      input.sales?.toString(),
      employeeMap,
    );
    if (skipSales) return null;

    const manager = this.employeeService.resolveEmployee(
      input.managerSales?.toString(),
      employeeMap,
    );

    return this.snapshotService.assembleValues(input, category, sales, manager, subscription, type);
  }
}

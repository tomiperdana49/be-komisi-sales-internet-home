import type { GoogleSpreadsheetRow } from "google-spreadsheet";
import type { RawSnapshotInput } from "./snapshot.interface";
import type { ServiceCatalogEntry } from "./service-catalog.interface";

export type OldCustomerInvoiceRow = {
  CID: string;
  CSID: number | null;
  SG: string | null;
  "Tanggal Invoice": unknown;
  "Tanggal Jatuh Tempo": unknown;
  Bulan: number | null;
  DPP: unknown;
  Paid: number;
  "Tanggal Input Pembayaran": unknown;
  "Tanggal Transaksi Pembayaran": unknown;
  "AI Invoice": number;
  "AI Receipt": number | null;
  "Invoice Period Description": string | null;
  "Nama Service": string | null;
  "Line Rental": unknown;
  SID: string | null;
  "Is Prorata": number | null;
  "Business Operation": string | null;
};

export type OldCustomerAccountRow = {
  CID: string;
  CSID: number | null;
  "Nama Customer": string | null;
  Company: string | null;
  Account: string | null;
  "Nama Service Account": string | null;
  /** The account's own service group (Services.ServiceGroup). */
  Category: string | null;
  Vendor: string | null;
  Sales: string | null;
  "Manager Sales": string | null;
  Cabang: string | null;
  WHMCS: number | null;
  /** Reseller name, only for customers brought in by a reseller (ResellerId > 1). */
  Reseller: string | null;
};

export interface IOldCustomerRepository {
  findInvoices(params: string[]): Promise<OldCustomerInvoiceRow[]>;
  findAccounts(): Promise<OldCustomerAccountRow[]>;
  /** Referral fee per account name for the period, from the reseller spreadsheet; empty when it isn't configured. */
  findResellerFees(period: string): Promise<Map<string, number>>;
  findTransferredCustomerIds(initialSalesId: string): Promise<string[]>;
  findSheetRows(period: string): Promise<GoogleSpreadsheetRow[]>;
}

export interface IOldCustomerService {
  fetchSnapshotInputs(period: string): Promise<RawSnapshotInput[]>;
  mapSheetRowToSnapshotInput(
    row: GoogleSpreadsheetRow,
    catalog: Map<string, ServiceCatalogEntry>,
  ): RawSnapshotInput;
  buildRecurringSnapshotValues(
    input: RawSnapshotInput,
    employeeMap: Map<string, string>,
    excludedCategories: string[],
  ): any[] | null;
}

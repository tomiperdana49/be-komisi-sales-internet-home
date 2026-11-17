export type Scalar = string | number | Date | null | undefined;

/** "event": a one-off event / Bandwidth on Demand invoice (KOMISI.md 2.E). */
export type SnapshotType = "new" | "upgrade" | "prorate" | "recurring" | "event";

/** Normalized shape both the sheet-based and DB-based sources map into before snapshot rules are applied. */
export type RawSnapshotInput = {
  category: string | null | undefined;
  paid: Scalar;
  namaService: Scalar;
  dpp: Scalar;
  prorate: Scalar;
  upgrade: Scalar;
  biayaAlat: Scalar;
  setup: Scalar;
  sales: Scalar;
  managerSales: Scalar;
  aiInvoice: Scalar;
  aiReceipt: Scalar;
  cid: Scalar;
  namaCustomer: Scalar;
  company: Scalar;
  csid: Scalar;
  account: Scalar;
  serviceId: Scalar;
  vendor: Scalar;
  lineRental: Scalar;
  paidDate: Scalar;
  /** Payment transaction date (Tanggal Transaksi Pembayaran); paidDate is finance's input date. */
  transactionDate?: Scalar;
  /** New-customer rows: the service's first activation; null if not activated yet. */
  activationDate?: Scalar;
  bulan: Scalar;
  telatBulan: Scalar;
  biayaReferral: Scalar;
  referralName: Scalar;
  businessOperation?: Scalar;
  /** New-customer invoice that is really a renewal (billing counter > 1). */
  isRenewal?: boolean;
};

export interface ISnapshotRepository {
  /**
   * Replaces every snapshots row for `period` whose `type` is in `types`
   * with `rows`, atomically — see snapshot.repository.ts for why.
   */
  replaceForPeriod(period: string, rows: any[][], types: string[]): Promise<void>;
}

export interface ISnapshotService {
  /** Assembles the ordered values for a snapshots INSERT row. */
  assembleValues(
    input: RawSnapshotInput,
    category: string | null | undefined,
    sales: string | null,
    manager: string | null,
    subscription: number | null,
    type: SnapshotType,
  ): any[];
}

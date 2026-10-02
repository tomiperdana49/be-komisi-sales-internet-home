export type Scalar = string | number | Date | null | undefined;

export type SnapshotType = "new" | "upgrade" | "prorate" | "recurring";

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

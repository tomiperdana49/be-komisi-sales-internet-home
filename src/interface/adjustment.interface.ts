/**
 * Admin-editable snapshot fields (KOMISI.md-adjacent, but this is an
 * ETL/data-correction concern, not a commission rule). Deliberately excludes
 * `id`/`period`/`ai_invoice`/`ai_receipt` (the identity keys a re-crawl
 * matches on) and `is_approved` (has its own dedicated approve endpoint).
 */
export type AdjustableSnapshotFields = {
  customerId?: string;
  customerName?: string | null;
  customerCompany?: string | null;
  customerServiceId?: number | null;
  customerServiceAccount?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  category?: string | null;
  sales?: string | null;
  manager?: string | null;
  vendor?: string | null;
  subscription?: number | null;
  lineRental?: number | null;
  paidDate?: string | null;
  /** Payment transaction date (shown as Tgl. Bayar); informational only. */
  transactionDate?: string | null;
  /** The service's first activation (shown as Tgl. Aktif); informational only. */
  activationDate?: string | null;
  month?: number | null;
  lateMonth?: number | null;
  type?: string | null;
  referralFee?: number | null;
  referralType?: string | null;
  referralName?: string | null;
  businessOperation?: string | null;
};

/** camelCase (API/service layer) -> snake_case (snapshots column) for every admin-adjustable field. */
export const ADJUSTABLE_FIELD_COLUMNS: Record<keyof AdjustableSnapshotFields, string> = {
  customerId: "customer_id",
  customerName: "customer_name",
  customerCompany: "customer_company",
  customerServiceId: "customer_service_id",
  customerServiceAccount: "customer_service_account",
  serviceId: "service_id",
  serviceName: "service_name",
  category: "category",
  sales: "sales",
  manager: "manager",
  vendor: "vendor",
  subscription: "subscription",
  lineRental: "line_rental",
  paidDate: "paid_date",
  transactionDate: "transaction_date",
  activationDate: "activation_date",
  month: "month",
  lateMonth: "late_month",
  type: "type",
  referralFee: "referral_fee",
  referralType: "referral_type",
  referralName: "referral_name",
  businessOperation: "business_operation",
};

export type SnapshotAdjustmentRow = {
  id: number;
  ai_invoice: number;
  employee_id: string;
  old_value: string;
  new_value: string;
  note: string;
  created_at: string;
};

/** Full raw invoice row, camelCased — used to prefill the adjustment form with every field, not just the summary list's subset. */
export type SnapshotDetailItem = AdjustableSnapshotFields & {
  aiInvoice: number;
  aiReceipt: number | null;
  period: string;
  isApproved: boolean;
  isAdjusted: boolean;
};

/** One row of an invoice's adjustment history, as the API returns it. */
export type SnapshotAdjustmentItem = {
  id: number;
  aiInvoice: number;
  employeeId: string;
  employeeName: string | null;
  oldValue: Partial<AdjustableSnapshotFields>;
  newValue: Partial<AdjustableSnapshotFields>;
  note: string;
  createdAt: string;
};

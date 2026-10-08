import type { RecurringServiceGroupLabel, SnapshotType } from "../helper/commission.helper";
import type { ManualTarget } from "./target-override.interface";
import type { AdjustableSnapshotFields, SnapshotAdjustmentRow } from "./adjustment.interface";

/** A snapshots row as the commission engine consumes it. */
export type CommissionSnapshotRow = {
  period: string;
  ai_invoice: number;
  ai_receipt: number | null;
  customer_id: string;
  customer_name: string | null;
  customer_company: string | null;
  customer_service_id: number | null;
  customer_service_account: string | null;
  service_id: string | null;
  service_name: string | null;
  category: string | null;
  sales: string | null;
  manager: string | null;
  vendor?: string | null;
  subscription: number | null;
  line_rental: number | null;
  paid_date: Date | string | null;
  month: number | null;
  late_month: number | null;
  type: SnapshotType | null;
  /** A "new" row that is really a renewal's price increase — commissioned as recurring. */
  is_renewal?: number | boolean;
  referral_fee: number | null;
  referral_type: string | null;
  referral_name: string | null;
  business_operation: string | null;
  is_approved: number | boolean;
  is_adjusted?: number | boolean;
};

export interface ISnapshotReadRepository {
  /** Snapshots for one salesperson in a period. Only rows whose `sales` resolves to a real employee. */
  findBySales(employeeId: string, period: string): Promise<CommissionSnapshotRow[]>;
  /** Same, for many salespeople at once. */
  findBySalesIds(employeeIds: string[], period: string): Promise<CommissionSnapshotRow[]>;
  /** Recurring rows credited to a manager via the `manager` column — includes rows with no real salesperson (e.g. Customer Relation Officer). */
  findRecurringByManager(managerId: string, period: string): Promise<CommissionSnapshotRow[]>;
  /** Admin approval for a late-paid invoice, waiving its late-payment penalty (KOMISI.md 1). */
  updateApproval(aiInvoice: number, isApproved: boolean): Promise<void>;
  /** Raw row for one invoice, for building the adjustment form's current values and the audit log's "before" snapshot. */
  findByAiInvoice(aiInvoice: number): Promise<CommissionSnapshotRow | null>;
  /**
   * Applies an admin field correction and flags the row `is_adjusted` so a
   * future re-crawl (replaceForPeriod) never overwrites it.
   */
  updateAdjustableFields(aiInvoice: number, fields: AdjustableSnapshotFields): Promise<void>;
  insertAdjustmentLog(
    aiInvoice: number,
    employeeId: string,
    oldValue: Partial<AdjustableSnapshotFields>,
    newValue: Partial<AdjustableSnapshotFields>,
    note: string,
  ): Promise<void>;
  findAdjustmentsByAiInvoice(aiInvoice: number): Promise<SnapshotAdjustmentRow[]>;
}

export type CommissionStats = {
  count: number;
  commission: number;
  subscription: number;
  mrc: number;
};

export type CommissionBreakdown = Record<SnapshotType | "alat" | "setup", CommissionStats>;

export type CommissionLineItem = {
  aiInvoice: number;
  aiReceipt: number | null;
  customerId: string;
  customerName: string | null;
  customerCompany: string | null;
  customerServiceId: number | null;
  customerServiceAccount: string | null;
  serviceId: string | null;
  serviceName: string | null;
  category: string | null;
  /** Product label from the period's Aturan Komisi (Home/Nusafiber/NusaSelecta), or Digital/Access Business. */
  serviceGroup: RecurringServiceGroupLabel;
  businessOperation: string | null;
  /** Employee ID of the Sales Manager credited for this row (raw snapshots.manager column). */
  manager: string | null;
  type: string;
  /** Renewal price increase billed as "new" but commissioned as recurring. */
  isRenewal: boolean;
  month: number;
  lateMonth: number;
  isApproved: boolean;
  isAdjusted: boolean;
  paidDate: string | null;
  subscription: number;
  mrc: number;
  referralFee: number;
  referralType: string | null;
  baseCommission: number;
  commissionPercentage: number;
  commission: number;
};

export type SalesCommissionResult = {
  period: string;
  startDate: string;
  endDate: string;
  employeeId: string;
  status: string | null;
  activityCount: number;
  /** New Achievement target used this period: the manual one (Target AM page) when set, else the rules' default. */
  target: number;
  /** The admin-set target and its period range, when one covers this period. */
  manualTarget: ManualTarget | null;
  /**
   * NusaSelecta New units sold (before churn), by group. They earn commission per unit
   * but only count toward New Achievement in groups (3 Basic/Prime or 2 Ultra = 1).
   */
  nusaSelectaNewUnits: { basicPrime: number; ultra: number };
  achievementStatus: string;
  motivation: string;
  bonusBulanan: number;
  bonusKelebihanService: number;
  /** Admin-granted Bonus Konsistensi for this period, 0 if never granted (separate from the auto-calculated bonuses above). */
  consistencyBonus: number;
  total: CommissionStats;
  breakdown: CommissionBreakdown;
  /** Same per-type breakdown as `breakdown`, scoped to each service group (Home/Nusafiber/NusaSelecta). */
  byServiceGroup: Record<string, CommissionBreakdown>;
  deduction: {
    count: number;
    commission: number;
    subscription: number;
    mrc: number;
  };
  items: CommissionLineItem[];
};

/** One team member's commission for the period, as shown in the manager dashboard's roster table. */
export type ManagerTeamMember = {
  employeeId: string;
  name: string;
  photoProfile: string;
  status: string | null;
  activityCount: number;
  achievementStatus: string;
  motivation: string;
  newSubscription: number;
  newMrc: number;
  newCommission: number;
  recurringSubscription: number;
  recurringCommission: number;
  otherSubscription: number;
  otherCommission: number;
  bonusBulanan: number;
  bonusKelebihanService: number;
  consistencyBonus: number;
  totalCommission: number;
  /**
   * This member's share of the manager's override, for the per-row display
   * column. Approximate: derived from the member's own totals at the
   * manager's flat rate, not from the authoritative override calculation
   * in `ManagerOverride` (which also covers non-team rows like CRO
   * placeholders) — don't expect these to sum exactly to `override`.
   */
  managerNewCommission: number;
  managerRecurringCommission: number;
  newService: { name: string; count: number; mrc: number; subscription: number }[];
};

/** KOMISI.md 6.A/6.B: team size, base/final target, and achieved status. */
export type ManagerTeamPerformance = {
  totalCount: number;
  permanentCount: number;
  nonPermanentCount: number;
  activityCount: number;
  baseTarget: number;
  thresholdPercentage: number;
  finalTarget: number;
  achievementPercentage: number;
  isTargetAchieved: boolean;
};

/** KOMISI.md 6.C/6.D: the manager's overriding commission on top of the team's production. */
export type ManagerOverride = {
  newCommissionRate: number;
  newCommission: number;
  recurringCommissionRate: number;
  recurringCommission: number;
  /** NET recurring subscription behind the override, incl. CRO placeholder rows outside the team roster. */
  teamRecurringSubscriptionNet: number;
};

export type ManagerCommissionResult = {
  period: string;
  startDate: string;
  endDate: string;
  managerId: string;
  team: ManagerTeamPerformance;
  override: ManagerOverride;
  /** Team's raw production totals (the "pot" before the manager's override cut). */
  teamTotals: {
    /** Overriding New basis: the team's New + Prorate + Alat commission (getManagerNewCommissionBasis). */
    newCommission: number;
    recurringCommission: number;
    newSubscription: number;
    newMrc: number;
    recurringSubscription: number;
    /**
     * Same totals, split out per service group. New* fields only ever
     * populate for Home/Nusafiber/NusaSelecta; Digital Business and Access
     * Business are recurring-only groups (KOMISI.md 3), so their new*
     * fields always stay 0.
     */
    byServiceGroup: Record<ManagerServiceGroup, ManagerServiceGroupTotal>;
    /** The manager's own personal sales (KOMISI.md 6.F), same grouping — kept apart so byServiceGroup's new count matches team activity. */
    personalByServiceGroup: Record<ManagerServiceGroup, ManagerServiceGroupTotal>;
  };
  /** The manager's own personal-sales commission (KOMISI.md 6.F) — same shape as a regular salesperson's, invoice items included. */
  personal: SalesCommissionResult;
  /**
   * Customer Relation Officer recurring rows credited to this manager
   * (KOMISI.md 6.D) — no real salesperson, so these never appear in any
   * team member's own invoice list. Valued at override.recurringCommissionRate.
   */
  croRecurring: CommissionLineItem[];
  /** personal.total.commission + personal.bonusBulanan + personal.bonusKelebihanService + override.newCommission + override.recurringCommission. */
  totalCommission: number;
  members: ManagerTeamMember[];
};

/** One row of the admin "all Account Managers" summary table. */
export type SalesSummaryItem = {
  employeeId: string;
  name: string;
  photoProfile: string;
  status: string | null;
  achievementStatus: string;
  activityCount: number;
  newMrc: number;
  newSubscription: number;
  newCommission: number;
  recurringSubscription: number;
  recurringCommission: number;
  otherSubscription: number;
  otherCommission: number;
  bonusBulanan: number;
  bonusKelebihanService: number;
  consistencyBonus: number;
  totalCommission: number;
};

/** One row of the admin "all Sales Managers" summary table. */
export type ManagerSummaryItem = {
  employeeId: string;
  name: string;
  photoProfile: string;
  totalCount: number;
  achievementPercentage: number;
  activityCount: number;
  isTargetAchieved: boolean;
  newMrc: number;
  newSubscription: number;
  newCommission: number;
  recurringSubscription: number;
  recurringCommission: number;
  managerNewCommission: number;
  managerRecurringCommission: number;
  managerTotalCommission: number;
};

/** One row of the admin "all invoices" table — a line item plus who sold it and their Sales Manager. */
export type InvoiceSummaryItem = CommissionLineItem & {
  sales: { employeeId: string; name: string; photoProfile: string } | null;
  managerEmployee: { employeeId: string; name: string; photoProfile: string } | null;
};

export type ManagerServiceGroup = "Home" | "Nusafiber" | "NusaSelecta" | "Digital Business" | "Access Business";

export type ManagerServiceGroupTotal = {
  newCount: number;
  newSubscription: number;
  newMrc: number;
  newCommission: number;
  recurringSubscription: number;
  recurringCommission: number;
};

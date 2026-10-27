import { describe, expect, test } from "bun:test";
import { CommissionService } from "./commission.service";
import { DEFAULT_COMMISSION_RULES, DEFAULT_SDR_RULES } from "../helper/commission-rules.default";
import type { CommissionRules } from "../interface/commission-rules.interface";
import type { CommissionSnapshotRow } from "../interface/commission.interface";

const row = (overrides: Partial<CommissionSnapshotRow>): CommissionSnapshotRow => ({
  period: "202610",
  ai_invoice: 1,
  ai_receipt: null,
  customer_id: "C1",
  customer_name: null,
  customer_company: null,
  customer_service_id: 1,
  customer_service_account: null,
  service_id: "HOMEPREM300",
  service_name: null,
  category: "FO Prepaid",
  sales: "S1",
  manager: "M1",
  subscription: 1_000_000,
  line_rental: null,
  paid_date: null,
  month: 12,
  late_month: 0,
  type: "new",
  referral_fee: 0,
  referral_type: null,
  referral_name: null,
  business_operation: null,
  is_approved: false,
  is_adjusted: false,
  ...overrides,
} as CommissionSnapshotRow);

function engine(
  rows: CommissionSnapshotRow[],
  status = "Permanent",
  manualTarget: number | null = null,
  jobPosition = "Account Manager",
  churn: { service_id: string; price: number; period: number; is_approved: boolean; registration_date?: string }[] = [],
  homeRules: CommissionRules | ((period: string) => CommissionRules) = DEFAULT_COMMISSION_RULES,
) {
  const rulesFor = typeof homeRules === "function" ? homeRules : () => homeRules;
  const manual = manualTarget === null ? null : { target: manualTarget, startPeriod: "202610", endPeriod: "202612" };
  return new CommissionService(
    { findBySales: async () => rows, findRecurringByManager: async () => [], findLatestApprovalLogs: async () => [], findAdjustments: async () => [] } as any,
    { getByEmployeeId: async () => churn } as any,
    {
      getStatusByPeriod: async () => ({ status, target: 12 }),
      findByEmployeeId: async (id: string) => ({ employee_id: id, job_position: jobPosition }),
    } as any,
    { getAmount: async () => 0 } as any,
    { getForPeriod: async (period: string) => rulesFor(period) },
    { getActive: async () => manual },
    { getForPeriod: async () => DEFAULT_SDR_RULES },
  );
}

describe("manual Account Manager target (Target AM page)", () => {
  const twelveNew = Array.from({ length: 12 }, (_, i) => row({ ai_invoice: i + 1, customer_id: `C${i}` }));

  test("12 New is on target by default but misses a manual target of 13", async () => {
    const plain = await engine(twelveNew).getSalesCommission("S1", "202610");
    expect(plain.achievementStatus).toBe("Capai target");
    expect(plain.target).toBe(12);
    expect(plain.manualTarget).toBeNull();

    const manual = await engine(twelveNew, "Permanent", 13).getSalesCommission("S1", "202610");
    expect(manual.achievementStatus).toBe("Tidak Capai target");
    expect(manual.target).toBe(13);
    expect(manual.manualTarget).toEqual({ target: 13, startPeriod: "202610", endPeriod: "202612" });
  });

  test("an explicit target passed by the caller wins over the manual one", async () => {
    const withManual = await engine(twelveNew, "Permanent", 13).getSalesCommission("S1", "202610", undefined, 12);
    const plain = await engine(twelveNew).getSalesCommission("S1", "202610");
    expect(withManual.total.commission).toBe(plain.total.commission);
  });
});

describe("renewal price increases (is_renewal)", () => {
  test("are commissioned as recurring, not counted as New Achievement", async () => {
    const result = await engine([
      row({ ai_invoice: 1, customer_id: "NEW" }),
      row({ ai_invoice: 2, customer_id: "RENEW", subscription: 1_360_000, is_renewal: 1 }),
    ]).getSalesCommission("S1", "202610");

    expect(result.activityCount).toBe(1);
    expect(result.breakdown.new.count).toBe(1);
    expect(result.breakdown.recurring.count).toBe(1);
    expect(result.breakdown.recurring.subscription).toBe(1_360_000);

    const renewal = result.items.find((i) => i.aiInvoice === 2)!;
    expect(renewal.type).toBe("recurring");
    expect(renewal.isRenewal).toBe(true);
    // Permanent below target -> missed-target recurring rate, and no 70% New penalty on the base.
    expect(renewal.commissionPercentage).toBe(DEFAULT_COMMISSION_RULES.rates.recurringMissedTarget);
    expect(renewal.baseCommission).toBe(1_360_000);
  });

  test("a plain new sale is unaffected", async () => {
    const result = await engine([row({})]).getSalesCommission("S1", "202610");
    const item = result.items[0]!;
    expect(item.type).toBe("new");
    expect(item.isRenewal).toBe(false);
    expect(item.commissionPercentage).toBe(5.21);
  });
});

describe("Sales Development Representative (SDR)", () => {
  // Julia's October 2026 sheet: 35 Prime 100 + 4 Basic 30, all 1-month.
  const juliaOctober = [
    ...Array.from({ length: 35 }, (_, i) =>
      row({ ai_invoice: i + 1, customer_id: `P${i}`, service_id: "NFSP100", subscription: 150_000, month: 1 })),
    ...Array.from({ length: 4 }, (_, i) =>
      row({ ai_invoice: 100 + i, customer_id: `B${i}`, service_id: "NFSP030", subscription: 140_000, month: 1 })),
  ];

  test("uses the SDR rates and counts NusaSelecta 1:1, matching the manual sheet", async () => {
    const result = await engine(juliaOctober, "Permanent", null, "Sales Development Representative").getSalesCommission("S1", "202610");

    expect(result.isSdr).toBe(true);
    expect(result.activityCount).toBe(39);
    expect(result.breakdown.new.count).toBe(39);
    expect(result.target).toBe(25);
    expect(result.items[0]!.commissionPercentage).toBe(16);
    expect(result.total.commission).toBeCloseTo(929_600, 2);
    expect(result.achievementStatus).toBe("Capai target Bonus");
    expect(result.bonusBulanan).toBe(800_000);
    expect(result.bonusKelebihanService).toBe(0);
  });

  test("an Account Manager with the same sales keeps the AM rules", async () => {
    const result = await engine(juliaOctober).getSalesCommission("S1", "202610");

    expect(result.isSdr).toBe(false);
    // 39 Basic/Prime units grouped per 3.
    expect(result.activityCount).toBe(13);
    expect(result.target).toBe(12);
    expect(result.items[0]!.commissionPercentage).toBe(20);
    expect(result.total.commission).toBeCloseTo(1_162_000, 2);
  });

  test("a Permanent SDR below 25 gets the missed-target penalty on New", async () => {
    const result = await engine(juliaOctober.slice(0, 20), "Permanent", null, "Sales Development Representative").getSalesCommission("S1", "202610");

    expect(result.activityCount).toBe(20);
    expect(result.achievementStatus).toBe("Tidak Capai target");
    expect(result.items[0]!.baseCommission).toBeCloseTo(150_000 * 0.3, 2);
  });

  test("the Home rule set never changes an SDR's commission", async () => {
    const homeRules = {
      ...DEFAULT_COMMISSION_RULES,
      products: DEFAULT_COMMISSION_RULES.products.map((p) => ({ ...p, rate1: 99 })),
      targets: { permanent: 50, probation: 50 },
      bonus: { tiers: [{ at: 1, amount: 9_999_999 }], excessPerUnit: 1 },
    };
    const sdr = "Sales Development Representative";
    const plain = await engine(juliaOctober, "Permanent", null, sdr).getSalesCommission("S1", "202610");
    const changedHome = await engine(juliaOctober, "Permanent", null, sdr, [], homeRules).getSalesCommission("S1", "202610");

    expect(changedHome.total.commission).toBe(plain.total.commission);
    expect(changedHome.bonusBulanan).toBe(plain.bonusBulanan);
    expect(changedHome.target).toBe(25);
  });

  test("unapproved churn reduces SDR achievement one for one", async () => {
    const churn = [{ service_id: "NFSP100", price: 150_000, period: 1, is_approved: false }];
    const result = await engine(juliaOctober, "Permanent", null, "Sales Development Representative", churn).getSalesCommission("S1", "202610");

    expect(result.activityCount).toBe(38);
    expect(result.deduction.count).toBe(1);
  });
});

describe("churn valued at the rules of the period it was sold in", () => {
  // October 2026 lowered HOMESTD100 from 28.57% to 27% (SE-023/DIR/MAN-MDN/X/2026).
  const october: CommissionRules = {
    ...DEFAULT_COMMISSION_RULES,
    products: DEFAULT_COMMISSION_RULES.products.map((p) =>
      p.serviceIds.includes("HOMESTD100") ? { ...p, rate1: 27 } : p,
    ),
  };
  const rulesFor = (period: string) => (period >= "202610" ? october : DEFAULT_COMMISSION_RULES);
  const churnOf = (registration_date?: string) => [
    { service_id: "HOMESTD100", price: 297_500, period: 1, is_approved: false, registration_date },
  ];

  test("a churn sold before the rate change is deducted at the old rate", async () => {
    const svc = engine([], "Permanent", null, "Account Manager", churnOf("2026-03-11"), rulesFor);
    const [churn] = await svc.getSalesChurn("S1", "202610");
    expect(churn!.commissionPercentage).toBe(28.57);
    const result = await svc.getSalesCommission("S1", "202610");
    expect(result.breakdown.new.commission).toBeCloseTo(-297_500 * 0.2857, 2);
  });

  test("a churn sold in the current period, or without a date, uses the current rate", async () => {
    for (const reg of ["2026-10-01", undefined]) {
      const [churn] = await engine([], "Permanent", null, "Account Manager", churnOf(reg), rulesFor).getSalesChurn("S1", "202610");
      expect(churn!.commissionPercentage).toBe(27);
    }
  });
});

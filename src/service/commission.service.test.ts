import { describe, expect, test } from "bun:test";
import { CommissionService } from "./commission.service";
import { DEFAULT_COMMISSION_RULES, DEFAULT_SDR_RULES } from "../helper/commission-rules.default";
import { rulesForSdr } from "../helper/commission.helper";
import { commissionRulesSchema, type CommissionRules } from "../interface/commission-rules.interface";
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
      getFirstPeriod: async () => null,
    } as any,
    { getAmount: async () => 0, getGrantedPeriods: async () => new Set<string>() } as any,
    { getForPeriod: async (period: string) => rulesFor(period) },
    { getActive: async () => manual },
    { getForPeriod: async () => DEFAULT_SDR_RULES },
    { countByEmployeeId: async () => 0 },
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

describe("minimum non-NusaSelecta New sales for the target (KOMISI.md 5.A)", () => {
  const withMinimum: CommissionRules = { ...DEFAULT_COMMISSION_RULES, minNonNusaSelecta: 3 };
  /** `nusaSelecta` is in Achievements, as the SE's table counts it: each is 3 Basic units. */
  const sales = (nusaSelecta: number, nonNusaSelecta: number) => [
    ...Array.from({ length: nusaSelecta * 3 }, (_, i) => row({ ai_invoice: 1000 + i, customer_id: `NS${i}`, service_id: "NFSP030" })),
    ...Array.from({ length: nonNusaSelecta }, (_, i) => row({ ai_invoice: 2000 + i, customer_id: `H${i}` })),
  ];
  const churns = (n: number) => Array.from({ length: n }, () => ({ service_id: "HOMEPREM300", price: 1_000_000, period: 12, is_approved: false }));
  const am = (rows: CommissionSnapshotRow[], churn = 0, status = "Permanent", rules = withMinimum) =>
    engine(rows, status, null, "Account Manager", churns(churn), rules);

  test.each([
    [9, 3, 0, 12, "Capai target"],
    [9, 3, 3, 9, "Tidak Capai target"],
    [12, 3, 3, 12, "Capai target"],
    [12, 3, 4, 11, "Tidak Capai target"],
  ])("SE table: %i NusaSelecta + %i non-NusaSelecta - %i churn = %i, %s", async (ns, non, churn, total, status) => {
    const result = await am(sales(ns, non), churn).getSalesCommission("S1", "202611");
    expect(result.activityCount).toBe(total);
    expect(result.achievementStatus).toBe(status);
  });

  test("reaching the target with too few non-NusaSelecta sales counts as missing it, everywhere", async () => {
    const rows = [...sales(15, 2), row({ ai_invoice: 3000, customer_id: "OLD", type: "recurring" })];
    const held = await am(rows).getSalesCommission("S1", "202611");
    const off = await am(rows, 0, "Permanent", DEFAULT_COMMISSION_RULES).getSalesCommission("S1", "202611");

    expect(off.achievementStatus).toBe("Capai target Bonus");
    expect(off.bonusBulanan).toBeGreaterThan(0);
    expect(off.bonusKelebihanService).toBeGreaterThanOrEqual(0);
    expect(off.nonNusaSelectaMin).toBeNull();

    expect(held.activityCount).toBe(17);
    expect(held.achievementStatus).toBe("Tidak Capai target");
    expect(held.bonusBulanan).toBe(0);
    expect(held.bonusKelebihanService).toBe(0);
    expect(held.nonNusaSelectaMin).toEqual({ count: 2, minimum: 3 });
    expect(held.total.commission).toBeLessThan(off.total.commission);
    const recurring = held.items.find((i) => i.aiInvoice === 3000)!;
    expect(recurring.commissionPercentage).toBe(DEFAULT_COMMISSION_RULES.rates.recurringMissedTarget);
  });

  test("below the target nothing else changes", async () => {
    const held = await am(sales(5, 2)).getSalesCommission("S1", "202611");
    const off = await am(sales(5, 2), 0, "Permanent", DEFAULT_COMMISSION_RULES).getSalesCommission("S1", "202611");
    expect(held.achievementStatus).toBe(off.achievementStatus);
    expect(held.total.commission).toBe(off.total.commission);
  });

  test("Probation is not held back", async () => {
    const held = await am(sales(15, 0), 0, "Probation").getSalesCommission("S1", "202611");
    const off = await am(sales(15, 0), 0, "Probation", DEFAULT_COMMISSION_RULES).getSalesCommission("S1", "202611");
    expect(held.achievementStatus).toBe(off.achievementStatus);
    expect(held.bonusBulanan).toBe(off.bonusBulanan);
    expect(held.nonNusaSelectaMin).toBeNull();
  });

  test("a Manager's personal sales are not held back", async () => {
    const service = am(sales(15, 0));
    const held = await service.getSalesCommission("S1", "202611", 12, 12, 0, true);
    expect(held.achievementStatus).toBe("Capai target Bonus");
    expect(held.nonNusaSelectaMin).toBeNull();
  });

  test("rule sets saved before the setting existed read it as no minimum, and SDR rules never have one", () => {
    const { minNonNusaSelecta: _, ...saved } = DEFAULT_COMMISSION_RULES;
    expect(commissionRulesSchema.parse(saved).minNonNusaSelecta).toBe(0);
    expect(rulesForSdr(DEFAULT_SDR_RULES).minNonNusaSelecta).toBe(0);
  });

  describe("Bonus Konsistensi", () => {
    const consistency = { ...DEFAULT_COMMISSION_RULES.consistency, enabled: true, minTestimonials: 0 };
    const rulesBy = (minimum: (period: string) => number) => (period: string): CommissionRules => ({
      ...DEFAULT_COMMISSION_RULES,
      consistency,
      minNonNusaSelecta: minimum(period),
    });
    // 15 Achievement every month of Sep–Nov (45 in the block, the first tier) with only 2 non-NusaSelecta.
    const rows = sales(13, 2);
    const bonusInNov = (minimum: (period: string) => number) =>
      engine(rows, "Probation", null, "Account Manager", [], rulesBy(minimum)).getSalesCommission("S1", "202611");

    test("is paid when no month of the block has a minimum", async () => {
      expect((await bonusInNov(() => 0)).consistencyBonusAuto?.amount).toBe(1_000_000);
    });

    test("fails when the block's last month is short, for Probation too", async () => {
      expect((await bonusInNov((p) => (p === "202611" ? 3 : 0))).consistencyBonusAuto).toBeNull();
    });

    test("fails on an earlier month short by that month's own rules", async () => {
      expect((await bonusInNov((p) => (p === "202610" ? 3 : 0))).consistencyBonusAuto).toBeNull();
    });

    test("the progress card marks the short month and fails the block", async () => {
      const service = engine(rows, "Permanent", null, "Account Manager", [], rulesBy((p) => (p === "202610" ? 3 : 0)));
      const progress = (await service.getConsistencyProgress("S1", "202611"))!;
      expect(progress.status).toBe("failed");
      expect(progress.months.map((m) => m.belowNonNusaSelecta)).toEqual([false, true, false]);
    });
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

describe("license resells earn no recurring commission from August 2026", () => {
  const license = (period: string) =>
    row({
      period,
      type: "recurring",
      category: "Digital Business",
      business_operation: "Resell",
      service_id: "CPANELDS",
      service_name: "Lisensi CPanel Dedicated Server",
      subscription: 1_000_000,
      month: 1,
    });

  test("is dropped from October", async () => {
    const result = await engine([license("202610")]).getSalesCommission("S1", "202610");
    expect(result.items).toHaveLength(0);
    expect(result.breakdown.recurring.commission).toBe(0);
  });

  test("still counts in July", async () => {
    const result = await engine([license("202607")]).getSalesCommission("S1", "202607");
    expect(result.items).toHaveLength(1);
    expect(result.breakdown.recurring.commission).toBe(5_000);
  });
});

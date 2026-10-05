import { describe, expect, test } from "bun:test";
import { DEFAULT_COMMISSION_RULES } from "./commission-rules.default";
import {
  calculateCommission,
  calculateExcessServiceBonus,
  calculateMonthlyBonus,
  getCommissionBasis,
  getCommissionPercentage,
  isDomainService,
  resolveBusinessOperation,
  toCommissionCategory,
  getManagerNewCommissionBasis,
  getManagerNewCommissionRate,
  getTeamTargetThreshold,
  hasCommissionRate,
  resolveTarget,
  type CommissionRateInput,
} from "./commission.helper";
import { commissionRulesSchema, type CommissionRules } from "../interface/commission-rules.interface";

const rules = DEFAULT_COMMISSION_RULES;
const clone = (): CommissionRules => structuredClone(DEFAULT_COMMISSION_RULES);

const newSale = (overrides: Partial<CommissionRateInput> = {}): CommissionRateInput => ({
  category: "home",
  type: "new",
  serviceId: "LITE100",
  months: 12,
  status: "Probation",
  activityCount: 0,
  target: 12,
  hasSetup: false,
  businessOperation: null,
  ...overrides,
});

describe("default rules", () => {
  test("are frozen so the per-rules cache can't go stale", () => {
    expect(() => {
      (DEFAULT_COMMISSION_RULES.rates as { prorate: number }).prorate = 99;
    }).toThrow();
  });

  test("they pass their own validation", () => {
    expect(commissionRulesSchema.safeParse(DEFAULT_COMMISSION_RULES).success).toBe(true);
  });

  test("New rate by contract length, incl. the NusaSelecta 6-month step", () => {
    expect(calculateCommission(rules, 100, 0, false, newSale({ serviceId: "HOMESTD100", months: 1 })).commissionPercentage).toBe(28.57);
    expect(calculateCommission(rules, 100, 0, false, newSale({ serviceId: "HOMESTD100", months: 3 })).commissionPercentage).toBe(5.95);
    expect(calculateCommission(rules, 100, 0, false, newSale({ serviceId: "NFSP100", months: 3 })).commissionPercentage).toBe(20);
    expect(calculateCommission(rules, 100, 0, false, newSale({ serviceId: "NFSP100", months: 6 })).commissionPercentage).toBe(5.56);
  });

  test("bonus tiers shift with a Permanent sales' own target", () => {
    expect(calculateMonthlyBonus(rules, 15, 12, "Permanent")).toBe(500_000);
    expect(calculateMonthlyBonus(rules, 15, 13, "Permanent")).toBe(0);
    expect(calculateMonthlyBonus(rules, 20, 12, "Permanent")).toBe(1_500_000);
    expect(calculateExcessServiceBonus(rules, 22, 12, "Permanent")).toBe(1_800_000);
  });

  test("team threshold falls back to the last entry for large teams", () => {
    expect(getTeamTargetThreshold(rules, 1)).toBe(120);
    expect(getTeamTargetThreshold(rules, 25)).toBe(85);
  });
});

describe("edited rules are what the math uses", () => {
  test("a product's 12-month rate and setup rate", () => {
    const edited = clone();
    const lite = edited.products.find((p) => p.serviceIds.includes("LITE100"))!;
    lite.rate12 = 0;
    lite.setupRate = 0;

    expect(calculateCommission(edited, 1_000_000, 0, false, newSale()).commission).toBe(0);
    expect(calculateCommission(edited, 1_000_000, 0, false, newSale({ category: "setup" })).commissionPercentage).toBe(0);
    // Other products' setup still uses the default rate.
    expect(calculateCommission(edited, 1_000_000, 0, false, newSale({ category: "setup", serviceId: "HOMESTD100" })).commissionPercentage).toBe(5);
  });

  test("a newly added product earns commission", () => {
    expect(hasCommissionRate(rules, "NFSPFREE30")).toBe(false);
    const edited = clone();
    edited.products.push({
      name: "NusaSelecta Free 30 + Iklan",
      serviceIds: ["NFSPFREE30"],
      group: "NusaSelecta Basic/Prime",
      rate1: 20,
      rate6: 5.56,
      rate12: 0,
      sixMonthRateFrom: 6,
      twelveMonthRateFrom: 12,
      setupRate: 0,
    });
    expect(hasCommissionRate(edited, "nfspfree30")).toBe(true);
    expect(calculateCommission(edited, 100, 0, false, newSale({ serviceId: "NFSPFREE30", months: 1 })).commissionPercentage).toBe(20);
  });

  test("penalties and manager tiers", () => {
    const edited = clone();
    edited.penalties.latePerMonth = 20;
    edited.penalties.lateMax = 100;
    edited.manager.newCommissionTiers = [{ minAchievement: 80, rate: 30 }];

    expect(calculateCommission(edited, 1000, 3, false, newSale({ serviceId: "HOMESTD100", months: 1 })).baseCommission).toBeCloseTo(400);
    expect(getManagerNewCommissionRate(edited, 79)).toBe(0);
    expect(getManagerNewCommissionRate(edited, 80)).toBe(30);
  });
});

describe("IP Public and Domain recurring", () => {
  test("IP Public earns the Internal Digital Business rate", () => {
    const rate = getCommissionPercentage(rules, newSale({
      category: toCommissionCategory("IP Public"),
      type: "recurring",
      businessOperation: resolveBusinessOperation("IP Public", null),
    }));
    expect(rate).toBe(rules.rates.digitalBusinessInternal);
  });

  test("Domain is recognised by service name, not category", () => {
    expect(isDomainService("Domain International (.COM)")).toBe(true);
    expect(isDomainService("Co-location Server 2U")).toBe(false);
  });
});

describe("referral deduction", () => {
  test("deducts Cashback, Monthly and untyped referrals, but not OTC", () => {
    expect(getCommissionBasis(5_000_000, 499_900, "Cashback")).toBe(4_500_100);
    expect(getCommissionBasis(5_000_000, 499_900, "Monthly")).toBe(4_500_100);
    expect(getCommissionBasis(5_000_000, 499_900, null)).toBe(4_500_100);
    expect(getCommissionBasis(5_000_000, 499_900, "OTC")).toBe(5_000_000);
  });
});

describe("manager Overriding New basis", () => {
  test("takes New, Prorate and Alat commission, but not Upgrade, Setup or Recurring", () => {
    const stats = (commission: number) => ({ count: 1, commission, subscription: 0, mrc: 0 });
    const breakdown = {
      new: stats(1000),
      prorate: stats(100),
      alat: stats(10),
      upgrade: stats(50000),
      setup: stats(60000),
      recurring: stats(70000),
    };
    expect(getManagerNewCommissionBasis(breakdown)).toBe(1110);
  });
});

describe("contract-length tiers", () => {
  test("the 12-month rate threshold is per product", () => {
    const edited = clone();
    edited.products.find((p) => p.serviceIds.includes("HOMESTD100"))!.twelveMonthRateFrom = 24;
    const rate = (months: number) =>
      calculateCommission(edited, 100, 0, false, newSale({ serviceId: "HOMESTD100", months })).commissionPercentage;
    expect(rate(12)).toBe(5.95);
    expect(rate(24)).toBe(4.76);
  });
});

describe("New Achievement target", () => {
  test("periods before the cutover keep the per-AM target stored back then", () => {
    expect(resolveTarget(rules, "202609", "Permanent", 0)).toBe(0);
    expect(resolveTarget(rules, "202609", "Permanent", null)).toBe(12);
  });

  test("from the cutover on, the target always comes from the rules", () => {
    const edited = clone();
    edited.targets.permanent = 14;
    edited.targets.probation = 2;
    expect(resolveTarget(edited, "202610", "Permanent", 0)).toBe(14);
    expect(resolveTarget(edited, "202611", "Probation", 0)).toBe(2);
    expect(resolveTarget(edited, "202611", "Contract", 99)).toBe(2);
    expect(resolveTarget(edited, "202611", null, undefined)).toBe(14);
  });
});

describe("rule sets saved before newer settings existed", () => {
  test("parse with those settings defaulted", () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_COMMISSION_RULES));
    delete old.excludedRecurringCategories;
    for (const p of old.products) delete p.twelveMonthRateFrom;

    const parsed = commissionRulesSchema.parse(old);
    expect(parsed.excludedRecurringCategories).toEqual(["Domain"]);
    expect(parsed.products.every((p) => p.twelveMonthRateFrom === 12)).toBe(true);
  });
});

describe("validation", () => {
  const issues = (rules: unknown) => {
    const result = commissionRulesSchema.safeParse(rules);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  test("rejects a ServiceId used by two products", () => {
    const edited = clone();
    edited.products[1]!.serviceIds.push("BFLITE");
    expect(issues(edited).some((m) => m.includes("BFLITE"))).toBe(true);
  });

  test("rejects a 6-month threshold that isn't below the 12-month one", () => {
    const edited = clone();
    edited.products[0]!.sixMonthRateFrom = 12;
    expect(issues(edited).some((m) => m.includes("rate 6 bulan"))).toBe(true);
  });

  test("rejects out-of-range percentages and unordered tiers", () => {
    const edited = clone();
    edited.rates.prorate = 120;
    edited.bonus.tiers = [{ at: 17, amount: 1 }, { at: 15, amount: 2 }];
    expect(issues(edited).length).toBeGreaterThanOrEqual(2);
  });
});

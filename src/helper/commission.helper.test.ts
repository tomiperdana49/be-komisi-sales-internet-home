import { describe, expect, test } from "bun:test";
import { DEFAULT_COMMISSION_RULES } from "./commission-rules.default";
import {
  netCommissionBasis,
  calculateNusaSelectaActivity,
  isNusaSelectaPromo,
  calculateCommission,
  calculateExcessServiceBonus,
  calculateMonthlyBonus,
  getCommissionBasis,
  getCommissionPercentage,
  isDomainService,
  isLicenseService,
  resolveBusinessOperation,
  toCommissionCategory,
  getManagerNewCommissionBasis,
  getManagerNewCommissionRate,
  getManagerRecurringRate,
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
    // Past the last tier: Bonus Bulanan stays at the top amount, and Bonus
    // Kelebihan Service adds only the excess units on top of it.
    expect(calculateMonthlyBonus(rules, 22, 12, "Permanent")).toBe(1_500_000);
    expect(calculateExcessServiceBonus(rules, 22, 12, "Permanent")).toBe(300_000);
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
      churn: false,
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

  test("License resells are recognised by service name, from October 2026", () => {
    expect(isLicenseService("Lisensi CPanel Dedicated Server", "202610")).toBe(true);
    expect(isLicenseService("License windows server 16 core", "202612")).toBe(true);
    expect(isLicenseService("Lisensi CloudLinux OS", "202609")).toBe(false);
    expect(isLicenseService("Google Workspace Business Starter", "202610")).toBe(false);
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

  test("count as churn only the products the old hardcoded churn list had", () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_COMMISSION_RULES));
    for (const p of old.products) delete p.churn;

    const churnIds = commissionRulesSchema.parse(old).products.filter((p) => p.churn).flatMap((p) => p.serviceIds);
    expect(churnIds.sort()).toEqual(["BFLITE", "HOME100", "HOME300", "HOMEADV", "HOMEADV200", "HOMEPREM300", "HOMESTD100"]);
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

describe("netCommissionBasis", () => {
  const rules = structuredClone(DEFAULT_COMMISSION_RULES);

  test("from October 2026: late cut on the full subscription, then the referral", () => {
    expect(netCommissionBasis(rules, "202610", 3_000_000, 300_000, null, 1, false)).toEqual({
      net: 2_400_000, referralCut: 300_000, lateCut: 300_000, lateBasis: 3_000_000,
    });
  });

  test("before October 2026: referral first, then the late cut on what's left", () => {
    expect(netCommissionBasis(rules, "202609", 3_000_000, 300_000, null, 1, false)).toEqual({
      net: 2_430_000, referralCut: 300_000, lateCut: 270_000, lateBasis: 2_700_000,
    });
  });

  test("approved invoices and OTC referrals cut nothing for that part", () => {
    expect(netCommissionBasis(rules, "202610", 3_000_000, 300_000, null, 1, true).net).toBe(2_700_000);
    expect(netCommissionBasis(rules, "202610", 3_000_000, 300_000, "OTC", 1, false).net).toBe(2_700_000);
  });
});

describe("NusaSelecta Prime 100 promo (SE Sept 2026)", () => {
  test("only Prime 100 at Rp50.000 is promo", () => {
    expect(isNusaSelectaPromo("NFSP100", "50000.00")).toBe(true);
    expect(isNusaSelectaPromo("NFSP100", 150000)).toBe(false);
    expect(isNusaSelectaPromo("NFSP030", 50000)).toBe(false);
  });

  test("every row of the SE table is 1 New Achievement", () => {
    // [Basic 30 normal, Prime 100 promo, Ultra 200 normal]
    for (const [basic, promo, ultra] of [[0, 9, 0], [1, 6, 0], [2, 3, 0], [0, 6, 1], [1, 3, 1]]) {
      expect(calculateNusaSelectaActivity(basic!, ultra!, promo)).toBe(1);
    }
  });

  test("fewer than 9 promo alone add nothing to the target", () => {
    expect(calculateNusaSelectaActivity(0, 0, 8)).toBe(0);
    expect(calculateNusaSelectaActivity(0, 0, 18)).toBe(2);
  });
});

describe("manager overriding recurring rate by customer type (from October 2026)", () => {
  const rules = DEFAULT_COMMISSION_RULES;

  test("access, Digital Business Internal & IP Public, and Resell each take their own rate", () => {
    expect(getManagerRecurringRate(rules, true, "FO Prepaid", null)).toBe(0.9);
    expect(getManagerRecurringRate(rules, false, "FO Prepaid", null)).toBe(0.5);
    expect(getManagerRecurringRate(rules, true, "IP Public", null)).toBe(1);
    expect(getManagerRecurringRate(rules, true, "Digital Business", "Internal")).toBe(1);
    expect(getManagerRecurringRate(rules, false, "Digital Business", "Internal")).toBe(0.5);
    expect(getManagerRecurringRate(rules, true, "Digital Business", "Resell")).toBe(0.5);
    expect(getManagerRecurringRate(rules, false, "Digital Business", "Resell")).toBe(0.25);
  });

  test("Freddy's October recurring: 0.9% on access + 1% on IP Public = Rp535.698", () => {
    const total = 57_299_800 * getManagerRecurringRate(rules, true, "FO Prepaid") / 100
      + 2_000_000 * getManagerRecurringRate(rules, true, "IP Public") / 100;
    expect(Math.round(total)).toBe(535_698);
  });

  test("rule sets saved before these rates existed get the defaults", () => {
    const { recurringDigitalBusinessInternalOnTarget, recurringDigitalBusinessInternalMissedTarget, recurringDigitalBusinessResellOnTarget, recurringDigitalBusinessResellMissedTarget, ...oldManager } = rules.manager;
    const parsed = commissionRulesSchema.parse({ ...rules, manager: oldManager });
    expect(parsed.manager.recurringDigitalBusinessInternalOnTarget).toBe(1);
    expect(parsed.manager.recurringDigitalBusinessResellMissedTarget).toBe(0.25);
  });
});

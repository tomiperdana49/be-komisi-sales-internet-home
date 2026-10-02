import type { CommissionRules } from "../interface/commission-rules.interface";

/** Rules are cached by identity (commission.helper.ts), so any rules object in use must never change. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * The rules in force for any period that has no published rule set — i.e.
 * every period before an admin first changes anything. These are exactly the
 * values that used to be hardcoded in commission.helper.ts, so existing
 * periods keep computing the same numbers. Never edit these to change
 * commission: publish a new rule set from the admin "Aturan Komisi" page.
 */
export const DEFAULT_COMMISSION_RULES: CommissionRules = deepFreeze({
  excludedRecurringCategories: ["IP Public", "Domain"],
  products: [
    { name: "nusafiber 50 Mbps", serviceIds: ["BFLITE"], group: "Nusafiber", rate1: 28.38, rate6: 6.55, rate12: 5.09, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null },
    { name: "NusaSelecta Basic 30", serviceIds: ["NFSP030"], group: "NusaSelecta Basic/Prime", rate1: 20.0, rate6: 5.56, rate12: 4.44, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null },
    { name: "NusaSelecta Prime 100", serviceIds: ["NFSP100"], group: "NusaSelecta Basic/Prime", rate1: 20.0, rate6: 5.56, rate12: 4.44, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null },
    { name: "NusaSelecta Ultra 200", serviceIds: ["NFSP200"], group: "NusaSelecta Ultra", rate1: 26.0, rate6: 6.0, rate12: 4.67, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null },
    { name: "Broadband FO Home Standard 100 Mbps", serviceIds: ["HOME100", "HOMESTD100"], group: "Home", rate1: 28.57, rate6: 5.95, rate12: 4.76, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null },
    { name: "Broadband FO Home Advanced 200 Mbps", serviceIds: ["HOMEADV200", "HOMEADV"], group: "Home", rate1: 27.78, rate6: 5.56, rate12: 4.63, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null },
    { name: "Broadband FO Home Premium 300 Mbps", serviceIds: ["HOMEPREM300", "HOME300"], group: "Home", rate1: 31.25, rate6: 6.25, rate12: 5.21, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null },
    { name: "Broadband FO Home Lite 100 Mbps", serviceIds: ["LITE100"], group: "Home", rate1: 27.0, rate6: 5.56, rate12: 4.63, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null },
    { name: "Broadband FO Home Lite 200 Mbps", serviceIds: ["LITE200"], group: "Home", rate1: 28.0, rate6: 5.95, rate12: 4.76, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null },
  ],
  rates: {
    prorate: 10,
    setup: 5,
    alatWithSetup: 2,
    alatStandalone: 1,
    recurringOnTarget: 1.5,
    recurringMissedTarget: 0.5,
    digitalBusinessInternal: 1,
    digitalBusinessResell: 0.5,
  },
  penalties: {
    latePerMonth: 10,
    lateMax: 50,
    missedTarget: 70,
  },
  targets: {
    permanent: 12,
    probation: 0,
  },
  achievement: {
    permanentBonus: 15,
    permanentOnTarget: 12,
    permanentSp1Below: 3,
    probationExcellent: 8,
    probationVeryGood: 5,
    probationAverage: 3,
  },
  bonus: {
    tiers: [
      { at: 15, amount: 500_000 },
      { at: 17, amount: 1_000_000 },
      { at: 20, amount: 1_500_000 },
    ],
    excessPerUnit: 150_000,
  },
  manager: {
    teamThresholds: [
      { teamSize: 1, percent: 120 },
      { teamSize: 2, percent: 115 },
      { teamSize: 3, percent: 110 },
      { teamSize: 4, percent: 105 },
      { teamSize: 5, percent: 100 },
      { teamSize: 6, percent: 95 },
      { teamSize: 7, percent: 92 },
      { teamSize: 8, percent: 90 },
      { teamSize: 9, percent: 88 },
      { teamSize: 10, percent: 85 },
    ],
    newCommissionTiers: [
      { minAchievement: 150, rate: 60 },
      { minAchievement: 125, rate: 50 },
      { minAchievement: 100, rate: 40 },
      { minAchievement: 50, rate: 25 },
    ],
    recurringOnTarget: 0.9,
    recurringMissedTarget: 0.5,
  },
});

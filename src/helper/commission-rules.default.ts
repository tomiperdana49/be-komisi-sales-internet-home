import type { CommissionRules, SdrCommissionRules } from "../interface/commission-rules.interface";
import { DEFAULT_CHURN_CLOSE_REASONS } from "./churn-close-reason.helper";

/** Rules are cached by identity (commission.helper.ts), so any rules object in use must never change. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Sales Development Representative (SDR) rules, from the SDR commission
 * sheet (rows marked "sesuai SE terbaru" win where a product is listed
 * twice). Used for any period with no published SDR rule set; change SDR
 * commission by publishing from "Aturan Komisi SDR", never here.
 */
export const DEFAULT_SDR_RULES: SdrCommissionRules = deepFreeze({
  products: [
    { name: "nusafiber 50 Mbps", serviceIds: ["BFLITE"], group: "Nusafiber", rate1: 22.71, rate6: 5.24, rate12: 4.08, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: true },
    { name: "NusaSelecta Basic 30", serviceIds: ["NFSP030"], group: "NusaSelecta Basic/Prime", rate1: 16.0, rate6: 4.4, rate12: 3.6, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "NusaSelecta Prime 100", serviceIds: ["NFSP100"], group: "NusaSelecta Basic/Prime", rate1: 16.0, rate6: 4.4, rate12: 3.6, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "NusaSelecta Ultra 200", serviceIds: ["NFSP200"], group: "NusaSelecta Ultra", rate1: 20.8, rate6: 4.8, rate12: 3.68, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "NusaSelecta Free 1 Mbps + Iklan", serviceIds: ["NFSF001"], group: "NusaSelecta Basic/Prime", rate1: 16.0, rate6: 4.44, rate12: 4.44, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "NusaSelecta Free 30 + Iklan", serviceIds: ["NFSF030"], group: "NusaSelecta Basic/Prime", rate1: 16.0, rate6: 4.44, rate12: 4.44, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Standard Prepaid 100 Mbps", serviceIds: ["HOME100", "HOMESTD100"], group: "Home", rate1: 22.86, rate6: 4.76, rate12: 3.81, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: true },
    { name: "Broadband FO Home Advanced Prepaid 200 Mbps", serviceIds: ["HOMEADV200", "HOMEADV"], group: "Home", rate1: 22.22, rate6: 4.44, rate12: 3.7, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: true },
    { name: "Broadband FO Home Premium Prepaid 300 Mbps", serviceIds: ["HOMEPREM300", "HOME300"], group: "Home", rate1: 25.0, rate6: 5.0, rate12: 4.17, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: true },
    { name: "Broadband FO Home Lite 50 Mbps", serviceIds: ["LITE50"], group: "Home", rate1: 17.5, rate6: 3.5, rate12: 2.8, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Lite 75 Mbps", serviceIds: ["LITE75"], group: "Home", rate1: 17.5, rate6: 3.5, rate12: 2.8, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Lite 100 Mbps", serviceIds: ["LITE100"], group: "Home", rate1: 18.9, rate6: 3.85, rate12: 3.15, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Lite 200 Mbps", serviceIds: ["LITE200"], group: "Home", rate1: 19.6, rate6: 3.85, rate12: 3.15, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Lite 300 Mbps", serviceIds: ["LITE300"], group: "Home", rate1: 19.6, rate6: 3.85, rate12: 3.15, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Premium 100 Mbps", serviceIds: ["PREMIUM100"], group: "Home", rate1: 18.9, rate6: 3.85, rate12: 3.15, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Premium 200 Mbps", serviceIds: ["PREMIUM200"], group: "Home", rate1: 18.9, rate6: 3.85, rate12: 3.15, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Premium 300 Mbps", serviceIds: ["PREMIUM300"], group: "Home", rate1: 21.0, rate6: 4.2, rate12: 3.5, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Premium 400 Mbps", serviceIds: ["PREMIUM400"], group: "Home", rate1: 21.0, rate6: 4.2, rate12: 3.5, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Premium 500 Mbps", serviceIds: ["PREMIUM500"], group: "Home", rate1: 21.0, rate6: 4.2, rate12: 3.5, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
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
    permanent: 25,
    probation: 15,
  },
  achievement: {
    permanentBonus: 30,
    permanentOnTarget: 25,
    permanentSp1Below: 6,
    probationExcellent: 15,
    probationVeryGood: 10,
    probationAverage: 6,
  },
  bonus: {
    tiers: [
      { at: 30, amount: 400_000 },
      { at: 35, amount: 800_000 },
      { at: 40, amount: 1_200_000 },
    ],
    excessPerUnit: 0,
  },
});

/**
 * The rules in force for any period that has no published rule set — i.e.
 * every period before an admin first changes anything. These are exactly the
 * values that used to be hardcoded in commission.helper.ts, so existing
 * periods keep computing the same numbers. Never edit these to change
 * commission: publish a new rule set from the admin "Aturan Komisi" page.
 */
export const DEFAULT_COMMISSION_RULES: CommissionRules = deepFreeze({
  excludedRecurringCategories: ["Domain"],
  churnCloseReasons: structuredClone(DEFAULT_CHURN_CLOSE_REASONS),
  products: [
    { name: "nusafiber 50 Mbps", serviceIds: ["BFLITE"], group: "Nusafiber", rate1: 28.38, rate6: 6.55, rate12: 5.09, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: true },
    { name: "NusaSelecta Basic 30", serviceIds: ["NFSP030"], group: "NusaSelecta Basic/Prime", rate1: 20.0, rate6: 5.56, rate12: 4.44, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "NusaSelecta Prime 100", serviceIds: ["NFSP100"], group: "NusaSelecta Basic/Prime", rate1: 20.0, rate6: 5.56, rate12: 4.44, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "NusaSelecta Ultra 200", serviceIds: ["NFSP200"], group: "NusaSelecta Ultra", rate1: 26.0, rate6: 6.0, rate12: 4.67, sixMonthRateFrom: 6, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Standard 100 Mbps", serviceIds: ["HOME100", "HOMESTD100"], group: "Home", rate1: 28.57, rate6: 5.95, rate12: 4.76, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: true },
    { name: "Broadband FO Home Advanced 200 Mbps", serviceIds: ["HOMEADV200", "HOMEADV"], group: "Home", rate1: 27.78, rate6: 5.56, rate12: 4.63, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: true },
    { name: "Broadband FO Home Premium 300 Mbps", serviceIds: ["HOMEPREM300", "HOME300"], group: "Home", rate1: 31.25, rate6: 6.25, rate12: 5.21, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: true },
    { name: "Broadband FO Home Lite 100 Mbps", serviceIds: ["LITE100"], group: "Home", rate1: 27.0, rate6: 5.56, rate12: 4.63, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
    { name: "Broadband FO Home Lite 200 Mbps", serviceIds: ["LITE200"], group: "Home", rate1: 28.0, rate6: 5.95, rate12: 4.76, sixMonthRateFrom: 2, twelveMonthRateFrom: 12, setupRate: null, churn: false },
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
    recurringDigitalBusinessInternalOnTarget: 1,
    recurringDigitalBusinessInternalMissedTarget: 0.5,
    recurringDigitalBusinessResellOnTarget: 0.5,
    recurringDigitalBusinessResellMissedTarget: 0.25,
  },
});

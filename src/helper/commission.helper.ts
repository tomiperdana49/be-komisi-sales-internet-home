/**
 * Pure commission math. Every rule here is documented in KOMISI.md —
 * keep the two in sync when either changes. The numbers themselves (rates,
 * tiers, thresholds) come from the period's CommissionRules, which admins
 * edit from the "Aturan Komisi" page; DEFAULT_COMMISSION_RULES holds the
 * values used before any rule set is published.
 */

import type { CommissionProductRule, CommissionRules } from "../interface/commission-rules.interface";
import type { CommissionBreakdown } from "../interface/commission.interface";

/** Commission behaves differently per group; derived from the snapshot's `category` label. */
export type CommissionCategory = "home" | "alat" | "setup" | "digital-business";

export type SnapshotType = "new" | "upgrade" | "prorate" | "recurring";

/** Grouping used for the per-service breakdown in dashboards. */
export type ServiceGroupLabel = "Home" | "Nusafiber" | "NusaSelecta";

/**
 * Recurring-only grouping (KOMISI.md 3): same three product-family groups,
 * plus Digital Business (own category) and Access Business (catch-all for
 * everything else — FO, Wireless, IP Public, Starlink, CPE Rental, Cicilan,
 * ...). Deliberately recurring-scoped only — New/Upgrade/Prorate keep using
 * the plain 3-way ServiceGroupLabel above, unaffected.
 */
export type RecurringServiceGroupLabel = ServiceGroupLabel | "Digital Business" | "Access Business";

/**
 * ServiceId (upper-cased) -> product, built once per rules object. Rules
 * objects are treated as immutable (see deepFreeze in commission-rules.default.ts):
 * build a new one to change anything, never mutate one that's been used.
 */
const productIndexCache = new WeakMap<CommissionRules, Map<string, CommissionProductRule>>();

function findProduct(rules: CommissionRules, serviceId: string | null | undefined): CommissionProductRule | undefined {
  let index = productIndexCache.get(rules);
  if (!index) {
    index = new Map();
    for (const product of rules.products) {
      for (const id of product.serviceIds) index.set(id.toUpperCase(), product);
    }
    productIndexCache.set(rules, index);
  }
  return index.get(serviceId?.toUpperCase() ?? "");
}

export function toNumber(value: unknown): number {
  return Number(value || 0);
}

/** Maps the snapshot's category label onto the commission rule group. */
export function toCommissionCategory(category: string | null | undefined): CommissionCategory {
  switch (category?.trim()) {
    case "Alat":
      return "alat";
    case "Setup":
      return "setup";
    case "Digital Business":
    case "IP Public":
      return "digital-business";
    default:
      return "home";
  }
}

/**
 * IP Public has no business_operation in billing; it's commissioned like
 * Internal Digital Business (the "Data Center" group in the old reports).
 */
export function resolveBusinessOperation(
  category: string | null | undefined,
  businessOperation: string | null | undefined,
): string | null {
  return category?.trim() === "IP Public" ? "Internal" : (businessOperation ?? null);
}

/** Domain services never earn recurring commission, whatever category billing files them under. */
export function isDomainService(serviceName: string | null | undefined): boolean {
  return /^domain\b/i.test(serviceName?.trim() ?? "");
}

export function getServiceGroupLabel(rules: CommissionRules, serviceId: string | null | undefined): ServiceGroupLabel {
  const group = findProduct(rules, serviceId)?.group;
  if (group === "Nusafiber") return "Nusafiber";
  if (group === "NusaSelecta Basic/Prime" || group === "NusaSelecta Ultra") return "NusaSelecta";
  return "Home";
}

/**
 * Same product-family grouping as getServiceGroupLabel, but carves
 * Digital Business out by category and "Home" down to just the services
 * with a configured commission rate — everything else (no configured rate,
 * i.e. FO/Wireless/IP Public/etc.) becomes "Access Business" instead of
 * silently landing in "Home". Only meant for recurring rows.
 */
export function getRecurringServiceGroupLabel(
  rules: CommissionRules,
  category: string | null | undefined,
  serviceId: string | null | undefined,
): RecurringServiceGroupLabel {
  if (toCommissionCategory(category) === "digital-business") return "Digital Business";
  if (!hasCommissionRate(rules, serviceId)) return "Access Business";
  return getServiceGroupLabel(rules, serviceId);
}

export function isNusaBasicPrime(rules: CommissionRules, serviceId: string | null | undefined): boolean {
  return findProduct(rules, serviceId)?.group === "NusaSelecta Basic/Prime";
}

export function isNusaUltra(rules: CommissionRules, serviceId: string | null | undefined): boolean {
  return findProduct(rules, serviceId)?.group === "NusaSelecta Ultra";
}

export function isNusaSelecta(rules: CommissionRules, serviceId: string | null | undefined): boolean {
  return isNusaBasicPrime(rules, serviceId) || isNusaUltra(rules, serviceId);
}

/**
 * NusaSelecta units are grouped before counting toward the monthly target:
 * every 3 Basic/Prime = 1, every 2 Ultra = 1, plus a leftover 2 Basic/Prime
 * + 1 Ultra combination = 1. Units that don't complete a group still earn
 * commission but add nothing to the target.
 */
export function calculateNusaSelectaActivity(basicPrime: number, ultra: number): number {
  const bp = Math.max(0, basicPrime);
  const ul = Math.max(0, ultra);

  let achievement = Math.floor(bp / 3) + Math.floor(ul / 2);
  if (bp % 3 === 2 && ul % 2 === 1) achievement += 1;

  return achievement;
}

/**
 * First period whose New Achievement targets come only from the rules
 * (targets.permanent / targets.probation by status). Earlier periods keep the
 * per-AM target stored in status_period, which admins used to edit on the
 * retired "Target" page — so already-reported commission never changes.
 */
export const RULE_TARGETS_SINCE = "202610";

export function resolveTarget(
  rules: CommissionRules,
  period: string,
  status: string | null | undefined,
  storedTarget: number | null | undefined,
): number {
  if (period < RULE_TARGETS_SINCE) return storedTarget ?? rules.targets.permanent;
  // Same split the employee crawl used for new status_period rows: only Permanent staff carry a target.
  return status && status !== "Permanent" ? rules.targets.probation : rules.targets.permanent;
}

/** Late-payment deduction per month late, capped. Waived entirely for approved invoices. */
export function applyLateMonthPenalty(
  rules: CommissionRules,
  amount: number,
  lateMonth: number | null | undefined,
  isApproved: unknown = false,
): number {
  const approved = isApproved === true || isApproved === 1 || isApproved === "1";
  if (approved || !lateMonth || lateMonth <= 0) return amount;

  const { latePerMonth, lateMax } = rules.penalties;
  const deduction = Math.min(Number(lateMonth) * (latePerMonth / 100), lateMax / 100);
  return amount * (1 - deduction);
}

/**
 * Commission basis: the referral fee comes off the subscription before
 * commission is calculated, unless the referral is OTC.
 */
export function getCommissionBasis(
  subscription: number,
  referralFee: number,
  referralType: string | null | undefined,
): number {
  // Cashback, Monthly and referrals with no type recorded are all deducted.
  return referralType === "OTC" ? subscription : subscription - referralFee;
}

/** True when a service has a configured New/Upgrade rate. */
export function hasCommissionRate(rules: CommissionRules, serviceId: string | null | undefined): boolean {
  return Boolean(findProduct(rules, serviceId));
}

function getNewUpgradeRate(rules: CommissionRules, serviceId: string | null | undefined, months: number): number {
  const product = findProduct(rules, serviceId);
  if (!product) return 0; // service without a configured rate earns nothing on new/upgrade

  if (months >= product.twelveMonthRateFrom) return product.rate12;
  return months >= product.sixMonthRateFrom ? product.rate6 : product.rate1;
}

export type CommissionRateInput = {
  category: CommissionCategory;
  type: SnapshotType;
  serviceId: string | null | undefined;
  months: number;
  /** Employment status for the period: 'Permanent' | 'Probation' | 'Contract'. */
  status: string | null | undefined;
  /** Net New Achievement for the period, used for the target-dependent rates. */
  activityCount: number;
  /** This employee's New Achievement target for the period (rules default, admin-configurable per employee). */
  target: number;
  /** True when the same customer also has a Setup invoice this period. */
  hasSetup: boolean;
  /** 'Internal' | 'Resell', only meaningful for Digital Business. */
  businessOperation: string | null | undefined;
};

/** Returns the commission percentage (e.g. 1.5 means 1.5%). */
export function getCommissionPercentage(rules: CommissionRules, input: CommissionRateInput): number {
  const { category, type, serviceId, months, status, activityCount, target } = input;
  const rates = rules.rates;

  if (category === "setup") return findProduct(rules, serviceId)?.setupRate ?? rates.setup;
  if (category === "alat") return input.hasSetup ? rates.alatWithSetup : rates.alatStandalone;

  if (category === "digital-business") {
    // Rate depends only on how the service is operated — never on target.
    if (type !== "recurring") return getNewUpgradeRate(rules, serviceId, months);
    if (input.businessOperation === "Internal") return rates.digitalBusinessInternal;
    if (input.businessOperation === "Resell") return rates.digitalBusinessResell;
    return 0;
  }

  // category === 'home' — every non-Alat/Setup/Digital-Business service.
  switch (type) {
    case "prorate":
      return rates.prorate;
    case "recurring":
      return status === "Permanent" && activityCount < target ? rates.recurringMissedTarget : rates.recurringOnTarget;
    case "new":
    case "upgrade":
      return getNewUpgradeRate(rules, serviceId, months);
    default:
      return 0;
  }
}

/**
 * The missed-target performance penalty only bites Permanent staff who
 * missed target, and only on New installations.
 */
export function getPerformancePenalty(
  rules: CommissionRules,
  category: CommissionCategory,
  type: SnapshotType,
  status: string | null | undefined,
  activityCount: number,
  target: number,
): number {
  const applies =
    category === "home" &&
    type === "new" &&
    status === "Permanent" &&
    activityCount < target;

  return applies ? rules.penalties.missedTarget / 100 : 0;
}

export type CommissionResult = {
  baseCommission: number;
  commissionPercentage: number;
  commission: number;
};

export function calculateCommission(
  rules: CommissionRules,
  basis: number,
  lateMonth: number | null | undefined,
  isApproved: unknown,
  input: CommissionRateInput,
): CommissionResult {
  const afterLate = applyLateMonthPenalty(rules, basis, lateMonth, isApproved);
  const penalty = getPerformancePenalty(
    rules,
    input.category,
    input.type,
    input.status,
    input.activityCount,
    input.target,
  );

  const baseCommission = Math.max(0, afterLate * (1 - penalty));
  const commissionPercentage = getCommissionPercentage(rules, input);

  return {
    baseCommission,
    commissionPercentage,
    commission: baseCommission * (commissionPercentage / 100),
  };
}

export type AchievementResult = { achievementStatus: string; motivation: string };

export function calculateAchievement(
  rules: CommissionRules,
  status: string | null | undefined,
  activityCount: number,
): AchievementResult {
  const a = rules.achievement;

  if (status === "Permanent") {
    if (activityCount >= a.permanentBonus) {
      return {
        achievementStatus: "Capai target Bonus",
        motivation: "Congratulations on your outstanding achievement!",
      };
    }
    if (activityCount >= a.permanentOnTarget) {
      return { achievementStatus: "Capai target", motivation: "Bravo! Keep up the great work!" };
    }
    if (activityCount < a.permanentSp1Below) {
      return { achievementStatus: "SP1", motivation: "Keep fighting and don't give up!" };
    }
    return {
      achievementStatus: "Tidak Capai target",
      motivation: "Just a little more fights, go on!",
    };
  }

  if (status === "Probation" || status === "Contract") {
    if (activityCount >= a.probationExcellent) {
      return {
        achievementStatus: "Excellent",
        motivation: "Congratulations on your outstanding achievement!",
      };
    }
    if (activityCount >= a.probationVeryGood) {
      return { achievementStatus: "Very Good", motivation: "Bravo! Keep up the great work!" };
    }
    if (activityCount >= a.probationAverage) {
      return {
        achievementStatus: "Average",
        motivation: "You're much better than what you think!",
      };
    }
    return { achievementStatus: "Below Average", motivation: "Keep pushing!" };
  }

  return { achievementStatus: "N/A", motivation: "N/A" };
}

/**
 * Shared tier math for Bonus Bulanan / Bonus Kelebihan Service. For
 * Permanent staff, tiers are relative to the employee's own target: each
 * tier shifts by the same amount the target differs from the rules'
 * default Permanent target, e.g. with default 12, target 13 moves the
 * first tier from 15 to 16, target 11 moves it to 14.
 *
 * Non-Permanent staff (Probation/Contract) always use the unshifted
 * tiers, regardless of whatever target is configured for them — target on
 * those statuses only ever exists to gate the recurring rate / performance
 * penalty (Permanent-only rules, see KOMISI.md 2.A & 1.2), not to shift
 * the bonus tier.
 */
function getBonusTiers(rules: CommissionRules, target: number, status: string | null | undefined) {
  const defaultTarget = rules.targets.permanent;
  const shift = (status === "Permanent" ? target : defaultTarget) - defaultTarget;
  return rules.bonus.tiers.map((t) => ({ at: t.at + shift, amount: t.amount }));
}

/**
 * Bonus Bulanan — flat monthly cash bonus for reaching a New Achievement
 * tier, paid on top of commission. Reaching or exceeding the last tier
 * pays that tier's amount (Bonus Kelebihan Service comes on top, below).
 */
export function calculateMonthlyBonus(
  rules: CommissionRules,
  activityCount: number,
  target: number,
  status: string | null | undefined,
): number {
  const tiers = getBonusTiers(rules, target, status);
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (activityCount >= tiers[i]!.at) return tiers[i]!.amount;
  }
  return 0;
}

/**
 * Bonus Kelebihan Service — paid on top of Bonus Bulanan once New
 * Achievement exceeds the last tier: a fixed amount for every unit above it.
 */
export function calculateExcessServiceBonus(
  rules: CommissionRules,
  activityCount: number,
  target: number,
  status: string | null | undefined,
): number {
  const tiers = getBonusTiers(rules, target, status);
  const last = tiers[tiers.length - 1]!;
  if (activityCount <= last.at) return 0;
  return (activityCount - last.at) * rules.bonus.excessPerUnit;
}

/**
 * Threshold percentage a manager's team must reach, keyed by TOTAL team
 * size. Sizes past (or between, or before) the configured entries fall back
 * to the nearest smaller entry, else the last one.
 */
export function getTeamTargetThreshold(rules: CommissionRules, totalTeamSize: number): number {
  const thresholds = rules.manager.teamThresholds;
  let match: number | undefined;
  for (const t of thresholds) {
    if (t.teamSize <= totalTeamSize) match = t.percent;
  }
  return match ?? thresholds[thresholds.length - 1]!.percent;
}

export type ManagerPerformance = {
  /** Sum of each Permanent team member's own target for the period. */
  baseTarget: number;
  /** Threshold percentage from the team-size table. */
  thresholdPercentage: number;
  /** baseTarget x threshold, rounded — the absolute number the team must hit. */
  finalTarget: number;
  /** activity / baseTarget x 100, used for the New commission tiers. */
  achievementPercentage: number;
  isTargetAchieved: boolean;
};

export function calculateManagerPerformance(
  rules: CommissionRules,
  permanentCount: number,
  probationCount: number,
  teamActivity: number,
  /** Sum of each Permanent team member's own target for the period (admin-configurable per employee). */
  permanentTargetSum: number,
): ManagerPerformance {
  const totalTeamSize = permanentCount + probationCount;
  const thresholdPercentage = getTeamTargetThreshold(rules, totalTeamSize);

  // A team with no Permanent staff has nothing to measure against: it
  // counts as achieved when anyone is on it, and as 0% when empty.
  if (permanentCount === 0) {
    return {
      baseTarget: 0,
      thresholdPercentage,
      finalTarget: 0,
      achievementPercentage: totalTeamSize === 0 ? 0 : 100,
      isTargetAchieved: totalTeamSize > 0,
    };
  }

  const baseTarget = permanentTargetSum;
  const finalTarget = Math.round(baseTarget * (thresholdPercentage / 100));

  return {
    baseTarget,
    thresholdPercentage,
    finalTarget,
    achievementPercentage: (teamActivity / baseTarget) * 100,
    isTargetAchieved: teamActivity >= finalTarget,
  };
}

/** Manager's share of the team's New commission pot, by achievement percentage. */
export function getManagerNewCommissionRate(rules: CommissionRules, achievementPercentage: number): number {
  const tiers = [...rules.manager.newCommissionTiers].sort((a, b) => b.minAchievement - a.minAchievement);
  return tiers.find((t) => achievementPercentage >= t.minAchievement)?.rate ?? 0;
}

/**
 * KOMISI.md 6.C: the part of a team member's commission the manager's
 * Overriding New is taken from — New, Prorate and Alat. Upgrade and Setup
 * are left out.
 */
export function getManagerNewCommissionBasis(breakdown: CommissionBreakdown): number {
  return breakdown.new.commission + breakdown.prorate.commission + breakdown.alat.commission;
}

/** Manager's flat rate on the team's recurring subscription. */
export function getManagerRecurringRate(rules: CommissionRules, isTargetAchieved: boolean): number {
  return isTargetAchieved ? rules.manager.recurringOnTarget : rules.manager.recurringMissedTarget;
}

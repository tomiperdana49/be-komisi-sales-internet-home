/**
 * Pure commission math. Every rule here is documented in KOMISI.md —
 * keep the two in sync when either changes.
 */

import { DEFAULT_SALES_TARGET } from "../interface/employee.interface";

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

const NUSAFIBER_SERVICE_IDS = new Set(["BFLITE"]);
const NUSA_BASIC_PRIME_IDS = new Set(["NFSP030", "NFSP100"]);
const NUSA_ULTRA_IDS = new Set(["NFSP200"]);

/** Services whose New/Upgrade rate only steps up at >= 6 months (others step at > 1). */
const SIX_MONTH_TIER_IDS = new Set(["NFSP030", "NFSP100", "NFSP200"]);

/**
 * Rates per ServiceId. Note several products carry two interchangeable
 * ServiceIds in billing (same ServiceType name) — both aliases must be
 * listed or the sale silently earns 0%:
 *   Standard 100 -> HOME100 / HOMESTD100
 *   Advanced 200 -> HOMEADV / HOMEADV200
 *   Premium 300  -> HOMEPREM300 / HOME300
 */
const COMMISSION_RATES: Record<string, { 1: number; 6: number; 12: number }> = {
  BFLITE: { 1: 28.38, 6: 6.55, 12: 5.09 },
  NFSP030: { 1: 20.0, 6: 5.56, 12: 4.44 },
  NFSP100: { 1: 20.0, 6: 5.56, 12: 4.44 },
  NFSP200: { 1: 26.0, 6: 6.0, 12: 4.67 },
  HOME100: { 1: 28.57, 6: 5.95, 12: 4.76 },
  HOMESTD100: { 1: 28.57, 6: 5.95, 12: 4.76 },
  HOMEADV200: { 1: 27.78, 6: 5.56, 12: 4.63 },
  HOMEADV: { 1: 27.78, 6: 5.56, 12: 4.63 },
  HOMEPREM300: { 1: 31.25, 6: 6.25, 12: 5.21 },
  HOME300: { 1: 31.25, 6: 6.25, 12: 5.21 },
  LITE100: { 1: 28.0, 6: 5.95, 12: 4.76 },
  LITE200: { 1: 27.0, 6: 5.56, 12: 4.63 },
};

/**
 * Threshold keyed by TOTAL team size (Permanent + Probation), per the
 * business spec. Note this deliberately differs from the legacy
 * implementation, which keyed off the Permanent count only.
 */
const TEAM_TARGET_THRESHOLDS: Record<number, number> = {
  1: 120, 2: 115, 3: 110, 4: 105, 5: 100,
  6: 95, 7: 92, 8: 90, 9: 88, 10: 85,
};

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
      return "digital-business";
    default:
      return "home";
  }
}

export function getServiceGroupLabel(serviceId: string | null | undefined): ServiceGroupLabel {
  const code = serviceId?.toUpperCase() ?? "";
  if (NUSAFIBER_SERVICE_IDS.has(code)) return "Nusafiber";
  if (NUSA_BASIC_PRIME_IDS.has(code) || NUSA_ULTRA_IDS.has(code)) return "NusaSelecta";
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
  category: string | null | undefined,
  serviceId: string | null | undefined,
): RecurringServiceGroupLabel {
  if (toCommissionCategory(category) === "digital-business") return "Digital Business";

  const code = serviceId?.toUpperCase() ?? "";
  if (NUSAFIBER_SERVICE_IDS.has(code)) return "Nusafiber";
  if (NUSA_BASIC_PRIME_IDS.has(code) || NUSA_ULTRA_IDS.has(code)) return "NusaSelecta";
  return hasCommissionRate(serviceId) ? "Home" : "Access Business";
}

export function isNusaBasicPrime(serviceId: string | null | undefined): boolean {
  return NUSA_BASIC_PRIME_IDS.has(serviceId ?? "");
}

export function isNusaUltra(serviceId: string | null | undefined): boolean {
  return NUSA_ULTRA_IDS.has(serviceId ?? "");
}

export function isNusaSelecta(serviceId: string | null | undefined): boolean {
  return isNusaBasicPrime(serviceId) || isNusaUltra(serviceId);
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

/** 10% deduction per late month, capped at 50%. Waived entirely for approved invoices. */
export function applyLateMonthPenalty(
  amount: number,
  lateMonth: number | null | undefined,
  isApproved: unknown = false,
): number {
  const approved = isApproved === true || isApproved === 1 || isApproved === "1";
  if (approved || !lateMonth || lateMonth <= 0) return amount;

  const deduction = Math.min(Number(lateMonth) * 0.1, 0.5);
  return amount * (1 - deduction);
}

/**
 * Commission basis: Cashback/Monthly referrals are paid out of the same
 * pot, so their fee comes off before commission is calculated.
 */
export function getCommissionBasis(
  subscription: number,
  referralFee: number,
  referralType: string | null | undefined,
): number {
  return referralType === "Cashback" || referralType === "Monthly"
    ? subscription - referralFee
    : subscription;
}

/** True when a service has a configured New/Upgrade rate. */
export function hasCommissionRate(serviceId: string | null | undefined): boolean {
  return Boolean(COMMISSION_RATES[serviceId?.toUpperCase() ?? ""]);
}

function getNewUpgradeRate(serviceId: string | null | undefined, months: number): number {
  const rates = COMMISSION_RATES[serviceId?.toUpperCase() ?? ""];
  if (!rates) return 0; // service without a configured rate earns nothing on new/upgrade

  if (months >= 12) return rates[12];
  if (SIX_MONTH_TIER_IDS.has(serviceId?.toUpperCase() ?? "")) {
    return months >= 6 ? rates[6] : rates[1];
  }
  return months > 1 ? rates[6] : rates[1];
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
  /** This employee's New Achievement target for the period (default DEFAULT_SALES_TARGET, admin-configurable). */
  target: number;
  /** True when the same customer also has a Setup invoice this period. */
  hasSetup: boolean;
  /** 'Internal' | 'Resell', only meaningful for Digital Business. */
  businessOperation: string | null | undefined;
};

/** Returns the commission percentage (e.g. 1.5 means 1.5%). */
export function getCommissionPercentage(input: CommissionRateInput): number {
  const { category, type, serviceId, months, status, activityCount, target } = input;

  if (category === "setup") return 5;
  if (category === "alat") return input.hasSetup ? 2 : 1;

  if (category === "digital-business") {
    // Rate depends only on how the service is operated — never on target.
    if (type !== "recurring") return getNewUpgradeRate(serviceId, months);
    if (input.businessOperation === "Internal") return 1;
    if (input.businessOperation === "Resell") return 0.5;
    return 0;
  }

  // category === 'home' — every non-Alat/Setup/Digital-Business service.
  switch (type) {
    case "prorate":
      return 10;
    case "recurring":
      return status === "Permanent" && activityCount < target ? 0.5 : 1.5;
    case "new":
    case "upgrade":
      return getNewUpgradeRate(serviceId, months);
    default:
      return 0;
  }
}

/**
 * The 70% performance penalty only bites Permanent staff who missed target,
 * and only on New installations.
 */
export function getPerformancePenalty(
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

  return applies ? 0.7 : 0;
}

export type CommissionResult = {
  baseCommission: number;
  commissionPercentage: number;
  commission: number;
};

export function calculateCommission(
  basis: number,
  lateMonth: number | null | undefined,
  isApproved: unknown,
  input: CommissionRateInput,
): CommissionResult {
  const afterLate = applyLateMonthPenalty(basis, lateMonth, isApproved);
  const penalty = getPerformancePenalty(
    input.category,
    input.type,
    input.status,
    input.activityCount,
    input.target,
  );

  const baseCommission = Math.max(0, afterLate * (1 - penalty));
  const commissionPercentage = getCommissionPercentage(input);

  return {
    baseCommission,
    commissionPercentage,
    commission: baseCommission * (commissionPercentage / 100),
  };
}

export type AchievementResult = { achievementStatus: string; motivation: string };

export function calculateAchievement(
  status: string | null | undefined,
  activityCount: number,
): AchievementResult {
  if (status === "Permanent") {
    if (activityCount >= 15) {
      return {
        achievementStatus: "Capai target Bonus",
        motivation: "Congratulations on your outstanding achievement!",
      };
    }
    if (activityCount >= 12) {
      return { achievementStatus: "Capai target", motivation: "Bravo! Keep up the great work!" };
    }
    if (activityCount < 3) {
      return { achievementStatus: "SP1", motivation: "Keep fighting and don't give up!" };
    }
    return {
      achievementStatus: "Tidak Capai target",
      motivation: "Just a little more fights, go on!",
    };
  }

  if (status === "Probation" || status === "Contract") {
    if (activityCount >= 8) {
      return {
        achievementStatus: "Excellent",
        motivation: "Congratulations on your outstanding achievement!",
      };
    }
    if (activityCount >= 5) {
      return { achievementStatus: "Very Good", motivation: "Bravo! Keep up the great work!" };
    }
    if (activityCount >= 3) {
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
 * Bonus Kelebihan Service — extra monthly cash bonus, paid on top of
 * commission. For Permanent staff, tiers are relative to the employee's
 * own target (base 12): each tier shifts by the same amount the target
 * differs from 12, e.g. target 13 moves the first tier from 15 to 16,
 * target 11 moves it to 14.
 *
 * Non-Permanent staff (Probation/Contract) always use the flat 15/17/20
 * base tiers, regardless of whatever target is configured for them —
 * target on those statuses only ever exists to gate the recurring rate /
 * performance penalty (Permanent-only rules, see KOMISI.md 2.A & 1.2),
 * not to shift the bonus tier.
 */
export function calculateBonus(activityCount: number, target: number, status: string | null | undefined): number {
  const effectiveTarget = status === "Permanent" ? target : DEFAULT_SALES_TARGET;
  const shift = effectiveTarget - DEFAULT_SALES_TARGET;
  const tier1 = 15 + shift;
  const tier2 = 17 + shift;
  const tier3 = 20 + shift;

  if (activityCount > tier3) return 1_500_000 + (activityCount - tier3) * 150_000;
  if (activityCount === tier3) return 1_500_000;
  if (activityCount >= tier2) return 1_000_000;
  if (activityCount >= tier1) return 500_000;
  return 0;
}

/** Threshold percentage a manager's team must reach, keyed by TOTAL team size. */
export function getTeamTargetThreshold(totalTeamSize: number): number {
  return TEAM_TARGET_THRESHOLDS[totalTeamSize] ?? 85;
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
  permanentCount: number,
  probationCount: number,
  teamActivity: number,
  /** Sum of each Permanent team member's own target for the period (admin-configurable, default DEFAULT_SALES_TARGET each). */
  permanentTargetSum: number,
): ManagerPerformance {
  const totalTeamSize = permanentCount + probationCount;
  const thresholdPercentage = getTeamTargetThreshold(totalTeamSize);

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
export function getManagerNewCommissionRate(achievementPercentage: number): number {
  if (achievementPercentage >= 150) return 60;
  if (achievementPercentage >= 125) return 50;
  if (achievementPercentage >= 100) return 40;
  if (achievementPercentage >= 50) return 25;
  return 0;
}

/** Manager's flat rate on the team's recurring subscription. */
export function getManagerRecurringRate(isTargetAchieved: boolean): number {
  return isTargetAchieved ? 0.9 : 0.5;
}

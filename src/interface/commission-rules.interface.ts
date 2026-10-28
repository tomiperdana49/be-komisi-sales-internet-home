import { z } from "zod";
import { DEFAULT_CHURN_CLOSE_REASONS, normalizeCloseReason } from "../helper/churn-close-reason.helper";

const percent = z.number().min(0).max(100);
const count = z.number().int().min(0);
const amount = z.number().min(0);

export const PRODUCT_GROUPS = ["Home", "Nusafiber", "NusaSelecta Basic/Prime", "NusaSelecta Ultra"] as const;

/** ServiceIds the churn query used to hardcode — rule sets saved before `churn` existed keep counting exactly these. */
const LEGACY_CHURN_SERVICE_IDS = ["BFLITE", "CBSHM", "HOME30", "HOME50", "HOME100", "HOME300", "HOMESTD100", "HOMEADV", "HOMEADV200", "HOMEPREM300", "BOOSTER100", "BOOSTER200", "BOOSTER300"];

const productSchema = z.object({
  name: z.string().trim().min(1),
  /** Billing ServiceIds sharing this rate — several products carry two aliases. */
  serviceIds: z.array(z.string().trim().min(1)).min(1),
  group: z.enum(PRODUCT_GROUPS),
  rate1: percent,
  rate6: percent,
  rate12: percent,
  /** Contract length (months) at which the 6-month rate starts: 2 for most products, 6 for NusaSelecta. */
  sixMonthRateFrom: z.number().int().min(2).max(35),
  /** Contract length (months) at which the 12-month rate starts. Defaulted for rule sets saved before it existed. */
  twelveMonthRateFrom: z.number().int().min(3).max(36).default(12),
  /** Setup commission for this product; null falls back to rates.setup. */
  setupRate: percent.nullable(),
  /** Whether a stopped service of this product is pulled in as a churn. */
  churn: z.boolean().optional(),
}).transform((p) => ({
  ...p,
  churn: p.churn ?? p.serviceIds.some((id) => LEGACY_CHURN_SERVICE_IDS.includes(id)),
}));

const tier = <T extends z.ZodRawShape>(shape: T) => z.array(z.object(shape)).min(1);

export const CHURN_CLOSE_STATUSES = ["New Installation", "Active to NA", "Renewal", "System"] as const;
export type ChurnCloseStatus = (typeof CHURN_CLOSE_STATUSES)[number];

/** Whether a service closed with this NIS close reason (within its close status) counts as churn. */
const churnCloseReasonSchema = z.object({
  status: z.enum(CHURN_CLOSE_STATUSES),
  /** Kategori Close Reason — shown only; matching uses status + reason. */
  category: z.string().trim().default(""),
  /** Reason name as in NIS (ServiceCloseCategoryDetail.name). */
  reason: z.string().trim().min(1),
  /** Explanation shown next to the reason, e.g. "deal batal sebelum aktif". */
  note: z.string().trim().default(""),
  effectFrom: z.enum(["Operational", "Contract"]),
  churn: z.boolean(),
});
export type ChurnCloseReasonRule = z.output<typeof churnCloseReasonSchema>;

export const commissionRulesSchema = z
  .object({
    products: z.array(productSchema),
    /**
     * Recurring (old-customer) categories that never earn commission. Applied
     * when the hourly import job pulls a period's invoices, so a change shows
     * up on that period's next import, not in a preview.
     */
    excludedRecurringCategories: z.array(z.string().trim().min(1)).default(["Domain"]),
    /**
     * Effect of each NIS close reason on churn. Applied by churn-crawl when it
     * pulls a period's churns, so a change shows up on that period's next crawl.
     */
    churnCloseReasons: z.array(churnCloseReasonSchema).default(() => structuredClone(DEFAULT_CHURN_CLOSE_REASONS)),
    rates: z.object({
      prorate: percent,
      setup: percent,
      alatWithSetup: percent,
      alatStandalone: percent,
      recurringOnTarget: percent,
      recurringMissedTarget: percent,
      digitalBusinessInternal: percent,
      digitalBusinessResell: percent,
    }),
    penalties: z.object({
      latePerMonth: percent,
      lateMax: percent,
      missedTarget: percent,
    }),
    targets: z.object({
      permanent: count,
      probation: count,
    }),
    achievement: z.object({
      permanentBonus: count,
      permanentOnTarget: count,
      permanentSp1Below: count,
      probationExcellent: count,
      probationVeryGood: count,
      probationAverage: count,
    }),
    bonus: z.object({
      /** New Achievement levels for a Permanent sales on the default target; shifted by (own target - default). */
      tiers: tier({ at: count, amount }),
      /** Paid per unit above the last tier, on top of the last tier's amount. */
      excessPerUnit: amount,
    }),
    manager: z.object({
      /** Threshold % by total team size; the last entry also covers every larger team. */
      teamThresholds: tier({ teamSize: z.number().int().min(1), percent: z.number().min(0).max(500) }),
      newCommissionTiers: tier({ minAchievement: z.number().min(0), rate: percent }),
      /** Overriding rate on the team's old-customer access recurring (every category except Digital Business / IP Public). */
      recurringOnTarget: percent,
      recurringMissedTarget: percent,
      /**
       * Overriding rate on the team's Digital Business recurring (IP Public counts as Internal).
       * Defaults apply to rule sets saved before these existed (from October 2026).
       */
      recurringDigitalBusinessInternalOnTarget: percent.default(1),
      recurringDigitalBusinessInternalMissedTarget: percent.default(0.5),
      recurringDigitalBusinessResellOnTarget: percent.default(0.5),
      recurringDigitalBusinessResellMissedTarget: percent.default(0.25),
    }),
  })
  .superRefine((rules, ctx) => {
    const seen = new Map<string, string>();
    for (const product of rules.products) {
      if (product.sixMonthRateFrom >= product.twelveMonthRateFrom) {
        ctx.addIssue({ code: "custom", message: `${product.name}: kontrak untuk rate 6 bulan harus lebih pendek dari rate 12 bulan` });
      }
      for (const id of product.serviceIds) {
        const key = id.toUpperCase();
        const other = seen.get(key);
        if (other) {
          ctx.addIssue({ code: "custom", message: `ServiceId ${id} dipakai di dua produk: ${other} dan ${product.name}` });
        }
        seen.set(key, product.name);
      }
    }

    const ascending = (values: number[], label: string) => {
      for (let i = 1; i < values.length; i++) {
        if (values[i]! <= values[i - 1]!) {
          ctx.addIssue({ code: "custom", message: `${label} harus berurutan naik` });
          return;
        }
      }
    };
    const seenReasons = new Set<string>();
    for (const r of rules.churnCloseReasons) {
      const key = `${r.status}|${normalizeCloseReason(r.reason)}`;
      if (seenReasons.has(key)) {
        ctx.addIssue({ code: "custom", message: `Alasan close "${r.reason}" ditulis dua kali untuk status ${r.status}` });
      }
      seenReasons.add(key);
    }

    ascending(rules.bonus.tiers.map((t) => t.at), "Tier bonus bulanan");
    ascending(rules.manager.teamThresholds.map((t) => t.teamSize), "Jumlah AM pada threshold tim");
    ascending([...rules.manager.newCommissionTiers].reverse().map((t) => t.minAchievement), "Tier overriding New (dari besar ke kecil)");

    const a = rules.achievement;
    if (!(a.permanentSp1Below <= a.permanentOnTarget && a.permanentOnTarget <= a.permanentBonus)) {
      ctx.addIssue({ code: "custom", message: "Batas status Permanent harus SP1 ≤ Capai target ≤ Capai target Bonus" });
    }
    if (!(a.probationAverage <= a.probationVeryGood && a.probationVeryGood <= a.probationExcellent)) {
      ctx.addIssue({ code: "custom", message: "Batas status Probation harus Average ≤ Very Good ≤ Excellent" });
    }
  });

export type CommissionRules = z.output<typeof commissionRulesSchema>;

/**
 * Sales Development Representative (SDR) rules — versioned on their own
 * (table sdr_commission_rule_set, admin page "Aturan Komisi SDR"), fully
 * separate from the Home rules above. Same per-salesperson sections as Home
 * (products, rates, penalties, targets, achievement, bonus); no manager part.
 */
export const sdrRulesSchema = z
  .object({
    products: z.array(productSchema),
    rates: z.object({
      prorate: percent,
      setup: percent,
      alatWithSetup: percent,
      alatStandalone: percent,
      recurringOnTarget: percent,
      recurringMissedTarget: percent,
      digitalBusinessInternal: percent,
      digitalBusinessResell: percent,
    }),
    penalties: z.object({
      latePerMonth: percent,
      lateMax: percent,
      missedTarget: percent,
    }),
    targets: z.object({
      permanent: count,
      probation: count,
    }),
    achievement: z.object({
      permanentBonus: count,
      permanentOnTarget: count,
      permanentSp1Below: count,
      probationExcellent: count,
      probationVeryGood: count,
      probationAverage: count,
    }),
    bonus: z.object({
      tiers: tier({ at: count, amount }),
      /** Paid per unit above the last tier, on top of the last tier's amount. */
      excessPerUnit: amount,
    }),
  })
  .superRefine((rules, ctx) => {
    const seen = new Map<string, string>();
    for (const product of rules.products) {
      if (product.sixMonthRateFrom >= product.twelveMonthRateFrom) {
        ctx.addIssue({ code: "custom", message: `${product.name}: kontrak untuk rate 6 bulan harus lebih pendek dari rate 12 bulan` });
      }
      for (const id of product.serviceIds) {
        const key = id.toUpperCase();
        const other = seen.get(key);
        if (other) {
          ctx.addIssue({ code: "custom", message: `ServiceId ${id} dipakai di dua produk: ${other} dan ${product.name}` });
        }
        seen.set(key, product.name);
      }
    }

    const tiers = rules.bonus.tiers.map((t) => t.at);
    if (tiers.some((at, i) => i > 0 && at <= tiers[i - 1]!)) {
      ctx.addIssue({ code: "custom", message: "Tier bonus bulanan harus berurutan naik" });
    }

    const a = rules.achievement;
    if (!(a.permanentSp1Below <= a.permanentOnTarget && a.permanentOnTarget <= a.permanentBonus)) {
      ctx.addIssue({ code: "custom", message: "Batas status Permanent harus SP1 ≤ Capai target ≤ Capai target Bonus" });
    }
    if (!(a.probationAverage <= a.probationVeryGood && a.probationVeryGood <= a.probationExcellent)) {
      ctx.addIssue({ code: "custom", message: "Batas status Probation harus Average ≤ Very Good ≤ Excellent" });
    }
  });

export type SdrCommissionRules = z.output<typeof sdrRulesSchema>;
export type CommissionProductRule = CommissionRules["products"][number];

/** Supplies the rules in force for a period — swapped for a draft when previewing. */
export interface ICommissionRulesProvider {
  getForPeriod(period: string): Promise<CommissionRules>;
}

/** Supplies the SDR rules in force for a period — swapped for a draft when previewing. */
export interface ISdrRulesProvider {
  getForPeriod(period: string): Promise<SdrCommissionRules>;
}

export type CommissionRuleSetRow<R = CommissionRules> = {
  id: number;
  effective_period: string;
  status: "draft" | "published";
  rules: R | string;
  note: string;
  created_by: string;
  created_at: Date | string;
  updated_by: string | null;
  updated_at: Date | string | null;
  published_by: string | null;
  published_at: Date | string | null;
};

export type CommissionRuleSetItem<R = CommissionRules> = {
  id: number;
  effectivePeriod: string;
  status: "draft" | "published";
  rules: R;
  note: string;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  /** Last admin to save the draft; null until it's edited after creation. */
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
  publishedBy: string | null;
  publishedByName: string | null;
  publishedAt: string | null;
};

export interface ICommissionRuleRepository<R = CommissionRules> {
  findAll(): Promise<CommissionRuleSetRow<R>[]>;
  findById(id: number): Promise<CommissionRuleSetRow<R> | null>;
  findPublishedForPeriod(period: string): Promise<CommissionRuleSetRow<R> | null>;
  insertDraft(effectivePeriod: string, rules: R, note: string, createdBy: string): Promise<number>;
  updateDraft(id: number, effectivePeriod: string, rules: R, note: string, updatedBy: string): Promise<void>;
  publish(id: number, publishedBy: string): Promise<void>;
  deleteDraft(id: number): Promise<void>;
}

import { z } from "zod";

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

export const commissionRulesSchema = z
  .object({
    products: z.array(productSchema),
    /**
     * Recurring (old-customer) categories that never earn commission. Applied
     * when the hourly import job pulls a period's invoices, so a change shows
     * up on that period's next import, not in a preview.
     */
    excludedRecurringCategories: z.array(z.string().trim().min(1)).default(["Domain"]),
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
      recurringOnTarget: percent,
      recurringMissedTarget: percent,
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
export type CommissionProductRule = CommissionRules["products"][number];

/** Supplies the rules in force for a period — swapped for a draft when previewing. */
export interface ICommissionRulesProvider {
  getForPeriod(period: string): Promise<CommissionRules>;
}

export type CommissionRuleSetRow = {
  id: number;
  effective_period: string;
  status: "draft" | "published";
  rules: CommissionRules | string;
  note: string;
  created_by: string;
  created_at: Date | string;
  updated_by: string | null;
  updated_at: Date | string | null;
  published_by: string | null;
  published_at: Date | string | null;
};

export type CommissionRuleSetItem = {
  id: number;
  effectivePeriod: string;
  status: "draft" | "published";
  rules: CommissionRules;
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

export interface ICommissionRuleRepository {
  findAll(): Promise<CommissionRuleSetRow[]>;
  findById(id: number): Promise<CommissionRuleSetRow | null>;
  findPublishedForPeriod(period: string): Promise<CommissionRuleSetRow | null>;
  insertDraft(effectivePeriod: string, rules: CommissionRules, note: string, createdBy: string): Promise<number>;
  updateDraft(id: number, effectivePeriod: string, rules: CommissionRules, note: string, updatedBy: string): Promise<void>;
  publish(id: number, publishedBy: string): Promise<void>;
  deleteDraft(id: number): Promise<void>;
}

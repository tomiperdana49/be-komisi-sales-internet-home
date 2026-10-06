import { describe, expect, test } from "bun:test";
import { CommissionService } from "./commission.service";
import { DEFAULT_COMMISSION_RULES } from "../helper/commission-rules.default";
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

function engine(rows: CommissionSnapshotRow[], status = "Permanent", manualTarget: number | null = null) {
  const manual = manualTarget === null ? null : { target: manualTarget, startPeriod: "202610", endPeriod: "202612" };
  return new CommissionService(
    { findBySales: async () => rows, findRecurringByManager: async () => [] } as any,
    { getByEmployeeId: async () => [] } as any,
    { getStatusByPeriod: async () => ({ status, target: 12 }) } as any,
    { getAmount: async () => 0 } as any,
    { getForPeriod: async () => DEFAULT_COMMISSION_RULES },
    { getActive: async () => manual },
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

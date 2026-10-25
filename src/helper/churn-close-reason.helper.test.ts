import { describe, expect, test } from "bun:test";
import { countsAsChurnClose, DEFAULT_CHURN_CLOSE_REASONS, normalizeCloseReason } from "./churn-close-reason.helper";

const counts = (statusId: number | null, reason: string | null, categoryId: number | null = 1) =>
  countsAsChurnClose(DEFAULT_CHURN_CLOSE_REASONS, categoryId, statusId, reason);

describe("countsAsChurnClose", () => {
  test("follows the Effect Churn table per close status", () => {
    expect(counts(1, "Paid not yet to install")).toBe(true);
    expect(counts(1, "Unreachable area")).toBe(false);
    expect(counts(2, "Poor Quality Product")).toBe(false);
    expect(counts(2, "Customer Issue")).toBe(true);
    expect(counts(3, "Poor Quality Product")).toBe(false);
    expect(counts(3, "All fine, but benefits not needed")).toBe(true);
    expect(counts(4, "WHMCS")).toBe(false);
  });

  test("matches NIS spellings of the same reason", () => {
    expect(counts(2, "Solving Problem take too long & slow")).toBe(true);
    expect(counts(2, "Customer Issue ")).toBe(true);
    expect(counts(1, "Event Sudah Selesai")).toBe(false);
    expect(normalizeCloseReason("Budget not enough (deal batal sebelum aktif)")).toBe("budget not enough");
  });

  test("a reason not in the table is not a churn", () => {
    expect(counts(1, "Something new")).toBe(false);
    expect(counts(2, "Decision from the Head Office")).toBe(false);
    expect(counts(3, "Merger Services")).toBe(false);
    expect(counts(4, "Merger Services")).toBe(false);
  });

  test("legacy closings without a category count, unknown statuses don't", () => {
    expect(counts(null, null, null)).toBe(true);
    expect(counts(0, "All fine, but Benefits not needed")).toBe(false);
    expect(counts(null, "Note")).toBe(false);
  });
});

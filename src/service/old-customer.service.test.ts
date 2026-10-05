import { describe, expect, test } from "bun:test";
import { effectivePaymentDate, isPaidWithinPeriod } from "./old-customer.service";
import { getDateRangeForPeriod } from "../helper/period.helper";

const { start, end } = getDateRangeForPeriod("202610"); // 26 Sep 2026 00:00 .. 25 Oct 2026 23:59:59

describe("recurring invoice belongs to the period its payment falls in", () => {
  test("October service paid early on 22 Sep counts in September, not October", () => {
    expect(isPaidWithinPeriod(1, new Date(2026, 8, 22), start, end)).toBe(false);
    const sep = getDateRangeForPeriod("202609");
    expect(isPaidWithinPeriod(1, new Date(2026, 8, 22), sep.start, sep.end)).toBe(true);
  });

  test("period boundaries are inclusive", () => {
    expect(isPaidWithinPeriod(1, new Date(2026, 8, 26, 0, 0, 0), start, end)).toBe(true);
    expect(isPaidWithinPeriod(1, new Date(2026, 9, 25, 23, 0, 0), start, end)).toBe(true);
    expect(isPaidWithinPeriod(1, new Date(2026, 8, 25, 23, 59, 59), start, end)).toBe(false);
    expect(isPaidWithinPeriod(1, new Date(2026, 9, 26, 0, 0, 0), start, end)).toBe(false);
  });

  test("unpaid or undated invoices never count", () => {
    expect(isPaidWithinPeriod(0, new Date(2026, 9, 1), start, end)).toBe(false);
    expect(isPaidWithinPeriod(1, null, start, end)).toBe(false);
    expect(isPaidWithinPeriod(1, "bukan tanggal", start, end)).toBe(false);
  });
});

describe("IS-1508: late finance input", () => {
  test("paid by the 25th but entered on/after the 27th of the invoice month moves to the input date", () => {
    expect(effectivePaymentDate("2026-09-01", "2026-09-24", "2026-09-27")).toBe("2026-09-27");
  });

  test("otherwise the transaction date places the payment", () => {
    expect(effectivePaymentDate("2026-09-01", "2026-09-24", "2026-09-26")).toBe("2026-09-24");
    expect(effectivePaymentDate("2026-08-01", "2026-09-24", "2026-09-28")).toBe("2026-09-24");
    expect(effectivePaymentDate("2026-09-01", null, "2026-09-28")).toBe("2026-09-28");
  });
});

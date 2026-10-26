import { describe, expect, test } from "bun:test";
import { isPaidInPeriod } from "./new-customer.service";
import { getDateRangeForPeriod } from "../helper/period.helper";

describe("isPaidInPeriod", () => {
  const { start, end } = getDateRangeForPeriod("202610");

  test("counts a payment made within the period", () => {
    expect(isPaidInPeriod("2026-09-26", start, end)).toBe(true);
    expect(isPaidInPeriod("2026-10-25", start, end)).toBe(true);
    expect(isPaidInPeriod(new Date(2026, 9, 25, 23, 59), start, end)).toBe(true);
  });

  test("an invoice paid before the period (invoiced later) counts in its payment's period, not again here", () => {
    expect(isPaidInPeriod("2026-09-22", start, end)).toBe(false);
  });

  test("a payment after the period or without a date doesn't count", () => {
    expect(isPaidInPeriod("2026-10-26", start, end)).toBe(false);
    expect(isPaidInPeriod(null, start, end)).toBe(false);
    expect(isPaidInPeriod("not a date", start, end)).toBe(false);
  });
});

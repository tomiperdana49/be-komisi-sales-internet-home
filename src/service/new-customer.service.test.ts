import { describe, expect, test } from "bun:test";
import { activationCommissionDate, isPaidInPeriod } from "./new-customer.service";
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

describe("activationCommissionDate", () => {
  const oct = getDateRangeForPeriod("202610");
  const nov = getDateRangeForPeriod("202611");
  const countsIn = (d: unknown, range: { start: Date; end: Date }) => isPaidInPeriod(d, range.start, range.end);

  test("paid in October, activated in November: counts in November only", () => {
    const d = activationCommissionDate("2026-10-16", "2026-11-03", false);
    expect(countsIn(d, oct)).toBe(false);
    expect(countsIn(d, nov)).toBe(true);
  });

  test("activated before or on the payment: counts on the payment", () => {
    expect(activationCommissionDate("2026-10-16", "2026-10-15", false)).toBe("2026-10-16");
    expect(activationCommissionDate("2026-10-25", "2026-10-25", false)).toBe("2026-10-25");
  });

  test("never activated yet (BL, no Activation recorded): doesn't count yet", () => {
    expect(activationCommissionDate("2026-10-16", "2026-10-15", true)).toBeNull();
  });

  test("payments before the October 2026 period keep the payment date", () => {
    expect(activationCommissionDate("2026-09-22", "2026-10-03", false)).toBe("2026-09-22");
    expect(activationCommissionDate("2026-09-22", null, true)).toBe("2026-09-22");
  });

  test("no payment yet stays unpaid", () => {
    expect(countsIn(activationCommissionDate(null, "2026-10-03", false), oct)).toBe(false);
  });
});

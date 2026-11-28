import { describe, expect, test } from "bun:test";
import { joinedByPeriodEnd, statusForPeriod } from "./employee-status.helper";

describe("statusForPeriod", () => {
  test("made Permanent during a period: still Probation for it, Permanent from the next", () => {
    expect(statusForPeriod("Permanent", "2026-10-22", "2026-09-26")).toBe("Probation");
    expect(statusForPeriod("Permanent", "2026-10-22", "2026-10-26")).toBe("Permanent");
  });

  test("signed on the period's first day counts as Permanent for it", () => {
    expect(statusForPeriod("Permanent", "2026-10-26", "2026-10-26")).toBe("Permanent");
  });

  test("signed less than 10 days after the period starts counts as Permanent for it", () => {
    expect(statusForPeriod("Permanent", "2026-10-27", "2026-10-26")).toBe("Permanent");
    expect(statusForPeriod("Permanent", "2026-11-04", "2026-10-26")).toBe("Permanent");
  });

  test("signed 10 or more days after the period starts: Probation for it", () => {
    expect(statusForPeriod("Permanent", "2026-11-05", "2026-10-26")).toBe("Probation");
    expect(statusForPeriod("Permanent", "2026-09-15", "2026-08-26")).toBe("Probation");
  });

  test("the day count crosses month and year ends", () => {
    expect(statusForPeriod("Permanent", "2027-01-04", "2026-12-26")).toBe("Permanent");
    expect(statusForPeriod("Permanent", "2027-01-05", "2026-12-26")).toBe("Probation");
  });

  test("a sign date with a time part is compared by its date", () => {
    expect(statusForPeriod("Permanent", "2026-11-04 23:59:59", "2026-10-26")).toBe("Permanent");
  });

  test("no sign date, or not Permanent: status as Nusawork gives it", () => {
    expect(statusForPeriod("Permanent", null, "2026-09-26")).toBe("Permanent");
    expect(statusForPeriod("Probation", "2026-10-22", "2026-09-26")).toBe("Probation");
    expect(statusForPeriod("Contract", undefined, "2026-09-26")).toBe("Contract");
  });
});

describe("joinedByPeriodEnd", () => {
  test("joined on the first day of the next period: not in this one", () => {
    expect(joinedByPeriodEnd("2026-11-26", "2026-11-25")).toBe(false);
    expect(joinedByPeriodEnd("2026-11-26", "2026-12-25")).toBe(true);
  });

  test("joined during or before the period, or no join date: in it", () => {
    expect(joinedByPeriodEnd("2026-11-25", "2026-11-25")).toBe(true);
    expect(joinedByPeriodEnd("2026-09-14", "2026-11-25")).toBe(true);
    expect(joinedByPeriodEnd(null, "2026-11-25")).toBe(true);
  });
});

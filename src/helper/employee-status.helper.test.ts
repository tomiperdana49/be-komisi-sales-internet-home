import { describe, expect, test } from "bun:test";
import { statusForPeriod } from "./employee-status.helper";

describe("statusForPeriod", () => {
  test("made Permanent during a period: still Probation for it, Permanent from the next", () => {
    expect(statusForPeriod("Permanent", "2026-10-22", "2026-09-26")).toBe("Probation");
    expect(statusForPeriod("Permanent", "2026-10-22", "2026-10-26")).toBe("Permanent");
  });

  test("signed on the period's first day counts as Permanent for it", () => {
    expect(statusForPeriod("Permanent", "2026-10-26", "2026-10-26")).toBe("Permanent");
  });

  test("no sign date, or not Permanent: status as Nusawork gives it", () => {
    expect(statusForPeriod("Permanent", null, "2026-09-26")).toBe("Permanent");
    expect(statusForPeriod("Probation", "2026-10-22", "2026-09-26")).toBe("Probation");
    expect(statusForPeriod("Contract", undefined, "2026-09-26")).toBe("Contract");
  });
});

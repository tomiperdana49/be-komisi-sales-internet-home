import { describe, expect, test } from "bun:test";
import { currentCommissionPeriod, defaultJobPeriods, shiftPeriod } from "./period.helper";

describe("commission period", () => {
  test("runs 26th–25th: from the 26th it's already next month's period", () => {
    expect(currentCommissionPeriod(new Date(2026, 8, 25))).toBe("202609");
    expect(currentCommissionPeriod(new Date(2026, 8, 26))).toBe("202610");
    expect(currentCommissionPeriod(new Date(2026, 11, 27))).toBe("202701");
  });

  test("hourly jobs crawl the running period and the one before it", () => {
    expect(defaultJobPeriods(new Date(2026, 9, 2))).toEqual(["202609", "202610"]);
    expect(defaultJobPeriods(new Date(2026, 8, 27))).toEqual(["202609", "202610"]);
    expect(defaultJobPeriods(new Date(2027, 0, 3))).toEqual(["202612", "202701"]);
  });

  test("shiftPeriod crosses year boundaries", () => {
    expect(shiftPeriod("202601", -1)).toBe("202512");
    expect(shiftPeriod("202612", 1)).toBe("202701");
  });
});

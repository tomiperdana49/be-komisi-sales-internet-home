import { describe, expect, test } from "bun:test";
import { changedPeriods } from "./target-override.service";
import { calculateAchievement } from "../helper/commission.helper";
import { periodsBetween } from "../helper/period.helper";
import { DEFAULT_COMMISSION_RULES } from "../helper/commission-rules.default";

const range = (target: number, startPeriod: string, endPeriod: string) => ({ target, startPeriod, endPeriod });

describe("periodsBetween", () => {
  test("is inclusive and crosses the year", () => {
    expect(periodsBetween("202611", "202702")).toEqual(["202611", "202612", "202701", "202702"]);
  });
  test("is empty when the end is before the start", () => {
    expect(periodsBetween("202612", "202610")).toEqual([]);
  });
});

describe("changedPeriods", () => {
  test("creating or deleting touches the whole range", () => {
    expect(changedPeriods(null, range(13, "202610", "202612"))).toEqual(["202610", "202611", "202612"]);
    expect(changedPeriods(range(13, "202610", "202611"), null)).toEqual(["202610", "202611"]);
  });
  test("ending a running override early only touches the dropped periods", () => {
    // Started before the current period: only 202611–202612 change, so it's allowed.
    expect(changedPeriods(range(13, "202608", "202612"), range(13, "202608", "202610"))).toEqual(["202611", "202612"]);
  });
  test("a new target touches every period of both ranges", () => {
    expect(changedPeriods(range(13, "202610", "202611"), range(14, "202611", "202612"))).toEqual(["202610", "202611", "202612"]);
  });
});

describe("achievement status with a manual target", () => {
  const rules = DEFAULT_COMMISSION_RULES; // default target 12, on target ≥12, bonus ≥15

  test("without one, the rules' thresholds apply", () => {
    expect(calculateAchievement(rules, "Permanent", 12).achievementStatus).toBe("Capai target");
  });
  test("target 13 moves on-target to 13 and the bonus threshold to 16", () => {
    expect(calculateAchievement(rules, "Permanent", 12, 13).achievementStatus).toBe("Tidak Capai target");
    expect(calculateAchievement(rules, "Permanent", 13, 13).achievementStatus).toBe("Capai target");
    expect(calculateAchievement(rules, "Permanent", 15, 13).achievementStatus).toBe("Capai target");
    expect(calculateAchievement(rules, "Permanent", 16, 13).achievementStatus).toBe("Capai target Bonus");
  });
});

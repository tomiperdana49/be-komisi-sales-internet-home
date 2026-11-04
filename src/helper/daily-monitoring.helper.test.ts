import { describe, expect, test } from "bun:test";
import { clampDay, daysBetween, paceOf, toDay } from "./daily-monitoring.helper";

describe("daysBetween", () => {
  test("includes both ends and crosses a month", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  test("a commission period has its calendar length", () => {
    expect(daysBetween("2026-10-26", "2026-11-25")).toHaveLength(31);
  });
});

describe("toDay", () => {
  test("accepts a driver Date or a string", () => {
    expect(toDay(new Date(2026, 10, 2))).toBe("2026-11-02");
    expect(toDay("2026-11-02 10:00:00")).toBe("2026-11-02");
  });
});

describe("clampDay", () => {
  test("keeps days inside the range and pulls the others to its edges", () => {
    expect(clampDay("2026-10-28", "2026-10-26", "2026-11-02")).toBe("2026-10-28");
    expect(clampDay("2026-10-11", "2026-10-26", "2026-11-02")).toBe("2026-10-26");
    expect(clampDay("2026-11-03", "2026-10-26", "2026-11-02")).toBe("2026-11-02");
  });
});

describe("paceOf", () => {
  test("team behind the even pace: the Santoso team on 2 Nov", () => {
    const pace = paceOf(8, 55, 8, 31);
    expect(pace.expected).toBeCloseTo(14.19, 2);
    expect(pace.neededPerDay).toBeCloseTo(47 / 23, 5);
    expect(pace.status).toBe("behind");
  });

  test("status bands", () => {
    expect(paceOf(10, 31, 10, 31).status).toBe("on_track");
    expect(paceOf(6, 31, 10, 31).status).toBe("slightly_behind");
    expect(paceOf(5, 31, 10, 31).status).toBe("behind");
  });

  test("no target to measure against", () => {
    expect(paceOf(3, 0, 10, 31).status).toBe("no_target");
  });

  test("target already reached needs nothing more", () => {
    expect(paceOf(60, 55, 20, 31).neededPerDay).toBe(0);
  });

  test("period finished has no days left to divide by", () => {
    const pace = paceOf(30, 55, 31, 31);
    expect(pace.neededPerDay).toBe(0);
    expect(pace.status).toBe("behind");
  });
});

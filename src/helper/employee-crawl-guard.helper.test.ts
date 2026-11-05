import { describe, expect, test } from "bun:test";
import { assertSafeDeactivation } from "./employee-crawl-guard.helper";

describe("assertSafeDeactivation", () => {
  test("an empty Nusawork response would deactivate everyone: refused", () => {
    expect(() => assertSafeDeactivation(102, 102, false)).toThrow("Dibatalkan");
  });

  test("a normal run with a few departures passes", () => {
    expect(() => assertSafeDeactivation(102, 0, false)).not.toThrow();
    expect(() => assertSafeDeactivation(102, 3, false)).not.toThrow();
  });

  test("the limit is 20% of active employees", () => {
    expect(() => assertSafeDeactivation(102, 21, false)).not.toThrow();
    expect(() => assertSafeDeactivation(102, 22, false)).toThrow("batas 21");
  });

  test("a small roster may still lose up to 5 people", () => {
    expect(() => assertSafeDeactivation(10, 5, false)).not.toThrow();
    expect(() => assertSafeDeactivation(10, 6, false)).toThrow("batas 5");
  });

  test("a person can force real mass departures through", () => {
    expect(() => assertSafeDeactivation(102, 102, true)).not.toThrow();
  });

  test("a first run on an empty database has nothing to deactivate", () => {
    expect(() => assertSafeDeactivation(0, 0, false)).not.toThrow();
  });
});

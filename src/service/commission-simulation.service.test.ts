import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { CommissionSimulationService } from "./commission-simulation.service";

const path = `${import.meta.dir}/../../.cache/test-commission-simulation-${process.pid}.json`;
afterEach(() => rmSync(path, { force: true }));

describe("Simulasi Komisi setting", () => {
  test("empty until saved, then everyone reads the saved percentages", async () => {
    const svc = new CommissionSimulationService(path);
    expect(await svc.get()).toEqual({ newPct: null, oldPct: null });
    await svc.save("Tomi@nusa.id", { newPct: 30, oldPct: "90" });
    expect(await svc.get()).toEqual({ newPct: 30, oldPct: 90 });
  });

  test("only the listed account may change it", async () => {
    const svc = new CommissionSimulationService(path);
    await expect(svc.save("sales@nusa.id", { newPct: 30 })).rejects.toThrow();
    expect(await svc.get()).toEqual({ newPct: null, oldPct: null });
  });

  test("rejects percentages outside 0–100; blank clears", async () => {
    const svc = new CommissionSimulationService(path);
    await expect(svc.save("tomi@nusa.id", { newPct: 120 })).rejects.toThrow();
    await svc.save("tomi@nusa.id", { newPct: 30, oldPct: 50 });
    await svc.save("tomi@nusa.id", { newPct: "", oldPct: null });
    expect(await svc.get()).toEqual({ newPct: null, oldPct: null });
  });
});

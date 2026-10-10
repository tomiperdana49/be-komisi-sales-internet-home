import { describe, expect, test } from "bun:test";
import { ChurnService } from "./churn.service";
import type { ChurnApprovalState, IChurnRepository, WaiverLogCallRow } from "../interface/churn.interface";

const block = (csId: number, account: string, churn: boolean) =>
  `Acc\ndetail:\nService ID ${csId}\nAccount Name ${account}\nChurn = ${churn}\n\nSubject\nPengajuan`;

function setup(logCalls: WaiverLogCallRow[], states: ChurnApprovalState[]) {
  const calls: string[] = [];
  const repo = {
    findFromBilling: async () => [],
    upsert: async () => {},
    findLocalCsIdsInRange: async () => states.map((s) => s.customer_service_id),
    deleteByCsIds: async () => {},
    findWaiverLogCalls: async () => logCalls,
    findApprovalStatesInRange: async () => states,
    setLogCallWaiver: async (csId: number, w: { logCallId: number; note: string }) => {
      calls.push(`set ${csId} #${w.logCallId} ${w.note}`);
    },
    clearLogCallWaiver: async (csId: number) => {
      calls.push(`clear ${csId}`);
    },
  } as unknown as IChurnRepository;
  return { service: new ChurnService(repo), calls };
}

const logCall = (id: number, text: string): WaiverLogCallRow => ({
  log_call_id: id,
  emp_id: "0200925",
  posted: new Date("2026-10-08"),
  text,
});
const state = (csId: number, account: string, approved = false, logCallId: number | null = null): ChurnApprovalState => ({
  customer_service_id: csId,
  customer_service_account: account,
  is_approved: approved ? 1 : 0,
  approval_log_call_id: logCallId,
});

describe("ChurnService log-call waivers", () => {
  test("waives a churn whose Service ID and Account Name match", async () => {
    const { service, calls } = setup([logCall(332451, block(72879, "pujifre", false))], [state(72879, "pujifre")]);
    const result = await service.syncFromBilling(["BFLITE"], "2026-09-26", "2026-10-25");
    expect(result.waived).toBe(1);
    expect(calls).toEqual(["set 72879 #332451 Log Call #332451: Acc"]);
  });

  test("ignores a block whose Account Name doesn't match", async () => {
    const { service, calls } = setup([logCall(1, block(72879, "salah", false))], [state(72879, "pujifre")]);
    await service.syncFromBilling(["BFLITE"], "2026-09-26", "2026-10-25");
    expect(calls).toEqual([]);
  });

  test("never touches a waiver made by hand", async () => {
    const { service, calls } = setup([logCall(1, block(72879, "pujifre", true))], [state(72879, "pujifre", true)]);
    await service.syncFromBilling(["BFLITE"], "2026-09-26", "2026-10-25");
    expect(calls).toEqual([]);
  });

  test("a later Churn = true lifts a log-call waiver", async () => {
    const { service, calls } = setup(
      [logCall(1, block(72879, "pujifre", false)), logCall(2, block(72879, "pujifre", true))],
      [state(72879, "pujifre", true, 1)],
    );
    const result = await service.syncFromBilling(["BFLITE"], "2026-09-26", "2026-10-25");
    expect(result.reinstated).toBe(1);
    expect(calls).toEqual(["clear 72879"]);
  });

  test("leaves an already-applied waiver alone", async () => {
    const { service, calls } = setup([logCall(1, block(72879, "pujifre", false))], [state(72879, "pujifre", true, 1)]);
    await service.syncFromBilling(["BFLITE"], "2026-09-26", "2026-10-25");
    expect(calls).toEqual([]);
  });
});

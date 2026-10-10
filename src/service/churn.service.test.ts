import { describe, expect, test } from "bun:test";
import { ChurnService } from "./churn.service";
import type { ChurnApprovalState, IChurnRepository, WaiverLogCallRow } from "../interface/churn.interface";

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

const logCall = (id: number, customerId: string, approverPart: string): WaiverLogCallRow => ({
  log_call_id: id,
  emp_id: "0200925",
  customer_id: customerId,
  posted: new Date("2026-10-08"),
  text: `${approverPart}\n\nSubject\nPengajuan\nDescription\nMohon bantu`,
});
const state = (
  csId: number,
  customerId: string,
  account: string,
  approved = false,
  logCallId: number | null = null,
): ChurnApprovalState => ({
  customer_service_id: csId,
  customer_id: customerId,
  customer_service_account: account,
  is_approved: approved ? 1 : 0,
  approval_log_call_id: logCallId,
});
const sync = (service: ChurnService) => service.syncFromBilling(["BFLITE"], "2026-09-26", "2026-10-25");

describe("ChurnService log-call waivers", () => {
  test("Churn = false waives the log call's customer's churn", async () => {
    const { service, calls } = setup(
      [logCall(332451, "0200397826", "Acc Form reverse\nChurn = false")],
      [state(72879, "0200397826", "pujifre"), state(72880, "0200397923", "indahjv3")],
    );
    expect((await sync(service)).waived).toBe(1);
    expect(calls).toEqual(["set 72879 #332451 Log Call #332451: Acc Form reverse"]);
  });

  test("account names narrow it to those services", async () => {
    const { service, calls } = setup(
      [logCall(1, "0200595271", "Acc\nChurn = false sitijlse")],
      [state(1, "0200595271", "sitijlsd"), state(2, "0200595271", "sitijlse")],
    );
    await sync(service);
    expect(calls).toEqual(["set 2 #1 Log Call #1: Acc"]);
  });

  test("an account of another customer is ignored", async () => {
    const { service, calls } = setup(
      [logCall(1, "0200397826", "Acc\nChurn = false indahjv3")],
      [state(72880, "0200397923", "indahjv3")],
    );
    await sync(service);
    expect(calls).toEqual([]);
  });

  test("a line in the AM's quoted request also counts", async () => {
    const { service, calls } = setup(
      [{ ...logCall(1, "0200397826", "Acc Form reverse"), text: "Acc Form reverse\nSubject\nChurn = false pujifre" }],
      [state(72879, "0200397826", "pujifre")],
    );
    await sync(service);
    expect(calls).toEqual(["set 72879 #1 Log Call #1: Acc Form reverse"]);
  });

  test("never touches a waiver made by hand", async () => {
    const { service, calls } = setup(
      [logCall(1, "0200397826", "Acc\nChurn = true")],
      [state(72879, "0200397826", "pujifre", true)],
    );
    await sync(service);
    expect(calls).toEqual([]);
  });

  test("a later Churn = true lifts a log-call waiver", async () => {
    const { service, calls } = setup(
      [logCall(1, "0200397826", "Acc\nChurn = false"), logCall(2, "0200397826", "Batal\nChurn = true")],
      [state(72879, "0200397826", "pujifre", true, 1)],
    );
    expect((await sync(service)).reinstated).toBe(1);
    expect(calls).toEqual(["clear 72879"]);
  });

  test("leaves an already-applied waiver alone", async () => {
    const { service, calls } = setup(
      [logCall(1, "0200397826", "Acc\nChurn = false")],
      [state(72879, "0200397826", "pujifre", true, 1)],
    );
    await sync(service);
    expect(calls).toEqual([]);
  });
});

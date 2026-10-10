import { describe, expect, test } from "bun:test";
import { approverSection, parseChurnDirectives } from "./churn-waiver.helper";

const logCall = (approver: string, request = "Pengajuan tidak potong churn") =>
  `${approver}\r\n\r\nSubject\r\n${request}\r\nDescription\r\nMohon bantu approve\r\nCreated On\r\n05/10/2026 - 15:47 by AM`;

describe("parseChurnDirectives", () => {
  test("reads a bare Churn = false in the approver's section", () => {
    expect(parseChurnDirectives(logCall("Acc Form reverse\r\nChurn = false"))).toEqual([
      { churn: false, accounts: [] },
    ]);
  });

  test("reads account names after the value", () => {
    expect(parseChurnDirectives("Acc\nChurn = false pujifre\nchurn: TRUE sitijlsd, sitijlse")).toEqual([
      { churn: false, accounts: ["pujifre"] },
      { churn: true, accounts: ["sitijlsd", "sitijlse"] },
    ]);
  });

  test("tolerates casing and spacing", () => {
    expect(parseChurnDirectives("  churn=FALSE  ")).toEqual([{ churn: false, accounts: [] }]);
  });

  test("ignores a line inside the AM's quoted request", () => {
    expect(parseChurnDirectives(logCall("Acc Form reverse", "Pengajuan\r\nChurn = false"))).toEqual([]);
  });

  test("ignores prose that merely mentions churn", () => {
    expect(parseChurnDirectives("Acc permohonan penghapusan churn dari dashbord")).toEqual([]);
    expect(parseChurnDirectives("Acc\nChurn = maybe")).toEqual([]);
  });
});

describe("approverSection", () => {
  test("is the whole text when there is no quoted request", () => {
    expect(approverSection("Acc\nChurn = false")).toBe("Acc\nChurn = false");
  });
});

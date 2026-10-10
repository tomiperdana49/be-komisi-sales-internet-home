import { describe, expect, test } from "bun:test";
import { approverSection, parseChurnWaiverBlocks } from "./churn-waiver.helper";

const logCall = (approver: string, request = "Pengajuan tidak potong churn") =>
  `${approver}\r\n\r\nSubject\r\n${request}\r\nDescription\r\nMohon bantu approve\r\nCreated On\r\n05/10/2026 - 15:47 by AM`;

describe("parseChurnWaiverBlocks", () => {
  test("reads a waiver block in the approver's section", () => {
    const text = logCall("Acc Form reverse\r\n\r\ndetail:\r\n    Service ID 72879\r\n    Account Name pujifre\r\n    Churn = false");
    expect(parseChurnWaiverBlocks(text)).toEqual([
      { customerServiceId: 72879, accountName: "pujifre", churn: false },
    ]);
  });

  test("reads several blocks and Churn = true", () => {
    const text = logCall(
      "Acc\ndetail:\nService ID 72879\nAccount Name pujifre\nChurn = false\n\ndetail:\nService ID 72880\nAccount Name indahjv3\nChurn = true",
    );
    expect(parseChurnWaiverBlocks(text)).toEqual([
      { customerServiceId: 72879, accountName: "pujifre", churn: false },
      { customerServiceId: 72880, accountName: "indahjv3", churn: true },
    ]);
  });

  test("tolerates casing, colons and spacing", () => {
    const text = "Acc\nDETAIL\n  service id: 72879\n  account name: pujifre\n  churn=FALSE";
    expect(parseChurnWaiverBlocks(text)).toEqual([
      { customerServiceId: 72879, accountName: "pujifre", churn: false },
    ]);
  });

  test("ignores a block inside the AM's quoted request", () => {
    const text = logCall("Acc Form reverse", "Pengajuan\r\ndetail:\r\nService ID 72879\r\nAccount Name pujifre\r\nChurn = false");
    expect(parseChurnWaiverBlocks(text)).toEqual([]);
  });

  test("skips incomplete blocks", () => {
    expect(parseChurnWaiverBlocks("Acc\ndetail:\nService ID 72879\nChurn = false")).toEqual([]);
    expect(parseChurnWaiverBlocks("Acc permohonan penghapusan churn")).toEqual([]);
  });
});

describe("approverSection", () => {
  test("is the whole text when there is no quoted request", () => {
    expect(approverSection("Acc\nChurn = false")).toBe("Acc\nChurn = false");
  });
});

import { describe, expect, test } from "bun:test";
import { NewCustomerService, activationCommissionDate, afterClosingDate, isPaidInPeriod } from "./new-customer.service";
import { getDateRangeForPeriod } from "../helper/period.helper";

describe("isPaidInPeriod", () => {
  const { start, end } = getDateRangeForPeriod("202610");

  test("counts a payment made within the period", () => {
    expect(isPaidInPeriod("2026-09-26", start, end)).toBe(true);
    expect(isPaidInPeriod("2026-10-25", start, end)).toBe(true);
    expect(isPaidInPeriod(new Date(2026, 9, 25, 23, 59), start, end)).toBe(true);
  });

  test("an invoice paid before the period (invoiced later) counts in its payment's period, not again here", () => {
    expect(isPaidInPeriod("2026-09-22", start, end)).toBe(false);
  });

  test("a payment after the period or without a date doesn't count", () => {
    expect(isPaidInPeriod("2026-10-26", start, end)).toBe(false);
    expect(isPaidInPeriod(null, start, end)).toBe(false);
    expect(isPaidInPeriod("not a date", start, end)).toBe(false);
  });
});

describe("activationCommissionDate", () => {
  const oct = getDateRangeForPeriod("202610");
  const nov = getDateRangeForPeriod("202611");
  const countsIn = (d: unknown, range: { start: Date; end: Date }) => isPaidInPeriod(d, range.start, range.end);

  test("paid in October, activated in November: counts in November only", () => {
    const d = activationCommissionDate("2026-10-16", "2026-11-03", false);
    expect(countsIn(d, oct)).toBe(false);
    expect(countsIn(d, nov)).toBe(true);
  });

  test("activated before or on the payment: counts on the payment", () => {
    expect(activationCommissionDate("2026-10-16", "2026-10-15", false)).toBe("2026-10-16");
    expect(activationCommissionDate("2026-10-25", "2026-10-25", false)).toBe("2026-10-25");
  });

  test("never activated yet (BL, no Activation recorded): doesn't count yet", () => {
    expect(activationCommissionDate("2026-10-16", "2026-10-15", true)).toBeNull();
  });

  test("payments before the October 2026 period keep the payment date", () => {
    expect(activationCommissionDate("2026-09-22", "2026-10-03", false)).toBe("2026-09-22");
    expect(activationCommissionDate("2026-09-22", null, true)).toBe("2026-09-22");
  });

  test("no payment yet stays unpaid", () => {
    expect(countsIn(activationCommissionDate(null, "2026-10-03", false), oct)).toBe(false);
  });
});

describe("afterClosingDate", () => {
  const closed = new Map([["202610", new Date("2026-10-28T11:31:51")]]);

  test("invoice created after its period closed counts from its creation", () => {
    expect(afterClosingDate("2026-10-21", new Date("2026-11-03T09:44:38"), closed)).toEqual(new Date("2026-11-03T09:44:38"));
  });

  test("invoice created before the closing keeps its own date", () => {
    expect(afterClosingDate("2026-10-21", new Date("2026-10-23T10:00:00"), closed)).toBe("2026-10-21");
  });

  test("open period, or no commission date: unchanged", () => {
    expect(afterClosingDate("2026-11-05", new Date("2026-11-06T10:00:00"), closed)).toBe("2026-11-05");
    expect(afterClosingDate(null, new Date("2026-11-06T10:00:00"), closed)).toBeNull();
  });
});

describe("replacement services of an existing customer (EXISTING_CUSTOMER_SERVICES)", () => {
  const invoice = (csid: number, ai: number) => ({
    CID: "0200556398", CSID: String(csid), SG: "FBP", "Tanggal Invoice": "2026-11-20", "Tanggal Jatuh Tempo": "2026-11-27",
    "Period Start": "202612", "Period End": "202612", Bulan: 1, DPP: 297500, Paid: 1,
    "Tanggal Input Pembayaran": "2026-11-24", "Tanggal Transaksi Pembayaran": "2026-11-24",
    "New Subscription": 297500, Counter: 1, "Invoice Prorata": 0, Code: "", "Tagihan FO": 0, "Is Upgrade": 0,
    "Line Rental": 0, "AI Invoice": ai, "AI Receipt": ai + 1, "Tanggal Input Invoice": "2026-11-20", "Reseller Name": "",
  });
  const account = (csid: number) => ({
    CID: "0200556398", CSID: csid, "Nama Customer": "X", Company: "X", Account: `acc${csid}`, "Nama Service": "Broadband FO Home Premium Prepaid 100 Mbps",
    "Service Id": "PREMIUM100", Category: "FBP", "Awal Aktif": "2026-11-17", "Aktivasi Tercatat": "2026-11-17", "Bandwidth (Mbps)": 100,
    Vendor: null, "Line Rental": null, Cabang: "Medan", Sales: "Freddy", "Manager Sales": "M", CustStatus: "AC", "Branch ID": "020",
  });
  const service = new NewCustomerService(
    {
      findInvoices: async () => [invoice(102371, 1), invoice(999999, 3)],
      findAccounts: async () => [account(102371), account(999999)],
      findServices: async () => [],
      findSheetRows: async () => [],
    } as any,
    {} as any, {} as any, {} as any,
  );

  test("rizkijlt's first invoice is an existing customer's (renewal), another first invoice stays New", async () => {
    const rows = await service.fetchSnapshotInputs("202611");
    expect(rows.find((r) => r.aiInvoice === 1)?.isRenewal).toBe(true);
    expect(rows.find((r) => r.aiInvoice === 3)?.isRenewal).toBe(false);
  });
});

describe("unpaid invoice with a payment date (Paid = 0)", () => {
  const invoice = (ai: number, paid: number) => ({
    CID: "0200682229", CSID: "102258", SG: "FBP", "Tanggal Invoice": "2026-11-12", "Tanggal Jatuh Tempo": "2026-11-19",
    "Period Start": "202611", "Period End": "202611", Bulan: 1, DPP: 82500, Paid: paid,
    "Tanggal Input Pembayaran": null, "Tanggal Transaksi Pembayaran": "2026-11-13",
    "New Subscription": 82500, Counter: 0, "Invoice Prorata": 1, Code: "", "Tagihan FO": 0, "Is Upgrade": 0,
    "Line Rental": 0, "AI Invoice": ai, "AI Receipt": null, "Tanggal Input Invoice": "2026-11-12", "Reseller Name": "",
  });
  const account = {
    CID: "0200682229", CSID: 102258, "Nama Customer": "X", Company: "X", Account: "arifjlb", "Nama Service": "Broadband FO Home Lite 100 Mbps",
    "Service Id": "LITE100", Category: "FBP", "Awal Aktif": "2026-11-14", "Aktivasi Tercatat": "2026-11-14", "Bandwidth (Mbps)": 100,
    Vendor: null, "Line Rental": null, Cabang: "Medan", Sales: "Zailani", "Manager Sales": "M", CustStatus: "AC", "Branch ID": "020",
  };
  const service = new NewCustomerService(
    {
      findInvoices: async () => [invoice(2050367, 0), invoice(2050999, 1)],
      findAccounts: async () => [account],
      findServices: async () => [],
      findSheetRows: async () => [],
    } as any,
    {} as any, {} as any, {} as any,
  );

  test("isn't counted as paid; the batched one is", async () => {
    const rows = await service.fetchSnapshotInputs("202611");
    expect(rows.find((r) => r.aiInvoice === 2050367)?.paid).toBe(0);
    expect(rows.find((r) => r.aiInvoice === 2050999)?.paid).toBe(1);
  });
});

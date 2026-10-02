import { afterEach, describe, expect, test } from "bun:test";
import { buildInvoiceType8Filter, OldCustomerRepository } from "./old-customer.repository";
import { oldCustomerConfig } from "../config/old-customer.config";

// Records what would be sent to the billing DB — nothing is ever executed.
function recordingRepository() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const billingDb = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return [];
    },
  };
  return { repo: new OldCustomerRepository(billingDb as any, {} as any), calls };
}

const configuredIds = [...oldCustomerConfig.includeInvoiceType8CustomerIds];
afterEach(() => {
  oldCustomerConfig.includeInvoiceType8CustomerIds = [...configuredIds];
});

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;
const dateParams = ["202610", "2026-09-26", "2026-10-25", "2026-09-26", "2026-10-25", "2026-09-26", "2026-10-25"];

describe("old-customer invoice query", () => {
  test("InvoiceType 8 is skipped entirely when no customers are configured", async () => {
    const { repo, calls } = recordingRepository();
    oldCustomerConfig.includeInvoiceType8CustomerIds = [];
    await repo.findInvoices(dateParams);

    expect(calls[0]!.sql).toContain("(cit.InvoiceType = 8 AND FALSE)");
    expect(placeholders(calls[0]!.sql)).toBe(calls[0]!.params.length);
  });

  test("configured customers are bound as a parameter, after the date params", async () => {
    const { repo, calls } = recordingRepository();
    oldCustomerConfig.includeInvoiceType8CustomerIds = ["C001", "C'002"];
    await repo.findInvoices(dateParams);

    const { sql, params } = calls[0]!;
    expect(sql).toContain("(cit.InvoiceType = 8 AND cit.CustId IN (?))");
    expect(sql).not.toContain("C001");
    expect(params).toEqual([...dateParams, ["C001", "C'002"]]);
    expect(placeholders(sql)).toBe(params.length);
    expect(sql).not.toContain("{{");
  });

  test("matches the Apps Script query: no DO/IP filter, period description selected", async () => {
    const { repo, calls } = recordingRepository();
    await repo.findInvoices(dateParams);
    expect(calls[0]!.sql).not.toContain("NOT IN ('DO', 'IP')");
    expect(calls[0]!.sql).toContain("cit.PeriodDescription `Invoice Period Description`");
  });

  test("filter builder", () => {
    expect(buildInvoiceType8Filter([])).toEqual({ sql: "FALSE", params: [] });
    expect(buildInvoiceType8Filter(["A"])).toEqual({ sql: "cit.CustId IN (?)", params: [["A"]] });
  });
});

describe("other old-customer queries", () => {
  test("account query brings reseller, WHMCS and the account's category", async () => {
    const { repo, calls } = recordingRepository();
    await repo.findAccounts();
    const sql = calls[0]!.sql;
    for (const col of ["`Reseller`", "`WHMCS`", "`Category`", "`Nama Service Account`"]) expect(sql).toContain(col);
    expect(sql).toContain("LEFT JOIN Reseller r ON r.Id = c.ResellerId");
  });

  test("transferred customers are looked up by bound sales ID", async () => {
    const { repo, calls } = recordingRepository();
    await repo.findTransferredCustomerIds("0202613");
    expect(calls[0]).toEqual({ sql: "SELECT cust_id FROM transfer_customers WHERE initial_sales = ?", params: ["0202613"] });
  });
});

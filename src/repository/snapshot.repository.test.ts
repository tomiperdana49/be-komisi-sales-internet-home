import { describe, expect, test } from "bun:test";
import { SnapshotRepository } from "./snapshot.repository";

describe("replaceForPeriod", () => {
  test("re-applies admin approvals to the re-crawled rows", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const txQuery = async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("is_adjusted = TRUE")) return [];
      if (sql.includes("is_approved = TRUE") && sql.startsWith("SELECT")) return [{ ai_invoice: 1965415, type: "recurring" }];
      return [];
    };
    const db = { withTransaction: (fn: any) => fn(txQuery) };
    const repo = new SnapshotRepository(db as any);

    await repo.replaceForPeriod("202609", [["202609", 1965415]], ["recurring"]);

    const update = calls.find((c) => c.sql.startsWith("UPDATE snapshots SET is_approved = TRUE"));
    expect(update?.params).toEqual(["202609", 1965415, "recurring"]);
    // The approval is restored only after the fresh rows are inserted.
    expect(calls.findIndex((c) => c.sql.startsWith("INSERT"))).toBeLessThan(calls.indexOf(update!));
  });
});

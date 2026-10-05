import { describe, expect, test } from "bun:test";
import { BillingDatabase, isTransientDbError } from "./billing-database";

const fakePool = (failures: unknown[]) => {
  let calls = 0;
  return {
    get calls() { return calls; },
    query: async () => {
      const failure = failures[calls++];
      if (failure) throw failure;
      return [[{ ok: 1 }], []];
    },
    end: async () => {},
  } as any;
};

const connectionLost = Object.assign(new Error("Connection lost: The server closed the connection."), {
  code: "PROTOCOL_CONNECTION_LOST",
  fatal: true,
});

describe("NIS query retry", () => {
  test("retries a dropped connection and returns the result", async () => {
    const pool = fakePool([connectionLost, connectionLost]);
    const db = new BillingDatabase(pool, [0, 0, 0]);
    expect(await db.query<unknown[]>("SELECT 1")).toEqual([{ ok: 1 }]);
    expect(pool.calls).toBe(3);
  });

  test("gives up after the last retry", async () => {
    const pool = fakePool([connectionLost, connectionLost, connectionLost]);
    const db = new BillingDatabase(pool, [0, 0]);
    await expect(db.query("SELECT 1")).rejects.toThrow("Connection lost");
    expect(pool.calls).toBe(3);
  });

  test("does not retry SQL errors", async () => {
    const sqlError = Object.assign(new Error("You have an error in your SQL syntax"), { code: "ER_PARSE_ERROR" });
    const pool = fakePool([sqlError]);
    const db = new BillingDatabase(pool, [0, 0]);
    await expect(db.query("SELEC 1")).rejects.toThrow("SQL syntax");
    expect(pool.calls).toBe(1);
  });

  test("recognises network failures", () => {
    expect(isTransientDbError({ code: "ENOTFOUND" })).toBe(true);
    expect(isTransientDbError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientDbError({ code: "ER_NO_SUCH_TABLE" })).toBe(false);
  });
});

import { describe, expect, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { errorHandler } from "./error-handler.middleware";
import { BadRequestException } from "../exception/http.exception";

const app = new Hono();
app.onError(errorHandler);
app.get("/sql", () => {
  throw new Error("Table 'komisi_internet_home_v2.commission_rule_set' doesn't exist");
});
app.get("/bad", () => {
  throw new BadRequestException("Periode berlaku tidak boleh sebelum periode berjalan");
});

describe("error responses", () => {
  test("unexpected errors don't leak internals, but are logged with the same reference", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    const res = await app.request("/sql");
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("komisi_internet_home_v2");
    const ref = String(body.error).replace("Kode referensi: ", "");
    expect(ref).toMatch(/^[0-9a-f]{8}$/);
    expect(String(log.mock.calls[0]![0])).toContain(ref);
    expect(String(log.mock.calls[0]![1])).toContain("komisi_internet_home_v2");
    log.mockRestore();
  });

  test("messages written for the user still pass through", async () => {
    const res = await app.request("/bad");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe("Periode berlaku tidak boleh sebelum periode berjalan");
  });
});

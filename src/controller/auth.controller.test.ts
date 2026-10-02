import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { AuthController } from "./auth.controller";
import { errorHandler } from "../middleware/error-handler.middleware";
import { securityConfig } from "../config/security.config";
import { assertSessionActive } from "../helper/session.helper";

// Fake auth API: only "benar123" is correct. Nothing reaches the real AUTH_API_URL.
function app(validAfter: Map<string, number> = new Map()) {
  const authService = {
    verifyPassword: async (_id: string, password: string) => password === "benar123",
    generateTokens: async () => ({ accessToken: "a", refreshToken: "r" }),
    verifyAccessToken: async (t: string) => (t === "valid-access" ? { sub: "E1", iatMs: 100 } : Promise.reject(new Error("bad"))),
    verifyRefreshToken: async (t: string) => (t === "valid-refresh" ? { sub: "E1", iatMs: 100 } : Promise.reject(new Error("bad"))),
  };
  const employeeService = {
    findByEmployeeId: async (id: string) => ({ employee_id: id }),
    getTokensValidAfter: async (id: string) => validAfter.get(id) ?? null,
    setTokensValidAfter: async (id: string, s: number) => void validAfter.set(id, s),
  };
  const controller = new AuthController(authService as any, employeeService as any);
  const hono = new Hono();
  hono.onError(errorHandler);
  hono.post("/login", (c) => controller.login(c));
  hono.post("/logout", (c) => controller.logout(c));
  return { hono, validAfter, employeeService };
}
const login = (hono: Hono, employeeId: string, password: string) =>
  hono.request("/login", { method: "POST", body: JSON.stringify({ employeeId, password }), headers: { "Content-Type": "application/json" } });

describe("#6 login attempts are limited", () => {
  test(`an account is locked after ${securityConfig.login.maxFailuresPerAccount} wrong passwords`, async () => {
    const { hono } = app();
    for (let i = 0; i < securityConfig.login.maxFailuresPerAccount; i++) {
      expect((await login(hono, "LOCKME", "salah")).status).toBe(401);
    }
    const blocked = await login(hono, "LOCKME", "benar123"); // even the right password waits
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Other accounts are unaffected.
    expect((await login(hono, "OTHER", "benar123")).status).toBe(200);
  });

  test("a successful login clears earlier failures", async () => {
    const { hono } = app();
    for (let i = 0; i < securityConfig.login.maxFailuresPerAccount - 1; i++) await login(hono, "RESET", "salah");
    expect((await login(hono, "RESET", "benar123")).status).toBe(200);
    for (let i = 0; i < securityConfig.login.maxFailuresPerAccount - 1; i++) {
      expect((await login(hono, "RESET", "salah")).status).toBe(401);
    }
  });
});

describe("#7 logout revokes tokens", () => {
  test("logout with the access token voids older tokens; a fresh login keeps working", async () => {
    const { hono, validAfter, employeeService } = app();
    const res = await hono.request("/logout", { method: "POST", headers: { Authorization: "Bearer valid-access" } });
    expect(res.status).toBe(200);
    expect(validAfter.get("E1")).toBeGreaterThan(100);

    await expect(assertSessionActive(employeeService, { sub: "E1", iatMs: 100 })).rejects.toThrow("Sesi sudah berakhir");
    await expect(assertSessionActive(employeeService, { sub: "E1", iatMs: validAfter.get("E1")! })).resolves.toBeUndefined();
  });

  test("logout works with only a refresh token (access token expired)", async () => {
    const { hono, validAfter } = app();
    await hono.request("/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "valid-refresh" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(validAfter.has("E1")).toBe(true);
  });

  test("logout with no or invalid tokens still succeeds and revokes nothing", async () => {
    const { hono, validAfter } = app();
    expect((await hono.request("/logout", { method: "POST", headers: { Authorization: "Bearer junk" } })).status).toBe(200);
    expect(validAfter.size).toBe(0);
  });
});

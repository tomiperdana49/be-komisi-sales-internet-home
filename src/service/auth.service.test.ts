import { describe, expect, test } from "bun:test";
import { sign } from "hono/jwt";
import { AuthService } from "./auth.service";
import { authConfig } from "../config/auth.config";

authConfig.jwtSecret ??= "test-secret-for-unit-tests-only";
const service = new AuthService();
const employee = { employee_id: "0200001", manager_id: null, email: "a@nusa.id", job_position: "Account Manager" } as any;

describe("access vs refresh tokens", () => {
  test("each token only works for its own purpose", async () => {
    const { accessToken, refreshToken } = await service.generateTokens(employee);

    expect((await service.verifyAccessToken(accessToken)).sub).toBe("0200001");
    expect((await service.verifyRefreshToken(refreshToken)).sub).toBe("0200001");

    // A 7-day refresh token must not open the API, and an access token must not mint new tokens.
    await expect(service.verifyAccessToken(refreshToken)).rejects.toThrow();
    await expect(service.verifyRefreshToken(accessToken)).rejects.toThrow();
  });

  test("tokens from before the typ claim are rejected (users sign in again once)", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const legacy = await sign({ sub: "0200001", email: "a@nusa.id", exp }, authConfig.jwtSecret!);
    await expect(service.verifyAccessToken(legacy)).rejects.toThrow();
    await expect(service.verifyRefreshToken(legacy)).rejects.toThrow();
  });

  test("tampered or wrongly signed tokens are rejected", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const forged = await sign({ typ: "access", sub: "0200001", email: "a@nusa.id", exp }, "some-other-secret");
    await expect(service.verifyAccessToken(forged)).rejects.toThrow();
  });
});

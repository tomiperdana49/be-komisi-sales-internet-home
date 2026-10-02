import type { Context } from "hono";
import {
  BadRequestException,
  NotFoundException,
  TooManyRequestsException,
  UnauthorizedException,
} from "../exception/http.exception";
import { securityConfig } from "../config/security.config";
import { clientIp } from "../helper/client-ip.helper";
import { RateLimiter } from "../lib/rate-limiter";
import { assertSessionActive } from "../helper/session.helper";
import { successResponse } from "../helper/api-response.helper";
import { authConfig } from "../config/auth.config";
import type { IAuthService } from "../interface/auth.interface";
import type { IEmployeeService } from "../interface/employee.interface";

const { login } = securityConfig;
// Per account: failed passwords only, so a user typing it wrong a few times
// doesn't hurt anyone else. Per IP: every attempt, to slow guessing across accounts.
const accountFailures = new RateLimiter(login.maxFailuresPerAccount, login.windowMs);
const ipAttempts = new RateLimiter(login.maxAttemptsPerIp, login.windowMs);

export class AuthController {
  constructor(
    private readonly authService: IAuthService,
    private readonly employeeService: IEmployeeService,
  ) {}

  async login(c: Context) {
    const body = await c.req.json();
    const accountKey = `acct:${String(body.employeeId ?? "").trim().toLowerCase()}`;
    const ip = clientIp(c);
    const ipKey = ip ? `ip:${ip}` : null;

    const wait = Math.max(accountFailures.retryAfter(accountKey), ipKey ? ipAttempts.retryAfter(ipKey) : 0);
    if (wait > 0) {
      throw new TooManyRequestsException(
        `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`,
        wait,
      );
    }
    if (ipKey) ipAttempts.record(ipKey);

    const isValid = await this.authService.verifyPassword(body.employeeId, body.password);
    if (!isValid) {
      accountFailures.record(accountKey);
      throw new UnauthorizedException("Employee ID or password is not valid");
    }
    accountFailures.reset(accountKey);

    const employee = await this.employeeService.findByEmployeeId(body.employeeId);
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    const tokens = await this.authService.generateTokens(employee);
    return c.json(successResponse("Login successful", { ...tokens, user: employee }));
  }

  /**
   * Dev-only bypass: skips password verification, only checks the employee
   * exists. Disabled unless ALLOW_DEV_LOGIN=true — anywhere else it would let
   * anyone sign in as any employee, admins included.
   */
  async devLogin(c: Context) {
    if (!authConfig.allowDevLogin) {
      throw new NotFoundException("Not found");
    }
    const body = await c.req.json();
    const employee = await this.employeeService.findByEmployeeId(body.employeeId);
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    const tokens = await this.authService.generateTokens(employee);
    return c.json(successResponse("Login successful", { ...tokens, user: employee }));
  }

  async google(c: Context) {
    const body = await c.req.json();
    const payload = await this.authService.verifyGoogleCode(body.code);
    if (!payload) {
      throw new UnauthorizedException("Google verification failed");
    }

    const employee = await this.employeeService.findByEmail(payload.email);
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    const tokens = await this.authService.generateTokens(employee);
    return c.json(successResponse("Login successful", { ...tokens, user: employee }));
  }

  async refresh(c: Context) {
    const body = await c.req.json();
    const refreshToken = body.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException("Refresh token is required");
    }

    const payload = await this.authService.verifyRefreshToken(refreshToken);
    await assertSessionActive(this.employeeService, payload);
    const employee = await this.employeeService.findByEmail(payload.email);
    if (!employee) {
      throw new UnauthorizedException("User not found");
    }

    const tokens = await this.authService.generateTokens(employee);
    return c.json(successResponse("Token refreshed successfully", { ...tokens, user: employee }));
  }

  async me(c: Context) {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      throw new UnauthorizedException("Authorization header missing");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw new UnauthorizedException("Token missing");
    }

    const payload = await this.authService.verifyAccessToken(token);
    await assertSessionActive(this.employeeService, payload);
    const employee = await this.employeeService.findByEmail(payload.email);
    if (!employee) {
      throw new NotFoundException("User not found");
    }

    return c.json(successResponse("User retrieved successfully", employee));
  }

  /**
   * Revokes every token this employee holds (all devices) by moving their
   * cut-off to now. Works with whichever valid token the client still has —
   * the access token in the header, or the refresh token in the body. An
   * invalid or missing token still gets a 200: the client is logging out anyway.
   */
  async logout(c: Context) {
    const bearer = c.req.header("Authorization")?.split(" ")[1];
    const body = await c.req.json().catch(() => ({}));
    const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken : undefined;

    const payload =
      (bearer && (await this.authService.verifyAccessToken(bearer).catch(() => null))) ||
      (refreshToken && (await this.authService.verifyRefreshToken(refreshToken).catch(() => null))) ||
      null;
    if (payload) {
      await this.employeeService.setTokensValidAfter(payload.sub, Date.now());
    }
    return c.json(successResponse("Logout successful"));
  }
}

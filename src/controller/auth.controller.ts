import type { Context } from "hono";
import { BadRequestException, NotFoundException, UnauthorizedException } from "../exception/http.exception";
import { successResponse } from "../helper/api-response.helper";
import { authConfig } from "../config/auth.config";
import type { IAuthService } from "../interface/auth.interface";
import type { IEmployeeService } from "../interface/employee.interface";

export class AuthController {
  constructor(
    private readonly authService: IAuthService,
    private readonly employeeService: IEmployeeService,
  ) {}

  async login(c: Context) {
    const body = await c.req.json();
    const isValid = await this.authService.verifyPassword(body.employeeId, body.password);
    if (!isValid) {
      throw new UnauthorizedException("Employee ID or password is not valid");
    }

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
    const employee = await this.employeeService.findByEmail(payload.email);
    if (!employee) {
      throw new NotFoundException("User not found");
    }

    return c.json(successResponse("User retrieved successfully", employee));
  }

  async logout(c: Context) {
    // Stateless JWT logout — client is responsible for discarding the token.
    return c.json(successResponse("Logout successful"));
  }
}

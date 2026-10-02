import type { EmployeeDetail } from "./employee.interface";

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

/**
 * Both tokens are signed with the same secret, so each carries its kind: without it a
 * 7-day refresh token would pass as an access token, and an access token could mint
 * new tokens forever.
 */
export type TokenType = "access" | "refresh";

export type AccessTokenPayload = {
  typ: "access";
  sub: string;
  svp: number | null;
  email: string;
  role: string;
  iat: number;
  /** Issued-at in milliseconds — compared with the employee's tokens_valid_after (ms). */
  iatMs: number;
  exp: number;
};

export type RefreshTokenPayload = {
  typ: "refresh";
  sub: string;
  email: string;
  iat: number;
  iatMs: number;
  exp: number;
};

export interface IAuthService {
  /** Exchanges a Google OAuth authorization code for the signed-in user's verified email. */
  verifyGoogleCode(code: string): Promise<{ email: string } | null>;
  /** Checks employeeId/password against the external auth API. */
  verifyPassword(employeeId: string, password: string): Promise<boolean>;
  generateTokens(employee: EmployeeDetail): Promise<AuthTokens>;
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
  verifyRefreshToken(token: string): Promise<RefreshTokenPayload>;
}

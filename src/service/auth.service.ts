import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import { sign, verify } from "hono/jwt";
import { authConfig } from "../config/auth.config";
import { UnauthorizedException } from "../exception/http.exception";
import type {
  AccessTokenPayload,
  AuthTokens,
  IAuthService,
  RefreshTokenPayload,
  TokenType,
} from "../interface/auth.interface";
import type { EmployeeDetail } from "../interface/employee.interface";

export class AuthService implements IAuthService {
  private getOauth2Client(): OAuth2Client {
    return new OAuth2Client(
      authConfig.googleClientId,
      authConfig.googleClientSecret,
      "postmessage",
    );
  }

  async verifyGoogleCode(code: string): Promise<{ email: string } | null> {
    const oAuth2Client = this.getOauth2Client();
    const result = await oAuth2Client.getToken(code);
    const ticket = await oAuth2Client.verifyIdToken({
      idToken: result.tokens.id_token!,
      audience: authConfig.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) return null;
    return { email: payload.email };
  }

  async verifyPassword(employeeId: string, password: string): Promise<boolean> {
    try {
      const response = await axios.post(authConfig.authApiUrl!, {
        username: employeeId,
        password,
      });
      return response.status === 201;
    } catch (error) {
      // The auth API rejecting the credentials (4xx/5xx) means "not valid",
      // not a server-side failure — anything else (network down, etc.)
      // still propagates to the global error handler.
      if (axios.isAxiosError(error) && error.response) {
        return false;
      }
      throw error;
    }
  }

  async generateTokens(employee: EmployeeDetail): Promise<AuthTokens> {
    const issuedAtMs = Date.now();
    const now = Math.floor(issuedAtMs / 1000);

    const accessTokenPayload: AccessTokenPayload = {
      typ: "access",
      sub: employee.employee_id,
      svp: employee.manager_id,
      email: employee.email,
      role: employee.job_position,
      iat: now,
      iatMs: issuedAtMs,
      exp: now + 60 * 15, // 15 minutes
    };
    const refreshTokenPayload: RefreshTokenPayload = {
      typ: "refresh",
      sub: employee.employee_id,
      email: employee.email,
      iat: now,
      iatMs: issuedAtMs,
      exp: now + 60 * 60 * 24 * 7, // 7 days
    };

    const accessToken = await sign(accessTokenPayload, authConfig.jwtSecret!);
    const refreshToken = await sign(refreshTokenPayload, authConfig.jwtSecret!);

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.verifyTyped(token, "access");
    if (!payload) throw new UnauthorizedException("Invalid or expired token");
    return payload as unknown as AccessTokenPayload;
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const payload = await this.verifyTyped(token, "refresh");
    if (!payload) throw new UnauthorizedException("Invalid refresh token");
    return payload as unknown as RefreshTokenPayload;
  }

  /**
   * Valid signature, not expired, AND the expected kind. Tokens issued before the
   * `typ` claim existed have none, so they're rejected and the user signs in again once.
   */
  private async verifyTyped(token: string, type: TokenType): Promise<Record<string, unknown> | null> {
    try {
      const payload = (await verify(token, authConfig.jwtSecret!, "HS256")) as Record<string, unknown>;
      return payload.typ === type ? payload : null;
    } catch {
      return null;
    }
  }
}

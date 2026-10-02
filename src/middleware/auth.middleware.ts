import type { Context, Next } from "hono";
import { container } from "../container";
import { UnauthorizedException } from "../exception/http.exception";
import { assertSessionActive } from "../helper/session.helper";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    throw new UnauthorizedException("Authorization header missing");
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    throw new UnauthorizedException("Token missing");
  }

  const payload = await container.authService.verifyAccessToken(token);
  await assertSessionActive(container.employeeService, payload);
  c.set("user", payload);
  await next();
}

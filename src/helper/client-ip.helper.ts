import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { securityConfig } from "../config/security.config";

/**
 * The caller's IP for rate limiting, or null when it can't be trusted to tell
 * users apart (e.g. behind a proxy without TRUST_PROXY, where every request
 * comes from the proxy's own address — limiting that would lock everyone out).
 */
export function clientIp(c: Context): string | null {
  if (securityConfig.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  let address: string | undefined;
  try {
    address = getConnInfo(c).remote.address;
  } catch {
    return null;
  }
  if (!address) return null;
  const loopback = address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
  return loopback && !securityConfig.trustProxy ? null : address;
}

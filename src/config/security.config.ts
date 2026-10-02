const list = (value: string | undefined) =>
  (value ?? "").split(",").map((v) => v.trim().replace(/\/$/, "")).filter(Boolean);

export const securityConfig = {
  /**
   * Browser origins allowed to call the API (the frontend's URL), comma-separated,
   * e.g. CORS_ORIGINS=https://komisi.nusa.id. Must be set in production.
   */
  corsOrigins: list(process.env.CORS_ORIGINS),
  /**
   * Behind a reverse proxy every request arrives from the proxy's address; set
   * TRUST_PROXY=true so the client IP is read from X-Forwarded-For instead. Only
   * enable it when a proxy you control sets that header.
   */
  trustProxy: process.env.TRUST_PROXY === "true",
  login: {
    /** Failed password attempts per employee ID before that ID is locked out for the window. */
    maxFailuresPerAccount: 5,
    /** Login attempts (any outcome) per client IP per window. */
    maxAttemptsPerIp: 30,
    windowMs: 15 * 60 * 1000,
  },
};

/**
 * In-memory fixed-window counter. Fine for this single-process server; state
 * resets on restart, which only ever errs toward letting someone retry.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Seconds until `key` may try again, or 0 if it's still under the limit. */
  retryAfter(key: string): number {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= Date.now()) return 0;
    return entry.count >= this.limit ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
  }

  record(key: string): void {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number) {
    if (this.hits.size < 10_000) return;
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

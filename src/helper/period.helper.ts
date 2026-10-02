function getPeriodArg(): string | null {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--period" || arg === "-p") return args[i + 1] ?? null;
    if (arg?.startsWith("--period=")) return arg.slice("--period=".length);
  }
  return null;
}

/** Resolves the target period (YYYYMM) from --period/-p, defaulting to the current month. */
export function resolvePeriod(): string {
  const periodArg = getPeriodArg();
  if (periodArg) {
    if (!/^\d{6}$/.test(periodArg)) {
      throw new Error(
        `Format --period harus YYYYMM, contoh: 202608 (diterima: "${periodArg}")`,
      );
    }
    return periodArg;
  }

  return currentPeriod();
}

/** The current calendar month as YYYYMM — the period the hourly jobs crawl by default. */
export function currentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

/**
 * The billing cycle runs the 26th of the previous month through the 25th
 * of the target period, mirroring the Apps Script's getStartDate/getEndDate.
 * Shared by both the new-customer and old-customer DB transforms.
 */
export function getDateRangeForPeriod(period: string): { start: Date; end: Date } {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));

  const start = new Date(year, month - 2, 26, 0, 0, 0, 0);
  const end = new Date(year, month - 1, 25, 23, 59, 59, 0);

  return { start, end };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats a Date as a local (not UTC) YYYY-MM-DD string, for MySQL DATE params. */
export function toSqlDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

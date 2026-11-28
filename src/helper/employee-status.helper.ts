/** Signing less than this many days after a period starts still counts as Permanent for that period. */
const SIGNING_GRACE_DAYS = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Employment status recorded for a commission period starting on
 * `periodStart` (YYYY-MM-DD). Nusawork only gives today's status, so someone
 * made Permanent later in a period (sign_date 10 or more days after its start,
 * e.g. signed 22 Oct for a period from 26 Sep) is still Probation for that period
 * and Permanent from the next.
 */
export function statusForPeriod(status: string, signDate: string | null | undefined, periodStart: string): string {
  if (status === "Permanent" && signDate) {
    const daysAfterStart = (Date.parse(signDate.slice(0, 10)) - Date.parse(periodStart)) / MS_PER_DAY;
    if (daysAfterStart >= SIGNING_GRACE_DAYS) return "Probation";
  }
  return status;
}

/**
 * Whether someone who joined on `joinDate` (YYYY-MM-DD) belongs in the period
 * ending `periodEnd`: not when they joined after it ended. Example: Rahmad
 * Syafrizal joined 26 Nov 2026, the first day of the December period, so he
 * gets no November status row (and doesn't join a team's November count).
 */
export function joinedByPeriodEnd(joinDate: string | null | undefined, periodEnd: string): boolean {
  if (!joinDate) return true;
  return joinDate.slice(0, 10) <= periodEnd.slice(0, 10);
}

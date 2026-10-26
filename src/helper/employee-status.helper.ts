/**
 * Employment status recorded for a commission period starting on
 * `periodStart` (YYYY-MM-DD). Nusawork only gives today's status, so someone
 * made Permanent during a period (sign_date after its start, e.g. signed
 * 22 Oct) is still Probation for that period and Permanent from the next.
 */
export function statusForPeriod(status: string, signDate: string | null | undefined, periodStart: string): string {
  if (status === "Permanent" && signDate && signDate.slice(0, 10) > periodStart) return "Probation";
  return status;
}

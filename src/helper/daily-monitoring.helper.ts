import { toSqlDate } from "./period.helper";

export type PaceStatus = "on_track" | "slightly_behind" | "behind" | "no_target";

/** At or above this share of the expected activity a team is still in reach: "slightly behind", not "behind". */
const SLIGHTLY_BEHIND_FROM = 0.6;

/** Every day from start to end, both included, as YYYY-MM-DD. */
export function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (const d = new Date(`${start}T00:00:00`); toSqlDate(d) <= end; d.setDate(d.getDate() + 1)) {
    days.push(toSqlDate(d));
  }
  return days;
}

/** The day a database date falls on, as YYYY-MM-DD (the driver may return a Date or a string). */
export function toDay(value: Date | string): string {
  return value instanceof Date ? toSqlDate(value) : String(value).slice(0, 10);
}

/**
 * Where a day lands on the chart: paid before the period started counts on its first day, and
 * anything after the last day with data counts on that day, so the final point equals the period total.
 */
export function clampDay(day: string, start: string, until: string): string {
  if (day < start) return start;
  return day > until ? until : day;
}

/** How activity compares with an even pace to the target over the period. */
export function paceOf(activity: number, target: number, daysElapsed: number, daysTotal: number) {
  const expected = daysTotal > 0 ? (target * daysElapsed) / daysTotal : 0;
  const daysLeft = Math.max(daysTotal - daysElapsed, 0);
  const neededPerDay = daysLeft > 0 ? Math.max(target - activity, 0) / daysLeft : 0;

  let status: PaceStatus;
  if (target <= 0) status = "no_target";
  else if (activity >= expected) status = "on_track";
  else if (activity >= expected * SLIGHTLY_BEHIND_FROM) status = "slightly_behind";
  else status = "behind";

  return { expected, neededPerDay, status };
}

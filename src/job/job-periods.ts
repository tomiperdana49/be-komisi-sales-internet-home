import { container } from "../container";
import { defaultJobPeriods, explicitJobPeriod, hasForceArg } from "../helper/period.helper";

/**
 * Periods this run should crawl. With --period: just that one, refused when
 * it's closed unless --force. Without: the running period and the one
 * before it (late finance input), minus closed ones.
 */
export async function resolveJobPeriods(): Promise<string[]> {
  const explicit = explicitJobPeriod();
  if (explicit) {
    if (!hasForceArg() && (await container.periodClosingService.isClosed(explicit))) {
      console.log(`Periode ${explicit} sudah ditutup — dilewati (pakai --force untuk tetap menarik).`);
      return [];
    }
    return [explicit];
  }
  return container.periodClosingService.filterOpen(defaultJobPeriods());
}

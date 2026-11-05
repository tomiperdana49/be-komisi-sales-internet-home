/** A crawl may deactivate up to this many people, or this share of active employees if that is more. */
const MIN_DEACTIVATION_LIMIT = 5;
const MAX_DEACTIVATION_SHARE = 0.2;

export const FORCE_DEACTIVATE_ARG = "--force-deactivate";

/**
 * Inactive employees can't sign in, so a Nusawork response that comes back empty or
 * partial (an error payload, a renamed "VP Internet Access Home") must not lock
 * everyone out. Too many departures in one run fails the job instead; when they are
 * real, a person re-runs it with --force-deactivate.
 */
export function assertSafeDeactivation(activeCount: number, deactivateCount: number, force: boolean): void {
  const limit = Math.max(MIN_DEACTIVATION_LIMIT, Math.ceil(activeCount * MAX_DEACTIVATION_SHARE));
  if (deactivateCount > limit && !force) {
    throw new Error(
      `Crawl akan menonaktifkan ${deactivateCount} dari ${activeCount} karyawan aktif (batas ${limit}). ` +
        `Dibatalkan, tidak ada yang dinonaktifkan. Periksa data Nusawork; jika memang benar, jalankan dengan ${FORCE_DEACTIVATE_ARG}.`,
    );
  }
}

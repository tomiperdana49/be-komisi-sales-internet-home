import { timingSafeEqual } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import type { Context } from "hono";
import { NotFoundException } from "../exception/http.exception";
import { successResponse } from "../helper/api-response.helper";
import { currentCommissionPeriod, getDateRangeForPeriod, shiftPeriod, toSqlDate } from "../helper/period.helper";
import { tvConfig } from "../config/tv.config";
import type { CommissionService } from "../service/commission.service";
import type { ManagerDailyReport } from "../interface/commission.interface";
import type { IPeriodClosingService } from "../interface/period-closing.interface";
import type { PhotoCutoutService } from "../service/photo-cutout.service";

/** What the public TV screen may show of one Account Manager: no IDs, no commission. */
type TvSalesRow = {
  name: string;
  photoProfile: string;
  /** Same photo with the background removed, once it has been processed. */
  photoCutout: string | null;
  branch: string | null;
  status: string | null;
  activityCount: number;
  target: number;
  newSubscription: number;
};

type TvPeriod = {
  period: string;
  startDate: string;
  endDate: string;
  closed: boolean;
  rows: TvSalesRow[];
};

/** Where each AM stood when the day started — the screen's rank arrows compare against it. */
type TvBaselineRow = Pick<TvSalesRow, "name" | "activityCount" | "newSubscription">;

const BASELINE_DIR = "uploads/tv-baseline";

/**
 * The TV lounge screen: last period's final Account Manager achievement next to the running
 * period's so far. No login (the TV can't sign in) — a shared key from TV_DISPLAY_KEY instead,
 * and only names, photos, branches, new services and new subscription leave the server.
 */
export class TvController {
  private cache: { at: number; period: string; data: Promise<{ previous: TvPeriod; current: TvPeriod; baseline: TvBaselineRow[] }> } | null = null;

  private monitoringCache: { at: number; period: string; data: Promise<ManagerDailyReport> } | null = null;

  constructor(
    private readonly commissionService: CommissionService,
    private readonly periodClosingService: IPeriodClosingService,
    private readonly photoCutouts: PhotoCutoutService,
  ) {}

  /** A wrong or missing key looks exactly like a missing route. */
  private assertKey(c: Context) {
    const expected = tvConfig.displayKey;
    const given = c.req.query("key") ?? "";
    const ok = expected !== null
      && given.length === expected.length
      && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) throw new NotFoundException("Not found");
  }

  private async load(period: string): Promise<TvPeriod> {
    const { start, end } = getDateRangeForPeriod(period);
    const [summary, closed] = await Promise.all([
      this.commissionService.getSalesSummary(period),
      this.periodClosingService.isClosed(period),
    ]);
    // SDRs have their own rules and targets, so the screen compares Account Managers only.
    const rows = summary.filter((r) => !r.isSdr).map((r) => ({
      name: r.name,
      photoProfile: r.photoProfile,
      photoCutout: this.photoCutouts.urlFor(r.photoProfile),
      branch: r.branch,
      status: r.status,
      activityCount: r.activityCount,
      target: r.target,
      newSubscription: r.newSubscription,
    }));
    return { period, startDate: toSqlDate(start), endDate: toSqlDate(end), closed, rows };
  }

  /**
   * The running period as first computed today (≈ yesterday's close), kept in a file so a BE
   * restart doesn't reset the day's arrows. Older days' files are removed.
   */
  private async baseline(current: TvPeriod): Promise<TvBaselineRow[]> {
    const name = `${current.period}-${toSqlDate(new Date())}.json`;
    const file = Bun.file(`${BASELINE_DIR}/${name}`);
    if (await file.exists()) return file.json();
    const rows = current.rows.map(({ name, activityCount, newSubscription }) => ({ name, activityCount, newSubscription }));
    await Bun.write(file, JSON.stringify(rows));
    const old = (await readdir(BASELINE_DIR)).filter((f) => f !== name);
    await Promise.all(old.map((f) => rm(`${BASELINE_DIR}/${f}`, { force: true })));
    return rows;
  }

  /** Every Sales Manager's team, day by day, for the running period. */
  async monitoring(c: Context) {
    this.assertKey(c);
    const period = currentCommissionPeriod();
    if (!this.monitoringCache || this.monitoringCache.period !== period || Date.now() - this.monitoringCache.at > tvConfig.cacheMs) {
      const data = this.commissionService.getManagerDaily(period);
      this.monitoringCache = { at: Date.now(), period, data };
      // A failed computation must not be served from the cache until it expires.
      data.catch(() => { if (this.monitoringCache?.data === data) this.monitoringCache = null; });
    }
    const report = await this.monitoringCache.data;
    const managers = report.managers.filter((m) => m.teamSize > 0);
    return c.json(successResponse("TV monitoring retrieved successfully", { ...report, managers }));
  }

  async sales(c: Context) {
    this.assertKey(c);
    const current = currentCommissionPeriod();
    if (!this.cache || this.cache.period !== current || Date.now() - this.cache.at > tvConfig.cacheMs) {
      const data = Promise.all([this.load(shiftPeriod(current, -1)), this.load(current)])
        .then(async ([previous, now]) => ({ previous, current: now, baseline: await this.baseline(now) }));
      this.cache = { at: Date.now(), period: current, data };
      // A failed computation must not be served from the cache until it expires.
      data.catch(() => { if (this.cache?.data === data) this.cache = null; });
    }
    const entry = this.cache;
    const data = await entry.data;
    return c.json(successResponse("TV sales retrieved successfully", { ...data, generatedAt: new Date(entry.at).toISOString() }));
  }
}

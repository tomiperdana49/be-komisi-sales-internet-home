import type { AppDatabase } from "../lib/app-database";
import type { IPeriodClosingRepository, PeriodClosingRow } from "../interface/period-closing.interface";

export class PeriodClosingRepository implements IPeriodClosingRepository {
  constructor(private readonly db: AppDatabase) {}

  findAll(): Promise<PeriodClosingRow[]> {
    return this.db.query<PeriodClosingRow[]>(
      "SELECT period, closed_by, closed_at FROM period_closing ORDER BY period DESC",
    );
  }

  async findClosed(periods: string[]): Promise<string[]> {
    if (periods.length === 0) return [];
    const rows = await this.db.query<{ period: string }[]>(
      "SELECT period FROM period_closing WHERE period IN (?)",
      [periods],
    );
    return rows.map((r) => r.period);
  }

  async close(period: string, closedBy: string): Promise<void> {
    await this.db.query(
      "INSERT INTO period_closing (period, closed_by) VALUES (?, ?) ON DUPLICATE KEY UPDATE period = period",
      [period, closedBy],
    );
  }

  async reopen(period: string): Promise<void> {
    await this.db.query("DELETE FROM period_closing WHERE period = ?", [period]);
  }
}

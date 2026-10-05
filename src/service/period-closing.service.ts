import type {
  IPeriodClosingRepository,
  IPeriodClosingService,
  PeriodClosingRow,
} from "../interface/period-closing.interface";

/**
 * A closed period is frozen: the import/churn jobs no longer touch it, so
 * the numbers an admin signed off on can't move afterwards.
 */
export class PeriodClosingService implements IPeriodClosingService {
  constructor(private readonly periodClosingRepository: IPeriodClosingRepository) {}

  list(): Promise<PeriodClosingRow[]> {
    return this.periodClosingRepository.findAll();
  }

  async filterOpen(periods: string[]): Promise<string[]> {
    const closed = new Set(await this.periodClosingRepository.findClosed(periods));
    return periods.filter((p) => !closed.has(p));
  }

  async isClosed(period: string): Promise<boolean> {
    return (await this.periodClosingRepository.findClosed([period])).length > 0;
  }

  close(period: string, closedBy: string): Promise<void> {
    return this.periodClosingRepository.close(period, closedBy);
  }

  reopen(period: string): Promise<void> {
    return this.periodClosingRepository.reopen(period);
  }
}

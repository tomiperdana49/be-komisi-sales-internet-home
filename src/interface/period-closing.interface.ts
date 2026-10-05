export type PeriodClosingRow = {
  period: string;
  closed_by: string;
  closed_at: string;
};

export interface IPeriodClosingRepository {
  findAll(): Promise<PeriodClosingRow[]>;
  findClosed(periods: string[]): Promise<string[]>;
  close(period: string, closedBy: string): Promise<void>;
  reopen(period: string): Promise<void>;
}

export interface IPeriodClosingService {
  list(): Promise<PeriodClosingRow[]>;
  /** The given periods minus the closed ones, order kept. */
  filterOpen(periods: string[]): Promise<string[]>;
  isClosed(period: string): Promise<boolean>;
  close(period: string, closedBy: string): Promise<void>;
  reopen(period: string): Promise<void>;
}

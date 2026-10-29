export type ConsistencyBonusRow = {
  employee_id: string;
  period: string;
  amount: number;
  note: string;
  /** Comma-separated month numbers (1-12) the admin cites as the consistency record — informational only, doesn't drive the grant period. */
  months: string | null;
  service_count: number | null;
  testimonial_link: string | null;
  granted_by: string;
  created_at: string;
};

export interface IConsistencyBonusRepository {
  findByEmployeeIdsAndPeriod(employeeIds: string[], period: string): Promise<ConsistencyBonusRow[]>;
  findGrantedPeriods(employeeId: string, periods: string[]): Promise<string[]>;
  upsert(
    employeeId: string,
    period: string,
    amount: number,
    note: string,
    months: string | null,
    serviceCount: number | null,
    testimonialLink: string | null,
    grantedBy: string,
  ): Promise<void>;
  remove(employeeId: string, period: string): Promise<void>;
}

export interface IConsistencyBonusService {
  /** One employee's Bonus Konsistensi amount for a period — 0 if never granted. */
  getAmount(employeeId: string, period: string): Promise<number>;
  /** Many employees' amounts for a period, as a Map (0 for anyone without a grant). */
  getAmountsByEmployeeIds(employeeIds: string[], period: string): Promise<Map<string, number>>;
  /** Full grant rows (amount/note/grantedBy/createdAt) for many employees in a period — for the admin listing page. */
  getGrantsByEmployeeIds(employeeIds: string[], period: string): Promise<Map<string, ConsistencyBonusRow>>;
  /** Which of `periods` have a manual Bonus Konsistensi grant (not other manual amounts such as Komisi Event). */
  getGrantedPeriods(employeeId: string, periods: string[]): Promise<Set<string>>;
  grant(
    employeeId: string,
    period: string,
    amount: number,
    note: string,
    months: string | null,
    serviceCount: number | null,
    testimonialLink: string | null,
    grantedBy: string,
  ): Promise<void>;
  revoke(employeeId: string, period: string): Promise<void>;
}

/** One row of the admin "Bonus Konsistensi" management table. */
export type ConsistencyBonusItem = {
  employeeId: string;
  name: string;
  photoProfile: string;
  branch: string | null;
  isSdr: boolean;
  status: string | null;
  amount: number;
  /** Bonus Konsistensi the rules pay automatically this period (0 when off, not reached, or granted by hand this period). */
  autoAmount: number;
  /** Months the automatic bonus is paid for, oldest first. */
  autoMonths: { period: string; activityCount: number }[];
  note: string | null;
  months: string | null;
  serviceCount: number | null;
  testimonialLink: string | null;
  grantedBy: string | null;
  grantedByName: string | null;
  createdAt: string | null;
};

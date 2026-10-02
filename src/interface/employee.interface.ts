export type EmployeeRow = {
  employee_id: string;
  name: string;
};

// Full `employee` table row, plus the manager fields joined in by
// findByEmployeeId. Optional since not every query joins them.
export type EmployeeDetail = {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  photo_profile: string;
  job_position: string;
  organization_name: string;
  job_level: string;
  branch: string;
  status: string;
  manager_id: number | null;
  has_dashboard: boolean;
  is_active: boolean;
  is_admin: boolean;
  managerName?: string | null;
  managerEmployeeId?: string | null;
  managerPhotoProfile?: string | null;
};

export type StatusPeriodRow = {
  employee_id: string;
  status: string;
  /** This employee's New Achievement target for the period (admin-configurable; starts at the period's rules default). */
  target: number;
  start_date: Date | string;
  end_date: Date | string;
};

export type StatusPeriodDetail = {
  status: string;
  target: number;
};

/** One row of the admin "manage sales target" table — only sales with a status_period record for the period appear (KOMISI.md 6.E: no record means not registered for that period). */
export type SalesTargetItem = {
  employeeId: string;
  name: string;
  photoProfile: string;
  status: string;
  target: number;
};

export type EmployeeUpsertInput = {
  userId: string;
  employeeId: string;
  name: string;
  email: string;
  photoProfile: string;
  jobPosition: string;
  organizationName: string;
  jobLevel: string;
  branch: string;
  status: string;
  managerId?: string | null;
  hasDashboard?: boolean;
};

export interface IEmployeeRepository {
  findAll(): Promise<EmployeeRow[]>;
  upsertEmployee(data: EmployeeUpsertInput): Promise<void>;
  findByEmployeeId(employeeId: string): Promise<EmployeeDetail | null>;
  /** Epoch milliseconds before which this employee's tokens are void (null = none revoked). */
  getTokensValidAfter(employeeId: string): Promise<number | null>;
  /** Voids every token issued to this employee before `epochMs` (logout). */
  setTokensValidAfter(employeeId: string, epochMs: number): Promise<void>;
  /** Bulk lookup — one query instead of N concurrent single-row ones (those can desync the mysql pool under load). */
  findByEmployeeIds(employeeIds: string[]): Promise<EmployeeDetail[]>;
  findByEmail(email: string): Promise<EmployeeDetail | null>;
  findAllEmployeeIds(): Promise<string[]>;
  updateActiveStatus(employeeId: string, isActive: boolean): Promise<void>;
  upsertStatusPeriod(
    employeeId: string,
    startDate: string,
    endDate: string,
    status: string,
    /** Target given to a newly created row; existing rows keep whatever target they already have. */
    initialTarget: number,
  ): Promise<void>;
  findStatusByPeriod(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<StatusPeriodDetail | null>;
  findStatusesByPeriodAndIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<StatusPeriodRow[]>;
  /**
   * Every Account Manager registered (has a status_period row) for a
   * period — the period-aware roster shared by the admin target/sales/invoice
   * summary endpoints, so all three always agree on who counts for a given
   * period regardless of current employment status (KOMISI.md 6.E).
   */
  findSalesTargetsByPeriod(startDate: string, endDate: string): Promise<SalesTargetItem[]>;
  /**
   * Recursive-CTE lookup: the employee's own reporting chain (isSelf=true)
   * or their direct team (isSelf=false), filtered to has_dashboard rows.
   * An employee with no manager (top of the org) instead gets every
   * has_dashboard employee, matching the original dashboard's "see everyone"
   * rule for the top-level role.
   */
  findHierarchy(
    employeeId: string,
    search: string | undefined,
    isSelf: boolean,
    isActiveOnly: boolean,
  ): Promise<EmployeeDetail[]>;
  /** Every active Manager/C-Level employee — the admin manager summary roster. */
  findAllManagerEmployees(): Promise<EmployeeDetail[]>;
}

export type SalesResolution = { value: string | null; skip: boolean };

export interface IEmployeeService {
  getEmployeeIdByName(): Promise<Map<string, string>>;
  resolveEmployee(
    rawName: string | null | undefined,
    employeeMap: Map<string, string>,
  ): string | null;
  /**
   * Same lookup as resolveEmployee, but signals when the row should be
   * dropped: an unmatched Sales name is only kept raw for the
   * "Customer Relation Officer" placeholder, everything else is skipped.
   */
  resolveSales(
    rawName: string | null | undefined,
    employeeMap: Map<string, string>,
  ): SalesResolution;

  upsertEmployee(data: EmployeeUpsertInput): Promise<void>;
  upsertStatusPeriod(
    employeeId: string,
    startDate: string,
    endDate: string,
    status: string,
    /** Target given to a newly created row; existing rows keep whatever target they already have. */
    initialTarget: number,
  ): Promise<void>;
  getAllEmployeeIds(): Promise<string[]>;
  deactivateEmployee(employeeId: string): Promise<void>;
  /** Employment status + target recorded for that exact commission period, or null if never crawled. */
  getStatusByPeriod(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<StatusPeriodDetail | null>;
  getStatusesByPeriodAndIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<StatusPeriodRow[]>;
  getSalesTargetsByPeriod(startDate: string, endDate: string): Promise<SalesTargetItem[]>;
  findByEmployeeId(employeeId: string): Promise<EmployeeDetail | null>;
  /** Epoch milliseconds before which this employee's tokens are void (null = none revoked). */
  getTokensValidAfter(employeeId: string): Promise<number | null>;
  /** Voids every token issued to this employee before `epochMs` (logout). */
  setTokensValidAfter(employeeId: string, epochMs: number): Promise<void>;
  findByEmployeeIds(employeeIds: string[]): Promise<EmployeeDetail[]>;
  findByEmail(email: string): Promise<EmployeeDetail | null>;
  getHierarchy(
    employeeId: string,
    search?: string,
    isSelf?: boolean,
    isActiveOnly?: boolean,
  ): Promise<EmployeeDetail[]>;
  getAllManagerEmployees(): Promise<EmployeeDetail[]>;
}

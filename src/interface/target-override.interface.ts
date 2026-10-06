export type TargetOverrideRow = {
  id: number;
  employee_id: string;
  target: number;
  start_period: string;
  end_period: string;
  note: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type TargetOverrideInput = {
  target: number;
  startPeriod: string;
  endPeriod: string;
  note: string | null;
};

export interface ITargetOverrideRepository {
  findById(id: number): Promise<TargetOverrideRow | null>;
  /** Overrides covering `period` for the given employees (at most one each — ranges never overlap). */
  findActive(employeeIds: string[], period: string): Promise<TargetOverrideRow[]>;
  /** Overrides still running or scheduled at `period` (end_period >= period), oldest first. */
  findFrom(period: string): Promise<TargetOverrideRow[]>;
  /** An employee's overrides whose range overlaps [startPeriod, endPeriod], optionally ignoring one row. */
  findOverlapping(employeeId: string, startPeriod: string, endPeriod: string, excludeId?: number): Promise<TargetOverrideRow[]>;
  create(employeeId: string, input: TargetOverrideInput, createdBy: string): Promise<void>;
  update(id: number, input: TargetOverrideInput, updatedBy: string): Promise<void>;
  remove(id: number): Promise<void>;
}

/** A manual target and the period range it covers (YYYYMM, inclusive). */
export type ManualTarget = { target: number; startPeriod: string; endPeriod: string };

/** What the commission engine needs: an Account Manager's manual target for a period, if any. */
export interface ITargetOverrideReader {
  getActive(employeeId: string, period: string): Promise<ManualTarget | null>;
}

export interface ITargetOverrideService extends ITargetOverrideReader {
  listFrom(period: string): Promise<TargetOverrideRow[]>;
  create(employeeId: string, input: TargetOverrideInput, createdBy: string): Promise<void>;
  update(id: number, input: TargetOverrideInput, updatedBy: string): Promise<void>;
  remove(id: number): Promise<void>;
}

/** One manual target range, as the admin "Target AM" page shows it. */
export type TargetOverrideItem = {
  id: number;
  target: number;
  startPeriod: string;
  endPeriod: string;
  note: string | null;
  updatedBy: string;
  updatedByName: string | null;
  updatedAt: string;
};

/** One Account Manager row of the admin "Target AM" page for a period. */
export type TargetOverrideRosterItem = {
  employeeId: string;
  name: string;
  photoProfile: string;
  status: string | null;
  /** Target from the commission rules for this period and status. */
  defaultTarget: number;
  /** Target actually used this period: the manual one when active, else defaultTarget. */
  effectiveTarget: number;
  /** The manual range covering this period, if any. */
  active: TargetOverrideItem | null;
  /** Manual ranges starting after this period, oldest first. */
  upcoming: TargetOverrideItem[];
};

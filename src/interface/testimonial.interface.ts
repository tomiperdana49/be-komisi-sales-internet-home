export type TestimonialRow = {
  id: number;
  employee_id: string;
  /** Their Sales Manager when the row was entered. */
  manager_id: string | null;
  customer_id: string;
  customer_name: string;
  /** YYYY-MM-DD. */
  testimonial_date: string;
  link: string;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
};

export type TestimonialInput = {
  customerId: string;
  customerName: string;
  testimonialDate: string;
  link: string;
};

export interface ITestimonialRepository {
  findById(id: number): Promise<TestimonialRow | null>;
  findByEmployeeId(employeeId: string): Promise<TestimonialRow[]>;
  findByDateRange(startDate: string, endDate: string): Promise<TestimonialRow[]>;
  countByEmployeeId(employeeId: string, startDate: string, endDate: string): Promise<number>;
  findAll(): Promise<TestimonialRow[]>;
  create(employeeId: string, managerId: string | null, input: TestimonialInput, createdBy: string): Promise<void>;
  update(id: number, input: TestimonialInput, updatedBy: string): Promise<void>;
  remove(id: number): Promise<void>;
}

/** What the Bonus Konsistensi needs: how many testimonials someone entered dated within [startDate, endDate]. */
export interface ITestimonialCounter {
  countByEmployeeId(employeeId: string, startDate: string, endDate: string): Promise<number>;
}

export interface ITestimonialService {
  findById(id: number): Promise<TestimonialRow | null>;
  /** One Account Manager's testimonials, newest testimonial date first. */
  listByEmployeeId(employeeId: string): Promise<TestimonialRow[]>;
  /** Every testimonial dated within [startDate, endDate] — the admin listing. */
  listByDateRange(startDate: string, endDate: string): Promise<TestimonialRow[]>;
  /** Rows with the names of the Account Manager, their team and who entered or changed them. */
  toItems(rows: TestimonialRow[]): Promise<TestimonialItem[]>;
  /**
   * Mirrors every testimonial to the marketing sheet (GOOGLE_SPREADSHEET_ID_TESTIMONIAL),
   * one sync at a time. No-op when the sheet isn't configured.
   */
  syncSheet(): Promise<void>;
  create(employeeId: string, managerId: string | null, input: TestimonialInput, createdBy: string): Promise<void>;
  /** Fixes a typo; the Account Manager and their team stay as entered. */
  update(id: number, input: TestimonialInput, updatedBy: string): Promise<void>;
  remove(id: number): Promise<void>;
}

/** One row of a testimonial list, as the sheet has it: Time Insert, Team (SM), Sales (AM), customer, date and link. */
export type TestimonialItem = {
  id: number;
  employeeId: string;
  employeeName: string | null;
  branch: string | null;
  managerId: string | null;
  managerName: string | null;
  customerId: string;
  customerName: string;
  testimonialDate: string;
  link: string;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
  /** Dated in a closed period: only a Super Admin may change it. Set by the controller's list endpoints. */
  periodClosed?: boolean;
};

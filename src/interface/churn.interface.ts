import type { ChurnCloseReasonRule } from "./commission-rules.interface";

// Raw row from the billing DB — a service unregistered within the window.
export type RawChurnRow = {
  customer_id: string;
  customer_name: string | null;
  customer_service_id: number;
  customer_service_account: string | null;
  service_id: string | null;
  service_name: string | null;
  registration_date: unknown;
  unregistration_date: unknown;
  reason: string | null;
  /** NIS close category: status when closed (e.g. "Renewal") and the reason picked; null for legacy closings. */
  close_status: string | null;
  close_reason: string | null;
  /** Latest ServiceCloseCategoryDetails row and its closeCatExistingStatus; null for legacy closings. */
  close_category_id: number | null;
  close_status_id: number | null;
  sales_id: string | null;
  manager_id: string | null;
  subscription: unknown;
  discount: unknown;
  period: number;
  price: unknown;
  TotalInvoice: number;
};

/** Any service stopped (NA) in a window, with the churn conditions as 0/1 flags. */
export type RawStoppedServiceRow = RawChurnRow & {
  customer_branch: string | null;
  in_branch: number;
  within_year: number;
  paid_12_months: number;
  termination_paid: number;
};

/** Why a stopped service isn't a churn — the first churn condition it fails. */
export type ChurnExclusion =
  | "branch"
  | "product"
  | "over_year"
  | "no_invoice"
  | "paid_12_months"
  | "termination_paid"
  | "close_reason";

export type StoppedServiceItem = {
  customer_service_id: number;
  customer_id: string;
  customer_name: string | null;
  customer_service_account: string | null;
  customer_branch: string | null;
  service_id: string | null;
  service_name: string | null;
  registration_date: unknown;
  unregistration_date: unknown;
  close_status: string | null;
  close_reason: string | null;
  reason: string | null;
  price: number;
  sales_id: string | null;
  /** null when it counts as a churn. */
  exclusion: ChurnExclusion | null;
};

export type ChurnUpsertInput = {
  customer_service_id: number;
  customer_id: string;
  customer_name: string | null;
  customer_service_account: string | null;
  service_id: string | null;
  service_name: string | null;
  registration_date: unknown;
  unregistration_date: unknown;
  reason: string | null;
  /** NIS close category: status when closed (e.g. "Renewal") and the reason picked; null for legacy closings. */
  close_status: string | null;
  close_reason: string | null;
  period: number;
  price: unknown;
  sales_id: string | null;
  manager_id: string | null;
};

export type ChurnRow = {
  customer_service_id: number;
  customer_id: string;
  customer_name: string | null;
  customer_service_account: string | null;
  service_id: string | null;
  service_name: string | null;
  registration_date: string | null;
  unregistration_date: string | null;
  reason: string | null;
  /** NIS close category: status when closed (e.g. "Renewal") and the reason picked; null for legacy closings. */
  close_status: string | null;
  close_reason: string | null;
  period: number;
  price: number | null;
  sales_id: string | null;
  manager_id: string | null;
  is_approved: boolean;
  /** Why an admin waived this churn; null while not approved (or approved before reasons were recorded). */
  approval_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  /** NIS log call that waived this churn (see churn-waiver.helper); null when waived by hand or not waived. */
  approval_log_call_id: number | null;
  /** Set on a churn carried over by hand (churn:carry): it counts in the period of this date, not of unregistration_date. */
  deduct_date: string | null;
};

export type ChurnSummaryRow = ChurnRow & {
  employee_name: string | null;
  employee_eid: string | null;
  employee_photo: string | null;
  employee_branch: string | null;
  approved_by_name: string | null;
};

// A NIS log call by a churn-waiver approver that mentions churn.
export type WaiverLogCallRow = {
  log_call_id: number;
  emp_id: string;
  customer_id: string | null;
  posted: Date;
  text: string | null;
};

export type ChurnApprovalState = {
  customer_service_id: number;
  customer_id: string;
  customer_service_account: string | null;
  is_approved: boolean | number;
  approval_log_call_id: number | null;
};

export type LogCallWaiver = {
  logCallId: number;
  empId: string;
  posted: Date;
  note: string;
};

export interface IChurnRepository {
  findFromBilling(serviceIds: string[], startDate: string, endDate: string): Promise<RawChurnRow[]>;
  /** Stopped services by account name, without the churn eligibility rules (churn:carry). */
  findFromBillingByAccounts(accounts: string[]): Promise<RawChurnRow[]>;
  findStoppedFromBilling(startDate: string, endDate: string): Promise<RawStoppedServiceRow[]>;
  upsert(data: ChurnUpsertInput): Promise<void>;
  setDeductDate(customerServiceId: number, deductDate: string): Promise<void>;
  findLocalCsIdsInRange(startDate: string, endDate: string): Promise<number[]>;
  deleteByCsIds(csIds: number[]): Promise<void>;
  findByEmployeeId(employeeId: string, startDate: string, endDate: string): Promise<ChurnRow[]>;
  findByEmployeeIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<ChurnRow[]>;
  findSummary(startDate: string, endDate: string, search?: string): Promise<ChurnSummaryRow[]>;
  updateApproval(customerServiceId: string, isApproved: boolean, note: string | null, approvedBy: string): Promise<void>;
  /** The date a churn counts on (deduct_date, else unregistration_date) as YYYY-MM-DD; null if not on the list. */
  findChurnDate(customerServiceId: string): Promise<string | null>;
  findWaiverLogCalls(approverIds: string[], since: string): Promise<WaiverLogCallRow[]>;
  findApprovalStatesInRange(startDate: string, endDate: string): Promise<ChurnApprovalState[]>;
  setLogCallWaiver(customerServiceId: number, waiver: LogCallWaiver): Promise<void>;
  clearLogCallWaiver(customerServiceId: number): Promise<void>;
}

export interface IChurnService {
  /** Fetches churns of the given ServiceIds from billing, upserts them, and deletes local rows no longer in range. */
  syncFromBilling(
    serviceIds: string[],
    startDate: string,
    endDate: string,
    closeReasons: ChurnCloseReasonRule[],
  ): Promise<{ synced: number; deleted: number; waived: number; reinstated: number }>;
  getByEmployeeId(employeeId: string, startDate: string, endDate: string): Promise<ChurnRow[]>;
  getByEmployeeIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<ChurnRow[]>;
  getSummary(startDate: string, endDate: string, search?: string): Promise<ChurnSummaryRow[]>;
  /** Every service stopped in the window, each marked churn or with why it isn't (straight from billing). */
  getStoppedServices(
    serviceIds: string[],
    startDate: string,
    endDate: string,
    closeReasons: ChurnCloseReasonRule[],
  ): Promise<StoppedServiceItem[]>;
  /** Pulls the named stopped services from billing as churns deducted in the period holding deductDate. */
  carryFromBilling(accounts: string[], deductDate: string): Promise<RawChurnRow[]>;
  /** The date a churn counts on (its period), YYYY-MM-DD; null if not on the list. */
  getChurnDate(customerServiceId: string): Promise<string | null>;
  /** Waives (isApproved) a churn with the admin's reason, or reinstates it and clears the reason. */
  updateApproval(customerServiceId: string, isApproved: boolean, note: string | null, approvedBy: string): Promise<void>;
}

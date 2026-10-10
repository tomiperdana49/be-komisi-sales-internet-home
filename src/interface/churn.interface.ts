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
  sales_id: string | null;
  manager_id: string | null;
  subscription: unknown;
  discount: unknown;
  period: number;
  price: unknown;
  TotalInvoice: number;
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
};

export type ChurnSummaryRow = ChurnRow & {
  employee_name: string | null;
  employee_eid: string | null;
  employee_photo: string | null;
  approved_by_name: string | null;
};

export interface IChurnRepository {
  findFromBilling(serviceIds: string[], startDate: string, endDate: string): Promise<RawChurnRow[]>;
  upsert(data: ChurnUpsertInput): Promise<void>;
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
}

export interface IChurnService {
  /** Fetches churns of the given ServiceIds from billing, upserts them, and deletes local rows no longer in range. */
  syncFromBilling(serviceIds: string[], startDate: string, endDate: string): Promise<{ synced: number; deleted: number }>;
  getByEmployeeId(employeeId: string, startDate: string, endDate: string): Promise<ChurnRow[]>;
  getByEmployeeIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<ChurnRow[]>;
  getSummary(startDate: string, endDate: string, search?: string): Promise<ChurnSummaryRow[]>;
  /** Waives (isApproved) a churn with the admin's reason, or reinstates it and clears the reason. */
  updateApproval(customerServiceId: string, isApproved: boolean, note: string | null, approvedBy: string): Promise<void>;
}

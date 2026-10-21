export type AdminRole = "super_admin" | "admin";

export type AdminAccessRow = {
  id: number;
  employee_id: string;
  role: AdminRole;
  /** Branch an Admin's views are limited to; null for every branch. Ignored for a Super Admin. */
  branch: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
};

export type AdminAccessInput = {
  role: AdminRole;
  branch: string | null;
  note: string | null;
};

export interface IAdminAccessRepository {
  findAll(): Promise<AdminAccessRow[]>;
  findById(id: number): Promise<AdminAccessRow | null>;
  findByEmployeeId(employeeId: string): Promise<AdminAccessRow | null>;
  countSuperAdmins(): Promise<number>;
  create(employeeId: string, input: AdminAccessInput, createdBy: string): Promise<void>;
  update(id: number, input: AdminAccessInput, updatedBy: string): Promise<void>;
  remove(id: number): Promise<void>;
}

/** What access checks need: someone's ACL entry, if any. */
export interface IAdminAccessReader {
  getAccess(employeeId: string): Promise<AdminAccessRow | null>;
}

/** One row of the Super Admin "Akses Admin" page. */
export type AdminAccessItem = {
  id: number;
  employeeId: string;
  name: string | null;
  photoProfile: string | null;
  jobPosition: string | null;
  employeeBranch: string | null;
  role: AdminRole;
  branch: string | null;
  note: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
};

/** A Nusawork employee who can be given access, for the page's search. */
export type AdminCandidate = {
  employeeId: string;
  name: string;
  photoProfile: string;
  jobPosition: string;
  organizationName: string;
  branch: string;
  hasAccess: boolean;
};

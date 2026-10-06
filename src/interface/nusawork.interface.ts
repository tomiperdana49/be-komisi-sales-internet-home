// Raw shape of a single employee record from the Nusawork API. Only the
// fields we actually read are typed; the API returns many more.
export type NusaworkEmployeeRaw = {
  user_id: string;
  employee_id: string;
  full_name: string;
  email: string;
  photo_profile: string;
  job_position: string;
  organization_name: string;
  job_level: string;
  branch_name: string;
  status_join: string;
  id_report_to_value: string | null;
};

// Normalized shape EmployeeService.upsertEmployee expects.
export type CrawledEmployee = {
  userId: string;
  employeeId: string;
  name: string;
  email: string;
  photoProfile: string;
  jobPosition: string;
  organizationName: string;
  jobLevel: string;
  branch: string;
  managerId: string | null;
  status: string;
  hasDashboard?: boolean;
  isAdmin: boolean;
};

export interface INusaworkClient {
  getEmployees(): Promise<NusaworkEmployeeRaw[]>;
}

export interface INusaworkService {
  /** Account managers plus everyone on their reporting chain up to VP Internet Access Home. */
  getSalesHome(): Promise<CrawledEmployee[]>;
  /** Fixed set of admins/finance/BIS/VP/Direksi, kept outside the sales hierarchy. */
  getEmployeeAdmin(): Promise<CrawledEmployee[]>;
}

import type {
  CrawledEmployee,
  INusaworkClient,
  INusaworkService,
  NusaworkEmployeeRaw,
} from "../interface/nusawork.interface";
import { isSdr } from "../helper/commission.helper";

/** Normalized record; admin access itself comes from the ACL (admin_access), not from here. */
function toCrawled(emp: NusaworkEmployeeRaw, managerId: string | null, hasDashboard?: boolean): CrawledEmployee {
  return {
    userId: emp.user_id,
    employeeId: emp.employee_id,
    name: emp.full_name,
    email: emp.email,
    photoProfile: emp.photo_profile,
    jobPosition: emp.job_position,
    organizationName: emp.organization_name,
    jobLevel: emp.job_level,
    branch: emp.branch_name,
    managerId,
    status: emp.status_join,
    signDate: emp.sign_date ?? null,
    hasDashboard,
    isAdmin: false,
  };
}

export class NusaworkService implements INusaworkService {
  constructor(private readonly nusaworkClient: INusaworkClient) {}

  async getSalesHome(): Promise<CrawledEmployee[]> {
    const employees = await this.nusaworkClient.getEmployees();
    const employeeMap = new Map<string, NusaworkEmployeeRaw>(
      employees.map((e) => [e.user_id, e]),
    );

    // SDRs join the same way, with their own commission rules (KOMISI.md 7).
    const accountManagers = employees.filter(
      (emp) => emp.job_position?.includes("Account Manager") || isSdr(emp.job_position),
    );

    const relevantEmployees = new Map<string, NusaworkEmployeeRaw>();

    // Traverse upwards until VP Internet Access Home
    for (const am of accountManagers) {
      let current: NusaworkEmployeeRaw | undefined = am;
      const path: NusaworkEmployeeRaw[] = [];
      let isValidPath = false;

      while (current) {
        // If we hit someone already in the valid set, this whole branch is valid
        if (relevantEmployees.has(current.user_id)) {
          isValidPath = true;
          break;
        }
        path.push(current);
        if (current.job_position === "VP Internet Access Home") {
          isValidPath = true;
          break;
        }
        // Reached the top (self-reporting or no manager) without finding VP -> invalid
        if (!current.id_report_to_value || current.id_report_to_value === current.user_id) {
          break;
        }
        current = employeeMap.get(current.id_report_to_value);
      }

      if (isValidPath) {
        for (const emp of path) relevantEmployees.set(emp.user_id, emp);
      }
    }

    return Array.from(relevantEmployees.values()).map((emp) =>
      toCrawled(emp, emp.id_report_to_value, emp.job_level !== "General Manager"),
    );
  }

  async getEmployeesByIds(employeeIds: string[]): Promise<CrawledEmployee[]> {
    const ids = new Set(employeeIds);
    const employees = await this.nusaworkClient.getEmployees();
    return employees.filter((emp) => ids.has(emp.employee_id)).map((emp) => toCrawled(emp, null));
  }

  async listEmployees(): Promise<CrawledEmployee[]> {
    const employees = await this.nusaworkClient.getEmployees();
    return employees.map((emp) => toCrawled(emp, null));
  }
}

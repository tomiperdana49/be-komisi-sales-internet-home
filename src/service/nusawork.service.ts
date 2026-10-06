import type {
  CrawledEmployee,
  INusaworkClient,
  INusaworkService,
  NusaworkEmployeeRaw,
} from "../interface/nusawork.interface";

// Fixed set of employees kept as admins/managers outside the sales
// hierarchy: specific individuals plus anyone in Finance/BIS, or at
// VP/Direksi level.
const ADMIN_EMPLOYEE_IDS = new Set([
  "0202589",
  "0201325",
  "0202215",
  "0202526",
  "0201510",
  "0202483",
  "0201203",
  "0202623",
  "0201204",
]);

/** Kept as an admin record outside the sales hierarchy (getEmployeeAdmin). */
function isListedAdmin(emp: NusaworkEmployeeRaw): boolean {
  return (
    ADMIN_EMPLOYEE_IDS.has(emp.employee_id) ||
    emp.organization_name === "Finance" ||
    emp.organization_name === "BIS" ||
    emp.job_level === "VP" ||
    emp.job_level === "Direksi"
  );
}

/**
 * Who may open the Summary dashboard. Branch Managers sit inside the sales
 * hierarchy, so they're flagged on their sales record rather than being
 * re-upserted as admins (that would null their manager_id).
 */
function isAdminEmployee(emp: NusaworkEmployeeRaw): boolean {
  return isListedAdmin(emp) || emp.job_position === "Branch Manager";
}

export class NusaworkService implements INusaworkService {
  constructor(private readonly nusaworkClient: INusaworkClient) {}

  async getSalesHome(): Promise<CrawledEmployee[]> {
    const employees = await this.nusaworkClient.getEmployees();
    const employeeMap = new Map<string, NusaworkEmployeeRaw>(
      employees.map((e) => [e.user_id, e]),
    );

    const accountManagers = employees.filter((emp) =>
      emp.job_position?.includes("Account Manager"),
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

    return Array.from(relevantEmployees.values()).map((emp) => ({
      userId: emp.user_id,
      employeeId: emp.employee_id,
      name: emp.full_name,
      email: emp.email,
      photoProfile: emp.photo_profile,
      jobPosition: emp.job_position,
      organizationName: emp.organization_name,
      jobLevel: emp.job_level,
      branch: emp.branch_name,
      managerId: emp.id_report_to_value,
      status: emp.status_join,
      hasDashboard: emp.job_level !== "General Manager",
      isAdmin: isAdminEmployee(emp),
    }));
  }

  async getEmployeeAdmin(): Promise<CrawledEmployee[]> {
    const employees = await this.nusaworkClient.getEmployees();

    const admins = employees.filter(isListedAdmin);

    return admins.map((emp) => ({
      userId: emp.user_id,
      employeeId: emp.employee_id,
      name: emp.full_name,
      email: emp.email,
      photoProfile: emp.photo_profile,
      jobPosition: emp.job_position,
      organizationName: emp.organization_name,
      jobLevel: emp.job_level,
      branch: emp.branch_name,
      managerId: null,
      status: emp.status_join,
      isAdmin: true,
    }));
  }
}

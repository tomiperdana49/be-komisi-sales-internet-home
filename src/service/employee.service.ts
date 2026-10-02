import type {
  EmployeeDetail,
  EmployeeUpsertInput,
  IEmployeeRepository,
  IEmployeeService,
  SalesResolution,
  SalesTargetItem,
  StatusPeriodDetail,
  StatusPeriodRow,
} from "../interface/employee.interface";

/** Placeholder used when a snapshot row's `sales` name doesn't match any employee. */
export const CRO_PLACEHOLDER = "Customer Relation Officer";
const SALES_UNMATCHED_ALLOWED = new Set([CRO_PLACEHOLDER]);

export class EmployeeService implements IEmployeeService {
  constructor(private readonly employeeRepository: IEmployeeRepository) {}

  // Stray internal spaces (e.g. "M. Syafi' i" vs "M. Syafi'i") are a known
  // data-entry issue in the employee table, so matching ignores all
  // whitespace rather than just leading/trailing.
  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, "");
  }

  async getEmployeeIdByName(): Promise<Map<string, string>> {
    const rows = await this.employeeRepository.findAll();

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(this.normalizeName(row.name), row.employee_id);
    }
    return map;
  }

  resolveEmployee(
    rawName: string | null | undefined,
    employeeMap: Map<string, string>,
  ): string | null {
    const trimmed = rawName?.trim();
    if (!trimmed) return null;

    const employeeId = employeeMap.get(this.normalizeName(trimmed));
    return employeeId ?? trimmed;
  }

  resolveSales(
    rawName: string | null | undefined,
    employeeMap: Map<string, string>,
  ): SalesResolution {
    const trimmed = rawName?.trim();
    if (!trimmed) return { value: null, skip: true };

    const employeeId = employeeMap.get(this.normalizeName(trimmed));
    if (employeeId) return { value: employeeId, skip: false };

    if (SALES_UNMATCHED_ALLOWED.has(trimmed)) {
      return { value: trimmed, skip: false };
    }

    return { value: null, skip: true };
  }

  upsertEmployee(data: EmployeeUpsertInput): Promise<void> {
    return this.employeeRepository.upsertEmployee(data);
  }

  upsertStatusPeriod(
    employeeId: string,
    startDate: string,
    endDate: string,
    status: string,
    initialTarget: number,
  ): Promise<void> {
    return this.employeeRepository.upsertStatusPeriod(employeeId, startDate, endDate, status, initialTarget);
  }

  getAllEmployeeIds(): Promise<string[]> {
    return this.employeeRepository.findAllEmployeeIds();
  }

  getStatusByPeriod(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<StatusPeriodDetail | null> {
    return this.employeeRepository.findStatusByPeriod(employeeId, startDate, endDate);
  }

  getStatusesByPeriodAndIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<StatusPeriodRow[]> {
    return this.employeeRepository.findStatusesByPeriodAndIds(employeeIds, startDate, endDate);
  }

  getSalesTargetsByPeriod(startDate: string, endDate: string): Promise<SalesTargetItem[]> {
    return this.employeeRepository.findSalesTargetsByPeriod(startDate, endDate);
  }

  deactivateEmployee(employeeId: string): Promise<void> {
    return this.employeeRepository.updateActiveStatus(employeeId, false);
  }

  findByEmployeeId(employeeId: string): Promise<EmployeeDetail | null> {
    return this.employeeRepository.findByEmployeeId(employeeId);
  }

  getTokensValidAfter(employeeId: string): Promise<number | null> {
    return this.employeeRepository.getTokensValidAfter(employeeId);
  }

  setTokensValidAfter(employeeId: string, epochMs: number): Promise<void> {
    return this.employeeRepository.setTokensValidAfter(employeeId, epochMs);
  }

  findByEmployeeIds(employeeIds: string[]): Promise<EmployeeDetail[]> {
    return this.employeeRepository.findByEmployeeIds(employeeIds);
  }

  findByEmail(email: string): Promise<EmployeeDetail | null> {
    return this.employeeRepository.findByEmail(email);
  }

  getHierarchy(
    employeeId: string,
    search?: string,
    isSelf: boolean = true,
    isActiveOnly: boolean = true,
  ): Promise<EmployeeDetail[]> {
    return this.employeeRepository.findHierarchy(employeeId, search, isSelf, isActiveOnly);
  }

  getAllManagerEmployees(): Promise<EmployeeDetail[]> {
    return this.employeeRepository.findAllManagerEmployees();
  }
}

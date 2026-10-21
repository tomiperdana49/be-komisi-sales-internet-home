import { BadRequestException, NotFoundException } from "../exception/http.exception";
import type {
  AdminAccessInput,
  AdminAccessItem,
  AdminAccessRow,
  AdminCandidate,
  IAdminAccessRepository,
} from "../interface/admin-access.interface";
import type { IEmployeeService } from "../interface/employee.interface";
import type { CrawledEmployee, INusaworkService } from "../interface/nusawork.interface";

/** The Nusawork directory is large and changes rarely; one fetch serves a whole search session. */
const DIRECTORY_TTL_MS = 5 * 60 * 1000;
const MAX_CANDIDATES = 20;

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * The ACL behind every admin page (see access.helper). Managed by Super
 * Admins on the "Akses Admin" page; employee:crawl reads it to know which
 * people outside the sales hierarchy to keep.
 */
export class AdminAccessService {
  private directory: { employees: Promise<CrawledEmployee[]>; expiresAt: number } | null = null;

  constructor(
    private readonly repository: IAdminAccessRepository,
    private readonly employeeService: IEmployeeService,
    private readonly nusaworkService: INusaworkService,
  ) {}

  async list(): Promise<AdminAccessItem[]> {
    const rows = await this.repository.findAll();
    const ids = [...new Set(rows.flatMap((r) => [r.employee_id, r.created_by, r.updated_by]).filter((id): id is string => !!id))];
    const employees = ids.length > 0 ? await this.employeeService.findByEmployeeIds(ids) : [];
    const byId = new Map(employees.map((e) => [e.employee_id, e]));
    const nameOf = (id: string | null) => (id ? (byId.get(id)?.name ?? null) : null);

    return rows.map((r) => {
      const e = byId.get(r.employee_id);
      return {
        id: r.id,
        employeeId: r.employee_id,
        name: e?.name ?? null,
        photoProfile: e?.photo_profile ?? null,
        jobPosition: e?.job_position ?? null,
        employeeBranch: e?.branch ?? null,
        role: r.role,
        branch: r.branch,
        note: r.note,
        createdBy: r.created_by,
        createdByName: nameOf(r.created_by),
        createdAt: toIso(r.created_at) ?? "",
        updatedBy: r.updated_by,
        updatedByName: nameOf(r.updated_by),
        updatedAt: toIso(r.updated_at),
      };
    });
  }

  /** Nusawork employees matching a name, employee ID or email, flagged when they already have access. */
  async searchCandidates(search: string): Promise<AdminCandidate[]> {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];

    const [directory, rows] = await Promise.all([this.getDirectory(), this.repository.findAll()]);
    const withAccess = new Set(rows.map((r) => r.employee_id));
    return directory
      .filter((e) => e.name.toLowerCase().includes(q) || e.employeeId.includes(q) || e.email?.toLowerCase().includes(q))
      .slice(0, MAX_CANDIDATES)
      .map((e) => ({
        employeeId: e.employeeId,
        name: e.name,
        photoProfile: e.photoProfile,
        jobPosition: e.jobPosition,
        organizationName: e.organizationName,
        branch: e.branch,
        hasAccess: withAccess.has(e.employeeId),
      }));
  }

  async create(employeeId: string, input: AdminAccessInput, createdBy: string): Promise<void> {
    this.validate(input);
    if (await this.repository.findByEmployeeId(employeeId)) {
      throw new BadRequestException("Karyawan ini sudah punya akses admin — ubah aksesnya saja");
    }

    // Someone outside the sales hierarchy isn't in our employee table (or was
    // deactivated when their access was removed): copy them from Nusawork so
    // they can sign in now, not after the next crawl.
    const existing = await this.employeeService.findByEmployeeId(employeeId);
    if (!existing || !existing.is_active) {
      const [employee] = await this.nusaworkService.getEmployeesByIds([employeeId]);
      if (!employee) throw new BadRequestException("Karyawan tidak ditemukan di Nusawork");
      await this.employeeService.upsertEmployee({ ...employee, isAdmin: true });
    }

    await this.repository.create(employeeId, input, createdBy);
  }

  async update(id: number, input: AdminAccessInput, updatedBy: string): Promise<void> {
    this.validate(input);
    const row = await this.findOrFail(id);
    if (row.role === "super_admin" && input.role !== "super_admin") {
      this.assertNotSelf(row, updatedBy, "Anda tidak bisa menurunkan akses Anda sendiri");
      await this.assertNotLastSuperAdmin();
    }
    await this.repository.update(id, input, updatedBy);
  }

  async remove(id: number, removedBy: string): Promise<void> {
    const row = await this.findOrFail(id);
    this.assertNotSelf(row, removedBy, "Anda tidak bisa menghapus akses Anda sendiri");
    if (row.role === "super_admin") await this.assertNotLastSuperAdmin();
    await this.repository.remove(id);
  }

  private validate(input: AdminAccessInput) {
    if (input.role !== "super_admin" && input.role !== "admin") {
      throw new BadRequestException("Role harus Super Admin atau Admin");
    }
  }

  private assertNotSelf(row: AdminAccessRow, callerId: string, message: string) {
    if (row.employee_id === callerId) throw new BadRequestException(message);
  }

  /** Keeps at least one Super Admin, so the ACL can never lock everyone out. */
  private async assertNotLastSuperAdmin() {
    if ((await this.repository.countSuperAdmins()) <= 1) {
      throw new BadRequestException("Harus ada minimal satu Super Admin");
    }
  }

  private async findOrFail(id: number): Promise<AdminAccessRow> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException("Akses admin tidak ditemukan");
    return row;
  }

  private getDirectory(): Promise<CrawledEmployee[]> {
    if (this.directory && this.directory.expiresAt > Date.now()) return this.directory.employees;
    const employees = this.nusaworkService.listEmployees();
    // Don't cache a failed fetch — the next search should retry.
    employees.catch(() => (this.directory = null));
    this.directory = { employees, expiresAt: Date.now() + DIRECTORY_TTL_MS };
    return employees;
  }
}

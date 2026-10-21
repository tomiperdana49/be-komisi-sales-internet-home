import type { Context } from "hono";
import { BadRequestException } from "../exception/http.exception";
import { successResponse } from "../helper/api-response.helper";
import type { AdminAccessInput } from "../interface/admin-access.interface";
import type { IEmployeeService } from "../interface/employee.interface";
import type { AdminAccessService } from "../service/admin-access.service";

/** Super Admin page "Akses Admin": who can open the admin pages, with which role and branch. */
export class AdminAccessController {
  constructor(
    private readonly adminAccessService: AdminAccessService,
    private readonly employeeService: IEmployeeService,
  ) {}

  async list(c: Context) {
    const [items, branches] = await Promise.all([this.adminAccessService.list(), this.employeeService.getBranches()]);
    return c.json(successResponse("Admin access retrieved successfully", { items, branches }));
  }

  async candidates(c: Context) {
    const data = await this.adminAccessService.searchCandidates(c.req.query("search") ?? "");
    return c.json(successResponse("Candidates retrieved successfully", data));
  }

  async create(c: Context) {
    const body = await c.req.json();
    const employeeId = String(body.employeeId ?? "").trim();
    if (!employeeId) throw new BadRequestException("Parameter employeeId is required");
    await this.adminAccessService.create(employeeId, this.parseInput(body), c.get("user").sub);
    return c.json(successResponse("Admin access created successfully"));
  }

  async update(c: Context) {
    const body = await c.req.json();
    await this.adminAccessService.update(this.idParam(c), this.parseInput(body), c.get("user").sub);
    return c.json(successResponse("Admin access updated successfully"));
  }

  async remove(c: Context) {
    await this.adminAccessService.remove(this.idParam(c), c.get("user").sub);
    return c.json(successResponse("Admin access deleted successfully"));
  }

  private parseInput(body: any): AdminAccessInput {
    const role = body.role === "super_admin" ? "super_admin" : body.role === "admin" ? "admin" : body.role;
    const branch = typeof body.branch === "string" && body.branch.trim() ? body.branch.trim() : null;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    // A Super Admin always covers every branch.
    return { role, branch: role === "super_admin" ? null : branch, note };
  }

  private idParam(c: Context): number {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException("Invalid id");
    return id;
  }
}

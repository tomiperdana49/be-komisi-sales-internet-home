import type { Context } from "hono";
import { BadRequestException } from "../exception/http.exception";
import { successResponse } from "../helper/api-response.helper";
import { resolveTarget } from "../helper/commission.helper";
import { resolvePeriodFromQuery } from "../helper/period-query.helper";
import { getDateRangeForPeriod, toSqlDate } from "../helper/period.helper";
import type { IEmployeeService } from "../interface/employee.interface";
import type { ICommissionRulesProvider } from "../interface/commission-rules.interface";
import type {
  ITargetOverrideService,
  TargetOverrideInput,
  TargetOverrideItem,
  TargetOverrideRosterItem,
  TargetOverrideRow,
} from "../interface/target-override.interface";

/** Admin-only: manual per-Account-Manager targets over a period range — see TargetOverrideService. */
export class TargetOverrideController {
  constructor(
    private readonly targetOverrideService: ITargetOverrideService,
    private readonly employeeService: IEmployeeService,
    private readonly rulesProvider: ICommissionRulesProvider,
  ) {}

  /** Every Account Manager of the period with their default/effective target and manual ranges. */
  async list(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const { start, end } = getDateRangeForPeriod(period);
    const [roster, rows, rules] = await Promise.all([
      this.employeeService.getSalesTargetsByPeriod(toSqlDate(start), toSqlDate(end)),
      this.targetOverrideService.listFrom(period),
      this.rulesProvider.getForPeriod(period),
    ]);

    const editorIds = [...new Set(rows.map((r) => r.updated_by ?? r.created_by))];
    const editors = editorIds.length > 0 ? await this.employeeService.findByEmployeeIds(editorIds) : [];
    const nameById = new Map(editors.map((e) => [e.employee_id, e.name]));
    const toItem = (r: TargetOverrideRow): TargetOverrideItem => {
      const updatedBy = r.updated_by ?? r.created_by;
      return {
        id: r.id,
        target: Number(r.target),
        startPeriod: r.start_period,
        endPeriod: r.end_period,
        note: r.note,
        updatedBy,
        updatedByName: nameById.get(updatedBy) ?? null,
        updatedAt: r.updated_at ?? r.created_at,
      };
    };

    const data: TargetOverrideRosterItem[] = roster.map((e) => {
      const own = rows.filter((r) => r.employee_id === e.employeeId);
      const active = own.find((r) => r.start_period <= period) ?? null;
      const defaultTarget = resolveTarget(rules, period, e.status, e.target);
      return {
        employeeId: e.employeeId,
        name: e.name,
        photoProfile: e.photoProfile,
        status: e.status ?? null,
        defaultTarget,
        effectiveTarget: active ? Number(active.target) : defaultTarget,
        active: active ? toItem(active) : null,
        upcoming: own.filter((r) => r.start_period > period).map(toItem),
      };
    });

    return c.json(successResponse("Target overrides retrieved successfully", data));
  }

  async create(c: Context) {
    const body = await c.req.json();
    const employeeId = String(body.employeeId ?? "").trim();
    if (!employeeId) throw new BadRequestException("Parameter employeeId is required");
    await this.targetOverrideService.create(employeeId, this.parseInput(body), c.get("user").sub);
    return c.json(successResponse("Target override created successfully"));
  }

  async update(c: Context) {
    const body = await c.req.json();
    await this.targetOverrideService.update(this.idParam(c), this.parseInput(body), c.get("user").sub);
    return c.json(successResponse("Target override updated successfully"));
  }

  async remove(c: Context) {
    await this.targetOverrideService.remove(this.idParam(c));
    return c.json(successResponse("Target override deleted successfully"));
  }

  private parseInput(body: any): TargetOverrideInput {
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    return {
      target: Number(body.target),
      startPeriod: String(body.startPeriod ?? ""),
      endPeriod: String(body.endPeriod ?? ""),
      note,
    };
  }

  private idParam(c: Context): number {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException("Invalid id");
    return id;
  }
}

import type { Context } from "hono";
import { BadRequestException, NotFoundException } from "../exception/http.exception";
import { successResponse } from "../helper/api-response.helper";
import { resolvePeriodFromQuery } from "../helper/period-query.helper";
import { getDateRangeForPeriod, toSqlDate } from "../helper/period.helper";
import type { CommissionService } from "../service/commission.service";
import type { IChurnService } from "../interface/churn.interface";
import type { IEmployeeService } from "../interface/employee.interface";
import { ADJUSTABLE_FIELD_COLUMNS, type AdjustableSnapshotFields } from "../interface/adjustment.interface";
import type { ConsistencyBonusItem, IConsistencyBonusService } from "../interface/consistency-bonus.interface";

/** Admin-only cross-employee views: every Account Manager/Manager/invoice/churn row for a period. */
export class SummaryController {
  constructor(
    private readonly commissionService: CommissionService,
    private readonly churnService: IChurnService,
    private readonly employeeService: IEmployeeService,
    private readonly consistencyBonusService: IConsistencyBonusService,
  ) {}

  async sales(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const data = await this.commissionService.getSalesSummary(period);
    return c.json(successResponse("Sales summary retrieved successfully", data));
  }

  async manager(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const data = await this.commissionService.getManagerSummary(period);
    return c.json(successResponse("Manager summary retrieved successfully", data));
  }

  async invoice(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const data = await this.commissionService.getInvoiceSummary(period);
    return c.json(successResponse("Invoice summary retrieved successfully", data));
  }

  async approveInvoice(c: Context) {
    const aiInvoice = Number.parseInt(c.req.param("ai")!, 10);
    const body = await c.req.json();
    await this.commissionService.approveInvoice(aiInvoice, Boolean(body.isApproved));
    return c.json(successResponse("Invoice approval updated successfully"));
  }

  /** Full raw invoice row for the admin adjustment form — every field, not just the summary list's subset. */
  async invoiceDetail(c: Context) {
    const aiInvoice = Number.parseInt(c.req.param("ai")!, 10);
    const data = await this.commissionService.getInvoiceDetail(aiInvoice);
    return c.json(successResponse("Invoice detail retrieved successfully", data));
  }

  /**
   * Admin correction of one invoice row's underlying data (customer,
   * service, financial, or attribution fields) — anything beyond what the
   * dedicated approve/referral endpoints cover. Only keys present in the
   * request body are changed; everything else on the row is left alone.
   */
  async adjustInvoice(c: Context) {
    const aiInvoice = Number.parseInt(c.req.param("ai")!, 10);
    const body = await c.req.json();
    const user = c.get("user");

    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note) {
      throw new BadRequestException("Parameter note is required");
    }

    const changes: AdjustableSnapshotFields = {};
    for (const key of Object.keys(ADJUSTABLE_FIELD_COLUMNS) as (keyof AdjustableSnapshotFields)[]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        (changes as Record<string, unknown>)[key] = body[key];
      }
    }

    await this.commissionService.adjustInvoice(aiInvoice, user.sub, changes, note);
    return c.json(successResponse("Invoice adjusted successfully"));
  }

  /** Before/after history of admin corrections made to one invoice row. */
  async invoiceAdjustments(c: Context) {
    const aiInvoice = Number.parseInt(c.req.param("ai")!, 10);
    const data = await this.commissionService.getInvoiceAdjustments(aiInvoice);
    return c.json(successResponse("Invoice adjustment history retrieved successfully", data));
  }

  async churn(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const { start, end } = getDateRangeForPeriod(period);
    const search = c.req.query("search");
    const data = await this.churnService.getSummary(toSqlDate(start), toSqlDate(end), search);
    return c.json(successResponse("Churn summary retrieved successfully", data));
  }

  async approveChurn(c: Context) {
    const customerServiceId = c.req.param("id")!;
    const body = await c.req.json();
    await this.churnService.updateApproval(customerServiceId, Boolean(body.isApproved));
    return c.json(successResponse("Churn approval updated successfully"));
  }

  /**
   * Every Account Manager registered for a period (has a status_period row —
   * KOMISI.md 6.E) with their New Achievement target. Anyone not yet
   * crawled for that period simply doesn't appear.
   */
  async target(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const { start, end } = getDateRangeForPeriod(period);
    const data = await this.employeeService.getSalesTargetsByPeriod(toSqlDate(start), toSqlDate(end));
    return c.json(successResponse("Sales target retrieved successfully", data));
  }

  /** Admin override of one Account Manager's New Achievement target for a period. */
  async updateTarget(c: Context) {
    const employeeId = c.req.param("id")!;
    const period = resolvePeriodFromQuery(c);
    const { start, end } = getDateRangeForPeriod(period);
    const body = await c.req.json();

    const target = Number.parseInt(body.target, 10);
    if (Number.isNaN(target) || target < 0) {
      throw new BadRequestException("Parameter target must be a non-negative integer");
    }

    const updated = await this.employeeService.updateTargetByPeriod(
      employeeId,
      toSqlDate(start),
      toSqlDate(end),
      target,
    );
    if (!updated) {
      throw new NotFoundException("This employee isn't registered for that period yet");
    }

    return c.json(successResponse("Sales target updated successfully"));
  }

  /**
   * Every Account Manager registered for a period with their Bonus
   * Konsistensi grant, if any — same period-aware roster as Target.
   */
  async consistencyBonus(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const { start, end } = getDateRangeForPeriod(period);
    const roster = await this.employeeService.getSalesTargetsByPeriod(toSqlDate(start), toSqlDate(end));
    const employeeIds = roster.map((e) => e.employeeId);

    const grants = await this.consistencyBonusService.getGrantsByEmployeeIds(employeeIds, period);
    const grantedByIds = [...new Set([...grants.values()].map((g) => g.granted_by))];
    const granters = await this.employeeService.findByEmployeeIds(grantedByIds);
    const granterNameById = new Map(granters.map((g) => [g.employee_id, g.name]));

    const data: ConsistencyBonusItem[] = roster.map((e) => {
      const grant = grants.get(e.employeeId);
      return {
        employeeId: e.employeeId,
        name: e.name,
        photoProfile: e.photoProfile,
        status: e.status,
        amount: grant ? Number(grant.amount) : 0,
        note: grant?.note ?? null,
        months: grant?.months ?? null,
        serviceCount: grant?.service_count ?? null,
        testimonialLink: grant?.testimonial_link ?? null,
        grantedBy: grant?.granted_by ?? null,
        grantedByName: grant ? (granterNameById.get(grant.granted_by) ?? null) : null,
        createdAt: grant?.created_at ?? null,
      };
    });

    return c.json(successResponse("Consistency bonus retrieved successfully", data));
  }

  /** Admin grant (or edit re-grant) of Bonus Konsistensi for one Account Manager in a period — amount is admin-entered. */
  async grantConsistencyBonus(c: Context) {
    const employeeId = c.req.param("id")!;
    const period = resolvePeriodFromQuery(c);
    const body = await c.req.json();
    const user = c.get("user");

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Parameter amount is required");
    }

    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note) {
      throw new BadRequestException("Parameter note is required");
    }

    const serviceCount = Number(body.serviceCount);
    if (!Number.isFinite(serviceCount) || serviceCount < 0) {
      throw new BadRequestException("Parameter serviceCount is required");
    }

    const months =
      Array.isArray(body.months) && body.months.length > 0
        ? body.months.map((m: unknown) => Number(m)).join(",")
        : null;
    const testimonialLink = typeof body.testimonialLink === "string" && body.testimonialLink.trim() ? body.testimonialLink.trim() : null;

    await this.consistencyBonusService.grant(employeeId, period, amount, note, months, serviceCount, testimonialLink, user.sub);
    return c.json(successResponse("Consistency bonus granted successfully"));
  }

  /** Admin revocation of a previously-granted Bonus Konsistensi for one Account Manager in a period. */
  async revokeConsistencyBonus(c: Context) {
    const employeeId = c.req.param("id")!;
    const period = resolvePeriodFromQuery(c);
    await this.consistencyBonusService.revoke(employeeId, period);
    return c.json(successResponse("Consistency bonus revoked successfully"));
  }
}

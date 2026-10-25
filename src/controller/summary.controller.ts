import type { Context } from "hono";
import { BadRequestException, NotFoundException } from "../exception/http.exception";
import { inAdminBranch } from "../helper/access.helper";
import { successResponse } from "../helper/api-response.helper";
import { isSdr } from "../helper/commission.helper";
import { resolvePeriodFromQuery } from "../helper/period-query.helper";
import { currentCommissionPeriod, getDateRangeForPeriod, toSqlDate } from "../helper/period.helper";
import type { CommissionService } from "../service/commission.service";
import type { IChurnService } from "../interface/churn.interface";
import type { IEmployeeService } from "../interface/employee.interface";
import { ADJUSTABLE_FIELD_COLUMNS, type AdjustableSnapshotFields } from "../interface/adjustment.interface";
import type { ConsistencyBonusItem, IConsistencyBonusService } from "../interface/consistency-bonus.interface";
import type { IPeriodClosingService } from "../interface/period-closing.interface";
import type { ICommissionRulesProvider } from "../interface/commission-rules.interface";

/** Admin-only cross-employee views: every Account Manager/Manager/invoice/churn row for a period — a branch Admin gets only their branch's rows (adminMiddleware). */
export class SummaryController {
  constructor(
    private readonly commissionService: CommissionService,
    private readonly churnService: IChurnService,
    private readonly employeeService: IEmployeeService,
    private readonly consistencyBonusService: IConsistencyBonusService,
    private readonly periodClosingService: IPeriodClosingService,
    private readonly commissionRuleService: ICommissionRulesProvider,
  ) {}

  async sales(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const data = inAdminBranch(c, await this.commissionService.getSalesSummary(period), (r) => r.branch);
    return c.json(successResponse("Sales summary retrieved successfully", data));
  }

  async manager(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const data = inAdminBranch(c, await this.commissionService.getManagerSummary(period), (r) => r.branch);
    return c.json(successResponse("Manager summary retrieved successfully", data));
  }

  async invoice(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const data = inAdminBranch(c, await this.commissionService.getInvoiceSummary(period), (r) => r.branch);
    return c.json(successResponse("Invoice summary retrieved successfully", data));
  }

  /** Closed periods are final: their invoices, churns and bonuses can't change until a Super Admin reopens them. */
  private async assertOpen(period: string) {
    if (await this.periodClosingService.isClosed(period)) {
      throw new BadRequestException(`Periode ${period} sudah ditutup. Buka kembali periodenya untuk mengubah data.`);
    }
  }

  async approveInvoice(c: Context) {
    const aiInvoice = Number.parseInt(c.req.param("ai")!, 10);
    await this.assertOpen((await this.commissionService.getInvoiceDetail(aiInvoice)).period);
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
    await this.assertOpen((await this.commissionService.getInvoiceDetail(aiInvoice)).period);
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
    const rows = await this.churnService.getSummary(toSqlDate(start), toSqlDate(end), search);
    const data = inAdminBranch(c, rows, (r) => r.employee_branch);
    return c.json(successResponse("Churn summary retrieved successfully", data));
  }

  /**
   * Every service stopped (NA) in NIS for the period, live from billing, each
   * marked churn or with why not, and whether it is on the Churn list (and
   * waived there). `carried` lists the Churn list's rows whose service isn't
   * among them (churn:carry, or changed in NIS after a closed period froze
   * the list), so both pages add up. `closed`: the Churn list is frozen.
   */
  async stoppedServices(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const { start, end } = getDateRangeForPeriod(period);
    const startDate = toSqlDate(start);
    const endDate = toSqlDate(end);
    const rules = await this.commissionRuleService.getForPeriod(period);
    const serviceIds = rules.products.filter((p) => p.churn).flatMap((p) => p.serviceIds);

    const [rows, listed, closed] = await Promise.all([
      this.churnService.getStoppedServices(serviceIds, startDate, endDate, rules.churnCloseReasons),
      this.churnService.getSummary(startDate, endDate),
      this.periodClosingService.isClosed(period),
    ]);
    const listedById = new Map(listed.map((r) => [Number(r.customer_service_id), r]));
    const salesIds = [...new Set(rows.map((r) => r.sales_id).filter((id): id is string => !!id))];
    const employees = new Map((await this.employeeService.findByEmployeeIds(salesIds)).map((e) => [e.employee_id, e]));

    const services = inAdminBranch(
      c,
      rows.map((r) => {
        const sales = r.sales_id ? employees.get(r.sales_id) : undefined;
        return {
          ...r,
          employee_name: sales?.name ?? null,
          employee_photo: sales?.photo_profile ?? null,
          employee_branch: sales?.branch ?? null,
          in_churn_list: listedById.has(Number(r.customer_service_id)),
          is_approved: !!listedById.get(Number(r.customer_service_id))?.is_approved,
        };
      }),
      (r) => r.employee_branch,
    );
    const stoppedIds = new Set(rows.map((r) => Number(r.customer_service_id)));
    const carried = inAdminBranch(
      c,
      listed.filter((r) => !stoppedIds.has(Number(r.customer_service_id))),
      (r) => r.employee_branch,
    ).map((r) => ({
      customer_service_id: r.customer_service_id,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      customer_service_account: r.customer_service_account,
      service_id: r.service_id,
      service_name: r.service_name,
      registration_date: r.registration_date,
      unregistration_date: r.unregistration_date,
      deduct_date: r.deduct_date,
      close_status: r.close_status,
      close_reason: r.close_reason,
      reason: r.reason,
      price: Number(r.price ?? 0),
      sales_id: r.sales_id,
      is_approved: !!r.is_approved,
      employee_name: r.employee_name,
      employee_photo: r.employee_photo,
      employee_branch: r.employee_branch,
    }));
    return c.json(successResponse("Stopped services retrieved successfully", { services, carried, closed }));
  }

  /** Waive (approve) a churn so it no longer cuts the AM's commission — a reason is required for the audit trail. */
  async approveChurn(c: Context) {
    const customerServiceId = c.req.param("id")!;
    const churnDate = await this.churnService.getChurnDate(customerServiceId);
    if (!churnDate) throw new NotFoundException("Churn tidak ditemukan");
    await this.assertOpen(currentCommissionPeriod(new Date(`${churnDate}T00:00:00`)));
    const body = await c.req.json();
    const isApproved = Boolean(body.isApproved);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (isApproved && !note) {
      throw new BadRequestException("Alasan pembebasan churn wajib diisi");
    }
    await this.churnService.updateApproval(customerServiceId, isApproved, isApproved ? note : null, c.get("user").sub);
    return c.json(successResponse("Churn approval updated successfully"));
  }

  /**
   * Every Account Manager registered for a period with their Bonus
   * Konsistensi grant, if any — same period-aware roster as Target.
   */
  async consistencyBonus(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const { start, end } = getDateRangeForPeriod(period);
    const roster = inAdminBranch(c, await this.employeeService.getSalesTargetsByPeriod(toSqlDate(start), toSqlDate(end)), (e) => e.branch);
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
        branch: e.branch,
        isSdr: isSdr(e.jobPosition),
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
    await this.assertOpen(period);
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
    await this.assertOpen(period);
    await this.consistencyBonusService.revoke(employeeId, period);
    return c.json(successResponse("Consistency bonus revoked successfully"));
  }

  /** Closed periods (frozen: the import/churn jobs no longer re-crawl them). */
  async periodClosings(c: Context) {
    const rows = await this.periodClosingService.list();
    const closers = await this.employeeService.findByEmployeeIds([...new Set(rows.map((r) => r.closed_by))]);
    const nameById = new Map(closers.map((e) => [e.employee_id, e.name]));
    const data = rows.map((r) => ({
      period: r.period,
      closedBy: r.closed_by,
      closedByName: nameById.get(r.closed_by) ?? null,
      closedAt: r.closed_at,
    }));
    return c.json(successResponse("Closed periods retrieved successfully", data));
  }

  async closePeriod(c: Context) {
    const period = resolvePeriodFromQuery(c);
    await this.periodClosingService.close(period, c.get("user").sub);
    return c.json(successResponse("Period closed successfully"));
  }

  async reopenPeriod(c: Context) {
    const period = resolvePeriodFromQuery(c);
    await this.periodClosingService.reopen(period);
    return c.json(successResponse("Period reopened successfully"));
  }
}

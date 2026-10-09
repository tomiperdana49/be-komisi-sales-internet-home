import type { Context } from "hono";
import { successResponse } from "../helper/api-response.helper";
import { resolvePeriodFromQuery, resolveYearFromQuery } from "../helper/period-query.helper";
import type { IPeriodClosingService } from "../interface/period-closing.interface";
import type { CommissionService } from "../service/commission.service";

export class CommissionController {
  constructor(
    private readonly commissionService: CommissionService,
    private readonly periodClosingService: IPeriodClosingService,
  ) {}

  /** When the period was closed (frozen) by an admin, or null while it is still open. */
  private async closedAt(period: string): Promise<string | null> {
    const rows = await this.periodClosingService.list();
    return rows.find((r) => r.period === period)?.closed_at ?? null;
  }

  /** Commission summary for one salesperson: totals, breakdown, achievement, bonus. */
  async salesCommission(c: Context) {
    const employeeId = c.req.param("id")!;
    const period = resolvePeriodFromQuery(c);

    const [result, closedAt] = await Promise.all([
      this.commissionService.getSalesCommission(employeeId, period),
      this.closedAt(period),
    ]);
    const { items, ...summary } = result;

    return c.json(successResponse("Commission retrieved successfully", { ...summary, closedAt }));
  }

  /** Per-month totals for a whole year, for the dashboard's yearly chart. */
  async salesCommissionYear(c: Context) {
    const employeeId = c.req.param("id")!;
    const year = resolveYearFromQuery(c);

    const result = await this.commissionService.getSalesCommissionYear(employeeId, year);
    return c.json(successResponse("Yearly commission retrieved successfully", result));
  }

  /** The underlying billing invoice list, each row with its own commission. */
  async salesInvoice(c: Context) {
    const employeeId = c.req.param("id")!;
    const period = resolvePeriodFromQuery(c);

    const result = await this.commissionService.getSalesCommission(employeeId, period);

    return c.json(
      successResponse("Invoice retrieved successfully", {
        period: result.period,
        startDate: result.startDate,
        endDate: result.endDate,
        count: result.items.length,
        data: result.items,
      }),
    );
  }

  /** Itemized churn rows behind this period's deduction total. */
  async salesChurn(c: Context) {
    const employeeId = c.req.param("id")!;
    const period = resolvePeriodFromQuery(c);

    const data = await this.commissionService.getSalesChurn(employeeId, period);
    return c.json(successResponse("Churn retrieved successfully", data));
  }

  /** Manager Area commission: team target/achievement, overriding New/Recurring, and personal sales. */
  async managerCommission(c: Context) {
    const managerId = c.req.param("id")!;
    const period = resolvePeriodFromQuery(c);

    const [result, closedAt] = await Promise.all([
      this.commissionService.getManagerCommission(managerId, period),
      this.closedAt(period),
    ]);
    return c.json(successResponse("Manager commission retrieved successfully", { ...result, closedAt }));
  }

  /** Per-month manager commission for a whole year, for the dashboard's yearly charts. */
  async managerCommissionYear(c: Context) {
    const managerId = c.req.param("id")!;
    const year = resolveYearFromQuery(c);

    const result = await this.commissionService.getManagerCommissionYear(managerId, year);
    return c.json(successResponse("Yearly manager commission retrieved successfully", result));
  }
}

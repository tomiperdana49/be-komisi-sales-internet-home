import type { Context } from "hono";
import { BadRequestException, ForbiddenException, NotFoundException } from "../exception/http.exception";
import { inAdminBranch } from "../helper/access.helper";
import { successResponse } from "../helper/api-response.helper";
import { resolvePeriodFromQuery } from "../helper/period-query.helper";
import { commissionPeriodOf, getDateRangeForPeriod, toSqlDate } from "../helper/period.helper";
import type { IEmployeeService } from "../interface/employee.interface";
import type { IPeriodClosingService } from "../interface/period-closing.interface";
import type {
  ITestimonialService,
  TestimonialInput,
  TestimonialItem,
  TestimonialRow,
} from "../interface/testimonial.interface";

/**
 * Customer testimonials. An Account Manager (or anyone above them) enters and
 * lists them on the dashboard; admins list every one dated in a period.
 * Once the period a testimonial is dated in is closed, only a Super Admin can
 * add, change or delete it.
 */
export class TestimonialController {
  constructor(
    private readonly testimonialService: ITestimonialService,
    private readonly employeeService: IEmployeeService,
    private readonly periodClosingService: IPeriodClosingService,
  ) {}

  /** One Account Manager's testimonials (the `:id` route is guarded by hierarchyMiddleware). */
  async listBySales(c: Context) {
    const rows = await this.testimonialService.listByEmployeeId(c.req.param("id")!);
    return c.json(successResponse("Testimonials retrieved successfully", await this.withPeriodClosed(await this.testimonialService.toItems(rows))));
  }

  /** Admin listing: every testimonial dated within the period, limited to the admin's branch. */
  async listByPeriod(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const { start, end } = getDateRangeForPeriod(period);
    const rows = await this.testimonialService.listByDateRange(toSqlDate(start), toSqlDate(end));
    const data = inAdminBranch(c, await this.testimonialService.toItems(rows), (r) => r.branch);
    return c.json(successResponse("Testimonials retrieved successfully", await this.withPeriodClosed(data)));
  }

  async create(c: Context) {
    const employeeId = c.req.param("id")!;
    const employee = await this.employeeService.findByEmployeeId(employeeId);
    if (!employee) throw new NotFoundException("Employee not found");

    const input = this.parseInput(await c.req.json());
    await this.assertOpen(c, [input.testimonialDate]);
    await this.testimonialService.create(employeeId, employee.managerEmployeeId ?? null, input, c.get("user").sub);
    this.syncSheet();
    return c.json(successResponse("Testimonial created successfully"), 201);
  }

  /** Fixes a testimonial entered wrongly. */
  async update(c: Context) {
    const row = await this.findChangeable(c);
    const input = this.parseInput(await c.req.json());
    await this.assertOpen(c, [row.testimonial_date, input.testimonialDate]);
    await this.testimonialService.update(row.id, input, c.get("user").sub);
    this.syncSheet();
    return c.json(successResponse("Testimonial updated successfully"));
  }

  async remove(c: Context) {
    const row = await this.findChangeable(c);
    await this.assertOpen(c, [row.testimonial_date]);
    await this.testimonialService.remove(row.id);
    this.syncSheet();
    return c.json(successResponse("Testimonial deleted successfully"));
  }

  /** The `:testimonialId` row of the `:id` Account Manager; only whoever entered it, or a Super Admin, may change it. */
  private async findChangeable(c: Context): Promise<TestimonialRow> {
    const id = Number(c.req.param("testimonialId"));
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException("Invalid id");

    const row = await this.testimonialService.findById(id);
    if (!row || row.employee_id !== c.req.param("id")) throw new NotFoundException("Testimonial not found");

    if (row.created_by !== c.get("user").sub && !(await this.isSuperAdmin(c))) {
      throw new ForbiddenException("Only the creator or a Super Admin can change this testimonial");
    }
    return row;
  }

  private async isSuperAdmin(c: Context): Promise<boolean> {
    const caller = await this.employeeService.findByEmployeeId(c.get("user").sub);
    const access = caller ? await this.employeeService.withAccess(caller) : null;
    return Boolean(access?.is_super_admin);
  }

  /** Rejects the change when any of the testimonial dates falls in a closed period, unless a Super Admin makes it. */
  private async assertOpen(c: Context, dates: string[]): Promise<void> {
    const periods = [...new Set(dates.map(commissionPeriodOf).filter((p): p is string => Boolean(p)))];
    const open = await this.periodClosingService.filterOpen(periods);
    const closed = periods.find((p) => !open.includes(p));
    if (closed && !(await this.isSuperAdmin(c))) {
      throw new BadRequestException(`Periode ${closed} sudah ditutup. Testimoni di periode ini hanya bisa diubah Super Admin.`);
    }
  }

  /** Flags the testimonials dated in a closed period, so the dashboard hides their edit and delete buttons. */
  private async withPeriodClosed(items: TestimonialItem[]): Promise<TestimonialItem[]> {
    const periods = [...new Set(items.map((t) => commissionPeriodOf(t.testimonialDate)).filter((p): p is string => Boolean(p)))];
    const open = new Set(await this.periodClosingService.filterOpen(periods));
    return items.map((t) => ({ ...t, periodClosed: !open.has(commissionPeriodOf(t.testimonialDate) ?? "") }));
  }

  private parseInput(body: any): TestimonialInput {
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const input = {
      customerId: text(body.customerId),
      customerName: text(body.customerName),
      testimonialDate: text(body.testimonialDate),
      link: text(body.link),
    };

    if (!input.customerId) throw new BadRequestException("Parameter customerId is required");
    if (!input.customerName) throw new BadRequestException("Parameter customerName is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.testimonialDate) || Number.isNaN(Date.parse(input.testimonialDate))) {
      throw new BadRequestException("Parameter testimonialDate must be YYYY-MM-DD");
    }
    if (input.testimonialDate > toSqlDate(new Date())) {
      throw new BadRequestException("Parameter testimonialDate cannot be in the future");
    }
    if (!/^https?:\/\/\S+$/i.test(input.link) || input.link.length > 500) {
      throw new BadRequestException("Parameter link must be an http(s) URL");
    }
    return input;
  }

  /** Mirrors the change to the marketing sheet without making the user wait; a failed sync is retried by the next change or `bun run testimonial:sync`. */
  private syncSheet(): void {
    this.testimonialService.syncSheet().catch((error) => console.error("Testimonial sheet sync failed:", error));
  }

}

import type { Context } from "hono";
import { BadRequestException } from "../exception/http.exception";
import { successResponse } from "../helper/api-response.helper";
import { resolvePeriodFromQuery } from "../helper/period-query.helper";
import type { CommissionRuleService } from "../service/commission-rule.service";
import type { CommissionService } from "../service/commission.service";

/** Admin-only: versioned commission rules (rates, tiers, thresholds) — see CommissionRuleService. */
export class CommissionRuleController {
  constructor(
    private readonly ruleService: CommissionRuleService,
    private readonly commissionService: CommissionService,
  ) {}

  async list(c: Context) {
    const data = await this.ruleService.list();
    return c.json(successResponse("Commission rules retrieved successfully", data));
  }

  async effective(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const data = await this.ruleService.getEffective(period);
    return c.json(successResponse("Effective commission rules retrieved successfully", data));
  }

  async show(c: Context) {
    const data = await this.ruleService.get(this.idParam(c));
    return c.json(successResponse("Commission rule set retrieved successfully", data));
  }

  async create(c: Context) {
    const user = c.get("user");
    const body = await c.req.json();
    const effectivePeriod = String(body.effectivePeriod ?? "");
    const copyFromId = body.copyFromId ? Number(body.copyFromId) : undefined;
    const data = await this.ruleService.createDraft(effectivePeriod, String(body.note ?? ""), user.sub, copyFromId);
    return c.json(successResponse("Draft created successfully", data));
  }

  async update(c: Context) {
    const user = c.get("user");
    const body = await c.req.json();
    const data = await this.ruleService.updateDraft(
      this.idParam(c),
      String(body.effectivePeriod ?? ""),
      body.rules,
      String(body.note ?? ""),
      user.sub,
    );
    return c.json(successResponse("Draft updated successfully", data));
  }

  async preview(c: Context) {
    const period = resolvePeriodFromQuery(c);
    const data = await this.ruleService.preview(this.idParam(c), period, this.commissionService);
    return c.json(successResponse("Preview generated successfully", data));
  }

  async publish(c: Context) {
    const user = c.get("user");
    const data = await this.ruleService.publish(this.idParam(c), user.sub);
    return c.json(successResponse("Commission rules published successfully", data));
  }

  async remove(c: Context) {
    await this.ruleService.deleteDraft(this.idParam(c));
    return c.json(successResponse("Draft deleted successfully"));
  }

  private idParam(c: Context): number {
    const id = Number.parseInt(c.req.param("id") ?? "", 10);
    if (Number.isNaN(id)) throw new BadRequestException("Parameter id is invalid");
    return id;
  }
}

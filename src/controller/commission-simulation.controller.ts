import type { Context } from "hono";
import { successResponse } from "../helper/api-response.helper";
import type { AccessTokenPayload } from "../interface/auth.interface";
import type { CommissionSimulationService } from "../service/commission-simulation.service";

export class CommissionSimulationController {
  constructor(private readonly service: CommissionSimulationService) {}

  /** Every logged-in user reads it: the AM page shows the simulated figures to everyone. */
  async get(c: Context) {
    const user = c.get("user") as AccessTokenPayload;
    const value = await this.service.get();
    return c.json(successResponse("Commission simulation retrieved", { ...value, canEdit: this.service.canEdit(user?.email) }));
  }

  async save(c: Context) {
    const user = c.get("user") as AccessTokenPayload;
    const body = await c.req.json().catch(() => ({}));
    const value = await this.service.save(user?.email, body);
    return c.json(successResponse("Commission simulation saved", { ...value, canEdit: true }));
  }
}

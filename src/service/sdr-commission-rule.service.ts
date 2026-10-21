import { DEFAULT_SDR_RULES } from "../helper/commission-rules.default";
import {
  sdrRulesSchema,
  type ICommissionRuleRepository,
  type ISdrRulesProvider,
  type SdrCommissionRules,
} from "../interface/commission-rules.interface";
import type { IEmployeeService } from "../interface/employee.interface";
import type { CommissionService } from "./commission.service";
import { RuleSetService } from "./rule-set.service";

/**
 * Versioned SDR commission rules (admin page "Aturan Komisi SDR"), table
 * sdr_commission_rule_set — separate versions from the Home rules. Periods
 * with no published set use DEFAULT_SDR_RULES. See RuleSetService.
 */
export class SdrCommissionRuleService extends RuleSetService<SdrCommissionRules> implements ISdrRulesProvider {
  constructor(repository: ICommissionRuleRepository<SdrCommissionRules>, employeeService: IEmployeeService) {
    super(repository, employeeService, {
      schema: sdrRulesSchema,
      defaults: DEFAULT_SDR_RULES,
      table: "sdr_commission_rule_set",
    });
  }

  /** What every SDR's commission would be for `period` under a draft, next to what it is now. Read-only. */
  async preview(id: number, period: string, engine: CommissionService) {
    const draftRules = await this.getDraftRules(id);
    const draftEngine = engine.withSdrRules({ getForPeriod: async () => draftRules });

    const [currentSales, draftSales] = await Promise.all([
      engine.getSalesSummary(period),
      draftEngine.getSalesSummary(period),
    ]);
    const draftSalesById = new Map(draftSales.map((r) => [r.employeeId, r]));

    const sales = currentSales.filter((r) => r.isSdr).map((r) => {
      const d = draftSalesById.get(r.employeeId);
      return {
        employeeId: r.employeeId,
        name: r.name,
        photoProfile: r.photoProfile,
        currentStatus: r.achievementStatus,
        draftStatus: d?.achievementStatus ?? r.achievementStatus,
        current: r.totalCommission,
        draft: d?.totalCommission ?? r.totalCommission,
      };
    });

    return { period, sales, managers: [] };
  }
}

import { DEFAULT_COMMISSION_RULES } from "../helper/commission-rules.default";
import {
  commissionRulesSchema,
  type CommissionRules,
  type ICommissionRuleRepository,
  type ICommissionRulesProvider,
} from "../interface/commission-rules.interface";
import type { IEmployeeService } from "../interface/employee.interface";
import type { CommissionService } from "./commission.service";
import { RuleSetService } from "./rule-set.service";

/**
 * Versioned Home commission rules (Account Manager & Sales Manager), table
 * commission_rule_set. Periods with no published set fall back to
 * DEFAULT_COMMISSION_RULES, which keeps every period from before this
 * feature computing exactly what it always did. See RuleSetService.
 */
export class CommissionRuleService extends RuleSetService<CommissionRules> implements ICommissionRulesProvider {
  constructor(repository: ICommissionRuleRepository<CommissionRules>, employeeService: IEmployeeService) {
    super(repository, employeeService, {
      schema: commissionRulesSchema,
      defaults: DEFAULT_COMMISSION_RULES,
      table: "commission_rule_set",
    });
  }

  /**
   * What every Account Manager's and Sales Manager's commission would be for
   * `period` under a draft, next to what it is now. Read-only.
   */
  async preview(id: number, period: string, engine: CommissionService) {
    const draftRules = await this.getDraftRules(id);
    const draftEngine = engine.withRules({
      // Earlier periods keep their published rules (churn is valued at its sale period's rules).
      getForPeriod: async (p: string) => (p >= period ? draftRules : this.getForPeriod(p)),
    });

    const [currentSales, draftSales, currentManagers, draftManagers] = await Promise.all([
      engine.getSalesSummary(period),
      draftEngine.getSalesSummary(period),
      engine.getManagerSummary(period),
      draftEngine.getManagerSummary(period),
    ]);

    const draftSalesById = new Map(draftSales.map((r) => [r.employeeId, r]));
    const draftManagersById = new Map(draftManagers.map((r) => [r.employeeId, r]));

    // SDRs are commissioned on their own rules (SdrCommissionRuleService), so a Home draft never moves them.
    const sales = currentSales.filter((r) => !r.isSdr).map((r) => {
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
    const managers = currentManagers.map((r) => {
      const d = draftManagersById.get(r.employeeId);
      return {
        employeeId: r.employeeId,
        name: r.name,
        photoProfile: r.photoProfile,
        current: r.managerTotalCommission,
        draft: d?.managerTotalCommission ?? r.managerTotalCommission,
      };
    });

    return { period, sales, managers };
  }
}

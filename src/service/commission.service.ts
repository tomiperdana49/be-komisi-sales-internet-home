import {
  applyLateMonthPenalty,
  calculateAchievement,
  calculateExcessServiceBonus,
  calculateMonthlyBonus,
  calculateCommission,
  calculateManagerPerformance,
  calculateNusaSelectaActivity,
  getCommissionBasis,
  getManagerNewCommissionBasis,
  getManagerNewCommissionRate,
  getManagerRecurringRate,
  getRecurringServiceGroupLabel,
  getServiceGroupLabel,
  hasCommissionRate,
  isDomainService,
  isNusaBasicPrime,
  isNusaSelecta,
  isNusaUltra,
  resolveBusinessOperation,
  resolveTarget,
  toCommissionCategory,
  toNumber,
  type SnapshotType,
} from "../helper/commission.helper";
import { getDateRangeForPeriod, toSqlDate } from "../helper/period.helper";
import type {
  CommissionBreakdown,
  CommissionLineItem,
  CommissionSnapshotRow,
  CommissionStats,
  InvoiceSummaryItem,
  ISnapshotReadRepository,
  ManagerCommissionResult,
  ManagerSummaryItem,
  SalesCommissionResult,
  SalesSummaryItem,
} from "../interface/commission.interface";
import type { ChurnRow, IChurnService } from "../interface/churn.interface";
import type { IEmployeeService } from "../interface/employee.interface";
import type { CommissionRules, ICommissionRulesProvider } from "../interface/commission-rules.interface";
import {
  ADJUSTABLE_FIELD_COLUMNS,
  type AdjustableSnapshotFields,
  type SnapshotAdjustmentItem,
  type SnapshotDetailItem,
} from "../interface/adjustment.interface";
import { NotFoundException } from "../exception/http.exception";
import type { IConsistencyBonusService } from "../interface/consistency-bonus.interface";
import { CRO_PLACEHOLDER } from "./employee.service";

function emptyStats(): CommissionStats {
  return { count: 0, commission: 0, subscription: 0, mrc: 0 };
}

function emptyBreakdown(): CommissionBreakdown {
  return {
    new: emptyStats(),
    upgrade: emptyStats(),
    prorate: emptyStats(),
    recurring: emptyStats(),
    alat: emptyStats(),
    setup: emptyStats(),
  };
}

function addTo(target: CommissionStats, values: Partial<CommissionStats>): void {
  target.count += values.count ?? 0;
  target.commission += values.commission ?? 0;
  target.subscription += values.subscription ?? 0;
  target.mrc += values.mrc ?? 0;
}

/**
 * The type a row is commissioned as. A renewal's price increase is stored as
 * "new" (it comes from the new-customer job) but the customer isn't new, so
 * it's commissioned as recurring: recurring rate, no New Achievement credit,
 * no missed-target penalty (KOMISI.md 1.3).
 */
function effectiveType(row: CommissionSnapshotRow): SnapshotType {
  if (row.is_renewal && row.type === "new") return "recurring";
  return row.type ?? "recurring";
}

/** The bucket a row falls into for display: Alat/Setup override the invoice's own type. */
function resolveBucket(row: CommissionSnapshotRow): SnapshotType | "alat" | "setup" {
  const category = toCommissionCategory(row.category);
  if (category === "alat") return "alat";
  if (category === "setup") return "setup";
  return effectiveType(row);
}

/**
 * NusaSelecta packages earn nothing on recurring — only New/Upgrade/Prorate
 * (KOMISI.md 2.A). These rows are dropped outright rather than rated at 0%,
 * matching the legacy behaviour of filtering them in the query. Domain
 * services are dropped from recurring the same way, even when billing files
 * them under Digital Business.
 *
 * Home-category New/Upgrade sales of a service with no configured rate are
 * dropped the same way: they earn no commission AND give no New Achievement
 * credit, rather than silently earning free target progress at 0%. Recurring
 * is unaffected — its rate never depends on the service's rate-table entry.
 */
function isExcludedFromCommission(rules: CommissionRules, row: CommissionSnapshotRow): boolean {
  const bucket = resolveBucket(row);
  if (bucket === "recurring" && isNusaSelecta(rules, row.service_id)) return true;
  if (bucket === "recurring" && isDomainService(row.service_name)) return true;

  const category = toCommissionCategory(row.category);
  if (category === "home" && (bucket === "new" || bucket === "upgrade")) {
    return !hasCommissionRate(rules, row.service_id);
  }

  return false;
}

export class CommissionService {
  constructor(
    private readonly snapshotRepository: ISnapshotReadRepository,
    private readonly churnService: IChurnService,
    private readonly employeeService: IEmployeeService,
    private readonly consistencyBonusService: IConsistencyBonusService,
    private readonly rulesProvider: ICommissionRulesProvider,
  ) {}

  /** Same engine with a different rules source — used to preview a draft rule set without publishing it. */
  withRules(rulesProvider: ICommissionRulesProvider): CommissionService {
    return new CommissionService(
      this.snapshotRepository,
      this.churnService,
      this.employeeService,
      this.consistencyBonusService,
      rulesProvider,
    );
  }

  /**
   * Itemized churn rows for one salesperson in a period, each valued the
   * same way as the deduction it feeds into — what fed the deduction total.
   */
  async getSalesChurn(employeeId: string, period: string) {
    const { start, end } = getDateRangeForPeriod(period);
    const startDate = toSqlDate(start);
    const endDate = toSqlDate(end);

    const [rows, statusPeriod, rules] = await Promise.all([
      this.churnService.getByEmployeeId(employeeId, startDate, endDate),
      this.employeeService.getStatusByPeriod(employeeId, startDate, endDate),
      this.rulesProvider.getForPeriod(period),
    ]);
    const status = statusPeriod?.status ?? null;
    const target = resolveTarget(rules, period, status, statusPeriod?.target);

    return rows.map((churn) => {
      const { mrc, commission, commissionPercentage } = this.valueChurn(rules, churn, status, target);
      return { ...churn, mrc, commission, commissionPercentage };
    });
  }

  /**
   * Lightweight per-month totals for a whole year, reusing getSalesCommission
   * for each period so the dashboard's yearly chart never drifts from the
   * single-period numbers it's built from.
   */
  async getSalesCommissionYear(employeeId: string, year: number) {
    const periods = Array.from({ length: 12 }, (_, i) => `${year}${String(i + 1).padStart(2, "0")}`);
    const months = await Promise.all(
      periods.map((period) => this.getSalesCommission(employeeId, period)),
    );

    const yearly = emptyStats();
    for (const month of months) {
      addTo(yearly, month.total);
    }

    return {
      year,
      employeeId,
      yearly,
      months: months.map(({ items, ...summary }) => summary),
    };
  }

  /**
   * Lightweight per-month totals for a whole year, reusing getManagerCommission
   * for each period.
   */
  async getManagerCommissionYear(managerId: string, year: number) {
    const periods = Array.from({ length: 12 }, (_, i) => `${year}${String(i + 1).padStart(2, "0")}`);
    const months = await Promise.all(
      periods.map((period) => this.getManagerCommission(managerId, period)),
    );

    return { year, managerId, months };
  }

  /**
   * Full commission picture for a Manager Area: team target/achievement
   * (KOMISI.md 6.A/6.B), overriding New/Recurring commission (6.C/6.D), and
   * the manager's own personal-sales commission (6.F), all NET of each
   * team member's own churn/penalties.
   */
  async getManagerCommission(managerId: string, period: string): Promise<ManagerCommissionResult> {
    const { start, end } = getDateRangeForPeriod(period);
    const startDate = toSqlDate(start);
    const endDate = toSqlDate(end);

    // Direct + recursive team, excluding the manager themselves — KOMISI.md
    // 6.F: personal sales must never feed back into team activity.
    const team = await this.employeeService.getHierarchy(managerId, undefined, false, false);
    const teamIds = team.map((e) => e.employee_id);

    const [statusRows, recurringRows, managerStatusPeriod, consistencyBonusByEmployeeId, managerConsistencyBonus, rules] =
      await Promise.all([
        teamIds.length > 0
          ? this.employeeService.getStatusesByPeriodAndIds(teamIds, startDate, endDate)
          : Promise.resolve([]),
        this.snapshotRepository.findRecurringByManager(managerId, period),
        this.employeeService.getStatusByPeriod(managerId, startDate, endDate),
        this.consistencyBonusService.getAmountsByEmployeeIds(teamIds, period),
        this.consistencyBonusService.getAmount(managerId, period),
        this.rulesProvider.getForPeriod(period),
      ]);
    const managerTarget = resolveTarget(rules, period, managerStatusPeriod?.status, managerStatusPeriod?.target);

    // KOMISI.md 6.E: members without a status_period record for this period
    // are skipped entirely — no target contribution, no commission, no row.
    const statusByEmployeeId = new Map(statusRows.map((s) => [s.employee_id, s.status]));
    const targetByEmployeeId = new Map(statusRows.map((s) => [s.employee_id, resolveTarget(rules, period, s.status, s.target)]));
    const coveredTeam = team.filter((e) => statusByEmployeeId.has(e.employee_id));

    const memberResults = await Promise.all(
      coveredTeam.map((e) =>
        this.getSalesCommission(
          e.employee_id,
          period,
          undefined,
          targetByEmployeeId.get(e.employee_id),
          consistencyBonusByEmployeeId.get(e.employee_id),
        ),
      ),
    );

    const permanentCount = coveredTeam.filter(
      (e) => statusByEmployeeId.get(e.employee_id) === "Permanent",
    ).length;
    const teamActivity = memberResults.reduce((sum, r) => sum + r.activityCount, 0);
    const permanentTargetSum = coveredTeam
      .filter((e) => statusByEmployeeId.get(e.employee_id) === "Permanent")
      .reduce((sum, e) => sum + (targetByEmployeeId.get(e.employee_id) ?? rules.targets.permanent), 0);

    const performance = calculateManagerPerformance(
      rules,
      permanentCount,
      coveredTeam.length - permanentCount,
      teamActivity,
      permanentTargetSum,
    );

    // 6.F: the manager's own sales use the TEAM's achieved status to gate
    // the recurring rate/performance penalty, not their personal activity.
    const personal = await this.getSalesCommission(
      managerId,
      period,
      performance.isTargetAchieved ? managerTarget : 0,
      managerTarget,
      managerConsistencyBonus,
      true,
    );

    // Kept 3-way — only used below for each member's "New Service" display,
    // which stays unaffected by the Digital Business/Access Business split.
    const serviceGroups = ["Home", "Nusafiber", "NusaSelecta"] as const;
    // teamTotals.byServiceGroup covers recurring too, so it needs the full
    // 5-way grouping; the two new groups' new* fields just stay at 0 since
    // getRecurringServiceGroupLabel is never used for the "new" bucket.
    const teamServiceGroups = ["Home", "Nusafiber", "NusaSelecta", "Digital Business", "Access Business"] as const;
    const emptyGroupTotal = () => ({
      newCount: 0,
      newSubscription: 0,
      newMrc: 0,
      newCommission: 0,
      recurringSubscription: 0,
      recurringCommission: 0,
    });

    const teamTotals = {
      newCommission: 0,
      recurringCommission: 0,
      newSubscription: 0,
      newMrc: 0,
      recurringSubscription: 0,
      byServiceGroup: {
        Home: emptyGroupTotal(),
        Nusafiber: emptyGroupTotal(),
        NusaSelecta: emptyGroupTotal(),
        "Digital Business": emptyGroupTotal(),
        "Access Business": emptyGroupTotal(),
      },
    };
    for (const r of memberResults) {
      teamTotals.newCommission += getManagerNewCommissionBasis(r.breakdown);
      teamTotals.recurringCommission += r.breakdown.recurring.commission;
      teamTotals.newSubscription += r.breakdown.new.subscription;
      teamTotals.newMrc += r.breakdown.new.mrc;
      teamTotals.recurringSubscription += r.breakdown.recurring.subscription;

      for (const group of teamServiceGroups) {
        const g = r.byServiceGroup[group];
        if (!g) continue;
        const target = teamTotals.byServiceGroup[group];
        target.newCount += g.new.count;
        target.newSubscription += g.new.subscription;
        target.newMrc += g.new.mrc;
        target.newCommission += g.new.commission;
        target.recurringSubscription += g.recurring.subscription;
        target.recurringCommission += g.recurring.commission;
      }
    }

    const newCommissionRate = getManagerNewCommissionRate(rules, performance.achievementPercentage);
    const overrideNewCommission = teamTotals.newCommission * (newCommissionRate / 100);

    // NET recurring subscription behind the override — same late-payment
    // treatment as an individual recurring row, summed across every row
    // credited to this manager (incl. Customer Relation Officer rows).
    let teamRecurringSubscriptionNet = 0;
    for (const row of recurringRows) {
      const basis = getCommissionBasis(
        toNumber(row.subscription),
        toNumber(row.referral_fee),
        row.referral_type,
      );
      teamRecurringSubscriptionNet += applyLateMonthPenalty(rules, basis, row.late_month, row.is_approved);
    }

    const recurringCommissionRate = getManagerRecurringRate(rules, performance.isTargetAchieved);
    const overrideRecurringCommission =
      teamRecurringSubscriptionNet * (recurringCommissionRate / 100);

    // KOMISI.md 6.D: Customer Relation Officer rows have no real salesperson,
    // so they never appear in any team member's own invoice list — surfaced
    // here instead, valued at the manager's own override rate since that's
    // the only commission stream they actually feed.
    const croRecurring = recurringRows
      .filter((row) => row.sales === CRO_PLACEHOLDER)
      .map((row) => this.valueManagerRecurringRow(rules, row, recurringCommissionRate));

    // Team Production by Service is meant to show the manager area's FULL
    // production, so it also folds in the manager's own personal sales
    // (KOMISI.md 6.F) and Customer Relation Officer recurring rows (6.D) —
    // neither of which memberResults covers. Scoped to byServiceGroup only:
    // the top-level teamTotals.* fields above stay team-members-only, since
    // they feed the override commission calculation (6.C/6.D), which must
    // never include the manager's own sales or CRO rows.
    for (const group of teamServiceGroups) {
      const g = personal.byServiceGroup[group];
      if (!g) continue;
      const target = teamTotals.byServiceGroup[group];
      target.newCount += g.new.count;
      target.newSubscription += g.new.subscription;
      target.newMrc += g.new.mrc;
      target.newCommission += g.new.commission;
      target.recurringSubscription += g.recurring.subscription;
      target.recurringCommission += g.recurring.commission;
    }
    for (const item of croRecurring) {
      const group = getRecurringServiceGroupLabel(rules, item.category, item.serviceId);
      const target = teamTotals.byServiceGroup[group];
      target.recurringSubscription += item.subscription;
      target.recurringCommission += item.commission;
    }

    const members = coveredTeam.map((e, i) => {
      const r = memberResults[i]!;
      const otherSubscription = r.breakdown.alat.subscription + r.breakdown.setup.subscription;
      const otherCommission = r.breakdown.alat.commission + r.breakdown.setup.commission;

      return {
        employeeId: e.employee_id,
        name: e.name,
        photoProfile: e.photo_profile,
        status: statusByEmployeeId.get(e.employee_id) ?? null,
        activityCount: r.activityCount,
        achievementStatus: r.achievementStatus,
        motivation: r.motivation,
        newSubscription: r.breakdown.new.subscription,
        newMrc: r.breakdown.new.mrc,
        newCommission: r.breakdown.new.commission,
        recurringSubscription: r.breakdown.recurring.subscription,
        recurringCommission: r.breakdown.recurring.commission,
        otherSubscription,
        otherCommission,
        bonusBulanan: r.bonusBulanan,
        bonusKelebihanService: r.bonusKelebihanService,
        consistencyBonus: r.consistencyBonus,
        totalCommission: r.total.commission + r.bonusBulanan + r.bonusKelebihanService + r.consistencyBonus,
        managerNewCommission: getManagerNewCommissionBasis(r.breakdown) * (newCommissionRate / 100),
        managerRecurringCommission: r.breakdown.recurring.subscription * (recurringCommissionRate / 100),
        newService: serviceGroups.map((name) => ({
          name,
          count: r.byServiceGroup[name]?.new.count ?? 0,
          mrc: r.byServiceGroup[name]?.new.mrc ?? 0,
          subscription: r.byServiceGroup[name]?.new.subscription ?? 0,
        })),
      };
    });

    return {
      period,
      startDate,
      endDate,
      managerId,
      team: {
        totalCount: coveredTeam.length,
        permanentCount,
        nonPermanentCount: coveredTeam.length - permanentCount,
        activityCount: teamActivity,
        baseTarget: performance.baseTarget,
        thresholdPercentage: performance.thresholdPercentage,
        finalTarget: performance.finalTarget,
        achievementPercentage: performance.achievementPercentage,
        isTargetAchieved: performance.isTargetAchieved,
      },
      override: {
        newCommissionRate,
        newCommission: overrideNewCommission,
        recurringCommissionRate,
        recurringCommission: overrideRecurringCommission,
        teamRecurringSubscriptionNet,
      },
      teamTotals,
      personal,
      croRecurring,
      totalCommission:
        personal.total.commission +
        personal.bonusBulanan +
        personal.bonusKelebihanService +
        personal.consistencyBonus +
        overrideNewCommission +
        overrideRecurringCommission,
      members,
    };
  }

  /**
   * Values a raw recurring snapshot row at a flat percentage instead of the
   * usual status/activity-gated rate — used for Customer Relation Officer
   * rows, which have no real employee to derive a rate from.
   */
  private valueManagerRecurringRow(
    rules: CommissionRules,
    row: CommissionSnapshotRow,
    ratePercentage: number,
  ): CommissionLineItem {
    const months = Math.max(toNumber(row.month) || 1, 1);
    const subscription = toNumber(row.subscription);
    const mrc = subscription / months;
    const basis = getCommissionBasis(subscription, toNumber(row.referral_fee), row.referral_type);
    const baseCommission = applyLateMonthPenalty(rules, basis, row.late_month, row.is_approved);

    return {
      aiInvoice: row.ai_invoice,
      aiReceipt: row.ai_receipt,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerCompany: row.customer_company,
      customerServiceId: row.customer_service_id,
      customerServiceAccount: row.customer_service_account,
      serviceId: row.service_id,
      serviceName: row.service_name,
      category: row.category,
      businessOperation: row.business_operation,
      manager: row.manager,
      type: "recurring",
      isRenewal: Boolean(row.is_renewal),
      month: months,
      lateMonth: toNumber(row.late_month),
      isApproved: Boolean(row.is_approved),
      isAdjusted: Boolean(row.is_adjusted),
      paidDate: row.paid_date ? toSqlDate(new Date(row.paid_date)) : null,
      subscription,
      mrc,
      referralFee: toNumber(row.referral_fee),
      referralType: row.referral_type,
      baseCommission,
      commissionPercentage: ratePercentage,
      commission: baseCommission * (ratePercentage / 100),
    };
  }

  /**
   * Full commission picture for one salesperson in one period: the net
   * activity count that drives target-dependent rates, per-type and
   * per-service-group breakdowns, and the churn deduction.
   */
  async getSalesCommission(
    employeeId: string,
    period: string,
    /**
     * Overrides the activity count fed into the recurring-rate and
     * performance-penalty checks (both gated on `< target`), without touching
     * the real activityCount used for achievement/motivation/bonus display.
     * Used for a Manager's personal sales (KOMISI.md 6.F), where "target
     * achieved" comes from the manager's own team performance rather than
     * their personal New Achievement.
     */
    rateActivityCountOverride?: number,
    /** This employee's New Achievement target for the period. Defaults to their configured/default target when omitted. */
    targetOverride?: number,
    /** This employee's Bonus Konsistensi amount for the period. Defaults to a fresh lookup (0 if never granted) when omitted. */
    consistencyBonusOverride?: number,
    /** Drops Alat rows entirely — a Manager's personal sales earn nothing on Alat (KOMISI.md 6.F). */
    excludeAlat = false,
  ): Promise<SalesCommissionResult> {
    const { start, end } = getDateRangeForPeriod(period);
    const startDate = toSqlDate(start);
    const endDate = toSqlDate(end);

    const [allRows, churnRows, statusPeriod, consistencyBonus, rules] = await Promise.all([
      this.snapshotRepository.findBySales(employeeId, period),
      this.churnService.getByEmployeeId(employeeId, startDate, endDate),
      this.employeeService.getStatusByPeriod(employeeId, startDate, endDate),
      consistencyBonusOverride !== undefined
        ? Promise.resolve(consistencyBonusOverride)
        : this.consistencyBonusService.getAmount(employeeId, period),
      this.rulesProvider.getForPeriod(period),
    ]);
    const status = statusPeriod?.status ?? null;
    const target = targetOverride ?? resolveTarget(rules, period, status, statusPeriod?.target);

    const rows = allRows.filter(
      (row) =>
        !isExcludedFromCommission(rules, row) &&
        !(excludeAlat && toCommissionCategory(row.category) === "alat"),
    );

    const { activityCount, grossNusaSelectaActivity, customerHasSetup, nusaSelectaNewUnits } =
      this.computeActivity(rules, rows, churnRows);
    const rateActivityCount = rateActivityCountOverride ?? activityCount;

    const total = emptyStats();
    const breakdown = emptyBreakdown();
    const byServiceGroup: Record<string, CommissionBreakdown> = {
      Home: emptyBreakdown(),
      Nusafiber: emptyBreakdown(),
      NusaSelecta: emptyBreakdown(),
      "Digital Business": emptyBreakdown(),
      "Access Business": emptyBreakdown(),
    };
    const items: CommissionLineItem[] = [];

    for (const row of rows) {
      const category = toCommissionCategory(row.category);
      const bucket = resolveBucket(row);
      const type = effectiveType(row);
      const months = Math.max(toNumber(row.month) || 1, 1);

      const subscription = toNumber(row.subscription);
      const mrc = subscription / months;
      const basis = getCommissionBasis(
        subscription,
        toNumber(row.referral_fee),
        row.referral_type,
      );

      const { commission, commissionPercentage, baseCommission } = calculateCommission(
        rules,
        basis,
        row.late_month,
        row.is_approved,
        {
          category,
          type,
          serviceId: row.service_id,
          months,
          status,
          activityCount: rateActivityCount,
          target,
          hasSetup: customerHasSetup.has(row.customer_id),
          businessOperation: resolveBusinessOperation(row.category, row.business_operation),
        },
      );

      // NusaSelecta "new" units are counted as grouped achievements
      // instead of one-per-row, so they're excluded from the raw count
      // and added back in aggregate below.
      const countsIndividually = !(isNusaSelecta(rules, row.service_id) && bucket === "new");
      const delta = {
        count: countsIndividually ? 1 : 0,
        commission,
        subscription,
        mrc,
      };

      addTo(total, delta);
      addTo(breakdown[bucket], delta);

      // Recurring uses the 5-way grouping (carves out Digital Business and
      // Access Business); every other bucket keeps the plain 3-way one.
      const group = bucket === "recurring"
        ? getRecurringServiceGroupLabel(rules, row.category, row.service_id)
        : getServiceGroupLabel(rules, row.service_id);
      addTo(byServiceGroup[group]![bucket], delta);

      items.push({
        aiInvoice: row.ai_invoice,
        aiReceipt: row.ai_receipt,
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerCompany: row.customer_company,
        customerServiceId: row.customer_service_id,
        customerServiceAccount: row.customer_service_account,
        serviceId: row.service_id,
        serviceName: row.service_name,
        category: row.category,
        businessOperation: row.business_operation,
        manager: row.manager,
        type: bucket,
        isRenewal: Boolean(row.is_renewal),
        month: months,
        lateMonth: toNumber(row.late_month),
        isApproved: Boolean(row.is_approved),
        isAdjusted: Boolean(row.is_adjusted),
        paidDate: row.paid_date ? toSqlDate(new Date(row.paid_date)) : null,
        subscription,
        mrc,
        referralFee: toNumber(row.referral_fee),
        referralType: row.referral_type,
        baseCommission,
        commissionPercentage,
        commission,
      });
    }

    // Grouped NusaSelecta achievements re-enter the displayed counts.
    total.count += grossNusaSelectaActivity;
    breakdown.new.count += grossNusaSelectaActivity;
    byServiceGroup.NusaSelecta!.new.count += grossNusaSelectaActivity;

    const deduction = this.applyChurnDeduction(
      rules,
      churnRows,
      status,
      target,
      total,
      breakdown,
      byServiceGroup,
    );

    const { achievementStatus, motivation } = calculateAchievement(rules, status, activityCount);

    return {
      period,
      startDate,
      endDate,
      employeeId,
      status,
      activityCount,
      nusaSelectaNewUnits,
      achievementStatus,
      motivation,
      bonusBulanan: calculateMonthlyBonus(rules, activityCount, target, status),
      bonusKelebihanService: calculateExcessServiceBonus(rules, activityCount, target, status),
      consistencyBonus,
      total,
      breakdown,
      byServiceGroup,
      deduction,
      items,
    };
  }

  /**
   * New Achievement drives every target-dependent rate, so it's computed
   * first: standard services count 1:1, NusaSelecta is grouped, and
   * unapproved churn is subtracted before grouping.
   */
  private computeActivity(rules: CommissionRules, rows: CommissionSnapshotRow[], churnRows: ChurnRow[]) {
    let basicPrime = 0;
    let ultra = 0;
    let standard = 0;
    const customerHasSetup = new Set<string>();

    for (const row of rows) {
      const bucket = resolveBucket(row);
      if (bucket === "setup") customerHasSetup.add(row.customer_id);
      if (bucket !== "new") continue;

      if (isNusaBasicPrime(rules, row.service_id)) basicPrime++;
      else if (isNusaUltra(rules, row.service_id)) ultra++;
      else standard++;
    }

    const grossNusaSelectaActivity = calculateNusaSelectaActivity(basicPrime, ultra);

    let netBasicPrime = basicPrime;
    let netUltra = ultra;
    let netStandard = standard;

    for (const churn of churnRows) {
      if (churn.is_approved) continue;
      if (isNusaBasicPrime(rules, churn.service_id)) netBasicPrime--;
      else if (isNusaUltra(rules, churn.service_id)) netUltra--;
      else netStandard--;
    }

    const activityCount = Math.max(
      0,
      netStandard + calculateNusaSelectaActivity(netBasicPrime, netUltra),
    );

    return { activityCount, grossNusaSelectaActivity, customerHasSetup, nusaSelectaNewUnits: { basicPrime, ultra } };
  }

  /**
   * What one unapproved churn is worth: valued at the New rate assuming
   * target was met, so the deduction itself isn't discounted by the
   * performance penalty.
   */
  private valueChurn(rules: CommissionRules, churn: ChurnRow, status: string | null, target: number) {
    const price = toNumber(churn.price);
    const months = Math.max(toNumber(churn.period) || 1, 1);
    const mrc = price / months;

    const { commission, commissionPercentage } = calculateCommission(rules, price, 0, false, {
      category: "home",
      type: "new",
      serviceId: churn.service_id,
      months,
      status,
      activityCount: target,
      target,
      hasSetup: false,
      businessOperation: null,
    });

    return { price, months, mrc, commission, commissionPercentage };
  }

  /**
   * Each unapproved churn reverses a "new" sale: it removes the count,
   * the subscription, the MRC, and the commission it would have earned.
   */
  private applyChurnDeduction(
    rules: CommissionRules,
    churnRows: ChurnRow[],
    status: string | null,
    target: number,
    total: CommissionStats,
    breakdown: CommissionBreakdown,
    byServiceGroup: Record<string, CommissionBreakdown>,
  ) {
    const deduction = { count: 0, commission: 0, subscription: 0, mrc: 0 };

    for (const churn of churnRows) {
      if (churn.is_approved) continue;

      const { price, mrc, commission } = this.valueChurn(rules, churn, status, target);

      deduction.count += 1;
      deduction.commission += commission;
      deduction.subscription += price;
      deduction.mrc += mrc;

      const negative = { count: -1, commission: -commission, subscription: -price, mrc: -mrc };
      addTo(total, negative);
      addTo(breakdown.new, negative);

      const group = getServiceGroupLabel(rules, churn.service_id);
      addTo(byServiceGroup[group]!.new, negative);
    }

    return deduction;
  }

  /**
   * Every Account Manager's commission summary for a period — the admin
   * sales roster. Sourced from status_period (like the Target page), NOT
   * the live employee table: a past period must show whoever actually sold
   * that period, even if they've since left or been deactivated — matching
   * KOMISI.md 6.E, which already governs the manager team-member roster the
   * same way. Using the live roster here would silently drop them and
   * disagree with their manager's team table for that same period.
   */
  async getSalesSummary(period: string): Promise<SalesSummaryItem[]> {
    const { start, end } = getDateRangeForPeriod(period);
    const roster = await this.employeeService.getSalesTargetsByPeriod(toSqlDate(start), toSqlDate(end));
    const results = await Promise.all(
      roster.map((e) => this.getSalesCommission(e.employeeId, period)),
    );

    return roster.map((e, i) => {
      const r = results[i]!;
      return {
        employeeId: e.employeeId,
        name: e.name,
        photoProfile: e.photoProfile,
        status: r.status,
        achievementStatus: r.achievementStatus,
        activityCount: r.activityCount,
        newMrc: r.breakdown.new.mrc,
        newSubscription: r.breakdown.new.subscription,
        newCommission: r.breakdown.new.commission,
        recurringSubscription: r.breakdown.recurring.subscription,
        recurringCommission: r.breakdown.recurring.commission,
        otherSubscription: r.breakdown.alat.subscription + r.breakdown.setup.subscription,
        otherCommission: r.breakdown.alat.commission + r.breakdown.setup.commission,
        bonusBulanan: r.bonusBulanan,
        bonusKelebihanService: r.bonusKelebihanService,
        consistencyBonus: r.consistencyBonus,
        totalCommission: r.total.commission + r.bonusBulanan + r.bonusKelebihanService + r.consistencyBonus,
      };
    });
  }

  /** Every manager's commission summary for a period — the admin manager roster. */
  async getManagerSummary(period: string): Promise<ManagerSummaryItem[]> {
    const managers = await this.employeeService.getAllManagerEmployees();
    const results = await Promise.all(
      managers.map((m) => this.getManagerCommission(m.employee_id, period)),
    );

    return managers.map((m, i) => {
      const r = results[i]!;
      return {
        employeeId: m.employee_id,
        name: m.name,
        photoProfile: m.photo_profile,
        totalCount: r.team.totalCount,
        achievementPercentage: r.team.achievementPercentage,
        activityCount: r.team.activityCount,
        isTargetAchieved: r.team.isTargetAchieved,
        newMrc: r.teamTotals.newMrc,
        newSubscription: r.teamTotals.newSubscription,
        newCommission: r.teamTotals.newCommission,
        recurringSubscription: r.teamTotals.recurringSubscription,
        recurringCommission: r.teamTotals.recurringCommission,
        managerNewCommission: r.override.newCommission,
        managerRecurringCommission: r.override.recurringCommission,
        managerTotalCommission: r.totalCommission,
      };
    });
  }

  /**
   * Every invoice line item across every Account Manager for a period — the
   * admin invoice roster. Same period-aware roster as getSalesSummary, for
   * the same reason: a past period's invoices must stay attributed to
   * whoever actually sold them, regardless of current employment status.
   */
  async getInvoiceSummary(period: string): Promise<InvoiceSummaryItem[]> {
    const { start, end } = getDateRangeForPeriod(period);
    const [roster, managers] = await Promise.all([
      this.employeeService.getSalesTargetsByPeriod(toSqlDate(start), toSqlDate(end)),
      this.employeeService.getAllManagerEmployees(),
    ]);
    const managerById = new Map(managers.map((m) => [m.employee_id, m]));

    const results = await Promise.all(
      roster.map((e) => this.getSalesCommission(e.employeeId, period)),
    );

    const items: InvoiceSummaryItem[] = [];
    roster.forEach((e, i) => {
      const sales = { employeeId: e.employeeId, name: e.name, photoProfile: e.photoProfile };
      for (const item of results[i]!.items) {
        const manager = managerById.get(item.manager ?? "");
        const managerEmployee = manager
          ? { employeeId: manager.employee_id, name: manager.name, photoProfile: manager.photo_profile }
          : null;
        items.push({ ...item, sales, managerEmployee });
      }
    });

    return items;
  }

  /** Admin approval for a late-paid invoice, waiving its late-payment penalty. */
  approveInvoice(aiInvoice: number, isApproved: boolean): Promise<void> {
    return this.snapshotRepository.updateApproval(aiInvoice, isApproved);
  }

  /** Full raw invoice row for the admin adjustment form — every field, not just the summary list's subset. */
  async getInvoiceDetail(aiInvoice: number): Promise<SnapshotDetailItem> {
    const row = await this.snapshotRepository.findByAiInvoice(aiInvoice);
    if (!row) {
      throw new NotFoundException("Invoice not found");
    }

    return {
      aiInvoice: row.ai_invoice,
      aiReceipt: row.ai_receipt,
      period: row.period,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerCompany: row.customer_company,
      customerServiceId: row.customer_service_id,
      customerServiceAccount: row.customer_service_account,
      serviceId: row.service_id,
      serviceName: row.service_name,
      category: row.category,
      sales: row.sales,
      manager: row.manager,
      vendor: row.vendor ?? null,
      subscription: row.subscription,
      lineRental: row.line_rental,
      paidDate: row.paid_date ? toSqlDate(new Date(row.paid_date)) : null,
      month: row.month,
      lateMonth: row.late_month,
      type: row.type,
      referralFee: row.referral_fee,
      referralType: row.referral_type,
      referralName: row.referral_name,
      businessOperation: row.business_operation,
      isApproved: Boolean(row.is_approved),
      isAdjusted: Boolean(row.is_adjusted),
    };
  }

  /**
   * Admin correction of one invoice row's data (customer/service/financial/
   * attribution fields — anything beyond the dedicated approve/referral
   * endpoints). Marks the row `is_adjusted` so a future re-crawl for that
   * period never overwrites it (see snapshot.repository.ts#replaceForPeriod),
   * and appends a before/after entry to the audit log.
   */
  async adjustInvoice(
    aiInvoice: number,
    employeeId: string,
    changes: AdjustableSnapshotFields,
    note: string,
  ): Promise<void> {
    const current = await this.snapshotRepository.findByAiInvoice(aiInvoice);
    if (!current) {
      throw new NotFoundException("Invoice not found");
    }

    const oldValue: Partial<AdjustableSnapshotFields> = {};
    const newValue: Partial<AdjustableSnapshotFields> = {};

    for (const key of Object.keys(changes) as (keyof AdjustableSnapshotFields)[]) {
      const value = changes[key];
      if (value === undefined) continue;

      const column = ADJUSTABLE_FIELD_COLUMNS[key];
      (oldValue as Record<string, unknown>)[key] = current[column as keyof CommissionSnapshotRow] ?? null;
      (newValue as Record<string, unknown>)[key] = value;
    }

    if (Object.keys(newValue).length === 0) return;

    await this.snapshotRepository.updateAdjustableFields(aiInvoice, changes);
    await this.snapshotRepository.insertAdjustmentLog(aiInvoice, employeeId, oldValue, newValue, note);
  }

  /** Full before/after history of admin corrections made to one invoice row. */
  async getInvoiceAdjustments(aiInvoice: number): Promise<SnapshotAdjustmentItem[]> {
    const rows = await this.snapshotRepository.findAdjustmentsByAiInvoice(aiInvoice);
    const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
    const employees = await this.employeeService.findByEmployeeIds(employeeIds);
    const nameByEmployeeId = new Map(employees.map((e) => [e.employee_id, e.name]));

    return rows.map((row) => ({
      id: row.id,
      aiInvoice: row.ai_invoice,
      employeeId: row.employee_id,
      employeeName: nameByEmployeeId.get(row.employee_id) ?? null,
      oldValue: JSON.parse(row.old_value),
      newValue: JSON.parse(row.new_value),
      note: row.note,
      createdAt: row.created_at,
    }));
  }
}

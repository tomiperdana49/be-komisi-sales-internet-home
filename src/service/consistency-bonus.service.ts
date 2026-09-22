import type {
  ConsistencyBonusRow,
  IConsistencyBonusRepository,
  IConsistencyBonusService,
} from "../interface/consistency-bonus.interface";

export class ConsistencyBonusService implements IConsistencyBonusService {
  constructor(private readonly consistencyBonusRepository: IConsistencyBonusRepository) {}

  async getAmount(employeeId: string, period: string): Promise<number> {
    const rows = await this.consistencyBonusRepository.findByEmployeeIdsAndPeriod([employeeId], period);
    // DECIMAL columns come back from mysql2 as strings — must coerce or
    // `total.commission + bonus + consistencyBonus` silently string-concats.
    return Number(rows[0]?.amount ?? 0);
  }

  async getAmountsByEmployeeIds(employeeIds: string[], period: string): Promise<Map<string, number>> {
    const rows = await this.consistencyBonusRepository.findByEmployeeIdsAndPeriod(employeeIds, period);
    const amounts = new Map<string, number>(employeeIds.map((id) => [id, 0]));
    for (const row of rows) amounts.set(row.employee_id, Number(row.amount));
    return amounts;
  }

  async getGrantsByEmployeeIds(employeeIds: string[], period: string): Promise<Map<string, ConsistencyBonusRow>> {
    const rows = await this.consistencyBonusRepository.findByEmployeeIdsAndPeriod(employeeIds, period);
    return new Map(rows.map((row) => [row.employee_id, row]));
  }

  grant(
    employeeId: string,
    period: string,
    amount: number,
    note: string,
    months: string | null,
    serviceCount: number | null,
    testimonialLink: string | null,
    grantedBy: string,
  ): Promise<void> {
    return this.consistencyBonusRepository.upsert(
      employeeId,
      period,
      amount,
      note,
      months,
      serviceCount,
      testimonialLink,
      grantedBy,
    );
  }

  revoke(employeeId: string, period: string): Promise<void> {
    return this.consistencyBonusRepository.remove(employeeId, period);
  }
}

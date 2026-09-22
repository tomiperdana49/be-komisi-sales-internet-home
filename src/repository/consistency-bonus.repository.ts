import type { AppDatabase } from "../lib/app-database";
import type {
  ConsistencyBonusRow,
  IConsistencyBonusRepository,
} from "../interface/consistency-bonus.interface";

export class ConsistencyBonusRepository implements IConsistencyBonusRepository {
  constructor(private readonly db: AppDatabase) {}

  findByEmployeeIdsAndPeriod(employeeIds: string[], period: string): Promise<ConsistencyBonusRow[]> {
    if (employeeIds.length === 0) return Promise.resolve([]);
    return this.db.query<ConsistencyBonusRow[]>(
      `SELECT employee_id, period, amount, note, months, service_count, testimonial_link, granted_by, created_at
       FROM consistency_bonus WHERE employee_id IN (?) AND period = ?`,
      [employeeIds, period],
    );
  }

  async upsert(
    employeeId: string,
    period: string,
    amount: number,
    note: string,
    months: string | null,
    serviceCount: number | null,
    testimonialLink: string | null,
    grantedBy: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO consistency_bonus (employee_id, period, amount, note, months, service_count, testimonial_link, granted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), note = VALUES(note), months = VALUES(months),
         service_count = VALUES(service_count), testimonial_link = VALUES(testimonial_link), granted_by = VALUES(granted_by)`,
      [employeeId, period, amount, note, months, serviceCount, testimonialLink, grantedBy],
    );
  }

  async remove(employeeId: string, period: string): Promise<void> {
    await this.db.query(`DELETE FROM consistency_bonus WHERE employee_id = ? AND period = ?`, [
      employeeId,
      period,
    ]);
  }
}

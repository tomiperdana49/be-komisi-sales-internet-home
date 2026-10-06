import type { AppDatabase } from "../lib/app-database";
import type {
  ITargetOverrideRepository,
  TargetOverrideInput,
  TargetOverrideRow,
} from "../interface/target-override.interface";

const COLUMNS = "id, employee_id, target, start_period, end_period, note, created_by, updated_by, created_at, updated_at";

export class TargetOverrideRepository implements ITargetOverrideRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: number): Promise<TargetOverrideRow | null> {
    const rows = await this.db.query<TargetOverrideRow[]>(`SELECT ${COLUMNS} FROM target_override WHERE id = ?`, [id]);
    return rows[0] ?? null;
  }

  findActive(employeeIds: string[], period: string): Promise<TargetOverrideRow[]> {
    if (employeeIds.length === 0) return Promise.resolve([]);
    return this.db.query<TargetOverrideRow[]>(
      `SELECT ${COLUMNS} FROM target_override
       WHERE employee_id IN (?) AND start_period <= ? AND end_period >= ?`,
      [employeeIds, period, period],
    );
  }

  findFrom(period: string): Promise<TargetOverrideRow[]> {
    return this.db.query<TargetOverrideRow[]>(
      `SELECT ${COLUMNS} FROM target_override WHERE end_period >= ? ORDER BY start_period ASC`,
      [period],
    );
  }

  findOverlapping(employeeId: string, startPeriod: string, endPeriod: string, excludeId?: number): Promise<TargetOverrideRow[]> {
    return this.db.query<TargetOverrideRow[]>(
      `SELECT ${COLUMNS} FROM target_override
       WHERE employee_id = ? AND start_period <= ? AND end_period >= ? AND id <> ?`,
      [employeeId, endPeriod, startPeriod, excludeId ?? 0],
    );
  }

  async create(employeeId: string, input: TargetOverrideInput, createdBy: string): Promise<void> {
    await this.db.query(
      `INSERT INTO target_override (employee_id, target, start_period, end_period, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [employeeId, input.target, input.startPeriod, input.endPeriod, input.note, createdBy],
    );
  }

  async update(id: number, input: TargetOverrideInput, updatedBy: string): Promise<void> {
    await this.db.query(
      `UPDATE target_override
       SET target = ?, start_period = ?, end_period = ?, note = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.target, input.startPeriod, input.endPeriod, input.note, updatedBy, id],
    );
  }

  async remove(id: number): Promise<void> {
    await this.db.query("DELETE FROM target_override WHERE id = ?", [id]);
  }
}

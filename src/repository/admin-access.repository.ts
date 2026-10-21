import type { AppDatabase } from "../lib/app-database";
import type { AdminAccessInput, AdminAccessRow, IAdminAccessRepository } from "../interface/admin-access.interface";

const COLUMNS = "id, employee_id, role, branch, note, created_by, created_at, updated_by, updated_at";

export class AdminAccessRepository implements IAdminAccessRepository {
  constructor(private readonly db: AppDatabase) {}

  findAll(): Promise<AdminAccessRow[]> {
    return this.db.query<AdminAccessRow[]>(`SELECT ${COLUMNS} FROM admin_access ORDER BY FIELD(role, 'super_admin', 'admin'), branch IS NOT NULL, branch, created_at`);
  }

  async findById(id: number): Promise<AdminAccessRow | null> {
    const rows = await this.db.query<AdminAccessRow[]>(`SELECT ${COLUMNS} FROM admin_access WHERE id = ?`, [id]);
    return rows[0] ?? null;
  }

  async findByEmployeeId(employeeId: string): Promise<AdminAccessRow | null> {
    try {
      const rows = await this.db.query<AdminAccessRow[]>(`SELECT ${COLUMNS} FROM admin_access WHERE employee_id = ?`, [employeeId]);
      return rows[0] ?? null;
    } catch (error: any) {
      // Deployed before the table's migration ran: nobody is an admin yet,
      // but signing in and the sales dashboards keep working.
      if (error?.code === "ER_NO_SUCH_TABLE") {
        console.warn("admin_access table missing — no admin access granted");
        return null;
      }
      throw error;
    }
  }

  async countSuperAdmins(): Promise<number> {
    const rows = await this.db.query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM admin_access WHERE role = 'super_admin'`);
    return Number(rows[0]?.n ?? 0);
  }

  async create(employeeId: string, input: AdminAccessInput, createdBy: string): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_access (employee_id, role, branch, note, created_by) VALUES (?, ?, ?, ?, ?)`,
      [employeeId, input.role, input.branch, input.note, createdBy],
    );
  }

  async update(id: number, input: AdminAccessInput, updatedBy: string): Promise<void> {
    await this.db.query(
      `UPDATE admin_access SET role = ?, branch = ?, note = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [input.role, input.branch, input.note, updatedBy, id],
    );
  }

  async remove(id: number): Promise<void> {
    await this.db.query("DELETE FROM admin_access WHERE id = ?", [id]);
  }
}

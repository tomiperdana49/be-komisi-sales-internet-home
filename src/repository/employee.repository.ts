import type { AppDatabase } from "../lib/app-database";
import {
  type EmployeeDetail,
  type EmployeeRow,
  type EmployeeUpsertInput,
  type IEmployeeRepository,
  type SalesTargetItem,
  type StatusPeriodDetail,
  type StatusPeriodRow,
} from "../interface/employee.interface";

export class EmployeeRepository implements IEmployeeRepository {
  constructor(private readonly db: AppDatabase) {}

  findAll(): Promise<EmployeeRow[]> {
    return this.db.query<EmployeeRow[]>("SELECT employee_id, name FROM employee");
  }

  async upsertEmployee(data: EmployeeUpsertInput): Promise<void> {
    await this.db.query(
      `
      INSERT INTO employee (
        id, employee_id, name, email, photo_profile, job_position,
        organization_name, job_level, branch, status, manager_id,
        has_dashboard, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)
      ON DUPLICATE KEY UPDATE
        employee_id = VALUES(employee_id),
        name = VALUES(name),
        email = VALUES(email),
        photo_profile = VALUES(photo_profile),
        job_position = VALUES(job_position),
        organization_name = VALUES(organization_name),
        job_level = VALUES(job_level),
        branch = VALUES(branch),
        manager_id = VALUES(manager_id),
        has_dashboard = VALUES(has_dashboard),
        is_active = true
      `,
      [
        data.userId,
        data.employeeId,
        data.name,
        data.email,
        data.photoProfile,
        data.jobPosition,
        data.organizationName,
        data.jobLevel,
        data.branch,
        data.status,
        data.managerId ?? null,
        data.hasDashboard ?? false,
      ],
    );
  }

  async findByEmployeeId(employeeId: string): Promise<EmployeeDetail | null> {
    const rows = await this.db.query<EmployeeDetail[]>(
      `
      SELECT e1.*, e2.name AS managerName, e2.employee_id AS managerEmployeeId,
        e2.photo_profile AS managerPhotoProfile
      FROM employee e1
      LEFT JOIN employee e2 ON e1.manager_id = e2.id
      WHERE e1.employee_id = ?
      LIMIT 1
      `,
      [employeeId],
    );
    return rows[0] ?? null;
  }

  findByEmployeeIds(employeeIds: string[]): Promise<EmployeeDetail[]> {
    if (employeeIds.length === 0) return Promise.resolve([]);
    return this.db.query<EmployeeDetail[]>(
      `SELECT * FROM employee WHERE employee_id IN (?)`,
      [employeeIds],
    );
  }

  async findByEmail(email: string): Promise<EmployeeDetail | null> {
    const rows = await this.db.query<EmployeeDetail[]>(
      `SELECT * FROM employee WHERE email = ? LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findAllEmployeeIds(): Promise<string[]> {
    const rows = await this.db.query<{ employee_id: string }[]>(
      `SELECT employee_id FROM employee`,
    );
    return rows.map((row) => row.employee_id);
  }

  async updateActiveStatus(employeeId: string, isActive: boolean): Promise<void> {
    await this.db.query(`UPDATE employee SET is_active = ? WHERE employee_id = ?`, [
      isActive,
      employeeId,
    ]);
  }

  async upsertStatusPeriod(
    employeeId: string,
    startDate: string,
    endDate: string,
    status: string,
    initialTarget: number,
  ): Promise<void> {
    const existing = await this.db.query<{ id: number }[]>(
      `SELECT id FROM status_period WHERE employee_id = ? AND start_date = ? AND end_date = ?`,
      [employeeId, startDate, endDate],
    );

    if (existing.length > 0) {
      await this.db.query(`UPDATE status_period SET status = ? WHERE id = ?`, [
        status,
        existing[0]!.id,
      ]);
      return;
    }

    await this.db.query(
      `INSERT INTO status_period (employee_id, start_date, end_date, status, target) VALUES (?, ?, ?, ?, ?)`,
      [employeeId, startDate, endDate, status, initialTarget],
    );
  }

  async findStatusByPeriod(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<StatusPeriodDetail | null> {
    const rows = await this.db.query<StatusPeriodDetail[]>(
      `SELECT status, target FROM status_period
       WHERE employee_id = ? AND start_date = ? AND end_date = ? LIMIT 1`,
      [employeeId, startDate, endDate],
    );
    return rows[0] ?? null;
  }

  findStatusesByPeriodAndIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<StatusPeriodRow[]> {
    if (employeeIds.length === 0) return Promise.resolve([]);
    return this.db.query<StatusPeriodRow[]>(
      `SELECT employee_id, status, target, start_date, end_date FROM status_period
       WHERE employee_id IN (?) AND start_date = ? AND end_date = ?`,
      [employeeIds, startDate, endDate],
    );
  }

  findSalesTargetsByPeriod(startDate: string, endDate: string): Promise<SalesTargetItem[]> {
    return this.db.query<SalesTargetItem[]>(
      `SELECT e.employee_id AS employeeId, e.name, e.photo_profile AS photoProfile,
              sp.status, sp.target
       FROM status_period sp
       JOIN employee e ON e.employee_id = sp.employee_id
       WHERE sp.start_date = ? AND sp.end_date = ?
         AND e.job_level = 'Staff' AND e.job_position = 'Account Manager'
       ORDER BY e.name ASC`,
      [startDate, endDate],
    );
  }

  async findHierarchy(
    employeeId: string,
    search: string | undefined,
    isSelf: boolean,
    isActiveOnly: boolean,
  ): Promise<EmployeeDetail[]> {
    const employee = await this.findByEmployeeId(employeeId);

    // Top of the org (no manager) sees every dashboard-visible employee.
    if (employee && employee.manager_id === null) {
      let query = `SELECT * FROM employee WHERE has_dashboard = true`;
      const params: any[] = [];

      if (isActiveOnly) query += ` AND is_active = true`;

      if (search) {
        query += ` AND (name LIKE ? OR employee_id LIKE ? OR job_position LIKE ? OR organization_name LIKE ? OR job_level LIKE ? OR branch LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      return this.db.query<EmployeeDetail[]>(query, params);
    }

    let query: string;
    let params: any[];

    if (isSelf) {
      query = `
        WITH RECURSIVE employee_hierarchy AS (
          SELECT *, 0 as depth
          FROM employee
          WHERE employee_id = ?

          UNION ALL

          SELECT e.*, eh.depth + 1
          FROM employee e
          INNER JOIN employee_hierarchy eh ON e.manager_id = eh.id
        )
        SELECT * FROM employee_hierarchy WHERE has_dashboard = true
      `;
      if (isActiveOnly) query += ` AND is_active = true`;
      params = [employeeId];
    } else {
      const target = await this.findByEmployeeId(employeeId);
      query = `
        WITH RECURSIVE employee_hierarchy AS (
          SELECT *, 0 as depth
          FROM employee
          WHERE manager_id = ?

          UNION ALL

          SELECT e.*, eh.depth + 1
          FROM employee e
          INNER JOIN employee_hierarchy eh ON e.manager_id = eh.id
        )
        SELECT * FROM employee_hierarchy WHERE has_dashboard = true
      `;
      if (isActiveOnly) query += ` AND is_active = true`;
      params = [target?.id ?? null];
    }

    if (search) {
      query += ` AND (name LIKE ? OR employee_id LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY depth ASC`;

    return this.db.query<EmployeeDetail[]>(query, params);
  }

  findAllManagerEmployees(): Promise<EmployeeDetail[]> {
    return this.db.query<EmployeeDetail[]>(
      `SELECT * FROM employee
       WHERE job_level IN ('Manager', 'C-Level')
         AND has_dashboard = true AND is_active = true
       ORDER BY name ASC`,
    );
  }
}

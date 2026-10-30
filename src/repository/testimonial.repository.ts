import type { AppDatabase } from "../lib/app-database";
import type { ITestimonialRepository, TestimonialInput, TestimonialRow } from "../interface/testimonial.interface";

const COLUMNS =
  "id, employee_id, manager_id, customer_id, customer_name, DATE_FORMAT(testimonial_date, '%Y-%m-%d') AS testimonial_date, link, created_by, created_at, updated_by, updated_at";

export class TestimonialRepository implements ITestimonialRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: number): Promise<TestimonialRow | null> {
    const rows = await this.db.query<TestimonialRow[]>(`SELECT ${COLUMNS} FROM testimonial WHERE id = ?`, [id]);
    return rows[0] ?? null;
  }

  findByEmployeeId(employeeId: string): Promise<TestimonialRow[]> {
    return this.db.query<TestimonialRow[]>(
      `SELECT ${COLUMNS} FROM testimonial WHERE employee_id = ? ORDER BY testimonial_date DESC, id DESC`,
      [employeeId],
    );
  }

  findByDateRange(startDate: string, endDate: string): Promise<TestimonialRow[]> {
    return this.db.query<TestimonialRow[]>(
      `SELECT ${COLUMNS} FROM testimonial WHERE testimonial_date BETWEEN ? AND ? ORDER BY testimonial_date DESC, id DESC`,
      [startDate, endDate],
    );
  }

  async countByEmployeeId(employeeId: string, startDate: string, endDate: string): Promise<number> {
    const rows = await this.db.query<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM testimonial WHERE employee_id = ? AND testimonial_date BETWEEN ? AND ?",
      [employeeId, startDate, endDate],
    );
    return Number(rows[0]?.n ?? 0);
  }

  findAll(): Promise<TestimonialRow[]> {
    return this.db.query<TestimonialRow[]>(`SELECT ${COLUMNS} FROM testimonial ORDER BY id ASC`);
  }

  async create(employeeId: string, managerId: string | null, input: TestimonialInput, createdBy: string): Promise<void> {
    await this.db.query(
      `INSERT INTO testimonial (employee_id, manager_id, customer_id, customer_name, testimonial_date, link, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [employeeId, managerId, input.customerId, input.customerName, input.testimonialDate, input.link, createdBy],
    );
  }

  async update(id: number, input: TestimonialInput, updatedBy: string): Promise<void> {
    await this.db.query(
      `UPDATE testimonial
       SET customer_id = ?, customer_name = ?, testimonial_date = ?, link = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.customerId, input.customerName, input.testimonialDate, input.link, updatedBy, id],
    );
  }

  async remove(id: number): Promise<void> {
    await this.db.query("DELETE FROM testimonial WHERE id = ?", [id]);
  }
}

import { googleConfig } from "../config/google.config";
import { asText, type GoogleSheetsClient } from "../lib/google-sheets-client";
import type { IEmployeeService } from "../interface/employee.interface";
import type {
  ITestimonialRepository,
  ITestimonialService,
  TestimonialInput,
  TestimonialItem,
  TestimonialRow,
} from "../interface/testimonial.interface";

/** Sheet times are WIB, whatever the server's zone. */
const sheetDateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export class TestimonialService implements ITestimonialService {
  private syncing: Promise<void> = Promise.resolve();

  constructor(
    private readonly testimonialRepository: ITestimonialRepository,
    private readonly employeeService: IEmployeeService,
    private readonly sheetsClient: GoogleSheetsClient,
  ) {}

  findById(id: number): Promise<TestimonialRow | null> {
    return this.testimonialRepository.findById(id);
  }

  listByEmployeeId(employeeId: string): Promise<TestimonialRow[]> {
    return this.testimonialRepository.findByEmployeeId(employeeId);
  }

  listByDateRange(startDate: string, endDate: string): Promise<TestimonialRow[]> {
    return this.testimonialRepository.findByDateRange(startDate, endDate);
  }

  async toItems(rows: TestimonialRow[]): Promise<TestimonialItem[]> {
    const ids = [...new Set(rows.flatMap((r) => [r.employee_id, r.manager_id, r.created_by, r.updated_by]))].filter(
      (id): id is string => Boolean(id),
    );
    const people = ids.length > 0 ? await this.employeeService.findByEmployeeIds(ids) : [];
    const byId = new Map(people.map((e) => [e.employee_id, e]));

    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: byId.get(r.employee_id)?.name ?? null,
      branch: byId.get(r.employee_id)?.branch ?? null,
      managerId: r.manager_id,
      managerName: r.manager_id ? (byId.get(r.manager_id)?.name ?? null) : null,
      customerId: r.customer_id,
      customerName: r.customer_name,
      testimonialDate: r.testimonial_date,
      link: r.link,
      createdBy: r.created_by,
      createdByName: byId.get(r.created_by)?.name ?? null,
      createdAt: r.created_at,
      updatedByName: r.updated_by ? (byId.get(r.updated_by)?.name ?? null) : null,
      updatedAt: r.updated_at,
    }));
  }

  syncSheet(): Promise<void> {
    // Chained so two changes close together never write the sheet at the same time.
    this.syncing = this.syncing.catch(() => {}).then(() => this.writeSheet());
    return this.syncing;
  }

  private async writeSheet(): Promise<void> {
    const spreadsheetId = googleConfig.testimonialSpreadsheetId;
    if (!spreadsheetId) return;

    const items = await this.toItems(await this.testimonialRepository.findAll());
    // Columns A–H as the marketing sheet has them: Time Insert, Branch, Team(SM), Sales(AM), Nama Cust, ID Cust, Date Testimonnial, Link Testimonial.
    const rows = items.map((t) => ({
      key: String(t.id),
      values: [
        sheetDateTime.format(new Date(t.createdAt)),
        asText(t.branch),
        asText(t.managerName),
        asText(t.employeeName ?? t.employeeId),
        asText(t.customerName),
        asText(t.customerId),
        t.testimonialDate,
        asText(t.link),
      ],
    }));
    await this.sheetsClient.syncKeyedRows(spreadsheetId, googleConfig.testimonialSheetTitle, { column: "I", header: "ID Aplikasi" }, rows);
  }

  create(employeeId: string, managerId: string | null, input: TestimonialInput, createdBy: string): Promise<void> {
    return this.testimonialRepository.create(employeeId, managerId, input, createdBy);
  }

  update(id: number, input: TestimonialInput, updatedBy: string): Promise<void> {
    return this.testimonialRepository.update(id, input, updatedBy);
  }

  remove(id: number): Promise<void> {
    return this.testimonialRepository.remove(id);
  }
}

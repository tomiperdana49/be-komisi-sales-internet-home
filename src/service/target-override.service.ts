import { BadRequestException, NotFoundException } from "../exception/http.exception";
import { currentCommissionPeriod, periodsBetween } from "../helper/period.helper";
import type { IEmployeeService } from "../interface/employee.interface";
import type { IPeriodClosingService } from "../interface/period-closing.interface";
import type {
  ITargetOverrideRepository,
  ITargetOverrideService,
  ManualTarget,
  TargetOverrideInput,
  TargetOverrideRow,
} from "../interface/target-override.interface";

type Range = ManualTarget;

/**
 * Periods whose effective target differs between two versions of an
 * override (null = no override). A changed target touches both ranges in
 * full; otherwise only the periods covered by exactly one of them.
 */
export function changedPeriods(before: Range | null, after: Range | null): string[] {
  const covered = (r: Range | null) => new Set(r ? periodsBetween(r.startPeriod, r.endPeriod) : []);
  const a = covered(before);
  const b = covered(after);
  const targetChanged = before !== null && after !== null && before.target !== after.target;
  const changed = [...a, ...b].filter((p) => targetChanged || a.has(p) !== b.has(p));
  return [...new Set(changed)].sort();
}

/**
 * Manual per-Account-Manager New Achievement targets for a range of
 * periods. Outside its range an AM falls back to the commission rules'
 * default target. Only the AM's own commission uses it — their Sales
 * Manager's team target keeps the default (see CommissionService).
 */
export class TargetOverrideService implements ITargetOverrideService {
  constructor(
    private readonly repository: ITargetOverrideRepository,
    private readonly employeeService: IEmployeeService,
    private readonly periodClosingService: IPeriodClosingService,
  ) {}

  async getActive(employeeId: string, period: string): Promise<ManualTarget | null> {
    const rows = await this.repository.findActive([employeeId], period);
    return rows[0] ? this.toRange(rows[0]) : null;
  }

  listFrom(period: string): Promise<TargetOverrideRow[]> {
    return this.repository.findFrom(period);
  }

  async create(employeeId: string, input: TargetOverrideInput, createdBy: string): Promise<void> {
    const employee = await this.employeeService.findByEmployeeId(employeeId);
    if (!employee || employee.job_position !== "Account Manager") {
      throw new BadRequestException("Target manual hanya untuk Account Manager");
    }
    this.validate(input);
    await this.assertNoOverlap(employeeId, input);
    await this.assertEditable(changedPeriods(null, input));
    await this.repository.create(employeeId, input, createdBy);
  }

  async update(id: number, input: TargetOverrideInput, updatedBy: string): Promise<void> {
    const row = await this.findOrFail(id);
    this.validate(input);
    await this.assertNoOverlap(row.employee_id, input, id);
    await this.assertEditable(changedPeriods(this.toRange(row), input));
    await this.repository.update(id, input, updatedBy);
  }

  async remove(id: number): Promise<void> {
    const row = await this.findOrFail(id);
    await this.assertEditable(
      changedPeriods(this.toRange(row), null),
      "Target manual ini sudah berjalan — ubah 'Sampai Periode' untuk mengakhirinya",
    );
    await this.repository.remove(id);
  }

  private validate(input: TargetOverrideInput) {
    if (!Number.isInteger(input.target) || input.target < 0 || input.target > 999) {
      throw new BadRequestException("Target harus bilangan bulat 0–999");
    }
    if (!/^\d{6}$/.test(input.startPeriod) || !/^\d{6}$/.test(input.endPeriod)) {
      throw new BadRequestException("Periode harus berformat YYYYMM");
    }
    if (input.endPeriod < input.startPeriod) {
      throw new BadRequestException("'Sampai Periode' tidak boleh sebelum 'Mulai Periode'");
    }
  }

  private async assertNoOverlap(employeeId: string, input: TargetOverrideInput, excludeId?: number) {
    const overlapping = await this.repository.findOverlapping(employeeId, input.startPeriod, input.endPeriod, excludeId);
    if (overlapping.length > 0) {
      const o = overlapping[0]!;
      throw new BadRequestException(
        `Bentrok dengan target manual ${o.start_period}–${o.end_period} untuk AM ini`,
      );
    }
  }

  /**
   * Past periods are locked (like the commission rules) and so are closed
   * ones, so already-reported commission never changes.
   */
  private async assertEditable(periods: string[], pastMessage?: string) {
    const current = currentCommissionPeriod();
    if (periods.some((p) => p < current)) {
      throw new BadRequestException(pastMessage ?? `Periode sebelum ${current} tidak boleh diubah`);
    }
    const open = new Set(await this.periodClosingService.filterOpen(periods));
    const closed = periods.filter((p) => !open.has(p));
    if (closed.length > 0) {
      throw new BadRequestException(`Periode ${closed.join(", ")} sudah ditutup`);
    }
  }

  private toRange(row: TargetOverrideRow): Range {
    return { target: Number(row.target), startPeriod: row.start_period, endPeriod: row.end_period };
  }

  private async findOrFail(id: number): Promise<TargetOverrideRow> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException("Target manual tidak ditemukan");
    return row;
  }
}

import { CHURN_WAIVER_APPROVERS, approverSection, parseChurnWaiverBlocks } from "../helper/churn-waiver.helper";
import type {
  ChurnRow,
  ChurnSummaryRow,
  IChurnRepository,
  IChurnService,
  LogCallWaiver,
} from "../interface/churn.interface";

export class ChurnService implements IChurnService {
  constructor(private readonly churnRepository: IChurnRepository) {}

  async syncFromBilling(
    serviceIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<{ synced: number; deleted: number; waived: number; reinstated: number }> {
    const rows = await this.churnRepository.findFromBilling(serviceIds, startDate, endDate);

    const validCsIds: number[] = [];
    for (const row of rows) {
      await this.churnRepository.upsert({
        customer_service_id: row.customer_service_id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_service_account: row.customer_service_account,
        service_id: row.service_id,
        service_name: row.service_name,
        registration_date: row.registration_date,
        unregistration_date: row.unregistration_date,
        reason: row.reason,
        close_status: row.close_status,
        close_reason: row.close_reason,
        period: row.period,
        price: row.price,
        sales_id: row.sales_id,
        manager_id: row.manager_id,
      });
      validCsIds.push(row.customer_service_id);
    }

    // Sync with deletion if some were removed from source.
    const localCsIds = await this.churnRepository.findLocalCsIdsInRange(startDate, endDate);
    const toDelete = localCsIds.filter((id) => !validCsIds.includes(id));
    await this.churnRepository.deleteByCsIds(toDelete);

    const { waived, reinstated } = await this.syncLogCallWaivers(startDate, endDate);

    return { synced: validCsIds.length, deleted: toDelete.length, waived, reinstated };
  }

  /**
   * Applies "detail: Service ID … / Account Name … / Churn = false" blocks
   * an approver wrote in an NIS log call: the latest block per service wins.
   * Waivers made by hand in the dashboard are never touched; a log-call
   * waiver is lifted again once no block (or "Churn = true") backs it.
   */
  private async syncLogCallWaivers(startDate: string, endDate: string) {
    // Approvals usually follow the churn, but allow ones written up to a year before it.
    const since = new Date(startDate);
    since.setFullYear(since.getFullYear() - 1);

    const [logCalls, rows] = await Promise.all([
      this.churnRepository.findWaiverLogCalls(CHURN_WAIVER_APPROVERS, since.toISOString().slice(0, 10)),
      this.churnRepository.findApprovalStatesInRange(startDate, endDate),
    ]);

    const latest = new Map<number, { churn: boolean; accountName: string; waiver: LogCallWaiver }>();
    for (const logCall of logCalls) {
      const text = logCall.text ?? "";
      for (const block of parseChurnWaiverBlocks(text)) {
        const firstLine = approverSection(text).split("\n").map((line) => line.trim()).find(Boolean) ?? "";
        latest.set(block.customerServiceId, {
          churn: block.churn,
          accountName: block.accountName,
          waiver: {
            logCallId: logCall.log_call_id,
            empId: logCall.emp_id,
            posted: logCall.posted,
            note: `Log Call #${logCall.log_call_id}: ${firstLine}`.slice(0, 500),
          },
        });
      }
    }

    let waived = 0;
    let reinstated = 0;
    for (const row of rows) {
      const csId = Number(row.customer_service_id);
      const logCallId = row.approval_log_call_id === null ? null : Number(row.approval_log_call_id);
      if (row.is_approved && logCallId === null) continue; // waived by hand

      const block = latest.get(csId);
      const matches =
        block !== undefined &&
        block.accountName.toLowerCase() === (row.customer_service_account ?? "").toLowerCase();
      if (block && !matches) {
        console.warn(
          `Log Call #${block.waiver.logCallId}: Account Name "${block.accountName}" tidak cocok dengan Service ID ${csId} (${row.customer_service_account}) — diabaikan.`,
        );
      }

      if (matches && !block.churn) {
        if (logCallId !== block.waiver.logCallId) {
          await this.churnRepository.setLogCallWaiver(csId, block.waiver);
          waived++;
        }
      } else if (logCallId !== null) {
        await this.churnRepository.clearLogCallWaiver(csId);
        reinstated++;
      }
    }

    return { waived, reinstated };
  }

  getByEmployeeId(employeeId: string, startDate: string, endDate: string): Promise<ChurnRow[]> {
    return this.churnRepository.findByEmployeeId(employeeId, startDate, endDate);
  }

  getByEmployeeIds(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<ChurnRow[]> {
    return this.churnRepository.findByEmployeeIds(employeeIds, startDate, endDate);
  }

  getSummary(startDate: string, endDate: string, search?: string): Promise<ChurnSummaryRow[]> {
    return this.churnRepository.findSummary(startDate, endDate, search);
  }

  updateApproval(customerServiceId: string, isApproved: boolean, note: string | null, approvedBy: string): Promise<void> {
    return this.churnRepository.updateApproval(customerServiceId, isApproved, note, approvedBy);
  }
}

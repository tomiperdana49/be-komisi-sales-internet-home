import type {
  ChurnRow,
  ChurnSummaryRow,
  IChurnRepository,
  IChurnService,
} from "../interface/churn.interface";

export class ChurnService implements IChurnService {
  constructor(private readonly churnRepository: IChurnRepository) {}

  async syncFromBilling(
    serviceIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<{ synced: number; deleted: number }> {
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

    return { synced: validCsIds.length, deleted: toDelete.length };
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

import { parseDate, parseIntOrNull, parseNumber } from "../helper/parse.helper";
import type {
  ISnapshotService,
  RawSnapshotInput,
  SnapshotType,
} from "../interface/snapshot.interface";

export class SnapshotService implements ISnapshotService {
  /** Assembles the ordered values for a snapshots INSERT row (column order must match snapshot.repository.ts). */
  assembleValues(
    input: RawSnapshotInput,
    category: string | null | undefined,
    sales: string | null,
    manager: string | null,
    subscription: number | null,
    type: SnapshotType,
  ): any[] {
    return [
      parseIntOrNull(input.aiInvoice),
      parseIntOrNull(input.aiReceipt),
      input.cid?.toString().trim() ?? null,
      input.namaCustomer?.toString().trim() || null,
      input.company?.toString().trim() || null,
      parseIntOrNull(input.csid),
      input.account?.toString().trim() || null,
      input.serviceId?.toString().trim() || null,
      input.namaService?.toString().trim() || null,
      category,
      sales,
      manager,
      input.vendor?.toString().trim() || null,
      subscription,
      parseNumber(input.lineRental),
      parseDate(input.paidDate),
      parseIntOrNull(input.bulan),
      parseIntOrNull(input.telatBulan) ?? 0,
      type,
      parseNumber(input.biayaReferral) ?? 0,
      input.referralName?.toString().trim() || null,
      input.businessOperation?.toString().trim() || null,
      input.isRenewal ? 1 : 0,
    ];
  }
}

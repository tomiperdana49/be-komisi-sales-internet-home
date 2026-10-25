import type { ChurnCloseReasonRule, ChurnCloseStatus } from "../interface/commission-rules.interface";

/** NIS ServiceCloseStatusExisting ids ("closeCatExistingStatus") by the status name used in the rules. */
export const CHURN_CLOSE_STATUS_IDS: Record<ChurnCloseStatus, number> = {
  "New Installation": 1,
  "Active to NA": 2,
  Renewal: 3,
  System: 4,
};

/**
 * NIS close reasons that count as churn, from the "Effect Churn" sheet; any
 * other reason doesn't. Reasons are matched by name within their status (NIS
 * categories have been renamed over time, the reason names haven't).
 */
export const DEFAULT_CHURN_CLOSE_REASONS: ChurnCloseReasonRule[] = [
  { status: "New Installation", category: "Paid not yet to Active", reason: "Paid not yet to install", note: "", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Quality and Service", reason: "Bad Communication Service", note: "", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Quality and Service", reason: "Solving Problem too long & slow", note: "", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Quality and Service", reason: "Customer Issue", note: "pindah lokasi / keputusan internal customer", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Quality and Service", reason: "Unreachable area", note: "setelah service aktif, migrasi tidak cover", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Benefit Product & Price", reason: "Budget not enough", note: "price", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Benefit Product & Price", reason: "Get best offering from Competitor", note: "", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Benefit Product & Price", reason: "Product Unavailable", note: "saat renewal", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Benefit Product & Price", reason: "All fine, but benefits not needed", note: "", effectFrom: "Contract", churn: true },
  { status: "Active to NA", category: "Benefit Product & Price", reason: "Lose Contact", note: "", effectFrom: "Operational", churn: true },
  { status: "Active to NA", category: "Benefit Product & Price", reason: "Merger Services", note: "service aktif ditutup", effectFrom: "Operational", churn: true },
  { status: "Renewal", category: "Quality and Service", reason: "Bad Communication Service", note: "", effectFrom: "Contract", churn: true },
  { status: "Renewal", category: "Quality and Service", reason: "Customer Issue", note: "pindah lokasi / keputusan internal customer", effectFrom: "Contract", churn: true },
  { status: "Renewal", category: "Quality and Service", reason: "Decision from the Head Office", note: "", effectFrom: "Contract", churn: true },
  { status: "Renewal", category: "Benefit Product & Price", reason: "Product Unavailable", note: "", effectFrom: "Contract", churn: true },
  { status: "Renewal", category: "Benefit Product & Price", reason: "Budget not enough", note: "price", effectFrom: "Contract", churn: true },
  { status: "Renewal", category: "Benefit Product & Price", reason: "Get best offering from Competitor", note: "", effectFrom: "Contract", churn: true },
  { status: "Renewal", category: "Benefit Product & Price", reason: "All fine, but benefits not needed", note: "", effectFrom: "Contract", churn: true },
  { status: "Renewal", category: "Benefit Product & Price", reason: "Lose Contact", note: "", effectFrom: "Contract", churn: true },
];

/**
 * Matching key for a close reason name: NIS spells the same reason a few
 * ways ("Solving Problem take too long & slow", trailing spaces, case).
 */
export function normalizeCloseReason(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\btake\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether a service closed with this NIS close category counts as churn:
 * only reasons listed and ticked for their status do. Services closed before
 * close categories existed (no category row) still count.
 */
export function countsAsChurnClose(
  rules: ChurnCloseReasonRule[],
  closeCategoryId: number | null,
  statusId: number | null,
  reason: string | null,
): boolean {
  if (closeCategoryId === null) return true;

  const status = (Object.keys(CHURN_CLOSE_STATUS_IDS) as ChurnCloseStatus[]).find(
    (s) => CHURN_CLOSE_STATUS_IDS[s] === Number(statusId),
  );
  if (!status) return false;

  const key = normalizeCloseReason(reason);
  const rule = rules.find((r) => r.status === status && normalizeCloseReason(r.reason) === key);
  return rule?.churn ?? false;
}

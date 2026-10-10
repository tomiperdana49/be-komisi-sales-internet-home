// Employees whose NIS log calls may waive a churn (see KOMISI.md, "Pembebasan churn lewat Log Call").
export const CHURN_WAIVER_APPROVERS = ["0200925"];

export type ChurnWaiverBlock = {
  customerServiceId: number;
  accountName: string;
  churn: boolean;
};

/**
 * The approver's own part of a log call: everything before the quoted
 * request, which starts at a line reading just "Subject" (or "Description"
 * when the request has no subject). A block an AM writes inside their
 * request must not waive anything on its own.
 */
export function approverSection(text: string): string {
  const lines = text.replace(/<[^>]+>/g, "\n").split(/\r?\n/);
  const end = lines.findIndex((line) => /^\s*(subject|description)\s*:?\s*$/i.test(line));
  return (end === -1 ? lines : lines.slice(0, end)).join("\n");
}

/**
 * Parses every block of the form
 *   detail:
 *     Service ID 72879
 *     Account Name pujifre
 *     Churn = false
 * from the approver's section of a log call. Blocks missing any field are skipped.
 */
export function parseChurnWaiverBlocks(text: string): ChurnWaiverBlock[] {
  const blocks: ChurnWaiverBlock[] = [];
  const parts = approverSection(text).split(/^\s*detail\s*:?\s*$/im).slice(1);

  for (const part of parts) {
    const serviceId = part.match(/^\s*service\s*id\s*[:=]?\s*(\d+)\s*$/im)?.[1];
    const accountName = part.match(/^\s*account\s*name\s*[:=]?\s*(\S+)\s*$/im)?.[1];
    const churn = part.match(/^\s*churn\s*[:=]\s*(true|false)\s*$/im)?.[1];
    if (!serviceId || !accountName || !churn) continue;

    blocks.push({
      customerServiceId: Number(serviceId),
      accountName,
      churn: churn.toLowerCase() === "true",
    });
  }

  return blocks;
}

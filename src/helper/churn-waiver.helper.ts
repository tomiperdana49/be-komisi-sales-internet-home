// Employees whose NIS log calls may waive a churn (see KOMISI.md, "Pembebasan churn lewat Log Call").
export const CHURN_WAIVER_APPROVERS = ["0200925"];

/**
 * One "Churn = false" / "Churn = true" line. With no account names it covers
 * every churned service of the log call's customer; otherwise only those accounts.
 */
export type ChurnDirective = {
  churn: boolean;
  accounts: string[];
};

/**
 * The approver's own part of a log call: everything before the quoted
 * request, which starts at a line reading just "Subject" (or "Description"
 * when the request has no subject). A line an AM writes inside their
 * request must not waive anything on its own.
 */
export function approverSection(text: string): string {
  const lines = text.replace(/<[^>]+>/g, "\n").split(/\r?\n/);
  const end = lines.findIndex((line) => /^\s*(subject|description)\s*:?\s*$/i.test(line));
  return (end === -1 ? lines : lines.slice(0, end)).join("\n");
}

/**
 * Parses lines like "Churn = false", "Churn = false pujifre" or
 * "churn: true pujifre, pujifre2" from the approver's section of a log call.
 */
export function parseChurnDirectives(text: string): ChurnDirective[] {
  const directives: ChurnDirective[] = [];
  for (const line of approverSection(text).split("\n")) {
    const match = line.match(/^\s*churn\s*[:=]\s*(true|false)\b(.*)$/i);
    if (!match) continue;
    directives.push({
      churn: match[1]!.toLowerCase() === "true",
      accounts: match[2]!.split(/[\s,;]+/).filter(Boolean),
    });
  }
  return directives;
}

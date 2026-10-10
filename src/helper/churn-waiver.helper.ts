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
 * Parses lines like "Churn = false", "Churn = false pujifre" or
 * "churn: true pujifre, pujifre2" anywhere in a log call.
 */
export function parseChurnDirectives(text: string): ChurnDirective[] {
  const directives: ChurnDirective[] = [];
  for (const line of text.replace(/<[^>]+>/g, "\n").split(/\r?\n/)) {
    const match = line.match(/^\s*churn\s*[:=]\s*(true|false)\b(.*)$/i);
    if (!match) continue;
    directives.push({
      churn: match[1]!.toLowerCase() === "true",
      accounts: match[2]!.split(/[\s,;]+/).filter(Boolean),
    });
  }
  return directives;
}

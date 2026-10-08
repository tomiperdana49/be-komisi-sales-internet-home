import { container } from "../container";
import { getDateRangeForPeriod, toSqlDate } from "../helper/period.helper";
import { resolveJobPeriods } from "./job-periods";

async function runPeriod(period: string) {
  const { start, end } = getDateRangeForPeriod(period);
  const startDate = toSqlDate(start);
  const endDate = toSqlDate(end);

  // Products flagged "churn" in that period's Aturan Komisi decide which services count.
  const rules = await container.commissionRuleService.getForPeriod(period);
  const serviceIds = rules.products.filter((p) => p.churn).flatMap((p) => p.serviceIds);

  console.log(`Mengambil data churn untuk periode ${startDate} s.d. ${endDate} (ServiceId: ${serviceIds.join(", ") || "-"})...`);

  const { synced, deleted } = await container.churnService.syncFromBilling(serviceIds, startDate, endDate);

  console.log(`Selesai. Disinkronkan: ${synced}, dihapus (orphan): ${deleted}.`);
}

async function run() {
  for (const period of await resolveJobPeriods()) await runPeriod(period);
  await container.closeConnections();
}

run().catch(async (error) => {
  console.error("Job gagal:", error);
  await container.closeConnections().catch(() => {});
  process.exit(1);
});

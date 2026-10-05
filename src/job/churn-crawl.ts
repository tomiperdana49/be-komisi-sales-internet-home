import { container } from "../container";
import { getDateRangeForPeriod, toSqlDate } from "../helper/period.helper";
import { resolveJobPeriods } from "./job-periods";

async function runPeriod(period: string) {
  const { start, end } = getDateRangeForPeriod(period);
  const startDate = toSqlDate(start);
  const endDate = toSqlDate(end);

  console.log(`Mengambil data churn untuk periode ${startDate} s.d. ${endDate}...`);

  const { synced, deleted } = await container.churnService.syncFromBilling(startDate, endDate);

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

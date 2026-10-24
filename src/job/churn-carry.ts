import { container } from "../container";
import { explicitJobPeriod, getDateRangeForPeriod, hasForceArg, toSqlDate } from "../helper/period.helper";

// Deducts churns missed in their own period in a later one, e.g.:
//   bun run churn:carry -- --period 202610 --account swandijlw,norisjls
// The services are taken as they are in NIS (stopped, CustStatus NA), without
// the churn eligibility rules, and churn:crawl never deletes them.
function accountArg(): string[] {
  const args = process.argv.slice(2);
  const i = args.indexOf("--account");
  const value = i >= 0 ? args[i + 1] : undefined;
  return (value ?? "").split(",").map((a) => a.trim()).filter(Boolean);
}

async function run() {
  const period = explicitJobPeriod();
  const accounts = accountArg();
  if (!period || accounts.length === 0) {
    console.error("Pemakaian: bun run churn:carry -- --period YYYYMM --account akun1,akun2[,...] [--force]");
    process.exitCode = 1;
    return;
  }
  if (!hasForceArg() && (await container.periodClosingService.isClosed(period))) {
    console.error(`Periode ${period} sudah ditutup — dibatalkan (pakai --force untuk tetap menambahkan).`);
    process.exitCode = 1;
    return;
  }

  const deductDate = toSqlDate(getDateRangeForPeriod(period).start);
  const rows = await container.churnService.carryFromBilling(accounts, deductDate);

  for (const row of rows) {
    console.log(
      `+ ${row.customer_id} ${row.customer_service_account} (${row.service_id}) sales ${row.sales_id}, berhenti ${toSqlDate(new Date(row.unregistration_date as string))}`,
    );
  }
  const found = new Set(rows.map((row) => (row.customer_service_account ?? "").toLowerCase()));
  const missing = accounts.filter((a) => !found.has(a.toLowerCase()));
  if (missing.length > 0) {
    console.warn(`Tidak ditemukan / belum berhenti (CustStatus bukan NA): ${missing.join(", ")}`);
    process.exitCode = 1;
  }
  console.log(`Selesai. ${rows.length} churn dipotong di periode ${period}.`);
}

run()
  .catch((error) => {
    console.error("Job gagal:", error);
    process.exitCode = 1;
  })
  .finally(() => container.closeConnections().catch(() => {}));

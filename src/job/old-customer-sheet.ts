import { container } from "../container";
import { OldCustomerService } from "../service/old-customer.service";
import { resolvePeriod } from "../helper/period.helper";

async function run() {
  const period = resolvePeriod();
  console.log(`Mengambil data dari sheet "${period}"...`);

  const [rows, employeeMap, catalog, rules] = await Promise.all([
    container.oldCustomerRepository.findSheetRows(period),
    container.employeeService.getEmployeeIdByName(),
    container.serviceCatalogService.getCatalogByName(),
    container.commissionRuleService.getForPeriod(period),
  ]);

  const values: any[][] = [];
  let skipped = 0;

  for (const row of rows) {
    const input = container.oldCustomerService.mapSheetRowToSnapshotInput(row, catalog);
    const built = container.oldCustomerService.buildRecurringSnapshotValues(input, employeeMap, rules.excludedRecurringCategories);
    if (!built) {
      skipped++;
      continue;
    }
    values.push([period, ...built]);
  }

  await container.snapshotRepository.replaceForPeriod(period, values, OldCustomerService.TYPES);

  console.log(`Selesai. Ditambahkan: ${values.length}, dilewati: ${skipped}.`);
  await container.closeConnections();
}

run().catch(async (error) => {
  console.error("Job gagal:", error);
  await container.closeConnections().catch(() => {});
  process.exit(1);
});

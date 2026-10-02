import { container } from "../container";
import { OldCustomerService } from "../service/old-customer.service";
import { resolvePeriod } from "../helper/period.helper";

async function run() {
  const period = resolvePeriod();
  console.log(`Mengambil data billing (old customer) untuk periode "${period}"...`);

  const [inputs, employeeMap, rules] = await Promise.all([
    container.oldCustomerService.fetchSnapshotInputs(period),
    container.employeeService.getEmployeeIdByName(),
    container.commissionRuleService.getForPeriod(period),
  ]);

  const values: any[][] = [];
  let skipped = 0;

  for (const input of inputs) {
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

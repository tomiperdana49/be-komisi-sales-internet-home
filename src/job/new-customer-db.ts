import { container } from "../container";
import { NewCustomerService } from "../service/new-customer.service";
import { resolveJobPeriods } from "./job-periods";

async function runPeriod(period: string) {
  console.log(`Mengambil data billing untuk periode "${period}"...`);

  const [inputs, employeeMap] = await Promise.all([
    container.newCustomerService.fetchSnapshotInputs(period),
    container.employeeService.getEmployeeIdByName(),
  ]);

  const values: any[][] = [];
  let skipped = 0;

  for (const input of inputs) {
    const built = container.newCustomerService.buildSnapshotValues(input, employeeMap);
    if (!built) {
      skipped++;
      continue;
    }
    values.push([period, ...built]);
  }

  await container.snapshotRepository.replaceForPeriod(period, values, NewCustomerService.TYPES);

  console.log(`Selesai. Ditambahkan: ${values.length}, dilewati: ${skipped}.`);
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

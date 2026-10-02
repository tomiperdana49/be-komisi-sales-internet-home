import { container } from "../container";
import { getDateRangeForPeriod, resolvePeriod, toSqlDate } from "../helper/period.helper";

async function run() {
  const crawledIds: string[] = [];
  const period = resolvePeriod();
  const { start, end } = getDateRangeForPeriod(period);
  const startDate = toSqlDate(start);
  const endDate = toSqlDate(end);
  // Only Permanent staff are ever gated on target (rate/performance-penalty
  // checks all require status === 'Permanent'); everyone else starts at the
  // probation default (0 unless an admin changed it).
  const { targets } = await container.commissionRuleService.getForPeriod(period);

  const sales = await container.nusaworkService.getSalesHome();
  for (const employee of sales) {
    await container.employeeService.upsertEmployee(employee);
    await container.employeeService.upsertStatusPeriod(
      employee.employeeId,
      startDate,
      endDate,
      employee.status,
      employee.status === "Permanent" ? targets.permanent : targets.probation,
    );
    crawledIds.push(employee.employeeId);
    console.log("Employee inserted:", employee.employeeId);
  }

  const admins = await container.nusaworkService.getEmployeeAdmin();
  for (const employee of admins) {
    await container.employeeService.upsertEmployee(employee);
    crawledIds.push(employee.employeeId);
    console.log("Employee inserted:", employee.employeeId);
  }

  // Deactivate anyone in the database that this run didn't see.
  const dbIds = await container.employeeService.getAllEmployeeIds();
  const deactivateIds = dbIds.filter((id) => !crawledIds.includes(id));

  for (const id of deactivateIds) {
    await container.employeeService.deactivateEmployee(id);
    console.log("Employee deactivated:", id);
  }

  console.log(
    `Selesai. Di-crawl: ${crawledIds.length}, dinonaktifkan: ${deactivateIds.length}.`,
  );
  await container.closeConnections();
}

run().catch(async (error) => {
  console.error("Job gagal:", error);
  await container.closeConnections().catch(() => {});
  process.exit(1);
});

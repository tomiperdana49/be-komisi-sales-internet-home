import { container } from "../container";
import { getDateRangeForPeriod, toSqlDate } from "../helper/period.helper";
import { isSdr } from "../helper/commission.helper";
import { resolveJobPeriods } from "./job-periods";
import { statusForPeriod } from "../helper/employee-status.helper";

async function run() {
  const crawledIds: string[] = [];
  // Only Permanent staff are ever gated on target (rate/performance-penalty
  // checks all require status === 'Permanent'); everyone else starts at the
  // probation default (0 unless an admin changed it). Closed periods keep
  // their status rows untouched.
  const periods = await Promise.all(
    (await resolveJobPeriods()).map(async (period) => {
      const { start, end } = getDateRangeForPeriod(period);
      const [{ targets }, sdrRules] = await Promise.all([
        container.commissionRuleService.getForPeriod(period),
        container.sdrCommissionRuleService.getForPeriod(period),
      ]);
      return { startDate: toSqlDate(start), endDate: toSqlDate(end), targets, sdrTargets: sdrRules.targets };
    }),
  );

  // Admin access comes only from the ACL (admin_access). Read it first: if the
  // table is missing this fails before anyone gets deactivated.
  const adminIds = new Set((await container.adminAccessRepository.findAll()).map((a) => a.employee_id));

  const sales = await container.nusaworkService.getSalesHome();
  for (const employee of sales) {
    await container.employeeService.upsertEmployee({ ...employee, isAdmin: adminIds.has(employee.employeeId) });
    for (const { startDate, endDate, targets: amTargets, sdrTargets } of periods) {
      const targets = isSdr(employee.jobPosition) ? sdrTargets : amTargets;
      const status = statusForPeriod(employee.status, employee.signDate, startDate);
      await container.employeeService.upsertStatusPeriod(
        employee.employeeId,
        startDate,
        endDate,
        status,
        status === "Permanent" ? targets.permanent : targets.probation,
      );
    }
    crawledIds.push(employee.employeeId);
    console.log("Employee inserted:", employee.employeeId);
  }

  // ACL admins outside the sales hierarchy (head office, a branch's sales admin, ...).
  // Someone removed from the ACL is no longer pulled in, so they get deactivated below.
  const outsideIds = [...adminIds].filter((id) => !crawledIds.includes(id));
  const admins = outsideIds.length > 0 ? await container.nusaworkService.getEmployeesByIds(outsideIds) : [];
  for (const employee of admins) {
    await container.employeeService.upsertEmployee({ ...employee, isAdmin: true });
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

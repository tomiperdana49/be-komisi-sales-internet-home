import type { Context, Next } from "hono";
import { container } from "../container";
import { ForbiddenException, UnauthorizedException } from "../exception/http.exception";

/** The caller with their ACL role (see access.helper accessFields). */
async function findCaller(c: Context) {
  const user = c.get("user");
  if (!user?.sub) {
    throw new UnauthorizedException("User identity missing");
  }

  const employee = await container.employeeService.findByEmployeeId(user.sub);
  if (!employee) {
    throw new UnauthorizedException("Employee not found");
  }
  return container.employeeService.withAccess(employee);
}

/** Any admin in the ACL. An Admin's views are limited to their entry's branch, if it names one. */
export async function adminMiddleware(c: Context, next: Next) {
  const employee = await findCaller(c);

  if (!employee.is_admin) {
    throw new ForbiddenException("Admin access required");
  }

  c.set("adminBranch", employee.admin_branch ?? null);
  await next();
}

/** Super Admin only: every change on the admin pages, including the ACL itself. */
export async function superAdminMiddleware(c: Context, next: Next) {
  const employee = await findCaller(c);

  if (!employee.is_super_admin) {
    throw new ForbiddenException("Super Admin access required");
  }

  c.set("adminBranch", null);
  await next();
}

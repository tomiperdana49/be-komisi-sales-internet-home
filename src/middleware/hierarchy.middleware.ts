import type { Context, Next } from "hono";
import { container } from "../container";
import { ForbiddenException, UnauthorizedException } from "../exception/http.exception";

/** Restricts a `:id` route param to employees the caller may see (EmployeeService.getVisibleTeam). */
export async function hierarchyMiddleware(c: Context, next: Next) {
  const user = c.get("user");
  const targetEmployeeId = c.req.param("id");

  if (!user?.sub) {
    throw new UnauthorizedException("User identity missing");
  }

  // Include inactive employees for this authorization check.
  const hierarchy = await container.employeeService.getVisibleTeam(user.sub, undefined, false);

  const isAuthorized = hierarchy.some((emp) => emp.employee_id === targetEmployeeId);
  if (!isAuthorized) {
    throw new ForbiddenException("You do not have access to this resource");
  }

  await next();
}

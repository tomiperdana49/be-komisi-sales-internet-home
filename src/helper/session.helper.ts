import { UnauthorizedException } from "../exception/http.exception";
import type { EmployeeDetail, IEmployeeService } from "../interface/employee.interface";

const INACTIVE_MESSAGE = "Akun sudah tidak aktif";

/** Refuses to start a session for an employee the crawl has deactivated (no longer in Nusawork). */
export function assertAccountActive(employee: Pick<EmployeeDetail, "is_active">): void {
  if (!employee.is_active) {
    throw new UnauthorizedException(INACTIVE_MESSAGE);
  }
}

/**
 * JWTs stay valid until they expire, so logout records a cut-off time per
 * employee; any token issued before it — on any device — is refused. So is every
 * token of a deactivated employee, which also stops them refreshing their way
 * into a session that never ends.
 */
export async function assertSessionActive(
  employeeService: Pick<IEmployeeService, "getTokensValidAfter" | "isActive">,
  payload: { sub: string; iatMs?: number },
): Promise<void> {
  if (!(await employeeService.isActive(payload.sub))) {
    throw new UnauthorizedException(INACTIVE_MESSAGE);
  }
  // Millisecond precision: a token issued moments before logout is void, while a
  // login a moment after still works.
  const validAfterMs = await employeeService.getTokensValidAfter(payload.sub);
  if (validAfterMs !== null && (payload.iatMs ?? 0) < validAfterMs) {
    throw new UnauthorizedException("Sesi sudah berakhir, silakan login kembali");
  }
}

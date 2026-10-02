import { UnauthorizedException } from "../exception/http.exception";
import type { IEmployeeService } from "../interface/employee.interface";

/**
 * JWTs stay valid until they expire, so logout records a cut-off time per
 * employee; any token issued before it — on any device — is refused.
 */
export async function assertSessionActive(
  employeeService: Pick<IEmployeeService, "getTokensValidAfter">,
  payload: { sub: string; iatMs?: number },
): Promise<void> {
  // Millisecond precision: a token issued moments before logout is void, while a
  // login a moment after still works.
  const validAfterMs = await employeeService.getTokensValidAfter(payload.sub);
  if (validAfterMs !== null && (payload.iatMs ?? 0) < validAfterMs) {
    throw new UnauthorizedException("Sesi sudah berakhir, silakan login kembali");
  }
}

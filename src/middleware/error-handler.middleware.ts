import type { ErrorHandler } from "hono";
import { HttpException } from "../exception/http.exception";
import { errorResponse } from "../helper/api-response.helper";

/**
 * Registered via app.onError — catches anything thrown by a route or middleware.
 * HttpExceptions carry messages written for the user, so they pass through.
 * Anything else (SQL errors, bugs) can expose table names, queries or file
 * paths, so the client only gets a reference; the details stay in the server log
 * under the same reference.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HttpException) {
    return c.json(errorResponse(err.message, err.details), err.statusCode);
  }

  const reference = crypto.randomUUID().slice(0, 8);
  console.error(`[error ${reference}] ${c.req.method} ${c.req.path}`, err);
  return c.json(errorResponse("Terjadi kesalahan di server", `Kode referensi: ${reference}`), 500);
};

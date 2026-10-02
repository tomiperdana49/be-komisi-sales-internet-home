import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Base for every error meant to reach the client as a structured JSON
 * response. Throw this (or a subclass) from anywhere — controller,
 * middleware, or service — and the global error handler in
 * middleware/error-handler.middleware.ts turns it into the right HTTP
 * response, so call sites never need their own try/catch for it.
 */
export class HttpException extends Error {
  constructor(
    public readonly statusCode: ContentfulStatusCode,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestException extends HttpException {
  constructor(message = "Bad request", details?: string) {
    super(400, message, details);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = "Unauthorized", details?: string) {
    super(401, message, details);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = "Forbidden", details?: string) {
    super(403, message, details);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = "Not found", details?: string) {
    super(404, message, details);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(
    message = "Too many requests",
    /** Seconds the client should wait; sent as the Retry-After header. */
    public readonly retryAfterSeconds?: number,
  ) {
    super(429, message);
  }
}

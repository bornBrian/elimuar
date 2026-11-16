import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ERROR_CODES, type ErrorCode } from "@elimuar/shared";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode | string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, ERROR_CODES.VALIDATION_FAILED, message, details);
  }
  static unauthenticated(message = "Sign in to continue") {
    return new HttpError(401, ERROR_CODES.UNAUTHENTICATED, message);
  }
  static forbidden(message = "You do not have access to this resource") {
    return new HttpError(403, ERROR_CODES.FORBIDDEN, message);
  }
  static notFound(message = "Not found") {
    return new HttpError(404, ERROR_CODES.NOT_FOUND, message);
  }
  static conflict(message: string) {
    return new HttpError(409, ERROR_CODES.CONFLICT, message);
  }
  static tooMany(message = "Too many attempts. Try again later.") {
    return new HttpError(429, ERROR_CODES.TOO_MANY_ATTEMPTS, message);
  }
  static internal(message = "Something went wrong") {
    return new HttpError(500, ERROR_CODES.INTERNAL, message);
  }
}

export function sendData<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ ok: true, data });
}

export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw HttpError.badRequest("Some fields need attention", result.error.flatten());
  }
  return result.data;
}

export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req as T, res, next).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    ok: false,
    error: { code: ERROR_CODES.NOT_FOUND, message: `No route for ${req.method} ${req.path}` },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Some fields need attention",
        details: err.flatten(),
      },
    });
    return;
  }
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "22P02") {
    res.status(404).json({
      ok: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: "That record could not be found" },
    });
    return;
  }

  console.error("Unhandled API error:", err);
  res.status(500).json({
    ok: false,
    error: { code: ERROR_CODES.INTERNAL, message: "Something went wrong" },
  });
}

export function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

import { z } from "zod";

export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  STUDENT_WEB_ACCESS_DISABLED: "STUDENT_WEB_ACCESS_DISABLED",
  INVALID_CODE: "INVALID_CODE",
  CODE_EXPIRED: "CODE_EXPIRED",
  TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  ACCOUNT_NOT_REGISTERED: "ACCOUNT_NOT_REGISTERED",
  ASSET_TOO_LARGE: "ASSET_TOO_LARGE",
  ASSET_POLYGON_BUDGET_EXCEEDED: "ASSET_POLYGON_BUDGET_EXCEEDED",
  PREREQUISITE_NOT_MET: "PREREQUISITE_NOT_MET",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const apiFailureSchema = z.object({
  ok: z.literal(false),
  error: apiErrorSchema,
});

export function apiSuccessSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data });
}

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type ApiSuccess<T> = { ok: true; data: T };

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().max(120).optional(),
});

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });
}

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

import type { Context } from "hono";

/**
 * Standard API response envelope — copy-adapted from the root app's
 * server/lib/api-utils.ts (read-only salvage reference). Every v6 endpoint
 * returns { success, data } or { success: false, error, code }.
 */

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export function apiSuccess<T>(c: Context, data: T, status: 200 | 201 = 200) {
  // eslint-disable-next-line no-restricted-syntax -- this IS the envelope helper; raw c.json is its implementation.
  return c.json({ success: true, data }, status);
}

export function apiError(
  c: Context,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 = 400,
  code?: ErrorCodeType,
) {
  // eslint-disable-next-line no-restricted-syntax -- this IS the envelope helper; raw c.json is its implementation.
  return c.json(
    {
      success: false,
      error: message,
      code: code ?? statusToErrorCode(status),
    },
    status,
  );
}

function statusToErrorCode(status: number): ErrorCodeType {
  switch (status) {
    case 400:
    case 422:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}

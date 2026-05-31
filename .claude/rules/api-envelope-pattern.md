---
description: Hono routes MUST use apiSuccess/apiError/apiPaginated from server/lib/api-utils.ts. Raw c.json() is blocked by ESLint.
globs: ["server/routes/**/*.ts", "server/middleware/**/*.ts", "server/index.ts", "server/lib/api-utils.ts"]
version: "1.0.0"
synthesized: true
private: false
---

# API Response Envelope Pattern

Every Hono route response in FIREKaro MUST be wrapped in a discriminated envelope emitted by the helpers in `server/lib/api-utils.ts`. Raw `c.json(...)` calls are rejected by the ESLint `no-restricted-syntax` rule in `eslint.config.js` with the message: "Use apiSuccess() or apiError() from server/lib/api-utils instead of raw c.json(). See rules/hono-route-conventions.md."

## The Three Envelopes

- `apiSuccess(c, data, status = 200)` — success responses. Wraps `{ success: true, data }`.
- `apiError(c, message, status = 400, code?, details?)` — error responses. Wraps `{ success: false, error: { message, code?, details?, traceId? } }`.
- `apiPaginated(c, items, pagination, status = 200)` — paginated list responses. Wraps `{ success: true, data, pagination: { page, pageSize, total, totalPages, hasMore } }`.

All three accept the Hono `Context` as the first argument and set the status via Hono's response API — do not chain `.status(...)` manually.

## MUST / MUST NOT

- Routes MUST import from `server/lib/api-utils.ts` — never from local shims.
- Route handlers MUST NOT call `c.json(...)` directly. ESLint blocks this at lint time.
- Error paths MUST use `apiError(c, message, status, code?)` — never `c.json({ success: false, ... })`.
- The `ErrorCode` enum from `api-utils.ts` MUST be used for machine-readable error codes (e.g., `ErrorCode.VALIDATION_ERROR`, `ErrorCode.UNAUTHORIZED`). Do not invent ad-hoc string codes.
- The global `onError` handler in `server/index.ts` already converts uncaught exceptions to `apiError` envelopes with a `traceId` — do not duplicate that logic in route-level try/catch.

## Canonical Example

See `server/routes/goals.ts` — it demonstrates every envelope case, including validation failures routed through `apiError` with `ErrorCode.VALIDATION_ERROR`, not-found routed with status 404, and list responses opting into pagination via `apiPaginated`.

## Why This Matters

Frontend composables in `src/composables/**` call `unwrapResponse()` / `unwrapArrayResponse()` from `src/utils/api-helpers.ts`, which assume the envelope shape. A raw `c.json(payload)` breaks unwrap at runtime because the client unconditionally peels `.data` off the response. One rogue endpoint returning a bare object corrupts every caller's TanStack Vue Query cache.

## Migration Note

`rules/hono-route-conventions.md` still contains stale examples with `c.json({ success: false, error: '...' }, 500)` inside error handlers. Those examples predate the envelope migration. This rule supersedes them — prefer `apiError(c, '...', 500)` and expect the stale examples to be removed in a follow-up.

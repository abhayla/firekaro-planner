---
description: Hono route conventions for the v6 document API in server/src/routes/ (5 route files) — mount pattern, envelope, validation, logging, auth placement.
paths: ["server/src/routes/**/*.ts", "server/src/index.ts"]
---

# Hono Route Conventions

> **Rewritten 2026-08-26.** The previous body was inherited from the retired `FIREKaro-Vue`
> monorepo (41 CRUD route files under `server/routes/`, raw `c.json`, `console.error`, FY query
> params, pagination). None of that exists here, and its globs never matched `server/src/`, so the
> rule had never loaded. This version describes THIS repo. Canonical example: `server/src/routes/planner.ts`.

## What the backend is

A **document API**, not granular REST: `GET`+`PUT /api/planner/<key>` mirror
`StorageAdapter.get/set(key)` 1:1 (see `.claude/rules/server-backend.md`). Five route files:
`planner.ts` (the document endpoints), `comms-consent-route.ts`, `whatsapp-webhook.ts`,
`lifecycle-internal.ts`, `smoke-internal.ts`. Do not add CRUD-style `/:id` sub-resources without an
ADR — the frontend spine (stores + adapter) assumes whole-document reads/writes.

## Route file skeleton

```ts
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { apiSuccess, apiError, ErrorCode } from "../lib/api-utils";
import { logger } from "../lib/logger";

const app = new Hono();
app.use("*", authMiddleware);   // session-gated routes only — see "Mounting" below

app.get("/household", async (c) => {
  const userId = c.get("userId");            // from the session, NEVER the body
  try {
    return apiSuccess(c, await readHousehold(userId));
  } catch (err) {
    logger.error({ err, userId }, "planner.household.read failed");
    return apiError(c, "Failed to read household", 500, ErrorCode.INTERNAL_ERROR);
  }
});

export default app;
```

## MUST / MUST NOT

- **Envelope only.** `apiSuccess(c, data, 200|201)` / `apiError(c, message, status, ErrorCode.X)`.
  Raw `c.json(...)` is blocked by `server/eslint.config.mjs` (`npm run lint`). Details:
  `.claude/rules/api-envelope-pattern.md`.
- **Logging via pino only** (`../lib/logger`); `console.*` is lint-blocked. Structured object first,
  message second; never interpolate secrets or PII into the message
  (`.claude/rules/structured-logging.md`).
- **`userId` comes from `c.get("userId")`** (set by `authMiddleware`). MUST NOT read it from the body,
  query, or headers. Every Prisma query is scoped by it.
- **Validation at the boundary with the shared Zod schemas** — `householdSchema` /
  `assumptionsSchema` from `@planner/types/*` (the frontend's own model, aliased into the server) —
  via `safeParse`. Malformed JSON → `400 VALIDATION_ERROR`; schema failure → `422 VALIDATION_ERROR`
  with `parsed.error.message`. Do not hand-roll a second schema in the route file.
- **Writes that touch multiple tables go through ONE Prisma `$transaction`** (`PUT /household` via
  `applyHouseholdPlan` + the diff engine). The `ui` document PUT MERGES the prefs blob in a
  SERIALIZABLE transaction — never wholesale-replace it (it shares a row with `plan-baseline`).
- **Uncaught errors are already enveloped** by `app.onError` in `server/src/index.ts` (logged with
  `traceId`). Catch in a route only to return a *more specific* message/code; never to swallow.
- **Server Zod schemas are STRIP mode.** Every optional field a frontend document type gains MUST be
  declared in `server/src/lib/planner-schemas.ts` AND persisted by the Prisma write layer — a schema
  that doesn't know a field silently strips it out of the request before it ever reaches the DB. The
  locks are `src/lib/server-schema-parity.spec.ts` (frontend/server schema-shape parity) and
  `server/src/lib/planner-assumptions-mapping.spec.ts` (mapping round-trip) — red-then-green proven
  2026-08-27. This class has recurred twice already (`ui.quick`, `frameVersion`).

## Mounting (`server/src/index.ts`)

Global middleware order is fixed: `requestId` → `pinoLogger` → `secureHeaders` → `bodyLimit(1 MB)` →
`cors(allowedOrigins)` → `app.onError` → `rateLimit` on `/api/auth/*` → route mounts.

| Mount | File | Auth |
|---|---|---|
| `/api/planner` | `planner.ts` | `authMiddleware` (session or the 3-factor dev-bypass — `.claude/rules/dev-bypass-auth.md`) |
| `/api/comms` | `comms-consent-route.ts` | `authMiddleware` |
| `/api/webhooks` | `whatsapp-webhook.ts` | No session (Wati is the caller); optional shared secret via `?token=` when `WATI_WEBHOOK_SECRET` is set |
| `/api/internal` | `lifecycle-internal.ts`, `smoke-internal.ts` | Token-guarded (`LIFECYCLE_RUN_TOKEN` / `SMOKE_TOKEN`, constant-time, fail-closed if unset) — mounted OUTSIDE `authMiddleware` |

A new token-guarded internal route copies the `smoke-internal.ts` guard; a new user-facing route goes
under `authMiddleware`. Never mount a session-gated route outside it.

## Tests

Colocate `*.spec.ts`. Live-DB specs self-gate on `process.env.DATABASE_URL`
(`planner.integration.spec.ts`; rule: `.claude/rules/vitest-config-split.md`). Pure logic (diff
engine, guards) gets no-DB unit specs.

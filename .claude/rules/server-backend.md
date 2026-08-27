---
description: Backend (`server/`) architecture — Supabase/pooler, the /api/planner document endpoints, the household diff engine, auth + dev-bypass, prod smoke, owner alerts. Extracted from CLAUDE.md (T-349, 2026-08-26) to fit the ≤80-line project-root budget; CLAUDE.md keeps a 3-line pointer.
paths: ["server/**"]
---

# Backend (`server/`) — Hono + Prisma + Better Auth → Supabase


- **DB: Supabase project `firekaro-planner`** (ap-south-1, Postgres 17). Connect via the **session
  pooler** `aws-1-ap-south-1.pooler.supabase.com:5432` (the direct `db.*.supabase.co` host is
  IPv6-only → P1001 over IPv4). `DATABASE_URL` + `BETTER_AUTH_SECRET` live in **`server/.env`**
  (gitignored — never commit). 24-table schema in `server/prisma/schema.prisma`, derived 1:1 from
  the frontend's Zod model (`src/types/household.ts` + `assumptions.ts`).
- **Document endpoints** `GET`+`PUT /api/planner/{household,assumptions,scenarios,features,ui,
  expense-history,plan-baseline}` + `DELETE /api/planner/all` + `GET /api/planner/me` — mirror the
  `StorageAdapter.get/set(key)` 1:1. NOT granular REST. `userId` from the authenticated session
  only, never the body. `apiSuccess`/`apiError` envelope. `plan-baseline` (#138) is stored as a
  `planBaseline` sub-key inside the same `userUiPrefs.prefs` JSON row the `ui` document uses — the
  `ui` PUT MERGES the blob in a SERIALIZABLE transaction (never wholesale-replaces) so it cannot
  strip a concurrent plan-baseline write.
- **Household diff engine** (`server/src/lib/household-diff.ts`): a pure function that maps an
  incoming `Household` to per-table insert/update/delete; `PUT /household` applies it in ONE Prisma
  `$transaction`. Auto-flow recurring rows upsert by `(userId, sourceRefId)`; `"Joint"` ownerId is
  plain TEXT (no FK). TDD red-first; the colocated `household-diff.spec.ts` units are the no-DB correctness proof. The Prisma
  read/write layer the diff engine drives is `server/src/lib/household-repo.ts`.
- **Comms subsystem** (WhatsApp via Wati + Zoho CRM lifecycle messaging): mounted routes
  (`/api/comms`, `/api/webhooks`, the token-guarded `/api/internal` lifecycle scheduler) + the
  `server/src/lib` comms/lifecycle/Zoho layer + the `derive()`-sharing nudge loop + template SSOT
  (`docs/wati-templates.json`) + the spend/consent/PII send-discipline — **full detail in
  `.claude/rules/comms-subsystem.md`** (path-scoped, auto-loads on the comms files). Outbound sends =
  spend + outward-facing → escalate per `decision-authority.md`. Go-live blockers:
  `docs/comms-go-live-handoff.md`.
- **Auth:** Better Auth (Google OAuth + sessions) + the **3-factor dev-bypass** (`NODE_ENV` is an
  explicit `development`/`test` + `DEV_BYPASS_AUTH==='true'` + `x-dev-bypass` header), dev user
  `dev@firekaro-v6.local`. The frontend login UI is `src/pages/Login.vue` (route `/login`) driving
  `src/lib/auth-client.ts`; the router's first `beforeEach` guard bounces users there when
  `getAuthProvider().isAuthenticated()` is false (`LocalAuthProvider` returns true in demo mode, so
  the bounce only bites under the ServerAdapter). Auth routes (`/api/auth/*`) are rate-limited
  (`.claude/rules/rate-limiting-middleware.md`).
- **Prod smoke** (`server/src/routes/smoke-internal.ts`): `GET /api/internal/smoke` — `SMOKE_TOKEN`-
  guarded (constant-time, fail-closed if unset), does a `prisma.user.count()` read round-trip. The
  Tier-1 post-deploy health probe (richer than `/api/health`'s raw `SELECT 1`). Mounted OUTSIDE
  `authMiddleware`, like the lifecycle scheduler. Placement: `.claude/rules/testing-strategy.md`;
  runbook: `docs/DEPLOY.md` §8.
- **Owner-alert detectors** (`server/src/lib/owner-notify.ts`): fire-and-forget `notifyOwner(severity,
  title, opts)` POSTs to the external **Notifier gateway** (separate repo `abhayla/Notifier`, PM2 on the
  same VPS) — wired at signup (`comms-signup.ts`), unhandled 5xx + DB-down (`index.ts`), and boot-env
  issues (`validate-env.ts`). Non-breaking by construction: silent no-op when `NOTIFIER_URL`/`NOTIFIER_KEY`
  are unset (dev/CI), 2s timeout, never awaited in the request path, never throws. Payloads are DPDP-safe
  (no user PII).
- The `.claude/rules/` for **Hono / Prisma / api-envelope / api-response-unwrapping / dev-bypass-auth
  / structured-logging** apply to `server/` (it IS Hono + Prisma + Better Auth).


## Verifying a write end-to-end (dev)

`curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/household` — an independent read after
any UI/adapter write (rules 25/26). Standalone Prisma scripts hitting Supabase while the dev server holds
connections MUST append `?connection_limit=1` (session pooler caps at 15 clients → `EMAXCONNSESSION`).

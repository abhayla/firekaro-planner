# GOAL — v6 Phase 1: backend foundation for the mvp/ FIRE Planner

**Type:** Autonomous build contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below (locked in an architect-grilled design session,
recorded in `docs/v6-fire-planner-product-plan.md` Phase 1) — do not pause to ask; make the call
the contract specifies and keep going until the Definition of Done is met.

**Owner:** Abhay · **Created:** 2026-05-31 · **Scope:** `mvp/` tree + the NEW `mvp/server/`
backend dir (the one authorized boundary exception) + a `firekaro_v6` Postgres DB.
**Invocation:** `/goal docs/goals/2026-05-31-v6-phase1-backend-foundation.md`

---

## 0. Mission

Give the **`mvp/` FIRE Planner a real backend** so a logged-in user's data persists server-side
and syncs across devices — replacing the browser-only localStorage persistence with a network
backend **behind the existing `StorageAdapter`/`AuthProvider` seams** (ADR-0001), with **zero
change to the 6 Pinia stores or the router guards**. Build it as Hono + Prisma + Postgres + Better
Auth against a **new lean 21-table schema** in a **new `firekaro_v6` database**, plus a
**write-behind `ServerAdapter`** that keeps the synchronous adapter interface intact. "Done" =
the backend round-trips every entityKey (household, assumptions, scenarios, features, ui,
expense-history) for a fresh logged-in user, the diff engine persists the household document into
its normalized child tables without data loss, and the **~480 existing mvp unit tests stay green**.

This is **Phase 1 of the v6 product plan** (`docs/v6-fire-planner-product-plan.md` §5). Migration
of the old firekaro.com app's data is **explicitly OUT OF SCOPE** (that is Phase 4, gated on a
parked user-count survey). Phase 1 proves the backend works for a **fresh** user.

**The one non-negotiable outcome:** the `StorageAdapter` interface stays **synchronous** and the 6
stores (`household.ts`, `assumptions.ts`, `scenarios.ts`, `features.ts`, `ui.ts`,
`expense-history.ts`) + `router/index.ts` are **UNCHANGED**. If a change to those files seems
required, the design is being violated — stop and re-read §2 STAGE C.

---

## 0.2 PREFLIGHT — read the plan + code + git log FIRST (idempotency · NO duplication)

**This is the first action of the run, before ANY stage. Non-negotiable.** A parallel session (or
a prior partial run of this contract) may already have done part of this. This contract must be
**safe to run at any time without redoing finished work.**

1. **Read the design SSOT:** `docs/v6-fire-planner-product-plan.md` Phase 1 section — it is the
   authoritative record of every locked decision this contract implements. If anything here
   contradicts that doc, the doc wins; note the contradiction in the final report.
2. **Per-stage idempotency check — SKIP (verify-only) anything already done:**
   | Item | How to check it's already done |
   |---|---|
   | `mvp/server/` scaffold | `test -d mvp/server && test -f mvp/server/package.json` |
   | Prisma schema (21 tables) | `grep -c "^model " mvp/server/prisma/schema.prisma` ≈ 21 |
   | Migrations applied | `ls mvp/server/prisma/migrations/` non-empty |
   | API endpoints | `grep -rl "/api/planner" mvp/server/` |
   | Diff engine + its tests | `test -f mvp/server/src/lib/household-diff.ts` + `*.spec.ts` |
   | ServerAdapter | `test -f mvp/src/lib/server-adapter.ts` |
   | `setAdapter`/`getAdapter` | `grep -n "setAdapter\|getAdapter" mvp/src/lib/storage-adapter.ts` |
   | `ServerAuthProvider` | `grep -n "ServerAuthProvider" mvp/src/lib/auth-provider.ts` |
3. **Scan `git log --oneline -20`** for `feat(mvp-v6):` / `feat(v6):` commits matching these items.
   If found + the code confirms it, **SKIP the build — verify-only.** If partial, build only the
   delta. If absent, build normally.
4. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 0.3 VERIFICATION ENVIRONMENT — NO LOCAL DATABASE (supersedes all local-Postgres references below)

**HARD CONSTRAINT (2026-05-31): there is NO local Postgres available — no Docker, no local
install. This run MUST NOT attempt to start one.** Any later reference in this contract to "local
Docker Postgres 16" / `docker compose up -d db` / `postgres:16-alpine` is **SUPERSEDED by this
section** — do not spin up a database.

Consequence — the run splits verification into two tiers:

**TIER 1 — runs in-session (NO live DB required):**
- Prisma schema authoring + `npx prisma validate` (static, no DB).
- Migration SQL **generated, not applied:** `npx prisma migrate dev --create-only` (writes the
  migration `.sql` without a database) — OR `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` to emit the SQL. The migration files are produced + committed; they are NOT applied.
- The **household diff engine unit tests** (pure functions, Zod fixtures — NO DB). This is the
  highest-risk piece and it is fully verifiable in-session.
- The Hono endpoints + `ServerAdapter` + `ServerAuthProvider` code, type-checked. Endpoint
  integration tests are **authored but `describe.skip`'d** with a comment `// pending firekaro_v6
  provisioning (no local DB)`. The ServerAdapter's write-behind/debounce logic is unit-tested with
  a **mocked `fetch`** (no network/DB).
- The **~480 mvp frontend unit tests stay green** (STAGE C) — these never needed a DB.

**TIER 2 — DEFERRED to a post-provisioning verification pass (NOT run in-session):**
- `npx prisma migrate deploy` against the live `firekaro_v6`.
- Endpoint integration tests (un-skip them) + the **Rule 25 persistence** round-trip + the **Rule
  26 round-trip-fidelity** proof — all against the live VPS `firekaro_v6`.
- These run AFTER Abhay executes `mvp/server/DEPLOY-VPS-firekaro_v6.md` to provision the DB. The
  run emits a `mvp/server/VERIFY-AFTER-PROVISION.md` describing exactly which gates to re-run and
  how (the curl round-trips + the deep-equal fidelity check), so the deferred proof is a scripted
  follow-up, not lost.

**Honesty mandate (Rule 20):** the final report MUST state plainly that **persistence /
round-trip is NOT proven in-session** (no DB was available) — only the schema, migration SQL,
diff-engine, and frontend tests are proven. Do NOT claim the backend round-trips data until Tier 2
runs against the live DB. This is the truthful degradation, not a failure.

---

## 1. Context you need (read first)

| Thing | Path | Why it matters |
|---|---|---|
| **Design SSOT** | `docs/v6-fire-planner-product-plan.md` (Phase 1) | Every locked decision, with rationale + the caught-bug call-outs. Authoritative. |
| Zod data model | `mvp/src/types/household.ts` (463 lines) | The ENTIRE planner model as Zod schemas (`memberSchema`, `businessSchema`, `investmentSchema` [12-subtype], `liabilitySchema`, `insurancePolicySchema`, `expensesSchema`, `householdSchema`, …). **The Prisma schema is derived 1:1 from these.** |
| Assumptions model | `mvp/src/types/assumptions.ts` | `assumptionsSchema` → `user_assumptions` table. |
| **StorageAdapter** | `mvp/src/lib/storage-adapter.ts` | `interface StorageAdapter { get<T>(key):T\|null; set<T>(key,value):void; remove(key):void; clearForCurrentUser():void }` — **SYNCHRONOUS**. Keys `firekaro-mvp:${userId}:${entityKey}`. `makeAdapter(auth)` factory. |
| **AuthProvider** | `mvp/src/lib/auth-provider.ts` | `interface AuthProvider { getCurrentUserId():string }` (sync). `setAuthProvider()`/`getAuthProvider()` singleton — **mirror this pattern for the adapter.** |
| Stores (DO NOT CHANGE) | `mvp/src/stores/{household,assumptions,scenarios,features,ui}.ts` | `hydrate()` (sync, reads `adapter.get`), `persist()` (`adapter.set`), `watch(data, persist, {deep:true})`. The deep-watch auto-persists the WHOLE object on every mutation. |
| Expense history | `mvp/src/lib/expense-history.ts` | Calls `makeAdapter(getAuthProvider())` at module level; reads/writes the **separate `expense-history` entityKey** (period-keyed snapshots), NOT inside the household blob. |
| Router guards | `mvp/src/router/index.ts` (~lines 120-148) | Two `beforeEach` guards call `household.hydrate()` + `features.hydrate()` synchronously. Must stay sync (warm-cache pre-fill makes this work). |
| Boot | `mvp/src/main.ts` | The ONE place that becomes async (await `hydrateAll()` before mount). |
| **Salvage source** | `server/` (root app) — `index.ts`, `lib/api-utils.ts`, `middleware/auth.ts`, `lib/logger.ts`, `lib/validate-env.ts` | Reuse the **patterns** (Hono structure, `apiSuccess`/`apiError` envelope, Better Auth middleware, pino logger, env validation, 3-factor dev-bypass) — COPY-ADAPT into `mvp/server/`, do NOT import across trees and do NOT modify the root `server/`. |
| Root deps for versions | root `package.json` | Reference versions: `hono ^4.11.3`, `better-auth ^1.4.10`, `prisma ^5.22.0`, `@prisma/client`. Use the same major versions in `mvp/server/`. |
| ~~Local DB~~ — NOT AVAILABLE | see §0.3 | **No local Postgres (no Docker, no install).** Schema is verified by `prisma validate` (static) + migration-SQL generation; all live-DB verification is Tier-2 deferred to post-provisioning. Do NOT start a database. |

**Gotchas:**
- **CWD trap:** mvp frontend commands run from `mvp/` (`cd mvp`); backend commands run from
  `mvp/server/` (`cd mvp/server`). Wrong CWD silently runs the parent `firekaro-vue` root project.
  The mvp `type-check` banner must read `firekaro-mvp`.
- **`investmentSchema` is FLAT at runtime** (`household.ts:243` — discriminated-union dispatch is
  READ-time only). So the `investments` table = shared columns + a `subtype_data JSONB` column,
  NOT 12 tables and NOT a wide sparse table.
- **`ownerId` can be the literal string `"Joint"`** (not just a member id) on investments,
  liabilities, businesses, other-income → store as plain `TEXT`, **NO foreign key** to members;
  Zod-refine `(isMemberId | "Joint")` at the API boundary.
- **`expense-history` is a separate entityKey** → its own `GET/PUT /api/planner/expense-history`
  + its own `expense_snapshots` table (reconcile by `(userId, period)`, NOT by id). If the adapter
  forgets to register this key, users lose FIRE-trajectory chart history.
- **Auto-flow derived recurring rows** (`source='auto-loan'`/`'auto-insurance'`) → the diff engine
  must use `ON CONFLICT (userId, sourceRefId) DO UPDATE` or it duplicates them.
- **No backend exists yet** — `mvp/server/` is a fresh scaffold. `mvp/` has its own
  `node_modules/`; `mvp/server/` gets its own too.

---

## 2. Stages

### STAGE A — Provision + schema (roles: DBA + Architect)

**Create:** `mvp/server/` scaffold (`package.json`, `tsconfig.json`, `.env.example`,
`prisma/schema.prisma`), the **21-table Prisma schema** derived 1:1 from the Zod schemas, and the
initial migration. **Keep untouched:** `mvp/src/**`, root `server/`, everything else.

#### Pre-made design decisions (do NOT deviate)
1. **Backend dir = `mvp/server/`** (self-contained v6 product inside the mvp tree). Own
   `package.json`, own `node_modules/`, Hono + Prisma + Better Auth + pino. Same major versions as
   root (`hono ^4`, `better-auth ^1.4`, `prisma ^5`).
2. **21 tables** exactly as specified in the design SSOT: 13 domain (`household_config`, `members`,
   `businesses`, `other_income_lines`, `investments`, `liabilities`, `liability_co_borrowers`,
   `insurance_policies`, `recurring_expense_lines`, `planned_future_lines`,
   `estate_checklist_items`, `expense_snapshots`) — wait, that is 12; the 13th domain table is
   `households` IF a top-level row is needed, but per the schema `household_config` IS the
   per-user singleton, so the 13 = the 12 listed + `users` is auth. **Authoritative count:** match
   the table inventory in `docs/v6-fire-planner-product-plan.md` Phase 1 (13 domain + 4 config
   [`user_assumptions`, `scenarios`, `user_features`, `user_ui_prefs`] + 2 Better-Auth [`user`,
   `session`/`account` per Better Auth's own schema] + 2 deferred [`data_sync_log`,
   `migration_audit` — create the models but they have no Phase-1 writers]). If the exact count
   resolves to 20 or 22 after reading the Zod model, follow the **Zod model**, not the number —
   the number is a guide, the Zod schemas are the contract.
3. **Every domain/config table:** `id TEXT @id` (cuid), `userId TEXT NOT NULL` + `@@index([userId])`,
   `createdAt`, `updatedAt`. Singletons (`household_config`, `user_assumptions`, `user_features`,
   `user_ui_prefs`) get `@@unique([userId])`. `estate_checklist_items` → `@@unique([userId, key])`.
   `expense_snapshots` → `@@unique([userId, period])`. `recurring_expense_lines` +
   `planned_future_lines` → `@@unique([userId, sourceRefId])` (nullable sourceRefId; the unique
   only bites for auto-flow rows). **Add `updatedAt` to EVERY table now** (P2 ETag locking).
4. **Variant fields → JSONB:** `investments.subtypeData Json`, `scenarios.leverValues Json`,
   `userFeatures.flags Json`, `userUiPrefs.prefs Json`. Shared/queried columns stay typed.
5. **`ownerId` columns = `String` (plain TEXT), NO `@relation` to members.** (The `"Joint"`
   sentinel breaks a real FK.) Validation lives in the API-layer Zod refinement, not the DB.
6. **Aggregated arrays = child tables** (`recurring_expense_lines`, `planned_future_lines`,
   `liability_co_borrowers`). `liability_co_borrowers` → real FK to `liabilities.id` ON DELETE
   CASCADE; its `memberId` is plain TEXT (soft ref).
7. **VPS provisioning is a RUNBOOK, not an unattended action.** The run **cannot** SSH the VPS to
   create `firekaro_v6` / roles / `pg_hba` (no credentials available unattended — confirmed by the
   2026-05-31 auth saga). So STAGE A:
   - **Verifies the schema STATICALLY (NO DB — see §0.3):** `npx prisma validate` passes, and the
     migration SQL is **generated** (not applied) via `npx prisma migrate dev --create-only` (or
     `prisma migrate diff --from-empty --to-schema-datamodel ... --script`). The migration `.sql`
     is produced + committed. Do NOT start a local database.
   - **Emits** `mvp/server/DEPLOY-VPS-firekaro_v6.md` — the exact runbook for Abhay to run on the
     VPS: `CREATE DATABASE firekaro_v6; CREATE USER firekaro_v6_user WITH PASSWORD '...';` grants,
     the `pg_hba.conf` line (`host firekaro_v6 firekaro_v6_user <app-ip>/32 scram-sha-256`),
     `npx prisma migrate deploy` against the prod URL, and the Better Auth table setup. This is the
     honest hand-off: the run produces a deploy-ready artifact; Abhay runs the VPS keystrokes.
   - This is NOT a hard halt — STAGE A completes with a validated schema + generated migration SQL
     + the runbook. Live migration apply is Tier-2 (post-provisioning).

#### STAGE A acceptance (run the §3 gate sweep before committing)
- `cd mvp/server && npx prisma validate` → schema valid; `grep -c "^model " prisma/schema.prisma`
  matches the design inventory (±1, justified by the Zod model).
- Migration SQL **generated** (NO DB — §0.3): `migrate dev --create-only` (or `migrate diff …
  --script`) produces the `.sql`; the SQL is reviewed to confirm it contains the expected
  `CREATE TABLE`s, JSONB columns, `@@unique` constraints, and NO FK on `ownerId` columns. **Do NOT
  apply it** (no DB). Live apply is Tier-2 / runbook.
- Every table has `userId` + `updatedAt`; JSONB variants + `@@unique` + `ownerId`-as-TEXT (no FK)
  all present in the schema. Spot-check 3 tables against their Zod schemas.
- `mvp/server/DEPLOY-VPS-firekaro_v6.md` (runbook) + `mvp/server/VERIFY-AFTER-PROVISION.md`
  (the deferred Tier-2 gate script) both exist.
- **Stage gate sweep:** static (schema validates, migration SQL generated + reviewed) → Rule 26
  (schema ↔ Zod shape cross-check for `members`, `investments`, `expenses` lines) → Rule 24 N/A
  (no UI) → Rule 25 N/A (no write path yet). Green or DEFERRED-with-reason before commit.

---

### STAGE B — Hono backend: 13 endpoints + the diff engine (role: Full-Stack)

**Create:** `mvp/server/src/**` — the Hono app, the 13 `/api/planner/*` routes, the **server-side
household diff engine**, Better Auth middleware + 3-factor dev-bypass, the `apiSuccess`/`apiError`
envelope (copy-adapt from root `server/lib/api-utils.ts`), pino logger, env validation. **Keep
untouched:** `mvp/src/**`, root `server/`.

#### Pre-made design decisions (do NOT deviate)
1. **13 endpoints / 7 paths under `/api/planner/`** (document endpoints, NOT granular REST):
   `GET`+`PUT` for each of `household`, `assumptions`, `scenarios`, `features`, `ui`,
   `expense-history`; plus `DELETE /api/planner/all` (clearForCurrentUser) and `GET
   /api/planner/me`. All behind Better Auth middleware. **userId from the authenticated session
   (`c.get('userId')`), NEVER from the request body.**
2. **Envelope:** every response via `apiSuccess(c, data)` / `apiError(c, msg, status, code)`
   (copy-adapt the helper into `mvp/server/src/lib/api-utils.ts`). Request bodies validated with
   the **same Zod schemas** imported from `../../src/types/household.ts` + `assumptions.ts` (the
   `mvp/server/` tsconfig must allow importing from `mvp/src/types/` — these are pure type/Zod
   modules with no Vue/DOM deps; verify they import cleanly server-side, copy them if not).
3. **The household diff engine** (`mvp/server/src/lib/household-diff.ts`) is the highest-complexity
   piece — **TDD, RED FIRST.** Write `household-diff.spec.ts` BEFORE the implementation: given a
   current DB snapshot + an incoming `Household`, it returns a per-table plan (inserts/updates/
   deletes classified by `id`; `expense_snapshots` by `(userId, period)`; auto-flow rows by
   `(userId, sourceRefId)` → upsert). Fixtures = real shapes from the Zod schemas. Tests cover:
   add a member, remove a member (orphan cleanup), edit an investment's `subtypeData`, an
   auto-flow row that already exists (no dup), a `"Joint"` ownerId (no FK error), an empty→full
   household, a full→empty household. ONLY after the spec is red do you implement the engine.
4. **`PUT /api/planner/household`** runs the diff inside ONE Prisma `$transaction` — read current
   → diff → apply inserts/updates/deletes → return `{ updatedAt }`. Idempotent on identical input.
5. **Better Auth** copy-adapted from root `server/middleware/auth.ts`, pointed at `firekaro_v6`.
   **3-factor dev-bypass** (`NODE_ENV!=='production'` + `DEV_BYPASS_AUTH==='true'` +
   `x-dev-bypass` header), dev user **`dev@firekaro-v6.local`** (distinct from root's
   `dev@firekaro.local`). Per `rules/dev-bypass-auth.md`.
6. **Backend test stack:** vitest (match mvp). **Diff-engine tests are pure unit (NO DB) — these
   RUN in-session and are the core correctness proof.** The ServerAdapter write-behind/debounce
   logic is unit-tested with a **mocked `fetch`** (no network/DB). Endpoint **integration** tests
   are **authored but `describe.skip`'d** with `// pending firekaro_v6 provisioning (no local DB)`
   — they are Tier-2, un-skipped and run post-provisioning against the VPS (§0.3). Do NOT start a
   local DB to run them.
7. **No new heavy deps** beyond hono/prisma/better-auth/pino/zod (zod already in mvp). No ORM other
   than Prisma. No granular REST framework.

#### STAGE B acceptance (run the §3 gate sweep before committing)
- `cd mvp/server && npm run type-check` → 0 errors. **Diff-engine unit tests green (red-first —
  note the commit order in the report).** This is the load-bearing in-session proof — the diff
  engine's round-trip fidelity is verified at the PURE-FUNCTION level (given a current snapshot +
  an incoming `Household`, the plan it returns is correct; apply-the-plan is simulated in-memory),
  NOT against a DB. Cover: member add/remove (orphan cleanup), `subtypeData` edit, auto-flow
  no-dup, `"Joint"` ownerId, empty↔full.
- Endpoint integration tests **authored + `describe.skip`'d** (`// pending firekaro_v6
  provisioning`). They are NOT run in-session (no DB).
- **Rule 25 (persistence) — DEFERRED to Tier-2 (§0.3), documented NOT skipped:** the curl
  round-trip + direct-DB-read proof for each of the 6 entityKeys is scripted into
  `mvp/server/VERIFY-AFTER-PROVISION.md` to run against the live VPS `firekaro_v6` after
  provisioning. The in-session substitute is the **diff-engine unit test** (the same correctness
  property, verified without a DB). Commit msg: `rule 25 deferred to post-provision: no local DB`.
- **Rule 26 (round-trip fidelity) — in-session at the pure-function tier:** the diff engine's
  PUT→reconstruct deep-equal property is a unit test (no DB). The live-DB version is in
  VERIFY-AFTER-PROVISION.md (Tier-2).
- **Stage gate sweep:** static + diff-engine units → Rule 25 (deferred-scripted) → Rule 26
  (pure-function fidelity) → Rule 24 N/A. Green or DEFERRED-with-reason before commit.

---

### STAGE C — ServerAdapter + auth swap, stores UNCHANGED (role: Full-Stack)

**Create:** `mvp/src/lib/server-adapter.ts`. **Edit (minimal):** `mvp/src/lib/storage-adapter.ts`
(add `setAdapter`/`getAdapter` singleton), `mvp/src/lib/auth-provider.ts` (add
`ServerAuthProvider`), `mvp/src/main.ts` (boot sequence). **MUST keep UNCHANGED:**
`mvp/src/stores/{household,assumptions,scenarios,features,ui}.ts`, `mvp/src/lib/expense-history.ts`,
`mvp/src/router/index.ts`. (This is the non-negotiable outcome.)

#### Pre-made design decisions (do NOT deviate)
1. **`ServerAdapter implements StorageAdapter`** (`server-adapter.ts`) — write-behind cache:
   `get<T>(key)` reads an in-memory `Map` synchronously; `set<T>(key,value)` writes the Map
   synchronously THEN schedules a **per-key 1.5s debounce** flush (`PUT /api/planner/${key}`);
   `remove(key)` → immediate `DELETE`; `clearForCurrentUser()` → immediate `DELETE /api/planner/all`.
   Plus `async hydrateAll()` (NOT part of the interface) — 6 concurrent `GET`s, populate the cache.
2. **`storage-adapter.ts`:** add module-level singleton `setAdapter(a)`/`getAdapter()` mirroring
   `setAuthProvider()`/`getAuthProvider()`. `makeAdapter()` stays (v5 localStorage path untouched —
   the ~480 tests depend on it). The stores' module-level `makeAdapter(getAuthProvider())` keeps
   working; the boot sequence overrides the active adapter via `setAdapter()` for v6.
   **Interface signature UNCHANGED** — still sync `get/set/remove/clearForCurrentUser`.
3. **`auth-provider.ts`:** add `ServerAuthProvider implements AuthProvider` holding the
   session-resolved `userId`; `getCurrentUserId()` returns it synchronously. Existing
   `LocalAuthProvider` untouched.
4. **`main.ts` boot sequence (the ONLY async seam):** resolve Better Auth session (`GET
   /api/planner/me`) → construct `ServerAuthProvider` → construct `ServerAdapter` →
   **`await serverAdapter.hydrateAll()`** → `setAdapter(serverAdapter)` + `setAuthProvider(...)` →
   THEN `createApp(...).mount('#app')`. So by the time any store `hydrate()` or router guard runs,
   the cache is warm and every `adapter.get()` is a synchronous cache read.
5. **Feature-flag the backend** so local dev without the server still works: if `hydrateAll()`
   fails (server unreachable) OR an env flag (`VITE_USE_SERVER_ADAPTER`) is off, fall back to
   `LocalStorageAdapter` (the v5 path) and log it. The demo on GitHub Pages stays localStorage.
6. **`navigator.sendBeacon` flush-on-unload** is **DEFERRED to Phase 2** (note it in the DEFERRED
   file). Phase 1 accepts the <1.5s tab-close loss window (rare; honest call-out).
7. **MUST NOT** make `get`/`set` async, MUST NOT touch the 6 stores or router guards, MUST NOT
   convert `hydrate()`/`persist()` signatures. If the 480 tests force such a change, the design is
   wrong — STOP and re-read.

#### STAGE C acceptance (run the §3 gate sweep before committing)
- `cd mvp && npm run type-check` (banner `firekaro-mvp`) → 0 errors. `npm run test:unit` →
  **~480 tests stay green** (no regression; the localStorage path + interface are unchanged).
- `git diff --stat` confirms `stores/*.ts`, `expense-history.ts`, `router/index.ts` are
  **UNTOUCHED** (the non-negotiable outcome — assert this explicitly in the report).
- **ServerAdapter unit tests (in-session, NO DB):** the write-behind cache (sync `get`/`set`
  against the in-memory Map), the per-key 1.5s **debounce coalescing** (fake timers — N rapid
  `set()`s → ONE flush), and the `hydrateAll()` cache-fill — all unit-tested with a **mocked
  `fetch`**. The localStorage-fallback path (server unreachable / flag off) is unit-tested too.
- **Rule 25 (end-to-end round-trip) — DEFERRED to Tier-2 (§0.3):** the live "UI edit → >1.5s →
  curl GET confirms Postgres → reload survives" proof requires a running backend+DB, so it is
  scripted into `mvp/server/VERIFY-AFTER-PROVISION.md` to run post-provisioning with
  `VITE_USE_SERVER_ADAPTER=on` against the VPS. The in-session substitute = the ServerAdapter unit
  tests (mocked fetch) proving the debounce + cache + flush logic. Commit msg: `rule 25 deferred to
  post-provision: no local DB`.
- **Rule 24 (the minimal UI surface):** if the auth/login UI changed, screenshot + ARIA + console
  at `:5175`. If no UI changed (adapter swap is invisible), commit msg notes `rule 24 skipped: no
  UI change`.
- **Stage gate sweep:** static (480 green) → **stores-unchanged `git diff --stat` assertion** →
  ServerAdapter unit tests (debounce/cache/fallback, mocked fetch) → Rule 25 (deferred-scripted) →
  Rule 24 (auth surface or skip-noted). Green or DEFERRED-with-reason before commit.

---

## 3. Verification gates (standing rules — adapted to this backend build)

> **All 26 rules in `.claude/rules/claude-behavior.md` are operative.** **Rules 24, 25, 26 are
> MANDATORY at every task AND every stage boundary.** This is a largely-backend build, so the
> gating mechanics differ from a UI build — but the mandate is identical: prove it works, don't
> claim it works.

**Static gates (per stage, correct CWD) — NO DB (§0.3):**
- Backend (`cd mvp/server`): `npm run type-check` + diff-engine unit tests + ServerAdapter unit
  tests (mocked fetch) + `npx prisma validate` + migration-SQL generation. **Endpoint integration
  tests are `describe.skip`'d (Tier-2).** No `migrate status` (needs a DB).
- Frontend (`cd mvp`): `npm run type-check` (banner `firekaro-mvp`) + `npm run test:unit` (~480
  green, no regression) + `npm run build`.

### Rule 24 — UI screenshot verification (CONDITIONAL — fires only on UI change)
Mostly N/A in Phase 1 (backend). Fires only where UI changes (the auth/login surface in STAGE C, if
any). When it fires: Playwright MCP at `:5175` → screenshot + `browser_snapshot` (ARIA) +
`browser_console_messages`; all three pass. Where no UI changed, commit msg: `rule 24 skipped: no
UI change`. Self-heal the dev server once if down (capture PID for cleanup). ≤3 attempts → `/fix-loop`.

### Rule 25 — persistence verification (PRIMARY gate — SPLIT: in-session proxy + Tier-2 live)
Persistence target is **Postgres `firekaro_v6`** — but **no DB is available in-session (§0.3)**, so
Rule 25 splits:
- **In-session proof (the diff engine's correctness):** the pure-function diff-engine unit tests
  (no DB) verify that a given `Household` maps to the correct per-table insert/update/delete plan +
  reconstructs deep-equal — the same property the live round-trip would prove. This is the
  honest, runnable substitute.
- **Tier-2 live proof (DEFERRED, scripted, NOT skipped):** the `curl -H "x-dev-bypass: true" GET
  /api/planner/<key>` round-trip + direct Prisma/SQL child-table read, per entityKey, scripted in
  `mvp/server/VERIFY-AFTER-PROVISION.md`, run against the VPS `firekaro_v6` after provisioning.
- Commit msgs note `rule 25 deferred to post-provision: no local DB`. The report MUST say live
  persistence is **not yet proven** — never claim the backend round-trips real data in-session.

### Rule 26 — round-trip fidelity + cross-page (ALWAYS fires — in-session at the pure-function tier)
In-session: the diff engine's **PUT→reconstruct deep-equal** + **member-removal orphan-cleanup**
are unit tests (no DB). The live-DB version + the STAGE C cross-page check (a persisted edit
propagates to `useFireDerive()` aggregates on reload) are scripted into VERIFY-AFTER-PROVISION.md
(Tier-2). 3 reconcile cycles on any in-session failure → `/systematic-debugging` → if unresolved,
DEFERRED with `Rule 26 drift`.

### Rule 15 — failures → skills · Rule 17 — root cause · Rule 20 — no fabrication · Rule 23 — finish the DoD
Per `claude-behavior.md`. Test fails → `/fix-loop` (known retest) or `/systematic-debugging`
(unclear/2+ fails). No band-aids. No synthetic data — if the diff engine can't round-trip a real
Zod shape, fix the engine, don't fake the test. Keep going through the full DoD; context-budget
anxiety is NOT a stop (`feedback_dont_defer_on_context_judgment.md`).

### Failure-recovery budgets
- **Per-task fix budget:** ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → DEFER
  the task + continue; do NOT halt the whole run.
- **No local DB (by constraint, §0.3):** there is NO database in-session and the run MUST NOT try
  to start one. All DB-backed verification is Tier-2 (post-provisioning) by design — not a failure
  path. The diff-engine + ServerAdapter unit tests (no DB) are the in-session proof; the live gates
  are scripted into VERIFY-AFTER-PROVISION.md. If any step *attempts* a DB connection and fails,
  that is a contract violation in that step — fix the step to not need a DB, do NOT spin one up.
- **MCP browser hang recovery (STAGE C only):** 3 cycles — wait 10s+retry → `browser_close`+renav →
  kill+restart the captured dev-server PID. All 3 fail → DEFERRED + continue.
- **Hard halt conditions ONLY:** `npm install` failure in `mvp/server/`; a decision contradiction
  inside this contract; an irrecoverable build break after the full fix budget; an OS permission
  denial. **VPS provisioning is NOT a halt** — it is a runbook hand-off by design (STAGE A.7).
  Context-budget anxiety is NOT a halt — hand off via a one-line continuation note.

---

## 4. Commit + push

Conventional commits, prefix **`feat(mvp-v6): …`** (new v6 scope — the design SSOT uses it), on
`master`. **Stage only named files — NEVER `git add -A`** (the working tree has unrelated untracked
items: `t0b-preferences.png`, `docs/goals/2026-05-29-…`, modified `.claude/rules/claude-behavior.md`
— leave them alone). Suggested commit boundaries (one per stage, more if a stage is large):

1. `feat(mvp-v6): STAGE A — firekaro_v6 Prisma schema (21 tables from Zod) + VPS runbook`
2. `test(mvp-v6): STAGE B — household diff engine (red-first) + spec` *(TDD: the red spec commits
   before the engine, per Rule 17/tdd.md — the report must show this ordering)*
3. `feat(mvp-v6): STAGE B — Hono /api/planner document endpoints + Better Auth + dev-bypass`
4. `feat(mvp-v6): STAGE C — write-behind ServerAdapter + ServerAuthProvider + boot swap`

Co-author trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
**Do NOT push** unless the DoD is fully green — leave the push to Abhay (shared-state action).
Do NOT commit the VPS runbook's secrets (the runbook uses placeholder passwords).

---

## 5. Definition of Done (all MUST be true)

> **NOTE (§0.3): NO local DB.** All DoD items below that imply a live database are **Tier-2,
> verified post-provisioning** via `mvp/server/VERIFY-AFTER-PROVISION.md`, NOT in-session. The
> in-session DoD is: schema valid + migration SQL generated + diff-engine/ServerAdapter unit tests
> green + ~480 frontend tests green + the two hand-off docs emitted.

**STAGE A — schema (in-session):**
- [ ] `mvp/server/` scaffolded (own package.json/tsconfig); Prisma schema = the design's table
      inventory, derived from the Zod schemas; every table has `userId` + `updatedAt`; JSONB
      variants + `@@unique` constraints + `ownerId`-as-TEXT (no FK) present.
- [ ] `npx prisma validate` passes; migration SQL **generated** (`migrate dev --create-only`/`diff
      --script`) + reviewed (CREATE TABLEs, JSONB, uniques, no ownerId FK). **NOT applied (no DB).**
- [ ] `mvp/server/DEPLOY-VPS-firekaro_v6.md` runbook + `mvp/server/VERIFY-AFTER-PROVISION.md`
      (Tier-2 gate script) both emitted.

**STAGE B — backend (in-session):**
- [ ] 13 `/api/planner/*` endpoints implemented; envelope `apiSuccess`/`apiError`; userId from
      session only; Better Auth + 3-factor dev-bypass (`dev@firekaro-v6.local`).
- [ ] Diff engine **TDD red-first** (commit order proves it); unit tests green (member add/remove,
      subtypeData edit, auto-flow no-dup, `"Joint"` ownerId, empty↔full) — **the in-session
      persistence-correctness proof (no DB).**
- [ ] Endpoint integration tests **authored + `describe.skip`'d** (`// pending firekaro_v6`).
- [ ] **Rule 25** (live curl round-trip + child-table read, per entityKey) → scripted in
      VERIFY-AFTER-PROVISION.md (**Tier-2, deferred**).
- [ ] **Rule 26** round-trip fidelity (PUT→reconstruct deep-equal; orphan cleanup) → diff-engine
      unit test in-session; live version Tier-2.

**STAGE C — adapter swap (in-session):**
- [ ] `ServerAdapter` (write-behind + 1.5s per-key debounce + `hydrateAll`); `ServerAuthProvider`;
      `setAdapter`/`getAdapter` singleton; `main.ts` awaits `hydrateAll` before mount; feature-flag
      fallback to localStorage.
- [ ] **Interface stays SYNCHRONOUS; the 6 stores + `expense-history.ts` + `router/index.ts` are
      UNCHANGED** (`git diff --stat` proves it — assert in report).
- [ ] `cd mvp && npm run type-check && npm run test:unit` → **~480 green, no regression**;
      `npm run build` succeeds.
- [ ] ServerAdapter unit tests green (debounce coalesces N edits→1 flush via fake timers; cache;
      localStorage fallback) — **mocked fetch, no DB.**
- [ ] **Rule 25** e2e (UI edit → >1.5s → curl GET → reload survives) → VERIFY-AFTER-PROVISION.md
      (**Tier-2, deferred**).
- [ ] **Rule 24** auth surface screenshot OR `rule 24 skipped: no UI change` noted.

**Ship:**
- [ ] Commits pushed-ready on `master` with `feat(mvp-v6):` prefix (NOT pushed — Abhay pushes).
- [ ] Deferrals logged in `docs/goals/.run/v6-phase1-backend-foundation-DEFERRED.md`: **the Tier-2
      live-DB verification (Rule 25/26 round-trip, migrate deploy, endpoint integration)**,
      sendBeacon flush-on-unload → P2, VPS provisioning → runbook hand-off — each with rule status.
- [ ] Final report (§6) produced, explicitly stating live persistence is NOT yet proven (no DB).

---

## 6. Final report (required on completion)

Produce a closing report: per-stage gate results + commit SHAs; the PREFLIGHT "skipped (already
covered)" list; the schema table count + how it maps to the Zod model; diff-engine red-first proof
(spec SHA before impl SHA); the **in-session Rule 25/26 proxy** (diff-engine + ServerAdapter unit
tests, no DB) verdict; the **stores-unchanged `git diff --stat` proof**; the ~480-test green tally.
Then a prominent **"NOT YET PROVEN (Tier-2, pending provisioning)"** section listing exactly what
awaits a live DB: `migrate deploy`, endpoint integration, the Rule 25 curl round-trip + child-table
reads, the Rule 26 live fidelity + cross-page check — and pointing at
`mvp/server/VERIFY-AFTER-PROVISION.md`. Plus the two hand-off docs' paths and an explicit "**VPS
provisioning is a hand-off — Abhay must run `mvp/server/DEPLOY-VPS-firekaro_v6.md` on
`103.118.16.189`, THEN run VERIFY-AFTER-PROVISION.md, to make this live + prove persistence**". DoD
green/amber/red tally; DEFERRED entries with rule status. **Honesty (Rule 20): state plainly the
backend's data round-trip is NOT proven in-session — only schema, migration SQL, diff-engine, and
frontend tests are. No local DB existed.**

---

## 7. Guardrails (hard stops)

- **Scope = `mvp/` + the NEW `mvp/server/` + the `firekaro_v6` DB.** NEVER touch root `src/` or
  `server/`, `demo/`, the old `D:\Abhay\VibeCoding\FIREKaro` app, `prisma/` (root), `e2e/` (root),
  or `D:\Abhay\VibeCoding\5Wealths\`. The root `server/` is a **read-only salvage reference** — copy
  patterns, never import across trees or edit it.
- **The interface stays synchronous; the 6 stores + router guards stay UNCHANGED.** This is the
  contract's spine — a diff touching those files is a design violation, not progress.
- **No old-app data migration** — Phase 4, out of scope. Phase 1 = fresh logged-in user only.
- **No new heavy deps** beyond hono/prisma/better-auth/pino (zod already present).
- **Honesty (Rule 20):** there is **NO DB in-session (§0.3)** — the run MUST NOT claim the backend
  round-trips real data. In-session proves schema + migration SQL + diff-engine/ServerAdapter unit
  logic (no DB) + frontend tests ONLY. Live persistence (Rule 25/26 round-trip) is Tier-2, pending
  the VPS provisioning + VERIFY-AFTER-PROVISION.md. No synthetic round-trip data; no DB spin-up.
- **VPS provisioning is a runbook hand-off, not a fake-completed step** — the run does NOT have VPS
  credentials and must not pretend `firekaro_v6` is live. Emit the runbook; say it's pending Abhay.
- **Strategic / portfolio items are `TODO(5W):` notes** — the "retire firekaro.com, migrate data"
  commitment is 5W-tier (recorded by Abhay under `FW-FireKaro\DECISIONS.md`), not handled here.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Slicing | ONE contract, 3 sequential internal stages (A provision+schema → B backend → C adapter) |
| 2 | Backend dir | `mvp/server/` (self-contained v6 product in the mvp tree) — the one authorized boundary exception |
| 3 | DB | New `firekaro_v6` on the same VPS; old `firekaro` DB untouched (Phase-4 migration source) |
| 4 | Schema source | Derived 1:1 from the existing Zod schemas (`household.ts` + `assumptions.ts`) |
| 5 | Variant/nesting | table-per-entity + JSONB for variants; aggregated arrays → child tables; ownerId TEXT no-FK |
| 6 | API | 13 document endpoints under `/api/planner/`; server-side diff in one txn; NOT granular REST |
| 7 | Adapter | Write-behind cache; interface STAYS SYNC; one async seam (`hydrateAll` at boot) |
| 8 | Stores | UNCHANGED (non-negotiable) — warm-cache pre-fill keeps `get()` synchronous |
| 9 | Auth | `ServerAuthProvider` + Better Auth; dev user `dev@firekaro-v6.local` |
| 10 | VPS provisioning | Runbook hand-off (no unattended SSH) |
| 10b | Verification env | **NO local DB (§0.3).** In-session = static schema + generated migration SQL + diff-engine/ServerAdapter UNIT tests (no DB) + 480 frontend tests. Live-DB Rule 25/26 round-trip = Tier-2, scripted in VERIFY-AFTER-PROVISION.md, run post-provisioning against the VPS |
| 11 | Diff engine | TDD red-first — spec before impl |
| 12 | Migration | OUT OF SCOPE (Phase 4) |
| 13 | sendBeacon flush-on-unload | DEFERRED to Phase 2 |

---

## References (loaded transitively)

- `docs/v6-fire-planner-product-plan.md` — the design SSOT (Phase 1 = every locked decision here)
- `mvp/src/types/household.ts` + `assumptions.ts` — the Zod model the schema derives from
- `mvp/src/lib/storage-adapter.ts` + `auth-provider.ts` — the seams + the singleton pattern to mirror
- `mvp/src/stores/*.ts` + `router/index.ts` — the MUST-NOT-CHANGE files
- `mvp/src/lib/expense-history.ts` — the separate `expense-history` entityKey
- `server/` (root) — read-only salvage reference (Hono, api-utils, auth middleware, logger, env-validate)
- (NO local DB — §0.3 — schema is verified statically; live verification is Tier-2 post-provisioning)
- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26
- `.claude/rules/dev-bypass-auth.md` — the 3-factor dev-bypass gate
- `.claude/rules/api-envelope-pattern.md` + `api-response-unwrapping.md` — the envelope contract
- `.claude/rules/prisma-conventions.md` + `hono-route-conventions.md` — backend conventions
- `.claude/rules/tdd.md` — red-green-refactor (the diff engine)
- `.claude/rules/engineering-roles.md` — DBA (STAGE A provisioning) + Full-Stack (B/C) role dispatch
- Skills the run may invoke: `/fix-loop`, `/systematic-debugging`, `/db-migrate`, `/db-migrate-verify`, `/prisma-orm`, `/auto-verify`

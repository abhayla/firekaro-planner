# GOAL — First-party product analytics instrumentation (activation funnel + retention cohorts), v1

**Type:** Autonomous **build** contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below — do not pause to ask; make the call the contract
specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-09 · **Scope:** `src/` + `server/` (this repo) ONLY
**Invocation:** `/goal docs/goals/2026-06-09-analytics-instrumentation-phase1.md`
**Closes:** GitHub issue #44

> **⚠ ONE DECISION FOR ABHAY TO CONFIRM AT CONTRACT-REVIEW (then it's locked, the run never asks):**
> **DPDP consent posture for product analytics.** This contract's locked default is: capture
> **pseudonymized, PII-free, first-party** product events for **service improvement** under DPDP
> **legitimate-use / service-provision** processing — with strict data-minimization (no financial
> values, no PAN/email/name) + a retention purge — and **NO separate user-facing consent toggle in
> v1** (a consent/notice surface is explicitly OUT of v1 scope, deferred to a later phase / the
> privacy-policy update). A mandatory **DPDP schema review (Stage A gate)** confirms zero PII before
> merge. If you want a consent gate IN v1 instead, say so before running — it changes Stage B. Absent
> a change, the run proceeds on this default.

---

## 0. Mission

Build the **measurement backbone** that makes the urban-salaried accumulator's **activation and
retention measurable** — today they are not instrumented at all, so we cannot see where users drop
off or whether they come back. This is a **fresh build**: a first-party `AnalyticsEvent` store
(Supabase via Prisma), a thin authenticated capture endpoint, a frontend capture composable that
instruments six funnel/engagement events, pure aggregation functions (activation funnel + retention
cohorts), and a token-guarded internal read endpoint to query them. **The one non-negotiable
outcome:** events are captured **first-party only (no external SaaS), PII-free (no financial values,
no PAN/salary/name/email)**, owned by `userId` (multi-tenant), and queryable into a drop-off funnel +
weekly retention cohort. This is the **measurement layer ONLY (#44)** — the nudge **delivery** channel
(#45) is separate and out of scope; design the schema so #45 can later consume it. **Do NOT deploy**
(prod is Abhay's gate) — build + merge to `main`, ready for the next deploy.

---

## 0.1 Worktree isolation (FIRST action — before anything)

> **First action of the run, before §0.2 and any stage. Non-negotiable.** Run in a **dedicated git
> worktree**, never the user's primary interactive checkout.
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the user's primary checkout
>    (`…/firekaro-planner`) rather than an already-dedicated `…/firekaro-goal-*` worktree, create and
>    switch to one before any stage: `git worktree add ../firekaro-goal-analytics-v1 -b feat/analytics-instrumentation-v1`
>    and run every stage from there. NEVER run a multi-commit build in the primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` (e.g. `feat-analytics-v1-<nonce>`) and write the
>    lock: `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
>    The `.githooks/pre-commit` hook hard-blocks any commit whose token ≠ this lock.
> 3. **Release on exit:** the run's FINAL action (after merge/push, OR on any halt/defer) removes the
>    lock: `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`. It is gitignored. If
>    `git worktree` is unavailable, note it and proceed — but still never the primary checkout.
> 4. **Self-cleanup ON SUCCESS ONLY:** after the branch is merged `--no-ff` → `main` AND pushed AND
>    the lock released, the last shell step `cd`s to the primary root and runs:
>    `cd <primary-root> && git worktree remove --force ../firekaro-goal-analytics-v1 ; git branch -D feat/analytics-instrumentation-v1 ; git worktree prune`.
>    On Windows `git worktree remove` may print `Invalid argument` while still de-registering — fine;
>    `git worktree prune` finalises. **DEFER/HALT keeps the worktree + branch** (only the lock is released).

---

## 0.2 PREFLIGHT — idempotency (greenfield, but check for parallel work)

> **First numbered action, before any stage. Non-negotiable.** #44 is greenfield (verified
> 2026-06-09: no `*analytic*`/`*event*` lib or route exists), but a parallel session may have started.
>
> 1. **Grep + `git log --oneline -20`** for any analytics work already landed: `AnalyticsEvent`,
>    `useAnalytics`, `analytics-repo`, `analytics-funnel`, `/api/analytics`, `/api/internal/analytics`.
> 2. **For each Stage below, check the code + git log before building.** If a piece already exists
>    (grep/read to confirm — don't trust a stale assumption), **SKIP the build, verify-only**, and move
>    on. Build only the missing delta. If absent, build normally.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> **Maintain an append-only progress log for the whole run. Update it BEFORE moving on from each
> stage/event — it survives a crash/context-out where in-context memory does not.**
>
> 1. **Location:** `docs/goals/.run/analytics-instrumentation-phase1-PROGRESS.md` (in THIS worktree;
>    `.run/` is gitignored). Read cross-session via `git worktree list` → each worktree's `.run/*-PROGRESS.md`.
> 2. **First line:** slug · branch · worktree · start time (`date "+%Y-%m-%d %H:%M"`) · contract path · mission.
> 3. **Append ≤2-line entries at:** each stage start; stage done (+ gate result); every major DEFECT;
>    every "not working" EVENT + what you did; each independent-review outcome (concur/dissent); each
>    DEFER/skip; each blocker/halt; the final result.
> 4. **Format:** `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2-line summary>`.
> 5. **At run-end:** auto-append each notable error→fix→lesson (with a gate-gap line, after a dedup
>    grep) to `.claude/tasks/lessons.md`; write a **"LEARNINGS TO FOLD BACK"** section in the committed
>    final report (PROPOSE only — governance edits need approval; route GENERIC → skill/process-rule,
>    PRODUCT-SPECIFIC → product rule if a class else this contract; prefer a gate over prose; one home, dedup).
> 6. **Run-end SUMMARY** in the final PROGRESS entry AND the committed report: **DONE / PENDING
>    (=DEFERRED + reason) / BLOCKED (Abhay-gated + why) / NEXT (single next action + gate owner).**

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| Prisma schema + conventions | `server/prisma/schema.prisma`; `.claude/rules/prisma-conventions.md` | `id @default(cuid())`, `createdAt/updatedAt`, `userId` + cascade + `@@index([userId])`, `Float` money (n/a here), enum casing. Model the new `AnalyticsEvent` 1:1 with these. |
| Repo layer pattern | `server/src/lib/household-repo.ts` | The Prisma read/write layer style the new `analytics-repo.ts` mirrors. |
| Retention-purge precedent | `server/src/lib/send-log-retention.ts` + its spec | The exact pattern for the analytics retention purge folded into the daily lifecycle run. |
| Token-guarded internal route | `server/src/routes/smoke-internal.ts` (`SMOKE_TOKEN`) + `lifecycle-internal.ts` (`LIFECYCLE_RUN_TOKEN`) | The pattern for the new `ANALYTICS_TOKEN`-guarded internal read endpoint (constant-time compare, fail-closed if unset, mounted OUTSIDE `authMiddleware`). |
| API envelope | `server/src/lib/api-utils.ts`; `.claude/rules/api-envelope-pattern.md` | `apiSuccess`/`apiError` only — no raw `c.json()`. |
| Route conventions | `.claude/rules/hono-route-conventions.md` | `new Hono()` + `authMiddleware` for the capture route; Zod inline; `userId` from session NEVER body. |
| Auth gate + dev-bypass | `server/src/middleware/auth.ts`; `.claude/rules/dev-bypass-auth.md` | Capture endpoint is session-authed; Rule-25/26 checks use `x-dev-bypass: true`. |
| Structured logging + redaction | `server/src/lib/logger.ts`; `.claude/rules/structured-logging.md` | pino only; NEVER log event payloads that could carry context fields verbatim — log shapes/counts. |
| Storage/adapter seam + server-mode boot | `src/lib/storage-adapter.ts`, `src/lib/server-adapter.ts`, `src/lib/runtime-mode.ts` (`isServerMode()`), `src/main.ts` | The capture composable must be a **no-op in demo/localStorage mode** (no backend) and only POST when `isServerMode()` is true. |
| Onboarding / wizard flow | `src/router/index.ts` (onboarding `beforeEach` guard), the wizard/splash pages, `src/stores/*` onboarding flags | Where to fire `onboarding_started` / `onboarding_completed`. |
| Dashboard + derive | `src/pages/fire-goals/Dashboard.vue`, `src/lib/useFireDerive.ts`, `src/lib/derive.ts` | Where to fire `first_fire_number_seen` (dashboard reached with a non-empty household). |
| Household persist (engagement) | `src/stores/household.ts` (`watch(data, persist, {deep})`) | Where to fire `plan_updated` (the core engagement signal; ties to `lifecycle-digest.ts`). |
| Lifecycle digest (the "since you were away" delta) | `src/lib/lifecycle-digest.ts` | The retention concept `plan_updated` feeds; design event so #45/digest can consume it. |
| Daily internal cron | `docs/DEPLOY.md` §5a (the lifecycle `/api/internal/lifecycle/run` cron) | The retention purge folds into this existing daily run — NO new cron. |
| Comms send-log spec style | `server/src/lib/comms-repo.ts` + `*.spec.ts` (DB-gated) | The colocated no-DB unit + `DATABASE_URL`-gated integration test pattern for `analytics-repo`. |

**Gotchas:**
- **Persistence mode = ServerAdapter.** Analytics needs the backend. Capture is a no-op in the demo
  localStorage mode. Run the frontend instrumentation verification with `.env.local`:
  `VITE_USE_SERVER_ADAPTER=on`, `VITE_API_BASE_URL=http://localhost:3100`, `VITE_DEV_BYPASS=true`
  (created BEFORE starting Vite — Vite reads env only at boot). Start `server/` then root.
- **Two trees:** run static gates in BOTH (root `npm run type-check && npm run test:unit`;
  `cd server && npm run type-check && npm run lint && npm run test:unit`).
- **Standalone Prisma scripts** hitting Supabase while the dev server holds connections MUST append
  `?connection_limit=1` (pooler caps at 15 → `EMAXCONNSESSION`).
- **`server/eslint.config.mjs`** blocks raw `c.json()` and `console.*` in `server/src/**` — use
  `apiSuccess`/`apiError` + the pino logger.
- **Capture must NEVER block a user action** — fire-and-forget with `.catch()` swallow on the client
  (analytics failure must not break the app); see `.claude/rules/non-blocking-side-effects.md`.

---

## 2. STAGE A — schema + capture endpoint + retention (server)

**File(s):** `server/prisma/schema.prisma` (edit — add model), a new migration (`prisma migrate dev
--create-only` then deploy), `server/src/lib/analytics-repo.ts` (create), `server/src/lib/analytics-events.ts`
(create — the allowed-event-name SSOT), `server/src/routes/analytics.ts` (create — capture route),
`server/src/lib/analytics-retention.ts` (create — purge), and wire the purge into the existing daily
lifecycle run (`server/src/lib/lifecycle-runner.ts` or the internal route that drives it — mirror how
the send-log purge is folded in). Register the route in `server/src/index.ts`. **Keep untouched:** all
existing routes/models except the index registration + the lifecycle-run purge fold-in.

### Pre-made design decisions (do NOT deviate)
1. **Model `AnalyticsEvent`** (PII-free, append-only event log):
   ```prisma
   model AnalyticsEvent {
     id          String   @id @default(cuid())
     userId      String
     user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
     eventName   String   // constrained to the allowed set (validated at the route, see analytics-events.ts)
     funnelStage String?  // for funnel events; null for non-funnel
     context     Json?    // MINIMAL non-PII only (e.g. {"onboardingStep":3}); NEVER financial values / PAN / name / email
     sessionId   String?  // pseudonymous per-session correlation (optional, client-generated UUID; not a login id)
     createdAt   DateTime @default(now())
     @@index([userId])
     @@index([eventName, createdAt])
     @@index([createdAt])
   }
   ```
   Add the back-relation `analyticsEvents AnalyticsEvent[]` on `User`. **No financial fields. No PII.**
2. **Allowed event set (SSOT in `analytics-events.ts`)** — a `const`/Zod enum of exactly these six v1 events:
   `onboarding_started`, `onboarding_completed`, `first_fire_number_seen`, `return_visit`,
   `plan_updated`, and `signup` (signup = first authenticated session for a new user — fired server-side
   or on first session, see Stage B). The route REJECTS any `eventName` outside this set (Zod enum → 400).
   Append-only: dedup is a QUERY-time concern (Stage C), NOT a write constraint — keep the raw log honest.
3. **Capture route** `POST /api/analytics/events` (`server/src/routes/analytics.ts`):
   `new Hono()` + `authMiddleware`. `userId` from `c.get('userId')` — **NEVER from the body** (the body
   carries only `eventName`, optional `funnelStage`, optional `context`, optional `sessionId`).
   Zod-validate; `apiSuccess(c, {id}, 201)` on write; `apiError` with `ErrorCode.VALIDATION_ERROR` on a
   bad event name. The `context` object is SIZE-CAPPED (reject > ~1KB) and the route does a defensive
   shallow check that no obvious PII keys (`pan`, `email`, `name`, `salary`, `amount`, `phone`) are
   present → 400 if so (belt-and-suspenders against a mis-instrumented client).
4. **`analytics-repo.ts`** — `recordEvent({userId, eventName, funnelStage?, context?, sessionId?})` →
   single Prisma create; plus the read helpers Stage C needs (`getEventsForFunnel`, `getEventsForCohorts`
   — scoped queries returning the minimal columns). Mirror `household-repo.ts` style.
5. **Retention purge `analytics-retention.ts`** — `purgeOldAnalyticsEvents(olderThanDays = 365)`: DELETEs
   `AnalyticsEvent` rows older than 365 days (PII-free aggregate data → 365d is fine for cohort analysis;
   data-minimization still applies). Idempotent. **Folded into the existing daily lifecycle run** (no new
   cron) exactly like `send-log-retention.ts`; report the purged count in the lifecycle run's result.
6. **Logging:** structured pino only; log `{userId, eventName}` + counts — NEVER the `context` payload verbatim.

### Stage A acceptance (run the §5 gate sweep before committing)
- TDD red-first: `analytics-repo.spec.ts` (no-DB unit for the validation/shape + a `DATABASE_URL`-gated
  integration that creates + reads an event), `analytics-retention.spec.ts` (purge cut-off math),
  route behavioral test for `POST /api/analytics/events` (201 + envelope; 400 on bad event name; 400 on
  a PII key in context; **auth-gate: 401 without a session**; **ownership/IDOR: a body-supplied `userId`
  is IGNORED — the row is owned by the session user**) — RED before implementation, GREEN after.
- `server` static gates green (type-check + lint + test:unit incl. the DB-gated integration when
  `DATABASE_URL` is set). Migration authored + applied to Supabase (PITR backup first — it is
  schema-changing; confirm the table post-apply with a read).
- **API behavioral test** asserted (status · envelope · auth-gate · IDOR) — non-skippable for this server change.
- **DPDP schema review (the privacy gate):** dispatch a review (privacy lens) of the `AnalyticsEvent`
  schema + the route's PII-key guard confirming ZERO PII / financial values can land. Block the stage
  commit on any finding.

---

## 3. STAGE B — frontend capture composable + instrument the six events

**File(s):** `src/composables/useAnalytics.ts` (create), plus minimal instrumentation edits at the six
hook sites (router guard, onboarding store/pages, dashboard, household store). **Keep untouched:** the
storage-adapter/auth seams, `derive.ts`, the stores' core logic (add a single `track(...)` call at each
hook, nothing more).

### Pre-made design decisions (do NOT deviate)
1. **`useAnalytics()` exposes `track(eventName, opts?)`** — fire-and-forget POST to
   `${API_BASE}/api/analytics/events` with `credentials: 'include'` (+ the dev-bypass header in dev).
   **No-op when `!isServerMode()`** (demo/localStorage mode has no backend). Wrapped in
   `try/catch`/`.catch(()=>{})` so an analytics failure NEVER breaks a user action
   (`non-blocking-side-effects.md`). NEVER passes any financial value / PII in `context`.
2. **`sessionId`** — a client-generated pseudonymous UUID stored in `sessionStorage` (not localStorage,
   not the userId) for per-session correlation. PII-free.
3. **Instrument exactly the six events at these hooks (one `track()` call each):**
   - `signup` — on first authenticated session of a brand-new user. Simplest correct hook: the
     ServerAuthProvider/`main.ts` session-resolve path when the resolved user is new (or fire from the
     onboarding entry if "new user" is only knowable there) — pick the hook that fires once per new user;
     document the choice in the progress log.
   - `onboarding_started` — when the wizard/splash onboarding begins (the onboarding guard's empty→splash
     or wizard entry).
   - `onboarding_completed` — when onboarding is marked complete (the flag the router guard reads for
     completed→dashboard).
   - `first_fire_number_seen` — on Dashboard mount when the household is NON-EMPTY (a real FIRE number is
     shown), with `funnelStage: 'activated'`.
   - `return_visit` — on app boot when the user's session day > their first-seen day (a day-2+ visit). A
     coarse last-seen day in `localStorage`/server is acceptable; PII-free.
   - `plan_updated` — on a real household mutation (debounced, from the household store's persist watch),
     `funnelStage: 'engaged'`. Debounce so a burst of edits = one event.
4. **No user-facing UI** in this stage (no consent toggle in v1 — see the contract-top DPDP note). The
   only visible change is none; instrumentation is silent.

### Stage B acceptance
- Static gates green (root type-check + test:unit). A unit test for `useAnalytics` (no-op in demo mode;
  POSTs the right body in server mode — mock fetch) RED-first then GREEN.
- **Rule 24 + 32 (light):** with ServerAdapter on, drive the affected screens (splash/wizard → dashboard)
  and confirm they still render + function normally AND a `plan_updated` / `first_fire_number_seen` POST
  fires (observe `browser_network_requests`) with NO new console error. Analytics must be invisible to UX.
- **Rule 25:** after triggering an event via the UI, `curl -H "x-dev-bypass: true"
  http://localhost:3100/api/internal/analytics/...` (Stage D) OR a direct DB/API read confirms the event
  row persisted with the expected `eventName`/`funnelStage` and **no PII in `context`**.

---

## 4. STAGE C — pure aggregation: activation funnel + retention cohorts

**File(s):** `src/lib/analytics-funnel.ts` (create), `src/lib/analytics-cohort.ts` (create), colocated
`*.spec.ts` for each. Pure functions only (no store/DOM/IO) per `.claude/rules/calculation-modules.md`.

### Pre-made design decisions (do NOT deviate)
1. **`computeActivationFunnel(events)`** — ordered stages
   `signup → onboarding_completed → first_fire_number_seen → return_visit`; for each stage return the
   count of DISTINCT users who reached it (dedup at query time — first occurrence per user) + the
   per-step conversion % and drop-off %. Guard division-by-zero (`signup === 0 → 0%`).
2. **`computeRetentionCohorts(events)`** — group users by **signup week** (Mon-anchored ISO week); for
   each cohort, the count of users with a `return_visit` (and, as the engagement signal, with a
   `plan_updated`) in week-0, week-1, … Return a cohort × week-offset grid of counts + %. Pure; deterministic
   (the function takes the events + a "now"/reference date as an INJECTED param — never `Date.now()` —
   so specs are repeatable, mirroring `getCurrentFinancialYear(now)`).
3. **Both functions are pure input→output** — they take an `AnalyticsEvent[]`-shaped array (define a
   minimal local input type) and return plain result objects. They do NOT query the DB (the server read
   endpoint in Stage D fetches rows via `analytics-repo` then calls these).

### Stage C acceptance
- TDD red-first: specs with hand-built event fixtures asserting funnel counts/drop-off + cohort grid on
  known inputs (incl. edge cases: zero events, a user who skipped a stage, multiple events same user/day
  → deduped). RED before, GREEN after.
- Root static gates green. **Rule 31 (plausibility):** the funnel + cohort outputs are SANE on a realistic
  fixture (monotonically non-increasing funnel counts; conversion % in [0,100]; no NaN/Infinity) — add a
  sane-bounds assertion. (No FIRE/financial math here, so `fintech-domain-analyst` is N/A — note it.)

---

## 5. STAGE D — token-guarded internal read endpoint (NO user dashboard in v1)

**File(s):** `server/src/routes/analytics-internal.ts` (create — mirror `smoke-internal.ts`), register
in `server/src/index.ts` OUTSIDE `authMiddleware`. **No frontend dashboard** (YAGNI — v1 is queryable
data, not presentation).

### Pre-made design decisions (do NOT deviate)
1. **`GET /api/internal/analytics/funnel`** and **`GET /api/internal/analytics/cohorts`** — guarded by
   `ANALYTICS_TOKEN` (constant-time compare, **fail-closed 500 if the env var is unset**, exactly like
   `SMOKE_TOKEN`); read events via `analytics-repo`, run `computeActivationFunnel` / `computeRetentionCohorts`,
   return via `apiSuccess`. Mounted OUTSIDE `authMiddleware` (internal/ops surface), like smoke + lifecycle.
2. **Add `ANALYTICS_TOKEN`** to `server/.env.example` + `validate-env.ts` warnings (prod-only warning,
   not a hard-fail) + document in `docs/DEPLOY.md` §1 table. The token is operator-only.
3. Aggregate-only output — never row-level PII; counts + percentages + cohort grid only.

### Stage D acceptance
- Server static gates green. Integration test (DB-gated): seed a few events → GET both endpoints with the
  token → assert the funnel/cohort shape; assert **401/403 without the token** and **500 if the token env
  is unset** (fail-closed). API behavioral test asserted.

---

## 6. Verification gates

> **All rules in `.claude/rules/claude-behavior.md` are operative.** Rules **24, 25, 26, 29, 31, 32, 33**
> are MANDATORY gates at every task AND every stage boundary. Test by **blast radius of the changed
> surface** (the conditional-gating table below) — full depth in every layer the change touches. Test
> PLACEMENT follows `.claude/rules/testing-strategy.md`.

**Static gates (both trees, every stage that touches them):**
- Root: `npm run type-check && npm run test:unit` — 0 errors, no regression.
- Server: `cd server && npm run type-check && npm run lint && npm run test:unit` (incl. the
  `DATABASE_URL`-gated integration specs).
- Build: `npm run build` succeeds.

**Conditional gating (this build trips most rows):**

| Rule / check | Trigger here | Behavior on skip |
|---|---|---|
| **26** post-phase + cross-page sweep | ALWAYS fires | non-skippable |
| **33** blind independent test re-verification | whenever a test verdict is produced (always here) | non-skippable |
| **29** independent code review (`code-reviewer-agent`) | every non-trivial diff (all stages) | n/a only for docs-only |
| **DPDP schema review (privacy lens)** | Stage A schema + capture route (MANDATORY — the privacy gate) | non-skippable; block commit on a finding |
| **API behavioral test** (status·envelope·auth-gate·IDOR) | Stages A + D (`server/`/`/api/**`) | non-skippable for those stages |
| **31** output plausibility | Stage C funnel/cohort outputs (user-facing-ish values) + the internal read | `rule 31 n/a` only if no value |
| **24** UI render | Stage B (instrumented screens still render) | `rule 24 skipped: no UI change` (Stages A/C/D) |
| **32** interactive functionality | Stage B (screens still function) | `rule 32 skipped: no interactive UI change` |
| **25** UI→persistence | Stage B (a UI action → an event row persists) | `rule 25 skipped: no write-path UI` |
| **`fintech-domain-analyst`** | NOT triggered — no FIRE/tax/`assumptions.ts` math | `fintech n/a: no financial math` |

**Rule 24 (Stage B screens):** `browser_navigate` → `take_screenshot` → `browser_snapshot` →
`browser_console_messages`; intended screen renders, ARIA present, no NEW console error. ≤3 iterations → `/fix-loop`.

**Rule 25 (event persistence):** after a UI action fires an event, confirm the row landed via an
independent read (`curl -H "x-dev-bypass: true"` the Stage-D internal endpoint, or a direct API/DB read)
— the event exists with the right `eventName`/`funnelStage` and **no PII in `context`**. Wait out the
fire-and-forget POST first.

**Rule 26 (cross-page / consumer):** the captured events propagate to the funnel/cohort read (the
"consumer") — counts reflect what was triggered (±0; these are exact counts). Drive MCP to the affected
screens + verify the internal read reflects the events.

**Rule 29 (independent review):** dispatch `code-reviewer-agent` on each stage's diff (adversarial) +
the mandatory DPDP/privacy review of the Stage-A schema. Act on every blocker/HIGH before the stage commit;
file deferred-but-real findings as Issues. The run is NEVER the sole verifier of its own code.

**Rule 31 (plausibility):** funnel counts monotonically non-increasing; conversions in [0,100]; no
NaN/Infinity; cohort grid sane on a realistic fixture.

**Rule 33 (blind test re-verification):** every test verdict (esp. the Rule-24/25 UI evidence) re-checked
by a SEPARATE context-blind agent given the raw evidence (screenshots/network/persisted rows), not this
run's conclusions. **Evidence-handoff gotcha:** Playwright MCP writes screenshots to the
primary-worktree `.playwright-mcp/`, NOT the goal worktree — copy/absolute-path them into the goal
worktree's evidence dir and `ls`-confirm each BEFORE dispatching the verifier. Reconcile any dissent first.

**Failure-recovery budget:**
- Per-task fix budget ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → then DEFER the
  task + continue; do NOT halt the whole run.
- MCP browser hang recovery: 3 cycles (wait+retry → close+re-navigate → kill+restart the captured dev-server
  PID + retry) → DEFER + continue.
- **Hard halt ONLY:** `npm install` failure; a decision contradiction in this contract; an irrecoverable
  build break after the full budget; an OS permission denial; a missing required token. Context-budget
  anxiety is NOT a halt — hand off via a one-line continuation note, never fake-complete.

---

## 7. Commit + push

- **Four commits** (one per stage), conventional, scope `analytics`:
  - `feat(analytics): AnalyticsEvent schema + authed capture endpoint + retention purge (#44)`
  - `feat(analytics): useAnalytics composable + instrument activation/engagement events (#44)`
  - `feat(analytics): pure activation-funnel + retention-cohort aggregation (#44)`
  - `feat(analytics): token-guarded internal funnel/cohort read endpoint (#44)`
- A migration-only commit FIRST if cleaner (`feat(db): AnalyticsEvent model + migration (#44)`).
- **Stage files only — NEVER `git add -A`.** Leave the 5 untracked `docs/goals/2026-06-0*.md` contracts +
  any other untracked items alone. Co-author trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch `feat/analytics-instrumentation-v1`; push to `origin`. **On success:** merge `--no-ff` → `main`,
  push, then self-clean the worktree/branch (§0.1.4). **Do NOT deploy to prod** (Abhay's gate) — leave it
  on `main`, ready for the next deploy (note the schema-changing migration needs a PITR backup at deploy).

---

## 8. Definition of Done (all MUST be true)

**Build / change:**
- [ ] `AnalyticsEvent` model + migration applied to Supabase; `analytics-repo`, `analytics-events`,
      `analytics.ts` capture route, `analytics-retention` purge folded into the daily lifecycle run, all built.
- [ ] `useAnalytics` composable + all SIX events instrumented at their hooks (no-op in demo mode).
- [ ] `analytics-funnel` + `analytics-cohort` pure aggregations built.
- [ ] `analytics-internal` token-guarded `GET /funnel` + `/cohorts` built + registered outside auth; `ANALYTICS_TOKEN` documented.

**Static gates:**
- [ ] both trees type-check 0 errors · unit tests no regression (incl. DB-gated integration) · `npm run build` succeeds.

**API behavioral test (Stages A + D):**
- [ ] capture route: 201 + envelope · 400 bad event name · 400 PII-key in context · **401 no session** ·
      **IDOR: body `userId` ignored, row owned by session user**. internal read: token required (401/403
      without) · **500 if `ANALYTICS_TOKEN` unset (fail-closed)** · correct funnel/cohort shape.

**DPDP / privacy gate (Stage A):**
- [ ] privacy-lens review confirms ZERO PII / financial values can land (schema + the route PII-key guard); findings acted on.

**Rule 24 (Stage B screens — render):**
- [ ] splash/wizard → dashboard still render; screenshot + ARIA + console pass; zero NEW console errors.

**Rule 32 (Stage B — functionality):**
- [ ] those screens still function (onboarding proceeds, dashboard shows the FIRE figure) AND the event POST fires (network observed); no NEW console error.

**Rule 25 (event persistence):**
- [ ] a UI-triggered event round-trips: row persists with expected `eventName`/`funnelStage` and **no PII in `context`** (independent read).

**Rule 31 (plausibility):**
- [ ] funnel monotonic non-increasing · conversions in [0,100] · no NaN/Infinity · cohort grid sane (sane-bounds assertion added). (`fintech n/a: no financial math`.)

**Rule 29 (independent code review):**
- [ ] `code-reviewer-agent` ran on each stage diff; every blocker/HIGH acted on or filed as an Issue.

**Rule 26 (cross-page / consumer):**
- [ ] triggered events reflected exactly in the funnel/cohort internal read.

**Rule 33 (blind test verification):**
- [ ] every test verdict re-checked by a separate context-blind agent (evidence paths verified to resolve first); coverage + verdict concur; dissents reconciled.

**Ship:**
- [ ] 4–5 conventional commits pushed to `feat/analytics-instrumentation-v1`.
- [ ] **On success only:** merged `--no-ff` → `main`, pushed, then self-cleaned (worktree removed + branch `-D` + pruned). (DEFER/HALT keeps the worktree.)
- [ ] Deferrals logged in `docs/goals/.run/analytics-instrumentation-phase1-DEFERRED.md` with rule status + reason.
- [ ] Progress log maintained throughout; major events/lessons rolled into the final report + a notable lesson appended to `.claude/tasks/lessons.md`.
- [ ] **NOT deployed** — left on `main`, ready for next deploy; the schema-changing migration's PITR-backup-before-deploy noted for Abhay.

---

## 9. Final report (required on completion)

Open with a **SUMMARY — DONE / PENDING / BLOCKED / NEXT** (mirror it in the final PROGRESS entry). Then:
commit SHAs + per-stage gate results; the API behavioral-test results; the DPDP review verdict; Rule 24/25
verdicts + evidence paths; Rule 26 consumer result; Rule 29 review findings + dispositions; Rule 31
plausibility note; DoD green/amber/red tally; any DEFERRED entries with rule status + reason; the
"skipped (already covered)" preflight list.

Plus a **LEARNINGS TO FOLD BACK** section (from the §0.3 log) — PROPOSALS only (governance edits need
Abhay's approval). Route each per the canonical taxonomy (GENERIC → skill/process-rule; PRODUCT-SPECIFIC
→ product rule if a recurring class, else this contract; prefer a deterministic gate over prose; one
canonical home, dedup). Auto-append only the one-line error→fix→lesson (with a gate-gap line) to
`.claude/tasks/lessons.md`. The next interactive turn offers Mode-B fold-back.

---

## 10. Guardrails (hard stops)

- **`src/` / `server/` / `e2e/` only.** Never write `.claude/` rules from this run; never write
  `D:\Abhay\VibeCoding\5Wealths\`. Strategic items → `TODO(5W):` notes only.
- **No external analytics SaaS, ever** (PostHog/Mixpanel/Amplitude/GA). First-party only. No new runtime
  dependency for analytics (use the existing Hono/Prisma/fetch stack). If a dep seems needed, DEFER + report.
- **No PII / no financial values in any event** — pseudonymized userId + event name + funnel stage +
  minimal non-PII context only. The route's PII-key guard is a hard requirement. Remove, never carry,
  any temptation to log amounts.
- **Analytics must NEVER break a user action** — capture is fire-and-forget, failures swallowed client-side.
- **No consent UI in v1** (per the contract-top DPDP decision) unless Abhay changed it at review.
- **#44 is the measurement layer ONLY** — do NOT build #45 nudge delivery here.
- **No design reinvention** — reuse the smoke/lifecycle internal-route pattern, the repo/envelope/logger
  conventions, the send-log-retention purge pattern.
- **Honesty (rule 20):** no synthetic/fake events; the funnel/cohort read shows real captured data or an
  honest empty state. Surface uncertainty as an explicit assumption, never fiction.
- **Stop only on a true blocker** (above). Context-budget anxiety is NOT a blocker — hand off via a
  one-line note, never fake-complete.
- **Do NOT deploy to prod** — Abhay's gate.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Build vs external SaaS | **Self-hosted first-party** (Supabase `AnalyticsEvent` + Hono capture) — privacy-first, no spend, owns the data (goal-anchored; 5W principles) |
| 2 | PII posture | **PII-free**: pseudonymized userId + event name + funnel stage + minimal non-PII context; route-level PII-key guard; NO financial values |
| 3 | DPDP consent in v1 | **No separate consent UI** — legitimate-use first-party product analytics + data-minimization + retention + a mandatory DPDP schema review. **Abhay to confirm at contract-review** (the one open decision) |
| 4 | v1 scope | Activation funnel (signup→onboarding→first-FIRE→return) + retention cohorts + the `plan_updated` engagement signal; **no user dashboard** (token-guarded internal read only) |
| 5 | Event log shape | **Append-only**; dedup at QUERY time (not a write constraint) — keeps the raw log honest |
| 6 | Capture in demo mode | **No-op** when `!isServerMode()` (no backend); fire-and-forget, failures swallowed |
| 7 | Retention | 365-day purge, **folded into the existing daily lifecycle cron** (no new cron), mirroring send-log-retention |
| 8 | Internal read auth | `ANALYTICS_TOKEN` constant-time, **fail-closed if unset**, mounted outside `authMiddleware` (smoke/lifecycle pattern) |
| 9 | Persistence mode for verification | **ServerAdapter** (`VITE_USE_SERVER_ADAPTER=on` + dev-bypass); Rule-25 = API GET round-trip |
| 10 | #45 nudge delivery | OUT of scope; schema designed so #45 can consume `plan_updated` later |
| 11 | Deploy | **NOT deployed** by the run — merged to `main`, ready for Abhay's next deploy (PITR backup before the schema migration) |

---

## References (loaded transitively)

- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 29, 31, 32, 33
- `.claude/rules/testing-strategy.md` — test PLACEMENT SSOT
- `.claude/rules/independent-test-verification.md` — rule 33 blind re-verification
- `.claude/rules/output-plausibility-verification.md` — rule 31
- `.claude/rules/operating-model.md` — rule 29 independent-reviewer edge
- `.claude/rules/tdd-rule.md` — red-first (MANDATORY for this build)
- `.claude/rules/prisma-conventions.md` · `.claude/rules/hono-route-conventions.md` · `.claude/rules/api-envelope-pattern.md`
- `.claude/rules/dev-bypass-auth.md` · `.claude/rules/structured-logging.md` · `.claude/rules/non-blocking-side-effects.md`
- `.claude/rules/calculation-modules.md` — pure-module discipline for the aggregation libs
- `.claude/rules/comms-subsystem.md` — the send-log-retention + internal-route precedents
- `docs/DEPLOY.md` — §1 env table (`ANALYTICS_TOKEN`), §5a daily cron (purge fold-in), PITR-before-migration
- Skills the run drives: `/fix-loop`, `/systematic-debugging`, `/auto-verify`

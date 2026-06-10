# 5 Wealths portfolio context — READ FIRST

This repo is one project inside Abhay's 5 Wealths portfolio. Before any strategic, scoping, or
governance work, read the three files below in order — they explain the portfolio, the L-042
boundary rule, the immutable principles, and the glossary used across all of Abhay's projects.

@./5W-CONTEXT.md
@./5W-PRINCIPLES.md
@./5W-GLOSSARY.md

**If the @-import syntax is not honored by your client, use the Read tool to load `./5W-CONTEXT.md`,
`./5W-PRINCIPLES.md`, and `./5W-GLOSSARY.md` manually before proceeding.**

**Boundary reminder (non-negotiable):** never write into `D:\Abhay\VibeCoding\5Wealths\` from this
repo. Strategic decisions surfaced here get captured as `TODO(5W):` notes; Abhay carries them across
in a separate 5 Wealths session.

---

# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**FireKaro** — a research-grounded Indian **FIRE** (Financial Independence, Retire Early) planning
SaaS. **Vue 3 + Vite + Vuetify 3** frontend (`src/`) + a **Hono + Prisma + Better Auth** backend
(`server/`) on **Supabase** Postgres. Planning & tracking only — **decision support, not financial
advice** (we show the consequences of the user's *own* choices; we never recommend products), no
bank connections, no transaction execution.

**Goal (objectives SSOT: `docs/v6-fire-planner-product-plan.md` §9; decision-anchoring:
`.claude/rules/goal-anchored-decisions.md`):** serve the **urban-salaried accumulator** across their
*whole FIRE lifecycle* — (0) set up effortlessly · (1) tell the truth (honest, confidence-banded
FIRE date) · (2) get there faster · (3) know when it's safe to stop · (4) stay free post-FIRE. The
plan is *alive* — it updates from every signal.

Extracted **2026-05-31** as a standalone repo from the `FIREKaro-Vue` monorepo's `mvp/` tree (which
became "v6" — the real product). The old tax/transaction tracker (`FIREKaro-Vue/src`+`server`) and
the `firekaro.com` Next.js app are being **retired**; this is the **canonical product repo**.
Multi-tenant by design — every persisted entity is owned by a `userId`.

**Live in production since 2026-06-01: https://firekaro.com** (Hostinger VPS `72.61.240.224`,
PM2 `firekaro-api` + nginx → Supabase, Cloudflare edge TLS). The deploy/redeploy runbook is
`docs/DEPLOY.md` (SSOT for VPS bring-up); CI is `.github/workflows/ci.yml`. Production
config: `NODE_ENV=production`, `DEV_BYPASS_AUTH=false` (boot guard refuses otherwise — see
`.claude/rules/dev-bypass-auth.md`).

The v6 product plan is the design SSOT: `docs/v6-fire-planner-product-plan.md`. The original v5
build contract (still the source of truth for the planner's screens/math) is
`docs/goals/build-firekaro-mvp-v5.md`. Status files: `FINAL-BRIEF-v5.md`,
`VERIFICATION-REPORT-v5.md`, `POST-RUN-NOTES-v5.md`; deferrals `DEFERRED-v5.md`.

> **⛔ Needs-Abhay register (read + maintain EVERY session): `docs/comms-go-live-handoff.md`.**
> This is the **single, canonical list of everything blocked on Abhay** (account logins/MFA,
> secrets, prod deploy, spend/go-live, and recurring escalation gates). Every session MUST: (1)
> **consult it** before assuming a task is fully doable; (2) **keep it current** — tick/remove items
> as they're unblocked, append new ones as they arise, and commit the change. **Do NOT create a
> parallel "needs-Abhay"/blockers file** — append here (it supersedes the deleted
> `.claude/tasks/needs-abhay.md`). It is a disposable worklist that *consumes* the SSOTs, not a
> design SSOT itself.

> **📒 Project log (read at session start): `docs/PROJECT-LOG.md`.** The canonical, auto-referred
> home for **strategic/product/roadmap/prioritization decisions + the running goal status** — the
> narrative index that POINTS to the formal artifacts (issues / ADRs / goal contracts), so no decision
> is lost across sessions. Governed by **`.claude/rules/documentation-management.md`** (the doc
> taxonomy + document-on-decision trigger + auto-reference protocol). Significant decisions MUST be
> logged there before the turn ends; do NOT create a parallel decision log.

## Repository layout

| Path | What | Port |
|---|---|---|
| `src/` | Vue 3 frontend — the planner SPA | 5175 |
| `server/` | Hono + Prisma + Better Auth backend (v6) → Supabase | 3100 |
| `e2e/` | Playwright (incl. `@axe-core/playwright` a11y) | |
| `docs/` · `.claude/` · `5W-*.md` | design SSOT, Claude tooling, portfolio context | |

Frontend and backend each have their **own `package.json` / `node_modules`** — run `npm install` in
both `.` (root) and `server/`.

> **Cold-start for code tasks:** the load-bearing spine is `src/lib/derive.ts` (the ONE pure FIRE-math
> kernel), `src/lib/storage-adapter.ts` (the persistence seam — localStorage demo ↔ ServerAdapter), and
> `src/stores/household.ts` (the big store). Read those three before touching planner logic.

> `README.md` is the human-facing overview (refreshed for the standalone repo). THIS file (`CLAUDE.md`)
> remains the SSOT for layout, ports, architecture, and commands — if the two ever drift, trust this one.

## Commands

**Fresh clone (once):** `prisma generate` is required before the backend type-checks.
```bash
npm install && (cd server && npm install && npm run prisma:generate)
```

**Pre-commit gate (run in BOTH trees before committing):**
```bash
npm run type-check && npm run test:unit
(cd server && npm run type-check && npm run lint && npm run test:unit)
```

**Frontend (repo root):**
```bash
npm run dev               # Vite dev server on http://localhost:5175
npm run test:unit         # vitest run (one-shot)
npm run test:unit -- src/lib/tax.spec.ts   # single spec file
npm run test:unit -- -t "marginal relief"  # filter by test name (vitest -t)
npm run test:unit:watch   # vitest watch mode
npm run test:coverage     # vitest run --coverage
npx stryker run           # mutation-test the honesty-critical kernel (fire-math/tax/withdrawal-strategy/epf-vpf) — a KILLED MUTANT, not coverage %, is the real proof the specs protect the math (config: stryker.config.json)
# Property/metamorphic kernel guard (fast-check): src/lib/kernel-invariants.property.spec.ts generates 1000s of valid perturbations off the real seeds and asserts the Tier-0 honesty invariants (savings/return monotonicity, no NaN/−∞ reaching a user, default-lens earner pooling, tax & withdrawal bounds). Runs inside npm run test:unit. Pairs with src/lib/headline-plausibility.spec.ts (5 fixed-fixture sane-bounds locks).
npm run type-check        # vue-tsc --build --force  (banner: firekaro-mvp)
npm run build             # vue-tsc -b && vite build
npm run preview           # serve the production build locally
npm run test:e2e          # playwright
```

**Backend (`cd server`):**
```bash
npm run dev               # tsx watch src/index.ts on http://localhost:3100
npm run type-check        # tsc --noEmit
npm run lint              # eslint src (server-only gate: no raw c.json(), no console.*)
npm run test:unit         # vitest — diff-engine units (no DB) + live integration (gated on DATABASE_URL)
npm run test:unit -- household-diff.spec.ts   # single spec file (no-DB units)
npm run prisma:generate   # prisma generate
npm run prisma:validate   # prisma validate (static)
npm run prisma:migrate:create   # prisma migrate dev --create-only (author a migration, don't apply)
npm run prisma:migrate:deploy   # apply migrations to the DB
```

**Run the full v6 stack locally (frontend → backend → Supabase):** the frontend defaults to
`LocalStorageAdapter` (demo). To exercise the real `ServerAdapter` → `/api/planner/*` → Supabase path,
create **`.env.local`** at the repo root BEFORE starting Vite (Vite only reads env at boot — a server
started first will silently stay on localStorage):
```bash
# .env.local (gitignored)
VITE_USE_SERVER_ADAPTER=on
VITE_API_BASE_URL=http://localhost:3100
VITE_DEV_BYPASS=true            # sends the x-dev-bypass header so no Google OAuth is needed
```
Then run `server/` (`npm run dev`) and root (`npm run dev`) together. Verify a write persisted with an
independent read: `curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/household`. Standalone
Prisma scripts hitting Supabase while the dev server holds connections MUST append `?connection_limit=1`
(session pooler caps at 15 clients → `EMAXCONNSESSION`).

## Backend (`server/`) — Hono + Prisma + Better Auth → Supabase

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
- The `.claude/rules/` for **Hono / Prisma / api-envelope / api-response-unwrapping / dev-bypass-auth
  / structured-logging** apply to `server/` (it IS Hono + Prisma + Better Auth).

## Architecture — four multi-tenant seams (ADR-0001)

Persistence is **abstracted behind seams** so the localStorage demo and the Supabase backend are the
same frontend with a swapped adapter. Every persisted entity is owned by a `userId`.

| Seam | File | What it abstracts |
|---|---|---|
| **Storage** | `src/lib/storage-adapter.ts` | All persistence. `LocalStorageAdapter` (demo) writes `localStorage` keyed `firekaro-mvp:${userId}:${entityKey}`. **`ServerAdapter`** (`src/lib/server-adapter.ts`, v6) is a write-behind cache → `/api/planner/*`. `setAdapter()`/`getAdapter()` install the active one; the interface stays **synchronous**. |
| **Auth/identity** | `src/lib/auth-provider.ts` | Current user id. `LocalAuthProvider` returns `"self"` (demo); **`ServerAuthProvider`** holds the Better-Auth session userId (v6). |
| **Assumptions (R1)** | `src/types/assumptions.ts` (flat `Assumptions` + `DEFAULT_ASSUMPTIONS`) · `src/lib/assumption-math.ts` | Every planning assumption = research default + user override. Resolution: `scenario` (What-If, non-persisting) → `household` (`/preferences` edits) → `global` (`DEFAULT_ASSUMPTIONS`). The layered `AssumptionMap` resolver was retired — `docs/adr/0002-retire-layered-assumption-resolver.md`. |
| **Feature gating** | `src/lib/features.ts` | Per-feature toggles from the onboarding questionnaire. The 12-item sidebar always renders; gating happens inside routes + via `v-if`. |

**ServerAdapter swap (v6):** `src/main.ts` is the ONE async seam — when `VITE_USE_SERVER_ADAPTER` is
on, it resolves the session (`GET /api/planner/me`), constructs `ServerAuthProvider` + `ServerAdapter`,
`await`s `hydrateAll()` (6 concurrent GETs warming the cache) and `setAdapter()` **before mount** — so
every store `hydrate()` + router guard reads a warm cache **synchronously**. If the flag is off or the
backend is unreachable, it falls back to `LocalStorageAdapter`. **The 6 stores + `expense-history.ts`
+ `router/index.ts` are UNCHANGED by the swap** (the non-negotiable spine).

### Storage invariant (CI-enforced)
**Zero direct `localStorage.*` calls anywhere in `src/` outside `storage-adapter.ts`** — enforced by
the scan-test `src/lib/storage-invariant.spec.ts` (runs in `npm run test:unit`).

## State — local Pinia only (no TanStack Query)

Setup-style stores in `src/stores/`: `household.ts` (the big one), `assumptions.ts`, `scenarios.ts`,
`ui.ts`, `features.ts`. All data is in-memory Pinia persisted via the storage adapter (localStorage
or, in v6, the ServerAdapter → Supabase). Conventions (canonical: `src/stores/household.ts`):
- **`hydrate()`** (idempotent) loads from the adapter; router guards call `household.hydrate()` first.
- **Auto-persist**: `watch(data, persist, { deep: true })` — never call `localStorage` directly.
- **Migration-on-hydrate**: backfill older serialized shapes; add a backfill when adding a persisted field.
- **Auto-flow effects**: liabilities→recurring EMI, insurance→premium, salary→EPF/VPF, derived in-store.
- **CRUD**: `add*` ids via `genId()` (`src/lib/id.ts`); `update*` = `Object.assign`; `remove*` reassigns orphaned owner refs.

## Calculations — `src/lib/*.ts` with colocated specs

**The kernel:** `derive.ts` is the ONE pure FIRE-math function — it takes a household snapshot +
resolved assumptions + UI lens and returns every dashboard field. `useFireDerive.ts` is a thin
Pinia-aware wrapper (reads the stores, calls `derive()` once, re-exposes each field as a `computed`);
`derive.spec.ts` unit-tests the kernel and `useFireDerive.seed.spec.ts` locks end-to-end behaviour
through the real stores. The lifecycle/nudge loop in `server/` shares this SAME `derive()` (no math
duplication). Touching FIRE math almost always means touching `derive.ts`.

**Temporal contributions (ADR-0004):** the kernel is **time-varying**, not scalar — `derive.ts`
builds a `ContributionSchedule` + `ReturnSchedule` (`fire-math.ts`) and `calculateYearsToTarget`
grows the corpus segment-by-segment in the REAL frame. The live lever is the household real
savings step-up (`assumptions.householdSavingsStepUpPercent`, **default 0 ⇒ byte-identical scalar
headline**). Per-investment `investments[].contributionSchedule` (age-relative segments, real
₹/month `amount`, `stepUpPercentPerYear` ≤15 — `src/types/household.ts`) is **DISPLAY/PLAN only**
today (persisted via `household-diff`/`household-repo`, NOT yet feeding the headline). Design SSOT:
`docs/adr/0004-temporal-contribution-model.md` + gh-issue #46.

Pure modules in `src/lib/` with colocated `*.spec.ts`: `fire-math.ts`, `tax.ts` + `tax-deductions.ts`
+ `tax-cliff.ts`, `amortization.ts`, `withdrawal-strategy.ts`, `glide-path.ts`, `coast-fire.ts`,
`cashflow.ts`, `epf-vpf.ts`, `nps-withdrawal.ts`, `esop-tax.ts`, `freedom-score.ts`, `adequacy.ts`,
`retirement-goal.ts` (Retirement-card age/year coherence — derives both from the same FIRE source so they correspond, #33),
`stress-test.ts`, `monte-carlo.ts` (#18 — FIRE date as a confidence distribution, not a point),
`investment-traits.ts`, `derived-records.ts`, `nudge-engine.ts`,
`business-legal-kinds.ts` (shared `BUSINESS_LEGAL_KINDS` label lookup for the business/other-income forms — Pvt-Ltd/LLP/Partnership/HUF/etc.),
`salary-percent.ts` (the salary-form % ⇄ ₹ bridge: Basic as % of CTC + employer NPS as % of basic, law-grounded fresh-entry defaults — Code-on-Wages 50% floor; sector-aware NPS govt 14 / private 0; existing records never resurrect defaults),
`lifecycle-digest.ts` (the `derive()`-grounded "since you were away" delta engine — the Tier-1
stickiness digest card on the dashboard), `expense-history.ts`, `member-horizon.ts`, `age.ts`,
`fire-milestone-copy.ts` (Coast/Barista card copy gated on a real FIRE target existing — the honest
"add your data" fallback for zero-data users, #39), and
the **#15 accessible-money bridge** layer
(`accessibility.ts`, `liquidation-tax.ts`, `eps-pension.ts`, `gratuity.ts`, `bridge.ts` — see the
dedicated note below). Research-grounded math: 4-bucket inflation, per-instrument returns,
horizon-driven SWR, variant multipliers, glide path, Floor/Ceiling withdrawal, Monte Carlo
confidence bands. Keep modules pure (no store/DOM access).

The later-lifecycle + stickiness layers (the 5 objectives, `docs/v6-fire-planner-product-plan.md` §9)
also live here: `fire-confidence-band.ts` (obj-1 honesty — FIRE date as a band), `contribution-schedule.ts`
(ADR-0004 temporal contributions), `lever-catalog.ts` + `lever-bands.ts` + `lever-impact.ts` (obj-2
"get there faster" — per-lever FIRE-date-delta ranking, #48), `readiness.ts` (obj-3 "is it safe to
stop?"), `decumulation.ts` (obj-4 post-FIRE guardrails), the **dashboard honesty cards** trio —
`plan-variance.ts` (#138 plan-vs-actual variance against the persisted `plan-baseline` document),
`runway.ts` (#140 layoff/income-shock runway), and the #139 real-vs-nominal toggle
(`deflateProjectionPoints` in `useFireDerive.ts` — DISPLAY-layer deflation of the projection into
today's purchasing power; chart-owned, never changes the kernel) — and the **member model + app-wide lens** layer
`member-earning.ts` + `member-draft.ts` + `member-horizon.ts` (`Member.role` is DERIVED from income, not
stored; the orthogonal "View as &lt;member&gt;" lens screens member-attributable values app-wide while
keeping household-solvency ratios coherent — #66/#67, see `docs/goals/2026-06-08-member-model-coherence-and-app-wide-lens.md`)
plus its #81 member-level FIRE pair: `expense-attribution.ts` (the ONE canonical ring/lens expense
attributor — "Household"/"Dependents" sentinels are deliberately distinct from the asset "Joint"
sentinel) and `individual-fire.ts` (one adult's standalone FIRE as a "mini-household": attributed
corpus/expenses/per-individual tax; household stays the primary + invariant headline).

**Accessible-money bridge (honesty layer, #13/#14/#15 — `derive()` consumes it):** corpus ≥ FIRE
number does NOT mean retire-ready — locked money (PPF maturing at 60, NPS forced into an annuity on
early exit) can leave LIQUID money short in the early years. `bridge.ts` (`computeBridgeCoverage`)
runs a conservative year-by-year liquidity check and **moves the effective headline FIRE age LATER**
when the liquid runway can't cover the bridge years. It combines `accessibility.ts` (when/how-much
each holding unlocks), `liquidation-tax.ts` (post-tax net of selling a holding), plus bridge income
streams `eps-pension.ts` (EPS) + `gratuity.ts` + rental + NPS annuity. The headline FIRE verdict is
gate-integrated, not a side card. Design SSOT: `docs/goals/2026-06-03-accessible-money-bridge.md` +
GitHub issues #13/#14/#15.

## Routing (`src/router/index.ts`)

Top-level routes mirror the 8 sections (income, tax-planning, expenses, investments, liabilities,
insurance, financial-health, fire-goals) + `/profile`, `/preferences`, `/estate-planning`,
`/glossary`. Lazy-load via `import()`, `meta: { layout: "sidebar" }`. `/preferences` is the canonical home for editable
assumptions (deep-link `#pref-section-*`). Two `beforeEach` guards: feature-gate (NEW routes only) +
onboarding (empty→splash, incomplete→wizard, completed→dashboard). Keep legacy aliases.

## Design system

> **LIVING SCREEN STANDARD — read `SCREEN-STANDARD.md` before touching ANY screen.** SSOT for the
> look & structure of every `src/pages/` screen. Approve a new pattern → update that doc + propagate
> to conformed screens in the same session (governance §0).

Tokens `src/styles/tokens.css`, motion `src/styles/motion.css` (`@vueuse/motion`). Fonts Inter (UI) +
JetBrains Mono (numerics). Vuetify config `src/plugins/vuetify.ts`. Shared income design-language in
`components/income-layout/` — reuse, don't re-style per page.

## Seed personas

5 personas in `src/seeds/`: **Sharmas** (default), **Iyers**, **Mehtas**, **Mauryas** (single-income
mid-40s, full-spread portfolio — the `/verify-ui` headed verification fixture), **Empty** (wizard).
`sharmas` loads via `src/lib/seed-persona.ts` (no `sharmas.ts`); the rest have their own `<name>.ts`. Last
choice persists under `firekaro-mvp:active-seed`.

## Engineering role router

Adopt the right engineering role per task automatically — `.claude/rules/engineering-roles.md`
(global, auto-loaded). The **operating model** above the roles — T0 is the orchestrator ("CEO"), the
roles report through it, and verification is a MANDATORY EDGE (the role above reproduces + independently
reviews the role below, API + UI, before any non-trivial output is accepted/committed) — is
`.claude/rules/operating-model.md`.

## Conventions

`<script setup lang="ts">` only; `defineProps<T>()`/`defineEmits<T>()`; `@/` alias → `src/`; INR
formatting via `src/lib/formatters.ts`; defensive coding (`?.`, `?? 0`, `isFinite()`,
division-by-zero guards); three-state render (content / loading / empty); Indian FY `YYYY-YY`.
**Conventional commits** `feat(scope): …`. **Verify UI changes** (screenshot + ARIA + console at
:5175) and run `npm run type-check && npm run test:unit` (both trees) before committing. The standing
behavioral rules (incl. rules 24/25/26 UI+persistence verification, 27 SSOT discipline, 28
goal-contract offer, 29 independent post-implementation verification, 32 interactive-functionality verification) live in
`.claude/rules/claude-behavior.md`. **Test placement** (which test type runs pre-merge vs
post-deploy-on-prod vs never-on-prod) is `.claude/rules/testing-strategy.md` — prod gets smoke +
synthetic monitoring only; full UI regression / load / active-security run pre-merge against
localhost+Supabase.

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

## Non-negotiables

- **Production is LIVE at https://firekaro.com** — the boot guard refuses to start unless
  `NODE_ENV=production` and `DEV_BYPASS_AUTH=false` (`.claude/rules/dev-bypass-auth.md`).
- **Zero direct `localStorage.*` calls anywhere in `src/` outside `storage-adapter.ts`** —
  CI-enforced by `src/lib/storage-invariant.spec.ts`.
- **Every demo-only affordance gates on `isServerMode()`** (`src/lib/runtime-mode.ts`), never an
  inline `import.meta.env` check (gh #36).

## What this is

**FireKaro** — a research-grounded Indian **FIRE** planning SaaS. **Vue 3 + Vite + Vuetify 3**
frontend (`src/`) + a **Hono + Prisma + Better Auth** backend (`server/`) on **Supabase** Postgres.
Decision support, not financial advice — no bank connections, no transaction execution.

**Goal** (SSOT `docs/v6-fire-planner-product-plan.md` §9; anchoring
`.claude/rules/goal-anchored-decisions.md`): serve the **urban-salaried accumulator** across their
whole FIRE lifecycle — set up effortlessly, tell the truth (honest, confidence-banded FIRE date),
get there faster, know when it's safe to stop, stay free post-FIRE. The plan is alive.

Extracted **2026-05-31** from the `FIREKaro-Vue` monorepo's `mvp/` tree (now "v6", the canonical
product). The old tax/transaction tracker (`FIREKaro-Vue/src`+`server`) and the `firekaro.com`
Next.js app are retired. Multi-tenant by design — every persisted entity is owned by a `userId`.

**Live since 2026-06-01: https://firekaro.com** (Hostinger VPS `72.61.240.224`, PM2 `firekaro-api` +
nginx → Supabase, Cloudflare edge TLS). Runbook `docs/DEPLOY.md`; CI `.github/workflows/ci.yml`.

Design SSOT: `docs/v6-fire-planner-product-plan.md`. v5 build contract (still the source of truth
for the planner's screens/math): `docs/goals/build-firekaro-mvp-v5.md`. Status:
`FINAL-BRIEF-v5.md`, `VERIFICATION-REPORT-v5.md`, `POST-RUN-NOTES-v5.md`; deferrals `DEFERRED-v5.md`.

> **⛔ Needs-Abhay register (read + maintain EVERY session): `docs/comms-go-live-handoff.md`.** The
> single canonical list of everything blocked on Abhay (logins/MFA, secrets, prod deploy,
> spend/go-live, escalation gates). MUST consult before assuming a task is doable; MUST keep it
> current (tick/append, commit the change). Do NOT create a parallel blockers file — it supersedes
> the deleted `.claude/tasks/needs-abhay.md`; a disposable worklist, not a design SSOT.

> **📒 Project log (read at session start): `docs/PROJECT-LOG.md`.** Canonical home for
> strategic/product/roadmap/prioritization decisions + the running goal status — points to the
> formal artifacts (issues/ADRs/goal contracts). Governed by
> `.claude/rules/documentation-management.md`. Log significant decisions before the turn ends; do
> NOT create a parallel decision log.

## Repository layout

| Path | What | Port |
|---|---|---|
| `src/` | Vue 3 frontend — the planner SPA | 5175 |
| `server/` | Hono + Prisma + Better Auth backend (v6) → Supabase | 3100 |
| `e2e/` | Playwright (incl. `@axe-core/playwright` a11y) | |
| `docs/` · `.claude/` · `5W-*.md` | design SSOT, Claude tooling, portfolio context | |

Frontend and backend each have their own `package.json`/`node_modules` — `npm install` in both `.`
and `server/`.

> **Cold-start:** the load-bearing spine is `src/lib/derive.ts` (FIRE-math kernel),
> `src/lib/storage-adapter.ts` (persistence seam), `src/stores/household.ts` (the big store) — read
> these three before touching planner logic.

> `README.md` is the human-facing overview. THIS file (`CLAUDE.md`) is the SSOT for layout, ports,
> architecture, and commands — if the two ever drift, trust this one.

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

**Run the full v6 stack locally** (frontend → backend → Supabase): see `README.md` → "Running
locally" → "Full v6 stack" for the `.env.local` recipe (`VITE_USE_SERVER_ADAPTER`, the curl verify,
and the `?connection_limit=1` gotcha).

## Backend (`server/`) — Hono + Prisma + Better Auth → Supabase

- Session pooler `aws-1-ap-south-1.pooler.supabase.com:5432` — the direct `db.*.supabase.co` host is
  IPv6-only and fails over IPv4 (P1001).
- `prisma generate` MUST run before the server type-checks (`npm run prisma:generate`).
- Full architecture (document endpoints, household diff engine, comms subsystem, auth/dev-bypass,
  prod smoke, owner-alert detectors) is `.claude/rules/server-backend.md`.

## Architecture — four multi-tenant seams (ADR-0001)

Persistence is abstracted behind seams so the localStorage demo and the Supabase backend are the
same frontend with a swapped adapter. Every persisted entity is owned by a `userId`.

| Seam | File | What it abstracts |
|---|---|---|
| **Storage** | `src/lib/storage-adapter.ts` | All persistence. `LocalStorageAdapter` (demo) writes `localStorage` keyed `firekaro-mvp:${userId}:${entityKey}`. **`ServerAdapter`** (`src/lib/server-adapter.ts`, v6) is a write-behind cache → `/api/planner/*`. `setAdapter()`/`getAdapter()` install the active one; the interface stays **synchronous**. |
| **Auth/identity** | `src/lib/auth-provider.ts` | Current user id. `LocalAuthProvider` returns `"self"` (demo); **`ServerAuthProvider`** holds the Better-Auth session userId (v6). |
| **Assumptions (R1)** | `src/types/assumptions.ts` (flat `Assumptions` + `DEFAULT_ASSUMPTIONS`) · `src/lib/assumption-math.ts` | Every planning assumption = research default + user override. Resolution: `scenario` → `household` → `global`. The layered `AssumptionMap` resolver was retired — `docs/adr/0002-retire-layered-assumption-resolver.md`. |
| **Feature gating** | `src/lib/features.ts` | Per-feature toggles from the onboarding questionnaire. The 12-item sidebar always renders; gating happens inside routes + via `v-if`. |

**ServerAdapter swap (v6):** `src/main.ts` is the ONE async seam — when `VITE_USE_SERVER_ADAPTER` is
on it resolves the session (`GET /api/planner/me`), constructs `ServerAuthProvider`+`ServerAdapter`,
awaits `hydrateAll()` (7 concurrent GETs incl. `plan-baseline`) and `setAdapter()` **before mount**,
so every store/router-guard reads a warm cache synchronously; falls back to `LocalStorageAdapter` if
the flag is off or the backend is unreachable. The 5 stores + `expense-history.ts` +
`router/index.ts` are UNCHANGED by the swap (the non-negotiable spine).

Demo-only affordances (gating rule: Non-negotiables above) currently on `isServerMode()`: the seed
switcher, "Explore with sample data", the product tour, and the command-palette seed actions — so
none can overwrite a real user's account (gh #36). Any NEW demo-only affordance gets the same gate.

### Storage invariant
See Non-negotiables above — the enforcing scan-test runs inside `npm run test:unit`.

## State — local Pinia only (no TanStack Query)

Setup-style stores in `src/stores/`: `household.ts` (the big one), `assumptions.ts`, `scenarios.ts`,
`ui.ts`, `features.ts` — persisted via the storage adapter. Conventions (canonical:
`src/stores/household.ts`):
- **`hydrate()`** (idempotent); router guards call `household.hydrate()` first.
- **Auto-persist**: `watch(data, persist, { deep: true })` — never call `localStorage` directly.
- **Migration-on-hydrate**: backfill older serialized shapes when adding a persisted field.
- **Auto-flow**: liabilities→recurring EMI, insurance→premium, salary→EPF/VPF, derived in-store.
- **CRUD**: `add*` ids via `genId()` (`src/lib/id.ts`); `update*` = `Object.assign`; `remove*`
  reassigns orphaned owner refs.

## Calculations — `src/lib/*.ts` with colocated specs

**The kernel:** `derive.ts` is the ONE pure FIRE-math function — household snapshot + resolved
assumptions + UI lens → every dashboard field. `useFireDerive.ts` is its thin Pinia-aware wrapper;
`derive.spec.ts` unit-tests the kernel and `useFireDerive.seed.spec.ts` locks end-to-end behaviour
through the real stores. The lifecycle/nudge loop in `server/` shares this SAME `derive()`.

**Temporal contributions (ADR-0004):** the kernel is time-varying, not scalar — `derive.ts` builds a
`ContributionSchedule`+`ReturnSchedule` (`fire-math.ts`); the live lever is
`assumptions.householdSavingsStepUpPercent` (default 0 ⇒ byte-identical scalar headline).
Per-investment `investments[].contributionSchedule` (`src/types/household.ts`) is DISPLAY/PLAN only
today. Design SSOT: `docs/adr/0004-temporal-contribution-model.md` + gh-issue #46.

The full per-module inventory (every pure `src/lib/*.ts` module, the later-lifecycle + stickiness
layers, and the member model + app-wide lens layer) lives in
`.claude/rules/calculation-modules.md` → "Module Inventory" — extend that table, not this file.
Research-grounded math throughout: 4-bucket inflation, per-instrument returns, horizon-driven SWR,
variant multipliers, glide path, Floor/Ceiling withdrawal, Monte Carlo bands. Keep modules pure.

**Accessible-money bridge (#13/#14/#15 — `derive()` consumes it):** corpus ≥ FIRE number does NOT
mean retire-ready — locked money (PPF maturing at 60, NPS forced into annuity on early exit) can
leave LIQUID money short. `bridge.ts` (`computeBridgeCoverage`) runs a year-by-year liquidity check
and moves the effective headline FIRE age LATER when the liquid runway can't cover the bridge years,
combining `accessibility.ts` (unlock timing), `liquidation-tax.ts` (post-tax net of a sale), plus
income streams `eps-pension.ts` + `gratuity.ts` + rental + NPS annuity. Design SSOT:
`docs/goals/2026-06-03-accessible-money-bridge.md`.

## Routing (`src/router/index.ts`)

Top-level routes mirror the 8 sections (income, tax-planning, expenses, investments, liabilities,
insurance, financial-health, fire-goals) + `/profile`, `/preferences`, `/estate-planning`,
`/glossary`. Lazy-load via `import()` (`meta: { layout: "sidebar" }`). `/preferences` is the
canonical home for editable assumptions (deep-link `#pref-section-*`). Two `beforeEach` guards:
feature-gate (NEW routes only) + onboarding (empty→splash, incomplete→wizard, completed→dashboard).
Keep legacy aliases.

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
`sharmas` loads via `src/lib/seed-persona.ts` (no `sharmas.ts`); the rest have their own `<name>.ts`.
Last choice persists under `firekaro-mvp:active-seed`.

## Engineering role router

Adopt the right engineering role per task automatically — `.claude/rules/engineering-roles.md`
(global, auto-loaded). The operating model above the roles — T0 is the orchestrator ("CEO"),
verification is a MANDATORY EDGE (the role above reproduces + independently reviews the role below,
API + UI, before any non-trivial output is accepted/committed) — is `.claude/rules/operating-model.md`.

## Conventions

`<script setup lang="ts">` only; `defineProps<T>()`/`defineEmits<T>()`; `@/` alias → `src/`; INR
formatting via `src/lib/formatters.ts`; defensive coding (`?.`, `?? 0`, `isFinite()`,
division-by-zero guards); three-state render (content / loading / empty); Indian FY `YYYY-YY`.
**Conventional commits** `feat(scope): …`. **Verify UI changes** (screenshot + ARIA + console at
:5175) and run `npm run type-check && npm run test:unit` (both trees) before committing. The standing
behavioral rules (incl. rules 24/25/26 UI+persistence verification, 27 SSOT discipline, 28
goal-contract offer, 29 independent post-implementation verification, 32 interactive-functionality
verification) live in `.claude/rules/claude-behavior.md`. **Test placement** (pre-merge vs
post-deploy-on-prod vs never-on-prod) is `.claude/rules/testing-strategy.md`.
- **Property/metamorphic kernel guard (fast-check):** `src/lib/kernel-invariants.property.spec.ts`
  generates 1000s of valid perturbations off the real seeds and asserts the Tier-0 honesty invariants
  (savings/return monotonicity, no NaN/−∞ reaching a user, default-lens earner pooling, tax &
  withdrawal bounds); runs inside `npm run test:unit`. Pairs with
  `src/lib/headline-plausibility.spec.ts` (5 fixed-fixture sane-bounds locks).

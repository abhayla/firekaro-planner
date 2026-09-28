# 5 Wealths portfolio context — READ FIRST

This repo is one project inside Abhay's 5 Wealths portfolio. Before any strategic, scoping, or governance work, read the three files below in order — they explain the portfolio, the L-042 boundary rule, the immutable principles, and the glossary used across all of Abhay's projects.

@./5W-CONTEXT.md
@./5W-PRINCIPLES.md
@./5W-GLOSSARY.md

**If the @-import syntax is not honored by your client, use the Read tool to load `./5W-CONTEXT.md`, `./5W-PRINCIPLES.md`, and `./5W-GLOSSARY.md` manually before proceeding.**

**Boundary reminder (non-negotiable):** never write into `D:\Abhay\VibeCoding\5Wealths\` from this repo. Strategic decisions surfaced here get captured as `TODO(5W):` notes; Abhay carries them across in a separate 5 Wealths session.

---

# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Non-negotiables

- **Production is LIVE at https://firekaro.com** — the boot guard refuses to start unless `NODE_ENV=production` and `DEV_BYPASS_AUTH=false` (`.claude/rules/dev-bypass-auth.md`).
- **Zero direct `localStorage.*` calls anywhere in `src/` outside `storage-adapter.ts`** — CI-enforced by `src/lib/storage-invariant.spec.ts`.
- **Every demo-only affordance gates on `isServerMode()`** (`src/lib/runtime-mode.ts`), never an inline `import.meta.env` check (gh #36).

## What this is

**FireKaro** — a research-grounded Indian **FIRE** planning SaaS. **Vue 3 + Vite + Vuetify 3** frontend (`src/`) + a **Hono + Prisma + Better Auth** backend (`server/`) on **Supabase** Postgres. Decision support, not financial advice — no bank connections, no transaction execution.

**Goal** (SSOT `docs/v6-fire-planner-product-plan.md` §9; anchoring `.claude/rules/goal-anchored-decisions.md`): serve the **salaried accumulator — lower-middle to upper-middle class, age 20–60, household income ₹2.5L–₹1Cr+; NOT the affluent/HNI, who is already independent** (D-2026-09-13-02/03) — across their whole FIRE lifecycle — set up effortlessly, tell the truth (honest, confidence-banded FIRE date), get there faster, know when it's safe to stop, stay free post-FIRE. The plan is alive — it updates from every signal. **A low income today is a starting point, never a verdict:** show how income growth and new income sources reach FIRE; a bare "not reachable" is a defect. The headline is the conservative income band; the user's own hike % moves a second number beside it, never the headline. **Next must-have, parked for budget: gh #185 / `docs/goals/2026-09-13-income-path-kernel.md`** (the kernel never reads `salary.hikePercent` today).

Extracted from the `FIREKaro-Vue` monorepo (now "v6", the canonical product); multi-tenant by design — every persisted entity is owned by a `userId`. History: `docs/architecture-notes.md` → "Repo extraction history".

**Live since 2026-06-01: https://firekaro.com** (Hostinger VPS `72.61.240.224`, PM2 `firekaro-api` + nginx → Supabase, Cloudflare edge TLS). Runbook `docs/DEPLOY.md`; CI `.github/workflows/ci.yml`.

Design SSOT: `docs/v6-fire-planner-product-plan.md`. v5 build contract (still the source of truth for the planner's screens/math): `docs/goals/build-firekaro-mvp-v5.md`. Status: `FINAL-BRIEF-v5.md`, `VERIFICATION-REPORT-v5.md`, `POST-RUN-NOTES-v5.md`; deferrals `DEFERRED-v5.md`.

> **⛔ Needs-Abhay register (read + maintain EVERY session): `docs/comms-go-live-handoff.md`.** The single canonical list of everything blocked on Abhay (account logins/MFA, secrets, prod deploy, spend/go-live, and recurring escalation gates). Every session MUST: (1) consult it before assuming a task is fully doable; (2) keep it current — tick/remove items as they're unblocked, append new ones as they arise, and commit the change. Do NOT create a parallel "needs-Abhay"/blockers file — append here (it supersedes the deleted `.claude/tasks/needs-abhay.md`). It is a disposable worklist that consumes the SSOTs, not a design SSOT itself.

> **📒 Project log (read at session start): `docs/PROJECT-LOG.md`.** The canonical, auto-referred home for strategic/product/roadmap/prioritization decisions + the running goal status — the narrative index that POINTS to the formal artifacts (issues / ADRs / goal contracts), so no decision is lost across sessions. Governed by `.claude/rules/documentation-management.md` (the doc taxonomy + document-on-decision trigger + auto-reference protocol). Significant decisions MUST be logged there before the turn ends; do NOT create a parallel decision log.

## Repository layout

| Path | What | Port |
|---|---|---|
| `src/` | Vue 3 frontend — the planner SPA | 5175 |
| `server/` | Hono + Prisma + Better Auth backend (v6) → Supabase | 3100 |
| `e2e/` | Playwright (incl. `@axe-core/playwright` a11y) | |
| `docs/` · `.claude/` · `5W-*.md` | design SSOT, Claude tooling, portfolio context | |

Frontend and backend each have their own `package.json` / `node_modules` — run `npm install` in both `.` (root) and `server/`.

> **Cold-start for code tasks:** the load-bearing spine is `src/lib/derive.ts` (the ONE pure FIRE-math kernel), `src/lib/storage-adapter.ts` (the persistence seam — localStorage demo ↔ ServerAdapter), and `src/stores/household.ts` (the big store). Read those three before touching planner logic.

> `README.md` is the human-facing overview (refreshed for the standalone repo). THIS file (`CLAUDE.md`) remains the SSOT for layout, ports, architecture, and commands — if the two ever drift, trust this one.

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

**Run the full v6 stack locally** (frontend → backend → Supabase): see `README.md` → "Running locally" → "Full v6 stack" for the `.env.local` recipe (`VITE_USE_SERVER_ADAPTER`, the curl verify, and the `?connection_limit=1` gotcha).

## Backend (`server/`) — Hono + Prisma + Better Auth → Supabase

- Session pooler `aws-1-ap-south-1.pooler.supabase.com:5432` — direct `db.*.supabase.co` is IPv6-only, fails over IPv4 (P1001).
- `prisma generate` MUST run before the server type-checks (`npm run prisma:generate`).
- Full architecture (document endpoints, household diff engine, comms subsystem, auth/dev-bypass, prod smoke, owner-alert detectors) is `.claude/rules/server-backend.md`.

## Architecture — four multi-tenant seams (ADR-0001)

Persistence is abstracted behind seams so the localStorage demo and the Supabase backend are the same frontend with a swapped adapter. Every persisted entity is owned by a `userId`.

| Seam | File | What it abstracts |
|---|---|---|
| **Storage** | `src/lib/storage-adapter.ts` | All persistence. `LocalStorageAdapter` (demo, `localStorage` keyed `firekaro-mvp:${userId}:${entityKey}`) vs **`ServerAdapter`** (`src/lib/server-adapter.ts`, v6, write-behind cache → `/api/planner/*`); `setAdapter()`/`getAdapter()` install the active one, interface stays **synchronous**. |
| **Auth/identity** | `src/lib/auth-provider.ts` | Current user id. `LocalAuthProvider` returns `"self"` (demo); **`ServerAuthProvider`** holds the Better-Auth session userId (v6). |
| **Assumptions (R1)** | `src/types/assumptions.ts` (flat `Assumptions` + `DEFAULT_ASSUMPTIONS`) · `src/lib/assumption-math.ts` | research default + user override; resolution `scenario` → `household` (`/preferences`) → `global`. Retired resolver: `docs/adr/0002-retire-layered-assumption-resolver.md`. |
| **Feature gating** | `src/lib/features.ts` | Per-feature toggles from onboarding; 12-item sidebar always renders, gating via routes + `v-if`. |

**ServerAdapter swap (v6):** `src/main.ts` is the ONE async seam that swaps `LocalStorageAdapter` for `ServerAdapter` before mount (`VITE_USE_SERVER_ADAPTER`); the 5 stores + `expense-history.ts` + `router/index.ts` are UNCHANGED by the swap. Storage invariant enforced by `src/lib/storage-invariant.spec.ts` (`npm run test:unit`). Full mechanics + the demo-only-affordance gate list: `docs/architecture-notes.md` → "ServerAdapter swap (v6)".

## State — local Pinia only (no TanStack Query)

Setup-style stores in `src/stores/`: `household.ts` (the big one), `assumptions.ts`, `scenarios.ts`, `ui.ts`, `features.ts`. In-memory Pinia, persisted via the storage adapter. Conventions (canonical: `src/stores/household.ts`):
- **`hydrate()`** (idempotent) loads from the adapter; router guards call `household.hydrate()` first.
- **Auto-persist**: `watch(data, persist, { deep: true })` — never call `localStorage` directly.
- **Migration-on-hydrate**: backfill older serialized shapes; add a backfill when adding a persisted field.
- **Auto-flow effects**: liabilities→recurring EMI, insurance→premium, salary→EPF/VPF, derived in-store.
- **CRUD**: `add*` ids via `genId()` (`src/lib/id.ts`); `update*` = `Object.assign`; `remove*` reassigns orphaned owner refs.

## Calculations — `src/lib/*.ts` with colocated specs

**The kernel:** `derive.ts` is the ONE pure FIRE-math function (household snapshot + resolved assumptions + UI lens → every dashboard field). `useFireDerive.ts` wraps it for Pinia; `derive.spec.ts` + `useFireDerive.seed.spec.ts` lock behaviour. `server/`'s lifecycle/nudge loop shares this SAME `derive()`. Touching FIRE math almost always means touching `derive.ts`.

**Temporal contributions (ADR-0004):** the kernel is **time-varying**, not scalar (`derive.ts` + `fire-math.ts`, default 0 step-up ⇒ byte-identical scalar headline). Full mechanics: `docs/architecture-notes.md` → "Temporal contributions (ADR-0004)"; design SSOT `docs/adr/0004-temporal-contribution-model.md` + gh-issue #46.

The full per-module inventory (every pure `src/lib/*.ts` module, the later-lifecycle + stickiness layers, and the member model + app-wide lens layer) lives in `.claude/rules/calculation-modules.md` → "Module Inventory" — extend that table, not this file, when adding a module. Research-grounded math throughout: 4-bucket inflation, per-instrument returns, horizon-driven SWR, variant multipliers, glide path, Floor/Ceiling withdrawal, Monte Carlo confidence bands. Keep modules pure (no store/DOM access).

**Accessible-money bridge (honesty layer, #13/#14/#15 — `derive()` consumes it):** `bridge.ts` (`computeBridgeCoverage`) can move the effective headline FIRE age LATER when liquid runway can't cover the bridge years; gate-integrated, not a side card. Full mechanics: `docs/architecture-notes.md` → "Accessible-money bridge"; design SSOT `docs/goals/2026-06-03-accessible-money-bridge.md` + GitHub issues #13/#14/#15.

## Routing (`src/router/index.ts`)

Top-level routes mirror the 8 sections (income, tax-planning, expenses, investments, liabilities, insurance, financial-health, fire-goals) + `/profile`, `/preferences`, `/estate-planning`, `/glossary`, `/quick` (T-378 QN-1 express front door; the 7-step wizard is the "refine" path). Lazy-load via `import()`, `meta: { layout: "sidebar" }`. `/preferences` = editable assumptions (deep-link `#pref-section-*`). Two `beforeEach` guards: feature-gate + onboarding (empty→splash, incomplete→wizard, completed→dashboard). Keep legacy aliases.

## Design system

> **LIVING SCREEN STANDARD — read `SCREEN-STANDARD.md` before touching ANY screen.** SSOT for the look & structure of every `src/pages/` screen. Approve a new pattern → update that doc + propagate to conformed screens in the same session (governance §0).

Tokens `src/styles/tokens.css`, motion `src/styles/motion.css` (`@vueuse/motion`). Fonts Inter (UI) + JetBrains Mono (numerics). Vuetify config `src/plugins/vuetify.ts`. Shared income design-language: `components/income-layout/`.

## Seed personas

5 personas in `src/seeds/`: **Sharmas** (default), **Iyers**, **Mehtas**, **Mauryas** (`/verify-ui` fixture), **Empty** (wizard). `sharmas` loads via `src/lib/seed-persona.ts`; rest have their own `<name>.ts`. Last choice persists under `firekaro-mvp:active-seed`.

## Engineering role router

Adopt the right engineering role per task automatically — `.claude/rules/engineering-roles.md` (global, auto-loaded). The **operating model** above the roles (T0 = orchestrator; verification is a mandatory edge, API+UI, before any non-trivial output is committed) is `.claude/rules/operating-model.md` (path-scoped to `.claude/agents/**`, `.claude/skills/**`).

## Conventions

`<script setup lang="ts">` only; `defineProps<T>()`/`defineEmits<T>()`; `@/` alias → `src/`; INR via `src/lib/formatters.ts`; defensive coding (`?.`, `?? 0`, `isFinite()`, div-by-zero guards); three-state render; Indian FY `YYYY-YY`. **Conventional commits** `feat(scope): …`. **Verify UI changes** (screenshot + ARIA + console at :5175) + `npm run type-check && npm run test:unit` (both trees) before committing. Standing behavioral rules (24/25/26/27/28/29/32) live in `.claude/rules/claude-behavior.md`. Test placement (pre-merge vs post-deploy vs never-on-prod): `.claude/rules/testing-strategy.md`.
- **Property/metamorphic kernel guard (fast-check):** `src/lib/kernel-invariants.property.spec.ts` generates 1000s of valid perturbations off the real seeds and asserts the Tier-0 honesty invariants (savings/return monotonicity, no NaN/−∞ reaching a user, default-lens earner pooling, tax & withdrawal bounds). Runs inside `npm run test:unit`. Pairs with `src/lib/headline-plausibility.spec.ts` (5 fixed-fixture sane-bounds locks).

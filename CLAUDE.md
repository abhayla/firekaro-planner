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
(`server/`) on **Supabase** Postgres. Planning & tracking only — not financial advice, no bank
connections, no transaction execution.

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

## Repository layout

| Path | What | Port |
|---|---|---|
| `src/` | Vue 3 frontend — the planner SPA | 5175 |
| `server/` | Hono + Prisma + Better Auth backend (v6) → Supabase | 3100 |
| `e2e/` | Playwright (incl. `@axe-core/playwright` a11y) | |
| `docs/` · `.claude/` · `5W-*.md` | design SSOT, Claude tooling, portfolio context | |

Frontend and backend each have their **own `package.json` / `node_modules`** — run `npm install` in
both `.` (root) and `server/`.

> `README.md` is the human-facing overview (refreshed for the standalone repo). THIS file (`CLAUDE.md`)
> remains the SSOT for layout, ports, architecture, and commands — if the two ever drift, trust this one.

## Commands

**Frontend (repo root):**
```bash
npm run dev               # Vite dev server on http://localhost:5175
npm run test:unit         # vitest run (one-shot)
npm run test:unit -- src/lib/tax.spec.ts   # single spec file
npm run test:unit -- -t "marginal relief"  # filter by test name (vitest -t)
npm run test:unit:watch   # vitest watch mode
npm run test:coverage     # vitest run --coverage
npm run type-check        # vue-tsc --build --force  (banner: firekaro-mvp)
npm run build             # vue-tsc -b && vite build
npm run preview           # serve the production build locally
npm run test:e2e          # playwright
```

**Backend (`cd server`):**
```bash
npm run dev               # tsx watch src/index.ts on http://localhost:3100
npm run type-check        # tsc --noEmit
npm run test:unit         # vitest — diff-engine units (no DB) + live integration (gated on DATABASE_URL)
npm run test:unit -- household-diff.spec.ts   # single spec file (no-DB units)
npm run prisma:generate   # prisma generate
npm run prisma:validate   # prisma validate (static)
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
  expense-history}` + `DELETE /api/planner/all` + `GET /api/planner/me` — mirror the
  `StorageAdapter.get/set(key)` 1:1. NOT granular REST. `userId` from the authenticated session
  only, never the body. `apiSuccess`/`apiError` envelope.
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
**Zero direct `localStorage.*` calls anywhere in `src/` outside `storage-adapter.ts`.**

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

Pure modules in `src/lib/` with colocated `*.spec.ts`: `fire-math.ts`, `tax.ts` + `tax-deductions.ts`
+ `tax-cliff.ts`, `amortization.ts`, `withdrawal-strategy.ts`, `glide-path.ts`, `coast-fire.ts`,
`cashflow.ts`, `epf-vpf.ts`, `nps-withdrawal.ts`, `esop-tax.ts`, `freedom-score.ts`, `adequacy.ts`,
`stress-test.ts`, `monte-carlo.ts` (#18 — FIRE date as a confidence distribution, not a point),
`investment-traits.ts`, `derived-records.ts`, `nudge-engine.ts`,
`expense-history.ts`, `member-horizon.ts`, `age.ts`, and the **#15 accessible-money bridge** layer
(`accessibility.ts`, `liquidation-tax.ts`, `eps-pension.ts`, `gratuity.ts`, `bridge.ts` — see the
dedicated note below). Research-grounded math: 4-bucket inflation, per-instrument returns,
horizon-driven SWR, variant multipliers, glide path, Floor/Ceiling withdrawal, Monte Carlo
confidence bands. Keep modules pure (no store/DOM access).

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
insurance, financial-health, fire-goals) + `/profile`, `/preferences`, `/estate-planning`. Lazy-load
via `import()`, `meta: { layout: "sidebar" }`. `/preferences` is the canonical home for editable
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

4 personas in `src/seeds/`: **Sharmas** (default), **Iyers**, **Mehtas**, **Empty** (wizard). Last
choice persists under `firekaro-mvp:active-seed`.

## Engineering role router

Adopt the right engineering role per task automatically — `.claude/rules/engineering-roles.md`
(global, auto-loaded).

## Conventions

`<script setup lang="ts">` only; `defineProps<T>()`/`defineEmits<T>()`; `@/` alias → `src/`; INR
formatting via `src/lib/formatters.ts`; defensive coding (`?.`, `?? 0`, `isFinite()`,
division-by-zero guards); three-state render (content / loading / empty); Indian FY `YYYY-YY`.
**Conventional commits** `feat(scope): …`. **Verify UI changes** (screenshot + ARIA + console at
:5175) and run `npm run type-check && npm run test:unit` (both trees) before committing. The standing
behavioral rules (incl. rules 24/25/26 UI+persistence verification, 27 SSOT discipline, 28
goal-contract offer, 29 independent post-implementation verification) live in
`.claude/rules/claude-behavior.md`.

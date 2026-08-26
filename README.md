# FireKaro — Indian FIRE Planner

A research-grounded **FIRE** (Financial Independence, Retire Early) planning SaaS for Indian
households. **Vue 3 + Vite + Vuetify 3** frontend (`src/`) backed by a thin **Hono + Prisma +
Better Auth** document API (`server/`) on **Supabase** Postgres. Planning & tracking only — not
financial advice, no bank connections, no transaction execution.

> Repo: [`abhayla/firekaro-planner`](https://github.com/abhayla/firekaro-planner). Extracted
> **2026-05-31** as a standalone repo from the old `FIREKaro-Vue` monorepo's `mvp/` tree (which
> became "v6", the real product). The legacy tax/transaction tracker and the `firekaro.com` Next.js
> app are retired — **this is the canonical product repo**.

The authoritative onboarding doc for contributors and AI agents is
[`CLAUDE.md`](./CLAUDE.md) — it is the SSOT for layout, ports, architecture, and commands. This
README is the human-facing overview.

---

## Repository layout

| Path | What | Port |
|---|---|---|
| `src/` | Vue 3 frontend — the planner SPA | 5175 |
| `server/` | Hono + Prisma + Better Auth backend → Supabase | 3100 |
| `e2e/` | Playwright (incl. `@axe-core/playwright` a11y) | |
| `docs/` · `.claude/` · `5W-*.md` | design SSOT, Claude tooling, portfolio context | |

Frontend and backend each have their **own `package.json` / `node_modules`** — run `npm install`
in both `.` (root) and `server/`.

---

## Architecture in one screen

Persistence is abstracted behind **four multi-tenant seams** ([ADR-0001](./docs/adr/0001-v5-portfolio-tier-stance.md))
so the localStorage demo and the Supabase backend are the *same frontend with a swapped adapter*.
Every persisted entity is owned by a `userId`.

- **Storage** (`src/lib/storage-adapter.ts`) — `LocalStorageAdapter` (demo) vs `ServerAdapter`
  (`src/lib/server-adapter.ts`, a write-behind cache → `/api/planner/*`). The interface is synchronous.
- **Auth/identity** (`src/lib/auth-provider.ts`) — `LocalAuthProvider` (`"self"`) vs
  `ServerAuthProvider` (Better-Auth session userId).
- **Assumptions** (`src/types/assumptions.ts` + `src/lib/assumption-math.ts`) — research default +
  user override, resolved scenario → household → global. (Layered resolver retired —
  [ADR-0002](./docs/adr/0002-retire-layered-assumption-resolver.md).)
- **Feature gating** (`src/lib/features.ts`) — per-feature toggles from the onboarding questionnaire.

State is **local Pinia only** (no TanStack Query): 5 setup-style stores in `src/stores/`
(`household` is the big one), persisted via the storage adapter. Pure calculation math lives in
`src/lib/*.ts` with colocated `*.spec.ts` (FIRE number, tax, EPF/VPF, NPS, ESOP, withdrawal
strategy, glide path, freedom score, …). The `server/` is only the thin document API — there is no
calculation backend; all math is client-side.

**v6 ServerAdapter swap:** `src/main.ts` is the one async seam. When `VITE_USE_SERVER_ADAPTER` is
on it resolves the session, warms the cache via 7 concurrent GETs (one per `SERVER_KEYS` document, incl. `plan-baseline`), and installs the `ServerAdapter`
**before mount** — so every store and router guard reads a warm cache synchronously. If the flag is
off or the backend is unreachable, it falls back to `LocalStorageAdapter`.

---

## Running locally

### Frontend (localStorage demo — default, no backend needed)

```bash
npm install
npm run dev           # http://localhost:5175
npm run test:unit     # vitest (one-shot)
npm run type-check    # vue-tsc --build --force
npm run build         # vue-tsc -b && vite build
npm run test:e2e      # playwright
```

### Full v6 stack (frontend → backend → Supabase)

The frontend defaults to `LocalStorageAdapter`. To exercise the real `ServerAdapter` →
`/api/planner/*` → Supabase path, create **`.env.local`** at the repo root **before** starting Vite
(Vite reads env at boot — a server started first silently stays on localStorage):

```bash
# .env.local (gitignored)
VITE_USE_SERVER_ADAPTER=on
VITE_API_BASE_URL=http://localhost:3100
VITE_DEV_BYPASS=true            # sends the x-dev-bypass header — no Google OAuth needed
```

Then run the backend and frontend together:

```bash
cd server && npm install && npm run dev   # http://localhost:3100
npm run dev                               # repo root → http://localhost:5175
```

Verify a write persisted with an independent read:

```bash
curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/household
```

> Standalone Prisma scripts hitting Supabase while the dev server holds connections MUST append
> `?connection_limit=1` (the session pooler caps at 15 clients → `EMAXCONNSESSION`).

---

## Backend (`server/`)

- **DB:** Supabase project `firekaro-planner` (ap-south-1, Postgres 17), connected via the session
  pooler `aws-1-ap-south-1.pooler.supabase.com:5432`. `DATABASE_URL` + `BETTER_AUTH_SECRET` live in
  `server/.env` (gitignored). 24-table schema in `server/prisma/schema.prisma`, derived 1:1 from the
  frontend's Zod model.
- **Document endpoints:** `GET`+`PUT /api/planner/{household,assumptions,scenarios,features,ui,
  expense-history}` + `DELETE /api/planner/all` + `GET /api/planner/me`. They mirror the
  `StorageAdapter.get/set(key)` interface 1:1 — not granular REST. `userId` comes from the
  authenticated session only.
- **Household diff engine** (`server/src/lib/household-diff.ts`): a pure function mapping an incoming
  `Household` to per-table insert/update/delete; `PUT /household` applies it in one Prisma
  `$transaction`. The Prisma read/write layer it drives is `server/src/lib/household-repo.ts`.
- **Auth:** Better Auth (Google + sessions) + a 3-factor dev-bypass
  (an EXPLICIT `NODE_ENV` of `development`/`test` + `DEV_BYPASS_AUTH === 'true'` + an `x-dev-bypass` header).

```bash
cd server
npm run dev               # tsx watch → http://localhost:3100
npm run type-check        # tsc --noEmit
npm run test:unit         # diff-engine units (no DB) + live integration (gated on DATABASE_URL)
npm run prisma:generate
npm run prisma:migrate:deploy
```

---

## What makes this "research-grounded"

- 4-bucket inflation, per-instrument-type returns, horizon-driven SWR, variant-multiplier model,
  glide path, Floor/Ceiling withdrawal rules.
- Multi-tenant from the schema up — every entity carries `userId`; user #2 is a no-refactor add.
- A 6-section onboarding questionnaire with a sticky "Skip — show me everything" affordance.
- `/preferences` is the canonical home for every editable planning assumption (section-anchored
  nav; statutory facts read-only).
- 5 seed personas in `src/seeds/`: **Sharmas** (default), **Iyers**, **Mehtas**, **Mauryas**, **Empty** (wizard).

---

## Design system

Read [`SCREEN-STANDARD.md`](./SCREEN-STANDARD.md) before touching any `src/pages/` screen — it is the
living SSOT for screen look & structure. Design tokens in `src/styles/tokens.css`, motion in
`src/styles/motion.css`; fonts Inter (UI) + JetBrains Mono (numerics); Vuetify config in
`src/plugins/vuetify.ts`.

---

## Status & docs

- **v6 product plan (design SSOT):** [`docs/v6-fire-planner-product-plan.md`](./docs/v6-fire-planner-product-plan.md)
- **Original v5 build contract** (still the source of truth for screens/math):
  [`docs/goals/build-firekaro-mvp-v5.md`](./docs/goals/build-firekaro-mvp-v5.md)
- v5 status artifacts: `FINAL-BRIEF-v5.md`, `VERIFICATION-REPORT-v5.md`, `POST-RUN-NOTES-v5.md`;
  deferrals in `DEFERRED-v5.md`.

**Live in production since 2026-06-01 at https://firekaro.com** (Hostinger VPS, PM2 + nginx → Supabase,
Cloudflare edge TLS; Google OAuth working). Deploy runbook: `docs/DEPLOY.md`. Locally the app is fully
testable via the dev-bypass. 

---

## Portfolio context (5 Wealths)

This repo is one project inside Abhay's **5 Wealths** portfolio. Strategic / governance / scoping
work must read `5W-CONTEXT.md`, `5W-PRINCIPLES.md`, and `5W-GLOSSARY.md` first. The **L-042 boundary
rule** is non-negotiable: this repo never writes into `D:\Abhay\VibeCoding\5Wealths\` — strategic
decisions surfaced here are captured as `TODO(5W):` notes and carried across in a separate 5 Wealths
session.

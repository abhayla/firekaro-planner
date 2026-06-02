---
description: One vitest config per tree (root src/, server/). Integration specs that need a live DB are gated IN-SPEC on DATABASE_URL and auto-skip when it is unset — never via a separate config.
globs: ["vitest.config.ts", "server/vitest.config.ts", "server/src/**/*.spec.ts", "src/**/*.spec.ts"]
version: "2.0.0"
synthesized: true
private: false
---

# Vitest Config & DB-Gated Integration Specs

> **Rewritten 2026-06-02 (v2.0.0).** The prior version described a two-config split
> (`vitest.config.ts` + `vitest.integration.config.ts`) inherited from the retired
> `FIREKaro-Vue` monorepo. **That second config never existed in this extracted repo** — and the
> old example specs (`envelope-integration.spec.ts`, `pagination-integration.spec.ts`) don't exist
> here either. This rule now reflects how `firekaro-planner` actually gates DB-dependent specs.

This repo has **one vitest config per tree** and DB-dependent integration specs are gated **inside
the spec file** on `DATABASE_URL`. A fast developer-inner loop MUST NOT require a running database —
that invariant is real; the mechanism is in-spec gating, not a config split.

## The Two Configs (one per tree — NOT a unit/integration split)

- `vitest.config.ts` (repo root) — runs the **frontend** suite: `include: ["src/**/*.spec.ts"]`,
  `environment: "node"` (math libs are pure). Invoked by `npm run test:unit` at the root.
- `server/vitest.config.ts` — runs the **backend** suite: `include: ["src/**/*.spec.ts"]` (i.e.
  `server/src/**`), `@planner` alias → `../src`. Invoked by `npm run test:unit` inside `server/`.

There is **no** `vitest.integration.config.ts`. The integration spec
(`server/src/routes/planner.integration.spec.ts`) is picked up by `server/vitest.config.ts` like any
other spec — it gates itself at runtime.

## How DB-dependent specs gate themselves

`planner.integration.spec.ts` defines a `RUN_LIVE` constant derived from `process.env.DATABASE_URL`
and wraps its DB-touching cases so they **auto-skip when `DATABASE_URL` is unset** (CI / no-DB
clones) and **run when `server/.env` points at a real Postgres** (Supabase session pooler). The pure
`household-diff.spec.ts` is the no-DB correctness proof and always runs. Verified green against
Supabase `firekaro-planner`.

## MUST / MUST NOT

- DB-dependent specs MUST self-gate on `process.env.DATABASE_URL` (skip when absent) — do NOT assume
  a DB is present. The unit loop on a clean clone (no `.env`) MUST stay green.
- MUST NOT introduce a separate `vitest.integration.config.ts` or an `*-integration` filename
  convention to "split" the suite — this repo gates in-spec. Adding a second config re-introduces the
  exact monorepo drift this rule was rewritten to remove.
- MUST NOT add unconditional Postgres setup (`beforeAll` that connects, Prisma migrations) to a spec
  without the `DATABASE_URL` gate — that breaks every no-DB run.
- To run the live integration path: set `server/.env` `DATABASE_URL` (Supabase session pooler) +
  `DEV_BYPASS_AUTH=true`, then `npm run test:unit` inside `server/`.

## Running

- Frontend: `npm run test:unit` (repo root)
- Frontend, single file: `npm run test:unit -- src/lib/tax.spec.ts`
- Frontend, by test name: `npm run test:unit -- -t "marginal relief"`
- Backend: `cd server && npm run test:unit` (the integration spec runs iff `DATABASE_URL` is set)
- Backend, single no-DB file: `npm run test:unit -- household-diff.spec.ts`

## Why This Matters

In-spec `DATABASE_URL` gating gives the same guarantee a config split would — the unit loop never
requires Postgres — without a second config to keep in sync or a filename convention that silently
re-adds a DB-dependent file to the fast loop when renamed. One config per tree, one gate per
DB-touching spec.

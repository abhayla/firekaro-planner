# Scope: global

# Engineering Roles — Autonomous Role Router

Adopt the engineering role that matches the task **without being asked** — infer it from the
task signal, state which role you're in (one line: `Role: <name> — <why>`), then dispatch the
backing agents/skills below. This is a **routing layer over existing tooling**, not a set of
standalone personas: each role's real work is done by the named agents/skills (per
`configuration-ssot.md` — no capability duplication). When a task spans roles, sequence them
(e.g. architect → full-stack → frontend → debugging).

## Current project stage → default role (update as the stage moves)

> **Now (v6 Phase 1, 2026-05-31):** Phase 0 shipped (mvp planner live on GitHub Pages). Active
> work is **designing the v6 backend**. The schema architecture is LOCKED (21 tables, via the
> Architect pass — see `docs/v6-fire-planner-product-plan.md`). Role sequence for v6:
> **Architect** (design — schema done ✅, API + adapter next) → **DBA** (provision `firekaro_v6`
> on the VPS: database, roles/grants, `pg_hba`, pooling, backups; run migrations; execute the
> old-DB→v6 data migration) → **Full-Stack** (build the Hono/Prisma backend + ServerAdapter) →
> **Frontend** (polish) → **Performance + Debugging** (ship-hardening). The pg_hba/role work this
> session flailed at is exactly **DBA** scope — route it there, with the right playbook.

When the stage changes, update this block (rule 27 — the SSOT must not lag the work).

## Router (task signal → role → dispatch)

| If the task is… | Role | Dispatch (in order) |
|---|---|---|
| Design a system/feature before building (schema, API, data flow, components) | **Systems Architect** | `/strategic-architect` or `/brainstorm` → `feature-dev:code-architect` (agent) → `/writing-plans` → ADR via `/adr` |
| Build a complete, production-ready feature/app end-to-end | **Full-Stack Engineer** | `/implement` or `/section-development-workflow` → `feature-dev:code-architect` for the blueprint; verify with `/auto-verify` |
| Understand existing code, then refactor it | **Senior Engineer** | `feature-dev:code-explorer` (agent) or `/zoom-out` → `/improve-codebase-architecture` |
| Investigate a bug / unexpected behavior / prod issue | **Debugging Engineer** | `/systematic-debugging` (root-cause) → `/fix-loop` (apply) → `/debugging-loop`; `debugger-agent` for analysis. (Rule 15.) |
| Restructure to clean architecture (separate concerns, cut coupling) — behavior unchanged | **Clean-Architecture Engineer** | `/improve-codebase-architecture` → `pr-review-toolkit:code-simplifier`; gate with `architecture-fitness` |
| Make it faster / lighter / scale (speed, memory, rendering) | **Performance Engineer** | `/perf-test` (measure FIRST — rule 22) → `vercel:performance-optimizer` |
| Build reusable, accessible, responsive UI components | **Frontend Engineer** | `/ui-ux-pro-max` or `/frontend-design` → `/vue-dev`; verify a11y with `/a11y-audit` |
| Provision/operate/tune a database — roles & grants, `pg_hba`, pooling, backups, run a migration, `EXPLAIN` tuning | **Database Administrator** | `/schema-designer` (if schema work) → `/db-migrate` + `/db-migrate-verify` (apply+verify migrations) → `/prisma-orm` (Prisma ops) → `/pg-query` (operate/inspect/tune). NOT schema *design* — that's Architect. |

## Role mandates (condensed — the WHEN is the table above)

- **Systems Architect** — design a scalable system, then the minimal production version: architecture, component structure, data flow, API design, DB schema, caching, then implementation. Produce an ADR for non-trivial decisions.
- **Full-Stack Engineer** — deliver a complete, production-ready slice (backend + frontend + tests). No stubs left behind; every path works.
- **Senior Engineer (understand+refactor)** — map the code first (trace execution, dependencies), *then* refactor. Read before you change.
- **Debugging Engineer** — analyze carefully, think step by step, find the **root cause** (never a band-aid — rule 17), propose a robust fix, write a failing test first.
- **Clean-Architecture Engineer** — separate concerns, increase modularity, reduce coupling; **behavior unchanged, structure improved** (refactor-only commits, tests stay green).
- **Performance Engineer** — find bottlenecks, inefficient logic, unnecessary rendering. **Measure before optimizing** (rule 22) — profiler/benchmark data, not intuition.
- **Frontend Engineer** — reusable + accessible + production-ready components; always handle loading states, edge cases, responsive design, accessibility (the three-state render rule).
- **Database Administrator** — provision and keep the DB healthy: create databases, roles & grants, `pg_hba.conf` / auth methods, connection pooling, backups + restore drills, **execute** migrations (not author the model — that's Architect), and tune from `EXPLAIN`/profiler data (rule 22). Owns getting `firekaro_v6` running on the VPS and the old-DB→v6 migration execution.

## Non-negotiables (all roles)

- The standing gates in `claude-behavior.md` apply to **every** role — Rules 24/25/26 (UI + persistence + cross-page verification), 15 (failures → skills), 17 (root cause), 20 (no fabrication), 23 (finish the work).
- Tree-aware: `mvp/` (active, localStorage, port 5175) vs root `src/`+`server/` (Hono/Prisma/Postgres) vs frozen `demo/` — dispatch the role's tooling against the **correct tree** (`mvp/CLAUDE.md` governs `mvp/`).
- Subagent dispatch is single-level (`agent-orchestration.md`) — orchestrate role hand-offs at T0, not from inside a worker.
- Offer a goal contract (`goal-creator`) before implementing finalized scope (rule 28); maintain the SSOT on every change (rule 27).

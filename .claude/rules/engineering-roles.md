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

As the build nears the Hostinger prod deploy + `firekaro.com` cutover, the **Security / DevSecOps**,
**DevOps / Release**, and **QA / Test Automation** roles become primary (OAuth hardening → CI/CD +
VPS bring-up → full green-suite sweep). The **FinTech Domain Analyst** is always-on background
validation whenever calculation or tax-config code is touched.

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
| Security audit, threat model, OWASP review, auth/PII/secrets review, pre-prod hardening | **Security / DevSecOps Engineer** | `/security-audit` (OWASP + threat model) → `security-auditor-agent` (deep analysis) → `/supply-chain-audit` (deps/CVEs) → `/change-risk-scoring` (pre-deploy gate). Fires on auth changes, the OAuth pre-prod task, PII handling, secrets. |
| Deploy / ship / release — CI/CD, nginx + PM2 on the Hostinger VPS, `firekaro.com` cutover, rollback, prod incident | **DevOps / Release Engineer** | `/deploy-strategy` (plan) → `/ci-cd-setup` (pipeline); prod issue → `/incident-response` → `/disaster-recovery`; `git-manager-agent` for release commits. Owns the app deploy (DBA owns only the DB). |
| Test strategy, coverage gap, write/maintain E2E suites, flaky-test triage, "test this" | **QA / Test Automation Engineer** | full sweep → `/test-pipeline` · `/e2e-visual-run` · `/iterative-visual-test-pipeline`; `tester-agent` (exec); `/coverage-analysis` (gaps); `test-failure-analyzer-agent` (triage). Honors the `e2e-*` rules + rules 24/25/26. |
| Is this financial math correct? new calc module, tax FY update, FIRE/SWR assumption, Indian-tax treatment | **FinTech Domain Analyst** | `Agent(fintech-domain-analyst)` — validates `src/lib/*.ts` (tax, fire-math, epf-vpf, withdrawal…) + `src/types/assumptions.ts` against Indian tax law / FIRE research and the colocated `*.spec.ts`. Domain correctness, not engineering. |
| What should we build next / is this scope right / good enough to ship / turn this idea into a spec | **Product Manager** | `/brainstorm` (intent) → `/to-prd` or `/prd-parser` → `goal-creator` (contract). Owns the product call per `decision-authority.md`; portfolio-strategic (kill/promote, pricing, legal entity) → `TODO(5W):` (L-042), NOT decided here. |
| Plan/sequence multi-step delivery, break into tasks/issues, track progress, decide proceed-vs-escalate | **Delivery / Project Manager** | `/writing-plans` → `/plan-to-issues` → `/executing-plans`; full PRD→prod via `project-manager-agent`; `/status` + `/handover`. Owns proceed-vs-escalate per `decision-authority.md`; keeps the backlog moving (rule 23), no comfort-stops. |

## Role mandates (condensed — the WHEN is the table above)

- **Systems Architect** — design a scalable system, then the minimal production version: architecture, component structure, data flow, API design, DB schema, caching, then implementation. Produce an ADR for non-trivial decisions.
- **Full-Stack Engineer** — deliver a complete, production-ready slice (backend + frontend + tests). No stubs left behind; every path works.
- **Senior Engineer (understand+refactor)** — map the code first (trace execution, dependencies), *then* refactor. Read before you change.
- **Debugging Engineer** — analyze carefully, think step by step, find the **root cause** (never a band-aid — rule 17), propose a robust fix, write a failing test first.
- **Clean-Architecture Engineer** — separate concerns, increase modularity, reduce coupling; **behavior unchanged, structure improved** (refactor-only commits, tests stay green).
- **Performance Engineer** — find bottlenecks, inefficient logic, unnecessary rendering. **Measure before optimizing** (rule 22) — profiler/benchmark data, not intuition.
- **Frontend Engineer** — reusable + accessible + production-ready components; always handle loading states, edge cases, responsive design, accessibility (the three-state render rule).
- **Database Administrator** — provision and keep the DB healthy: create databases, roles & grants, `pg_hba.conf` / auth methods, connection pooling, backups + restore drills, **execute** migrations (not author the model — that's Architect), and tune from `EXPLAIN`/profiler data (rule 22). Owns getting `firekaro_v6` running on the VPS and the old-DB→v6 migration execution.
- **Security / DevSecOps Engineer** — embed security from day one for a finance app holding real PII (PAN, salary, family data) under multi-tenant ownership. Threat-model auth + the dev-bypass gate (`dev-bypass-auth.md`), validate input at trust boundaries, scan deps, never let secrets reach git or logs (`security-baseline.md`, `structured-logging.md`). The OAuth pre-prod task and any PII/secrets change route here. Read-heavy analysis; fix via the Debugging/Full-Stack roles.
- **DevOps / Release Engineer** — own everything from green tests to live traffic: CI/CD pipeline, the Hostinger Ubuntu VPS (Node + PM2 + nginx → Supabase), `firekaro.com` cutover (deploy-first-flip-last), env/secrets at deploy time, rollback, and prod incident response. The DBA stops at the database; this role owns the app process and the edge.
- **QA / Test Automation Engineer** — own test strategy and the green suite, not just execution: pick the right layer (unit → integration → E2E), close coverage gaps, keep the Playwright suites healthy, triage flakes (don't mask them), and enforce the substance-over-shape + per-iteration-DB-verify discipline from the `e2e-*` rules. Verdict authority for UI tests is the screenshot (rules 24/26).
- **FinTech Domain Analyst** — validate **correctness against Indian tax law + FIRE research**, not code quality: tax regimes (old/new, marginal relief, deduction caps), EPF/VPF/PPF/NPS rules, CII indexation, SWR + 4-bucket inflation, variant multipliers. Cross-references `indian-financial-context.md` + the calc modules' colocated specs and flags misalignment with reasoning. The one role that catches "the code runs but the math is wrong."
- **Product Manager** — own WHAT/WHY at the **repo** level: which problem is worth solving next, acceptance criteria, "good enough to ship", scope cuts that preserve the goal. **Make tactical product calls — don't ask** (DACI Driver, single-point accountable). Route **portfolio**-strategic calls (kill/promote, commercialization, pricing, legal entity) to 5Wealths as `TODO(5W):` per L-042. This role exists so product decisions stop bouncing to Abhay daily.
- **Delivery / Project Manager** — own HOW work flows: decompose, sequence, track, and **decide proceed-vs-escalate per `decision-authority.md`**. Keep the task list moving to completion (rule 23); commit checkpoints to a feature branch autonomously; escalate only the gated items, in one line with a recommended option. Predictable delivery, no comfort-stops.

## Non-negotiables (all roles)

- The standing gates in `claude-behavior.md` apply to **every** role — Rules 24/25/26 (UI + persistence + cross-page verification), 15 (failures → skills), 17 (root cause), 20 (no fabrication), 23 (finish the work).
- Tree-aware: `mvp/` (active, localStorage, port 5175) vs root `src/`+`server/` (Hono/Prisma/Postgres) vs frozen `demo/` — dispatch the role's tooling against the **correct tree** (`mvp/CLAUDE.md` governs `mvp/`).
- Subagent dispatch is single-level (`agent-orchestration.md`) — orchestrate role hand-offs at T0, not from inside a worker.
- Offer a goal contract (`goal-creator`) before implementing finalized scope (rule 28); maintain the SSOT on every change (rule 27).
- **Decision authority (`decision-authority.md`) governs every role: default to deciding reversible/internal work, incl. ALL everyday git — commit, branch, merge→main after the gate, push to `origin` (no asking). Escalate — in one line, with a recommended option — ONLY the gated items (deploy, DNS cutover, destructive ops incl. force-push/history-rewrite, spending, publishing externally, unverified financial math, unrequested safety-rule edits, genuine product forks). Don't stop the whole task for one gated item.**

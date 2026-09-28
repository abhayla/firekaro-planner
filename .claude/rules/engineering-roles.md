# Scope: global

# Engineering Roles — Autonomous Role Router

Adopt the engineering role that matches the task **without being asked** — infer it from the task signal, state `Role: <name> — <why>`, then dispatch the backing agents/skills below. Routing layer over existing tooling (no capability duplication, `configuration-ssot.md`); when a task spans roles, sequence them (e.g. architect → full-stack → frontend → debugging).

## Current project stage → default role (update as the stage moves)

Now (production-live): persona LOCKED = salaried accumulator (₹2.5L–₹1Cr+, not affluent —
D-2026-09-13-02/03, `docs/v6-fire-planner-product-plan.md` §9). Priority ladder:
- **Tier 0 — correctness/honesty (do now):** FinTech Domain Analyst validates, Full-Stack builds.
- **Tier 1 — retention + onboarding:** Growth leads, Frontend+Full-Stack build, Data/Analytics measures, Privacy/DPDP gates comms.
- **Tier 2 — wedge persona's later lifecycle (transition-readiness + post-FIRE decumulation):** FinTech Domain Analyst validates, Full-Stack+Frontend build.
- **Tier 3 — adjacent personas (later):** freelancer → NRI → HUF.

Security/DevOps/QA stay primary around redeploys; FinTech Analyst always-on for calc/tax code.
Update on stage change (rule 27). Full narrative: `docs/rules-history.md`.

## Router (task signal → role → dispatch)

| If the task is… | Role | Dispatch (in order) |
|---|---|---|
| Design a system/feature before building | **Systems Architect** | `/strategic-architect` or `/brainstorm` → `feature-dev:code-architect` → `/writing-plans` → ADR via `/adr` |
| Build a complete production-ready feature/app | **Full-Stack Engineer** | `/implement` or `/section-development-workflow` → `feature-dev:code-architect`; verify with `/auto-verify` |
| Understand code, then refactor it | **Senior Engineer** | `feature-dev:code-explorer` or `/zoom-out` → `/improve-codebase-architecture` |
| Investigate a bug / prod issue | **Debugging Engineer** | `/systematic-debugging` → `/fix-loop` → `/debugging-loop`; `debugger-agent`. (Rule 15.) |
| Restructure to clean arch — behavior unchanged | **Clean-Architecture Engineer** | `/improve-codebase-architecture` → `pr-review-toolkit:code-simplifier`; gate `architecture-fitness` |
| Make it faster / lighter / scale | **Performance Engineer** | `/perf-test` (measure FIRST — rule 22) → `vercel:performance-optimizer` |
| Build reusable, accessible, responsive UI components | **Frontend Engineer** | `/ui-ux-pro-max` or `/frontend-design` → `/vue-dev`; a11y via `/a11y-audit` |
| Design the look & feel / improve UI-UX / visual polish / design tokens / SCREEN-STANDARD governance | **UI/UX Design & Design-System** | `/ui-ux-pro-max` · `/frontend-design` → hand spec to Frontend Engineer; a11y via `/a11y-audit`, polish via `/web-quality`. Owns `SCREEN-STANDARD.md` + `tokens.css`/`motion.css` (rule 27 propagation). |
| Review code / coding standards / pre-merge quality gate | **Code Quality / Reviewer** | `code-reviewer-agent` + `pr-review-toolkit:*` → `/code-quality-gate` · `/review-gate` · `/request-code-review`; `quality-gate-evaluator-agent` for larger changes. Rule-29 independent pass — never the author as sole verifier. |
| Provision/operate/tune a database — grants, `pg_hba`, pooling, backups, migration, `EXPLAIN` tuning | **Database Administrator** | `/schema-designer` (if schema work) → `/db-migrate` + `/db-migrate-verify` → `/prisma-orm` → `/pg-query`. NOT schema design — that's Architect. |
| Security audit, threat model, OWASP, auth/PII/secrets review, pre-prod hardening | **Security / DevSecOps Engineer** | `/security-audit` → `security-auditor-agent` → `/supply-chain-audit` → `/change-risk-scoring`. Fires on auth/PII/secrets. |
| Deploy / ship / release — CI/CD, VPS, cutover, rollback, prod incident | **DevOps / Release Engineer** | `/deploy-strategy` → `/ci-cd-setup`; prod issue → `/incident-response` → `/disaster-recovery`; `git-manager-agent` for release commits. Owns the app deploy (DBA owns only the DB). |
| Test strategy, coverage gap, E2E suites, flaky-test triage | **QA / Test Automation Engineer** | `/test-pipeline` · `/e2e-visual-run` · `/iterative-visual-test-pipeline`; `tester-agent`; `/coverage-analysis`; `test-failure-analyzer-agent`. Honors `e2e-*` + rules 24/25/26. |
| Is this financial math correct? calc module, tax FY update, FIRE/SWR assumption | **FinTech Domain Analyst** | `Agent(fintech-domain-analyst)` validates `src/lib/*.ts` + `src/types/assumptions.ts` vs Indian tax law/FIRE research + colocated specs. |
| What to build next / is scope right / good enough to ship / idea → spec | **Product Manager** | `/brainstorm` → `/to-prd`/`/prd-parser` → `goal-creator`. Owns the product call (`decision-authority.md`); portfolio-strategic calls → `TODO(5W):` (L-042). |
| Plan/sequence delivery, tasks/issues, proceed-vs-escalate, SDLC management | **Delivery / Project Manager** | `/writing-plans` → `/plan-to-issues` → `/executing-plans`; `project-manager-agent`; `/status` + `/handover`. Owns proceed-vs-escalate (`decision-authority.md`), backlog momentum (rule 23); stewards `.claude/` + SDLC (`operating-model.md`). |
| Keep users coming back — activation, onboarding, retention loops, lifecycle digests/nudges, churn win-back | **Growth / Lifecycle & Retention Engineer** | `/brainstorm` → `goal-creator` → `/feature-flag` → `/ui-ux-pro-max`. Reuse `src/lib/nudge-engine.ts`. Outbound sends = spend+outward-facing → escalate. |
| Measure it — instrumentation, funnel/cohort metrics, drop-off, A/B experiments | **Data / Analytics & Experimentation Engineer** | `/monitoring-setup` → `/perf-test`; no dedicated skill yet → `/brainstorm` + `goal-creator` for event schema. Privacy-first; what's tracked is `TODO(5W):`. |
| Regulatory/data-protection — India DPDP Act 2023 consent, data-rights, retention, AA-consent | **Privacy / Compliance (DPDP) Engineer** | `/security-audit` → `/change-risk-scoring`; author a checklist via `/writing-skills` at the first comms/AA feature. Distinct from Security/DevSecOps (OWASP) — consent + data-rights. |

## Role mandates (condensed; full prose: `docs/rules-history.md` §engineering-roles.md "Role mandates")

- **Systems Architect** — design a scalable system then the minimal production version; ADR for non-trivial decisions.
- **Full-Stack Engineer** — complete production-ready slice (backend+frontend+tests); no stubs.
- **Senior Engineer** — map the code, then refactor; read before you change.
- **Debugging Engineer** — root-cause first (rule 17), failing test first, then fix.
- **Clean-Architecture Engineer** — separate concerns, reduce coupling; behavior unchanged, tests green.
- **Performance Engineer** — measure before optimizing (rule 22).
- **Frontend Engineer** — accessible/production-ready components implementing the UI/UX spec.
- **UI/UX Design & Design-System** — owns look/feel/interaction design + `SCREEN-STANDARD.md` (rule 27); Frontend implements to spec.
- **Code Quality / Reviewer** — independent standards gate (rule 29); never the author as sole verifier.
- **Database Administrator** — keeps the DB healthy, executes migrations (Architect authors the model), tunes from `EXPLAIN`.
- **Security / DevSecOps Engineer** — threat-models auth/dev-bypass, validates trust-boundary input, scans deps, keeps secrets out of git/logs.
- **DevOps / Release Engineer** — CI/CD, VPS+PM2+nginx, cutover, rollback, incident response; owns post-deploy smoke (`testing-strategy.md`).
- **QA / Test Automation Engineer** — test strategy + green suite; screenshot is UI verdict authority (rules 24/26); owns test placement.
- **FinTech Domain Analyst** — validates correctness vs Indian tax law/FIRE research; catches "runs but math is wrong."
- **Product Manager** — owns WHAT/WHY (DACI Driver); portfolio-strategic calls → `TODO(5W):` (L-042).
- **Delivery / Project Manager** — owns HOW work flows + proceed-vs-escalate (`decision-authority.md`); also stewards `.claude/` + the SDLC (`operating-model.md`).
- **[Tier-1 — DORMANT]** Growth, Data/Analytics, Privacy/DPDP have no active caller yet (YAGNI, rule 21).
- **Growth / Lifecycle & Retention Engineer** — post-signup retention, lifecycle messaging, churn reduction; outbound sends escalate.
- **Data / Analytics & Experimentation Engineer** — funnel/cohort/A-B measurement backbone; privacy-first, tracked scope is `TODO(5W):`.
- **Privacy / Compliance (DPDP) Engineer** — DPDP Act 2023 consent + data-rights; prerequisite for outbound-comms/data-import.

> Deliberately NOT separate roles (fold, don't spawn — reasons: `docs/rules-history.md`): Monetization/Pricing (→5Wealths), UX Researcher+Financial-Education (→Growth+UI/UX), Accessibility (→UI/UX+Frontend), SRE (→DevOps), Technical Writer (→whichever role changes the doc), Integration/Solutions Engineer (→Full-Stack), AI/LLM Engineer (YAGNI), Customer Success/Support (premature).

## Canonical role sequences (how the roles connect + fire order)

Most tasks need ONE role. When a task spans roles, sequence at T0 in dependency order (single-dispatch-level, `agent-orchestration.md`). Recurring chains:

| Trigger | Sequence (→ = then, ∥ = parallel, [ ] = conditional) |
|---|---|
| Feature, math touched | [PM if unclear] → Architect → Full-Stack/Frontend → **FinTech ∥ Code-Quality** (rule 29) → QA → [Security if auth/PII] → **[DevOps=ESCALATE]** |
| Feature, no math | [PM] → Architect → Full-Stack/Frontend → **Code-Quality** (rule 29) → QA → **[DevOps=ESCALATE]** |
| Bug fix | Debugging (root cause) → Full-Stack (fix) → **Code-Quality**; **+FinTech if calc changed** → QA regression |
| Calc/tax-config change | FinTech (validate vs Indian law) → Full-Stack (TDD red-first) → **FinTech ∥ Code-Quality** re-verify → QA |
| Refactor (behaviour unchanged) | Senior/Clean-Arch → **Code-Quality** → QA (tests stay green) |
| UI/UX change | UI/UX Design → Frontend → rules 24/25/26 self-verify → **Code-Quality** |
| Ship / redeploy | QA (green suite) → [Security if touched] → **DevOps=ESCALATE** (one line, recommendation) |

**Hard wiring:** EVERY builder role → Code-Quality before "done" (rule 29), author never sole verifier. ANY `src/lib/*.ts`/`src/types/assumptions.ts` change → FinTech auto-dispatches parallel with Code-Quality, not Abhay-triggered (history: `docs/rules-history.md#rule-29`). Delivery/PM threads every multi-role chain.

## Routing feedback loop (solo-scale; full text `docs/rules-history.md`)

Mis-route → capture via rule-5 machinery (`lessons.md` + `feedback_role_routing_*` memory). Ambiguous: 0 rows → closest role + assumption; 2+ rows → role owning the primary deliverable, runner-up named. Pre-route scan checks `feedback_role_routing_*` at session start.

## Non-negotiables (all roles)

- `claude-behavior.md` gates apply to every role: rules 24/25/26, 15, 17, 20, 23.
- Layer-aware: `src/` (Vue SPA, 5175) + `server/` (Hono/Prisma→Supabase, 3100); `CLAUDE.md` is the SSOT.
- Subagent dispatch is single-level (`agent-orchestration.md`) — orchestrate hand-offs at T0, never from inside a worker.
- Offer a goal contract before finalized-scope implementation (rule 28); maintain the SSOT on every change (rule 27).
- MUST resolve build/defer/cut/scope calls to the goal + LOCKED persona, never local convenience — `goal-anchored-decisions.md` (rule 30).
- MUST converge on intent via `/grill-me`/`/grill-with-docs`/`/brainstorm` when confidence <~95% on a consequential fork — `decision-authority.md`.
- MUST default to deciding reversible/internal work and escalate only gated items in one line — `decision-authority.md`.
- MUST independently reproduce+inspect every dispatched worker's output before accepting — `orchestrator-output-validation.md`.
- T0 is orchestrator; verification is a MANDATORY EDGE on every non-trivial output, firing on blast radius not diff size — `operating-model.md` (R2 role, not R1 persona).

# Rules history — WHY narratives, incidents, dates

Extracted from `.claude/rules/claude-behavior.md` and `.claude/rules/engineering-roles.md` when those
files were compressed to rules + pointers (item 7c, D-2026-09-29-01 row c) to keep the auto-loaded
rule files under the context budget. Every MUST/trigger/number stayed in the source file; only the
prose WHY, worked incidents, and history moved here. Referenced by a one-line pointer at each rule.

## claude-behavior.md

### Rule 12 — Demand Elegance (Balanced)
For non-trivial changes, pause and ask "is there a more elegant way?" If a fix feels hacky:
"Knowing everything I know now, implement the elegant solution." Skip this for simple, obvious
fixes — don't over-engineer. Challenge your own work before presenting it.

### Rule 24 — UI Change Screenshot Verification (full mechanics)
Self-heal step: if the dev server is not running, attempt `npm run dev` in background once before
driving the browser. Drive Playwright MCP: `mcp__playwright__browser_navigate` to the affected
route → `browser_take_screenshot` (visual) → `browser_snapshot` (ARIA tree) →
`browser_console_messages` (browser console). Pass criteria (ALL three MUST hold): (1) the intended
element/copy/styling is visible in the screenshot, (2) the same is present in the ARIA snapshot,
(3) `browser_console_messages` shows no errors/warnings introduced by this change (pre-existing
noise tolerated, document it). Iteration: inspect the specific failing signal and fix the root
cause; max 3 in-loop attempts, on the 3rd delegate to `/fix-loop` (rule 15). Graceful-degradation
wording origin: mirrors the CLAUDE.md system rule *"if you can't test the UI, say so explicitly
rather than claiming success."*

### Rule 25 — UI→DB Persistence Verification (full mechanics)
"Dialog-close, snackbar visibility, and optimistic UI state DO NOT count as persistence" — see
"Why 'dialog closed = success' lies" in `rules/e2e-multi-row-verification.md`. Signal 1 — network
observation: read `mcp__playwright__browser_network_requests` after the action; the mutation MUST
appear with a 2xx response (201 create, 200 update/delete). Signal 2 — independent API confirm:
issue an independent `GET /api/{resource}` (and `/api/{resource}/{id}` if applicable) via `Bash`
with `curl -H "x-dev-bypass: true"` (or `mcp__playwright__browser_evaluate` calling `fetch()`); for
CREATE/UPDATE confirm the row exists with expected field values, for DELETE confirm the row is
absent. Both signals MUST pass — network-only confirms the UI *attempted* the right call, the
independent GET confirms the server actually *persisted* it (catches stale-cache, upsert-on-wrong-
key, silent-422 failure modes). The multi-row-loop clause exists because of a **documented
historical regression (May 2026 multi-row data-entry incident)**: the first seeded row passed
verification and subsequent rows silently overwrote it — per-iteration verification (not
end-of-loop count) was added as the fix.

### Rule 26 — Post-Test-Phase Independent Verification (full mechanics + why)
**Why:** a test claiming PASS with internal verifications can still leave the post-test state
corrupted, partially rolled back, or visible only at one filter. The **2026-05-21 journey run**
claimed "21 passed" while a concurrent DB outage hid 112 unrun tests; the user observed only 1 of
12 expenses because the default month-filter masked the rest. The independent post-phase sweep is
the trip-wire that surfaces both failure classes — silent-data-loss AND filter-masking — that the
test's own internal verifications cannot catch. This rule extends the rule-25-signal-2 principle
from per-iteration (inside a test) to per-phase (around a test). Trigger: any phase that ran tests,
fix loops, or skills that drove UI forms/dialogs/buttons to write data — also fires after
long-running E2E suites the orchestrator did not author but consumed for verdict. Action (rule-25
signal 2 extended cross-page): for each mutated resource, `curl -H "x-dev-bypass: true" GET
/api/<resource>` and assert count + sample-row substance matches expectation; also check cross-page
consumers — e.g. expenses → `/api/fire/metrics.annualExpenses`,
`/api/fire/expense-coverage.totalAnnualExpenses`, `/api/expenses/summary`,
`/api/financial-health`; investments → `/api/fire/metrics.currentCorpus`,
`/api/investment-reports`; income → `/api/income/summary`, `/api/tax-planning/*`. The full
cross-page consumer map is documented per stage in `docs/NEW-USER-JOURNEY-TEST-PLAN.md` §3 "APIs"
column. Action (rule-24 mirror across screens): drive Playwright MCP to each affected screen +
cross-page consumer route, capture screenshot + ARIA snapshot + console_messages, verify visible
substance matches DB — take care with UI filters that mask data (e.g. `/expenses/track` defaults to
current-month filter; row count there is not total persisted count).

### Rule 29 — Independent Verification after non-trivial implementation
**Why:** author-verifies-own-work has a structural blind spot — **proven 2026-06-01**: thorough
self-verification of the 80CCD(2) feature shipped a HIGH member-lens tax-leak bug + an
uncapped-deduction over-claim that only an independent pass caught (see `.claude/tasks/lessons.md`).
That incident is why rules 24/25/26 + unit/type-check are declared necessary but NOT sufficient.

### Rule 31 — Output Plausibility
The "not a convenient lens" clause references a specific incident: verifying on a non-default lens
once **hid bug #22** (a logic-only change that silently moved the headline FIRE age) — hence the
mandate to verify on the DEFAULT product path/lens a user actually sees.

### Rule 32 — Interactive Functionality
"It renders" vs "it functions" gap is named after the **2026-06-04 "verified" overclaim** — a
screen rendered perfectly in screenshot/ARIA/console checks while every interactive control was
dead, because verification never clicked anything.

### Rule 33 — Independent Test Verification
Directed by Abhay **2026-06-05**. Composes with, and does not replace, rule 26/29 or the
`operating-model.md` supervisor gate — full rule lives in
`.claude/rules/independent-test-verification.md`.

## engineering-roles.md

### Deliberately NOT separate roles (kept lean per `configuration-ssot.md` — fold, don't spawn)
- **Monetization / Pricing** is portfolio-strategic → 5Wealths (`TODO(5W):`, L-042), never a repo role.
- **UX Researcher** + **Financial-Education / Content** fold into Growth + UI/UX Design.
- **Accessibility (a11y)** folds into UI/UX Design + Frontend — the `/a11y-audit` + three-state-render
  mandate already covers it.
- **SRE / Reliability & Observability** folds into DevOps / Release (single-VPS solo scale;
  `/monitoring-setup` + `/incident-response` + `/disaster-recovery` live there) — split out when
  traffic goes multi-node.
- **Technical Writer / Documentation** folds into whichever role makes the change — rule 27 SSOT
  discipline + `docs-manager-agent` + `/documentation-workflow` already enforce per-change docs.
- **Integration / Solutions Engineer** folds into Full-Stack now — split out when the first real
  third-party integration lands (Form16/CAS/Account-Aggregator import, Tier 1 roadmap).
- **AI / LLM Engineer** — no AI feature in product or roadmap; add only if an LLM feature (e.g.
  "explain my plan") is greenlit (YAGNI, rule 21).
- **Customer Success / Support** is premature at current scale — revisit when there's a real
  support load.

### Routing feedback loop (the eval — solo-scale)
Role selection is only as good as its correction signal. Eval here = **capture + adjust**, not
dashboards:
- **Mis-route → capture.** When Abhay corrects a role choice ("that's not a perf problem, it's a
  data bug"), treat it as a routing miss and record it via the **rule-5 machinery** (`lessons.md` +
  a `feedback_role_routing_*` memory) as `wrong-signal→role ⇒ right-signal→role`. Don't re-litigate;
  sharpen the router's task-signal column next time. (Mechanism owned by rule 5 — not duplicated
  here.)
- **Ambiguous match → never freeze.** 0 rows → default to the closest role, state the assumption.
  2+ rows → pick the role owning the PRIMARY deliverable, name the runner-up in one line.
- **Pre-route scan.** At session start (rule 5) check `feedback_role_routing_*` memories before
  routing a similar task.

### Current project stage → default role — full narrative
**Now (production-live, 2026-06-01):** FireKaro is LIVE at https://firekaro.com (Hostinger VPS,
PM2 + nginx → Supabase; Google OAuth working). The v6 backend (Hono/Prisma document API +
ServerAdapter) shipped. Primary target persona is LOCKED: the salaried accumulator, lower-middle to
upper-middle class (age 20–60, ₹2.5L–₹1Cr+ household; not the affluent — D-2026-09-13-02/03)
(`docs/v6-fire-planner-product-plan.md` §9). Focus has shifted from "ship it" to serve that wedge
across their whole FIRE lifecycle (the 5 objectives, §9: set-up · honesty · get-there-faster ·
readiness-to-stop · stay-free-post-FIRE):
- Tier 0 — correctness/honesty (do now): tax-config staleness guard + Monte Carlo confidence bands
  → FinTech Domain Analyst validates, Full-Stack builds.
- Tier 1 — retention + onboarding (obj 0+2): effortless/automated setup (Form16/CAS import) +
  lifecycle digests/nudges + persona onboarding templates → Growth / Lifecycle & Retention leads,
  Frontend + Full-Stack build, Data / Analytics measures, Privacy / Compliance (DPDP) gates any
  user comms.
- Tier 2 — deepen the wedge's later lifecycle (obj 3+4): transition-readiness ("can I stop?", off
  the bridge runway) + post-FIRE decumulation guardrails for our own accumulator → FinTech Domain
  Analyst validates, Full-Stack + Frontend build.
- Tier 3 — adjacent personas (later): freelancer → NRI → HUF.

The Security / DevSecOps, DevOps / Release, and QA / Test Automation roles stay primary around any
redeploy / firekaro.com change. The FinTech Domain Analyst is always-on background validation
whenever calculation or tax-config code is touched. When the stage changes, update the rule block
(rule 27 — the SSOT must not lag the work).

### Role mandates — full prose (condensed to one line each in the router file)
- **Systems Architect** — design a scalable system, then the minimal production version:
  architecture, component structure, data flow, API design, DB schema, caching, then
  implementation. Produce an ADR for non-trivial decisions.
- **Full-Stack Engineer** — deliver a complete, production-ready slice (backend + frontend +
  tests). No stubs left behind; every path works.
- **Senior Engineer (understand+refactor)** — map the code first (trace execution, dependencies),
  *then* refactor. Read before you change.
- **Debugging Engineer** — analyze carefully, think step by step, find the root cause (never a
  band-aid — rule 17), propose a robust fix, write a failing test first.
- **Clean-Architecture Engineer** — separate concerns, increase modularity, reduce coupling;
  behavior unchanged, structure improved (refactor-only commits, tests stay green).
- **Performance Engineer** — find bottlenecks, inefficient logic, unnecessary rendering. Measure
  before optimizing (rule 22) — profiler/benchmark data, not intuition.
- **Frontend Engineer** — reusable + accessible + production-ready components; always handle
  loading states, edge cases, responsive design, accessibility (the three-state render rule).
  Implements the UI/UX Design role's spec in Vue/Vuetify — does not decide the visual design
  itself.
- **UI/UX Design & Design-System** — own the look, feel, and interaction design that the Frontend
  Engineer then builds: visual hierarchy, layout, design tokens (`tokens.css`/`motion.css`),
  component patterns, micro-interactions, accessibility-by-design (`/a11y-audit`), and the living
  `SCREEN-STANDARD.md` governance (approve a pattern → propagate to every conformed screen in the
  same session, rule 27). Also owns "this screen feels off / confusing — improve it" work. The
  split from Frontend Engineer: this role decides *what it should look like and how it behaves*;
  Frontend *implements it to spec*. The role that catches "it works but it's ugly / hard to use."
- **Code Quality / Reviewer** — the independent standards gate (rule 29): review the diff for
  correctness bugs, SOLID/DRY/readability, error-handling, silent failures, type design, and
  security-of-the-change against `code-readability.md` + `design-principles.md` +
  `error-handling.md` + `security-baseline.md`. Author-verifies-own-work has a structural blind
  spot (proven 2026-06-01: a self-verified tax feature still shipped a HIGH leak) — so this runs as
  a separate pass, never the author as sole verifier. Reviews and flags; the fix is owned by
  Debugging/Full-Stack. Distinct from QA (owns *tests passing*) and FinTech Analyst (owns *math
  correctness*) — this owns *code craftsmanship + standards*.
- **Database Administrator** — provision and keep the DB healthy: create databases, roles &
  grants, `pg_hba.conf` / auth methods, connection pooling, backups + restore drills, execute
  migrations (not author the model — that's Architect), and tune from `EXPLAIN`/profiler data
  (rule 22). Owns getting `firekaro_v6` running on the VPS and the old-DB→v6 migration execution.
- **Security / DevSecOps Engineer** — embed security from day one for a finance app holding real
  PII (PAN, salary, family data) under multi-tenant ownership. Threat-model auth + the dev-bypass
  gate (`dev-bypass-auth.md`), validate input at trust boundaries, scan deps, never let secrets
  reach git or logs (`security-baseline.md`, `structured-logging.md`). The OAuth pre-prod task and
  any PII/secrets change route here. Read-heavy analysis; fix via the Debugging/Full-Stack roles.
- **DevOps / Release Engineer** — own everything from green tests to live traffic: CI/CD pipeline,
  the Hostinger Ubuntu VPS (Node + PM2 + nginx → Supabase), firekaro.com cutover (deploy-first-
  flip-last), env/secrets at deploy time, rollback, and prod incident response. The DBA stops at
  the database; this role owns the app process and the edge. Owns post-deploy production
  verification (`testing-strategy.md`): after every deploy/redeploy, run the prod smoke gate
  (Tier 1: `/api/health` + the `SMOKE_TOKEN`-guarded `/api/internal/smoke` round-trip + an
  unauthenticated Playwright render check) BEFORE declaring the release good; smoke fail →
  `/incident-response` + rollback (`DEPLOY.md` §Rollback). Tier-2 authenticated prod UI (dedicated
  test account, session-seeded) is on-demand for significant releases / incident verification —
  NOT every deploy. Prod is smoke + synthetic monitoring only — never the full UI suite, load
  testing, or active pentest on firekaro.com.
- **QA / Test Automation Engineer** — own test strategy and the green suite, not just execution:
  pick the right layer (unit → integration → E2E), close coverage gaps, keep the Playwright suites
  healthy, triage flakes (don't mask them), and enforce the substance-over-shape + per-iteration-
  DB-verify discipline from the `e2e-*` rules. Verdict authority for UI tests is the screenshot
  (rules 24/26). Owns test placement (which environment each test type runs in — pre-merge vs
  post-deploy vs never-on-prod) per `testing-strategy.md`; heavy testing (full UI regression,
  load/stress, active security) is pre-merge against localhost+Supabase, never against live
  firekaro.com.
- **FinTech Domain Analyst** — validate correctness against Indian tax law + FIRE research, not
  code quality: tax regimes (old/new, marginal relief, deduction caps), EPF/VPF/PPF/NPS rules, CII
  indexation, SWR + 4-bucket inflation, variant multipliers. Cross-references
  `indian-financial-context.md` + the calc modules' colocated specs and flags misalignment with
  reasoning. The one role that catches "the code runs but the math is wrong."
- **Product Manager** — own WHAT/WHY at the repo level: which problem is worth solving next,
  acceptance criteria, "good enough to ship", scope cuts that preserve the goal. Make tactical
  product calls — don't ask (DACI Driver, single-point accountable). Route portfolio-strategic
  calls (kill/promote, commercialization, pricing, legal entity) to 5Wealths as `TODO(5W):` per
  L-042. This role exists so product decisions stop bouncing to Abhay daily.
- **Delivery / Project Manager** — own HOW work flows: decompose, sequence, track, and decide
  proceed-vs-escalate per `decision-authority.md`. Keep the task list moving to completion
  (rule 23); commit checkpoints to a feature branch autonomously; escalate only the gated items, in
  one line with a recommended option. Predictable delivery, no comfort-stops. Also the Claude Code
  platform lead / process manager (folded in 2026-06-04): expert in Anthropic Claude Code best
  practices (single-level dispatch — orchestrators run at T0, `agent-orchestration.md`; skill/rule/
  agent structure, `pattern-structure.md`; hooks-for-determinism, `configuration-ssot.md`). Stewards
  the whole `.claude/` framework across this project — keeps rules/skills/agents/hooks coherent,
  non-duplicated, and current; dispatches `skill-author-agent` / `plugin-dev:*` for the actual
  authoring (does not hand-write what those own). Drives the full 10-phase SDLC (communication →
  requirements → feasibility → system-analysis → design → coding → testing → integration →
  implementation → operation+maintenance) by mapping each phase to the right role and orchestrating
  at T0 under the operating-model CEO + verification edge; heavy PRD→prod runs go through
  `project-manager-agent` (the DAG), not a re-implementation. Extends, never replaces,
  `project-manager-agent` / `operating-model.md` / `skill-author-agent`. Automates everything
  reversible; the `decision-authority.md` gates (deploy / spend / DNS / genuine product forks) stay
  escalated.
- **[Tier-1 roadmap — DORMANT]** Growth, Data/Analytics, Privacy/DPDP have no active caller yet — no
  outbound-comms or data-import feature has shipped. They reserve a clean home for Tier-1 work; do
  NOT select them for current Tier-0 correctness/accumulation tasks (YAGNI, rule 21). Activate when
  the retention/comms/import work in the stage block begins.
- **Growth / Lifecycle & Retention Engineer** — own what happens AFTER signup: turn a registered
  user into a returning one. Activation, onboarding completion, habit/retention loops, lifecycle
  messaging (weekly/monthly digest, milestone celebrations, event-triggered nudges, dormant
  win-back), and churn reduction. Builds on the existing `nudge-engine.ts` (generation) by adding
  channels (email/WhatsApp) + triggers + cadence. Folds in lightweight UX-research (where users
  drop) and financial-education content (the trust layer for an unfamiliar FIRE concept) rather
  than spinning those into separate roles. The role that catches "we ship features but nobody comes
  back." Outbound comms touch spend + consent → coordinate with DevOps (sends) + DPDP (consent).
- **Data / Analytics & Experimentation Engineer** — the measurement backbone under Growth and UX:
  instrument events, build activation/funnel/cohort-retention views, find drop-off, run A/B
  experiments to settle UX/growth forks with data not opinion (mirrors rule 22 for product).
  Without this role, retention is unimprovable because it's unmeasured. Strictly privacy-first for
  a finance app — what is collected is a `TODO(5W):` posture decision, not a silent default.
- **Privacy / Compliance (DPDP) Engineer** — own legal data-protection for a finance app holding
  PAN/salary/family data under India's DPDP Act 2023: lawful consent for marketing/comms (the gate
  on the weekly-email/WhatsApp idea), data-rights (access, correction, erasure, portability), data
  minimisation, consent + retention records, and Account-Aggregator consent flows. Distinct from
  Security/DevSecOps (which owns OWASP/threat-model/secrets) — this owns *regulatory* consent and
  user data-rights. The prerequisite, not an afterthought, for any outbound-comms or data-import
  feature.

---
name: new-user-test-skill
description: Autonomously run the New-User Journey E2E with preflight, fix-loop, and self-improving learnings capture. Use when validating the end-to-end new-user happy path from sign-in through FIRE number computation.
triggers:
  - new-user-test-skill
  - new-user journey test
  - run journey test
  - test journey
allowed-tools: "Bash Read Grep Glob Write Edit Skill Agent"
argument-hint: "[max_iterations: N] [--skip-preflight] [--no-wipe] [--no-capture-proof]"
version: "0.2.1"
type: workflow
created: 2026-04-20
---

# New-User Test Skill — Autonomous New-User Happy Path

**Tier:** Standalone workflow skill (leaf). Delegates via `Skill()` to `/fix-loop`, `/systematic-debugging`, and `/learn-n-improve` — these are independent worker skills, not a coordinated sub-orchestration. Per `rules/agent-orchestration.md` §1, genuine multi-agent orchestration belongs in `.claude/agents/`; this skill stays flat to avoid crossing that threshold. MUST NOT dispatch other skills via `Agent()`.

**Input:** `$ARGUMENTS`

---

## 1. Purpose

Run the master journey spec (`e2e/tests/journey/00-new-user-to-fire.spec.ts`) autonomously: preflight the environment, execute via `/fix-loop`, iterate on failures with TDD-first fixes, emit a machine-readable verdict, and append learnings so the next run is smarter than the last.

This skill is the single-button answer to "does the new-user happy path still work end-to-end?" per `docs/NEW-USER-JOURNEY-TEST-PLAN.md`.

---

## 2. The Journey (12 Stages)

The app has no onboarding wizard — sections are independently navigable. The 12 stages below are the recommended sequence for a new user.

| # | Stage | Route |
|---|---|---|
| 0 | Discovery | `/` |
| 1 | Authentication | `/auth/signin` |
| 2 | Dashboard | `/dashboard` |
| 3 | Profile | dialog or `/me` |
| 4 | Income | `/income/salary`, `/income/business`, ... |
| 5 | Expenses | `/expenses/track` |
| 6 | Investments | `/investments/{equity\|debt\|epf\|ppf\|nps}` |
| 7 | Liabilities | `/liabilities/{loans\|credit-cards}` |
| 8 | Insurance | `/insurance` |
| 9 | Tax Planning | `/tax-planning` |
| 10 | Financial Health | `/financial-health/{net-worth\|cash-flow\|...}` |
| 11 | FIRE Goals (planning) | `/fire-goals?tab=planning` |
| 12 | FIRE Payoff (overview) | `/fire-goals` |

**Critical-path invariant:** Stages 4 (Income) + 5 (Expenses) + 6 (Investments) are the minimum viable input for Stage 12 to produce a non-zero, non-mock FIRE number. Stages 7-10 enrich accuracy. Stages 3, 8 are optional. The master spec wires Stages 1, 2, 3, 4, 5, 6, 11, 12 into one `describe` block.

---

## 2.1. Per-Stage Coverage Matrix (from NEW-USER-JOURNEY-TEST-PLAN §3)

Condensed operational table. **Priority:** P0 = blocks happy path, P1 = degrades core experience, P2 = polish. Canonical source: `docs/NEW-USER-JOURNEY-TEST-PLAN.md` §3.

| # | Stage | Routes | APIs | Existing Tests | Gaps | Pri |
|---|---|---|---|---|---|---|
| 0 | Discovery | `/` | none | none (auth assumes `/auth/signin` direct) | Home CTA → signin transition | P2 |
| 1 | Authentication | `/auth/signin` → callback → `/dashboard` | `/api/auth/sign-in/social`, `/api/auth/otp/{send,verify}` | `e2e/tests/auth/01-auth-flows.spec.ts`, `03-profile-completion.spec.ts` | first-time Google OAuth empty-state; dev-bypass header explicit assertion; `?redirect=` preservation | P0 (redirect: P1) |
| 2 | Dashboard | `/dashboard` | `/api/me`, `/api/fire/metrics`, `/api/expenses/summary` | `01-auth-flows.spec.ts` (reachability only) | No empty-state assertion for brand-new user | P0 |
| 3 | Profile | dialog or `/me` | `PUT /api/me`, `/api/profile` | `03-profile-completion.spec.ts` (name only) | age + retirement age + city tier propagation to FIRE calc | P1 |
| 4 | Income (critical) | `/income/salary`, `/income/{business,rental,capital-gains,interest,dividends,other,reports}` | `/api/salary`, `/api/business-income`, `/api/rental-income`, `/api/capital-gains`, `/api/interest-income`, `/api/dividend-income`, `/api/other-income`, `/api/income-sources`, `/api/salary-components`, `/api/salary-history` | `salary/00-data-setup.spec.ts`, `01-navigation.spec.ts`, `25-cross-page-consistency.spec.ts`; `income/00-09`; `10-formula-verification.spec.ts` | (a) Salary UI form (dual-mode falls back to API); (b) multi-source FY aggregation on `/income/reports` | P0 |
| 5 | Expenses (critical) | `/expenses/{track,budgets,recurring,categories,receipts,reports,rules}` | `/api/expenses`, `/api/budgets`, `/api/recurring-expenses`, `/api/expenses-ai`, `/api/expense-rules` | `expenses/00-data-setup.spec.ts`, `01-navigation.spec.ts` | (a) `25-cross-page-consistency.spec.ts` (monthly → annual on FIRE page); (b) budget alert side-effect after expense write | P0 |
| 6 | Investments (critical) | `/investments/{equity,debt,epf,ppf,nps,esop,reports}` | `/api/investments`, `/api/epf`, `/api/ppf`, `/api/nps`, `/api/esop`, `/api/investment-reports`, `/api/banking` | `investments/{00,01,10,25}-*.spec.ts` (21 files) | (a) EPF auto-sync from salary end-to-end; (b) NPS lump-sum + annuity ±1 rupee drift regression | P0 |
| 7 | Liabilities | `/liabilities/{loans,credit-cards,reports}` | `/api/loans`, `/api/credit-cards`, `/api/liabilities`, `/api/liabilities-reports` | `liabilities/{00,01,10,25}-*.spec.ts` | EMI auto-calc principal+rate+tenure; net-worth = assets − liabilities on financial-health | P1 |
| 8 | Insurance | `/insurance` | `/api/insurance` | `insurance/00-data-setup.spec.ts`, `01-navigation.spec.ts` | (a) `25-cross-page-consistency.spec.ts`; (b) HLV coverage-gap regression at E2E | P1 |
| 9 | Tax Planning | `/tax-planning` | `/api/tax-scenarios`, `/api/tax-reports`, `/api/advance-tax` | `tax-planning/{01,10}-*.spec.ts` | (a) `25-cross-page-consistency.spec.ts` (regime → effective tax → take-home → savings → FIRE chain); (b) FY 2025-26 marginal relief edge | P0 |
| 10 | Financial Health | `/financial-health/{net-worth,cash-flow,ratios,score}` | `/api/financial-health` | `financial-health/{00,01,25}-*.spec.ts` | inputs from 4-8 surface in net worth; freedom-score reflects current state | P1 |
| 11 | FIRE Goals planning | `/fire-goals?tab=planning` | `/api/goals`, `/api/withdrawal-strategy` | `fire-goals/{00,01,10}-*.spec.ts` (12 files) | (a) `25-cross-page-consistency.spec.ts` (goal target × corpus → years-to-FIRE); (b) withdrawal strategy switch (4%, Guyton-Klinger, VPW) | P0 |
| 12 | FIRE Payoff | `/fire-goals` (overview) | `/api/fire/{metrics,projections,crossover,expense-coverage,freedom-score,monte-carlo,export}` | Unit: `useFIRE.spec.ts`, `fire-metrics.spec.ts`, `fire-projections.spec.ts`, `monte-carlo.spec.ts`, `fire-crossover.spec.ts`, `freedom-score.spec.ts`, `expense-coverage.spec.ts`; E2E: `fire-goals/10-formula-verification.spec.ts`, `integration/fire-integration.spec.ts` | (a) single end-to-end new-user → FIRE number spec (**closed by master spec**); (b) FIRE number ±1 rupee for exactly-seeded user; (c) projection chart > 0 data points | P0 |

---

## 2.2. Coverage Matrix — Layer × Stage (from NEW-USER-JOURNEY-TEST-PLAN §5)

Use this matrix at verdict time to attribute which layer OWNS coverage for a failing stage. Legend: ✓ exists, ❌ gap, ~ partial, — N/A.

| Stage | Unit | Composable | API/Integ | E2E-section | E2E-cross-page | E2E-journey |
|---|---|---|---|---|---|---|
| 0 Discovery | — | — | — | — | — | — |
| 1 Auth | ✓ | — | ✓ | ✓ | — | ✓ |
| 2 Dashboard | — | — | — | ~ | — | ✓ |
| 3 Profile | — | — | ✓ | ~ | — | ✓ |
| 4 Income | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 Expenses | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| 6 Investments | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 Liabilities | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 8 Insurance | ✓ | ✓ | ✓ | ✓ | ❌ | — |
| 9 Tax Planning | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 10 Fin. Health | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 11 FIRE Goals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12 FIRE Payoff | ✓ | ✓ | ✓ | ✓ | — | ✓ |

**As of 2026-04-21 (v0.3.0 — B1 full-UI whole-app directive):** all 12 user-journey stages MUST be stitched into the master spec AND MUST drive the product's own UI (forms, dialogs, tabs, buttons) rather than bypass it via `page.request.post`. An API-only stitch is not coverage — it tests the backend contract while the frontend forms, validation, state management, and routing go unchecked. Stages 7-10 were added 2026-04-21; UI conversion across all 12 stages is tracked as §2.3 backlog item #6 ("Salary UI form happy-path") expanded to whole-app.

---

## 2.3. Priority Backlog (from NEW-USER-JOURNEY-TEST-PLAN §6)

State as of 2026-04-20. When the skill maps a failure to a backlog item, include the item number in the verdict under `failures[].backlog_ref`.

**P0 — Blocks new-user journey**
1. ✅ Master journey spec — `e2e/tests/journey/00-new-user-to-fire.spec.ts`
2. ✅ Empty-state dashboard — `e2e/tests/dashboard/empty-state.spec.ts`
3. ✅ Expenses cross-page consistency — `e2e/tests/expenses/25-cross-page-consistency.spec.ts`
4. ✅ Tax regime → savings → FIRE chain — `e2e/tests/tax-planning/25-cross-page-consistency.spec.ts` (5/5 green, 4 vacuous on empty data)
5. ✅ FIRE goals cross-page consistency — `e2e/tests/fire-goals/25-cross-page-consistency.spec.ts`
6. ⏸ Salary UI form happy-path — **pending**; would promote API-fallback in `e2e/tests/salary/00-data-setup.spec.ts` to true UI

**P1 — Degrades core experience**
7. ✅ Insurance HLV cross-page — `e2e/tests/insurance/25-cross-page-consistency.spec.ts`
8. ✅ Profile age/retirement-age propagation — commit `76161c2`; `server/routes/profile.ts` + `e2e/tests/integration/profile-fire-propagation.spec.ts` (6/6)
9. ✅ EPF auto-sync E2E — `e2e/tests/integration/salary-epf-sync-e2e.spec.ts` (7/7)
10. ✅ Post-signin redirect preservation — commit `96d34da`; `src/router/auth-redirect.ts` + 14/14 unit tests

**P2 — Polish**
11. ✅ Home CTA → signin — `e2e/tests/home/01-cta.spec.ts` (3/3)
12. ✅ CI dev-bypass header explicit assertion — `e2e/tests/auth/10-dev-bypass-header.spec.ts` (3/3). Caught a real security bug — middleware OR → AND logic in commit `aad0ebe`
13. ✅ NPS ±1 rupee drift regression lock — `server/lib/calculations/nps.ts` + `nps.spec.ts` (15/15, commit `01b703d`)

---

## 2.4. Pre-Existing Failure Triage (from NEW-USER-JOURNEY-TEST-PLAN §7)

Used by the concurrency guard (§5) to explain why a section spec running concurrently is risky. ~114 E2E failures cluster as:

| Cluster | Count | Journey impact | Skill action |
|---|---|---|---|
| family-view | 19 | none (stage out of scope) | park; skill ignores |
| new-features | 18 | unknown — scattered | skill flags if the journey spec trips them |
| edit-salary | 15 | Stage 4 — but **edit**, not first-create | park unless master spec hits |
| financial-year | 14 | multi-FY editing — out of new-user scope | park |
| esop | 10 | Stage 6 advanced; not critical-path | park |

**Decision:** None of the 114 failures sit on the new-user happy path. Master journey spec is the canary. If the master stays green while the 114 stay red, the journey is safe to ship; the 114 are a follow-up backlog.

---

## 2.5. Open Questions (from NEW-USER-JOURNEY-TEST-PLAN §8)

Product-level questions that feed the `request-user-input` next-option (§11) when a failure lacks a clear fix path:

1. Should the master journey spec run in CI on every PR or only nightly? (Current: per-PR, <90s budget.)
2. Should we add `data-testid="journey-stage-N"` markers to landing components per stage, so the master spec doesn't depend on Vuetify selector stability? (Suggestion: yes, per `[screen]-[component]-[element]` convention.)
3. Do we want a guided onboarding wizard if testing reveals drop-off between stages? (Out of scope — product decision.)
4. How to handle GoogleOAuth in CI — dev-bypass only, or stub the OAuth callback? (Current: dev-bypass via `x-dev-bypass` header per `rules/dev-bypass-auth.md`.)

---

## 3. Key Constants

Copied verbatim from `e2e/tests/journey/00-new-user-to-fire.spec.ts` — these drive the expected FIRE math:

```ts
const ANNUAL_SALARY = 2_000_000;                     // ₹20L CTC
const MONTHLY_EXPENSES = 50_000;                      // ₹50K/month
const ANNUAL_EXPENSES = MONTHLY_EXPENSES * 12;        // ₹6L/year
const EQUITY_CORPUS = 1_000_000;                      // ₹10L
const EPF_CORPUS = 500_000;                           // ₹5L
const PPF_CORPUS = 300_000;                           // ₹3L
const TOTAL_CORPUS = EQUITY_CORPUS + EPF_CORPUS + PPF_CORPUS; // ₹18L
const SWR = 0.04;                                     // 4% safe withdrawal rate
const EXPECTED_FIRE_NUMBER = ANNUAL_EXPENSES / SWR;   // ₹1.5Cr
const FY = "2025-26";
```

Helpers: `compareWithTolerance`, `calculateFIRENumber` from `e2e/utils/calculation-helpers.ts`. Envelope unwrap is inline in the spec (`unwrap<T>`).

---

## 4. Pass Criteria

The run is PASSED iff ALL of:

1. All 17 test blocks in the journey describe are green (Stages 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11b, 12, 12a, 12b, 12c, 12d — 12 user-journey stages + 5 sub-stages = 17 `test()` calls after v0.3.0 whole-app expansion).
2. Every data-seeding stage (3–11) MUST drive the product's own UI — forms, dialogs, tabs, buttons — via Playwright interactions. `page.request.post(...)` seeding is FORBIDDEN in data-seeding stages. Assertions may still read via `page.request.get(...)` for precise numeric checks.
3. `/api/fire/metrics.fireNumber` matches `annualExpenses / SWR` within **5% tolerance** (per `rules/e2e-api-verification.md`).
4. `progressPercent` matches `currentCorpus / fireNumber * 100` within **2% tolerance**.
5. Projection, Monte Carlo, freedom score, and expense-coverage endpoints each return non-empty structured payloads.
6. Screenshot evidence is captured under `test-evidence/{run_id}/` (unless `--no-capture-proof`).
7. Wall-clock budget: target <10 min, hard cap 20 min per run. The budget was relaxed from the prior <90s / 180s cap on 2026-04-21 when B1 was chosen — driving 12 salary + 12 expense forms dialogs through the UI is inherently slower than API seeding; the trade-off is authentic coverage of the frontend stack.

---

## 5. Isolation Contract

The spec wipes the dev user's data in `beforeAll` via `cleanup-database.ts` to start from a true zero state. This is destructive. The skill MUST:

- WARN the user if any file under `e2e/tests/{section}/` has been modified in the last 30 minutes (git mtime) — the journey wipe will erase whatever those specs wrote.
- SHOULD run in its own Playwright project OR last in the alphabetical order of `e2e/tests/`.
- MUST NOT run this skill concurrently with a per-section E2E run — the wipe will race.
- `--no-wipe` flag SHOULD skip the `beforeAll` cleanup (sets `JOURNEY_SKIP_WIPE=1`) when the user wants to debug against existing seed data.

---

## 6. Preflight Steps

Ordered checklist. If any step fails, set `result: BLOCKED`, emit verdict, and surface `next_options`.

1. **Ports reachable:** `netstat -ano | grep LISTENING | grep -E ':(5173|3000)\s'` on Windows (primary FIREKaro dev target); `ss -ltn | grep -E ':(5173|3000)\s'` on Unix. Both ports MUST be listening.
2. **`DEV_BYPASS_AUTH=true` set:** grep `.env` for the line. If absent or `false`, set `result: BLOCKED` and point the user at `rules/dev-bypass-auth.md`. Without this, journey API calls fail with 401 before any stage can run.
3. **Prisma client present:** run `npm run db:generate` (idempotent dry regenerate). Non-zero exit = blocked, UNLESS the error is a Windows file-lock EPERM (`rename 'query_engine-*.dll.node.tmp...' -> '...dll.node'`) — that's the running backend holding the file, benign, and step 3.5 below still validates true DB reachability.
3.5. **PostgreSQL reachable (TCP probe):** Parse `host:port` from `DATABASE_URL` in `.env`. Run a ~5s TCP probe:
   - Windows: `powershell -Command "Test-NetConnection -ComputerName <host> -Port <port> -WarningAction SilentlyContinue | Select-Object -ExpandProperty TcpTestSucceeded"` — expect `True`.
   - Unix: `nc -vz -w 5 <host> <port>` — expect exit code 0.
   If TCP is closed (ICMP ping may still succeed when the DB host is up but the Postgres service isn't), set `result: BLOCKED` with `next_options: ["fix-db-connectivity", "switch-to-local-db", "rerun-once-db-is-back"]`. This catches the class of failure surfaced in the 2026-04-24 run where step 3 passed (`db:generate` regenerates the client from schema without network) but Stage 1 failed with `/api/me 401` because Prisma couldn't reach `103.118.16.189:5432`. A TCP probe surfaces the blocker in <2s instead of cascading into a 4s spec-run failure.
4. **Auth storage state present:** `e2e/.auth/user.json` MUST exist. If missing, instruct user to run `/app-login` first.
5. **Evidence directories writable:** `test-results/` and `test-evidence/` MUST be writable. Create if missing.
6. **Learnings loaded:** read `.claude/skills/new-user-test-skill/learnings.md` and scan for prior `## Fix Recipes That Worked` entries matching symptoms in the last known run. Surface matched recipes into the fix-loop context.
7. **Concurrency guard:** warn if any section spec file under `e2e/tests/` has git mtime <30 minutes ago (see §5).
8. **Branch clean-enough check:** `git status --short` — record uncommitted files. Not a blocker, but captured in the verdict so a failed run can be attributed.

---

## 7. Execution Flow

### Step 1 — Preflight

Run §6. If BLOCKED, jump to Step 6 with `result: BLOCKED`.

### Step 2 — Dispatch fix-loop

Before dispatch: if `--no-wipe` is present in `$ARGUMENTS`, the skill MUST set `JOURNEY_SKIP_WIPE=true` in the environment passed to the retest command (so the spec's `beforeAll` honors it). Example retest-command prefix: `JOURNEY_SKIP_WIPE=true npm run test:e2e -- ...`. Without this prefix, the subprocess doesn't inherit the flag and `--no-wipe` becomes a silent no-op (the exact footgun `rules/e2e-documented-flags.md` forbids).

```
Skill("fix-loop", args="retest_command: npm run test:e2e -- e2e/tests/journey/00-new-user-to-fire.spec.ts max_iterations: 8 --strict-gates --capture-proof")
```

The `--capture-proof` flag ensures screenshots land in `test-evidence/{run_id}/screenshots/`. `--strict-gates` forces the fix-loop to fail hard on any gate violation rather than soft-warn.

`--no-capture-proof` on this skill's arguments MUST be forwarded to fix-loop.

### Step 3 — Systematic debugging escalation

If fix-loop returns `result: FAILED` after exhausting iterations:

```
Skill("systematic-debugging", args="failing test: e2e/tests/journey/00-new-user-to-fire.spec.ts | last error: <captured>")
```

This is a one-shot deep diagnosis. Its output feeds the next fix-loop attempt (optional) or the final verdict.

### Step 4 — TDD gate on any code fix

Per `.claude/rules/tdd.md` (red-green-refactor), if fix-loop applies a production-code change to resolve a failure, the skill MUST:

1. Write a focused unit or integration spec that reproduces the symptom — colocated as `*.spec.ts` (e.g., `server/lib/calculations/fire-metrics.spec.ts` for FIRE math bugs, `src/composables/useFIRE.spec.ts` for composable bugs).
2. Confirm the new spec is RED before the fix.
3. Apply the fix.
4. Confirm the new spec is GREEN.
5. Rerun the journey to confirm GREEN.

Skip TDD only when the fix is pure environment (port, DB, auth state) — no production-code change.

### Step 5 — Capture learnings

Append a structured entry to `.claude/skills/new-user-test-skill/learnings.md` under the correct section (see §8). If the pattern is CLAUDE.md-relevant (applies beyond the journey), also append to `.claude/tasks/lessons.md` per `rules/claude-behavior.md` §5.

### Step 6 — Emit verdict

Write `test-results/new-user-test-skill.json` per §10 schema. Print a human-readable summary with the `next_options` list from §9.

---

## 8. Self-Improvement Loop

After every run, regardless of outcome, the skill MUST:

1. **Append learning entry** to `.claude/skills/new-user-test-skill/learnings.md`:
   - `PASSED` with no incidents → `## Fix Recipes That Worked` (entry: "clean run, no changes").
   - Flaky stages (retried ≥1 but passed) → `## Flaky Patterns`.
   - Root-caused failures → `## Common Failure Modes` + `## Fix Recipes That Worked`.
   - Spec vs product drift (schema, selector, route) → `## Spec Drift`.
2. **Cross-post to project lessons** — if the pattern applies beyond this skill (e.g., a rule gap, a missing defensive guard), append to `.claude/tasks/lessons.md` with the date, symptom, and proposed rule change.
3. **Propose rule updates** — if the same symptom appears in ≥2 prior runs, the skill MUST propose (but NOT auto-apply) a new entry to `.claude/rules/*.md`. User approval is mandatory per `rules/claude-behavior.md` §5.

---

## 9. Arguments

| Flag | Default | Description |
|---|---|---|
| `max_iterations: N` | `8` | Hard cap on fix-loop retries. Forwarded to `/fix-loop`. |
| `--skip-preflight` | `false` | Skip §6 checks. Use only when caller has already validated environment. |
| `--no-wipe` | `false` | Sets `JOURNEY_SKIP_WIPE=1` env so `beforeAll` keeps existing seed data. |
| `--no-capture-proof` | `false` | Disables screenshot archive. Forwarded to `/fix-loop`. |

---

## 10. Structured Output Schema

Write `test-results/new-user-test-skill.json` in this exact shape (per `rules/testing.md` — `result` is the canonical gate field):

```json
{
  "skill": "new-user-test-skill",
  "timestamp": "2026-04-20T10:30:00Z",
  "run_id": "2026-04-20T10-30-00Z_abc1234",
  "result": "PASSED",
  "summary": { "total": 13, "passed": 13, "failed": 0, "skipped": 0, "flaky": 0 },
  "quality_gate": "PASSED",
  "contract_check": "SKIPPED",
  "perf_baseline": "SKIPPED",
  "warnings": [],
  "gate": "PASSED",
  "artifacts": {
    "evidence_dir": "test-evidence/{run_id}/",
    "verdict_file": "test-results/new-user-test-skill.json"
  },
  "iterations": 1,
  "stages_passed": 13,
  "stages_failed": 0,
  "stages": [
    { "name": "Stage 1: dev-bypass auth", "result": "PASSED", "duration_ms": 420 },
    { "name": "Stage 2: empty dashboard renders", "result": "PASSED", "duration_ms": 1830 }
  ],
  "failures": [],
  "learnings_applied": ["2026-04-12: salary POST uses /api/salary-history not /api/salary"],
  "learnings_captured": [],
  "next_options": ["commit-refresh", "update-test-plan-verification-date", "extend-coverage-to-edge-cases"],
  "duration_ms": 41230
}
```

**Canonical fields** (per `rules/testing.md`): `result`, `summary`, `quality_gate`, `contract_check`, `perf_baseline`, `warnings`.
**Dual-mode fields** (per `rules/agent-orchestration.md` §2): `gate`, `artifacts`.
**Skill-specific extensions:** `iterations`, `stages*`, `failures`, `learnings_*`, `next_options`.

**Result values:** `PASSED` | `FIXED` | `FAILED` | `BLOCKED`.

---

## 11. What's Next (Result Options)

The human-readable summary MUST end with a bulleted "Next" section scoped to the outcome:

### On `PASSED`
- `commit-refresh` — refresh the last-verified date in `docs/NEW-USER-JOURNEY-TEST-PLAN.md`
- `update-test-plan-verification-date` — bump the changelog line to today
- `extend-coverage-to-edge-cases` — add edge-case variants (e.g., ₹0 investments, already-FIRE, ₹0 expenses, FY boundary)
- `promote-to-CI-gate` — (already done as of v1.5; only relevant if the `e2e-journey` job in `.github/workflows/ci.yml` is ever removed)

### On `FIXED` (fix-loop succeeded)
- `commit-fix` — stage and commit the fix with a `fix(journey): ...` conventional message
- `add-regression-unit-test` — enforce §7 Step 4 TDD gate if not already done
- `update-learnings` — confirm the entry in `.claude/skills/new-user-test-skill/learnings.md`
- `rerun-for-flake-check` — run the journey 3x in a row to detect flake

### On `FAILED`
- `escalate-to-systematic-debugging` — dispatch `/systematic-debugging` with the final failure
- `quarantine-stage` — temporarily mark the offending stage as `test.fixme` with a linked issue
- `review-spec-drift` — check if product schema/route has changed vs the spec (see `## Spec Drift` in learnings)
- `request-user-input` — surface the blocker with recommended reads

### On `BLOCKED` (preflight)
- `start-dev-server` — `npm run dev` in a background terminal
- `seed-db` — `npm run db:generate && npm run db:push && npm run db:seed:test`
- `reset-auth-state` — delete `e2e/.auth/user.json` and run `/app-login`

---

## 12. Dual-Mode Operation

Per `rules/agent-orchestration.md` §10 this skill MUST support both modes:

| Mode | Trigger | Behavior |
|---|---|---|
| Standalone | User invokes directly | Full lifecycle: preflight → execute → verdict → learnings |
| Dispatched | Parent orchestrator passes `PIPELINE_ID` env | Skip preflight if `--skip-preflight`; skip learnings cross-post to `.claude/tasks/lessons.md` (parent owns that); return verdict contract only |

---

## 13. Failure Propagation

Per `rules/agent-orchestration.md` §3 this skill MUST propagate failures with specifics, not just `FAILED`. The verdict `failures[]` array MUST include per-failure `stage`, `message`, `category` (e.g., `ASSERTION_FAILURE`, `ENV_BLOCKED`, `SCHEMA_DRIFT`), and `iteration` where applicable.

---

## 14. Source of Truth

This skill does NOT re-implement the journey logic. Single sources of truth:

- Test plan: `docs/NEW-USER-JOURNEY-TEST-PLAN.md`
- Spec: `e2e/tests/journey/00-new-user-to-fire.spec.ts`
- Helpers: `e2e/utils/calculation-helpers.ts`
- DB wipe: `e2e/cleanup-database.ts`
- Learnings: `.claude/skills/new-user-test-skill/learnings.md`

---

## 15. Design Rationale (Brainstorm)

Socratic Q&A capturing the design decisions behind this skill. Each entry records the question, the chosen answer, and the rejected alternative — so future editors understand **why** the skill is shaped this way, not just what it does.

**Q1. Why is this skill T2 (sub-orchestrator) and not T3 (leaf worker)?**
Chosen: T2. The skill dispatches `/fix-loop` (T3) and `/systematic-debugging` (skill), and MAY escalate back into `/fix-loop` after diagnosis — that's coordination across ≥2 worker invocations, which is a T2 concern per `rules/agent-orchestration.md` §3.
Rejected: T3 leaf. A leaf calling `/fix-loop` once would work, but couldn't re-dispatch after `/systematic-debugging` — the recovery path would have to bubble up to the caller, adding a tier and violating the 4-tier cap.

**Q2. Why does the skill wipe data by default instead of preserving it?**
Chosen: Wipe via `beforeAll → cleanup-database.ts`. The new-user journey definitionally starts from zero state; seeding residual data from a previous run pollutes the FIRE math and makes `EXPECTED_FIRE_NUMBER = ₹1.5Cr` non-deterministic.
Rejected: Preserve-by-default with `--wipe` opt-in. Would make the skill's verdict depend on whatever the user happened to seed last, defeating the canary purpose.

**Q3. Why `max_iterations: 8` and not 5 or 15?**
Chosen: 8. Journey has 13 test blocks; if each one independently flakes ≤1 time with retry-1, the upper bound of fix attempts before giving up is roughly `ceil(flakes × retries)`. 5 is too tight (a single infra hiccup burns the budget); 15 pushes wall-clock past the 180s hard cap with average-case fix-loop latency (~12s/iter).
Rejected: 5 (too tight), 15 (busts wall-clock cap).

**Q4. Why a local `learnings.md` AND global `lessons.md` instead of just one?**
Chosen: Both, with clear ownership. `learnings.md` is skill-local and holds run-specific fix recipes the skill reads on the NEXT run (Step §6.5 loads recipes into fix-loop context). `lessons.md` is project-wide and captured only when the pattern applies beyond this skill (per `rules/claude-behavior.md` §5).
Rejected: Single global file. Would pollute project lessons with skill-specific fix recipes (e.g., "salary POST uses `/api/salary-history`") that have no general reusability.

**Q5. Why delegate to `/fix-loop` instead of re-implementing the retry loop inline?**
Chosen: Delegate. `/fix-loop` already owns analyze → fix → retest with `max_iterations`, capture-proof, and strict-gate semantics. Re-implementing it would duplicate ~200 lines and diverge from the canonical T3 contract.
Rejected: Inline retry loop. Every skill that retries would reinvent the same primitives; `/fix-loop` exists specifically to prevent that.

**Q6. Why does the skill NOT auto-commit on `FIXED` result?**
Chosen: Manual commit — `FIXED` exposes `commit-fix` in `next_options` but does not execute. Auto-commit would bypass the code review that a human skimming the diff provides, and would entangle the skill with git state (conflict resolution, gpg signing, hook failures) far outside its scope.
Rejected: Auto-commit with `fix(journey): ...` message. Fast but unsafe — a fix that makes the journey green can still be architecturally wrong.

**Q7. Why structured JSON output AND human-readable summary?**
Chosen: Both. Per `rules/testing.md`, `test-results/*.json` is the single contract read by stage-gate aggregators (parent orchestrators, CI). The human summary is for the interactive user running the skill directly. Omitting either breaks a legitimate consumer.
Rejected: JSON only (hostile to interactive use) or prose only (can't be gated programmatically).

**Q8. Why is the TDD gate enforced for code fixes but not env fixes?**
Chosen: Enforce only on production-code changes. `rules/tdd.md` requires red → green → refactor for behavioral changes. Env fixes (port bind, DB missing, stale `e2e/.auth/user.json`) are not behavioral changes; forcing a unit test for "Postgres wasn't running" adds noise and no signal.
Rejected: Universal TDD. Would bloat the suite with tests that re-assert infrastructure invariants already covered by preflight.

**Q9. Why does dual-mode (standalone + dispatched) matter now?**
Chosen: Support both. Per `rules/agent-orchestration.md` §10, workflow-masters must support dispatched mode so a future T1 pipeline orchestrator can invoke this skill as one step in a larger sequence without duplicating lifecycle concerns. Adding it later is a breaking change to the skill's contract.
Rejected: Standalone only. Cheap today, expensive later — any pipeline work would have to fork or wrap the skill.

**Q10. Why a wall-clock budget of 90s target + 180s hard cap?**
Chosen: 90s/180s. The last clean run on `c768e67` (v1.5) was 38.1s for 13/13 green — 90s gives 2.3× headroom for one fix-loop iteration, 180s tolerates two. Beyond that, the cost of blocking a PR check exceeds the value of autonomous recovery, and the skill should surface BLOCKED for human intervention.
Rejected: No cap (pathological runs block CI indefinitely) or 60s cap (legitimate single-iteration recoveries falsely fail).

**Q11. Why `new-user-test-skill` and not `test-journey` or `run-journey`?**
Chosen: `new-user-test-skill` per user request. The name encodes audience ("new user") + purpose ("test") + type ("skill"). `test-journey` was considered and explicitly rejected by the user — "journey" alone is ambiguous (returning-user journeys exist).
Rejected: `test-journey` (ambiguous), `run-journey` (verb-only, doesn't signal test semantics).

**Q12. Why auto-mode execution instead of interactive step-by-step?**
Chosen: Auto-mode. Per user request; the skill is the single-button answer. Interactive prompts would defeat the purpose — a CI invocation can't answer them.
Rejected: Interactive with confirmation gates. Fine for exploration, wrong for a gated canary.

**Q13. Why one-question-at-a-time when ambiguity DOES surface?**
Chosen: Per user explicit rule in `rules/prompt-auto-enhance-rule.md` Clarification Gate. When the skill genuinely cannot resolve an ambiguity from code + preflight + learnings, it emits ONE question with a recommendation in the verdict under `next_options[request-user-input]` — not a multi-question form.
Rejected: Batch all questions up-front. Overwhelms the user and usually most questions are answerable from a single decision ("keep the wipe? yes/no").

---

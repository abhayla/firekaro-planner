# GOAL — Full-lifecycle QA verification & hardening (pre-production gate + post-production verification)

**Type:** Autonomous **QA verify-and-fix** contract (run via `/goal`). Execute end-to-end with **zero
user input** through Phase A; HALT at the deploy gate (deploy is Abhay's). Every decision is pre-made
below — do not pause; make the call the contract specifies and keep going until the Definition of Done
for the current phase is met.

**Owner:** Abhay · **Created:** 2026-06-07 · **Invocation:** `/goal docs/goals/2026-06-07-full-lifecycle-qa-verification.md`

**Role:** Run as the **QA/Test-Automation Lead + Delivery/PM** owning the full release lifecycle —
ensure every feature is properly tested BEFORE production deployment, and independently verify
everything AFTER production deployment.

**Scope:** `src/`, `server/`, `e2e/` — to FIX issues found (the explicit carve-out in
`.claude/rules/must-have-only-focus.md`: testing/hardening/bug-fixing of already-implemented features
of ANY tier is ALLOWED). **NEVER** build a new good-to-have/nice-to-have feature here; **NEVER** touch
`D:\Abhay\VibeCoding\5Wealths\` or `.claude/` rules; **NEVER** change product behaviour except to fix a
genuine defect verification surfaces. **Deploy and rollback are Abhay-gated** (decision-authority) —
this contract never deploys or rolls back autonomously.

---

## 0. Mission

Prove the **entire implemented app is correct, honest, persistent, coherent, accessible, performant,
and secure** through a disciplined QA process, then verify the same in **production after Abhay
deploys** — iterating fixes until every gate is green with **zero assumptions**, full visual evidence,
multi-role sign-off, and context-blind verification.

Three phases with a hard gate between: **Phase A (pre-production, runs now) → DEPLOY GATE (Abhay) →
Phase B (post-production, runs after deploy).** This is a HARDENING + VERIFICATION goal, not a build
goal — it adds no features; it produces a verified-green app, fixes for what verification surfaces, a
release-readiness sign-off, and a post-deploy verification report.

---

## 0.1 WORKTREE ISOLATION (paste FIRST)

> **First action, before §0.2 and any stage. Non-negotiable.** Dedicated worktree, NEW branch off `main`:
> 1. If `root=$(git rev-parse --show-toplevel)` is the primary checkout, run:
>    `git worktree add ../firekaro-goal-qa -b chore/full-lifecycle-qa main` and run EVERY stage from
>    `../firekaro-goal-qa`. Reuse it if it exists (§0.2 makes re-runs idempotent).
> 2. Claim: `export GOAL_RUN_TOKEN=qa-<short-nonce>` → write `.goal-active.lock` with it.
> 3. Release on exit (after last commit OR any halt): `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
> If `git worktree` is unavailable, note it and proceed — never run in the primary checkout.

## 0.2 PREFLIGHT — entry criteria + idempotency (run FIRST after §0.1)

> 1. Read `docs/PROJECT-LOG.md` §1–§2, `docs/comms-go-live-handoff.md` (blockers),
>    `.claude/rules/testing-strategy.md` (WHERE each test runs — the pre/post-prod boundary),
>    `.claude/rules/must-have-only-focus.md` (this goal is the allowed hardening carve-out), and
>    `git log --oneline -15`.
> 2. **ENTRY CRITERIA — bring up the full v6 stack** (real ServerAdapter, not localStorage demo):
>    - `.env.local` at repo root if absent: `VITE_USE_SERVER_ADAPTER=on`,
>      `VITE_API_BASE_URL=http://localhost:3100`, `VITE_DEV_BYPASS=true` (CLAUDE.md "Run the full v6
>      stack locally"). Confirm `server/.env` has a working Supabase `DATABASE_URL` (session pooler) +
>      `DEV_BYPASS_AUTH=true` + `NODE_ENV=development`.
>    - Start `server/` (`npm run dev`, :3100) and root (`npm run dev`, :5175) in background.
>    - Verify the write path: `curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/household`.
>    - If Supabase is unreachable, run on localStorage demo and RECORD that the ServerAdapter/
>      persistence (rule 25) gates ran in demo mode — never silently skip; surface it.
> 3. **Baseline snapshot** before any fix: run the Stage-1 static gates once; snapshot counts so the
>    report shows before→after.
> 4. **Idempotency:** grep before fixing; verify-only what's already correct; record skips in the report.

---

## 1. Context you need (read first)

| Thing | Path | Why |
|---|---|---|
| Test placement SSOT | `.claude/rules/testing-strategy.md` | The pre-prod (full suite, localhost+Supabase) vs post-prod (smoke + Tier-2 non-destructive + synthetic) boundary + the prod smoke tiers + the rollback trigger |
| Verification rules | `.claude/rules/` 24 (render) · 25 (UI→DB) · 26 (cross-page) · 31 (plausibility) · 32 (interactive) · 33 (blind verify); `e2e-api-verification.md`, `e2e-multi-row-verification.md`, `e2e-vuetify-timing.md`, `e2e-vee-validate-forms.md`, `ui-verification.md`, `defensive-coding.md` | The multi-level verification contract |
| Evidence schema | `.claude/rules/testing.md` "Screenshot Proof Archive" | `test-evidence/{run_id}/` manifest + visual-review schema |
| Prod runbook | `docs/DEPLOY.md` §8 (smoke) + §Rollback | Tier-1 smoke commands + rollback steps |
| Kernel + spine | `src/lib/derive.ts`, `src/lib/useFireDerive.ts`, `src/lib/storage-adapter.ts`, `src/stores/household.ts` | Likely fix sites |
| Personas | `src/seeds/` (Sharmas via `seed-persona.ts`, iyers/mehtas/mauryas/empty) | The 5 fixtures |
| Roles | `.claude/rules/engineering-roles.md` | Drive QA + FinTech + Code-Quality + UI/UX + Security, not one pass |

**Gotchas:** both type-checks (root + `server/`) for any `@planner`-shared `src/lib/**` change
(lessons.md 2026-06-05). ServerAdapter has a 1.5s write debounce — wait before the rule-25 GET. The
demo "Try the sample" splash button is **intentionally hidden in server mode** (`Splash.vue` `v-if="!isServerMode"`,
gh #36 — avoid polluting the real account), NOT broken — gh #53 is that it's absent under
`VITE_USE_SERVER_ADAPTER=on`; verify it appears + works in DEMO mode and is correctly absent in server
mode. Default product lens for plausibility = `isFamilyView:false` (rule 31, bug-#22). Port 5175.

## 1.1 HEADED vs HEADLESS execution policy (explicit — MUST follow)

The screenshot is the verdict (rules 24/26). `playwright.config.ts` = `headless: !!process.env.CI`
(headed locally, headless in CI), maximized window. On Windows, **headed scripts MUST be launched via
the PowerShell tool — the Bash tool runs on a virtual/invisible display** (`ui-verification.md`); a
headed run dispatched via Bash renders where it can't be seen and any "watched/verified" claim is then
false — surface it as an invisible-display failure, never claim PASS. The Playwright **MCP here is
configured headless** (`--headless --isolated`) — for watchable headed verification use the headed
scripts (`scripts/verify-persona.mjs` / `scripts/enter-persona-via-ui.mjs`), NOT the headless MCP.

| Stage | Mode | Launcher |
|---|---|---|
| A1 static/unit/integration | headless (no browser) | Bash or PowerShell |
| A2 `npm run test:e2e` (regression gate) | **headless** for the gate verdict (CI-parity) **+ one headed+maximized pass** of the critical flows for human-watch | headed pass via the **PowerShell tool only** |
| A2.5 / A3 / A4 / A5 — new-user journey, functional sweep, interactive, evidence | **headed + maximized**, screenshots preserved | headed scripts via the **PowerShell tool**; NOT the headless MCP |
| B1 prod smoke | headless | Bash or PowerShell |
| B2 Tier-2 prod sweep | headless verdict; MAY spot-watch headed | PowerShell tool |

---

# ===== PHASE A — PRE-PRODUCTION GATE (runs now; localhost:5175 + Supabase) =====

> NEVER run the full suite / load / active-pentest against prod (`testing-strategy.md`). This phase is
> the pre-merge full-suite environment.

## 2. STAGE A1 — Static + unit/integration gates (BOTH trees, fix until green)

**Commands:** root `npm run type-check && npm run test:unit`; `cd server && npm run type-check &&
npm run lint && npm run test:unit` (the DB-gated `planner.integration.spec.ts` RUNS given the preflight DB).
**Acceptance:** type-check 0 both trees; server lint 0; ALL unit + integration green. Fix-loop
(`/fix-loop`; `/systematic-debugging` on unclear root cause or 2+ failed attempts — rule 15) to green.

## 3. STAGE A2 — Full E2E suite (localhost + Supabase, fix until green)

**Command:** `npm run test:e2e` against the running v6 stack. Honor the `e2e-*` rules: per-iteration DB
verify for multi-row inserts; screenshot-as-verdict; hydration-signal waits; vee-validate form driving.
Fix ROOT causes across ALL sibling surfaces (rule 17 + `plan-before-coding.md` consumer map) — never a
one-symptom patch. Flaky → diagnose, don't mask.

## 3.5 STAGE A2.5 — NEW-USER JOURNEY (author the missing spec + exhaustive edge/loophole coverage)

> **First-class surface, not a sub-bullet.** The journey E2E `e2e/tests/journey/` and
> `docs/NEW-USER-JOURNEY-TEST-PLAN.md` referenced by rules/memory **do NOT exist in this repo** (retired
> monorepo). The `new-user-test-skill` SKILL.md is **stale** here (it claims "no onboarding wizard" and
> names retired routes `/auth/signin`, `/income/rental`, `/dashboard`) — **do NOT invoke it as-is** (it
> will block on a missing spec); instead **file an issue** for the stale skill (`bug-filing-and-sibling-audit.md`)
> and AUTHOR a v6 journey spec here. Run this stage HEADED + maximized via PowerShell (§1.1).

**A2.5a — AUTHOR `e2e/tests/journey/00-new-user-to-fire.spec.ts` (v6)** covering, end-to-end against
the REAL v6 UI (honoring `e2e-vee-validate-forms.md` + `e2e-multi-row-verification.md`):

**Entry surfaces**
- Splash **"Start my own plan" / "Begin wizard"** (`Splash.vue` `startMyOwnPlan()`) — the primary new-user
  front door. Risk if untested: onboarding front door unverified.
- **"Try the sample"** — appears + loads Sharmas→dashboard in DEMO mode; correctly ABSENT in server mode
  (gh #36/#53). Risk: chasing a phantom "broken button" or missing the demo-entry regression.
- **"Continue where I left off"** (`Splash.vue` `continuePlan()`, `v-if members.length>0`) — 3-way branch
  (wizardCompleted→dashboard / profileComplete→income / else→profile). Risk: returning user resumes at the wrong step.

**Wizard (the real 6-step GATING questionnaire — profile + 5 gating steps, `Wizard.vue`)**
- Per-step validation / required-gate (`onNext()` blocks while `!profileComplete`). Risk: stuck, or advances invalid.
- Skip path (`onSkip` — gating steps skippable, profile not). Back-to-splash from step 0 (`onBack`).
  Progress-dot jump (`go(idx)`). Go-to-dashboard mid-wizard (only when `profileComplete`). Risk: nav dead-ends / wrong landing.
- Gating-step `commit()` → **feature toggles** (features store). Risk: questionnaire answers don't actually gate routes.
- **Abandon-and-resume / partial completion** (leave at step N, reload). Risk: auto-save + guard mis-routes.

**Router-guard branch matrix (`router/index.ts`) — enumerate each**
- `members.length===0`→splash; `!profileComplete`→wizard/profile; `wizardCompleted` returning-user skips
  splash→dashboard; auth-off→`/login`. Risk: redirect loop or onboarding bypass.

**Auth / dev-bypass — a MANDATORY, ENV-PROVISIONED, NON-DEFERRABLE dev-bypass-OFF sub-run (gh #60)**
- The main preflight runs `VITE_DEV_BYPASS=true`, so the `/login` bounce is NEVER exercised in the main
  pass — "auth gate enforced" would be a **false PASS**. The first run *deferred* this exactly because
  its env had dev-bypass ON — so this contract now **PROVISIONS the env, not just mandates the check**:
- **Sub-run §A2.5d (dedicated, non-deferrable — may NOT be deferred for "env reasons"):** restart the
  stack in **server mode with dev-bypass OFF** (`server/.env` `DEV_BYPASS_AUTH=false`; frontend
  `VITE_USE_SERVER_ADAPTER=on`, `VITE_DEV_BYPASS` unset/false). Then assert: (1) an unauthenticated
  request to a guarded route **bounces to `/login`** (`UnauthenticatedAuthProvider` → guard); (2) the
  `/api/planner/*` endpoints reject unauthenticated calls (401). This is the gate protecting real PII —
  it MUST run, not be marked "deferred to a server-mode run".

**First-login persistence seam (owner-flagged) — part of the §A2.5d sub-run, NON-DEFERRABLE (gh #60)**
- **localStorage→ServerAdapter transition:** there is currently **NO demo→server migration** (`main.ts`
  `hydrateAll()` warms the server cache; `storage-adapter.ts` has no backfill). A user who explored the demo
  then signs in gets a fresh EMPTY server account — demo data orphaned. In §A2.5d, **MUST test this
  transition** (explore-as-demo → sign in → is the data migrated or orphaned?); if migration is
  intentionally absent, **file a Tier-0/HIGH issue + a regression lock** documenting the orphaned-demo-data
  behaviour. (The first run deferred this with the auth sub-run — now non-deferrable.)
- **Migration-on-hydrate / older-shape backfill** (CLAUDE.md): a returning user with a pre-update serialized
  blob must hydrate without crash/field-drop. Risk: silent data loss on upgrade.
- **First-write debounce race:** wizard auto-save firing before the cache warms / before the 1.5s flush. Risk: first profile save lost.

**Tour overlay** — `.tour-overlay` intercepts pointer events on first entry (`ui-verification.md`); dismiss it
before any rule-32 interaction. Risk: every first-entry interactive check silently swallowed.

**A2.5b — EMPTY / PARTIAL / FULL state matrix (dedicated — closes gh #39's UNFINISHED sibling sweep)**
gh #39 (empty-state false-positive: ₹0 user shown "FIRE achieved") is CLOSED but its sibling sweep is
explicitly unfinished. Assert that on EMPTY and PARTIAL (profile-only, or profile+income-no-expenses) data,
**NO** widget shows a false achieved / 100% / on-track / score — sweep every consumer: FIRE headline,
freedom score, goal status, bridge coverage, financial-health, progress %, Coast/Barista chips, crossover
labels. Add a regression lock for the class. Risk if untested: the exact Tier-0 honesty regression repeats.

**A2.5c — other new-user edges:** empty seed (`empty.ts`) vs a brand-new hand-entered household (two distinct
new-user origins — test BOTH); feature-gating for a fresh user (gated routes `/investments/buckets`,
`/fire-goals/stress-test`, `/estate-planning` redirect to `/preferences#pref-section-features` — verify gate,
no leak, no dead nav); catch-all + legacy-alias redirects for a zero-data user (no loop); a11y on splash +
each wizard step + the tour overlay (first a11y contact).

**A2.5 acceptance:** the journey spec is green; the EMPTY/PARTIAL state matrix passes with regression locks;
the dev-bypass-OFF auth path is verified; the first-login transition is tested or filed+locked; headed
evidence archived; FinTech confirms no false-positive headline on zero/partial data.

## 4. STAGE A3 — Multi-level functional sweep (every surface × persona × process)

For EACH of the 8 sections (income, tax-planning, expenses, investments, liabilities, insurance,
financial-health, fire-goals) + FIRE/estate/glossary, across the 5 personas, and for each PROCESS
(onboarding wizard; per-section CRUD add/edit/delete with EVERY field incl. optional, `ui-verification.md`;
scenario what-if; family-view toggle; persona switch; export CSV/JSON/PDF/Excel; login + route guard +
dev-bypass-off), verify the full stack:

1. **Backend/API** (`e2e-api-verification.md`): independent `curl -H "x-dev-bypass: true" GET
   /api/planner/*` + derived endpoints; assert substance, not shape.
2. **UI render** (rule 24): navigate → screenshot → ARIA → console; intended content present, no NEW errors.
3. **UI→DB persistence** (rule 25): ≥1 write per writable section → 2xx network + independent GET shows the row.
4. **Cross-page coherence** (rule 26): the same value agrees across consumers (expenses→FIRE annualExpenses;
   investments→currentCorpus; income→tax).
5. **Interactive functionality** (rule 32): tabs, FY selector, dialogs (open/save/cancel), filters,
   expand/collapse, primary actions each RESPOND (state change / recompute / dialog opens), not merely render.
6. **Three-state render**: each screen's empty / loading / populated / error state (empty-as-completed is a
   known bug class, #39).
7. **Negative / boundary paths**: invalid + boundary + malformed input per form; NaN / division-by-zero
   guards hold (`defensive-coding.md`).
8. **Accessibility**: axe-core / WCAG via `/a11y-audit` per screen.
9. **Responsive + dark mode**: mobile / tablet / desktop breakpoints + theme toggle.

**Completeness bar (decided — do NOT rationalize it down):** the REQUIRED bar is **(a)** every one of
the 9 layers is exercised at least once, AND **(b)** a **targeted cross-product on the highest-risk
cells** — the money-bearing/most-complex sections (investments, tax-planning, fire-goals, income) ×
all 5 personas × the layers that can break per-section (UI→DB, cross-page, interactive, three-state).
The **full 55-cell exhaustive matrix** (all 8 sections × 5 personas × 9 layers) is **explicitly
OPTIONAL** (diminishing returns once the high-risk cells + every layer are covered) — if skipped, say
so in the SUMMARY; do NOT silently report "layers represented" as if the matrix were done.

## 5. STAGE A4 — Plausibility, performance, security

1. **Plausibility** (rule 31): on the DEFAULT product lens (`isFamilyView:false`), headline FIRE
   number/age + savings rate are domain-SANE for every persona (`headline-plausibility.spec.ts` bounds);
   absurd → STOP, root-cause, fix. **FinTech Domain Analyst** validates the end-to-end headline + every
   on-screen number for each persona.
2. **Performance** (synthetic only): Lighthouse / CWV budget on key screens (dashboard, a heavy section,
   tax). Record scores. NO load/stress; nothing against prod.
3. **Security** (Security/DevSecOps lens): auth gate enforced via the **dev-bypass-OFF sub-run** (§A2.5 —
   it CANNOT be tested with `VITE_DEV_BYPASS=true`, so a separate off-run is mandatory or the gate is a
   false PASS); the 3-factor dev-bypass behaves; rate-limit on `/api/auth/*` (429); **DPDP/PII method**:
   confirm the `structured-logging.md` redaction paths actually mask `token`/`session`/`authorization`/
   `whatsappNumber` (not a vacuous "looks clean"), and the comms send-log 90-day PII purge.
4. **Lifecycle / comms subsystem** (shares `derive()`): the `server/src/lib` lifecycle loop +
   `lifecycle-evaluator`/`lifecycle-runner` + the consent-gated send path are exercised (unit + the
   token-guarded `/api/internal/lifecycle/run` dry path) — a `derive()` change can silently break nudges
   (`comms-subsystem.md`). Test-only sends stay fail-closed to Abhay's number (`feedback_whatsapp_test_recipient`).

## 6. STAGE A5 — Visual evidence + multi-role review + blind verification

- **Evidence archive**: screenshot EVERY screen AND every process/state (each tab, dialog
  open/save/cancel, filter, FY switch, empty vs populated) across all 5 personas → `test-evidence/{run_id}/`
  with a manifest (`testing.md` schema).
- **Multi-role visual review**: each screenshot reviewed from MULTIPLE role lenses — UI/UX
  (layout/hierarchy/polish), QA (matches intent), FinTech (numbers shown plausible + correct),
  Accessibility (contrast/keyboard/ARIA). Screenshot is the authoritative UI pass/fail (rules 24/26).
- **Blind verification** (rule 33): every test verdict re-checked by a SEPARATE context-blind agent.
  **Mechanism (operationalized for a `/goal` single-level run):** the run dispatches a fresh agent whose
  prompt contains ONLY the requirements + the raw evidence PATHS (`test-evidence/{run_id}/` screenshots/
  ARIA/console/persisted-data) — NOT this run's narrative or its PASS/FAIL conclusions — judging coverage
  completeness + verdict correctness (`independent-test-verification.md`). The run is never its own
  verifier. Reconcile any dissent before sign-off.

## 7. STAGE A6 — Coverage, traceability, triage

- **Coverage**: run coverage analysis; report it; flag untested surfaces.
- **Traceability matrix**: map each feature + objective 0→4 → the tests covering it; any untested
  feature is a gap (file an issue).
- **Severity triage**: classify every defect. **BLOCKERS must be fixed before the deploy gate**;
  non-blockers → tiered GitHub issues (`bug-filing-and-sibling-audit.md`). No `test.skip`/`xfail` without
  a tracked issue.
- **Test-data isolation (mechanism):** Phase A writes only the dev-bypass user's rows on the Supabase
  `firekaro-planner` project; seed/teardown each spec and `DELETE /api/planner/all` for the dev user at the
  end so the project is left as found. Production user data is NEVER touched. A dedicated test schema/DB
  (vs sharing the project) is a follow-up to note — do not assume one exists.

## 7.5 STAGE A7 — Deep correctness, resilience & security depth (goal-anchored best practices)

> These target the product's core promise (a **correct, honest** FIRE number) + multi-tenant data
> safety — the highest-leverage testing for THIS project. Add the tests; fix what they surface.

**A7.1 — Property-based + metamorphic invariant testing of the financial kernel** (fast-check + vitest,
on `derive.ts`/`fire-math.ts`/`tax.ts`/`withdrawal-strategy.ts`/`epf-vpf.ts`). Generate randomized
valid households and assert INVARIANTS (not single examples): FIRE age/years monotonic non-increasing in
savings rate + in returns; corpus monotonic in contributions; **adding a SIP never delays FIRE**; tax ≤
gross income and ≥ 0; `floor ≤ suggested ≤ ceiling`; pooled household corpus = Σ earners (the #22
lens-coherence invariant); NO `NaN`/`Infinity`/negative-where-impossible for ANY valid input; every
monetary output integer-rounded. Each invariant failure is a Tier-0 honesty bug → fix at root.

**A7.2 — Golden-master headline snapshots per persona** — lock the full `derive()` headline (FIRE age,
number, savings rate, bands) for all 5 personas; any math change that moves a headline must be a
deliberate, reviewed update. Pairs with (does not replace) the `headline-plausibility.spec.ts` sane-bounds gate.

**A7.3 — Multi-tenant isolation / IDOR** — assert user A cannot read or write user B's `/api/planner/*`
(userId comes from the session, never the body — `hono-route-conventions.md`). A tenant leak on PAN/salary
is catastrophic; this is the #1 security test for a multi-tenant finance app. Also: input-validation at the
trust boundary (Zod rejects malformed payloads), rate-limit (429), secrets/PII never in logs.

**A7.4 — Persistence round-trip integrity** — for EVERY entity type, write→read through the ServerAdapter +
household-diff engine and assert deep-equality, including the flagged edge cases: `"Joint"` ownerId (plain
TEXT, no FK), auto-flow rows upsert-by-`(userId,sourceRefId)` with NO duplication, member-orphan reassignment,
all 12 investment subtypes' `subtype_data`, and `expense-history` (the separate key). The diff engine is the
product plan's own "highest-complexity / silent-data-loss" risk.

**A7.5 — Error-injection / resilience** — simulate API 500s, network failure, Supabase pool exhaustion
(`EMAXCONNSESSION` — real incident history), and slow responses; assert graceful degradation per
`defensive-coding.md` (three-state render, safe defaults, no white screen, no `NaN`/`Infinity` reaching the
UI, no unhandled rejection). A crash or NaN on a money screen is a trust killer for the honesty-first persona.

**A7.6 — Mutation testing on the kernel** (Stryker on `src/lib/*` calc modules, periodic — NOT every gate):
inject mutations and confirm the suite KILLS them. Coverage % lies; mutation score is the real proof the
honesty-critical math is protected. Report the score, **THEN CLOSE the survived mutants on the
honesty-critical core — `tax.ts` FIRST** (slabs / surcharge / marginal relief / cess / rebate / regime
selection) **and `fire-math.ts`** — by adding targeted differential/boundary tests until **the tax +
FIRE modules clear a threshold (≥ 85% mutation score, and ZERO survived mutants on the tax-slab /
surcharge / marginal-relief logic)**; re-run Stryker to confirm. **The threshold gate applies ONLY to
the tax + FIRE modules** (the honesty-critical core); the remaining kernel modules
(`epf-vpf` / `withdrawal-strategy` / `esop-tax`) are **report + raise-weak-spots only this pass** (not
threshold-gated — a later follow-up). **Closing the gaps on tax + FIRE is REQUIRED here, not just
reporting** — the first run reported 73% / 98 survived in `tax.ts` and that *was* its DoD, which left
the correctness gaps open (gh #59). On a re-run, the §0.2 preflight skips the already-killed mutants and
closes only the remaining survivors.

**A7.7 — Performance budgets as GATES** (not just recorded scores) — fail if LCP/CLS/TBT or JS bundle size
exceed budget on key screens; add a bundle-size regression check. Serves the friction-free objective.

**A7.8 — Visual-regression baselines** (scoped to key screens: dashboard, FIRE hero, a heavy section,
wizard) via Playwright `toHaveScreenshot` against committed baselines — catches silent UI drift beyond the
per-run evidence sweep. Keep baselines lean to avoid maintenance churn.

**A7.9 — Keyboard-nav + focus-order a11y** (beyond axe, which catches ~40% of WCAG) for the critical flows
(wizard, forms, dialogs): full keyboard operability, visible focus, logical tab order, no traps.

**A7.10 — Flake control + regression-lock discipline** — run E2E with randomized order / `--repeat-each` to
surface flakes before they erode the suite (`testing.md`); and **every defect this goal fixes gets a permanent
catch-test** (the `lessons.md` gate-gap lesson: prose doesn't prevent recurrence — a hook or CI test does).

**Explicitly OUT of scope (goal-anchored / YAGNI):** load/stress testing (solo scale, `testing-strategy.md`),
full cross-browser matrix (chromium-only is sufficient now), chaos engineering, i18n/localization
(single en-IN locale). Adding these would dilute the goal without serving the persona.

## 8. PHASE A EXIT — Release-readiness sign-off

Produce a **RELEASE-READINESS SIGN-OFF** report: all blockers fixed; all A1–A7 gates/layers green
(incl. the A2.5 new-user journey + EMPTY/PARTIAL state matrix + dev-bypass-OFF auth path, and A7
kernel-invariants / tenant-isolation / persistence-integrity / resilience); evidence
archived + multi-role + blind-verified; coverage + traceability + perf + a11y + security + lifecycle
recorded; open non-blockers listed with issue links. **Record the verified build identity** (git SHA +
built bundle hash) in the sign-off so Phase B can prove the *Phase-A-verified* build is what went live.
Commit on `chore/full-lifecycle-qa` (atomic, conventional, Co-Authored-By); do NOT push/merge (Abhay merges).

---

# ===== DEPLOY GATE (HARD — escalation, NOT autonomous) =====

The contract STOPS here and presents the Phase A sign-off. **Production deploy is Abhay's gated
decision** (decision-authority). The contract does NOT deploy. Phase B runs only AFTER Abhay deploys
(re-invoke the contract for Phase B, or run it as a gated continuation).

---

# ===== PHASE B — POST-PRODUCTION VERIFICATION (after Abhay deploys; prod) =====

> **NON-DESTRUCTIVE ONLY** — never create/edit/delete real user data; never touch real users' PII
> (DPDP). Bounded by `testing-strategy.md` (no full suite / load / active-pentest on prod).

## 9. STAGE B1 — Tier-1 smoke (every deploy, automated)

`GET /api/health` + the `SMOKE_TOKEN`-guarded `GET /api/internal/smoke` read round-trip + an
unauthenticated Playwright render of the login page (`DEPLOY.md` §8). All green or → rollback (B4).

## 10. STAGE B2 — "Change is live" + Tier-2 authenticated non-destructive sweep

- **Change-is-live**: confirm the deployed build matches the **Phase-A-recorded git SHA + bundle hash**
  (§8) — proves the *verified* build is what's live, not a stale or different deploy.
- **Tier-2** (dedicated test account, seeded `storageState` session — NEVER a real user's account): drive
  the key screens + NON-DESTRUCTIVE interactions only (tab / FY / expand / filter / dialog-open-then-cancel
  — rule 32). Screenshot + ARIA + console; numbers coherent with the headline (rule 26); no `/login`
  bounces; no console/page errors; no implausible numbers (rule 31).

## 11. STAGE B3 — Synthetic monitoring + blind re-verify

- Confirm uptime + error-rate + the lifecycle cron health; set/confirm an alert (`/monitoring-setup`).
- **Blind re-verify** (rule 33): a context-blind agent re-checks the post-deploy evidence.

## 12. STAGE B4 — Rollback (Abhay-gated trigger)

Any Tier-1/Tier-2 failure → `/incident-response` + surface the failure to Abhay with the rollback
recommendation (`DEPLOY.md` §Rollback). Rollback execution is Abhay-gated; after a rollback, re-run B1–B2.

---

## 13. DEFINITION OF DONE (the full lifecycle)

**Phase A (pre-prod):**
- [ ] Both trees: type-check 0, server lint 0, ALL unit + integration green.
- [ ] Full E2E suite green on localhost + Supabase (headless gate + a headed maximized pass per §1.1); multi-row specs per-iteration + final-render verified.
- [ ] **New-user journey spec authored + green** (A2.5): all entry surfaces (splash/demo/continue), the 6-step gating wizard (validation/skip/back/resume), every router-guard branch, tour overlay; the stale `new-user-test-skill` filed as an issue.
- [ ] **§A2.5d server-mode + dev-bypass-OFF sub-run RAN (non-deferrable, #60):** unauthenticated → `/login` bounce + `/api/planner/*` 401 (auth gate actually enforced); first-login localStorage→ServerAdapter transition tested (or filed Tier-0 + regression-locked if migration is absent).
- [ ] **EMPTY / PARTIAL / FULL state matrix green** with a regression lock closing gh #39's sibling sweep (no false achieved/100%/on-track/score on zero/partial data).
- [ ] A3 meets the §4 completeness bar: **every one of the 9 layers exercised ≥ once** AND the **targeted high-risk cross-product** (investments / tax-planning / fire-goals / income × all 5 personas × the per-section-breakable layers) covered (incl. three-state, negative/boundary, a11y, responsive, dark mode); the full 55-cell matrix is OPTIONAL — if skipped, said so in the SUMMARY; lifecycle/comms subsystem exercised.
- [ ] Plausibility holds for all 5 personas on the default lens; FinTech end-to-end PASS; security pass clean.
- [ ] Lighthouse/CWV + a11y recorded for key screens (budget met or a tracked issue).
- [ ] Every screen + process screenshotted, archived (`test-evidence/{run_id}/`), multi-role-reviewed, blind-verified (rule 33), no dissent outstanding.
- [ ] **Deep-correctness gates (A7) green:** kernel property-based + metamorphic invariants hold; per-persona golden-master headlines locked; multi-tenant IDOR isolation verified; full persistence round-trip integrity; resilience/error-injection graceful (no NaN/white-screen); **tax + FIRE-module survived mutants CLOSED to ≥85% mutation / zero on slab-surcharge-relief logic (#59) — not just reported**; perf budgets enforced as gates; every fixed defect has a permanent regression-lock test.
- [ ] Coverage + traceability matrix reported; all blockers fixed; non-blockers → tiered issues.
- [ ] Zero assumptions; no silent skips ("X SKIPPED because <reason>" surfaced + blocks done).
- [ ] Release-readiness sign-off report written (incl. the **verified build identity** — git SHA + bundle hash); commits on `chore/full-lifecycle-qa`, NOT pushed/merged.

**Deploy gate:** Phase A sign-off presented; deploy is Abhay's (contract halts).

**Phase B (post-prod, after deploy):**
- [ ] Tier-1 smoke green; change confirmed live (matches the Phase-A-recorded SHA/bundle hash); Tier-2 non-destructive sweep green + blind-verified.
- [ ] Synthetic monitoring confirmed; rollback path verified-available (triggered + Abhay-gated on failure).
- [ ] Final post-deploy QA verification report written.

---

## 14. Hard rules for the run

- **Decision-support, never advice; never change product behaviour except to fix a genuine defect.**
- **Root cause, not band-aid** (rule 17): full consumer/surface map before any fix (`plan-before-coding.md`).
- **Both type-checks** on any `@planner`-shared `src/lib/**` change.
- **No silent skips** — surface any gate that couldn't run; it BLOCKS the done claim.
- **Honor `must-have-only-focus.md`** — this is hardening of existing features (allowed); build NO new
  good-to-have/nice-to-have here; file issues for any feature-gap discovered.
- **Pre-prod = localhost+Supabase; post-prod = smoke + Tier-2 non-destructive + synthetic ONLY**
  (`testing-strategy.md`). NEVER full suite / load / active-pentest / destructive CRUD on prod.
- **Deploy + rollback are Abhay-gated** — the contract halts at the deploy gate and only recommends
  rollback; it never executes either.
- Halt only at the deploy gate or on a genuine blocker (missing DB credential with no fallback, OS denial).

# Goal contract — "Quick Number" front door: 10 questions → one honest number → how to get there

**Date:** 2026-08-27 · **Owner:** Abhay (approved the direction 2026-08-27 00:39 IST: "start the implementation automatically using get work done") · **Author:** Fable 5
**Design SSOT:** `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html` (+ `shots/`) · **Coverage SSOT:** `docs/design/2026-08-27-quick-number-gap-hero/COVERAGE-MATRIX.md` · **Reference:** Dezerv video `FbYnFUwdODQ` (transcript + cross-check in `D:\Abhay\Ventures\transcripts\`)
**Execution:** via `/get-work-done` (one contract per stage below; each stage = one PR, CI-gated, independent checker). Stage order is a dependency order — QN-3 and QN-2 are kernel work that QN-1 consumes.

---

## 0. Mission

FireKaro has more rigor than the advisor tool in the reference video on almost every input, but a new
user cannot get a number in 3 minutes, never sees "need / have / gap / do this", cannot drag their
retirement age on the home screen, and is never shown *how* to close the gap. Build the **Quick Number**
front door that does exactly that — with FireKaro's honest math, not the video's sales math — and fix the
one honesty bug found on the way (a house-upgrade goal that silently does not move the FIRE age).

"Done" = every row in `COVERAGE-MATRIX.md` whose Plan column names a stage below is implemented and
verified; a fresh user can go Splash → `/quick` → answer 10 cards → see the Option-C result (one headline
age, need/have/gap/do-this, slider, gut-feel comparison, "how to get there" moves, "why so big", "how we
got this", chart, "what the full planner adds") → "Open full planner" lands them in the existing dashboard
with their answers persisted as real household data; the kernel change is spec-locked; both trees green;
the member-lens sweep passes; rules 24/25/26/29/31/32/33 verified; PROJECT-LOG + SCREEN-STANDARD updated.

**OUT of scope (tracked separately):** portfolio review (fund count, per-fund direct/regular, benchmark
#146, drift #141), InvestmentForm simplification (QN-6, separate contract), production deploy (Abhay's gate).

## 0.1 Worktree isolation · 0.2 Idempotency preflight · 0.3 Progress log
As per `docs/goals/2026-06-10-fire-dashboard-redesign-option-d.md` §0.1–0.3 verbatim (dedicated
worktree `../firekaro-t<id>` per get-work-done; `.goal-active.lock` token; preflight greps for every
file/symbol below before creating it; `docs/goals/.run/quick-number-PROGRESS.md` append-only).

## 1. Context to read first (in this order)
1. `CLAUDE.md` → "Calculations" + `.claude/rules/calculation-modules.md` (kernel spine: `derive.ts`, `fire-math.ts`, `useFireDerive.ts`).
2. `COVERAGE-MATRIX.md` — the checklist. Every stage's acceptance cites its rows.
3. `option-c-merged.html` + `fk-mock.js` — the look, copy and interaction; **the mock math is NOT the spec for numbers** — `derive()` is.
4. `src/lib/derive.ts:440-460` (family-layer corpus — the QN-3 bug), `src/lib/fire-math.ts` (`calculateFamilyLayerCorpus`, `calculateYearsToTarget`, `ContributionSchedule`), `src/lib/lever-catalog.ts` + `lever-impact.ts` + `lever-bands.ts`, `src/components/dashboard/FireHero.vue`, `src/pages/fire-goals/WhatIf.vue` (existing retirement-age lever), `src/pages/Splash.vue`, `src/pages/Wizard.vue` + `src/components/wizard/GatingSteps.ts`, `src/router/index.ts` (onboarding guard), `src/types/household.ts` (`plannedFutureKindSchema`, `Member`, `Investment`, `Liability`), `src/stores/household.ts` (CRUD + auto-flow), `src/lib/runtime-mode.ts` (`isServerMode`).
5. Rules: `goal-anchored-decisions.md`, `output-plausibility-verification.md`, `member-landscape-verification.md`, `testing-strategy.md`, `ui-verification.md`, `.claude/rules/claude-behavior.md` 24/25/26/29/31/32/33.

---

## 2. STAGE QN-3 — Tier-0 honesty fix: `general` planned goals enter the FIRE number  (matrix A11, F1)

**Why first:** smallest, highest-honesty item; QN-2's solver must include it or the "do this" number is optimistic.

**Pre-made decisions (do NOT deviate):**
- `derive.ts` family-layer lump currently sums only `education` + `marriage` kinds (`derive.ts:449-451`). Change: sum **every** `plannedFuture` line (`general` included) as a today-rupee one-shot lump, via `calculateFamilyLayerCorpus` (rename the arg `educationMarriageLumpToday` → `plannedGoalsLumpToday`; keep the "not divided by SWR" semantics — one-shot, not perpetual).
- Do NOT time-phase / PV-discount goals in this stage (the current conservative today-rupee convention stays; a later ADR can revisit). Record this in the ADR-0004 follow-up note in `docs/PROJECT-LOG.md`.
- Member-lens: `general` goals follow the same `ownerId`/lens attribution as education/marriage (`expense-attribution.ts`); household stays the invariant headline (#23/#81).
- Goal-form copy: `PlannedFutureForm.vue` "kind" hint must state that every planned purchase counts toward the FIRE number.

**TDD:** red-first specs in `derive.spec.ts` (a Sharmas variant with a ₹1 Cr `general` goal → FIRE age strictly later; removing it → byte-identical to today's headline), `fire-math.spec.ts` (renamed arg), `headline-plausibility.spec.ts` bound unchanged, `kernel-invariants.property.spec.ts` monotonicity: adding a planned goal never makes FIRE earlier. Mutation: `npx stryker run` on `fire-math.ts` — no new survivors in the changed lines.

**Acceptance:** all specs green both trees; FinTech-analyst review of the change + `fintech-domain-analyst` agent dispatched; dashboard screenshot before/after on Sharmas with a general goal (rule 24/31); rule 26: `/fire-goals/goals` and the dashboard agree on the FIRE age; `docs/PROJECT-LOG.md` entry; closes GitHub issue #165 (filed 2026-08-27).

## 3. STAGE QN-2 — solver + gap hero + slider on the dashboard  (matrix C1–C5, E3, E4, F3)

**Pre-made decisions:**
- New pure module `src/lib/required-contribution.ts`: `requiredMonthlyContributionFor({ snapshot, assumptions, lens, targetAge })` → `{ requiredMonthlyReal, currentMonthlyReal, gapReal, needReal, haveAtTargetReal, paceFireAge, needNominal, swrUsed }`. Implementation = **binary search on the household real monthly contribution** through the existing `derive()` path (NOT a parallel formula) so step-up, bridge/accessibility, horizon-SWR, family layer and lens are all honoured. Tolerance ₹100/month; cap 60 iterations; return `Infinity` when the target is unreachable by 90 (never NaN — rule 31).
- Expose via `useFireDerive.ts` as computed fields; `targetAge` comes from the household's `targetRetirementAge` (existing), overridable by the hero slider (UI-local, non-persisting until "Set as my target" is clicked → persists via the existing store action).
- `FireHero.vue` (Option-D hero, D-2026-06-10-09) gains: **one headline = target age** (replace "You'll FIRE at age N" with "To retire at {target} you'll need ₹X (today's money · ₹Y in {year})"; the current-pace age moves to the demoted annotation exactly as in the mockup), the four tiles (need / have-by-target / gap / **do this**), the retirement-age slider (40–70), the "+3 years → ₹" hint, and the gut-feel line when `ui.quick.guess` is set (QN-1). Confidence band + since-away delta + plan-variance KPI + bridge subline are RETAINED (non-removable honesty surfaces).
- `dashboard-verdict.ts` tone: "short" (gap>0) → amber; "surplus" → green; NaN/no-baseline rule unchanged.
- `WhatIf.vue`'s retirement-age input stays; it and the hero slider read/write the same UI-store field (`ui.whatIfTargetAge`, session-only: explicitly EXCLUDED from the `ui` store's persisted blob and its `watch` list) — one source, no drift (#64 class).

**TDD:** `required-contribution.spec.ts` (Sharmas: solver result re-fed as contribution → `derive()` FIRE age == target ±0; monotone in target age; Infinity case; lens: member view returns the member's individual number per #81 while household stays primary), `FireHero.binding.spec.ts` extended, `headline-plausibility.spec.ts`: required monthly for Sharmas within [₹0, 3× current income].

**Acceptance:** rules 24/32 on `/fire-goals/dashboard` in all 3 lens states with the slider dragged (screenshots 390/1280); rule 26: hero "need" == Goals screen FIRE number ±1; rule 31 flinch: Sharmas "do this" plausible; `e2e/member-lens-sweep.spec.ts` PASS; rule 29 reviewers (code-reviewer + fintech-domain-analyst) clean; SCREEN-STANDARD.md hero section updated naming the mockup as SSOT.

## 4. STAGE QN-1 — the `/quick` express path  (matrix A1–A16, E1, E2, F2)

**Pre-made decisions:**
- Route `/quick` (`meta.layout: "bare"`, no sidebar), page `src/pages/QuickNumber.vue`, components under `src/components/quick/` (`QuickCard.vue`, `LakhInput.vue`, `QuickResult.vue`). Entry: Splash "Start my own plan" → `/quick` (the 7-step wizard becomes "Refine your plan", reachable from the result CTA and the sidebar; the onboarding router guard treats `quickCompleted` as onboarding-complete). Demo "Try the sample" unchanged; every demo-only affordance stays behind `isServerMode()`.
- **Exactly the 10 cards of Option C**, same order, same copy (copy lives in `src/lib/quick-number-copy.ts` so it is testable and one-place): gut-feel · you (age + retire-at) · spend (+ take-home, with the sanity line) · ALL investments (copy names stocks/ETFs/gold/crypto/bonds/plots/second flat; only the home excluded) · monthly investing (names stock buys + both PFs) · spouse investments (toggle) · kids (count + age) · kids' big costs (education, post-grad, weddings) · big purchase (toggle + live delta) · home loan (toggle; EMI, rate, years left). Money in lakh with live ₹ preview; "So far…" strip after card 3.
- **Persistence = real household data, never a side store** (5W principle 2 + the storage invariant): mapping in `src/lib/quick-number.ts` `applyQuickAnswers(household, answers)` → adult member(s) with ages + `targetRetirementAge`; `expenses.avgMonthly`; one salary line for take-home; ONE investment line per person, type `mutual-fund` (equity), label "All investments (quick estimate)", tagged `subtypeData: { quick: true }` (existing Json column — `Investment.source` already exists with a DIFFERENT meaning, 'Direct'/owner-entity id, and MUST NOT be reused); kids as DEPENDENT members with `educationStage` from age; plannedFuture lines: education (kind `education`, targetYear = kids reach 18), post-grad (education, +4), weddings (`marriage`, kids reach 28), big purchase (`general`, targetYear = now+6 unless asked); home loan as a Liability (auto-flows the EMI — so spend must be entered **without** EMI when a loan is present: card 3 copy adapts: "…excluding the home-loan EMI, we add that from the next card" — resolve the double-count explicitly); gut-feel guess + quick metadata in the **`ui` document** (`ui.quick = { guess, completedAt, createdIds }` inside `userUiPrefs.prefs` — schemaless JSON, merged server-side, so NO Prisma migration; `HouseholdConfig` columns are explicit and `server/` is off-limits). Idempotent: re-running quick updates the lines listed in `ui.quick.createdIds` (fallback: the `subtypeData.quick` tag), never duplicates.
- Result screen = `QuickResult.vue` reusing the QN-2 hero + QN-5 levers + the explainer/chart/"full planner adds"/answers cards from Option C. "Open full planner" → `/fire-goals/dashboard`.
- Zod: `quickAnswersSchema` in `src/types/quick-number.ts`; every field optional after age/target/spend (rough is fine); no NaN reaches the UI (rule 31).

**TDD:** `quick-number.spec.ts` (mapping: Amit answers → household → `derive()` headline within sane bounds; idempotency; EMI double-count guard; kids' target years), copy spec (every "total" question contains "ALL" and names stocks + the single exclusion — locks the 2026-08-27 lesson), router guard spec, `storage-invariant.spec.ts` still green. E2E `e2e/quick-number.spec.ts`: Splash → 10 cards (fill EVERY field incl. optional — rule ui-verification) → result → each lever toggled → "Open full planner" → dashboard shows the same need/gap (rule 26); a11y axe on `/quick`.

**Acceptance:** rule 24/25 (write → independent `GET /api/planner/household` in server mode shows the quick lines) / 26 / 32 with screenshots 390/1280 per card + result; rule 31: with Amit's answers the result is within ±10% of the Option-C mock (the mock is simplified; explain any larger divergence in the report — it is expected that the kernel's bridge/tax layers move it); member-lens sweep PASS with `/quick` added to its route list; COVERAGE-MATRIX rows A1–A16 ticked in the report with evidence.

## 5. STAGE QN-4 — explain the defaults + "why so big"  (matrix A12, B1–B3, B5, E5, F4)

**Pre-made decisions:** copy from Option C verbatim into `quick-number-copy.ts` (the 5 "why so big" bullets incl. the 4–6× survey line and the gut-feel echo; the 4-step "how we got this" with live numbers; the assumptions line with the horizon-SWR shown "for a N-yr drawdown"). Rendered on the Quick result AND as a collapsible on the dashboard hero (InfoTip pattern already in `FireHero.vue`). No new settings UI — "every one is editable in the full planner" links to `/preferences#pref-section-*`. Numbers in the copy come from `derive()`/QN-2 outputs, never re-computed in the component.

**Acceptance:** snapshot spec of the explainer with Sharmas; rule 24 screenshot; copy spec asserts the 5 bullets + 4 steps are present and numbers match `derive()` outputs to the rupee.

## 6. STAGE QN-5 — "How to get there" levers  (matrix B4, B6, C6, C7, D2, E6, E7, F6)

**Pre-made decisions:**
- Extend `src/lib/lever-catalog.ts` (not a new module) with: `step-up-10` (sets `householdSavingsStepUpPercent` 10 via ADR-0004 — already supported by the kernel), `delay-3` (target+3), `direct-plans` (a What-If lever value: +0.008 on equity-class returns applied through the existing scenario/lever-value path — `user_assumptions` columns are explicit, so NO new persisted assumption field; "Make this my plan" maps it to the existing `equityReturn` override (+0.8 pp) with a note in the preferences hint. A per-holding regular/direct flag is a separate good-to-have issue), `no-prepay-roll-emi` (available only when a liability exists with rate < expected equity return; effect = a `ContributionSchedule` segment adding the EMI from the loan's end-year — ADR-0004 segments, no kernel change). Existing `trim-expenses` and `save-more` stay.
- Effect metric everywhere = **"less to find"** = Δ(required monthly − current monthly) from QN-2's solver, per lever alone and for the stacked set; stacking = apply levers to the snapshot/assumptions then re-solve (no additive shortcuts).
- The lever card (Option C) lives in `src/components/quick/LeverPicker.vue` and is reused on the dashboard as the body of `AccelerationCard.vue` (replacing the fixed-extra-amount presentation; keep the ranked "biggest win" KPI, now ranked by "less to find").
- Toggled levers update the hero live; persisting a lever = the existing scenario mechanism (`scenarios` store, non-persisting What-If) — "Make this my plan" writes step-up/target into household + assumptions.
- The honesty line under the plan summary ("this is arithmetic; what can go wrong is the monthly amount…") is verbatim.

**TDD:** `lever-catalog.spec.ts` for each new lever (availability rule for no-prepay incl. rate ≥ return → unavailable with the "prepay it" copy; stacked ≠ sum of parts; every lever's "less to find" ≥ 0), `lever-value` no-inert-lever guard (memory `project_lever_value_requires_unassumed_baseline`: assert each lever changes the solver output on Sharmas — a moot lever fails the test), member-lens: levers on the member view use the individual number.

**Acceptance:** rule 24/32: toggle each lever on `/quick` result and dashboard, screenshots; rule 31: Amit with step-up+delay+direct lands in the "clearly doable" band (required within 1.5× current); FinTech-analyst review of the lever semantics; rule 29.

## 7. STAGE QN-6 — InvestmentForm fast-add  (matrix F5) — SEPARATE contract, not this run
Filed as a good-to-have issue; needs Abhay's per-item approval under the focus lock. Not built here.

---

## 8. Verification gates (standing rules — mandate intact)
Rules 24 (screenshot+ARIA+console per screen), 25 (UI→DB dual signal in server mode), 26 (cross-page: `/quick` result ⇄ dashboard ⇄ Goals FIRE number ⇄ `/api/planner/household`), 29 (code-reviewer-agent + fintech-domain-analyst on every stage touching `src/lib`), 31 (flinch on the default lens; headline-plausibility bounds), 32 (exercise every card, toggle, slider, lever), 33 (context-blind re-check of every test verdict), member-landscape sweep (no exceptions), a11y axe. Failure-recovery budget: 3 in-loop attempts → `/fix-loop` → `/systematic-debugging`; never `.skip` without an issue.

## 9. Definition of Done (all MUST be true)
- [ ] COVERAGE-MATRIX rows A1–A16, B1–B6, C1–C7, D2, E1–E7, F1–F4, F6(D2 part) each cite a merged PR + evidence path in the final report; D1/D3–D6/F5 cite their tracking issue.
- [ ] QN-3 merged with the kernel spec + mutation proof; new issue closed.
- [ ] QN-2 solver spec-locked; hero shows one headline age; slider live; `WhatIf` and hero share one field.
- [ ] QN-1: Splash → `/quick` → 10 cards → result → dashboard, persisted as real household data (+ `ui.quick` metadata), idempotent, EMI not double-counted, ZERO Prisma changes; every "total" question copy passes the ALL/stocks/one-exclusion spec.
- [ ] QN-4 explainers render with `derive()` numbers; QN-5 four new levers + "less to find" metric + no-inert-lever guard.
- [ ] Both trees green; `npm run test:e2e` green incl. `e2e/quick-number.spec.ts` and the member-lens sweep with `/quick`; zero new a11y Critical/Serious.
- [ ] SCREEN-STANDARD.md (hero + quick pattern), `docs/PROJECT-LOG.md` (decision + status), README "Running locally" unchanged, CLAUDE.md "Routing" line gains `/quick`.
- [ ] No deploy. Deferred items in `docs/goals/.run/quick-number-DEFERRED.md` with rule + reason.

## 10. Guardrails (hard stops)
- `src/`, `e2e/`, `docs/`, `SCREEN-STANDARD.md`, `CLAUDE.md` (one line) only. Never `server/` — verified 2026-08-27: every new datum this contract needs fits an EXISTING column (`plannedFuture.kind`, `Investment.subtypeData` Json, `Investment.contributionSchedule` Json, `userUiPrefs.prefs` Json, `Member.targetRetirementAge`). If a stage finds otherwise, STOP and file an issue, never `.claude/`, never `5Wealths\`.
- No new npm dependencies. No parallel math: every number on screen comes from `derive()`/`required-contribution.ts`; `fk-mock.js` is never imported.
- Honesty surfaces are non-removable (confidence band, household-primary headline, bridge verdict, "nothing assumed by default" on levers, both today's and nominal shown once).
- Copy principle (2026-08-27): any "total" question says ALL first, names stocks/ETFs/gold/crypto/bonds/property, states the single exclusion.
- Stop only on a hard halt (schema gap, credential, destructive op). Strategic forks → `TODO(5W):`.

## Authorization trail
- 2026-08-26/27: Abhay — capture the video, cross-check vs FireKaro, mockups in HTML first, "use GLOBAL.md", fix the investments copy, "how to achieve FIRE at the planned age is not covered", "write a plan so you don't miss anything… get it reviewed… then start the implementation automatically using get-work-done".
- Focus lock (D-2026-06-07-07): lifted for THIS scope by the 2026-08-27 00:39 directive; QN-6 and the portfolio-review items remain locked.

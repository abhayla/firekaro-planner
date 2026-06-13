# GOAL — Member-model coherence (earner derived from income) + app-wide "Viewing as" member lens

**Type:** Autonomous build contract (run via `/goal`). Execute end-to-end with **zero user input**.
Every design decision is pre-made below — do not pause to ask; make the call the contract specifies
and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-08 · **Scope:** `src/` + `server/` + `e2e/` ONLY
**Invocation:** `/goal docs/goals/2026-06-08-member-model-coherence-and-app-wide-lens.md`
**Source issues:** gh #67 (Phase 1) → gh #66 (Phase 2). Both must-have. **Hard order: Phase 1 fully
green before Phase 2 begins** (Phase 2's lens reads the Phase 1 member model).

---

## 0. Mission

Two coupled must-have fixes to the member/owner data model, in order. **Phase 1 (#67):** stop
treating "earning" as a manual `role` flag — collapse `role` to `"ADULT" | "DEPENDENT"` and DERIVE
earning-status from the presence of **labour income**, eliminating the two-sources-of-truth
contradiction where `derive.ts` gates all income on `role==="EARNER"` (which can silently disagree
with the actual salary data). **Phase 2 (#66):** make the global "Viewing as <member>" dropdown
actually lens the **member-attributable** screens app-wide (income, investments, liabilities,
insurance, tax), while **household-level** screens (expenses, financial-health, fire-goals) stay
household-scoped and clearly say "Whole household". **Done** = earning is derived everywhere with no
`role==="EARNER"` checks left and migration preserves every existing household's FIRE number
unchanged; AND switching member changes every member-attributable screen while the FIRE headline is
provably invariant to member selection. The one non-negotiable outcome: **never reintroduce the
#22/#23 incoherence** (a household FIRE target divided by one earner → absurd FIRE age) — FIRE /
adequacy / expenses stay household-scoped throughout.

---

## 0.1 WORKTREE ISOLATION (first action — non-negotiable)

> **First action of the run, before §0.2 and any stage.** This run MUST execute in a **dedicated git
> worktree**, never the user's primary interactive checkout.
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the user's primary checkout
>    (e.g. `…/firekaro-planner`) rather than an already-dedicated `…/firekaro-goal-*` worktree, create
>    and switch to one before any stage: `git worktree add ../firekaro-goal-member-model -b feat/member-model-coherence-and-lens` and run every stage from there. NEVER run a multi-commit build in the primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` (e.g. `member-model-<nonce>`) and write the lock:
>    `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`. The
>    `.githooks/pre-commit` hook hard-blocks any commit whose token ≠ this lock.
> 3. **Release on exit:** the run's FINAL action (after merge/push OR on any halt/defer) MUST
>    `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`. It is gitignored. If `git worktree`
>    is unavailable, note it and proceed — but still NEVER run in the primary interactive checkout.

---

## 0.2 PREFLIGHT — idempotency · NO duplication (first numbered action)

> **First action after §0.1, before ANY stage. Non-negotiable.** A parallel session may already have
> implemented part of this contract. It must be safe to run at any time without redoing finished work.
>
> 1. **Read the coverage ledger:** `docs/PROJECT-LOG.md` §3 (decisions D-2026-06-08-05 = #66,
>    D-2026-06-08-06 = #67), plus the live issues `gh issue view 67` and `gh issue view 66` (their
>    bodies are the spec), plus `git log --oneline -30` for matching `feat(...)` commits.
> 2. **For every item below, check ledger + actual code + git log before building.** If the code
>    already implements it (grep/read to confirm — e.g. `grep -rn 'role === "EARNER"' src/` already
>    returns nothing → Phase 1 income-gating already migrated), SKIP the build, do a verify-only pass,
>    move on. If partial, build only the delta. If absent, build normally.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> **Maintain an append-only progress log for the entire run. Update it BEFORE moving on from each
> stage/event** (survives a crash/context-out where in-context memory does not).
>
> 1. **Location:** `docs/goals/.run/2026-06-08-member-model-coherence-and-app-wide-lens-PROGRESS.md`
>    (in THIS worktree; `.run/` is gitignored). Read cross-session via `git worktree list` → each
>    worktree's `docs/goals/.run/*-PROGRESS.md`.
> 2. **First line:** slug · branch · worktree · start time (`date "+%Y-%m-%d %H:%M"`) · contract path · one-line mission.
> 3. **Append ≤2-line entries at:** each stage start/done (with gate result); every major DEFECT; every
>    "something not working" EVENT + what you did; each independent-review outcome (concur/dissent);
>    each DEFER/skip; each blocker/halt; the final result.
> 4. **Format:** `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2-line summary>`.
> 5. **At run-end:** AUTO-append each notable error→fix→lesson to `.claude/tasks/lessons.md` (with a
>    gate-gap line; dedup-grep first). PROPOSE (never auto) a "LEARNINGS TO FOLD BACK" section in the
>    committed final report; the run NEVER edits its own contract/skill/rules.
> 6. **Run-end SUMMARY** (final PROGRESS entry + committed report): DONE / PENDING / BLOCKED / NEXT.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| The pure FIRE kernel | `src/lib/derive.ts` | The 3 earner filters (`:91` earners, `:116` lensedEarners, `:189` scopeEarners) + the lens gate (`:102` `applyMemberLens`). BOTH phases edit here. |
| Member type + role schema | `src/types/household.ts` | `memberRoleSchema`, `ADULT_ROLES`, `isAdultRole`, `Member`, `MemberDraft`; `ownerId` on investment(`:232`)/liability(`:348`)/otherIncome(`:142`)/business(`:171`); `insuredPersonId`(`:368`); expenses have **NO** owner (`:407-446`). |
| Member draft / role gating | `src/lib/member-draft.ts` | role→field gating (employmentStatus/salary "earners only"). |
| Role-aware bridge/retirement | `src/lib/{accessibility,eps-pension,gratuity,seed-persona}.ts` | read role/earner; must use derived earning. |
| Pinia store + autoflow + migration | `src/stores/household.ts` | `hydrate()` migration-on-hydrate is where the role→ADULT backfill lives. |
| UI lens wrapper | `src/lib/useFireDerive.ts` | exposes `lensedEarners/Investments/Liabilities/Insurance` + lensed `annualIncome/annualTax/fyTax`; the screens consume these. |
| The control | `src/layouts/AppBar.vue:53-61,128-139` | "Viewing as" v-select → `ui.setViewingMemberId`. |
| UI store | `src/stores/ui.ts` | `viewingMemberId`, `isFamilyView`, `setViewingMemberId`. |
| Plausibility lock | `src/lib/headline-plausibility.spec.ts` | add the FIRE-invariant-to-member-selection assertion here. |
| Server schema + migration | `server/prisma/schema.prisma` (`model Member`, `role`) | Phase-1 `role` column migration + diff engine (`server/src/lib/household-diff.ts`). |

**Gotchas:** run static gates in BOTH trees for `@planner`-shared changes. The localStorage demo
adapter is the default (`VITE_USE_SERVER_ADAPTER` off) → Rule-25 = localStorage round-trip; the #66
"verified in server-adapter mode" DoD item needs a dedicated server-mode sub-run (`.env.local` with
`VITE_USE_SERVER_ADAPTER=on` + `VITE_DEV_BYPASS=true`, server on :3100). FIRE figures call
`derive()` directly in raw isolation can show NaN income (hydration artifact) — verify through the
real stores / UI, not raw kernel calls.

---

## 2. STAGE A — Phase 1 (#67): earner derived from income

**File(s):** `src/types/household.ts`, `src/lib/derive.ts`, `src/lib/member-draft.ts`,
`src/lib/{accessibility,eps-pension,gratuity,seed-persona}.ts`, `src/stores/household.ts`,
UI (`src/components/wizard/ProfileStep.vue`, `src/components/forms/MembersForm.vue`,
`src/pages/profile/Index.vue`, `src/pages/income/Salary.vue`,
`src/components/forms/InsurancePolicyForm.vue`, `src/pages/tax-planning/Index.vue`),
seeds (`src/seeds/{iyers,mauryas,mehtas}.ts` + empty), `server/prisma/schema.prisma` + a migration.
**Keep untouched:** all of Phase 2's lens-consumer screens (Stage B) until Stage A is green; the
FIRE/adequacy math semantics (only the *earner predicate* changes, not the math).

### Pre-made design decisions (do NOT deviate)
1. **New role shape:** `role: "ADULT" | "DEPENDENT"` (collapse `EARNER` + `NON_EARNING_ADULT` → `ADULT`). `DEPENDENT` unchanged. Adult-vs-dependent stays an explicit user choice (NOT derivable).
2. **`isEarning` is DERIVED, never stored/asserted.** One canonical helper (e.g. `isEarningMember(member, household)` in `src/lib/member-draft.ts` or a new `src/lib/member-earning.ts`) is the single source of truth. No manual earner flag anywhere.
3. **"Earning" = LABOUR income only:** `member.salary?.annualCTC > 0` **OR** the member owns an active business (`businesses` with `ownerId === member.id && isOperated && annualProfit > 0`). **Capital income (rental / dividend / interest / other-income) does NOT make an adult an earner** — those are owned by an adult who may still be non-earning in the retire-from-job sense.
4. **`derive.ts` switches all 3 filters** (`:91`, `:116`, `:189`) from `m.role === "EARNER"` to the derived `isEarning`. Zero `role === "EARNER"` references may remain in `src/` after this stage (`grep -rn 'role === "EARNER"' src/` returns nothing).
5. **Conditional fields:** `targetRetirementAge` + `employmentStatus` render only when `isEarning` (has labour income), not on a user-picked role. A non-earning adult shows no retire-from-job age.
6. **Migration-on-hydrate** (`src/stores/household.ts` hydrate) + **Prisma migration** for `Member.role`: `EARNER → ADULT`, `NON_EARNING_ADULT → ADULT`, `DEPENDENT → DEPENDENT`. Earning is then derived from the data — NO persisted earning flag. Preserve adult/dependent. Backfill is byte-safe: a migrated `EARNER` with salary derives `isEarning=true` (FIRE math unchanged); a migrated `NON_EARNING_ADULT` derives from its income.
7. **Seeds** updated to the new shape (role ADULT/DEPENDENT); the derived earning must reproduce each seed's prior earner set exactly (so the FIRE number is unchanged).

### Stage A acceptance (run the §4 gate sweep before committing)
- `grep -rn 'role === "EARNER"' src/` → empty; earning derived via the one helper everywhere.
- All seed personas' FIRE number/age **unchanged** vs pre-change (lock via `derive.spec.ts` + `useFireDerive.seed.spec.ts` + `headline-plausibility.spec.ts`).
- Migration: a fixture household persisted with old `EARNER`/`NON_EARNING_ADULT` hydrates to `ADULT` with correct derived earning + identical FIRE output (add a migration spec).
- New unit test: `isEarning` true for salary>0 and for active-business owner; false for capital-income-only adult and for ₹0 adult.
- Conditional fields gate on `isEarning` (Rule 24 on ProfileStep/MembersForm/profile).
- Static gates green BOTH trees. **Stage gate sweep:** static → Rule 24 (member/profile/income screens) → Rule 25 (member add/edit persists; role+derived earning correct on round-trip) → Rule 26 (income/tax/FIRE consumers still coherent) → FinTech Domain Analyst sign-off on the earner-predicate change.

---

## 3. STAGE B — Phase 2 (#66): app-wide "Viewing as" member lens

**File(s):** `src/lib/derive.ts` (lens gate + any new lensed outputs for income business/other-income),
`src/lib/useFireDerive.ts`, and the consumer screens — `src/pages/income/{Overview,Salary,Business,OtherSources}.vue`,
`src/pages/investments/{Holdings,Buckets}.vue` (Overview already lenses), `src/pages/liabilities/{Overview,Loans}.vue`,
`src/pages/insurance/{Overview,Policies}.vue`, `src/pages/tax-planning/Index.vue`, plus a shared
"Whole household" indicator for the household-only screens. **Keep untouched (MUST stay household-scoped):**
`src/pages/expenses/*` (no ownerId), `src/pages/financial-health/*`, `src/pages/fire-goals/*` and the
FIRE/adequacy math.

### Pre-made design decisions (do NOT deviate)
1. **"Viewing as" and "Family view" are ORTHOGONAL.** Selecting a member lenses the member-attributable screens regardless of the family-view toggle. Adjust `derive.ts:102` so member lensing keys off `viewingMemberId != null && !isSolo` (decouple from `!isFamilyView`), **but FIRE/adequacy/expenses computation stays household-scoped** (the lens only re-scopes the member-attributable DISPLAY outputs, exactly as today's `lensedScope` vs `householdScope` split — extend, do not break it).
2. **LENS only member-attributable surfaces:** income (salary via `lensedEarners`; business/other-income — add `lensedBusinesses`/`lensedOtherIncome` to `derive()` filtered by `ownerId`, OR filter in-page by `ui.viewingMemberId` against `ownerId` — prefer the derive output for one SSOT), investments (`lensedInvestments`), liabilities (`lensedLiabilities`), insurance (`lensedInsurance`), tax (lensed `annualTax`/`fyTax`). "Joint"-owned records always appear.
3. **DO NOT lens** expenses + financial-health/* + fire-goals/*. When a member is selected, these render a clear **"Whole household"** chip/indicator (a small shared component, e.g. `WholeHouseholdBadge.vue`) so the user knows the screen is intentionally household-scoped — they never silently appear member-scoped.
4. **FIRE number is INVARIANT to member selection** (it's a household figure). This is the honesty guardrail — lock it.
5. The persistent control + indicator copy must make the model legible: member lens = "viewing one person's slice of the household's income/assets/liabilities/insurance/tax"; everything FIRE stays whole-household.

### Stage B acceptance (run the §4 gate sweep before committing)
- Switching "Viewing as <member>" changes the figures on EVERY member-attributable screen (income, investments incl. Holdings/Buckets, liabilities, insurance, tax) to that member + Joint.
- Expenses / financial-health / fire-goals show "Whole household" when a member is selected and their numbers are unchanged from the household view.
- Kernel test: lensed income / liabilities / insurance collections change under `viewingMemberId` (mirror the existing `lensedInvestments` 11→9 proof on the Sharmas seed).
- `headline-plausibility.spec.ts`: FIRE number/age is **identical** for `viewingMemberId: null` vs any member (invariance lock).
- Verified in **server-adapter mode** (dedicated sub-run, env per §1 gotchas) AND demo mode.
- Static gates green BOTH trees. **Stage gate sweep:** static → Rule 24 (every member-attributable screen + one household-only screen showing the badge) → Rule 25 (no write-path change → may skip with reason) → Rule 26 (the lens is consistent across the member-attributable screens; FIRE invariant across all) → FinTech Domain Analyst sign-off that FIRE stays household-coherent.

---

## 4. Verification gates

> **All 26 rules in `.claude/rules/claude-behavior.md` are operative.** Rules 24, 25, 26 are MANDATORY
> gates at every task AND every stage boundary. Do not skip, soften, or defer the 24/25/26 sweep. They
> are why this contract yields *proven-working*, not *claimed-working*, output. Plus rules 31
> (plausibility — the FIRE number must stay domain-sane and invariant to member selection) + 32
> (exercise the actual control — drive the "Viewing as" dropdown, don't just confirm render) + 33
> (a separate, context-blind agent re-checks every test verdict).

**Rule 24 (per UI screen):** self-heal dev server once → `mcp__playwright__browser_navigate` →
`browser_take_screenshot` → `browser_snapshot` (ARIA) → `browser_console_messages`. Pass = intended
element/values visible + present in ARIA + zero NEW console errors. ≤3 iterations → `/fix-loop` →
`/systematic-debugging`. Graceful degradation: surface "UI verification skipped because <reason>" and
mark `completed (deferred — Rule 24)`, never claim complete.

**Rule 25 (per write path):** dual-signal — UI reflects change AND persistence confirms. **Mode
mechanics:** demo (default) → localStorage round-trip via `mcp__playwright__browser_evaluate` reading
`firekaro-mvp:<userId>:<entityKey>` (per `src/lib/storage-adapter.ts`); server-mode → `curl -H
"x-dev-bypass: true" http://localhost:3100/api/planner/household` after the 1.5s write debounce.
Stage A (member add/edit) is a write path → both signals. Stage B is read-only → may skip Rule 25
with `rule 25 skipped: no write-path change`.

**Rule 26 (always fires):** independent cross-page sweep before marking a stage complete — substance
of every mutated/lensed resource + named consumers. Stage A consumers: `useFireDerive` income/tax +
`/income/*`, `/tax-planning`, FIRE dashboard. Stage B: the member-attributable screens agree under the
lens AND every household screen's FIRE figure is invariant. 3 reconcile cycles → `/systematic-debugging`
→ if unresolved, log DEFERRED with `Rule 26 stage drift`, never silently green.

**Rule 33 (independent test verification):** every Playwright/UI verdict is re-checked by a SEPARATE
context-blind agent given the raw evidence (screenshots/ARIA/console) — not this run's conclusions.

**Rule 15 / 17 / 20 / 23:** failures → `/fix-loop` then `/systematic-debugging` (no ad-hoc retry ×3);
root cause not band-aid; no fake data, surface assumptions; autonomous — keep going through the full
DoD, context-budget anxiety is NOT a stop condition.

**Failure-recovery budget:** per-task ≈15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`)
→ DEFER the task, continue. MCP hang: 3 cycles (wait+retry → close+navigate → kill+restart dev server)
→ DEFER. **Hard halts ONLY:** `npm install` failure; a contract decision contradiction; irrecoverable
build break after the full budget; OS permission denial; missing token. Context budget is NOT a halt —
hand off via a one-line continuation note, never fake-complete.

---

## 5. Commit + push

- **Commit boundaries:** Phase 1 in atomic commits (schema+migration first, then types, then
  derive/helpers, then UI, then seeds); Phase 2 likewise (derive lens output → useFireDerive →
  per-section screens → the household badge). One logical change per commit.
- **Conventional messages**, scope `feat(member-model): …` (Phase 1) and `feat(member-lens): …`
  (Phase 2), each closing with `Closes #67` / `Closes #66` on the final phase commit. Co-author trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Stage explicitly** — name files; NEVER `git add -A` (the working tree carries unrelated untracked
  `docs/goals/*` + `.run/*`). Leave them alone.
- **Branch:** `feat/member-model-coherence-and-lens` (the §0.1 worktree branch). Run the full static
  gate BOTH trees before each commit. Merge `--no-ff` → `main` after the full DoD is green, then push
  `origin`. Never `--no-verify`.

---

## 6. Definition of Done (all MUST be true)

**Phase 1 (#67):**
- [ ] `grep -rn 'role === "EARNER"' src/` returns nothing; earning derived via ONE canonical helper everywhere (derive.ts 3 filters + all role-aware libs).
- [ ] `role` is `"ADULT" | "DEPENDENT"`; `targetRetirementAge`/`employmentStatus` gate on derived `isEarning`.
- [ ] Migration (hydrate + Prisma) maps old roles → ADULT/DEPENDENT and **every seed + a persisted-fixture household keeps its FIRE number/age byte-identical** (locked by specs).
- [ ] New units: `isEarning` true for salary>0 / active-business; false for capital-only & ₹0 adult.

**Phase 2 (#66):**
- [ ] Switching "Viewing as <member>" CHANGES figures on income, investments (Holdings/Buckets), liabilities, insurance, tax screens (member + Joint).
- [ ] Expenses + financial-health/* + fire-goals/* show "Whole household" when a member is selected and are numerically unchanged.
- [ ] FIRE number/age is **invariant** to member selection (locked in `headline-plausibility.spec.ts`).
- [ ] Kernel test: lensed income/liabilities/insurance change under `viewingMemberId`.
- [ ] Verified in BOTH demo and server-adapter mode.

**Static gates:**
- [ ] root `npm run type-check && npm run test:unit` AND `cd server && npm run type-check && npm run lint && npm run test:unit` — all green, no regression. Build succeeds.

**Rule 24 / 25 / 26 / 31 / 32 / 33:** per the §4 mechanics, each phase, with evidence.

**Ship:**
- [ ] Atomic conventional commits pushed to `feat/member-model-coherence-and-lens`, merged `--no-ff` → `main`, pushed `origin`; `Closes #67` + `Closes #66`.
- [ ] Deferrals (if any) in `docs/goals/.run/2026-06-08-member-model-coherence-and-app-wide-lens-DEFERRED.md` with rule status + reason.
- [ ] PROGRESS log maintained throughout (§0.3); a notable lesson appended to `.claude/tasks/lessons.md`; final-report LEARNINGS-TO-FOLD-BACK written; PROJECT-LOG §3 updated with the build outcome.

---

## 7. Final report (required on completion)

Open with a **SUMMARY: DONE / PENDING / BLOCKED / NEXT**. Then: commit SHAs + per-stage gate results;
Rule 24 verdict per screen + PNG paths; Rule 25 verdict (Stage A write paths); Rule 26 cross-page +
FIRE-invariance result; FinTech Domain Analyst verdicts; skipped-as-already-covered list (§0.2); DoD
green/amber/red tally; DEFERRED entries with rule status. Plus **LEARNINGS TO FOLD BACK** (proposals
only — governance edits need Abhay's approval; route per `baked-in-rules.md` §0.3 step 5).

---

## 8. Guardrails (hard stops)

- **`src/` / `server/` / `e2e/` only.** Never write `.claude/` rules from this build run; never write `D:\Abhay\VibeCoding\5Wealths\`.
- **NEVER reintroduce the #22/#23 incoherence** — FIRE / adequacy / expenses stay household-scoped. The member lens only re-scopes member-attributable DISPLAY outputs.
- **One canonical earning-derivation helper** — no duplicated `isEarning` logic.
- **No new dependencies.** **No design reinvention** — reuse `useFireDerive` lensed outputs + existing shared components; extend over inline.
- **Honesty (rule 20):** no synthetic/fake data; surface uncertainty as an explicit assumption.
- **Stop only on a true blocker** (§4 hard-halt list). Context-budget anxiety is NOT a blocker — hand off via a one-line continuation note, never fake-complete.
- **Strategic items are `TODO(5W):` notes**, not handled here.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Scope of this run | gh #67 (Phase 1) + gh #66 (Phase 2), one contract, hard-ordered |
| 2 | #67 "earning" definition | LABOUR income only (salary>0 OR active business); capital income excluded |
| 3 | #67 role shape | `role: "ADULT" \| "DEPENDENT"` + computed `isEarning` (no stored earner flag) |
| 4 | #67 conditional fields | `targetRetirementAge`/`employmentStatus` gate on derived `isEarning` |
| 5 | #67 migration | `EARNER`/`NON_EARNING_ADULT`→`ADULT`, `DEPENDENT` unchanged; earning derived; FIRE byte-identical |
| 6 | #66 Viewing-as ↔ Family-view | orthogonal — member lens applies regardless of family-view toggle |
| 7 | #66 lensed surfaces | income/investments/liabilities/insurance/tax only; "Joint" always visible |
| 8 | #66 household-only surfaces | expenses + financial-health/* + fire-goals/* stay household; show "Whole household" badge |
| 9 | #66 honesty lock | FIRE number invariant to member selection (`headline-plausibility.spec.ts`) |
| 10 | Default persistence mode | demo localStorage for UI sweeps + a dedicated server-adapter sub-run for #66's server-mode DoD |

---

## References (loaded transitively)

- `rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 29, 31, 32, 33
- `rules/tdd-rule.md` — red-green-refactor (both phases are TDD red-first)
- `rules/goal-anchored-decisions.md` + `rules/output-plausibility-verification.md` — honesty / FIRE invariance
- `rules/dev-bypass-auth.md` — `x-dev-bypass: true` for server-mode Rule-25/26 API checks
- `rules/independent-test-verification.md` — rule 33 blind re-check
- `CLAUDE.md` "Cold-start" (derive.ts / storage-adapter.ts / household.ts spine), `rules/financial-year-handling.md`, `rules/family-view-pattern.md` (note: that rule describes the retired multi-user schema — v6 is single-tenant; member lens is display-only)
- gh #67 + gh #66 issue bodies (the per-file spec) ; `docs/PROJECT-LOG.md` §3
- Skills: `/fix-issue`, `/fix-loop`, `/systematic-debugging`, `/auto-verify`, `Agent(fintech-domain-analyst)`, `Agent(code-reviewer-agent)`

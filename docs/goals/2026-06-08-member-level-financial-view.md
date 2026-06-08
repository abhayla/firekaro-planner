# GOAL — Member-level financial view: attributable expenses + individual/household FIRE + Financial-Health lens

**Type:** Autonomous build contract (run via `/goal`). Execute end-to-end with **zero user input**.
Every design decision is pre-made below (grilled & resolved with Abhay 2026-06-08) — do not pause to
ask; make the call the contract specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-08 · **Scope:** `src/` + `server/` + `e2e/` ONLY
**Invocation:** `/goal docs/goals/2026-06-08-member-level-financial-view.md`
**Source issue:** gh #81. **Builds on:** #66 (member display-lens) + #67 (role→ADULT/DEPENDENT + derived
earning) — **both already merged to `main`** (commit `70c5a78`). Hard order: **Phase 1 → 2 → 3.**

---

## 0. Mission

Extend the member ("Viewing as") lens to the screens #66 deliberately left household-scoped, via a
per-member **attribution model**. **Phase 1:** make itemised expenses member-attributable (an `ownerId`
tag → personal / shared / dependents "rings"). **Phase 2:** add a **standalone individual FIRE** number
per adult alongside the household one. **Phase 3:** lens the **Financial Health** screens per member.
**The household figure stays the primary, decision-driving number on every screen + the default view;**
individual numbers are honest, clearly-caveated secondary views. The two non-negotiable outcomes:
(1) **never reintroduce the #22/#23 incoherence** (a household FIRE/target divided by one member →
absurd result) — the household FIRE number stays **invariant to member selection**; (2) **never mix a
member numerator with a household denominator** in any ratio (the #23 / `281b994` trap) — every per-member
ratio is computed same-scope on both sides.

---

## 0.1 WORKTREE ISOLATION (first action — non-negotiable)

> **First action, before §0.2 and any stage.** Run in a **dedicated git worktree**, never the user's
> primary checkout.
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the primary checkout (e.g.
>    `…/firekaro-planner`), create + switch: `git worktree add ../firekaro-goal-member-view -b feat/member-level-financial-view` and run every stage there. NEVER multi-commit in the primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` (e.g. `member-view-<nonce>`) → `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`. The `.githooks/pre-commit` hook hard-blocks any commit whose token ≠ this lock.
> 3. **Release on exit:** final action (after merge/push OR any halt/defer) → `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"` (gitignored). If `git worktree` is unavailable, note it + proceed — but never in the primary checkout.

---

## 0.2 PREFLIGHT — idempotency · NO duplication (first numbered action)

> **First action after §0.1.** A parallel session may have done part of this. Safe to run anytime.
> 1. **Read the ledger:** `docs/PROJECT-LOG.md` §3 (the grill decisions D-2026-06-08-05/19/20 + this scope's entry) + `gh issue view 81` (the spec) + `git log --oneline -30` for matching `feat(member-...)` commits.
> 2. **For every item below, check ledger + actual code + git log before building.** Confirm #66/#67 ARE merged (`grep -rn 'role === "EARNER"' src/` empty; `ownerMatches`/`lensedScope` present in `derive.ts`; `isEarningMember` helper exists). If an item is already implemented, SKIP (verify-only). Build only the delta.
> 3. **Record every skip** in the final report.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> Append-only `docs/goals/.run/2026-06-08-member-level-financial-view-PROGRESS.md` (in THIS worktree; `.run/` gitignored). First line: slug · branch · worktree · start (`date "+%Y-%m-%d %H:%M"`) · contract · mission. Append ≤2-line entries at each stage start/done (gate result), every major DEFECT/EVENT+recovery/DECISION/independent-review outcome/DEFER/blocker/DONE. Format `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2 lines>`. At run-end: AUTO-append notable error→fix→lessons to `.claude/tasks/lessons.md` (gate-gap line, dedup-grep first); PROPOSE a "LEARNINGS TO FOLD BACK" section in the committed report (never auto-edit contract/skill/rules). Run-end SUMMARY: DONE / PENDING / BLOCKED / NEXT.

---

## 1. Context you need (read first)

| Thing | Path | Why |
|---|---|---|
| FIRE kernel + member lens | `src/lib/derive.ts` | `ownerMatches`, `applyMemberLens`, the `lensedScope` vs `householdScope` split (the honesty seam — only DISPLAY fields read lensedScope; all adequacy reads householdScope). Phases 1-2 extend here. |
| Member model (#67) | `src/types/household.ts` (`role: ADULT\|DEPENDENT`), `src/lib/member-draft.ts` / `member-earning.ts` (`isEarningMember`) | role + derived earning; expenses schemas (`recurringExpenseLine`/`plannedFutureLine` — add `ownerId`). |
| `ownerId` pattern | investments(`:232`)/liabilities(`:348`)/otherIncome(`:142`) + `ownerMatches` | the exact pattern Phase 1 expenses reuse: `member id \| "Joint"/"Household"`. |
| UI lens wrapper | `src/lib/useFireDerive.ts` | exposes lensed outputs; add individual-FIRE + lensed-expense outputs. |
| FH screens | `src/pages/financial-health/{NetWorth,Banking,CashFlow,EmergencyFund,HealthScore,Reports}.vue` | each reads `household.data.*`/`fire.*` directly (un-lensed today) — Phase 3 wires the member lens with the same-scope rule. |
| Expense form | `src/components/expenses/ExpenseForm.vue` + recurring/planned pages | add the owner picker. |
| View filter | `src/layouts/AppBar.vue` (`viewingValue`/`memberOptions`) | restrict the filter to Household + adults (hide dependents). |
| Plausibility lock | `src/lib/headline-plausibility.spec.ts` | add: household FIRE invariant to member selection (already present from #66 — extend if needed). |
| Split setting | `src/types/assumptions.ts` | add the configurable household-split % (default 50/50). |
| Server | `server/prisma/schema.prisma` (`RecurringExpenseLine`/`PlannedFutureLine`) + `server/src/lib/household-diff.ts` | Phase-1 `ownerId` columns + migration + diff-engine wiring. |

**Gotchas:** static gates in BOTH trees for `@planner`-shared changes. Default = localStorage demo adapter → Rule-25 = localStorage round-trip; do a dedicated server-adapter sub-run (`.env.local` `VITE_USE_SERVER_ADAPTER=on`+`VITE_DEV_BYPASS=true`, server :3100) to verify persistence of the new `ownerId` + split setting. The lensedScope/householdScope seam in `derive.ts` is the honesty firewall — DISPLAY lenses, adequacy stays household; do NOT cross it.

---

## 2. STAGE A — Phase 1: member-attributable expenses

**Files:** `src/types/household.ts` (add `ownerId` to `recurringExpenseLineSchema` + `plannedFutureLineSchema`), `src/lib/derive.ts` (ring derivation + lensed-expense outputs), `src/components/expenses/ExpenseForm.vue` + `src/pages/expenses/{Recurring,Planned,Overview}.vue` (owner picker + member lens), `src/stores/household.ts` (backfill-on-hydrate + auto-flow owner inheritance), `server/prisma/schema.prisma` + migration + `household-diff.ts`, seeds, specs.

### Pre-made design decisions (do NOT deviate)
1. Add `ownerId: string` to both itemised-expense schemas: `member id | "Household" | "Dependents"`. Default **"Household"**. Backfill existing rows → "Household".
2. **Rings** (one canonical helper): adult-member-owned = personal (1); `"Household"` = shared (2); dependent-member-owned OR `"Dependents"` = dependents (3). Use `role` (#67) to tell adult from dependent.
3. Member lens for expenses = the existing `ownerMatches` (member's own + `"Household"`); consolidated = all. Reuse it; no new path.
4. `expenses.avgMonthly` lump → always Household (un-itemisable).
5. Auto-flow expenses (`auto-loan`/`auto-insurance` recurring) inherit the **source record's `ownerId`** (loan/policy owner). Joint source → "Household".
6. Owner picker (expense form): **Household** (default) · each **adult** (by name) · each **dependent** (by name) · **"Kids (shared)"** → `"Dependents"`. Grouped Household→Adults→Children. Hidden entirely for a solo household.
7. **FIRE + household totals keep using TOTAL household expenses** — the per-member view is display-only (do NOT change what feeds `fireNumber`).

### Stage A acceptance (run the §5 gate sweep before committing)
- Each itemised expense has an owner; entry captures it; backfill = Household; existing households' totals + FIRE byte-identical (lock with seed + `headline-plausibility` specs).
- Expenses screen: member filter shows personal + Household; consolidated shows all (kernel test mirroring the `lensedInvestments` proof).
- Static green BOTH trees. Sweep: static → Rule 24 (expenses screens + owner picker) → Rule 25 (owner persists, demo + server-mode) → Rule 26 (FIRE/cashflow consumers unchanged) → FinTech sign-off.

## 3. STAGE B — Phase 2: individual + household FIRE (standalone)

**Files:** `src/lib/derive.ts` (individual-FIRE computation), `src/lib/useFireDerive.ts`, `src/types/assumptions.ts` (split %), `src/pages/fire-goals/Dashboard.vue` + the FIRE screens, a new comparison/caveat component, `src/layouts/AppBar.vue` (view-filter membership). **Keep untouched:** the household FIRE math semantics (only ADD an individual computation; do NOT alter the household path).

### Pre-made design decisions (do NOT deviate)
1. **Individual FIRE = standalone** per adult: attributable corpus vs attributable expenses. Expenses = ring 1 (own) + their share of ring 2; **ring 3 EXCLUDED**. Surface the **household − Σ(adults) gap** explicitly (= dependents + unsplit remainder).
2. **One unified "household split" %** in `assumptions` (default **50/50**, configurable) applied to BOTH ring-2 expenses AND `"Joint"` assets/debt. Member-owned corpus/debt → that adult; dependent-owned → household-only. Member income streams (EPS/gratuity/individual NPS annuity) → that adult; joint/rental → split.
3. **Household FIRE stays primary + the gate + the DEFAULT view.** Computed exactly as today (unchanged).
4. **Surfacing:** driven by "Viewing as" — select an adult → that adult's individual FIRE on the FIRE screens; **Whole household (default)** → the household number; select a dependent → N/A (dependents hidden from the filter anyway). Add a **"Household vs each adult + the gap"** comparison card. Prominent caveat on the individual view: *"[Name]'s personal FIRE — funds only their own lifestyle. Excludes the children + half of shared costs. The household FIRE (₹X, age Y) decides when the family can actually stop."*
5. **"Viewing as" filter membership = Household + ALL adults** (earning or not, by `role===ADULT`); **dependents hidden from the filter** (kept in the Phase-1 owner picker). Solo household → no filter. Label the logged-in user "(you)" for orientation. (Note: #66 currently lists ALL members in this filter — this stage MUST restrict it to Household + adults.)
6. **Household FIRE number INVARIANT to member selection** (the honesty lock).

### Stage B acceptance
- Selecting an adult shows their standalone individual FIRE; the gap = household − Σ(adults) renders and equals dependents + remainder.
- `headline-plausibility.spec.ts`: household FIRE/age identical for `viewingMemberId: null` vs any adult (invariance lock). Individual numbers are domain-sane (rule 31).
- Split % configurable; default 50/50; member-owned vs Joint corpus attributed correctly (kernel tests).
- Static green BOTH trees. Sweep: static → Rule 24 (FIRE dashboard + comparison card, household + an adult lens) → Rule 26 (FIRE invariant across all selections) → FinTech sign-off that the household path is unchanged + individual is coherent + caveated.

## 4. STAGE C — Phase 3: Financial Health member lens

**Files:** `src/pages/financial-health/{NetWorth,Banking,CashFlow,EmergencyFund,HealthScore,Reports}.vue`, `src/lib/freedom-score.ts`/`adequacy.ts` (member-scoped score inputs), `src/lib/useFireDerive.ts`.

### Pre-made design decisions (do NOT deviate)
1. Lens these per selected adult: **Net Worth, Banking, Cash Flow, Emergency Fund, Health Score**. Household = default + primary. **Reports** follow the FIRE pattern (household primary + individual when an adult is selected).
2. **IRON RULE — same scope both sides of every ratio.** Member view: member numerator AND member denominator (member income, member expenses, member liquid, member burn, member debt). NEVER member ÷ household (the #23 / `281b994` trap). Cash Flow member view = member income − member expenses(rings 1 + share of 2) − member tax.
3. Emergency Fund (member) = member liquid ÷ member monthly burn × (same target months).
4. **Individual Health Score shown** — strict same-scope composition; insurance-coverage input = that member's `insuredPersonId` policies; **non-earner caveat** ("reflects own income/assets — supported by the household", never "unhealthy"). Household score = default + primary.

### Stage C acceptance
- Each lensed FH screen shows a coherent member version (same-scope), household by default. Kernel/page tests assert no member-÷-household mismatch on any ratio.
- Static green BOTH trees. Sweep: static → Rule 24 (each FH screen, household + an adult, + a non-earner adult for the score caveat) → Rule 26 (every FH ratio same-scope; household figures invariant to selection) → FinTech sign-off (no #23-class mismatch).

---

## 5. Verification gates

> **All 26 rules in `.claude/rules/claude-behavior.md` operative.** Rules 24/25/26 are MANDATORY at every task AND stage boundary — do not skip/soften/defer. Plus 31 (plausibility — individual + household numbers domain-sane; household invariant to selection), 32 (drive the "Viewing as" dropdown — don't just confirm render), 33 (a separate context-blind agent re-checks every UI/test verdict from the raw evidence).

**Rule 24 (per UI screen):** self-heal dev server once → `browser_navigate` → `take_screenshot` → `snapshot` (ARIA) → `console_messages`. Pass = intended values visible + in ARIA + zero NEW console errors. ≤3 iters → `/fix-loop` → `/systematic-debugging`. MCP unavailable after self-heal → "UI verification skipped because <reason>" + `completed (deferred — Rule 24)`.
**Rule 25 (per write path — Phase 1 owner tag + split setting):** dual-signal. Demo: localStorage round-trip via `browser_evaluate` reading `firekaro-mvp:<userId>:<entityKey>`. Server-mode: `curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/household` after the 1.5s debounce. Phases 2/3 are read-only → `rule 25 skipped: no write-path change`.
**Rule 26 (always):** independent cross-page sweep before marking a stage complete — the lensed values are coherent across the member-attributable screens AND every household figure is invariant to member selection. 3 reconcile cycles → `/systematic-debugging` → unresolved → DEFERRED `Rule 26 stage drift`, never silent-green.
**Rule 29 (independent implementation review — MANDATORY, every non-trivial stage):** after a stage is green, this run (the orchestrator) dispatches an INDEPENDENT reviewer in a fresh context — `code-reviewer-agent` on the diff; **ALSO `fintech-domain-analyst` on EVERY stage** (all 3 touch `src/lib/derive.ts` FIRE math and/or `src/types/assumptions.ts` — the split %); `quality-gate-evaluator-agent` for the larger cross-file phases. Adversarial (find the bug, not bless). Act on every blocker/HIGH before the stage commit; track deferred-but-real findings as GitHub Issues, never drop. **The run is NEVER the sole verifier of its own code.**
**Rule 31 (output plausibility — MANDATORY, user-facing values):** every individual + household FIRE/net-worth/health figure must be domain-SANE on the **default lens** ("would the persona flinch?") — STOP + root-cause if off, never accept mechanical-green. Extend `headline-plausibility.spec.ts` with sane-bounds + the household-invariance lock; `fintech-domain-analyst` validates the END-TO-END individual + household numbers, not just engine internals.
**Rule 33:** every Playwright/UI verdict re-checked by a SEPARATE context-blind agent from the raw evidence (note the #66-run MCP-cwd gotcha: screenshots save to the *primary* worktree's `.playwright-mcp/` — copy PNGs into the goal worktree before the blind verifier reads them).
**Rules 15/17/20/23:** failures → `/fix-loop` then `/systematic-debugging`; root cause not patch; no fake data; autonomous — keep going through the full DoD, context-budget is not a stop.
**Failure-recovery budget:** per-task ≈15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → DEFER + continue. MCP hang: 3 cycles (wait+retry → close+navigate → kill+restart dev server) → DEFER. **Hard halts ONLY:** `npm install` failure, contract decision contradiction, irrecoverable build break after the full budget, OS denial, missing token. Context budget is NOT a halt.

---

## 6. Commit + push

Atomic conventional commits per phase: Phase 1 `feat(member-expenses): …` (schema+migration first), Phase 2 `feat(individual-fire): …`, Phase 3 `feat(fh-member-lens): …`; final phase commit `Closes #81`. Co-author `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. **Stage files explicitly — NEVER `git add -A`** (working tree carries unrelated untracked `docs/goals/*` + `.run/*`). Full static gate BOTH trees before each commit. Branch `feat/member-level-financial-view`; merge `--no-ff` → `main` after the full DoD is green; push `origin`. Never `--no-verify`.

---

## 7. Definition of Done (all MUST be true)

**Phase 1:** [ ] itemised expenses carry `ownerId` (default Household; avgMonthly Household; auto-flow inherits source); owner picker live (hidden when solo); member filter shows personal+Household / consolidated all; existing households' totals + FIRE byte-identical; migration (hydrate + Prisma) green.
**Phase 2:** [ ] standalone individual FIRE per adult; ring 3 excluded; household−Σadults gap shown; unified split % (default 50/50, configurable) on expenses+joint corpus; household FIRE **invariant to member selection** (locked); view filter = Household + all adults, dependents hidden; caveat + comparison card present.
**Phase 3:** [ ] Net Worth/Banking/CashFlow/Emergency/Health-Score lens per adult, **same-scope** (no member÷household); individual Health Score with non-earner caveat; household = default + invariant; Reports follow FIRE.
**Static:** [ ] root `type-check`+`test:unit` AND `cd server` `type-check`+`lint`+`test:unit` green; build succeeds.
**Rules 24/25/26/31/32/33:** [ ] per §5, each phase, with evidence (screenshots in the goal worktree).
**Ship:** [ ] atomic commits pushed `feat/member-level-financial-view`, merged `--no-ff`→`main`, `Closes #81`; deferrals in `docs/goals/.run/2026-06-08-member-level-financial-view-DEFERRED.md`; PROGRESS log maintained; `.claude/tasks/lessons.md` appended; PROJECT-LOG §3 updated.

---

## 8. Final report (required)

Open with **SUMMARY: DONE / PENDING / BLOCKED / NEXT**. Then: commit SHAs + per-stage gate results; Rule 24 verdict per screen + PNG paths; Rule 25 verdict (Phase-1 write paths, demo + server); Rule 26 cross-page + FIRE/household-invariance result; FinTech verdicts; §0.2 skipped-as-covered list; DoD tally; DEFERRED entries. Plus **LEARNINGS TO FOLD BACK** (proposals only — governance edits need Abhay's approval).

---

## 9. Guardrails (hard stops)

- `src/`/`server/`/`e2e/` only. Never `.claude/` rules from this build run; never `D:\Abhay\VibeCoding\5Wealths\`.
- **NEVER reintroduce #22/#23** (household FIRE invariant to member selection) and **NEVER member-numerator ÷ household-denominator** (the #23/`281b994` same-scope rule) — these are the load-bearing honesty invariants.
- Household figure stays primary + the gate + the default on every screen; individual is never a retire/health licence.
- One canonical helper each for ring-derivation, the split, and individual-attribution — no duplication.
- No new dependencies. No design reinvention — reuse `ownerMatches`/`lensedScope`/`useFireDerive`; extend over inline.
- Honesty (rule 20): no synthetic data; surface uncertainty as an assumption.
- Stop only on a true blocker (§5 hard-halt list). Context-budget is NOT a blocker — hand off via a one-line continuation note, never fake-complete.

---

## Authorization trail (grilled 2026-06-08)

| # | Decision | Choice |
|---|---|---|
| 1 | Individual FIRE model | Standalone (each adult = mini-household) |
| 2 | Dependents in individual | Excluded; shown as household−Σadults gap |
| 3 | Ring identification | Widened owner tag: any member + "Kids (shared)"; rings from owner+role |
| 4 | Shared split method | Unified single % (default 50/50, configurable) for expenses + joint corpus/debt |
| 5 | Joint corpus attribution | member-owned→adult; Joint→split; dependent-owned→household-only |
| 6 | Surfacing | "Viewing as"-driven + Household-vs-adults+gap card + caveat; household = default+primary |
| 7 | View-filter membership | Household + ALL adults (earning or not); dependents hidden (kept in owner picker) |
| 8 | FH stance | Lens member-attributable FH screens; same-scope rule |
| 9 | Individual Health Score | Shown, with strict same-scope + non-earner caveat |
| 10 | avgMonthly / auto-flow / backfill | Household / inherit source owner / Household |
| 11 | Packaging | One goal, 3 phases, after #66/#67 (merged); tier good-to-have |

---

## References (loaded transitively)

- `rules/claude-behavior.md` — rules 15,17,20,23,24,25,26,29,31,32,33
- `rules/tdd-rule.md` — red-green-refactor (all phases TDD red-first)
- `rules/goal-anchored-decisions.md` + `rules/output-plausibility-verification.md` — honesty / invariance (rule 31)
- `rules/operating-model.md` — rule 29 independent-reviewer edge (+ `fintech-domain-analyst` for math)
- `rules/dev-bypass-auth.md` — `x-dev-bypass: true` server-mode checks
- `rules/independent-test-verification.md` — rule 33 blind re-check
- `CLAUDE.md` "Cold-start" (derive/storage-adapter/household spine); `rules/family-view-pattern.md` (note: that rule describes the retired multi-user schema — v6 is single-tenant; this lens is display-only)
- gh #81 (the spec) · #66 + #67 (merged foundation) · `docs/PROJECT-LOG.md` §3
- Skills: `/fix-loop`, `/systematic-debugging`, `/auto-verify`, `Agent(fintech-domain-analyst)`, `Agent(code-reviewer-agent)`

# FINAL REPORT — Dashboard honesty cards (#139 #140 #138)

**Run:** `/goal docs/goals/2026-06-10-dashboard-honesty-cards.md` · **Merged:** `14f0dfd` → `main` (pushed) · **Date:** 2026-06-10
**Worktree:** `../firekaro-goal-dashboard-honesty-cards` (branch `feat/dashboard-honesty-cards`, self-cleaned on success)

## SUMMARY

- **DONE:** All three features shipped, merged `--no-ff` → main, pushed; #139/#140/#138 commented + closed.
- **PENDING (deferrals):** None — every §7 gate ran (no DEFERRED entries).
- **BLOCKED (Abhay-gated):** Prod deploy of the new `/api/planner/plan-baseline` endpoint (see NEXT).
- **NEXT:** Abhay — deploy the `feat`-merged `main` to `firekaro.com` (VPS redeploy) so the new `/api/planner/plan-baseline` document endpoint reaches production. The frontend cards work in demo (localStorage) without it; only the server-mode persistence of the locked baseline needs the deploy. Per `DEPLOY.md` + Tier-1.5 post-deploy UI verification.

## What shipped (commits)

| SHA | Stage |
|---|---|
| `065702e` | #139 real vs nominal projection toggle |
| `e12bb33` | #140 job-loss runway card (post-tax-net liquidity) |
| `ed7a2e2` | #138 plan-vs-actual variance (decomposed delta) |
| `f9a31c3` | #138 plan-baseline document endpoint (api) |
| `5dc3021` | ADR-0005 plan-baseline entity |
| `621a880` | repair member-lens sweep + harden plan-variance mutation coverage |
| `14f0dfd` | merge → main |

## Per-stage gate results

| Gate | #139 | #140 | #138 |
|---|---|---|---|
| TDD substance specs | ✓ crossover-year preserved real↔nominal; flat-target-line origin guard | ✓ runway↓ with EMIs/premiums + post-tax-vs-gross; conservative≤headline; MF/Intl/REIT counted; vested-ESOP only | ✓ assumption-only→goalpost-not-progress; CPI-rebase decline; sign-flip guard; drivers-sum-to-headline; multi-assumption detection |
| Static (type-check both trees, unit, build, lint) | ✓ | ✓ | ✓ (root 1167 · server 165 incl. live Supabase integration) |
| Rule 24 render + Rule 32 functionality (MCP) | ✓ toggle flips every ₹ + axis/tooltip/note; 0 console err | ✓ all lines render; values verified | ✓ lock→card→persist; goalpost alert + drivers render |
| Rule 25 persistence | n/a (read-only) | n/a (read-only) | ✓ demo localStorage round-trip + live Supabase API GET |
| API behavioral test | — | — | ✓ live Supabase: round-trip (20-key assumptions copy) + co-residence + 401 + 422 |
| Rule 31 plausibility | ✓ ₹47Cr 2055→₹9Cr today; sane-bound in headline-plausibility | ✓ 40mo on ₹69L/₹1.73L; sane-bound | ✓ goalpost "14mo later" matches driver |
| Rule 29 independent review | code-reviewer APPROVE; FinTech CORRECT (ship-clear) | code-reviewer (1 MEDIUM fixed); **FinTech HIGH fixed** (volatile undercount) | code-reviewer (2 HIGH fixed); **FinTech HIGH fixed** (sign-flip) |
| Rule 33 blind re-verify | CONCUR | CONCUR | CONCUR (honesty rule met) |
| Rule 26 cross-page / lens | ✓ deflation correct under consolidated + Rohit lens | household-scoped (correct) | household-scoped (correct) |
| **Member-lens sweep** | **16/16 green** (full `e2e/member-lens-sweep.spec.ts` + static `lens-coverage-invariant`) | | |
| a11y (axe WCAG 2.1 AA) | **0 critical/serious** across all 3 cards | | |
| Mutation pass | deflation covered by direct substance specs | runway.ts **78%** (46 killed) | plan-variance.ts **62%** (58 killed); survivors justified |

**Mutation justification:** 104 mutants killed. Residual survivors are (a) type-set string-literal membership mutants (the detection mechanism + multi-type behavior is spec-locked in aggregate) and (b) exact-magnitude arithmetic that the substance-over-shape philosophy intentionally does not pin (asserting exact ₹ is the shape-lock anti-pattern). Every honesty-critical direction/sign/bound/invariant kills its mutant.

## Skipped-as-already-covered (§0.2)

None — preflight (grep + git log + issue read) confirmed all three features were absent. Clean build of each.

## Defects caught + fixed during the run (independent verification working)

1. **FinTech HIGH — #140 volatile undercount:** `volatilePortion` counted only crypto+equity+ESOP; the SIP-driven accumulator holds equity via MF/International/REIT → a ~0% "market-linked" badge while almost fully exposed. Fixed: market-linked = Stocks+MF+Intl+REIT+Crypto+ESOP. (Sharmas badge 43%→92%.)
2. **code-reviewer + FinTech HIGH — #138 normalization sign-flip:** returns-blind driver estimates normalized to the returns-aware headline could flip sign → render corpus growth as a delay. Fixed: only scale when signs agree, else fall back to 0.
3. **code-reviewer HIGH — #138 lost-update race:** the `/ui` + `/plan-baseline` read-modify-write on the shared `userUiPrefs.prefs` blob wasn't transactional. Fixed: SERIALIZABLE `$transaction`.
4. **Rule 25 caught a real bug:** `usePlanBaseline` used `getAdapter()` (null in demo mode) → the card transitioned but did NOT persist. Fixed to `makeAdapter(getAuthProvider())`. The visual transition lied; the persistence signal caught it.
5. **Pre-existing broken member-lens sweep:** it waited for `#app[data-hydrated="true"]` — a signal that never shipped in this extracted repo — so it timed out on every route and could never actually run. Repaired (real ready signal + tour dismissal + financial-health score-route re-categorization). Not caused by this work, but the sweep is mandatory, so it had to be made runnable.

## LEARNINGS TO FOLD BACK (proposals only — not auto-applied)

- **[GENERIC · process]** When a *mandatory verification gate "won't run"* (hangs/times out uniformly), first check whether the GATE ITSELF is broken before assuming the change is blocked — a gate that silently times out on every case was never actually verifying anything (the member-lens sweep had been "green by never running"). Candidate home: a line in `member-landscape-verification.md` or `independent-test-verification.md`.
- **[GENERIC · process]** Don't run a mutation pass (stryker) and the unit suite concurrently — stryker's sandbox setup transiently skews vitest file discovery (observed 1166→1129). Candidate home: a note in `testing-strategy.md` or the stryker config comment.
- **[PRODUCT · class]** Risk-disclosure classifications (market-linked / volatile) MUST enumerate the FULL set for the LOCKED persona's actual holdings (the salaried accumulator is MF/SIP-driven, not direct-equity) — a partial set understates risk = optimistic Tier-0. Candidate home: a short rule or a comment in `investment-traits.ts` near `accessibilityClass`.
- **[PRODUCT · this-contract]** Attribution displays that reconcile a non-linear headline against linear first-order driver estimates via a global scale must guard the SIGN (fall back rather than sign-flip). Captured in `plan-variance.ts` comments + the sign-preservation spec; sibling-audited (`lever-impact.ts` is safe — it re-runs the true solver).

## Authorization trail

All 20 pre-made decisions in the contract were honored as specified, except where evidence required an honest correction (logged): #139 acceptance (c) "crossover == headline when bridge covered" was empirically false (the chart's base target excludes the family-layer + healthcare reservation in the headline — pre-existing #47 frame gap); the spec asserts the true documented relationship (crossover ≤ headline) instead, surfacing rather than hiding the divergence.

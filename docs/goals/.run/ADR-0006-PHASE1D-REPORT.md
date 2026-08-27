# ADR-0006 Phase 1d — completion report

Branch `feat/adr-0006-honest-inflation-frame`, baseline HEAD `472173f` (Phase 1 + 2 + 1b + 1c).
Seven commits, all `[skip ci]`. Not pushed, no PR, no Playwright. `e2e/t380-ui-verify.spec.ts`
left untracked and untouched.

All nine FinTech findings are closed, plus the screenshot-pass UI coherence item.

---

## 1. Per-persona, Phase 1c → Phase 1d

Default product lens, stored target age, `currentYear` 2026. Every figure re-measured through the
real `derive()` + `requiredMonthlyContributionFor()` path.

| Persona | metric | Phase 1c | **Phase 1d** | why |
|---|---|---|---|---|
| **Sharmas** (30 → 47) | displayed fireAge | 56 | **56** | no kernel figure moved — see §2 |
| | raw years-to-FIRE | 25.4167 | **25.4167** | |
| | needReal | Rs 12.17 Cr | **Rs 12.17 Cr** | |
| | needNominal | Rs 32.76 Cr | **Rs 32.76 Cr** | |
| | requiredMonthlyReal | Infinity | **Infinity** | honestly unreachable at 47 |
| | MC p50 gap | 1.42 y | **1.42 y** | band inputs were already correct here (F1 fixed the digest + the lock, not the dashboard) |
| | bridge effect | — | **0.00 y** | bridge COVERED — no locked tranche outstanding |
| | hero KPI denominator | Rs 10.60 Cr (10%) | **Rs 12.17 Cr (9%)** | now the headline's own number |
| **Mehtas** (45 → 47) | displayed fireAge | 51 | **51** | |
| | raw years-to-FIRE | 6.0000 | **6.0000** | |
| | needReal | Rs 10.35 Cr | **Rs 10.35 Cr** | |
| | needNominal | Rs 11.63 Cr | **Rs 11.63 Cr** | |
| | requiredMonthlyReal | Infinity | **Infinity** | |
| | MC p50 gap | 0.17 y | **0.17 y** | |
| | bridge effect | — | **0.00 y** | covered |
| | hero KPI denominator | Rs 10.23 Cr (78%) | **Rs 10.35 Cr (77%)** | |
| **Iyers** (38 → 55) | displayed fireAge | 58 | **58** | |
| | raw years-to-FIRE | 19.8333 | **19.8333** | |
| | needReal | Rs 8.74 Cr | **Rs 8.74 Cr** | |
| | needNominal | Rs 23.54 Cr | **Rs 23.54 Cr** | |
| | requiredMonthlyReal | Rs 1,58,421 | **Rs 1,58,421** | |
| | MC p50 gap | 1.75 y | **1.75 y** | |
| | bridge effect | — | **0.00 y** | covered |
| | hero KPI denominator | Rs 8.03 Cr (21%) | **Rs 8.74 Cr (20%)** | |
| **Mauryas** (44 → 50) | displayed fireAge | 69 | **69** | |
| | raw years-to-FIRE | 24.9167 | **24.9167** | |
| | needReal | Rs 11.90 Cr | **Rs 11.90 Cr** | |
| | needNominal | Rs 16.88 Cr | **Rs 16.88 Cr** | |
| | requiredMonthlyReal | Infinity | **Infinity** | |
| | MC p50 gap | 1.75 y | **1.75 y** | |
| | bridge effect | — | **0.00 y** | covered |
| | hero KPI denominator | Rs 11.33 Cr (31%) | **Rs 11.90 Cr (30%)** | |

**No kernel figure moved in Phase 1d, and that is the expected result, not a null run.** Every
finding was either a divergence between a consumer and the kernel (F1 digest, F3 stress page, the
hero KPI), a case the four seeds do not exercise (F2 — all four are bridge-covered; F5 — all four
set their goal buckets explicitly), a purity/determinism defect that is behaviour-neutral at the
current wall-clock year (F4), or prose (F6–F9). The seeds were the wrong instrument for most of
these, which is precisely why the reviewer found them by reading rather than by running.

Guards, re-asserted: every persona **≤ 70 displayed AND ≤ 70 raw** (Mauryas 69 / 68.92, the
tightest, with 1.08 y of raw margin) and every persona **≤ `planToAge`** (90 / 90 / 90 / 92).

### Units (F6), stated once

Displayed age = `householdFireAge = anchorAge + ceil(yearsToRegular)` — the number on screen.
Pre-ADR-0006 → post: **56 → 56 · 51 → 51 · 57 → 58 · 68 → 69**, against raw years
25.667 → 25.42 · 5.333 → 6.00 · 18.917 → 19.83 · 23.500 → 24.92. So the displayed headline moves
for two of the four personas. The earlier reports compared a raw post-value (55.42) against a
displayed pre-value (56) and so read as an improvement that never happened.

---

## 2. What landed, finding by finding

| Finding | Commit | One line |
|---|---|---|
| F1 | `364a2b4` | `monte-carlo.headlineBandInputs(k)` is the ONE builder for the headline band. `useFireDerive.monteCarlo`, `lifecycle-digest.computeMonteCarloP50Age` and both `headline-plausibility` blocks call it, so a hand-copied field cannot rot out of sync again. `SnapshotInputs` gains `effectiveTargetDriftRate`; `useLifecycleDigest` threads it. |
| F2 | `f8b1eef` | `BridgeInput.annualExpensesAt(t)`, supplied by `derive()` from the BASE leg of the component schedule. The bridge is one frame again. Witness spec reproduces the bug then pins the fix. |
| F3 | `8bd3895` | `StressRunArgs.targetInflation` → `targetGrowthNominal`, fed `effectiveTargetGrowthNominal`. Spec extended to all four personas and TIGHTENED from ≤ 1 y to ≤ 0.5 y. |
| F4 | `b9d77d8` | `DeriveOverrides.currentYear`; the kernel never calls `Date`. Six production callers pass the wall clock; five specs pin 2026. |
| F5 | `5c4a878` | `plannedGoalInflationBucket(kind)` — one exported map, read by the kernel, the store's legacy backfill and the goal form. A bucket-less education goal costs 9%, not 6%. |
| F6/F7/F8/F9 | `cf38ace` | Units in the reports + ADR + a displayed-age bound in the plausibility gate; the solver's stale single-rate comments rewritten to the component schedule; `cpiWithinYearReindexFactor` exported and the wrong `96_766` fixture computed; the NPS-annuity frame simplification stated. |
| UI | `b6f25cc` | The hero's corpus-progress KPI measures against the solver's `needReal` — the number the headline quotes — and the caption names which target it is. |

### The measurements the brief asked for

**F1 — MC p50 gap, per persona, against the real band** (bound `< 2.0 y`, NOT widened):
sharmas **1.42 y**, mehtas **0.17 y**, iyers **1.75 y**, mauryas **1.75 y**. Unchanged from
Phase 1c, because the FireHero band was already on the effective drift; what F1 fixed is the
digest (which was a whole leg behind) and the lock (which was mirroring nothing).

**F2 — bridge effect on each persona's headline: 0.00 years, all four.** Every seed is
bridge-COVERED at its adequacy age, so no expense curve can change its verdict. The fix bites only
where the bridge binds, which the witness spec constructs explicitly: under the old mixed frame a
drifting target SHRANK the liquidity gap; under one frame it never does, and is strictly worse
than the mixed frame it replaced.

**F3 — stress-page baseline agreement with the headline solver** (|stress − `corpusOnlyYearsToRegular`|):

| persona | basket (before) | effective (after) |
|---|---|---|
| sharmas | 1.000 y | **0.000 y** |
| mehtas | 0.583 y | **0.167 y** |
| iyers | **1.167 y** | **0.250 y** |
| mauryas | 0.750 y | **0.250 y** |

The old case ran the Sharmas ALONE at `≤ 1 y` and passed by equality at exactly 1.000; the Iyers
were already breaching it and nobody could see it. Now all four run at `≤ 0.5 y`.

**F8 — the factor.** 0.969067 at 6% CPI (mean of `(1.06)^(−k/12)`, k = 1..12). The Phase-1b
report's 0.96766 was wrong; the review's 0.969073 is also wrong. The code was always right, and
the fixture now computes it rather than copying a rounded literal.

---

## 3. Deviations

1. **The brief's 0.969073 is not the value.** Computed exactly, the factor is **0.969067**. Both
   the report's old figure and the review's are wrong by different amounts; the fixture is
   computed from the exported kernel function so no third wrong copy can appear.

2. **F4's fallback is `lens.currentFY`'s start year, but the specs pin 2026 rather than inherit
   it.** The brief offered `lens.currentFY` as "the cleanest source". It is the right FALLBACK —
   production's `ui.currentFY` is wall-clock-derived, so the fallback equals the wall clock there —
   but it is the wrong PIN for specs, because every spec hard-codes `currentFY: "2025-26"` while
   the wall clock is 2026. Inheriting it would have moved every dated goal a year and re-baselined
   the whole golden master for no honesty gain. Five specs pin `currentYear: 2026` instead;
   `derive.spec.ts` does it by shadowing the import so no call in that file can forget. All four
   golden-master snapshots are byte-identical.

3. **F2's derive-level witness zeroes the medical reservation and the goals.** With them present
   the corpus scales very slightly faster than the retiree's bill, because the target legitimately
   has to carry a medical buffer and a school fee. That is correct, not the mixed-frame bug, and
   leaving them in would have made the witness assert something untrue. Stated in the spec.

4. **F5 leaves one residual, and it is stated in the code.** A planned line ALREADY stamped
   `inflationBucket: "general"` by an earlier hydrate is indistinguishable from a deliberate
   general choice, so it keeps CPI. An explicitly-set bucket beats the kind by design — overriding
   it would silently rewrite a user's own answer, which is the opposite failure.

5. **F3 renames a public field.** `targetInflation` → `targetGrowthNominal`. The value is a target
   GROWTH rate, not an inflation rate; keeping the old name is how the base-leg mistake kept
   recurring. Five call sites, all in-repo.

6. **Two commits on this branch are not mine.** `ad2f733` (*fix(server): declare frameVersion on
   planBaseline/lifecycleSnapshot schemas*) and `d11570c` (*fix(server): persist every accepted
   Assumptions field*) landed between my commits at 17:42 and ~17:52 — a concurrent session is
   working this branch. They are server-side and do not overlap my files. Every gate below was run
   with them present.

7. **One live-DB server spec timed out on its first run** (`planner.integration.spec.ts` tenant
   isolation, 5049 ms against a 5000 ms limit) and passed on re-run. A Supabase round-trip flake,
   not a code failure; the only server file this phase touched is `lifecycle-runner.ts`.

8. **`e2e/t380-ui-verify.spec.ts` remains untracked** and was not run — no Playwright, per the
   brief.

---

## 4. Gates

| Gate | Result |
|---|---|
| `npm run type-check` (root) | clean |
| `npx vitest run` (root) | **100 files / 1481 tests passed, 0 failed** (1465 → 1481; +16 net new) |
| `cd server && npm run type-check` | clean |
| `cd server && npm run lint` | clean |
| `cd server && npm run test:unit` | **23 files / 187 passed** (green on re-run; see deviation 7) |
| Every persona ≤ 70 displayed AND ≤ 70 raw | 56 / 51 / 58 / 69 displayed · 55.42 / 51.00 / 57.83 / 68.92 raw |
| Every persona ≤ `planToAge` | 90 / 90 / 90 / 92 |
| Substance assertions | none loosened — F3's bound TIGHTENED (1.0 → 0.5 y over 4× the personas), F6 ADDED a displayed-age bound, the 2.0 y MC bound and the ≤ 70 gate are untouched |

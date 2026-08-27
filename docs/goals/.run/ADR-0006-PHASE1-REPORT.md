# ADR-0006 Phase 1 — report

Branch `feat/adr-0006-honest-inflation-frame`. Kernel + inputs + solver + tests. No `.vue`, no
`server/src` source edits. Not pushed, no PR.

## 1. Per-persona before / after (DEFAULT product lens, stored target age)

`fireNumber` is a today's-rupee figure and is **unchanged for every persona** — no inflation input
can move it. That is the cleanest evidence that what changed is the target's TRAJECTORY, not its size.

| Persona | FIRE age before → after | frame-only leg | `fireNumber` (unchanged) | `needReal` before → after | `needNominal` before → after | `requiredMonthlyReal` @ stored target |
|---|---|---|---|---|---|---|
| Sharmas (anchor 30, target 47) | **56 → 55** | 73 | ₹10.60 Cr | ₹10.60 Cr → **₹11.01 Cr** (+3.9%) | ₹28.54 Cr → **₹29.66 Cr** | Infinity → Infinity |
| Mehtas (45, 47) | **51 → 51** | 55 | ₹10.23 Cr | ₹10.23 Cr → **₹10.28 Cr** (+0.5%) | ₹11.50 Cr → **₹11.55 Cr** | Infinity → Infinity |
| Iyers (38, 55) | **57 → 57** | 71 | ₹8.03 Cr | ₹8.03 Cr → **₹8.35 Cr** (+3.9%) | ₹21.63 Cr → **₹22.48 Cr** | ₹1,48,264 → **₹1,46,273** |
| Mauryas (44, 50) | **68 → 69** | 95 | ₹11.33 Cr | ₹11.33 Cr → **₹11.49 Cr** (+1.4%) | ₹16.07 Cr → **₹16.29 Cr** | Infinity → Infinity |

Two-frame agreement (ADR §6 assertion 3) is now **exact** — `householdFireAge == crossovers.regular.age`
for all four (55/51/57/69). Before this change it was off by 4–8 years on every persona, with the
chart on the optimistic side.

**Deviation from the FinTech expected table (full E: 54 / 51 / ~55 / ~68).** Measured 55 / 51 / 57 / 69,
i.e. +1 / 0 / +2 / +1. The cause is the two extra kernel corrections in §3 below (true monthly
compounding and continuous target resolution), which FinTech's annual-grid simulator did not carry.
Both move every persona LATER, so the deviation is entirely in the conservative direction. Frame-only
also lands later than FinTech's 57/55/58/69 (73/55/71/95) for the same reason.

**Plausibility.** `fireAge <= 70` holds for all four on the fractional value the gate reads
(54.42 / 50.58 / 56.83 / 68.33). Mauryas has ~1.7y of margin. The bound was **not** widened.

## 2. Files changed

| File | One line |
|---|---|
| `src/lib/fire-math.ts` | `TargetSchedule` + continuous resolution in `calculateYearsToTarget`; true monthly-equivalent compounding; `projectCorpus` gains `regularTargetToday`; re-grounded blend docs + `DEFAULT_INFLATION_WEIGHTS`. |
| `src/types/assumptions.ts` | healthcare 0.14→0.09, weights 60/20/10/10→74/8/0/18, step-up default 0→2, with the grounding written into the comments. |
| `src/stores/assumptions.ts` | `migrateStepUpDefault` — a persisted step-up of exactly 0 is treated as unset on hydrate. |
| `src/lib/derive.ts` | The `#20` block replaced by the ADR-0006 one-frame contract; nominal headline solver; `STEP_UP_TAPER_AGE = 50` two-segment step-up; bridge `corpusScale` uses the drifted target; `projectCorpus` gets the basket + the headline target; exports `realTargetDriftRate`, `nominalContributionSchedule`, `expectedReturnSchedule`. |
| `src/lib/individual-fire.ts` | Same nominal frame as the household path (same commit); exposes `nominalReturn`. |
| `src/lib/monte-carlo.ts` | `targetGrowthRate` + `monthlySavingsSchedule`; the frame-precondition note records the CPI-real choice and why. |
| `src/lib/required-contribution.ts` | `needReal` = drifted today's-₹ target at T; `needNominal` read off the same basket growth; `haveAtTargetReal` = nominal corpus deflated at CPI; components carry the same drift; monotonicity contract re-stated for a moving target. |
| `src/lib/lever-impact.ts` | `FireBaseline` gains `targetGrowthRate` / `savingsStepUpPercent` / `savingsStepUpTaperYears` / `savingsInflationRate`; shared `resolveBaselineSchedules`. |
| `src/lib/lever-bands.ts` | The band is built from the same schedules as the deterministic point. |
| `src/composables/useAcceleration.ts` | Baseline moves to the NOMINAL triple; risk-notch spread becomes nominal. |
| `src/lib/useFireDerive.ts`, `src/lib/lifecycle-digest.ts`, `src/composables/useLifecycleDigest.ts` | Thread `realTargetDriftRate` + `householdContributionSchedule` + `householdInflation` through to the band. |
| `src/lib/inflation-frame-invariant.spec.ts` | NEW — the 4-assertion behavioural lock. |

## 3. Deviations from the decision block (both additive, both conservative, both reported)

1. **True monthly-equivalent compounding.** `calculateYearsToTarget` / `projectCorpus` compounded
   `r/12`, whose effective annual rate is `(1+r/12)^12 > 1+r` by an amount that DEPENDS on `r`. The
   same household therefore reached FIRE ~1.2 years EARLIER in the nominal frame than in the CPI-real
   frame (measured, Sharmas) — which would have made "one frame" untrue in practice and left the
   AccelerationCard and the MC band permanently out of step with the headline. Now `(1+r)^(1/12) − 1`,
   so deflating the nominal path month by month reproduces the real path exactly.
2. **Continuous target resolution.** The target was resolved at `floor(months/12)` while the corpus
   was checked monthly, so eleven months of corpus growth raced a target frozen in January. It pulled
   the Mauryas headline 2 years ahead of the projection's own crossover. Now resolved at `months/12`.

Both are inside the ADR's mandate ("the headline, the solver, the individual-FIRE path, the Monte
Carlo band and the chart all read the same frame") and both move every number later.

A third, smaller addition: `projectCorpus` now takes the headline `fireNumber` as its regular target.
Without it, ADR §6 assertion 3 could not have passed at any tolerance — the chart target omitted the
family layer and the healthcare reservation and crossed 4–8 years early.

## 4. `healthcareCorpusReservationPercent` audit (derive.ts, default 0.2) — LEFT AT 0.2

The claimed triple-count is (1) the healthcare bucket RATE inflating ongoing medical spend, (2) this
20%-of-base corpus reservation, (3) the auto-flowed insurance premium already inside
`expenses.recurring` and therefore already capitalised at SWR into `baseFireNumber`.

**Not clearly a double-count once the re-grounded inputs land.**
- Leg (1) is neutralised by this change itself: the healthcare bucket now contributes
  `0.08 × (9% − 6%) = 0.24 pp` of excess over CPI to the basket, down from `0.20 × (14% − 6%) = 1.60 pp`.
  The compounding overstatement FinTech HIGH-4 pointed at is gone by arithmetic, not by cutting the buffer.
- Leg (3) funds a different thing: the premium is the price of cover and is fully capitalised; the
  reservation is the out-of-pocket / uninsured-excess SHOCK buffer no premium pays. Disjoint risks.
- Direction: cutting 0.2 → 0.1 lowers `needReal` ~9% for every household — an OPTIMISTIC move on a
  Tier-0 figure made on a "not clearly" verdict, which `goal-anchored-decisions.md` forbids.

## 5. Tests re-baselined, and why

| Test | Why |
|---|---|
| `headline-golden-master.spec.ts.snap` (4) | The headline moved. `fireNumber`, `progressPercent`, `savingsRate`, `monthlyContribution`, `effectiveSWR` are byte-identical for every persona; only the time fields changed. Per-persona table in §1. |
| `fire-math.spec.ts` blendedInflation | 7.90% → 6.24%. Rewritten to assert the VALUE **and** a new substance bound (basket within 0–100 bp of general CPI) that the old 7.90% would have failed by 90 bp. |
| `stores/assumptions.spec.ts` (4) | Default weights 74/8/0/18, blend 6.24% + the same bound; the healthcare-shift and normalisation cases recomputed at 9%; **added** a case locking the step-up hydrate default. |
| `derive.spec.ts` Sharmas anchor | 25.67y → 24.42y, with the four netting effects written into the comment; `fireNumber` still pinned unchanged. |
| `derive.contribution-schedule.spec.ts` + `headline-plausibility.spec.ts` (5) "0% step-up is a NO-OP" | The default moved 0→2, so "0% equals the default" would now assert that the new default does nothing. Re-expressed as the content that was ever load-bearing: at 0% the resolver is inert (a plain scalar, which is what preserves the `<= 0 → Infinity` sentinel), the FIRE number never moves, and a positive step-up may only pull FIRE earlier. |
| `headline-plausibility.spec.ts` MC-tracking (4) + `lifecycle-digest.spec.ts` captureSnapshot | Both claim to "mirror the production call EXACTLY" and had stopped doing so once the band gained `targetGrowthRate` + `monthlySavingsSchedule`. The missing inputs were **added**, not the bound relaxed — the tight 2.0y tracking bound still holds (measured gaps now ≤0.75y). |
| `required-contribution.spec.ts` member lens | `needReal` is the today's-₹ number AT the target age, so it carries `(1+g)^T`. Asserting against the undrifted figure would re-assert the optimism gh #167 removed. |
| `useFireDerive.deflation.spec.ts` flat-target line | The deflated Regular target is no longer a flat line — that was true only while the target grew at the same CPI this view deflates by, and a flat line would now mean the collapse had come back. The origin-alignment guard it exists for is preserved and sharper: every point must sit on `(1+g)^i`. |
| `lever-bands.spec.ts` p50 anchor | Was a symmetric `abs(p50 − det) < 0.5`, which held only because `r/12` was cancelling the σ²/2 geometric drag. With correct compounding p50 sits ~1.5y LATER (conservative). Now one-sided (`p50 >= det − 0.5`) plus a divergence ceiling. |
| `seeds/seed-consistency.spec.ts` (2) | Mehtas `maxYearsToFire` 5.4→5.7, Mauryas 24→24.5 — the seeds' own "compelling accumulator" bands re-tightened around the new values. NOT the #22 `fireAge ≤ 70` gate, which still passes untouched with ~1.7y of margin on the worst persona. |

**No substance assertion was loosened without being named above.** The one bound that was widened
(`seed-consistency` maxYearsToFire) is a seed-realism band, not an honesty gate.

**Levers — no-inert-lever guard.** `lever-catalog.spec.ts` passes: every available lever still changes
the solver output on Sharmas after the frame change.

> **Phase 1b correction (LOW-9).** Anywhere this report or ADR §3 implied the headline is
> "byte-identical when all buckets = CPI", read instead: the model is **internally consistent at
> g = 0** (the positive control — a real target that does not drift). The pre-ADR-0006 headline
> still moves, for every household and at any `g`, by the two conservative corrections in §3
> (true monthly compounding + continuous target resolution). Both move every persona later.

## 6. Red-then-green self-test of the new lock

Temporarily reverting the target growth in `derive.ts` from the basket back to general CPI (i.e.
re-collapsing both sides) turns **8 of the 10** assertions in `inflation-frame-invariant.spec.ts` red.
Restoring it returns 10/10 green. The lock cannot be satisfied by a single-rate model.

## 7. Gate output

| Gate | Result |
|---|---|
| `npm run type-check` (root) | clean |
| `npx vitest run` (root) | **95 files / 1404 tests passed, 0 failed** |
| `cd server && npm run type-check` | clean |
| `cd server && npm run lint` | clean |
| `cd server && npm run test:unit` | **21 files / 176 passed, 1 skipped** (the `DATABASE_URL`-gated live integration spec) |

No server spec needed re-baselining: `lifecycle-evaluator` asserts nudge SHAPE and dedupe keys, not
headline magnitudes.

## 8. Open risks for Phase 2 (UI)

Every one of these now renders a number that is correct but described by copy that is not.

| File:line | What must change |
|---|---|
| `src/components/dashboard/FireMilestonesCard.vue:61` | `realReturnForCoast(blendedReturn, assumptions.householdInflation())` — the **#180 two-rate contradiction**, live on the default dashboard: this deflates at the BASKET while the hero deflates at CPI. Must read the kernel's one `realBlendedReturn`. |
| `src/components/dashboard/FireHero.vue:362, :378` | "you'll need `{needReal}` in today's money" / "at `{currentMonthlyReal}`/month, today's money" — still true, but the figure is now *today's money at the target age, at your basket*. `FireHero.binding.spec.ts:29-30` locks the pattern and moves with it. |
| `src/lib/quick-number-copy.ts:233-253` + `src/components/quick/QuickExplainer.vue` | "grown at 6% inflation so you compare like with like" and "we show both and plan in today's" are now factually wrong — this is the user-facing explanation of the exact mechanic that changed. |
| `src/components/quick/QuickResult.vue:169` (QN-4 chart) | "What you'll have vs what you'll need · today's money" — the *need* line now slopes upward at g. Real design change, arguably a clarity win. |
| `src/components/charts/FireProjectionChart.vue:170` | The today's-₹ / future-₹ toggle: in real mode the target line is no longer flat. |
| `src/components/charts/CoastTrajectoryChart.vue:7` | "Both series are in today's rupees (real return)" — must name WHICH real return. |
| `src/pages/QuickNumber.vue:136` | "you'd need `{need}` in today's money". |
| `src/pages/Preferences.vue:99, :120, :123, :333-337` | `healthcareInflation` and `inflationWeights` are headline-moving knobs for the first time; the blend readout and the "real return < 0" warning both use `householdInflation()`. The A1.4 glossary disclosure for the re-grounded buckets + the step-up default belongs here. |
| `src/pages/fire-goals/WhatIf.vue:278`, `src/components/dashboard/SequenceRiskCard.vue:23` | Read `realBlendedReturn` — correct, but should be checked against the new copy. |
| `src/components/dashboard/PlanVarianceCard.vue:112` | Labels `educationInflation`; the bucket now carries weight 0 in the retirement basket while still driving finite goals — the label must not imply otherwise. |

Non-UI follow-ups the ADR flags and Phase 1 did not do:
- **`plan-variance.ts` + the persisted `plan-baseline` (ADR-0005)** will show a false regression for
  every existing user; **`lifecycle-digest`** will emit a one-off "your number changed" wave. Both need
  a baseline migration or a first-run suppression **before deploy**.
- **The "unreachable" hero state** (ADR item 4) is not built. Three of four seeds return
  `requiredMonthlyReal = Infinity` at their stored target age, exactly as before.
- **`bridge.ts` is unchanged by decision** (ADR item 6): flat today's-₹ expenses AND zero return on the
  drawn pool remain a stated pair of offsetting simplifications, net direction ambiguous, revisit only
  together. A comment block records this at the `corpusScale` site in `derive.ts`.
- **`SWR_HORIZON_TABLE` step function** (#167's rider) untouched — still a ~5.5% `needReal` cliff for one
  extra year of work at a bracket boundary.

# ADR-0006 Phase 1c — report: **STOPPED at guard (c). Owner decision required.**

Branch `feat/adr-0006-honest-inflation-frame`. Baseline HEAD `e668a4e` (Phase 1 + 2 + 1b).
No push, no PR, no Playwright.

## 0. Why this stopped

Guard (c) of the Phase-1c brief is explicit:

> Expected result … Sharmas ≈ 55.4, Mehtas ≈ 51.0, Iyers ≈ 57.8, Mauryas ≈ 68.9 … **If your
> implementation lands materially elsewhere (> 0.5 y) STOP and report with numbers rather than
> adjusting anything.**

Decisions (a) + (b) were implemented **exactly as written**, measured, and land **0.2–2.9 years
EARLIER** than (c) predicts. Rather than tune anything to hit the number, the kernel diff is
preserved as a patch and handed back.

## 1. The contradiction: (a) and (c) describe DIFFERENT variants

Decision (a) says the healthcare corpus reservation grows with the **household basket** ("a
fraction of the base … no change to how it drifts"), and dictates the comment explaining that
inflating it at `healthcareInflation` would double-count the basket's healthcare bucket.

The numbers in (c) are Phase-1b's measurement table **row 5**. Rows 3, 4 and 5 of that table are
successive deltas off the *briefed formula* of Phase 1b, which carried the **reservation at 9%**
(`healthcareInflation`). Only row 2 moved the reservation to the basket, and row 2 is the
*uncapped* goals variant. So (a)+(b) — capped-then-flat goals **with** a basket-drifted
reservation — is a variant that was **never measured in Phase 1b**, and (c)'s figures cannot
describe it.

This was confirmed decisively, not inferred. One two-line probe on the finished implementation,
moving *only* the reservation leg onto `healthcareInflation` and changing nothing else,
reproduces (c) to the second decimal:

| Persona | Phase 1 (HEAD) | **(a)+(b) as briefed** | probe: (b) + reservation at 9% | (c) expected |
|---|---|---|---|---|
| Sharmas | 54.42 | **53.75** | 55.42 | 55.4 |
| Mehtas  | 50.58 | **50.42** | 51.00 | 51.0 |
| Iyers   | 56.83 | **56.17** | 57.83 | 57.8 |
| Mauryas | 68.33 | **66.00** | 68.92 | 68.9 |

The probe column *is* (c). The middle column is what the written decision produces. The gap is
entirely the reservation leg — 20% of the base compounding at 9% instead of 6.24% over 22–30
years is worth 1.7 / 0.6 / 1.7 / **2.9** years of FIRE age.

## 2. Why this gap matters (it is the optimistic direction)

Every persona under (a)+(b) lands **EARLIER than the Phase-1 baseline it is replacing** —
Sharmas −0.67, Mehtas −0.16, Iyers −0.66, Mauryas −2.33 years. The capping half of (b) is a
genuine model correction (a goal paid in year 8 must stop inflating), and it is the honest thing
to do; but combined with a basket-drifted reservation it makes the headline *more* optimistic
than the frame ADR-0006 set out to de-optimise. Optimistic movement on the headline is Tier-0
(`goal-anchored-decisions.md`) and is not something to absorb silently under a re-baseline.

Nothing here trips the hard guards — all four personas are ≤ 70 and ≤ `planToAge` under
(a)+(b) (66.0 is the worst). The stop is guard (c), not the ≤ 70 guard that stopped Phase 1b.

## 3. The fork this hands back (one question)

**Does the healthcare corpus reservation drift at the household basket, or at
`healthcareInflation`?**

- **Basket (decision (a) as written)** — internally consistent with the "fraction of the base"
  framing and avoids double-counting the basket's 8%-weighted healthcare bucket. Cost: the
  headline moves earlier than Phase 1 on every persona; (c)'s numbers are wrong and the golden
  master re-baselines in the optimistic direction.
- **`healthcareInflation` (what (c) actually measured)** — the reservation funds *medical shocks*,
  whose price genuinely rises at healthcare inflation, so a 9% drift is defensible on its own
  terms; this is also the only variant that reproduces the briefed expectation. Cost: the
  reservation goes from 20% of base today to ~44% by year 30 on a "20%" calibration that was not
  set with that in mind (Phase 1b's own fork-1 caveat), and the healthcare bucket is arguably
  counted twice.

The two are one line apart in the patch. Everything else in 1c — items (d) through (g) — depends
on which one is chosen, because all of them re-baseline against it.

## 4. What is built, verified, and preserved

`docs/goals/.run/ADR-0006-PHASE1C-STOPPED-kernel.patch` (240 lines, applies cleanly to `e668a4e`)
contains the complete (a)+(b) kernel:

- **`derive.ts`** — the family layer split into its two differently-drifting halves
  (`plannedGoalsToday` + `extendedContingencyCorpusToday`, summing to `familyLayerCorpus` by
  construction); `bucketInflationRate()` resolving `inflationBucket` → education / healthcare /
  housing / general(CPI); `plannedGoalComponents` carrying each goal's `todayAmount`, its own
  rate, and `dueYears = max(0, targetYear − currentYear)`; and the component target
  `regularTargetSchedule(t) = (base + reservation + contingency)·(1+b)^t + Σ
  goal_i·(1+rate_i)^min(t, dueYears_i)`, exact to `fireNumber` at t = 0. Plus
  `regularTargetComponentsRealAt(t)` (the today's-₹ three-way split that sums to the total — the
  seam item (b) needs for `required-contribution`), and `effectiveTargetDriftRate` /
  `effectiveTargetGrowthNominal` anchored on the **solved** horizon (Phase 1b's recorded trap).
  The solver, the bridge `corpusScale` and `projectCorpus` all read the schedule.
- **`fire-math.ts`** — `projectCorpus` gains an optional `regularTargetSchedule` that takes
  precedence over `regularTargetToday`, so the chart's target line kinks where the goal legs stop.
- The decision-(a) rationale comment is in place at the reservation site, worded as briefed.

`npm run type-check` is **clean** on the patched tree.

**Not started** (each is downstream of the fork): (b)'s `required-contribution.ts` mirror, (d) the
positive-control rewrite, (e) the new education-goal spec, (f) `CoastTrajectoryChart.vue`, (g) the
re-baselines and the ADR §2 / Phase-1b-report edits. The Phase-1b report's HIGH-1 section is
therefore **unchanged** — HIGH-1 is not resolved.

## 5. Blast radius already measured (so the next round does not rediscover it)

Targeted run on the patched tree — 9 failures, all expected and all owned by unstarted 1c items:

| Spec | Failures | Owned by |
|---|---|---|
| `headline-golden-master.spec.ts` | 4 (all personas) | (g) re-baseline |
| `headline-plausibility.spec.ts` | 4 — mauryas MC p50 tracking (3.25 y vs the 2.0 bound); the acceleration-card baseline on sharmas / mehtas / mauryas | (b) — the MC + lever baselines still read the scalar `realTargetDriftRate`; they must move to `effectiveTargetDriftRate` / `effectiveTargetGrowthNominal`, which the patch already exports |
| `inflation-frame-invariant.spec.ts` | 1 — assertion 2 `yearsToRegular` 22.33 vs 23.17 | (d), exactly as the brief predicted |

Assertions 1, 3 and 4 and the live-defaults case all **pass** unchanged; the Iyers' live
prescription moves ₹1,46,273 → ₹1,39,303 (−4.8%, inside the ±8% allowance).

## 6. Gates

| Gate | Result |
|---|---|
| `npm run type-check` (root, patched tree) | clean |
| `npx vitest run` (root) | not run to completion — the tree is intentionally reverted to `e668a4e`, where Phase 1b's 98 files / 1460 tests remain green |
| server gates | untouched by this round |

Branch HEAD is left at the Phase-1b state plus this report and the patch, so the committed tree is
green while nothing built in this round is lost.

# ADR-0006 Phase 1 — plan before coding

Branch `feat/adr-0006-honest-inflation-frame`. Kernel + inputs + solver + tests only.
No `.vue`, no `server/src` source edits.

## A. Verified consumer map (grepped, file:line)

### `realReturnSchedule` (derive output)
| Site | Role after the change |
|---|---|
| `src/lib/derive.ts:562-565` | produced; **stays exported** (display + MC), no longer the headline solver's return |
| `src/lib/derive.ts:633,636,639` | `calculateYearsToTarget(...)` regular/lean/fat — **MOVES to nominal** |
| `src/lib/derive.ts:826` | re-export — unchanged |
| `src/lib/useFireDerive.ts:379` | re-export — unchanged |
| `src/lib/useFireDerive.ts:401` | `monteCarlo.meanReturnSchedule` — stays REAL, gains a drifting target |
| `src/lib/required-contribution.ts:189` | `haveAtTarget` projection return — **MOVES to nominal + deflate** |
| `src/lib/lifecycle-digest.ts:53,181` | MC inputs (server-shared) — stays REAL, gains drift |

### `realBlendedReturn` (derive output)
| Site | Role |
|---|---|
| `src/lib/derive.ts:572` | produced from `blendedReturn` at CPI — unchanged formula |
| `src/lib/derive.ts:822`, `useFireDerive.ts:378` | re-export — unchanged |
| `src/components/dashboard/SequenceRiskCard.vue:23` | display — Phase 2 |
| `src/composables/useAcceleration.ts:73` | lever engine, REAL frame — unchanged |
| `src/composables/useLifecycleDigest.ts:43` | MC mean — unchanged |
| `src/pages/fire-goals/WhatIf.vue:278` | display — Phase 2 |
| `src/lib/useFireDerive.ts:400`, `lifecycle-digest.ts:178` | MC mean — unchanged |

### `householdInflation` / `resolveHouseholdInflation`
| Site | Role |
|---|---|
| `src/lib/assumption-math.ts:14-24` | the resolver — becomes load-bearing on the accumulation path |
| `src/lib/derive.ts:559` | produced |
| `src/lib/derive.ts:736` | Floor/Ceiling decumulation overlay — unchanged (already the basket) |
| `src/lib/derive.ts:838` | re-export — unchanged |
| **NEW** `derive.ts` headline solver + `projectCorpus` expense line | the frame change |
| `src/stores/assumptions.ts:71-73` | thin wrapper |
| `src/components/charts/ExpenseTrendChart.vue:36`, `dashboard/FireMilestonesCard.vue:61`, `dashboard/NudgeStack.vue:55`, `composables/useLifecycleDigest.ts:66`, `pages/Preferences.vue:99,120,123` | display — Phase 2 (FireMilestonesCard is the #180 two-rate contradiction) |

### `fireNumber`-as-a-constant target
`derive.ts:485-489` (built) → `:633` headline solver (**becomes a schedule**) → `:701` `corpusScale`
(**becomes the drifted target at the adequacy age**) → `useFireDerive.ts:397` MC `targetCorpus`
(**gains `targetGrowthRate`**) → `lifecycle-digest.ts:177` (same) →
`required-contribution.ts:155` `needReal` (**becomes the drifted today's-₹ target at T**).
`individual-fire.ts:196-211` is the second, independent real-frame site — moves in the same commit.

### `projectCorpus` inflation
`fire-math.ts:353-355` `inflated = annualExpensesToday*(1+inflation)^y; target = inflated/swr`.
Callers: `derive.ts:741-753` (**`inflation` becomes the basket**), `required-contribution.ts:178-190`
(`inflation: 0`, corpus line only — **switches to nominal returns + CPI-grown inflow, then deflates**).

**Two-frame coherence defect found while measuring (must be fixed for ADR §6 assertion 3):**
`projectCorpus`'s `targetForRegular` is `annualExpensesToday/swr` — it OMITS `familyLayerCorpus`
and `healthcareReservation`, which the headline `fireNumber` includes. Measured today:
Sharmas headline 56 vs chart crossover 52; Mehtas 51 vs 45; Iyers 57 vs 52; Mauryas 68 vs 60.
The frames therefore ALREADY disagree by 4–8 years, and the chart is the optimistic one.
Fix: `projectCorpus` gains an optional `regularTargetToday` (the headline `fireNumber`); lean/fat
keep the variant-multiplier basis they already share with the headline.

### `needNominal` inflator
`required-contribution.ts:174` `inflator = (1+assumptions.inflation)^T`; `:290` `needNominal = needReal*inflator`.
Replaced by: `needNominal` = the nominal target at T (`fireNumber*(1+b)^T`); `needReal` = that ÷ `(1+CPI)^T`.

## B. The frame (one sentence)
Corpus grows at the NOMINAL return schedule; the target grows at the household basket `b`;
contributions grow at general CPI × the REAL step-up (ADR-0004 semantics preserved);
`(1+CPI)^t` deflation happens ONLY for display and for the today's-₹ figures.

## C. Order of edits
1. `src/lib/fire-math.ts` — `TargetSchedule` + `resolveTarget` in `calculateYearsToTarget`;
   `projectCorpus` optional `regularTargetToday`. Old scalar signatures keep working.
2. `src/types/assumptions.ts` — healthcare 0.14→0.09; weights 60/20/10/10 → 74/8/0/18; doc comments.
3. `src/stores/assumptions.ts` — hydrate: persisted step-up === 0 (the old default) is unset.
4. `src/lib/derive.ts` — nominal headline solver, taper-at-50 step-up default, `corpusScale`,
   `projectCorpus` basket + `regularTargetToday`, `realTargetDriftRate` export, comment rewrite.
5. `src/lib/individual-fire.ts` — same frame; expose `nominalReturn`.
6. `src/lib/monte-carlo.ts` — optional `targetGrowthRate` (CPI-real target drifting at g).
7. `src/lib/required-contribution.ts` — needReal / needNominal / haveAtTargetReal + contract comment.
8. `src/lib/inflation-frame-invariant.spec.ts` (new, RED first).
9. Re-baseline: golden master, plausibility, required-contribution, derive, seed, deflation,
   lifecycle-digest, lever-catalog, quick-number, empty-partial-state, fire-math, stores/assumptions,
   coast-fire, assumption-math, server lifecycle specs.

## D. Tests written RED first
`src/lib/inflation-frame-invariant.spec.ts`:
- (a) negative control: healthcare 9% to 15% on Sharmas ⇒ `fireNumber` unchanged, `needReal` up,
  `needNominal` up, `householdFireAge` >= and strictly later for T >= 10.
- (b) positive control: all four buckets = CPI ⇒ g ≈ 0 (`toBeCloseTo(0,12)`) and
  `yearsToRegular`/`fireNumber`/`householdFireAge`/`progressPercent` == the 100%-general reference.
- (c) two-frame agreement: `householdFireAge` vs `crossovers.regular.age` ± 1 yr, all four personas.
- (d) honesty ratchet, frame-only leg: with OLD inputs forced (healthcare 14%, weights 60/20/10/10,
  step-up 0), `needReal_new >= needReal_old` and `householdFireAge_new >= old`, using the
  pre-change golden-master constants captured below.

### Pre-change reference constants (measured on this branch BEFORE any edit, DEFAULT lens, stored target age)
| Persona | anchor | target | fireNumber | corpusOnlyYearsToRegular | householdFireAge | crossover.regular.age | needReal | needNominal | requiredMonthlyReal |
|---|---|---|---|---|---|---|---|---|---|
| sharmas | 30 | 47 | 105,982,068 | 25.6667 | 56 | 52 | 105,982,068 | 285,385,628 | Infinity |
| mehtas | 45 | 47 | 102,333,391 | 5.3333 | 51 | 45 | 102,333,391 | 114,981,798 | Infinity |
| iyers | 38 | 55 | 80,319,726 | 18.9167 | 57 | 52 | 80,319,726 | 216,282,772 | 148,264 |
| mauryas | 44 | 50 | 113,310,486 | 23.5 | 68 | 60 | 113,310,486 | 160,733,090 | Infinity |

Basket today 7.900%, CPI 6.000%, g 1.792%/yr. New basket 6.240% ⇒ g 0.22642%/yr.

## E. `healthcareCorpusReservationPercent` audit (derive.ts:481, default 0.2)
The alleged triple-count is (1) the healthcare bucket RATE inflating ongoing medical spend,
(2) this 20%-of-base corpus reservation, (3) the auto-flowed insurance premium already sitting in
`expenses.recurring` and therefore already capitalised at SWR into `baseFireNumber`.

Finding — **NOT clearly a double-count once the re-grounded inputs land; leave at 0.2.**
- Leg (1) is neutralised by this very change: healthcare drops 14% to 9% at weight 20% to 8%, so the
  bucket now contributes `0.08 x (9%-6%) = 0.24 pp` of excess over CPI to the basket instead of
  `0.20 x (14%-6%) = 1.60 pp`. The compounding overstatement FinTech HIGH-4 pointed at is gone by
  arithmetic, not by cutting the reservation.
- Leg (3) funds a DIFFERENT thing: the premium is the price of cover and is fully capitalised;
  the reservation is the out-of-pocket / uninsured-excess SHOCK buffer that no premium pays.
  They are disjoint risks, so counting both is not double-counting.
- Direction: cutting 0.2 to 0.1 would lower `needReal` ~9% for every household — an OPTIMISTIC move
  on a Tier-0 figure, made on a "not clearly" verdict. `goal-anchored-decisions.md` forbids that.

Recorded in the code comment at `derive.ts` and reported in the Phase-1 report.

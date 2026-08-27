# ADR-0006 Phase 1b — plan (consumer map + RED-first tests)

Branch `feat/adr-0006-honest-inflation-frame`. The FinTech fix-round on the Phase-1 kernel.
Commit per item with `[skip ci]`. No push, no PR, no Playwright.

## 0. Baseline captured BEFORE any edit (Phase 1 + Phase 2, HEAD `eb3af7e`)

Default product lens, stored target age.

| Persona | anchor→target | fireAge (frac) | fireNumber | needReal | needNominal | base / goals / hc | requiredMonthlyReal | MC p50 vs det |
|---|---|---|---|---|---|---|---|---|
| Sharmas | 30→47 | 55 (54.42) | ₹10.60 Cr | ₹11.01 Cr | ₹29.66 Cr | 6.64 / 3.04 / 1.33 Cr | ∞ | 25.25 vs 24.42 |
| Mehtas | 45→47 | 51 (50.58) | ₹10.23 Cr | ₹10.28 Cr | ₹11.55 Cr | 7.74 / 0.99 / 1.55 Cr | ∞ | 5.83 vs 5.58 |
| Iyers | 38→55 | 57 (56.83) | ₹8.03 Cr | ₹8.35 Cr | ₹22.48 Cr | 5.73 / 1.47 / 1.15 Cr | ₹1,46,273 | 20.08 vs 18.83 |
| Mauryas | 44→50 | 69 (68.33) | ₹11.33 Cr | ₹11.49 Cr | ₹16.29 Cr | 7.58 / 2.39 / 1.52 Cr | ∞ | 25.58 vs 24.33 |

## 1. Root-cause + consumer map (plan-before-coding.md — drawn BEFORE the first edit)

### HIGH-1 — one basket rate applied to three differently-inflating components
ROOT: `derive.ts` sums three today's-₹ components into ONE scalar `fireNumber`
(`baseFireNumber` + `familyLayerCorpus` + `healthcareReservation`) and `toNominalTarget`
(derive.ts:690) grows the WHOLE scalar at the household basket `b`. An education goal must grow at
`educationInflation` (9%), the healthcare reservation at `healthcareInflation` (9%), the perpetual
base at `b`. Every downstream figure inherits the single rate.

CONSUMERS of the nominal target (all must move to the component sum):
- `derive.ts` `corpusOnlyYearsToRegular` / `yearsToLean` / `yearsToFat` (only Regular is
  component-built; Lean/Fat are variant multiples of the pure expense line ⇒ basket, unchanged)
- `derive.ts:782` bridge `corpusScale` drifted target
- `derive.ts:831` `projectCorpus` regular target (assertion-3 two-frame agreement)
- `required-contribution.ts` `needReal` / `needNominal` / `needBaseReal` / `needPlannedGoalsReal` /
  `needHealthcareReservationReal` / `netAnnualExpensesReal`
- `individual-fire.ts` (own target build)
- `useFireDerive.ts` MC `targetGrowthRate`, `lever-impact.ts` `targetGrowthRate`,
  `useAcceleration.ts` — these carry a SCALAR drift; they get the household's EFFECTIVE
  (component-weighted) drift so they stay in one frame.
- ADR §2 sentence justifying education weight 0.

MECHANISM: a `TargetComponents` resolver in `derive.ts` returning, for a fractional year `t`,
`{ base, plannedGoals, contingency, healthcareReservation, total }` in NOMINAL rupees:
`base·(1+b)^t + Σ goal_i·(1+rate(bucket_i))^t + contingency·(1+b)^t + hcRes·(1+hc)^t`.
`fireNumber` (today's ₹, t=0) is unchanged by construction — the size does not move, the
TRAJECTORY does. `projectCorpus` gains an optional `regularTargetSchedule` so the chart reads the
same resolver.

RED-first: `derive.component-target.spec.ts` — a synthetic household with ONE education goal at
year T asserts `needPlannedGoalsReal == todayAmount × (1.09/1.06)^T` and that
`base + goals + hc == needReal` to the rupee.

### HIGH-2 — `retireByAgeRequiredSIP` is a second, un-migrated solver
ROOT: `adequacy.ts:193-220` builds its own constant-target / `rate/12` / no-step-up FV-annuity.
Grep: the ONLY consumer is `WhatIf.vue:273`. ⇒ delete the function + its 6 specs; WhatIf calls
`requiredMonthlyContributionFor` (the ONE solver). `educationAdequacy`'s `requiredSIP` keeps its
`r/12` bug — fixed to `(1+r)^(1/12)−1` (consumer: `FamilyLayerCard.vue`, read-only).
RED-first: `adequacy.spec.ts` requiredSIP effective-rate case; `WhatIf.shared-target-age.spec.ts`
gains a source assertion that WhatIf imports the shared solver and no longer imports adequacy.

### HIGH-3 — value-sniffed migration re-applies forever
ROOT: `stores/assumptions.ts:35-38` keys off the VALUE (`=== 0`), so a deliberate 0 is lifted to 2
on every hydrate. FIX: a persisted `assumptionsMigratedV: 1` stamp inside the assumptions document
(optional field on `assumptionsSchema`, so the server's shared strip-mode Zod keeps it).
RED-first: `stores/assumptions.spec.ts` — set 0 → persist → re-hydrate → still 0, twice; plus the
exact Preferences §Core scenario Phase 2 added (a 0 typed in the step-up field survives reloads).

### MEDIUM-6 — Coast discounts a CONSTANT target
ROOT: `coast-fire.ts:64,81`. FIX: optional `targetDriftRate` ⇒ discount at the NET rate
`(1+r)/(1+g)−1`. Consumers: `FireMilestonesCard.vue` (add `fire.realTargetDriftRate`),
`empty-partial-state-sweep.spec.ts` (drift absent ⇒ byte-identical).

### MEDIUM-7 — `stress-test.ts` runs a scalar pre-ADR model
ROOT: `calculateFIRENumber(expenses, swr)` target, no drift, no step-up, no family layer ⇒ its
absolute `yearsToFire` contradicts the hero. FIX: optional kernel triple
(`fireNumberToday`, `targetGrowthRate`, `contributionSchedule`, `expectedReturnSchedule`).
Consumers: `StressTest.vue:33`, `NudgeStack.vue:107` — ARGUMENT-ONLY additions (see deviations).

### MEDIUM-4 — MC contributions are not CPI-re-indexed
ROOT: the nominal kernel pays `C_real(y)·(1+π)^y` at month `12y+j`; deflated continuously that is
`C_real(y)·(1+π)^{−(j+1)/12}`. The CPI-real band pays the un-discounted `C_real(y)`, so it is
optimistic by the within-year factor `(1/12)Σ_{k=1..12}(1+π)^{−k/12}` ≈ 0.9677 at 6% (3.2% of
contributions). FIX: `derive()` exports `bandContributionSchedule` (the CPI-re-indexed real
schedule); `useFireDerive`, `headline-plausibility`, `lever-bands`, `lifecycle-digest` mirrors use
it. `fire-math.ts:338-339`'s "reproduces the real path EXACTLY" comment is corrected to
"exactly for RETURNS; contributions carry a year-start CPI step".

### MEDIUM-5 / MEDIUM-8 / LOW-9 / LOW-10 / LOW-11 — comment + guard + test work
Named in the brief; each is a single-file change with the spec beside it.

## 2. Build sequence (one commit per item)
1. HIGH-1 (kernel component target) — the biggest blast radius, done first so every later
   re-baseline is measured against the final trajectory.
2. HIGH-3 (store migration) — independent.
3. HIGH-2 (one solver on WhatIf) — depends on nothing but touches a `.vue`.
4. MEDIUM-6, MEDIUM-7, MEDIUM-4, MEDIUM-5, MEDIUM-8, LOW-9/10/11.
5. Gates: `npm run type-check`, `npx vitest run`, `cd server && npm run type-check && npm run lint
   && npm run test:unit`.

## 3. Verification
Per item: targeted vitest RED first, then green. At the end the full suite + the four-assertion
lock + the golden master; every re-baseline explained per persona in
`ADR-0006-PHASE1B-REPORT.md`. Hard guards: every persona ≤ 70 and ≤ planToAge; no substance
assertion loosened silently.

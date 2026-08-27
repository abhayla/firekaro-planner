# ADR-0006 Phase 2 — plan (UI, copy, coherence, migrations)

Branch `feat/adr-0006-honest-inflation-frame`. Phase 1 (kernel/inputs/tests) is committed and is
FROZEN — `derive.ts`, `fire-math.ts`, `required-contribution.ts`, `individual-fire.ts`,
`monte-carlo.ts`, `types/assumptions.ts` are not edited here (a discovered BUG is reported, not fixed).

Phase 2 delivers what Phase 1's §8 "Open risks" listed: one real return on screen (#180), the
first-class unreachable state (ADR item 4), copy that matches the frame, the Preferences/glossary
disclosure, and the existing-user migrations (plan-baseline, lifecycle digest, server nudges).

## 0. What the kernel now hands the UI (the ONE frame, from `useFireDerive`)

| Field | Value on defaults | Meaning |
|---|---|---|
| `householdInflation` | **0.0624** | your spending basket (74/8/0/18 over 6/9/9/6) — the rate the FIRE target grows at |
| `a.values.inflation` | 0.06 | general CPI — the display deflator ONLY |
| `realTargetDriftRate` | **0.0023** | `(1+basket)/(1+CPI) - 1` — how fast the target rises in today's rupees |
| `realBlendedReturn` | per household | `(1+r)/(1+CPI) - 1` — **the ONE real return every display surface must read** |
| `blendedReturn` | per household | nominal |
| `req.needReal` / `needNominal` | at target age | today's rupees AT the target age (carries `(1+g)^T`) / the same in target-year rupees |

Rule for every surface below: **basket -> expenses/target; nominal return -> corpus; CPI -> display
deflation only.** No screen may deflate anything at the basket (that is #180).

## 1. Item 1 — #180: one real return on screen

| File:line | Today | Must become | Source |
|---|---|---|---|
| `FireMilestonesCard.vue:59-63` | `realReturnForCoast(fire.blendedReturn, assumptions.householdInflation())` — deflates at the **basket** (6.24%) while the hero deflates at **CPI** | `fire.realBlendedReturn.value` — the kernel's one real return, read straight | `useFireDerive().realBlendedReturn` |
| `coast-fire.ts:99-101` | `nominalReturn - inflation` (arithmetic) | `(1 + nominal)/(1 + generalInflation) - 1` (geometric) + param renamed `generalInflation`, so ANY caller reproduces the kernel exactly | — |
| `coast-fire.spec.ts:92-104` | pins `0.031` / `-0.05` (arithmetic) | re-baselined to the geometric values **+ a new assertion** that the helper equals the kernel formula | — |
| `empty-partial-state-sweep.spec.ts:120` | `realReturnForCoast(equityReturn, k.householdInflation)` — the two-rate bug reproduced in a spec | `realReturnForCoast(equityReturn, a.values.inflation)` | — |
| `CoastTrajectoryChart.vue:7` | "Both series are in today's rupees (real return)" | names WHICH real return (CPI-deflated, the same one the hero uses) | doc-comment |
| **NEW** `FireMilestonesCard.binding.spec.ts` | — | (a) source-scan: card reads `fire.realBlendedReturn`, never `householdInflation`; (b) **numeric: for all four seeds on the DEFAULT lens, the Coast real return equals `derive().realBlendedReturn` to 1e-9** — the detection gap that let #180 live CI-green | 4 seeds |

Other `householdInflation()` readers outside the kernel — each must LABEL the basket, not hide it:

| File:line | Verdict | Action |
|---|---|---|
| `Preferences.vue:99` (`blendedInflationPct`) | keep — it IS the basket readout | label it "your spending basket" |
| `Preferences.vue:119-123` (real return vs basket, red flag) | **wrong frame** — flags red on a number the hero never uses | show BOTH: real return vs CPI (**the frame the plan uses**) and vs your basket (informational); the warning fires only on the CPI-real number |
| `ExpenseTrendChart.vue:36` | correct (expenses vs basket) but unlabelled | dataset label -> `At your spending basket (6.2%)`, live value |
| `NudgeStack.vue:55`, `useLifecycleDigest.ts:66` | correct (actual spend growth vs the basket) but sourced from the store | read `fire.householdInflation` (the kernel's basket) so there is ONE source |
| `expense-history.ts:191` param named `generalInflation` | mislabel — callers pass the basket | rename param `expectedBasketInflation` (no behaviour change) |
| **NEW** case in `stores/assumptions.spec.ts` | — | assert `assumptions.householdInflation()` equals `derive().householdInflation` on all four seeds, so the store-sourced chart can never drift from the kernel |

## 2. Item 2 — the "unreachable at these assumptions" hero state

`FireHero.vue`. Condition (component-computed, no new math):

```
unreachableAtAssumptions = req.hasTarget && req.solved
                        && (!Number.isFinite(req.requiredMonthlyReal) || req.paceFireAge == null)
```

`requiredMonthlyReal = Infinity` covers "beyond the feasible ceiling" AND "no take-home headroom"
(`required-contribution.ts:292-301`); `paceFireAge == null` IS "the plan horizon is exhausted"
(`:32`, `:178-182`).

Renders a first-class block (`data-testid="fire-hero-unreachable"`) directly under the need line:
- **headline**: "At these assumptions you don't get there by {targetAge}." — no number is printed.
- **the moves**: points at the LeverPicker below + the age slider above.
- **the assumptions**: `RouterLink to="/preferences#pref-section-inflation"` naming the three drivers
  (your spending basket, expected returns, your savings step-up).
- Everything else is untouched: the need line, the four tiles ("Do this" keeps `Move the age`), the
  confidence band, the bridge subline, the pace annotation, the KPI strip.

`FireHero.binding.spec.ts` gains a lock: the block exists, is gated on the two honest signals, prints
no `formatINRCompact(req.requiredMonthlyReal)`, and links to the inflation preferences anchor.

## 3. Item 3 — copy that is now factually wrong

The true sentence, everywhere: **expenses grow at YOUR spending basket (6.2% by default, shown live
from the kernel — never hard-coded); the corpus grows at the expected return; savings grow at
inflation plus your real step-up; figures are shown in today's rupees (deflated at general inflation).**

| File:line | Before | After |
|---|---|---|
| `quick-number-copy.ts:244-250` (step 4) | "…grow at 12.0% for N years; then we remove 6% inflation so you compare like with like" | "…grow at 12.0% for N years, while the number itself keeps rising with **your spending basket (6.2%)**; we then show everything in today's rupees (deflated at 6% general inflation) — {have}." |
| `quick-number-copy.ts:251-253` (step 5) | "The scary number others quote (X) is the same thing in {year} rupees. We show both and plan in today's." | "…is the same target grown at your basket to {year} rupees. We show both; the today's-rupee figures are the same plan deflated at general inflation." |
| `quick-number-copy.ts` `assumptionsLine` | "6.0% inflation · 12.0% return · …" | "6.0% general inflation (your spending basket 6.2%) · 12.0% return · …" — needs a new `householdInflation` field on `ExplainerInput` |
| `whySoBigBullets` bullet 3 | "Healthcare and help … rise faster than everything else" | keep the claim, ground it: healthcare 9%/yr inside the basket + the 20% shock reserve |
| `QuickResult.vue:169` | "What you'll have vs what you'll need · today's money" | "What you'll have vs what you'll need · today's rupees (the need rises with your spending basket)" |
| `QuickResult.vue:196` legend | "■ need" | "■ need (rises with your basket)" — the line already comes from `r.needReal` per sampled age, i.e. the kernel's drifted need; no math change |
| `FireProjectionChart.vue:189` | "corpus & targets deflated to today's purchasing power (general inflation)" | + "the target still rises here — your spending basket grows faster than general inflation" |
| `CoastTrajectoryChart.vue:7` | "today's rupees (real return)" | "today's rupees — the corpus deflated at general CPI, the same real return the hero uses" |
| `QuickNumber.vue:136` | "you'd need X in today's money" | "you'd need X in today's rupees" |
| `FireHero.vue:362` | "you'll need X in today's money" | "you'll need X in today's rupees" + an inline clarifier that this is today's rupees at {targetAge}, the target having risen with the basket |
| `FireHero.vue:378` | "at X/month, today's money" | "at X/month, today's rupees" |
| `FireHero.binding.spec.ts:29-30` | matches `in today's money` | re-pointed at the new wording, assertions kept substantive (still "exactly once each") |
| `PlanVarianceCard.vue:112` label `educationInflation` | "education inflation" | "education inflation (your goals, not your retirement basket)" — weight 0 in the perpetual basket, 9% still on finite goals |
| `Preferences.vue:333-337` | "Research default is 60/20/10/10" | the ADR-0006 defaults + why (see item 4) |

`quick-number-copy.spec.ts` assertions move with the copy and stay substantive.

## 4. Item 4 — Preferences disclosure + glossary

`Preferences.vue` §Inflation:
- intro paragraph -> the four buckets with the **new** defaults (general 6 · healthcare 9 · education 9
  · housing 6) and what each drives.
- weights paragraph -> 74/8/0/18 + why disjoint (general CPI is all-items and already contains health,
  education and housing — the old 60/20/10/10 double-counted, which produced the 7.9% basket).
- one-line "why 9% healthcare": CPI-Health runs 4-7%; +3-4 pp for private-tariff and retiree mix. The
  13-14% figure is the insurers' claims-cost trend and lands on your **premium** line, which already
  flows into expenses.
- one line: education inflates your **goals** (finite), not your perpetual retirement basket — hence
  weight 0 with the 9% rate retained.
- blend alert -> "This is the rate your FIRE target grows at (your spending basket)."
- **NEW** savings step-up field (the ADR requires a deliberate 0 to be re-settable) in §Core, with the
  help text: default **2% real per year, tapering to 0 at age 50**, because the old model assumed zero
  real wage growth for 25-40 years while expenses grew — a matched pessimism.
- §Returns alert -> both real returns, warning on the CPI-real one only (item 1).

`glossary.ts`: `inflation-bucket` re-grounded (its "healthcare ~8%, education ~10%, housing ~5%" is now
wrong); `parents-bucket` healthcare rate corrected; **NEW** `spending-basket` and `savings-step-up`
entries + their `GLOSSARY_CATEGORY` rows.

## 5. Item 5 — existing-user migrations (before deploy)

**Frame tag.** `FRAME_VERSION = "adr-0006"` in `plan-variance.ts` (plan baseline) and in
`lifecycle-digest.ts` (digest snapshot). Both documents gain an optional `frameVersion?: string`;
absent means captured under the old frame.

**(a) plan-baseline.** `captureBaselineFrom` stamps `frameVersion`. New pure predicate
`isBaselineFrameCurrent(b)`. `FireHero.vue` + `PlanVarianceCard.vue` treat a stale-framed baseline as
NOT usable for a verdict: the hero's "Vs your plan" slot renders
**"your plan was locked under the old model — re-lock to compare"** with the lock button; the card
renders its empty/explainer state with the same sentence. **Never silently re-lock; never a number.**
Spec: `plan-variance.spec.ts` gains frame-tag cases; `FireHero.binding.spec.ts` locks the copy.

**(b) lifecycle-digest.** `captureSnapshot` stamps `frameVersion`. `computeLifecycleDigest` returns the
quiet digest when `baseline.frameVersion !== current.frameVersion` (the same path as "no baseline"), and
`useLifecycleDigest.ensureBaseline()` RE-BASELINES silently when the stored snapshot is stale-framed —
so the first run after deploy emits no spurious "since you were away" delta. Spec in
`lifecycle-digest.spec.ts`.

**(c) server.** Audit of `lifecycle-evaluator.ts`:
- `milestone` — keyed on `progressPercent` = `corpus / fireNumber`; **`fireNumber` is unchanged
  by ADR-0006** (Phase 1 §1). No wave.
- `annual_review` — fires once per FY regardless of the frame. No wave.
- `offtrack` — **the real risk**: the frame moves every projected FIRE age LATER, so users cross
  `projectedFireAge > targetRetirementAge + 0.5` en masse, and the template ATTRIBUTES it to
  "a low savings rate" / "rising expenses" — a false attribution when the cause was a model change.
  Fix: suppress `offtrack` for the whole FY in which the frame changed (`ADR_0006_FRAME_CHANGE_FY`,
  derived from a dated constant via the existing `financialYearOf`). Deterministic (`now` is injected),
  self-expiring at the next FY, and it never suppresses a genuine, honestly-attributed drift later.
  Spec in `lifecycle-evaluator.spec.ts` (fires outside the FY, suppressed inside it).

## 6. Item 6 — SCREEN-STANDARD v1.6

New changelog row: **one-frame honesty** (every display surface reads the kernel's ONE real return and
names the basket) + **the unreachable-at-these-assumptions hero state** (never a fabricated number;
points at the moves AND the assumptions) + **basket disclosure in Preferences** + **frame-tagged
baselines** (a document captured under an old model gets an honest re-lock prompt, never a delta).
Status line -> v1.6; the FIRE-dashboard + quick rows in §11 gain the pointer. `docs/PROJECT-LOG.md`
gets NO entry (owner writes it).

## 7. Edit order (one commit per item, all `[skip ci]`)

1. #180 one real return (+ the identity specs) — the live honesty bug first.
2. The unreachable hero state (+ binding lock).
3. Copy sweep (+ spec re-points).
4. Preferences disclosure + step-up field + glossary.
5. Migrations: plan-baseline, digest, server evaluator (+ specs, + server gates).
6. SCREEN-STANDARD v1.6.
7. Full gates: root `type-check` + `vitest run`; `server` `type-check` + `lint` + `test:unit`.

## 8. Guards honoured

Vuetify: no `variant="text"` on cancel-class buttons; three-state render preserved; defensive `?.` /
`?? 0`; no `Infinity`/`NaN` ever rendered as a literal (the unreachable state exists precisely so a
sentinel is never printed). No kernel file is edited. No spec's substance assertion is loosened
without a stated reason.

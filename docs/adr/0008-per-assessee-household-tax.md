# ADR-0008 — A household's income tax is the SUM of each earner's own tax, never one pooled filer

- **Status:** Accepted
- **Date:** 2026-09-29
- **Issue:** gh #87
- **Supersedes in part:** the single-aggregate-earner tax model documented inline in `derive.ts`
  (the comment "consistent with this engine's single-aggregate-earner model")

## Context

`src/lib/derive.ts` built the household's annual income tax with ONE `recommendRegime` + ONE
`computeTax` call over pooled income:

```
grossIncome = Σ salaries + Σ business shares + Σ other-taxable − rental collapse
```

India does not tax households. Each adult is a separate assessee: their own income, their own
deductions, their own regime election, their own basic exemption, their own ₹50k salaried standard
deduction, their own §87A rebate, their own slab ladder.

Pooling therefore does three wrong things at once for a household with two or more earning adults:

1. The second earner's income is taxed at the first earner's marginal rate rather than starting
   again at the bottom slab.
2. Only ONE basic exemption and ONE standard deduction are granted for the whole household.
3. Only ONE §87A rebate is available, so a low-earning second adult who would owe ₹0 in reality
   contributes tax through the pool.

Every one of those errors runs in the same direction: **too much tax**. Too much tax means too
little `annualSavings`, which means a FIRE date reported LATER than the truth and a prescribed
monthly contribution HIGHER than the truth. For the salaried-accumulator persona this product
exists to serve — very often a dual-income household — that is a Tier-0 honesty defect, not a
rounding issue.

Measured on the seeds (default lens, FY 2025-26, `asOfDate` 2026-04-01):

| Seed | Earners | Pooled tax (before) | Per-assessee tax (after) | Phantom tax removed |
|---|---|---|---|---|
| Sharmas | 2 | ₹11,65,840 | ₹7,16,560 | ₹4,49,280 |
| Iyers | 2 | ₹8,81,400 | ₹6,31,800 | ₹2,49,600 |
| Mehtas | 2 | ₹19,99,140 | ₹13,57,200 | ₹6,41,940 |
| Mauryas | 1 | ₹10,44,014 | ₹10,44,014 | ₹0 (byte-identical) |
| Ravi | 1 | ₹0 | ₹0 | ₹0 (byte-identical) |

A second, related incoherence: `/tax-planning` rendered per-earner cards from its own per-member
computation while its household headline used the pooled figure, so the screen's own table did not
sum to the screen's own total, and neither agreed with the dashboard headline.

## Decision

Introduce ONE shared derivation, `perAssesseeHouseholdTax` in `src/lib/tax-deductions.ts`, which
returns a tax return per earning adult plus their sum. `derive.ts`, `/tax-planning`'s household
total and `/tax-planning`'s per-earner cards all read it, so the three can never diverge again.

### Attribution rules (the same conventions `individual-fire.ts` and `deductionsForMember` use)

| Source | Attributed to |
|---|---|
| Salary | the earner's own `salary.annualCTC`, 100% |
| Other income / business | `ownerId === member` at 100%; `ownerId === "Joint"` at that member's COMPLEMENTARY split share (anchor gets `split`, the other `1 − split`, so the shares always sum to exactly 1) |
| Unowned row (owner matches no in-scope member and is not "Joint") | the ANCHOR adult (the first earning adult in member order) |
| Rental §24a/§24b/§71 collapse | split by the same complementary share as Joint income |
| Deductions | `deductionsForMember` — the #204 helper, the exact bundle the per-earner card renders |
| Standard deduction | granted only to an adult who actually draws a salary (`isSalaried`), so a business-only or capital-income-only adult is not handed a ₹50k salaried deduction they cannot claim |
| Regime | each adult elects their own cheaper of OLD/NEW |

The unowned-row rule is stated explicitly because the alternative — dropping the row — would make
income vanish from the tax base while still counting as cash. That is the optimistic direction, so
it is refused.

### Roll-up for existing consumers

`fyTax` and `householdTaxRecommendation` keep their shapes so `fire.fyTax`, the dashboard tax tile,
the nudge stack, the lever catalog and the lifecycle digest are untouched. They are a ROLL-UP of the
per-assessee returns, not a second derivation: `totalTax` is the sum, `taxableIncome` and
`estimatedDeductions` are sums, the reported regime is the LARGEST earner's election, and
`effectiveRate` divides the real household tax by the real household taxable gross.

`householdMarginalRate` now reads the LARGEST assessee's own slab on their OWN taxable income. On
the pooled model it was read off the household total, which sat one or two brackets too high for a
dual-earner household and quietly over-taxed both the NPS annuity offset and the EPF yield drag.

## Consequences

**Single-earner households are byte-identical** — one assessee is one `computeTax` over the same
gross. Mauryas and Ravi do not move at all, which is the no-op guarantee the specs assert.

**Dual-earner headlines move, all in the honest direction** (tax down ⇒ savings up ⇒ FIRE earlier ⇒
prescription lower). `fireNumber`, `totalCorpus` and `anchorAge` are UNCHANGED for every seed — the
target's size never moved, only how fast the household reaches it, which is the signature of a
cashflow change rather than a target change.

The `#225` cash identity `annualIncome.total − annualTax === annualSavings + annualExpensesToday`
still closes to ±₹1 on every seed, and the attribution conserves taxable income: the assessees'
grosses sum to the household's own taxable gross.

**One accepted simplification, named:** the OLD/NEW comparison on `/tax-planning` now runs
assessee-by-assessee under each forced regime and sums, so it answers "what would this household
pay if every adult filed OLD?" rather than a question about a pooled filer who does not exist. A
per-earner regime OVERRIDE (one adult OLD, the other NEW) remains unbuilt — the screen's own caption
already says production would allow it.

## Guards

- `src/lib/per-assessee-tax-coherence.spec.ts` — Σ per-assessee tax === `derive().annualTax` to the
  rupee on every seed; dual-earner strictly below the measured pooled figures (written into the spec
  as the defect's own evidence, so a regression to pooling trips it); single-earner byte-identical;
  attribution conserves taxable income.
- `src/lib/derive.spec.ts` → `#87 -- per-assessee household tax (direction locks)` — sum identity,
  one return per earning adult, the #225 cash identity.
- `src/lib/headline-golden-master.spec.ts` — re-baselined field by field (see the commit body).
- `src/lib/headline-plausibility.spec.ts` — all 89 sane-bounds bands hold unchanged; no band was
  widened. The #218 savings baselines were re-recorded by exactly the tax delta, to the rupee.
- `src/lib/inflation-frame-invariant.spec.ts` — the Sharmas' live prescription re-recorded from
  `Infinity` to ₹2,68,414 with the term named: the plan became reachable because the kernel stopped
  inventing a tax bill, not because the kernel started inventing reachability.

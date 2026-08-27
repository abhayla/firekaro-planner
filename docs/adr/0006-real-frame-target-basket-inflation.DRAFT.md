# ADR 0006 — Real-frame FIRE target grows at the household basket; returns deflate at general CPI

> **DRAFT — not committed.** Numbering note: `docs/adr/0005-plan-baseline-entity.md` already exists on
> `main`. This ADR must land as **0006** unless that file is renumbered. The title is kept as briefed.

> **STATUS: DRAFT — DECISION PENDING ABHAY (2026-08-27 14:10 IST).** FinTech validation verdict: **SOUND-WITH-CHANGES** — the diagnosis + arithmetic are verified (Sharmas 71 / Mauryas 93 under Option B reproduced independently; B ≡ the #20 model), but the PRESCRIPTION (Option D) is rejected: the root cause is (CRITICAL-1) the four inflation buckets are NON-DISJOINT — `general` is the all-items CPI which already contains health/education/housing, so the 7.90% basket double-counts by construction (a disjoint urban rebuild gives ~6.2–6.4%); (HIGH-3) 14% healthcare is an insurer claims-cost TREND (Aon/Marsh), not a price rate — CPI-Health runs ~4–7% — and applied to a fixed 20% weight it drives healthcare to 58% of the basket by year 25, contradicting the fixed weights; (HIGH-4) healthcare is probably counted three times (14% rate, +20% corpus reservation, the auto-flowed premium); (HIGH-5) dropping education moves b by only −0.12 to −0.30 pp (84% of the excess is `0.20 × (14%−6%)`); (MEDIUM-10) contributions grow at CPI = zero real wage growth for 25–40 years — a matched PESSIMISM (Aon India salary growth ≈ 3–4% real); (CRITICAL-2) the two-rate contradiction is ALREADY LIVE on the default dashboard — the Coast/Barista card deflates at the basket today (filed as its own issue). FinTech recommends **Option E**: Option-C frame (nominal end-to-end, deflate at CPI for display) + re-grounded inputs (healthcare 9%, education OUT of the retirement basket, weights 74/8/0/18 ⇒ b ≈ 6.24%, g ≈ 0.23%/yr) + `householdSavingsStepUpPercent` default 2% real tapering to 0 at 50 + a first-class "unreachable" state; OR **Option F** (time-boxed): single rate 6% everywhere, drop the basket from the kernel + the six display surfaces until re-grounded. Per-persona under E frame-only: Sharmas 57, Mehtas 51, Iyers 58, Mauryas 69 (all +0/+1, needReal +0.5–3.9%); under full E: 54 / 51 / ~55 / ~68. Changing default assumptions moves EVERY user's headline — owner decision. The text below is the pre-validation draft, kept verbatim for the record; its Option D recommendation is superseded by the verdict above.

- **Status:** Proposed (needs FinTech-analyst validation before Accepted)
- **Date:** 2026-08-27
- **Issue:** gh #167 (`bug`, `must-have`) — "Tier-0 honesty: the real-frame FIRE target is grown at 6% general CPI while the model's own household basket is ~7.9%"
- **Supersedes / amends:** the `#20` decision block at `src/lib/derive.ts:544-565` (FinTech-validated 2026-06-03)
- **Related:** ADR-0004 (temporal contributions), gh #20, gh #22, gh #18, T-377 (QN-2 gap hero), T-379 (QN-5 levers)

---

## 1. Context

### 1.1 What the kernel does today (exact mechanics)

**The target is a constant in today's rupees.**

- `derive.ts:456` — `netAnnualExpenses = max(0, annualExpensesToday − npsAnnuityIncome)`.
- `derive.ts:460` — `baseFireNumber = calculateFIRENumber(netAnnualExpenses, effectiveSWR, anchorAge)`, i.e. `fire-math.ts:179-187` → `annualExpenses / swr`.
- `derive.ts:485-489` — `fireNumber = baseFireNumber + familyLayerCorpus + healthcareReservation` (`calculateFireTarget`, `fire-math.ts:163`).
- `annualExpensesToday` is a **today's-rupee** figure (`derive.ts:292`, `derive.ts:418`). Nothing in the accumulation path ever inflates it. `fireNumber` is therefore a fixed today's-rupee scalar for the whole horizon.

**The corpus is grown in a CPI-real frame.**

- `derive.ts:559-565` — the `#20` block:
  ```ts
  const householdInflation = resolveHouseholdInflation(assumptions);   // 559 — the 4-bucket blend
  const generalInflation   = assumptions.inflation;                    // 560 — 6%
  const toRealReturn = (nominal) => (1 + nominal) / (1 + generalInflation) - 1;   // 561
  const realReturnSchedule = ... toRealReturn(expectedReturnSchedule) ...;        // 562-565
  ```
- `derive.ts:572` — `realBlendedReturn = toRealReturn(blendedReturn)` (feeds the #18 Monte Carlo band).
- `derive.ts:632-641` — `calculateYearsToTarget(fireWithdrawableCorpus, fireNumber, householdContributionSchedule, realReturnSchedule)` for regular / lean / fat. `fire-math.ts:211-240` compounds monthly at `realReturn/12` and adds a **constant real** monthly contribution.
- `derive.ts:763-765` — `householdFireAge = anchorAge + ceil(yearsToRegular)`.

**The chart runs the same model in the nominal frame, then deflates for display.**

- `derive.ts:741-753` — `projectCorpus({ expectedReturns: expectedReturnSchedule /* NOMINAL */, inflation: generalInflation, annualExpensesToday, swr, ... })`.
- `fire-math.ts:353-355` — `inflated = annualExpensesToday * (1+inflation)^y; target = inflated / swr`. So the chart grows expenses at **6%** and the corpus at the **nominal** return.
- `useFireDerive.ts:417-420` — `deflateProjectionPoints(projection, a.values.inflation, real)` divides every ₹ series by `(1+CPI)^y`; its header (`useFireDerive.ts:30-38`) explicitly states the deflator "MUST be GENERAL CPI … NEVER the 4-bucket blend (#20)".

Headline and chart therefore **agree by construction**: growing a constant real target at 0% while deflating returns at 6% is algebraically the same as growing a nominal target at 6% and the corpus at the nominal return. That agreement is real, and it is the only thing the current design buys.

**The household basket the same model computes and does not use here.**

- `assumption-math.ts:14-24` — `resolveHouseholdInflation` = `blendedInflation({general, healthcare, education, housing}, weights)`.
- `fire-math.ts:104-133` — default weights `general 0.6 · healthcare 0.2 · education 0.1 · housing 0.1`; with research defaults `6 / 14 / 9 / 6 %` the blend is **7.90%** (measured, all four seeds — §4).
- `householdInflation` is consumed in exactly **one** place in the accumulation-facing kernel: `derive.ts:736`, the Floor/Ceiling **decumulation** overlay config. That is an intentional asymmetry documented at `derive.ts:553-558`.

**Where the number is spoken to the user.**

- `required-contribution.ts:171-175` + `:290` — `inflator = (1+assumptions.inflation)^yearsToTarget`; `needNominal = round(needReal × inflator)`. The "scary number" is grown at **6%**, not the basket.
- `FireHero.vue:362` — "you'll need **{needReal}** in today's money"; `quick-number-copy.ts:248-253` — "…we show both and plan in today's".

### 1.2 The `#20` history — why both sides were collapsed to CPI

The comment at `derive.ts:544-558` is the record. Quoting it:

> the headline grows TODAY's corpus to a TODAY's-rupee `fireNumber`, so it MUST compound at a REAL return … The deflator MUST be GENERAL CPI … NOT the 4-bucket household EXPENSE blend (~7.9%, lifted by 14% healthcare). Deflating MARKET RETURNS by the healthcare-weighted expense basket is a modeling error: it crushed the real return to ~0.9% and made FIRE look unreachable (~age 115) for the seed personas (#20, FinTech-validated 2026-06-03).

That is exactly reproducible today. Sharmas' blended nominal return is **9.673%** (measured); `1.09673 / 1.079 − 1 = 1.644%`. For the Mehtas it is **7.694%** nominal → `1.07694 / 1.079 − 1 = −0.191%` — **negative**. A household whose portfolio cannot out-earn its own assumed spending basket never reaches a fixed multiple of that basket, at any contribution. Age 115 was not a bug in the arithmetic; it was the arithmetic reporting an unpalatable assumption set.

The `#20` fix resolved the tension by **changing the expense side to 6%** rather than by carrying two rates. It kept the headline reachable and the chart coherent, at the cost of contradicting `resolveHouseholdInflation`.

### 1.3 The honesty problem

The FIRE target is `expenses / SWR`. If expenses grow at 7.90% while the deflator is 6%, the **real** target is not constant — it drifts up at

```
g = (1 + 0.0790) / (1 + 0.0600) − 1 = 1.792 % / year   (measured, all four seeds)
```

Every prescriptive figure inherits the understatement:

- `needReal` (drives the whole T-377 hero and the QN-4 chart) is short by `(1+g)^T`.
- `needNominal` is short by `((1+basket)/(1+CPI))^T` on top of being grown at the wrong rate.
- `requiredMonthlyReal` (`required-contribution.ts:239-275`) solves against the understated target, so the "invest ₹X/month" instruction is too small.
- `householdFireAge` is too early.

**The direction is optimistic in every case.** Per `.claude/rules/goal-anchored-decisions.md`, an optimistic error for the salaried accumulator makes them under-save and is Tier-0 regardless of fix size. T-377 turned this from a displayed number into a **prescription**, which is why #167 was filed rather than tolerated.

---

## 2. Options

Notation for one 1-year step, all figures at the household level:
`E₀` today's annual expenses (net of NPS annuity), `s` = SWR, `T₀ = E₀/s` today's target,
`r` nominal blended return, `π` general CPI (6%), `b` household basket (7.90%), `C` monthly real contribution.

### Option A — keep as-is (`#20` status quo)

**Math, year 0 → 1**

```
target₁ = T₀                                     (constant, today's ₹)
corpus₁ = corpus₀ · (1 + (1+r)/(1+π) − 1) + 12·C
```
Equivalently in nominal terms: `target₁ = E₀(1+π)/s`, `corpus₁ = corpus₀(1+r) + 12·C(1+π)`.

**Pros**
- Headline (`calculateYearsToTarget`) and chart (`projectCorpus` → `deflateProjectionPoints`) are provably identical — no crossover drift.
- FIRE is reachable for every seed persona; golden master and `headline-plausibility` are green.
- Real return is comfortably positive for all four personas (1.60% – 4.88%), so bisection brackets well.

**Cons — and why it is rejected**
- It asserts two contradictory things at once: "your spending basket inflates at 7.9%" (used at `derive.ts:736` for the retiree) and "your spending basket inflates at 6%" (used for the target you are saving toward). One of the two is wrong for the same household in the same run.
- The error is **optimistic** and **prescriptive** (§1.3, §4). Tier-0.
- It hides the real disagreement (is 14% healthcare inflation for 30 years credible?) inside a frame choice, where no reviewer sees it.

**Rejected.**

### Option B — deflate returns at CPI, grow the real target at `g = (1+b)/(1+π) − 1`

**Math, year 0 → 1**

```
g        = (1+b)/(1+π) − 1                       = 1.792 %
target₁  = T₀ · (1+g)                            = T₀ · 1.01792
target_t = T₀ · ((1+b)/(1+π))^t
corpus₁  = corpus₀ · (1 + (1+r)/(1+π) − 1) + 12·C
```

**The identity that matters.** Divide the crossing condition `corpus_t ≥ target_t` through by `((1+π)/(1+b))^t`:

```
corpus₀ · ((1+r)/(1+b))^t + contributions  ≥  T₀
```

Option B is **algebraically identical to deflating returns at the basket against a constant target** — which is precisely the model `#20` rejected. It is not a new model; it is the `#20` model expressed in the CPI-real frame. (Strictly: B is *slightly worse* than the literal #20 implementation, because in B the contribution stream is constant in CPI-real terms, i.e. it grows at 6% nominal, whereas a basket-real frame with a constant contribution implies it grows at 7.9%.)

**Crossover / monotonicity.** Years-to-target remains **monotone non-increasing in the contribution**: for any fixed `t`, `corpus_t` is strictly increasing in `C`, while `target_t` is independent of `C`; so the first crossing time is non-increasing in `C`. The bisection precondition asserted at `required-contribution.ts:12-17` and locked by `kernel-invariants.property.spec.ts:233-292` **still holds**. Bisection is safe.

**Reachability — this is the failure.** Reachability now requires the corpus to out-grow a moving target. Measured, on the real seeds, with the kernel's own `realReturnSchedule` and `householdContributionSchedule` (§4):

| Persona | FIRE age today | FIRE age under B |
|---|---|---|
| Sharmas | 56 | **71** |
| Mehtas | 51 | 55 |
| Iyers | 57 | **69** |
| Mauryas | 68 | **93** |

Three of four personas breach or sit on the `fireAge ≤ 70` bound at `headline-plausibility.spec.ts:70-73` ("FIRE age must be ≤ 70 (caught the #22 age-81 bug)"). The Mauryas at 93 is the `#20` failure recurring in a different frame. Yes — **FIRE can become unreachable for a normal household** under B, and does.

**Worked Sharmas example (measured; stored target age 47, anchor 30, T = 17, SWR 3.25%)**

```
E₀/s → base + goals + healthcare reservation      needReal   = ₹10.60 Cr
g = 1.792 %/yr                                    (1+g)^17   = 1.3526
needReal_B    = 10.60 Cr × 1.3526               = ₹14.33 Cr        (+35.3 %)
needNominal   (today, 6%)  = 10.60 × 1.06^17    = ₹28.54 Cr
needNominal_B (basket 7.9%) = 10.60 × 1.079^17  = ₹38.60 Cr        (+35.3 %)
real return (CPI-deflated)                        = 3.466 %/yr
target real drift                                 = 1.792 %/yr
net closing speed  = 1.09673/1.079 − 1            = 1.644 %/yr
⇒ years-to-target 25.67 → 41.00,  FIRE age 56 → 71
```

**Pros**: internally consistent with `resolveHouseholdInflation`; removes the optimistic bias; keeps monotonicity.
**Cons**: reproduces `#20`; makes FIRE unreachable-or-absurd for 3 of 4 personas; breaks the plausibility gate; forces an uncomfortable product conversation the model cannot resolve on its own.

### Option C — run the whole projection in NOMINAL terms, deflate only for display

**Math, year 0 → 1**

```
E₁       = E₀ · (1+b)                            (expenses at the basket)
target₁  = E₁ / s
corpus₁  = corpus₀ · (1+r) + 12·C·(1+π)          (savings keep pace with CPI)
display  = ÷ (1+π)^t
```

**This is the same model as B.** Dividing both sides by `(1+π)^t` recovers Option B exactly. C differs only in *which frame the code carries*, not in what it computes. Its measured outputs are therefore identical to the B table above.

**Pros over B (engineering, not math)**
- One frame end-to-end: `projectCorpus` is already nominal (`derive.ts:741-753`), `deflateProjectionPoints` is already the display seam (`useFireDerive.ts:417-420`). Only `calculateYearsToTarget` and `individual-fire.ts:196-211` would need to move to nominal, and `realReturnSchedule` becomes a display/Monte-Carlo-only export.
- The nominal frame makes the two inflation rates *visible as inputs* (expense growth `b`, savings growth `π`) instead of buried in a compound drift `g` — easier for a FinTech reviewer to audit and easier to give the user a knob for.
- `needNominal` stops being a separate `(1+π)^T` multiplication at `required-contribution.ts:171-175` and becomes a direct read off the projection — one number, one path.

**Cons**: identical reachability problem to B; larger diff (touches the headline solver, the individual-FIRE path, and every real-frame assertion); the savings-growth assumption (`π` vs `b` vs a wage-growth rate) becomes an explicit new input that today is implicit.

### Option D — the honest frame (C) **plus** a horizon-damped healthcare bucket, and an explicit unreachable state — **RECOMMENDED**

B and C prove that the frame is not the real disagreement — **the 14% healthcare assumption held flat for 30 years is**. Option D separates the two decisions:

1. **Frame:** adopt Option C (nominal end-to-end, deflate for display). Non-negotiable — it is the only internally consistent shape.
2. **Assumption:** replace the flat `healthcareInflation = 14%` on the *long-horizon accumulation* path with a **converging** path — healthcare's excess over CPI decays from 8pp today to 2pp over ~20 years. (Medical-inflation premia compress as coverage penetration and price regulation mature; a flat premium held for 30 years is the assumption no research actually supports — see open question 1.)
3. **UI:** when the damped-honest model still yields no crossing within the plan horizon, the hero says so — "at these assumptions you don't get there; here are the levers" — instead of the kernel picking a convenient rate so that a number can be printed.

**Math, year `t` → `t+1`**

```
hc_t     = π + max(0.02, 0.08 − 0.06·min(1, t/20))
b_t      = 0.6·π + 0.2·hc_t + 0.1·edu + 0.1·hou
E_{t+1}  = E_t · (1 + b_t)
target_t = E_t / s
corpus   = nominal path as in C
```

**Measured (§4.3):** `needReal` ×1.04–1.25; FIRE ages Sharmas 63, Mehtas 54, Iyers 63, Mauryas 77. Still later than today for every persona (correctly — the bias is removed), still absurd for the Mauryas (correctly — that household genuinely cannot fund a 40-year retirement at a 3.25% SWR on an 8.7% portfolio; the honest answer is "not at this plan", not age 68).

**Pros**: internally consistent AND defensible over a 30-year horizon; keeps three of four personas inside human bounds; makes the one genuinely-unreachable persona *visibly* unreachable rather than silently optimistic.
**Cons**: introduces a new assumption shape (a decaying bucket rate) that needs its own research citation; the decay curve is a judgement call that must be disclosed in the glossary per A1.4; more surface to test.

---

## 3. Recommendation

**Adopt Option D**, implemented in two separately-reviewed commits: the Option-C frame change first (mechanical, provable, re-baselineable), then the damped-healthcare assumption.

Reasoning, anchored to `.claude/rules/goal-anchored-decisions.md`:

- **The optimistic error is Tier-0 and must go, whatever it costs the demo.** The persona is the urban salaried accumulator. Telling them ₹10.60 Cr and "invest ₹X/month" when the model's own basket implies ₹14.33 Cr makes them under-save by a third. Fix size is not a reason to defer (rule 30).
- **A frame that contradicts itself cannot be defended to a user.** Today the same run says the retiree's spending grows at 7.9% (`derive.ts:736`) and the saver's target grows at 6% (`derive.ts:747`). Whichever rate is right, one of those two lines is lying to the same household.
- **But swapping the frame alone (B/C) trades an optimistic lie for a defeatist one.** Reporting FIRE at 71/69/93 for ordinary seeds is not "more honest" if the driver is an unexamined 14%-forever healthcare rate on 20% of the basket. Honesty means fixing the *assumption* the frame change exposes, not shipping the exposure.
- **Unreachable must be sayable.** The deepest lesson of `#20` is that the kernel was changed because the answer was uncomfortable. The product needs a first-class "you don't get there at these assumptions" state so the kernel is never again bent to produce a printable number.

**What stays byte-identical.** When a household's four inflation buckets are all equal to general CPI — `inflation = healthcareInflation = educationInflation = housingInflation` (e.g. all 6%) — `blendedInflation` returns exactly `π` (`fire-math.ts:111-133`: a weighted mean of identical values), so `g = (1+π)/(1+π) − 1 = 0`, and the Option-D damping term collapses because there is no excess to damp. The real target is then constant, `realReturnSchedule` is unchanged, and `calculateYearsToTarget` walks the identical loop. **Every headline field for such a household is byte-identical to today.** That is the regression lock's positive control (§6, assertion 2).

---

## 4. Numbers (measured on the real seeds)

**Method.** Throwaway spec (deleted), `derive()` + `requiredMonthlyContributionFor()` on the DEFAULT product lens (`isFamilyView:false, viewingMemberId:null, currentFY:"2025-26"`), seeds loaded exactly as `required-contribution.spec.ts:26-33` does (`loadSeedPersona` for Sharmas; `loadIyersSeed` / `loadMehtasSeed` / `loadMauryasSeed`). Target age = each persona's **stored** `targetRetirementAge`. Option-B/D FIRE ages simulated with the kernel's own `realReturnSchedule` and `householdContributionSchedule` against a drifting target; the `g = 0` case reproduces `yearsToRegular` **exactly** (25.667 / 5.333 / 18.917 / 23.500), so the simulator is the same math as `calculateYearsToTarget:211-240`.

All four personas share `basket = 7.900 %`, `CPI = 6.00 %`, `g = 1.792 %/yr`.

### 4.1 Today

| Persona | anchor | target age | T | SWR | blended nominal | real (÷CPI) | real (÷basket) | `householdFireAge` | `needReal` | `needNominal` | `requiredMonthlyReal` @ stored target |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sharmas | 30 | 47 | 17 | 3.25% | 9.673% | 3.466% | 1.644% | **56** | ₹10.60 Cr | ₹28.54 Cr | **Infinity** — unreachable at 47 (current ₹1,60,597/mo) |
| Mehtas | 45 | 47 | 2 | 3.25% | 7.694% | 1.598% | **−0.191%** | **51** | ₹10.23 Cr | ₹11.50 Cr | **Infinity** — unreachable at 47 (current ₹2,30,489/mo) |
| Iyers | 38 | 55 | 17 | 3.50% | 11.170% | 4.877% | 3.030% | **57** | ₹8.03 Cr | ₹21.63 Cr | **₹1,48,264/mo** (current ₹1,22,967) |
| Mauryas | 44 | 50 | 6 | 3.25% | 8.713% | 2.559% | 0.753% | **68** | ₹11.33 Cr | ₹16.07 Cr | **Infinity** — unreachable at 50 (current ₹1,25,915/mo) |

> Note the Mehtas' **negative** basket-real return (−0.191%): their portfolio already loses ground to their own assumed spending basket. Any consistent frame will report that.

### 4.2 Option B / C (identical math) — `needReal_B = needReal × (1+g)^T`

| Persona | `needReal` today | `needReal` under B | Δ | `needNominal` today (6%) | `needNominal` under B (7.9%) | FIRE age today | FIRE age under B | direction |
|---|---|---|---|---|---|---|---|---|
| Sharmas | ₹10.60 Cr | **₹14.33 Cr** | **+35.3%** | ₹28.54 Cr | **₹38.60 Cr** | 56 | **71** | later / higher ✓ |
| Mehtas | ₹10.23 Cr | **₹10.60 Cr** | **+3.6%** | ₹11.50 Cr | **₹11.91 Cr** | 51 | **55** | later / higher ✓ |
| Iyers | ₹8.03 Cr | **₹10.86 Cr** | **+35.3%** | ₹21.63 Cr | **₹29.25 Cr** | 57 | **69** | later / higher ✓ |
| Mauryas | ₹11.33 Cr | **₹12.61 Cr** | **+11.2%** | ₹16.07 Cr | **₹17.88 Cr** | 68 | **93** | later / higher ✓ |

**Direction check: every persona moves later and higher. No exception to flag.**

The `needReal` Δ tracks `(1+g)^T` where `T` is the horizon to the *stored target age* — hence +35.3% at `T=17` and only +3.6% at `T=2`. The **FIRE-age** move tracks the full years-to-FIRE instead, which is why the Mehtas' need barely moves while their FIRE age still slips 4 years.

**Plausibility breach:** `headline-plausibility.spec.ts:70-73` asserts `fireAge ≤ 70`. Under B: Sharmas 71 ✗, Iyers 69 ✓ (one year of margin), Mauryas 93 ✗✗. Option B cannot ship without either re-basing that bound (which rejects the gate's whole purpose) or fixing the assumption.

### 4.3 Option D (damped healthcare: excess 8pp → 2pp over 20 yr)

| Persona | `needReal` under D | ratio vs today | FIRE age today | FIRE age under D | vs option B |
|---|---|---|---|---|---|
| Sharmas | ₹13.29 Cr | ×1.254 | 56 | **63** | 71 → 63 |
| Mehtas | ₹10.60 Cr | ×1.036 | 51 | **54** | 55 → 54 |
| Iyers | ₹10.07 Cr | ×1.254 | 57 | **63** | 69 → 63 |
| Mauryas | ₹12.50 Cr | ×1.103 | 68 | **77** | 93 → 77 |

Every persona still moves **later and higher** than today (bias removed ✓). Three of four land inside the `≤ 70` bound. The Mauryas at 77 is a genuine finding about that household (single income, age 44, ₹11.3 Cr target, 8.7% portfolio, 3.25% SWR over a 40-year drawdown), not a modelling artefact — it is exactly the case the "unreachable" UI state exists for.

---

## 5. Consumer map — everything that must change or be re-baselined

### Kernel / math

| File | Note |
|---|---|
| `src/lib/derive.ts:544-565` | The `#20` block. Replace the "collapse both to CPI" decision **and its comment** with the two-rate contract; under Option C the headline moves to nominal and `realReturnSchedule` is demoted to a display/Monte-Carlo export. |
| `src/lib/derive.ts:632-641` | `calculateYearsToTarget(..., fireNumber, ..., realReturnSchedule)` — the target argument must become a schedule, or the whole call moves to the nominal frame. |
| `src/lib/derive.ts:741-753` | `projectCorpus({ inflation: generalInflation, ... })` — the `#20` justification on lines 745-746 becomes wrong; `inflation` must be the basket (or, for D, a per-year basket schedule). |
| `src/lib/fire-math.ts:211-240` | `calculateYearsToTarget` takes a scalar `targetCorpus`; needs a `targetSchedule` (or the caller pre-inflates). Preserve the `monthlySavings <= 0 → Infinity` sentinel and the 1200-month cap. |
| `src/lib/fire-math.ts:316-403` | `projectCorpus` takes a scalar `inflation`; for D it needs a per-year rate — mirror the existing `ReturnSchedule` pattern (`fire-math.ts:341`). |
| `src/lib/fire-math.ts:57-63` | `SWR_HORIZON_TABLE` step function — #167's rider. Interpolate for the slider or annotate the tile at bracket boundaries. Lower severity; rides along. |
| `src/lib/assumption-math.ts:14-24` | `resolveHouseholdInflation` becomes load-bearing on the accumulation path for the first time. D adds a horizon-aware sibling (`resolveHouseholdInflationAt(v, yearIndex)`). |
| `src/lib/required-contribution.ts:171-175, :290` | `inflator = (1+assumptions.inflation)^T` → basket-based, or read `needNominal` straight off the projection. This one line produces the "scary number". |
| `src/lib/required-contribution.ts:12-17` | The monotonicity contract comment stays TRUE (§2 Option B) but must be **re-stated for a moving target**, so the next reader does not assume it went unchecked. |
| `src/lib/individual-fire.ts:196-211` | A second, independent `(1+blendedReturn)/(1+generalInflation)` real-frame site. If not changed in the same commit, household and individual FIRE ages diverge for the same person — the exact class `feedback_cross_screen_figure_coherence` names. |
| `src/lib/bridge.ts:18` | The bridge holds "expenses flat in today's rupees" over the bridge window, and scales holdings by `corpusScale = fireNumber / totalCorpus` (`derive.ts:701`). With a drifting real target the flat-expense assumption becomes optimistic. **Must be reviewed** — even a "leave it flat, the window is short" outcome has to be a stated decision, not an omission. |
| `src/lib/monte-carlo.ts:57, :169-179` | Header contract: pass a REAL return with today's expenses; `targetCorpus` and `meanReturnSchedule` "MUST share an inflation frame". A drifting target breaks that precondition — MC needs a target schedule or a basket-deflated return. It does **not** deflate at CPI itself; it inherits whatever `derive()` hands it (`useFireDerive.ts:395-401` passes `realReturnSchedule`). |
| `src/lib/lever-catalog.ts` / `lever-bands.ts` / `lever-impact.ts` | Every lever's FIRE-date delta is measured through `derive()`; deltas shrink against a moving target. Re-verify no lever becomes inert (`project_lever_value_requires_unassumed_baseline`). |

### Composables / server

| File | Note |
|---|---|
| `src/lib/useFireDerive.ts:30-46, :417-420` | `deflateProjectionPoints`' header ("deflator MUST be GENERAL CPI, NEVER the blend") stays correct for *display deflation* but must be re-worded so it is not read as endorsing a collapsed target. |
| `src/lib/useFireDerive.ts:379, :395-401` | Re-exports `realReturnSchedule` and feeds the Monte Carlo band; frame change propagates here. |
| `server/src/lib/lifecycle-evaluator.ts` + `lifecycle-runner.ts` | Share the same `derive()` via the `@planner` alias — **no code change, but every nudge threshold, milestone band and off-track verdict moves.** Dedupe keys are period-based, so live users get a one-off wave of "your number changed" nudges unless the rollout suppresses it. Needs an explicit call before deploy. |
| `src/lib/lifecycle-digest.ts` | `captureSnapshot` / `milestoneBandFor` compare against stored snapshots — the first run after the change reports a large spurious "since you were away" delta. Migrate the baseline or suppress the first digest. |
| `src/lib/plan-variance.ts` + the `plan-baseline` document (ADR-0005) | Persisted baselines were captured under the old frame; variance will show a false regression for every existing user. |

### UI copy (all say or imply "today's money" against a target that no longer stands still)

| File | Note |
|---|---|
| `src/components/dashboard/FireHero.vue:362` | "you'll need `{needReal}` in today's money" — still true, but the number changes and the sentence should say *today's money, at your basket*. |
| `src/components/dashboard/FireHero.vue:378` | "at `{currentMonthlyReal}`/month, today's money". |
| `src/components/dashboard/FireHero.binding.spec.ts:29-30` | Locks that copy pattern; moves with it. |
| `src/components/quick/QuickExplainer.vue` + `src/lib/quick-number-copy.ts:233-253` | "…grown at 6% inflation so you compare like with like" and "we show both and plan in today's" become factually wrong. This is the user-facing explanation of the very mechanic being changed. |
| `src/components/quick/QuickResult.vue:169` (the QN-4 chart) | "What you'll have vs what you'll need · today's money" — the *need* line now slopes upward. The chart must draw a rising need curve; arguably a clarity win, but it is a real design change. |
| `src/components/charts/FireProjectionChart.vue:170` | The today's-₹ / future-₹ toggle: in real mode the target line stops being flat. |
| `src/components/charts/CoastTrajectoryChart.vue:7` | "Both series are in today's rupees (real return)". |
| `src/pages/QuickNumber.vue:136` | "you'd need `{need}` in today's money". |
| `src/components/dashboard/WhatIf.vue` (What-If projections) | Every scenario delta is measured against the moving target. |
| `src/pages/Preferences.vue` | `healthcareInflation` becomes a headline-moving knob for the first time; its help text and the D damping disclosure live here (A1.4 glossary requirement). |

### Tests to re-baseline / extend

| File | Note |
|---|---|
| `src/lib/__snapshots__/headline-golden-master.spec.ts.snap` | All four personas move (`fireAge`, `fireNumber`, `yearsTo*`, `progressPercent`, `corpusOnlyYearsToRegular`). Re-baseline **with a per-persona explanation in the commit body** — #167 acceptance requires "the movement explained per persona". |
| `src/lib/headline-plausibility.spec.ts:70-73` | The `fireAge ≤ 70` bound. Under D the Mauryas hit 77. Either the seed is re-tuned, or the bound gains an explicit justified per-persona exception, or that persona is expected to land in the "unreachable" state. **Do not silently widen the bound** — that is exactly the failure #22 created this gate to prevent. |
| `src/lib/kernel-invariants.property.spec.ts:233-292` | Monotonicity properties still hold (§2) but must be re-run and extended with a drifting-target witness. |
| `src/lib/required-contribution.spec.ts` | The round-trip proof ("feed the answer back, FIRE age ≤ target") must still pass; several personas go Infinity at their stored target and need a reachable target age chosen for the fixture. |
| `src/lib/useFireDerive.deflation.spec.ts` | Asserts the CPI-deflator contract directly. |
| `src/lib/derive.spec.ts`, `useFireDerive.seed.spec.ts`, `empty-partial-state-sweep.spec.ts`, `quick-number-copy.spec.ts`, `lifecycle-digest.spec.ts` | All assert against current headline values or copy. |
| `e2e/snapshot-*.spec.ts` | Rendered figures move. |

---

## 6. The regression lock

**File:** `src/lib/inflation-frame-invariant.spec.ts` (new).
**Purpose (#167 acceptance item 4):** *fail if both sides are ever collapsed to one rate again.*

It must assert a **behavioural** property, not the presence of a source comment — a grep-for-a-string lock is defeated by the next refactor.

### Assertion 1 — the negative control (the actual lock)

**Fixture:** the Sharmas seed (`loadSeedPersona`), DEFAULT product lens, plus a mutated copy in which `assumptions.healthcareInflation` is raised 14% → 20% and **nothing else changes** (basket 7.90% → 9.10%; CPI stays 6%).

```
⇒ derive().fireNumber                              MUST be UNCHANGED  (a today's-₹ figure)
⇒ requiredMonthlyContributionFor().needReal        MUST INCREASE      (at a fixed target age with T ≥ 10)
⇒ requiredMonthlyContributionFor().needNominal     MUST INCREASE
⇒ derive().householdFireAge                        MUST be >= today's, and STRICTLY > for T ≥ 10
```

If anyone re-collapses the expense side to `assumptions.inflation`, every one of those becomes *unchanged* and the test goes red with a message naming #167 and `derive.ts` ~line 544. This is the assertion a single-rate model cannot satisfy.

### Assertion 2 — the positive control (byte-identity when basket == CPI)

**Fixture:** the Sharmas seed with all four buckets forced to 6% (`inflation = healthcareInflation = educationInflation = housingInflation = 0.06`).

```
⇒ g == 0 exactly
⇒ derive().yearsToRegular, fireNumber, householdFireAge, progressPercent
   MUST equal the single-rate reference values
```

Proves the change is a *generalisation*, not a re-tuning, and keeps §3's byte-identity claim honest.

### Assertion 3 — the two frames agree

**Fixture:** all four personas.

```
householdFireAge                (headline: calculateYearsToTarget path)
  ==  crossovers.regular.age    (chart:    projectCorpus path)          ± 1 year
```

This is the one property `#20` bought by collapsing both sides; the new model must keep it *without* the collapse. Any future frame drift between headline and chart trips here.

### Assertion 4 — direction (Tier-0 honesty ratchet)

**Fixture:** all four personas, versus the committed golden master.

```
for every persona:
  needReal_new        >= needReal_old
  householdFireAge_new >= householdFireAge_old
```

Encodes "the fix may only move the number in the conservative direction". A future change that makes any persona's number *smaller* is an optimistic regression and must be justified explicitly, not slipped through.

---

## 7. Open questions for the FinTech reviewer

1. **Should 14% healthcare inflation, at 20% weight, really drive the whole target growth for a 30-year horizon — or should the basket be horizon-damped?** This is the decision the ADR turns on. A flat 14% compounds to ~25.6× over 25 years. Is there research supporting a flat premium over CPI held that long for India, or does the medical-inflation premium compress as insurance penetration and price regulation mature? Option D assumes 8pp → 2pp over 20 years; that curve needs a citation or a replacement.
2. **Should the education bucket (9%, 10% weight) be in the *perpetual* target at all?** Education spending ends. It is arguably already double-counted: education goals enter as one-off lumps via the family layer (`fire-math.ts:143-162`, `derive.ts:468-478`) *and* again as a 9%-inflating slice of the perpetual retirement basket. Removing education from the retirement basket lowers `b` materially and may be more correct than damping.
3. **What rate should savings grow at?** Today the model implicitly assumes contributions rise at CPI (constant real — `derive.ts:556-557`). Indian salaried wage growth has historically exceeded CPI. If contributions grow at CPI + ~2% while expenses grow at the basket, the reachability picture changes materially — and that is a *separate* honesty question from the target frame. One knob (the existing `householdSavingsStepUpPercent`, default 0) or a defaulted assumption?
4. **Is the retiree/saver asymmetry at `derive.ts:553-558` still defensible after the frame change?** Once the saver's target grows at the basket *and* the retiree's withdrawal floor grows at the basket, the asymmetry that comment defends disappears. Confirm the Floor/Ceiling overlay should keep `householdInflation` and that only one expense rate remains in the run.
5. **Does the accessible-money bridge need the drift?** `bridge.ts:18` holds expenses flat in today's rupees over the bridge window (typically 5–15 years to PPF/NPS unlock). At `g = 1.79%` that understates bridge-year spending by ~9–29%. Is the bridge conservative enough elsewhere (it already ignores compounding on drawn money) to absorb this, or is it a second optimistic leak that should be closed in the same wave?
6. **The SWR step function (#167's rider).** `SWR_HORIZON_TABLE` (`fire-math.ts:57-63`) drops `needReal` ~5.5% for one extra year of work at a bracket boundary (retiring at 50 → 51 crosses 3.25% → 3.50% when planning to 90). The T-377 hero slider makes that cliff draggable and slightly over-sells one specific year. Interpolate between bracket anchors for the slider, or annotate the tile when the target age crosses a boundary?
7. **What is the honest UI for "unreachable"?** Under any consistent frame at least one seed persona (Mauryas) does not reach FIRE within a human horizon. Is the right answer a lever-first "you don't get there — here's what closes it" state, a relaxed plan-to-age, a lower SWR floor, or all three? The kernel must not be bent again to produce a printable number — that was the `#20` mistake this ADR undoes.

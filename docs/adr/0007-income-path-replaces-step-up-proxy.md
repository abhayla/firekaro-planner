# ADR-0007: Income path replaces the savings step-up proxy

- **Status:** Accepted (joint decision — Abhay + FinTech review, 2026-09-29)
- **Date:** 2026-09-29
- **Deciders:** Abhay (product decision, D-2026-09-13-02/03/04), Claude (FinTech + Architect roles)
- **Supersedes / relates:** gh #185 (tracking), `docs/goals/2026-09-13-income-path-kernel.md` (the
  full spec this ADR settles §7 for), ADR-0004 (temporal contribution model — the age-relative
  segment shape this ADR reuses for the income schedule), ADR-0006 (real-frame target basket — the
  frame this ADR's income schedule must compose with, unchanged)

---

## Context

`docs/goals/2026-09-13-income-path-kernel.md` (the full design) records the defect this ADR exists
to fix: the kernel never grows the user's **income** — it grows the **savings** by a flat
`householdSavingsStepUpPercent` (default 2% real/yr, tapering to 0 at age 50, `derive.ts`
`STEP_UP_TAPER_AGE = 50`). For a household whose surplus is small relative to income (the newly
LOCKED lower-middle/middle band of the persona, ₹2.5L–₹10L household income), this understates
future surplus by roughly the ratio income ÷ surplus, because a 2% raise applied to a ₹50k surplus
is ₹1k/yr while the same 2% applied to a ₹3L income is ₹6k/yr — and nearly every rupee of income
growth is surplus once expenses only track inflation.

`salary.hikePercent` (per earner, `src/types/household.ts`, `z.number().min(0).max(25)`) is already
collected and displayed on the Income pages but is **never read by `derive.ts` or `fire-math.ts`**.

Spec §7 named three open facts that must be settled with cited sources — or explicitly disclosed as
unsourced assumptions — **before any kernel code is written**, because an invented number backing a
Tier-0 honesty headline is itself a Tier-0 honesty problem. This ADR settles those three facts. It
makes **no code change** — Step 4 (the kernel) is a separate, later, Tier-A step per the spec's
build-order table.

## Decision

### (a) Conservative real salary-growth default, by age band — SOURCED, and it is materially different from the "2%" placeholder in the spec's worked example

**Two distinct, credible numbers exist, and they disagree sharply, because they measure different
populations:**

1. **PLFS (Periodic Labour Force Survey), cited via the Economic Survey 2024-25 / Economic Survey
   2025:** real wages for **regular-salaried employees CONTRACTED by 0.07% between FY22 and FY24**
   (nominal average monthly income of a regular salaried employee was ₹20,702 in 2023-24; real
   earnings at constant prices had not returned to the 2017-18 level). This is the population
   closest to Ravi's band — the median regular-salaried Indian worker, not the corporate
   white-collar segment covered by HR consultancies. Source: [PLFS Annual Report cited in Economic
   Survey coverage — Data For India, "Salaried jobs in India"](https://www.dataforindia.com/salaried-jobs/);
   [ruralindiaonline.org PLFS Annual Report July 2023–June 2024](https://ruralindiaonline.org/en/library/resource/periodic-labour-force-survey-plfs-annual-report-july-2023-june-2024/).
2. **Aon's Annual Salary Increase and Turnover Survey 2025–26 (India):** average projected NOMINAL
   salary increase **9.1% for 2026** (up from 8.9% in 2025), across 1,400+ organisations, 45
   industries. Source: [Aon, "Aon Survey Projects Slight Uptick in Salaries in India From 8.9 Percent
   in 2025 to 9.1 Percent in 2026"](https://www.aon.com/apac/in-the-press/asia-newsroom/2026/aon-survey-projects-slight-uptick-in-salaries-in-india-2026).
   Against ~5–6% CPI this is ≈ **+3 to +4% real** — but Aon's panel is corporate white-collar
   (IT/BFSI/consulting-heavy), skewed well above Ravi's ₹3L entry CTC and the PLFS median.

**Why these are not the same fact:** Aon measures the **increment an already-employed corporate
salaried worker gets on their existing job**. PLFS measures the **actual realised change in the
whole regular-salaried population's real earnings**, which nets out job loss, informalisation,
sectoral churn, and the fact that many "hikes" go to people already earning well above ₹3L. A
₹3L-CTC fresher (Ravi) at a mass-hiring / Tier-3 IT-services entry level (₹3.25–4.5L range per
fresher-salary surveys) is track-record-thin: their **realistic** early-career path is closer to the
**8–15% first-appraisal nominal hike** cited for freshers (various 2026 fresher-salary guides,
e.g. [Hyring, "India Fresher Salary 2026"](https://hyring.com/blog/fresher-salary-guide-india-2026/)),
not the 9.1% blended-tenure Aon average, and even less like the PLFS all-regular-salaried average,
which includes workers with zero bargaining power and high informalisation risk.

**Decision (conservative, defensible default):** the kernel's CONSERVATIVE default —
`salaryGrowthRealPercent` — is set to **2% real/year**, unchanged from the spec's worked-example
number.

**The basis, restated (FinTech review of this ADR, 2026-09-29 — this REPLACES an earlier "midpoint of
PLFS and Aon" framing, which was wrong):** an **individual incumbent's age-earnings path is steeply
positive even when the population aggregate is ~0% real.** The two numbers above measure different
objects and must not be averaged. PLFS measures the *cross-sectional population aggregate* of all
regular-salaried workers — a figure that nets out compositional churn, informalisation, job loss, and
the entry of new low-wage workers at the bottom; it is **not** the path any one continuously-employed
person walks. Aon measures the *increment given to a continuing employee at surveyed corporate firms*
— an individual-path number, but for a population (IT/BFSI/consulting) well above this persona's
₹3L entry CTC. The relevant quantity for a FIRE plan is the **individual path**, and **every**
individual-path estimate available (Aon ≈3–4% real for corporates; 8–15% nominal first-appraisal
hikes for freshers, i.e. ≈2–9% real against 6% CPI) is **materially positive**. **2% real sits BELOW
any individual-path estimate we found** — that is the whole basis for choosing it. It is a
deliberately sub-estimate floor on the individual path, not a midpoint between two incommensurable
series, and **no PLFS by-age or by-cohort real-wage series was consulted** (none at the needed
granularity was located — see the age-band paragraph below).

**Mandatory caveat, verbatim, at every point of use (Preferences tooltip, ADR, PR body):**
> "assumes continuous employment; real wage growth for this band was ~0% in FY22–24"

That caveat is what keeps the 2% honest: it names the two conditions under which the individual path
does not hold (a break in employment; a macro window like FY22–24 in which even continuing employees'
real earnings stalled). The default is disclosed as a **conservative floor on an individual path
under continuous employment**, never as a measured population figure.

**Age-band taper:** no age-banded real-wage-growth series specific to Indian salaried workers was
found in this pass (PLFS publishes by broad employment category, not by age × real-wage-growth
cross-tab at the granularity needed). `salaryGrowthTaperAge` stays a single knob (default 50, per
spec §4.1) rather than a per-age-band schedule — the schedule mechanism (`growthSchedule?:
IncomeGrowthSegment[]`, spec §4.2) exists for a user or a future research update to override this
per-band, but the DEFAULT is flat 2% until taper, disclosed as unsourced-by-age-band.

### (b) Lifestyle-creep default — UNSOURCED, disclosed explicitly (per spec §7.2's own fallback)

No India-specific, quantified lifestyle-creep study was found. The closest analogues are US-context
behavioural-finance write-ups (not peer-reviewed research): "the average American's spending
increases by 1–3% for every 1% increase in income" (multiple personal-finance sources, no primary
citation found) and the "save half your raise" heuristic from a Survey of Consumer Finances-based
retirement-adequacy study (no direct % figure for expense growth above inflation).

**Decision: `expenseGrowthAboveInflationPercent` default = 1% (assumption, UNSOURCED).** Disclosed
per spec §7.2's explicit instruction ("a source, or an explicit 'assumption, unsourced, 1%' line").
This is deliberately small and directionally conservative for the headline (creep pulls FIRE later,
per the spec's monotonicity invariant — see spec §4.5, "creep monotonicity"), never precisely
researched. The Preferences tooltip MUST say "unsourced assumption, not a research figure" verbatim
— this is a Tier-0 honesty requirement, not a cosmetic detail.

### (c) Creep applies to the `general` bucket ONLY (FinTech review, 2026-09-29 — supersedes the earlier "uniformly to ALL buckets" decision)

Read of `src/types/household.ts` and `src/lib/derive.ts`: FireKaro's expense model is one lump
(`expenses.avgMonthly`) plus a `recurring[]` list, each optionally tagged with an `inflationBucket`
(`healthcare | education | housing | general`) that selects which of the four PRICE-inflation rates
that line grows at. The household basket is the weighted blend of those four
(`resolveHouseholdInflation`, default weights general 74 / healthcare 8 / education 0 / housing 18).

**Decision: `expenseGrowthAboveInflationPercent` (lifestyle creep) is added to the `general` bucket
rate only** — i.e. the expense/target path grows at `blendedInflation({general: CPI + creep,
healthcare, education, housing}, weights)`, never at `basket + creep`.

**Why (this is the correction):** creep is a *volitional* behaviour — the household chooses to spend
more as income rises. The other three buckets are **non-volitional and already carry their own
escalation**: healthcare at 9%, education at 9%, housing at 6% are *price* indices already set above
general CPI precisely because those costs rise faster than the household controls. Adding a
behavioural creep term on top of a non-volitional price escalator double-counts the same effect
twice: the household is charged medical price inflation AND charged for "choosing" more medical
spending. Scoping creep to `general` is the only reading that keeps each rate measuring one thing.

**Direction and honesty:** general-only creep makes the headline **EARLIER** than uniform creep
would (the creep term is multiplied by the general weight, 0.74 by default, instead of 1.0). That is
the optimistic direction, so it needs justifying, and it is justified: the uniform version was
**double-counting** escalation on the non-volitional buckets, which made the headline *pessimistic
for the wrong reason*. Correcting a double-count in the optimistic direction is not the same class of
error as inventing optimism — the creep term itself remains a disclosed unsourced assumption and the
creep-monotonicity invariant (higher creep never pulls FIRE earlier) still holds exactly, because the
general weight is strictly positive.

No new schema field is introduced: the existing `inflationBucket` axis carries the whole decision.

## Consequences

- If Step 4 (the kernel) implements `salaryGrowthRealPercent` at 2% default, the worked-example
  numbers in spec §2 hold unchanged (Ravi's conservative band: FIRE age 51; the spec's own example
  already used 2% for the conservative band's real-terms growth).
- The 2% default is a disclosed **conservative floor on an individual incumbent's age-earnings path**
  — below every individual-path estimate found — and MUST carry the verbatim caveat "assumes
  continuous employment; real wage growth for this band was ~0% in FY22–24" at every point of use
  (Preferences tooltip, ADR, PR body). It is NOT a midpoint of two series and NOT a measured
  population figure. A future revision with age-banded, persona-matched wage
  data (e.g. a bespoke PLFS age×income-band extract) would tighten this; it does not exist today.
- `expenseGrowthAboveInflationPercent` (1%, unsourced) is the ONLY unsourced default introduced by
  this goal, and it is disclosed as such at the point of use (Preferences tooltip), per the
  Evidence-before-claims and spec-first rules.
- Creep applies to the `general` bucket ONLY — no new discretionary/non-discretionary schema is
  introduced by this ADR or by Step 4; the existing `inflationBucket` axis carries it. This makes the
  headline EARLIER than a uniform-creep reading would, and that is correct: the non-volitional
  buckets (healthcare 9%, education 9%, housing 6%) already carry their own escalation above general
  CPI, so adding a behavioural creep term on top of them double-counted the same effect. Creep
  monotonicity still holds exactly (the general weight is strictly positive).
- This ADR does not change any code path. It is the settled input Step 4 (Tier A, Opus, per spec §5)
  consumes when building the actual `IncomeSchedule` in `derive.ts` / `fire-math.ts` /
  `contribution-schedule.ts`.

## Revision 2026-09-29 (b) — settled during Step 4 by the FinTech review of the implementation

Three things the decisions above did not settle, found by an adversarial FinTech review of the Step-4
kernel code itself (not of this ADR). Recorded here because each changes what Step 4 ships.

### (d) Creep rides BOTH legs of the adequacy verdict, or neither — CRITICAL, was a real bug

Decision (c) settled which *bucket* creep attaches to and was **silent on which LEG consumes it**.
The first implementation pass therefore added creep to the basket used for the household's **expense
line** (which sets the savings surplus) but not to the basket the **FIRE target** grows at. Measured
on the Ravi fixture: at the headline verdict age the kernel had the household **spending ~₹3.57L/yr
real** while the base target funded only **~₹2.73L/yr real** — a **31% shortfall at the exact moment
the plan declared FIRE reached**, in the **OPTIMISTIC** direction, which is the Tier-0 failure mode
for this persona. Five further surfaces read the no-creep basket and inherited the same split
(`effectiveTargetDriftRate`, `effectiveTargetGrowthNominal`, the bridge's expense line, the
Floor/Ceiling decumulation overlay, and the Monte Carlo drift).

**Decision: creep is folded into `householdInflation` itself**, the one household basket, so every
consumer — target schedule, bridge, decumulation, effective drift, MC band — inherits exactly one
rate. The justification is not merely coherence: **creep is a permanent lifestyle ratchet.** A
household that creeps its way to ₹3.57L of real spending does not revert to ₹2.73L on retirement
day, so the corpus must capitalise the crept level. Detection upgrade shipped with the fix: a
creep-coherence property in `src/lib/kernel-invariants.property.spec.ts` asserting, at every creep
value, that the real spend at the verdict equals the real spend the base target funds to within 1%.
That property covers the whole class (any future bucket/weight/goal change that moves one leg and not
the other), not just creep.

### (e) The "expected" band is honest arithmetic; whether to SHOW it is the UI's call — was a bug

The first pass floored `expectedRealGrowthPercent` at the conservative default so the second number
could never read worse than the headline beside it. That is a **presentation rule enforced inside a
math function**: it made the second figure `max(user, default)` rather than the user's own, so the
copy "42 if your 12% hikes continue" was false for every user whose hike sat below CPI + the default.

**Decision:** `expectedRealGrowthPercent` returns the honest Fisher conversion
`((1+hike)/(1+CPI)) − 1`, clamped to [0, 15] only (a negative rate is not a shape the income path
models — income holds flat, it never shrinks). `derive()` sets **`expectedFireAgeBasis` from the
SOLVED result**: non-null only when the user typed a hike AND the expected run genuinely beats the
headline. A null basis is the UI's instruction to show ONE number. Spec §4.5's "expected <
conservative, always" is therefore a **presentation** invariant from now on, not a model one.

### (g) `expenseGrowthAboveInflationPercent` DEFAULT: 1% -> 0% — supersedes (b)'s "default = 1%"

Decision (b) set the creep default to 1% on the reasoning that it was "deliberately small and
directionally conservative". That reasoning was made **before creep was wired to both legs** (decision
(d)). Once it was, the term stopped being small. Measured on the five seeds at the moment (d) landed,
default lens, conservative band:

| Seed | creep 0% | creep 0.5% | creep 1% | cost of 1% |
|---|---|---|---|---|
| sharmas | 54.17 | 55.50 | 57.00 | +2.83y |
| mehtas | 50.92 | 51.33 | 51.92 | +1.00y |
| iyers | 56.33 | 57.58 | 59.08 | +2.75y |
| mauryas | 68.08 | 70.83 | **75.08** | +7.00y |
| ravi | 57.17 | 60.17 | 64.17 | +7.00y |

At 1% the Mauryas breach the **#22 age-70 plausibility ceiling** (75.08), and the **unsourced** creep
term moves every seed further than the **sourced** 2% real income-growth default does. That inverts
the evidence hierarchy this ADR exists to protect: a disclosed guess must not be the single largest
lever in a Tier-0 honesty headline.

**Decision: the default is 0.** The knob ships fully implemented, fully wired to both legs, fully
disclosed in the Preferences copy ("unsourced assumption, not a research figure... so we do not put it
in your headline unasked"), and OFF. A user turns it on deliberately to see what gradually spending
more costs them; a future revision with real Indian consumer-spending panel data turns it on with a
citation. This supersedes (b)'s default only — (b)'s disclosure requirement stands in full, and (c)'s
general-bucket scoping and (d)'s both-legs wiring are unchanged.

**Note on (c)'s "makes the headline earlier" claim:** that comparison (general-only vs uniform creep)
is now moot at the default, since the default creep is 0 and both readings collapse to the same
number. It remains correct for any user who turns creep on.

### (f) Carried forward, NOT fixed in Step 4 — the empty-portfolio return fallback (pre-existing)

`assumption-math.ts` `blendPortfolioReturn` returns `equityReturn` (12% nominal) whenever the
value-weighted portfolio total is zero. Ravi's only holding is an auto-flowed EPF line created with
`value: 0`, so his weights sum to zero and his **EPF-only contribution stream is projected at an
all-equity return** — an optimistic error that flatters his headline. This is **pre-existing** (it
predates this ADR and this goal) and is **not** introduced or changed by Step 4, so it is recorded
here and left to a separate change: the fallback should key off the CONTRIBUTION mix, not the
(empty) value mix, and that is a product call about what a not-yet-invested user is assumed to buy.
Consequence for Step 4's own numbers: **Ravi's measured FIRE age is if anything too EARLY**, not too
late, and the acceptance band must be re-derived on a corrected return before it is trusted.

## Open questions carried forward (not blocking Step 3)

- Should the conservative default vary by age band (e.g. lower for 45+ near typical raise
  deceleration) once a suitable age-banded source is found? Deferred — `growthSchedule` already
  gives a per-user override path; a research-backed default schedule is a future ADR revision.
- Should `expenseGrowthAboveInflationPercent` ever be sourced from Indian consumer-spending panel
  data (e.g. CMIE household surveys) rather than left as a disclosed assumption? Deferred — out of
  budget for this pass (Tier C, 30 min).

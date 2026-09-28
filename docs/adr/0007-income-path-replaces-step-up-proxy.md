# ADR-0007: Income path replaces the savings step-up proxy

- **Status:** Proposed
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
number. This is deliberately **below** the Aon nominal-minus-CPI real figure (≈3–4%) precisely
because Aon's panel is not this persona, and the PLFS figure (≈0% or negative) is the honest floor
for the *median* regular-salaried worker in a *bad* macro window (FY22–24, high inflation, weak real
wage growth). **2% sits between the honest floor (≈0%, PLFS) and the optimistic corporate-panel
figure (≈3–4%, Aon)** — a deliberately conservative middle, disclosed as such, never as a precise
research figure. **If the sourced PLFS figure is taken literally (≈0% real), the income path
collapses toward today's proxy for the conservative band** — exactly the contingency the spec names
in §7.1. We do NOT take PLFS literally as the headline default because (i) it is a 2-year window
during an unusually weak real-wage stretch, not a structural forecast, and (ii) the product rule
(spec §3.1) is "a low income today is a starting point, never a verdict" — collapsing the
conservative band to ~0% growth would make the headline read as "never" for the exact persona this
goal exists to serve, which is itself a plausibility red flag requiring the "unreachable" first-class
state (ADR-0006 item 4), not silent starvation of the growth term. **This is a disclosed judgment
call, not a single cited number** — the honest position is: real wage growth for this band is
somewhere between ~0% (PLFS, pessimistic, recent) and ~3–4% (Aon, optimistic, wrong population); 2%
is the stated middle, flagged in the Preferences tooltip as "conservative default — see ADR-0007 for
the range and sources," never presented as precisely measured.

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

### (c) Creep applies to ALL expense buckets, not "discretionary only"

Read (this ADR, read-only, no edit) of `src/types/household.ts` and `src/lib/derive.ts`: FireKaro's
expense model has **no discretionary/non-discretionary split**. Expenses are one lump
(`expenses.avgMonthly`, a single number) plus a `recurring[]` list, each optionally tagged with an
`inflationBucket` (`healthcare | education | housing | general`, `derive.ts` lines ~807–817) that
governs **which of the four PRICE-inflation rates** that line grows at. This is a price-inflation
axis (what does this category of spending cost more of, per year), not a discretionary-spending axis
(would the household cut this if income didn't grow). There is no field, bucket, or existing
convention anywhere in `derive.ts` that distinguishes "discretionary" line items from "necessary"
ones — building that split now, only to serve one small creep multiplier, would be new kernel
surface area the spec explicitly defers past step 4 (YAGNI, `claude-behavior.md` rule 21; the spec
itself only asks for it "if the 4-bucket model allows").

**Decision: `expenseGrowthAboveInflationPercent` applies uniformly to ALL expense lines** — i.e. it
adds a flat `+creep%` on top of whichever of the four bucket-inflation rates a line already uses
(`general`, `healthcare`, `education`, `housing`), rather than being scoped to a subset. This is the
only shape the current 4-bucket model supports without inventing a new field, and it matches the
spec's own worked example (§2 table: "Expense growth: +6% (inflation)" vs "+8%" for the
creep-inclusive row — a flat addition on top of the existing per-line inflation rate, not a
bucket-selective one).

## Consequences

- If Step 4 (the kernel) implements `salaryGrowthRealPercent` at 2% default, the worked-example
  numbers in spec §2 hold unchanged (Ravi's conservative band: FIRE age 51; the spec's own example
  already used 2% for the conservative band's real-terms growth).
- The 2% default is a disclosed judgment call bounded by two real sources that disagree (PLFS ≈0%,
  Aon ≈3–4% for a different population) — this MUST be stated in the Preferences tooltip, not
  presented as a single precise citation. A future revision with age-banded, persona-matched wage
  data (e.g. a bespoke PLFS age×income-band extract) would tighten this; it does not exist today.
- `expenseGrowthAboveInflationPercent` (1%, unsourced) is the ONLY unsourced default introduced by
  this goal, and it is disclosed as such at the point of use (Preferences tooltip), per the
  Evidence-before-claims and spec-first rules.
- Creep is uniform across buckets — no new discretionary/non-discretionary schema is introduced by
  this ADR or by Step 4. If a future goal wants creep scoped to "wants" vs "needs," that is a new,
  separately-justified schema change, not a side effect of this one.
- This ADR does not change any code path. It is the settled input Step 4 (Tier A, Opus, per spec §5)
  consumes when building the actual `IncomeSchedule` in `derive.ts` / `fire-math.ts` /
  `contribution-schedule.ts`.

## Open questions carried forward (not blocking Step 3)

- Should the conservative default vary by age band (e.g. lower for 45+ near typical raise
  deceleration) once a suitable age-banded source is found? Deferred — `growthSchedule` already
  gives a per-user override path; a research-backed default schedule is a future ADR revision.
- Should `expenseGrowthAboveInflationPercent` ever be sourced from Indian consumer-spending panel
  data (e.g. CMIE household surveys) rather than left as a disclosed assumption? Deferred — out of
  budget for this pass (Tier C, 30 min).

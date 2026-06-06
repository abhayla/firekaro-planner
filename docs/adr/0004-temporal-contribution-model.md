# ADR-0004: Temporal contribution model (time-varying FIRE contributions, Phase 1)

- Status: Accepted
- Date: 2026-06-06
- Deciders: Abhay (delegated the scope calls), Claude (Systems Architect + FinTech roles)
- Supersedes/relates: gh-issue #46 (design + FinTech/Architect review), gh-issue #11 (the
  corpus-inflow double-count this ADR is locked against), gh-issue #20 (the REAL-frame headline),
  ADR-0003 (tax scope — the accumulation-phase lump-out tax this ADR defers), gh-issue #47
  (the chart-vs-headline frame follow-up).

## Context

FireKaro's FIRE engine was a **single-snapshot, constant-contribution** projection: `derive.ts`
compounded today's `monthlyContribution = annualSavings/12` flat forward forever. It could not model
a contribution that **changes over time** — the real-world case "I do a ₹5k SIP now, step it up
10%/yr, then stop at 45." That made the headline FIRE date a "frozen-today-forever" fiction — the
biggest **honesty** gap (objective 1) after the headline bugs, and it blocked objective 2 ("get
there faster — show the user the lever").

Phase 1 delivers a **time-varying contribution model** so a salaried accumulator can express future
contribution changes and **watch the FIRE date move** — as a live What-If lever and a persisted
per-investment plan — without re-opening the gh-11 double-count or making the headline optimistic.

## Decision

### 1. Corpus inflow is the SINGLE time-varying household savings residual — per-investment schedules are barred from corpus (the gh-11 lock)

Corpus inflow stays the **household savings residual alone** (`monthlyContribution = annualSavings/12`),
now expressed as a `ContributionSchedule` and made time-varying via a REAL household step-up.
**Per-investment `investments[].contributionSchedule` is DISPLAY/PLAN metadata ONLY and is NEVER
summed into corpus inflow.** Re-routing per-investment SIPs into corpus is exactly the ~10×
double-count gh-issue #11 fixed (the expense input already excludes SIPs, so SIPs are already inside
`annualSavings`). This is enforced by a CI coherence assert in `headline-plausibility.spec.ts`
(planting an aggressive per-investment schedule must NOT move the headline, per persona, on the
default lens) — a regression that re-routes per-investment contributions into corpus trips RED.

### 2. Year-indexed `ContributionSchedule`, mirroring `ReturnSchedule`

`ContributionSchedule = number | ((yearIndex) => number)` — the same shape as the glide-path
`ReturnSchedule` (gh-9), with an identical `resolveContribution` helper. A constant scalar is
**byte-identical** to the prior single-amount loop (proven: all 792 pre-change tests stay green at
the 0% default). `calculateYearsToTarget` and `projectCorpus` resolve the contribution at the same
year-index origin, so the headline and the chart cannot diverge from an index mismatch. The
flattening of age-relative segments into the resolver lives in `src/lib/contribution-schedule.ts`
(the single-kernel rule — `derive.ts` still calls `projectCorpus` once).

### 3. Step-up is REAL-terms, default 0%, opt-in, clamped ≤15%/yr

The headline compounds the corpus in the REAL frame (gh-20: corpus deflated by general CPI; target
grown at CPI). A step-up is therefore expressed in **REAL** terms — growth NET of inflation. A
nominal step-up that merely tracks ~6% inflation is ALREADY baked into the constant-real baseline;
expressing step-up nominally would double-count inflation → an optimistically-early FIRE date (the
worst error class for the accumulator). Default **0%** ⇒ today's headline unchanged. Clamped to
**≤15%/yr** — an implausibly high real step-up would optimistically pull the FIRE date in.

### 4. Segments are age-relative, never absolute dates

`startAtAge`/`endAtAge` are age-relative and resolved against the wall-clock-derived `anchorAge`
(from DOB). Absolute dates would silently drift year-to-year against the clock. Rendered to calendar
only on output.

### 5. The What-If household step-up is the lever that moves the headline; the persisted per-investment step-up is plan/display

Only the household residual is the truthful corpus inflow, so a **household-level** step-up (the
What-If lever, non-persisting; and a dormant `assumptions.householdSavingsStepUpPercent` for the
persisted path, default 0) is what compresses years-to-FIRE. The persisted **per-investment** schedule
editor (InvestmentForm) drives display + the holding's own card only. A per-SIP step-up not matched by
a higher household residual would double-count — hence the split.

### 6. Persistence: a dedicated `Investment.contributionSchedule Json?` column (YAGNI vs child tables)

JSON-first (no child tables in P1 — the Architect review endorsed it). Its own column (not folded
into `subtypeData`) so the diff engine treats it first-class; canonical-serialized at the write
boundary so the household-diff `deepEqual` stays idempotent (identical PUT → zero writes). The
migration is **authored, not applied** — applying it to Supabase is the production deploy step
(Abhay's gate).

### 7. ADR-0003 interaction: accumulation-phase lump-out tax stays OUT of scope (deferred to Phase 2)

ADR-0003 absorbs realized-gains/withdrawal tax into the SWR for the **retirement** phase. A material
**pre-retirement lump-OUT** (a Phase-2 CashflowEvent) is gross-optimistic because ADR-0003's SWR only
covers the retirement phase — so Phase 2 will apply a disclosed flat LTCG haircut to a pre-retirement
lump-out. Not modelled in Phase 1 (Phase 1 has no one-off events).

## Consequences

- **Honest, lever-driven headline.** The accumulator can see future contribution changes move the
  FIRE date, without the gh-11 double-count and without an optimistic step-up.
- **Byte-identical default.** Every household with constant contributions and 0% step-up sees the
  exact same FIRE date as before — the change is purely additive.
- **Known follow-up (gh-47):** for a non-zero step-up the chart's `projectCorpus` (nominal frame)
  crossover marker lags the real-frame headline. The direction is conservative (never optimistic) and
  it is **not user-visible in Phase 1** (the dashboard step-up is dormant; What-If's hero+chart are
  both nominal-frame). It is fixed (nominalise the chart's contribution schedule) when the persisted
  dashboard step-up lands — tracked in gh-47.
- **Phase 2 (one-off CashflowEvents) is OUT of scope** — design captured in
  `docs/temporal-cashflow-events-p2-design.md`, not built.

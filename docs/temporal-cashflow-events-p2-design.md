# Temporal Phase 2 — one-off CashflowEvents (design note, NOT built)

**Status:** Design only — do NOT build until greenlit. Captures the Architect + FinTech review
conclusions from gh-issue #46 so Phase 2 is not built blind. Phase 1 (time-varying *contributions*)
shipped; Phase 2 adds discrete one-off *events* (lump in/out, income/expense/EMI/goal changes).

Relates: ADR-0004 (the temporal contribution model), ADR-0003 (tax scope), gh-issue #11 (corpus-inflow
lock), gh-issue #20 (REAL frame), gh-issue #47 (chart-vs-headline frame — must be resolved as part of
P2 since events make the curve non-monotone).

## What Phase 2 adds

A `CashflowEvent[]` on the household: discrete, dated (age-relative) one-off changes to the projection —
a windfall/inheritance (lump in), a house purchase or child's education outflow (lump out), a salary
jump or job loss (income change), a lifestyle change (expense change), a loan payoff (EMI end), a
planned goal outflow. Phase 1's continuous contribution schedule cannot express these.

## The four unsolved sub-problems (from the Architect review)

### 1. Sticky-crossover semantics
A transient lump-in can push corpus momentarily above the FIRE target, then a later lump-out drops it
back below. The current `findCrossovers` returns the FIRST year `corpus ≥ target` — which would
declare FIRE-ready on a transient spike. **Fix:** `findCrossovers` must require the corpus holds
`≥ target` for **≥3 consecutive years** before counting it as FIRE-ready.

### 2. `calculateYearsToTarget` vs the chart can diverge once the curve is non-monotone
With events, the corpus curve is no longer monotonically increasing, so the iterative
`calculateYearsToTarget` (which marches month-by-month and stops at first crossing) and the
`projectCorpus` chart can report different FIRE ages. **Fix:** replace the headline's
`calculateYearsToTarget` with a **scan of the `projectCorpus` `ProjectionPoint[]`** (one extra
projection run) applying the same sticky-crossover rule — so headline and chart read from the SAME
curve and cannot diverge. (This also subsumes the gh-47 frame fix: a single projection source of
truth.)

### 3. Bridge `corpusScale` must become a year-indexed corpus array
`computeBridge` currently scales today's holdings to the retirement-age corpus via a single
`corpusScale = fireNumber / totalCorpus` ratio. With a pre-retirement lump-out, that over-credits
liquidity (the lump-out already left the corpus). **Fix:** feed the bridge a **year-indexed corpus
array** (the data already exists in `ProjectionPoint[]`) so a pre-retirement outflow correctly
reduces the bridge runway.

### 4. Event frame + tax contracts (from the FinTech review — honesty-critical)
All events are in the REAL frame to match the headline (gh-20). Per event type:

| Event | Frame / tax contract |
|---|---|
| **lump IN** (windfall, inheritance) | today's-rupee, injected **unescalated** into the real frame (no double-inflation). |
| **lump OUT** (house, education) | today's-rupee, injected unescalated. A material **pre-retirement** lump-out gets a **disclosed flat LTCG haircut** — gross is optimistic, ADR-0003's SWR only covers the retirement phase. |
| **income change** (raise, job loss) | applied **pre-tax through the marginal rate** (changes net savings, not gross). |
| **expense change** (lifestyle) | moves **BOTH legs** — savings (−) AND the FIRE number (+, capitalised at SWR). |
| **emiEnd** (loan payoff) | moves **inflow only** (frees the EMI into savings); the FIRE number is unchanged; AND it MUST remove the recurring EMI expense line (else double-relief). |
| **goalOutflow** | **mutually exclusive** with `calculateFamilyLayerCorpus` for the same goal (else the goal is both capitalised into the FIRE number AND drawn as an outflow — double-count). |

## Persistence (when built)
A `cashflowEvents Json?` column on the household document (or a child table if the event set grows) —
the same JSON-first, authored-not-applied, canonical-serialized discipline as Phase 1's
`Investment.contributionSchedule`.

## Honesty guardrails (carry forward from Phase 1)
- Every event-driven headline must stay persona-sane on the DEFAULT lens (`headline-plausibility.spec.ts`).
- No event may make the headline OPTIMISTIC (the worst class for the accumulator) — the lump-out LTCG
  haircut + the sticky-crossover rule + the expense-change-moves-both-legs rule all exist to prevent
  an optimistically-early FIRE date.
- The gh-11 corpus-inflow lock still holds: events change the residual/target legs explicitly, never by
  re-routing per-investment metadata into corpus.

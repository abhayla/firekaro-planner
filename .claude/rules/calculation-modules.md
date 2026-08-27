---
description: Frontend pure calculation modules and India-specific financial constants
paths: ["src/lib/**/*.ts"]
---

# Calculation Module Conventions

> **Repo note (extraction, 2026-05-31):** this rule was inherited from the retired `FIREKaro-Vue`
> monorepo, where calculations lived in a `server/lib/calculations/` Hono backend. In this
> extracted `firekaro-planner` repo, **all calculation math lives in `src/lib/*.ts`** and is
> consumed directly by the Vue planner (Pinia stores + composables) — there is no calc backend.
> The `server/` here is only the thin Hono/Prisma document API (`household-diff.ts`). Paths and
> the module inventory below reflect THIS repo; this rule is the SSOT for the full module
> inventory (T-349, 2026-08-26) — `CLAUDE.md` → "Calculations" keeps the kernel/ADR-0004/bridge
> prose and points here.

## Architecture

Pure calculation functions live in `src/lib/*.ts` with a colocated `*.spec.ts`. These modules MUST
be pure: **no Pinia store access, no DOM, no IO, no network**. Stores and composables fetch/hold
the data, then pass plain inputs to these functions and persist the results via the storage
adapter. Keep the calculation layer free of framework concerns so the specs can test pure
input → output.

## Module Inventory

**The kernel** (kept in full in `CLAUDE.md` → "Calculations", not duplicated here): `derive.ts` is
the ONE pure FIRE-math function (household snapshot + resolved assumptions + UI lens → every
dashboard field); `useFireDerive.ts` is its thin Pinia-aware wrapper; `derive.spec.ts` and
`useFireDerive.seed.spec.ts` are its colocated + end-to-end specs.

Calculation modules in `src/lib/` (this table is the authoritative full inventory — extend it here,
never create a second table; `CLAUDE.md` keeps only the kernel/ADR-0004/bridge prose + a pointer):

| Module | Purpose |
|--------|---------|
| `fire-math.ts` | FIRE number, savings rate, horizon-driven SWR; exports `INDIA_SWR`/`INDIA_INFLATION`/`DEFAULT_RETURNS` |
| `coast-fire.ts` | Coast / Barista FIRE crossover |
| `glide-path.ts` | Equity→debt glide path over the horizon |
| `withdrawal-strategy.ts` | SWR-based + Floor/Ceiling withdrawal planning |
| `adequacy.ts` | Corpus adequacy vs target |
| `tax.ts` | Old/new regime slabs, surcharge, cess, rebate, marginal relief, CII |
| `tax-deductions.ts` | 80C / 80D / 80CCD deduction caps |
| `tax-cliff.ts` | Regime break-even / cliff analysis |
| `esop-tax.ts` | ESOP/RSU perquisite + vesting taxation |
| `epf-vpf.ts` | EPF/VPF accrual and employer split |
| `nps-withdrawal.ts` | NPS 60/40 lump-sum + annuity withdrawal |
| `amortization.ts` | Loan EMI / amortization schedule |
| `cashflow.ts` | Monthly/annual cashflow derivation |
| `freedom-score.ts` | 0–100 financial-independence score |
| `assumption-math.ts` | Resolves research-default + override assumptions |
| `derived-records.ts` · `nudge-engine.ts` · `expense-history.ts` · `investment-traits.ts` | Derived records, nudges, expense history, instrument traits |
| `retirement-goal.ts` | Retirement-card age/year coherence — derives both from the same FIRE source so they correspond (#33) |
| `stress-test.ts` | Stress-test scenarios against the FIRE plan |
| `monte-carlo.ts` | FIRE date as a confidence distribution, not a point (#18) |
| `business-legal-kinds.ts` | Business legal-kind vocabulary — `BUSINESS_LEGAL_KINDS` labels, owner share math, and the #158 browse-column builder whose membership is entry-existence, never money, so ₹0 rows stay reachable |
| `salary-percent.ts` | The salary-form % ⇄ ₹ bridge: Basic as % of CTC + employer NPS as % of basic, law-grounded fresh-entry defaults (Code-on-Wages 50% floor; sector-aware NPS govt 14 / private 0); existing records never resurrect defaults |
| `lifecycle-digest.ts` | The `derive()`-grounded "since you were away" delta engine — the Tier-1 stickiness digest card on the dashboard |
| `member-horizon.ts` | Member-level horizon calculation feeding the app-wide "View as member" lens |
| `age.ts` | Age calculation helpers |
| `fire-milestone-copy.ts` | Coast/Barista card copy gated on a real FIRE target existing — the honest "add your data" fallback for zero-data users (#39) |
| `accessibility.ts` | #15 accessible-money bridge — when/how-much each holding unlocks |
| `liquidation-tax.ts` | #15 accessible-money bridge — post-tax net of selling a holding |
| `eps-pension.ts` | #15 accessible-money bridge — EPS pension income stream |
| `gratuity.ts` | #15 accessible-money bridge — gratuity income stream |
| `bridge.ts` | #15 accessible-money bridge — `computeBridgeCoverage` runs a conservative year-by-year liquidity check and moves the effective headline FIRE age LATER when the liquid runway can't cover the bridge years |
| `fire-confidence-band.ts` | Obj-1 honesty — FIRE date as a confidence band, not a point |
| `contribution-schedule.ts` | ADR-0004 temporal contributions — age-relative contribution segments |
| `lever-catalog.ts` · `lever-bands.ts` · `lever-impact.ts` | Obj-2 "get there faster" — per-lever FIRE-date-delta ranking (#48) |
| `readiness.ts` | Obj-3 "is it safe to stop?" |
| `decumulation.ts` | Obj-4 post-FIRE guardrails |
| `plan-variance.ts` | #138 plan-vs-actual variance against the persisted `plan-baseline` document |
| `dashboard-verdict.ts` | #155 Option-D hero verdict-tone resolver consuming `plan-variance.ts` — no-baseline/NaN makes NO claim, ±Infinity does |
| `runway.ts` | #140 layoff/income-shock runway |
| `member-earning.ts` · `member-draft.ts` | Member model — `Member.role` is DERIVED from income, not stored; feeds the app-wide "View as \<member\>" lens while keeping household-solvency ratios coherent (#66/#67) |
| `expense-attribution.ts` | The ONE canonical ring/lens expense attributor — "Household"/"Dependents" sentinels are deliberately distinct from the asset "Joint" sentinel |
| `individual-fire.ts` | #81 — one adult's standalone FIRE as a "mini-household": attributed corpus/expenses/per-individual tax; household stays the primary + invariant headline |

## Colocated Tests

Tests live next to their module: `fire-metrics.spec.ts` alongside `fire-math.ts`. MUST NOT place calculation tests in a separate test directory. Run a single module's spec with `npm run test:unit -- src/lib/<module>.spec.ts`.

## TypeScript Interfaces

Define explicit input/output interfaces for every public function:

```ts
interface CapitalGainInput {
  purchasePrice: number
  salePrice: number
  purchaseYear: string
  saleYear: string
  assetType: 'EQUITY' | 'DEBT' | 'REAL_ESTATE' | 'GOLD'
}

interface CapitalGainResult {
  gain: number
  isLongTerm: boolean
  taxableGain: number
  taxAmount: number
}
```

## India-Specific Financial Constants

Research-default constants are exported from `src/lib/fire-math.ts`:

```ts
export const INDIA_SWR = 0.035          // Safe Withdrawal Rate for India (post-tax headroom; ADR-0003)
export const INDIA_INFLATION = 0.06     // General inflation assumption
export const DEFAULT_RETURNS = 0.12     // Equity returns assumption
```

> Healthcare inflation is **14%** in the LIVE default (`DEFAULT_ASSUMPTIONS.healthcareInflation`
> in `src/types/assumptions.ts`) — research-grounded for Indian medical inflation. The old `INDIA_HEALTHCARE_INFLATION = 0.08` constant was stale/dead and was removed (FinTech sweep 2026-06-02).

User-facing assumptions (with per-household overrides such as `swrOverride`) resolve through
`src/types/assumptions.ts` (`DEFAULT_ASSUMPTIONS`) + `src/lib/assumption-math.ts` in the order
scenario → household → global (see `docs/adr/0002-retire-layered-assumption-resolver.md`).

### Cost Inflation Index (CII) — NOT currently implemented

> **Doc-drift correction (2026-06-02 FinTech sweep):** the `CII_INDEX` map described below was
> inherited from the retired `FIREKaro-Vue` monorepo and **does NOT exist in this repo** — a
> repo-wide grep finds no `CII_INDEX` constant and no indexation arithmetic in `src/lib/`. Indexed
> debt/property LTCG is not modelled here (equity/foreign LTCG is correctly post-Budget-2024 12.5%
> *without* indexation — see `esop-tax.ts`). Whether to add CII-indexed LTCG is tracked as a scope
> decision in gh-issue #6. Do not assume `tax.ts` owns a CII map until that issue is resolved.

If CII indexation is added, the canonical home would be `src/lib/tax.ts`, shaped as:

```ts
// NOT YET IMPLEMENTED — see gh-issue #6.
export const CII_INDEX: Record<string, number> = {
  '2001-02': 100,
  // ... notified index (FY2023-24 = 348, FY2024-25 = 363) through current year
}
```

### Tax Rates and Thresholds

Tax rates and thresholds live in `src/lib/tax.ts`. LTCG holding-period thresholds vary by asset
(1 year for equity, 2 years for debt, 3 years for real estate). These constants MUST be kept
current with Indian tax law changes — see `.claude/rules/indian-financial-context.md` for the
authoritative values.

## Monetary Output Rounding

All monetary outputs MUST be rounded to integers using `Math.round()`. Do not return fractional rupee amounts.

## Unit Test Conventions

Tests use describe/it structure with pure input/output assertions:

```ts
describe('fireNumber', () => {
  it('computes the FIRE number for given expenses and SWR', () => {
    const result = fireNumber({ annualExpenses: 1200000, swr: INDIA_SWR })
    expect(result).toBeCloseTo(34285714, -2)
  })

  it('handles zero expenses', () => {
    expect(fireNumber({ annualExpenses: 0, swr: INDIA_SWR })).toBe(0)
  })
})
```

- Use `toBeCloseTo` for floating point comparisons
- Test boundary conditions (zero inputs, negative values, maximum ranges)
- Use real Indian financial scenarios (actual CII values, realistic salary ranges in INR)

---
description: Frontend pure calculation modules and India-specific financial constants
globs: ["src/lib/**/*.ts"]
---

# Calculation Module Conventions

> **Repo note (extraction, 2026-05-31):** this rule was inherited from the retired `FIREKaro-Vue`
> monorepo, where calculations lived in a `server/lib/calculations/` Hono backend. In this
> extracted `firekaro-planner` repo, **all calculation math lives in `src/lib/*.ts`** and is
> consumed directly by the Vue planner (Pinia stores + composables) — there is no calc backend.
> The `server/` here is only the thin Hono/Prisma document API (`household-diff.ts`). Paths and
> the module inventory below reflect THIS repo; `CLAUDE.md` → "Calculations" is the SSOT.

## Architecture

Pure calculation functions live in `src/lib/*.ts` with a colocated `*.spec.ts`. These modules MUST
be pure: **no Pinia store access, no DOM, no IO, no network**. Stores and composables fetch/hold
the data, then pass plain inputs to these functions and persist the results via the storage
adapter. Keep the calculation layer free of framework concerns so the specs can test pure
input → output.

## Module Inventory

Calculation modules in `src/lib/` (see `CLAUDE.md` for the authoritative list):

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

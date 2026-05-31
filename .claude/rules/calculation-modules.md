---
description: Backend pure calculation functions and India-specific financial constants
globs: ["server/lib/calculations/**/*.ts"]
---

# Calculation Module Conventions

## Architecture

Pure calculation functions live in `server/lib/calculations/*.ts`. These modules MUST NOT import Prisma, access the database, or perform any IO. Route handlers fetch data from Prisma, then pass it to calculation functions.

## Module Inventory

13 calculation modules exist:

| Module | Purpose |
|--------|---------|
| `advance-tax.ts` | Quarterly advance tax estimation |
| `business-income.ts` | Presumptive and regular business income |
| `capital-gains.ts` | LTCG/STCG with CII indexation |
| `esop.ts` | ESOP taxation and vesting calculations |
| `expense-coverage.ts` | How long savings cover expenses |
| `fire-crossover.ts` | Passive income vs expenses crossover point |
| `fire-metrics.ts` | FIRE number, savings rate, years to FIRE |
| `fire-projections.ts` | Year-by-year corpus projection |
| `freedom-score.ts` | 0-100 financial independence score |
| `goals.ts` | Goal funding and gap analysis |
| `monte-carlo.ts` | Monte Carlo retirement simulation |
| `rental-income.ts` | Rental yield and net income |
| `withdrawal-strategy.ts` | SWR-based withdrawal planning |

## Colocated Tests

Tests live next to their module: `fire-metrics.spec.ts` alongside `fire-metrics.ts`. MUST NOT place calculation tests in a separate test directory.

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

Named constant exports used across calculation modules:

```ts
export const INDIA_SWR = 0.035          // Safe Withdrawal Rate for India
export const INDIA_INFLATION = 0.06     // General inflation assumption
export const INDIA_HEALTHCARE_INFLATION = 0.08
export const DEFAULT_RETURNS = 0.12     // Equity returns assumption
```

### Cost Inflation Index (CII)

```ts
export const CII_INDEX: Record<string, number> = {
  '2001-02': 100,
  '2002-03': 105,
  // ... full index through current year
}
```

### Tax Rates and Thresholds

Tax rates defined by asset type. LTCG thresholds vary by holding period (1 year for equity, 2 years for debt, 3 years for real estate). These constants MUST be kept current with Indian tax law changes.

## Shared Utilities

- `roundPercent(value, decimals=1)` from `server/lib/validators.ts` — used across multiple calculation modules for consistent percentage formatting
- `financialYearSchema` from `server/lib/validators.ts` — validates `YYYY-YY` format ensuring end year equals start year + 1

## Monetary Output Rounding

All monetary outputs MUST be rounded to integers using `Math.round()`. Do not return fractional rupee amounts.

## Unit Test Conventions

Tests use describe/it structure with pure input/output assertions:

```ts
describe('calculateFireMetrics', () => {
  it('should compute correct FIRE number for given expenses', () => {
    const result = calculateFireMetrics({
      monthlyExpenses: 100000,
      currentCorpus: 5000000,
      expectedReturns: 0.12
    })
    expect(result.fireNumber).toBe(34285714)
    expect(result.savingsRate).toBeCloseTo(45.2, 1)
  })

  it('should handle zero expenses', () => {
    const result = calculateFireMetrics({ monthlyExpenses: 0, ... })
    expect(result.fireNumber).toBe(0)
  })
})
```

- Use `toBeCloseTo` for floating point comparisons
- Test boundary conditions (zero inputs, negative values, maximum ranges)
- Use real Indian financial scenarios (actual CII values, realistic salary ranges in INR)

---
description: API-based formula verification patterns for E2E calculation tests
globs: ["e2e/tests/**/10-formula-verification.spec.ts", "e2e/utils/calculation-helpers.ts"]
---

# E2E API Verification

## API-Based Verification Over UI Scraping

Formula verification tests MUST use API-based verification. Fetching calculated values directly from the API is more reliable than scraping rendered UI text, avoids Vuetify rendering timing issues, and tests the actual calculation logic.

## Request Pattern

Use Playwright's built-in HTTP client which carries auth cookies and the dev bypass header:

```typescript
const res = await page.request.get('/api/fire/metrics', {
  headers: { 'x-dev-bypass': 'true' },
})
```

## Response Handling

Always check response status before using data:

```typescript
if (!res?.ok()) {
  expect(res.status()).toBeGreaterThanOrEqual(400)
  return
}
const data = await res.json()
```

## Empty Data Handling

Handle empty data explicitly — validate it, never skip:

```typescript
if (Array.isArray(data) && data.length === 0) {
  expect(data).toHaveLength(0)
  return
}

// For object responses
if (!data || Object.keys(data).length === 0) {
  expect(data).toBeDefined()
  return
}
```

NEVER use `test.skip()` — always validate the actual state (empty, error, or data).

## Tolerance-Based Comparison

Use `compareWithTolerance()` from `calculation-helpers.ts` for all numeric comparisons:

```typescript
import { compareWithTolerance } from '../../utils/calculation-helpers'

// Default 1% tolerance for same-module calculations
expect(compareWithTolerance(actual, expected, 1)).toBeTruthy()

// Up to 5% for cross-module calculations (rounding accumulation)
expect(compareWithTolerance(actualFIRENumber, calculatedFIRENumber, 5)).toBeTruthy()
```

Implementation:

```typescript
export function compareWithTolerance(
  actual: number,
  expected: number,
  tolerancePercent: number = 1
): boolean {
  if (expected === 0) return Math.abs(actual) < 0.01
  const diff = Math.abs(actual - expected) / Math.abs(expected) * 100
  return diff <= tolerancePercent
}
```

## INR Parsing Utility

`parseINR(formatted)` handles all display formats:

```typescript
export function parseINR(formatted: string): number {
  if (!formatted) return 0
  const cleaned = formatted.replace(/[₹,\s]/g, '')

  if (cleaned.endsWith('Cr')) return parseFloat(cleaned) * 10000000
  if (cleaned.endsWith('L')) return parseFloat(cleaned) * 100000
  if (cleaned.endsWith('K')) return parseFloat(cleaned) * 1000

  return parseFloat(cleaned) || 0
}
```

Handles: `"36.50 L"`, `"1.50 Cr"`, `"5.25 K"`, `"₹1,50,000"`, `"₹36,50,000"`

## Percentage Verification

```typescript
export function verifyPercentageSum(
  percentages: number[],
  expectedSum: number = 100,
  tolerance: number = 1
): boolean {
  const sum = percentages.reduce((a, b) => a + b, 0)
  return compareWithTolerance(sum, expectedSum, tolerance)
}
```

## Financial Calculation Helpers

### EMI Calculation (Standard Annuity Formula)

```typescript
export function calculateEMI(principal: number, annualRate: number, tenureMonths: number): number {
  const monthlyRate = annualRate / 12 / 100
  if (monthlyRate === 0) return principal / tenureMonths
  return principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths) /
    (Math.pow(1 + monthlyRate, tenureMonths) - 1)
}
```

### FIRE Number

```typescript
export function calculateFIRENumber(annualExpenses: number, swr: number): number {
  return annualExpenses / swr
}
```

### Credit Utilization and DTI

```typescript
export function calculateCreditUtilization(outstanding: number, limit: number): number {
  if (limit === 0) return 0
  return (outstanding / limit) * 100
}

export function calculateDTI(monthlyDebt: number, monthlyIncome: number): number {
  if (monthlyIncome === 0) return 0
  return (monthlyDebt / monthlyIncome) * 100
}
```

## India-Specific Constants

```typescript
const INDIA_SWR = 0.035  // 3.5% safe withdrawal rate for India
```

Normalize SWR values from API — some endpoints return percentage (3.5), others return decimal (0.035):

```typescript
const normalizedSWR = data.swr > 1 ? data.swr / 100 : data.swr
const expectedFIRENumber = calculateFIRENumber(data.annualExpenses, normalizedSWR)
expect(compareWithTolerance(data.fireNumber, expectedFIRENumber, 1)).toBeTruthy()
```

## Complete Test Example

```typescript
test('verify FIRE number calculation', async ({ page }) => {
  const res = await page.request.get('/api/fire/metrics')
  if (!res?.ok()) {
    expect(res.status()).toBeGreaterThanOrEqual(400)
    return
  }
  const data = await res.json()
  if (!data?.annualExpenses) {
    expect(data).toBeDefined()
    return
  }

  const normalizedSWR = data.swr > 1 ? data.swr / 100 : data.swr
  const expectedFIRE = calculateFIRENumber(data.annualExpenses, normalizedSWR)
  expect(compareWithTolerance(data.fireNumber, expectedFIRE, 1)).toBeTruthy()
})
```

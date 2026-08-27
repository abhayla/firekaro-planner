---
description: TypeScript type definition organization and export patterns
paths: ["src/types/**/*.ts", "src/composables/**/*.ts"]
---

# Type Organization

## Interface vs Type

Use `interface` for data model entities that come from the API:

```typescript
interface Investment {
  id: string
  name: string
  type: InvestmentType
  currentValue: number
  investedAmount: number
  startDate: string
}

interface Loan {
  id: string
  lender: string
  type: LoanType
  principalAmount: number
  outstandingBalance: number
  interestRate: number
  emiAmount: number
  tenureMonths: number
}

interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  targetDate: string
  priority: GoalPriority
}
```

Use `type` for string unions and enum-like values:

```typescript
type LoanType = 'HOME_LOAN' | 'PERSONAL_LOAN' | 'CAR_LOAN' | 'EDUCATION_LOAN' | 'GOLD_LOAN'
type InvestmentType = 'EQUITY' | 'DEBT' | 'HYBRID' | 'GOLD' | 'REAL_ESTATE' | 'PPF' | 'EPF' | 'NPS'
type GoalPriority = 'ESSENTIAL' | 'IMPORTANT' | 'NICE_TO_HAVE'
type IncomeType = 'SALARY' | 'BUSINESS' | 'RENTAL' | 'CAPITAL_GAINS' | 'OTHER'
```

## Input and Update Types

Input types use `Input` suffix for creation payloads:

```typescript
interface CreateGoalInput {
  name: string
  targetAmount: number
  targetDate: string
  priority: GoalPriority
}

interface CreatePolicyInput {
  provider: string
  policyNumber: string
  type: InsuranceType
  premium: number
  coverAmount: number
}
```

Update types extend partial creation inputs with required `id`:

```typescript
interface UpdateGoal extends Partial<CreateGoalInput> {
  id: string
}

interface UpdatePolicy extends Partial<CreatePolicyInput> {
  id: string
}
```

## Co-location Strategy

Types defined in the composable file when domain-specific and used only within that composable. The `useFIRE` composable defines ~20 interfaces inline (FIREMetrics, FreedomScore, ProjectionResult, MonteCarloResult, etc.) because they are tightly coupled to FIRE calculations.

Shared types go in `src/types/` when used across multiple composables:
- `src/types/salary.ts` — salary structures used by income, tax, and FIRE composables
- `src/types/income.ts` — income types shared across salary, business, rental composables
- `src/types/tax.ts` — tax regime, deduction, and exemption types

## Constants with Types

Constants defined alongside their types using `as const`:

```typescript
export const SYSTEM_COMPONENTS = ['EPF', 'PPF', 'NPS', 'ELSS'] as const
export const FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'] as const

export const CII_INDEX: Record<string, number> = {
  '2001-02': 100,
  '2023-24': 348,
  '2024-25': 363,
}

export const TAX_CONFIG = {
  oldRegime: { slabs: [...] },
  newRegime: { slabs: [...] },
} as const

export const DEDUCTION_LIMITS: Record<string, number> = {
  '80C': 150000,
  '80D_SELF': 25000,
  '80D_PARENTS': 50000,
  'NPS_80CCD1B': 50000,
}

export const DEFAULT_COMPONENT_DEFINITIONS = { ... } as const
```

## Export Pattern

All types and constants exported individually — no barrel exports (`export *` or `index.ts` re-exports) for type files:

```typescript
// CORRECT
export interface Investment { ... }
export type InvestmentType = '...'
export const INVESTMENT_CONFIG = { ... } as const

// WRONG — no barrel re-exports for types
export * from './investment'
export * from './loan'
```

## Domain Config Records

Each domain defines a config record mapping enum values to UI metadata:

```typescript
const LOAN_TYPE_CONFIG: Record<LoanType, { icon: string; color: string; label: string }> = {
  HOME_LOAN: { icon: 'mdi-home', color: 'primary', label: 'Home Loan' },
  PERSONAL_LOAN: { icon: 'mdi-account', color: 'warning', label: 'Personal Loan' },
  CAR_LOAN: { icon: 'mdi-car', color: 'info', label: 'Car Loan' },
  EDUCATION_LOAN: { icon: 'mdi-school', color: 'success', label: 'Education Loan' },
  GOLD_LOAN: { icon: 'mdi-gold', color: 'amber', label: 'Gold Loan' },
}
```

## Status-to-Color Mapping

Functions that map status to colors MUST return Vuetify color names:

```typescript
function getStatusColor(status: GoalStatus): string {
  switch (status) {
    case 'ON_TRACK': return 'success'
    case 'AT_RISK': return 'warning'
    case 'OFF_TRACK': return 'error'
    case 'COMPLETED': return 'primary'
    default: return 'grey'
  }
}
```

## Backend Enum Case Conversion

Backend sends UPPERCASE enums; frontend uses lowercase. Transform at the API boundary:

```typescript
function transformFromBackend<T extends string>(value: string): T {
  return value.toLowerCase() as T
}

function transformToBackend(value: string): string {
  return value.toUpperCase()
}
```

Apply in query/mutation functions, not in components. Components always work with lowercase values.

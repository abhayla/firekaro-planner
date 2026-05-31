# Indian Financial Context

## Key Instruments

| Instrument | Interest/Return | Key Rules |
|------------|----------------|-----------|
| **EPF** | 8.25% | Employer contributes 12% of basic (3.67% EPF, 8.33% EPS) |
| **PPF** | 7.1% | 15-year lock-in, ₹1.5L/year max, partial withdrawal after 7th year |
| **NPS** | Market-linked | 60% lump sum tax-free, 40% annuity; corpus ≤ ₹5L fully withdrawable |
| **ESOP/RSU** | Varies | Vesting types: CLIFF/GRADED/MILESTONE/HYBRID, perquisite tax at vesting |

## Tax Deduction Limits

| Section | Limit | Purpose |
|---------|-------|---------|
| 80C | ₹1.5L | EPF, PPF, ELSS, life insurance, tuition fees |
| 80CCD(1B) | ₹50K | Additional NPS contribution |
| 80CCD(2) | Up to 10% salary | Employer NPS contribution |
| 80D | ₹25K self / ₹50K parents | Health insurance premium |
| Section 24 | ₹2L | Home loan interest deduction |

## Tax Config Source of Truth

- Backend: `server/lib/tax-config.ts` — covers FY 2022-23 through 2025-26
- Frontend: `src/types/tax.ts` — mirrors backend config
- FY 2025-26 new regime includes marginal relief (tax cannot exceed income above ₹12L rebate limit)

## Constants Used in Calculations

```ts
INDIA_SWR = 0.035           // 3.5% Safe Withdrawal Rate for India
INDIA_INFLATION = 0.06      // General inflation assumption
INDIA_HEALTHCARE_INFLATION = 0.08
DEFAULT_RETURNS = 0.12      // Equity returns assumption
```

## Indian Financial Year

April 1 to March 31. Format: `YYYY-YY` (e.g., `"2024-25"`). See `rules/financial-year-handling.md` for full details.

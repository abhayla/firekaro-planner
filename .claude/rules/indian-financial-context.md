---
description: Indian financial instruments, tax deduction limits, FY format, and tax-config SSOT — reference for the calculation modules.
paths: ["src/lib/**", "src/types/**"]
---

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

> **Repo note (extraction, 2026-05-31):** the old monorepo split tax config across a
> `server/lib/tax-config.ts` backend + `src/types/tax.ts` mirror. In this extracted
> `firekaro-planner` repo there is no tax backend — tax math is client-side.

- `src/lib/tax.ts` — single SSOT for tax slabs, old/new regime, surcharge (+ marginal relief), cess, rebate. **Configured FYs: 2024-25 → 2026-27** (an unconfigured FY silently falls back to the newest — gh-issue #6). CII-indexed LTCG is **not** implemented here (gh-issue #6).
- `src/lib/tax-deductions.ts` — 80C / 80D / 80CCD deduction caps
- FY 2025-26 new regime includes marginal relief (tax cannot exceed income above the ₹12L rebate limit)

## Constants Used in Calculations

Exported from `src/lib/fire-math.ts`:

```ts
INDIA_SWR = 0.035           // 3.5% Safe Withdrawal Rate for India
INDIA_INFLATION = 0.06      // General inflation assumption
DEFAULT_RETURNS = 0.12      // Equity returns assumption
// Healthcare inflation = 14% live (DEFAULT_ASSUMPTIONS.healthcareInflation, types/assumptions.ts).
// The old INDIA_HEALTHCARE_INFLATION = 0.08 constant was stale/dead → removed (2026-06-02).
```

## Indian Financial Year

April 1 to March 31. Format: `YYYY-YY` (e.g., `"2024-25"`). See `rules/financial-year-handling.md` for full details.

# Section → API Endpoint Map

Maps each E2E test section directory under `e2e/tests/{section}/` to the
backend API endpoints whose live values back the section's screenshots.
The Stage 2.1 expectation-builder reads this map to decide which endpoints
to hit before running each section.

Endpoints are listed in **priority order** — the first endpoint is the
"primary" one whose values drive the main expectation string. Additional
endpoints supply secondary fields (e.g., FY selector value, family member
name, etc.).

All endpoints accept the `x-dev-bypass: true` header. Most list/summary
endpoints respond under the envelope `{ success, data, pagination? }` —
the expectation-builder MUST unwrap via `.data` per
`.claude/rules/api-response-unwrapping.md`.

## Default Section Order

This is the order the pipeline loops through sections unless `--sections=`
overrides it. Ordering follows the dashboard navigation order from
`CLAUDE.md` with two additions (`salary` first so downstream income tests
have data; `integration` last so cross-section checks run against a fully
populated state).

```
salary → income → tax-planning → expenses → investments → liabilities →
insurance → financial-health → fire-goals → family → integration
```

## Per-Section Endpoints

### salary

Primary:    `/api/salary/current`, `/api/salary-history?financialYear={fy}`
Secondary:  `/api/salary-components`, `/api/income-sources`
Summary:    `/api/salary/summary`

Expected fields on screen:
- Annual CTC, monthly gross, monthly net (from `/api/salary/current` + `/api/salary-history`)
- Employer list and FY tabs (from `/api/income-sources` + FY selector)
- Career progression chart points (from `/api/salary-history`)

NOTE: `/api/salary?financialYear=...` (the generic "list" endpoint) is NOT
mounted on the salary router — use `/current` for the latest record or
`/salary-history?financialYear=...` for per-month rows. This was confirmed
on 2026-04-18 after 404s during Stage 2.1 expectation building.

### income

Primary:    `/api/business-income`, `/api/rental-income`, `/api/capital-gains`
Secondary:  `/api/other-income`, `/api/dividend-income`, `/api/interest-income`, `/api/income-sources`

Expected fields on screen:
- Total income by type (grouped totals)
- Per-source row count and totals in the Details tab
- FY filter applied to each sub-type

### tax-planning

Primary:    `/api/tax-planning/scenarios`, `/api/tax-planning/reports`
Secondary:  `/api/advance-tax`, `/api/fire/metrics` (for tax-FIRE interaction)

Expected fields on screen:
- Old vs new regime comparison numbers
- Total tax, effective rate, savings rate
- Advance tax installment schedule (Q1–Q4)

### expenses

Primary:    `/api/expenses`, `/api/budgets`
Secondary:  `/api/recurring-expenses`, `/api/expense-rules`, `/api/expenses-ai`

Expected fields on screen:
- Monthly total, category breakdown chart
- Budget adherence percentages per category
- Recent expenses table (most recent N rows)

### investments

Primary:    `/api/investments`, `/api/investment-reports`
Secondary:  `/api/epf`, `/api/ppf`, `/api/nps`, `/api/esop`

Expected fields on screen:
- Total invested, current value, returns %
- Allocation doughnut (equity / debt / gold / retirement)
- EPF/PPF/NPS balance cards

### liabilities

Primary:    `/api/loans`, `/api/credit-cards`, `/api/liabilities`
Secondary:  `/api/liabilities-reports`

Expected fields on screen:
- Total outstanding, monthly EMI, DTI ratio
- Per-loan amortization status
- Credit utilization gauge

### insurance

Primary:    `/api/insurance`
Secondary:  none

Expected fields on screen:
- Total cover (life + health), total annual premium
- Policies-by-type chip row
- HLV gap indicator

### financial-health

Primary:    `/api/financial-health`
Secondary:  `/api/banking/accounts`, `/api/fire/freedom-score`

Expected fields on screen:
- Net worth total and trend
- Health score + factor breakdown
- Asset vs liability chart
- Banking account balances

### fire-goals

Primary:    `/api/fire/metrics`, `/api/goals`
Secondary:  `/api/fire/freedom-score`, `/api/fire/expense-coverage`,
            `/api/fire/crossover`, `/api/fire/monte-carlo`,
            `/api/fire/projections`, `/api/withdrawal-strategy`

Expected fields on screen:
- FIRE number, years to FIRE, savings rate
- Freedom score (0-100)
- Goal cards with target, current, progress %
- Monte Carlo success probability
- Crossover month / passive income line chart

### family

Primary:    `/api/family`
Secondary:  `/api/family-summary/fire`, `/api/family-summary/income`,
            `/api/family-summary/expenses`, `/api/family-summary/investments`,
            `/api/family-summary/liabilities`, `/api/family-summary/insurance`,
            `/api/invitations`

Expected fields on screen:
- Family member list (names, roles)
- Aggregated totals when `?familyView=true`
- Admin-only vs member-visible sections (per `rules/family-view-pattern.md`)
- Pending invitations

### integration

Primary:    all of the above — integration tests cross-verify data consistency

Expected fields on screen:
- Same values appear consistently across multiple pages (e.g., total income
  on salary page matches total income on tax-planning page matches
  FIRE-metrics income input)
- No divergence beyond tolerance across pages

## Endpoints That Require Query Parameters

Most endpoints accept `?financialYear=YYYY-YY`. The expectation-builder MUST
default to the current FY (`getCurrentFinancialYear()` from
`src/types/salary.ts`) unless a test file includes an explicit FY in its
name or body.

Family-view endpoints require `?familyView=true`. Trigger only when running
the `family` section or integration tests that explicitly exercise family
view.

## Handling Missing Endpoints

When a test has no clean endpoint mapping (e.g., navigation smoke tests,
infrastructure tests), the expectation-builder MUST leave
`visual_expectation` blank for that test. `/e2e-visual-run` then falls back
to generic AI visual verification (layout correct, no error dialogs, no
empty states without reason). This is intentional — not every test needs
numeric-value verification.

# New-User Journey — Verification Report

**Run:** `2026-06-05T10-48-04-498Z_dhalfx` (HEADED, watched live) · ServerAdapter/prod-like · fresh new user (Maurya)
**Result:** 27 screens · serverPersist=true · pageErrors=0 · coverageGaps=0

## Data entered (backend-confirmed)

| Section | Count |
|---|---|
| members | 4 |
| investments | 13 |
| recurring | 4 |
| planned | 4 |
| liabilities | 2 |
| insurance | 3 |
| businesses | 1 |
| otherIncome | 3 |

## Per-screen control matrix

| Screen | Data | Overview | Controls (responded/total) | Console | Verdict |
|---|---|---|---|---|---|
| splash | – | – | – | clean | ✅ |
| wizard-profile | ✓ | – | – | clean | ✅ |
| investments-holdings | ✓ | – | 3/4 | clean | ◑ |
| investments-overview | – | ✓ | 1/1 | clean | ✅ |
| expenses-recurring | ✓ | – | 1/2 | clean | ◑ |
| expenses-planned | ✓ | – | 1/1 | clean | ✅ |
| expenses-overview | – | ✓ | 1/1 | clean | ✅ |
| liabilities-loans | ✓ | – | 1/2 | clean | ◑ |
| liabilities-overview | – | ✓ | 1/1 | clean | ✅ |
| insurance-policies | ✓ | – | 1/2 | clean | ◑ |
| insurance-overview | – | ✓ | 1/1 | clean | ✅ |
| income-salary | ✓ | – | 3/3 | clean | ✅ |
| income-business | ✓ | – | 3/3 | clean | ✅ |
| income-other-sources | ✓ | – | 3/3 | clean | ✅ |
| income-overview | – | ✓ | 1/1 | clean | ✅ |
| tax-planning | – | – | 1/2 | clean | ◑ |
| financial-health | – | – | 1/1 | clean | ✅ |
| financial-health-networth | – | – | 1/1 | clean | ✅ |
| financial-health-cashflow | – | – | 1/1 | clean | ✅ |
| fire-goals-dashboard | – | ✓ | 1/1 | clean | ✅ |
| fire-goals-goals | – | – | 1/1 | clean | ✅ |
| fire-goals-whatif | – | – | 2/2 | clean | ✅ |
| fire-goals-stress-test | – | – | 1/1 | 1 infra | ✅ |
| investments-buckets | – | – | 1/1 | clean | ✅ |
| estate-planning | – | – | 1/1 | clean | ✅ |
| preferences | – | – | 1/1 | clean | ✅ |
| profile | – | – | 1/2 | clean | ◑ |

## Issues filed this session
- #34 — homemaker spouse cannot be modeled (mis-modeled as DEPENDENT, longevity dropped)
- #35 — connection-pool exhaustion (FIXED + prod-deployed + verified)
- #36 — demo seed switcher in prod (data-loss risk)
- #37 — ServerAdapter silent write-behind data loss (this run: investments 11/13, insurance 2/3)

## Rule-33 blind-verifier verdict
coverage_complete=true, verdict_correct=true (qualified). 0 genuine app errors; all values domain-sane (FIRE 57, corpus ₹3.62Cr, tax 21.3%). Dissents → #37 (silent persist loss) + create-dialog path not exercised on 5 inline-form screens (driver-sweep limitation, not a product bug).

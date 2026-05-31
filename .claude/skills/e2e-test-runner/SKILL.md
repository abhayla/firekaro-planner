---
name: e2e-test-runner
description: >
  Run E2E tests with the project's custom test runner that handles section ordering,
  retry logic, screenshot analysis, and auto-fix integration.
type: workflow
allowed-tools: "Read Bash Grep Glob"
argument-hint: "[--section <name>] [--fix] [--report]"
version: "1.0.0"
---

# E2E Test Runner

Run FIREKaro E2E tests with dependency-aware section ordering, automatic retries,
failure classification, and optional auto-fix integration.

## STEP 1: Determine Scope

Parse the arguments to determine what to run:

**If `--section <name>` is provided:**
- Run only that section's tests from `e2e/tests/{section}/`
- Validate the section name exists in the test directory
- Still respect internal test ordering (00-data-setup first)

**If no section specified, run ALL sections in dependency order:**

| Order | Section | Depends On |
|-------|---------|------------|
| 1 | salary | (none — base section) |
| 2 | income | salary (for total income calculations) |
| 3 | investments | (independent, but after income for portfolio context) |
| 4 | expenses | salary, income (for budget vs income ratios) |
| 5 | liabilities | (independent) |
| 6 | insurance | (independent) |
| 7 | tax-planning | salary, income, investments (needs all income sources) |
| 8 | financial-health | salary, income, investments, expenses, liabilities (aggregates all) |
| 9 | fire-goals | financial-health (needs net worth and savings rate) |
| 10 | integration | ALL (cross-section consistency) |

If a section fails and later sections depend on it, mark dependent sections as BLOCKED.

## STEP 2: Run Tests

Execute tests using the custom runner:

    npx tsx e2e/utils/test-runner.ts [options]

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--section <name>` | all | Run specific section only |
| `--retry <N>` | 3 | Max retries per failing test |
| `--fix` / `--no-fix` | `--no-fix` | Enable auto-fix integration |
| `--report` | off | Generate HTML and JSON reports |
| `--headless` | true | Run in headless browser mode |
| `--workers <N>` | 2 | Parallel worker count |

The runner spawns Playwright as a subprocess:

    npx playwright test e2e/tests/{section}/ --reporter=json --workers=2

For the full suite, use the convenience script:

    npm run test:e2e:smart

This is the primary entry point that handles ordering, retries, and reporting automatically.

### Per-Section Execution

Within each section, tests run in file-name order:
1. `00-data-setup.spec.ts` runs FIRST (seeds test data via API)
2. `01-navigation.spec.ts` through `09-*.spec.ts` (feature tests)
3. `10-formula-verification.spec.ts` (calculation accuracy)
4. `25-cross-page-consistency.spec.ts` (cross-section data checks)

If `00-data-setup.spec.ts` fails, ALL remaining tests in that section are BLOCKED.

### Retry Logic

For each failing test:
1. First retry: immediate (may be a flaky timing issue)
2. Second retry: after clearing browser state (cookies, local storage)
3. Third retry: after re-running data setup for the section

If a test passes on retry without any code changes, it is classified as FLAKY.

## STEP 3: Classify Results

After all tests complete (or fail), classify each test into one of these statuses:

### PASSED
- Test passed on the first attempt
- No action needed

### FAILED
- Test failed all retry attempts
- Needs investigation or auto-fix
- Includes error message, stack trace, and screenshot path

### FIXED
- Test failed initially but passed after auto-fix was applied (requires `--fix` flag)
- Records which fix category was applied and confidence score

### FLAKY
- Test failed on first run but passed on a retry WITHOUT any code changes
- Indicates timing sensitivity or non-deterministic behavior
- These tests should be investigated to reduce flakiness

### BLOCKED
- Test could not run because a dependency failed
- Either data setup failed, or a prerequisite section failed
- No error from this test itself — the failure is upstream

Track counts per status and per section for the summary.

## STEP 4: Auto-Fix (if --fix)

When `--fix` flag is enabled:

1. Collect all FAILED tests after retries are exhausted
2. Delegate each failure to `/e2e-auto-fixer` skill with the test file path
3. The auto-fixer classifies the failure and applies targeted fixes
4. Re-run fixed tests to verify the fix worked
5. Update test status: FAILED becomes FIXED if the fix succeeded

Track auto-fix metrics:
- Total tests sent to auto-fixer
- Fix success rate (FIXED / total attempted)
- Fix categories applied (selector_not_found: 3, timeout: 1, etc.)
- Average confidence score of applied fixes

If auto-fixer reports a test as UNFIXABLE, keep it as FAILED in the final results.

## STEP 5: Generate Report (if --report)

### HTML Report

Generate an interactive HTML report in `e2e/test-results/reports/`:
- File name: `report-{timestamp}.html`
- Includes: test tree with pass/fail/flaky indicators, screenshots for failures, timing data
- Playwright's built-in HTML reporter handles this: `--reporter=html`

### JSON Summary

Generate a machine-readable summary at `e2e/test-results/reports/summary-{timestamp}.json`:

    {
      "timestamp": "2026-03-18T00:34:27Z",
      "duration": 245000,
      "sections": {
        "salary": {
          "total": 18,
          "passed": 16,
          "failed": 1,
          "flaky": 1,
          "fixed": 0,
          "blocked": 0
        }
      },
      "totals": {
        "total": 142,
        "passed": 130,
        "failed": 4,
        "flaky": 6,
        "fixed": 2,
        "blocked": 0,
        "passRate": "91.5%",
        "fixRate": "33.3%"
      },
      "autoFix": {
        "attempted": 6,
        "succeeded": 2,
        "categories": {
          "selector_not_found": 2,
          "timeout": 1,
          "data_mismatch": 1,
          "layout_issue": 1,
          "auth_error": 1
        }
      },
      "flaky": [
        "e2e/tests/salary/02-overview.spec.ts > chart renders within 5s"
      ],
      "blocked": []
    }

### Console Summary

Always print a console summary regardless of `--report` flag:

    ============================================
    E2E Test Results — FIREKaro Dashboard
    ============================================
    Sections: 10/10 completed (0 blocked)
    Total:    142 tests
    Passed:   130 (91.5%)
    Failed:   4
    Flaky:    6
    Fixed:    2 (auto-fix)
    Blocked:  0
    Duration: 4m 5s
    ============================================

    FAILED:
      - expenses/03-details-crud.spec.ts > deletes expense record
      - tax-planning/10-formula.spec.ts > old regime calculation
      - fire-goals/02-overview.spec.ts > milestone progress bar
      - integration/25-consistency.spec.ts > net worth matches

    FLAKY (passed on retry):
      - salary/02-overview.spec.ts > chart renders within 5s
      - investments/02-overview.spec.ts > portfolio pie chart
      ...

## CRITICAL RULES

- Workers MUST be set to 2 for full suite runs (`--workers=2`) to avoid overloading the dev server
- Data setup tests (`00-*.spec.ts`) MUST run before feature tests in each section — never parallelize setup with feature tests
- NEVER run integration tests (`e2e/tests/integration/`) before all individual section tests pass
- Use `npm run test:e2e:smart` as the primary entry point for full suite runs
- If a section's data setup fails, mark ALL remaining tests in that section as BLOCKED — do not attempt them
- Flaky tests (pass on retry) MUST be reported separately — they indicate test quality issues that need fixing
- NEVER increase `--workers` above 4 — the Hono dev server cannot handle more concurrent connections reliably
- Screenshots from failures are stored in `e2e/test-results/screenshots/` — reference them in reports
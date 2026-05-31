---
name: e2e-auto-fixer
description: >
  Analyze E2E test failures, classify by pattern, and apply targeted auto-fixes.
  Uses the project's auto-fixer system for Vuetify/Playwright specific issues.
type: workflow
allowed-tools: "Read Write Edit Bash Grep Glob"
argument-hint: "[test-file-or-section]"
version: "1.0.0"
---

# E2E Auto-Fixer

Diagnose and fix Playwright E2E test failures in the FIREKaro Vue dashboard.
This skill classifies failures into known patterns and applies targeted fixes
specific to the Vuetify 3 + Playwright + Hono stack.

## STEP 1: Identify Failures

Run the failing tests and capture structured output:

    npm run test:e2e -- e2e/tests/{section}/ --reporter=json > /tmp/e2e-results.json

Parse the JSON output to extract:
- Test file path and test name
- Error message and stack trace
- Screenshot path (if captured)
- Duration and timeout values
- Retry attempt number

If no section is specified, check `e2e/test-results/` for the most recent failure report.

Group failures by test file to identify patterns across related tests.

## STEP 2: Classify Failure Pattern

Match each failure against these known categories:

### selector_not_found
- **Symptom**: `locator.click: Error: strict mode violation` or `waiting for locator` timeout
- **Root cause**: Vuetify renders dynamic class names, or element structure changed
- **Indicators**: Error mentions `.v-btn`, `.v-card`, `.v-data-table`, or custom selectors

### timeout
- **Symptom**: `Timeout 30000ms exceeded` or `waiting for navigation`
- **Root cause**: Page load slow, API response delayed, or element never appears
- **Indicators**: Error includes `waitForSelector`, `waitForLoadState`, or `waitForURL`

### assertion_failed
- **Symptom**: `expect(received).toBe(expected)` or `toHaveText` mismatch
- **Root cause**: Data changed, calculation updated, or formatting difference
- **Indicators**: Error shows expected vs actual values

### network_error
- **Symptom**: `net::ERR_CONNECTION_REFUSED` or `fetch failed`
- **Root cause**: Dev server not running, API route missing, or CORS issue
- **Indicators**: Error references `/api/` endpoints

### data_mismatch
- **Symptom**: Assertion fails on numeric values or record counts
- **Root cause**: Test data not seeded, stale data from previous run, or wrong user context
- **Indicators**: Expected counts or totals differ from actual

### layout_issue
- **Symptom**: `element is not visible` or `element is outside of the viewport`
- **Root cause**: Vuetify dialog/drawer overlapping, element below fold, responsive breakpoint
- **Indicators**: Element exists in DOM but click/assertion fails

### chart_rendering
- **Symptom**: Canvas element empty or chart labels not found
- **Root cause**: Chart.js renders asynchronously, canvas not painted yet
- **Indicators**: Error involves `canvas`, `chart`, or `.apexcharts` selectors

### navigation_error
- **Symptom**: URL does not match expected path after action
- **Root cause**: Auth redirect, missing route, or guard blocking navigation
- **Indicators**: Expected URL differs from actual, or page shows 404 content

### auth_error
- **Symptom**: Redirected to login page or 401 response
- **Root cause**: Stored auth state expired or global setup failed
- **Indicators**: URL contains `/login`, or API returns 401

## STEP 3: Apply Auto-Fix

For each classified failure, apply the corresponding fix strategy:

### selector_not_found fix
1. Read the component source to find the actual element structure
2. Try alternative selectors in priority order:
   - `getByRole('button', { name: /text/i })` — preferred for buttons
   - `getByText(/visible text/i)` — for text content
   - `locator('.v-card').filter({ hasText: 'title' })` — for Vuetify cards
   - `locator('[data-testid="name"]')` — if test ID exists
3. Update the page object locator, not the test file directly
4. Confidence: 80 if role/text selector works, 50 if falling back to CSS

### timeout fix
1. Add `await page.waitForLoadState('networkidle')` before the failing action
2. If API call involved, add `await page.waitForResponse(url => url.includes('/api/{section}'))`
3. Increase specific timeout to 2x original (but NEVER beyond 60000ms total)
4. If element appears conditionally, add explicit `waitForSelector` with `state: 'visible'`
5. Confidence: 70

### layout_issue fix
1. Add `await element.scrollIntoViewIfNeeded()` before click or assertion
2. If inside a dialog, ensure dialog is fully open: `await page.locator('.v-dialog--active').waitFor()`
3. If responsive issue, verify viewport size matches test config (1280x720 default)
4. Confidence: 75

### chart_rendering fix
1. Add `await page.waitForTimeout(1000)` before canvas assertions (Chart.js needs paint time)
2. For ApexCharts, wait for `.apexcharts-canvas` to appear
3. Verify chart data endpoint returned successfully before asserting on rendered chart
4. Confidence: 60

### data_mismatch fix
1. Check if `hasData()` returns true before running assertions
2. If empty state, verify data setup test ran successfully
3. Compare fixture expected values against API response: `page.request.get('/api/{section}')`
4. If values changed, update fixture expected values to match current calculation logic
5. Confidence: 65

### auth_error fix
1. Delete stale auth state: remove `e2e/.auth/user.json`
2. Re-run global setup: `npx playwright test --project=setup`
3. Verify auth token is valid by checking `/api/auth/session`
4. Confidence: 90

### network_error fix
1. Verify dev server is running on expected port
2. Check if the API route exists in `server/routes/`
3. If route exists but 404, check if it is registered in `server/index.ts`
4. Confidence: 40 (often requires manual intervention)

### assertion_failed fix
1. Read the test to understand what value is expected
2. Read the composable or API to understand what value is produced
3. If formatting difference (e.g., "10,000" vs "10000"), update test to use `formatINR` equivalent
4. If calculation changed, update expected value in fixture
5. Confidence: 55

### navigation_error fix
1. Check router config for the expected path
2. Verify no auth guard is blocking (check `requiresAuth` meta)
3. Add `await page.waitForURL()` with correct pattern after navigation action
4. Confidence: 70

## STEP 4: Verify Fix

After applying a fix:

1. Re-run ONLY the specific failing test file (not the whole suite)
2. If the test passes, mark as FIXED with the fix category and confidence score
3. If still failing:
   - Classify the NEW error (may be a different category now)
   - Apply the next fix approach
   - Maximum 3 fix attempts per test
4. If all 3 attempts fail, report the test as UNFIXABLE with:
   - All attempted fix categories
   - Error messages from each attempt
   - Recommended manual investigation steps

## STEP 5: Rollback if Needed

Before applying any fix:
1. Store the original file content in memory (read before edit)
2. Track which files were modified and what the original content was

If a fix makes things worse (more tests fail after the change):
1. Restore all modified files to their original content
2. Log the failed fix attempt with before/after error counts
3. Move to the next fix strategy or report as UNFIXABLE

Output a summary table:

| Test | Category | Fix Applied | Attempts | Result | Confidence |
|------|----------|-------------|----------|--------|------------|
| `02-overview.spec.ts > shows total premium` | data_mismatch | Updated fixture | 1 | FIXED | 65 |
| `03-crud.spec.ts > deletes record` | selector_not_found | Updated page object locator | 2 | FIXED | 80 |
| `01-nav.spec.ts > sidebar highlight` | layout_issue | Added scrollIntoView | 3 | UNFIXABLE | - |

## CRITICAL RULES

- NEVER skip a failing test by adding `.skip` — always fix or report
- NEVER increase timeouts beyond 2x the original value without investigating root cause
- NEVER modify test assertions to match wrong data — fix the source or the fixture
- Always add `.catch(() => false)` on new visibility checks to prevent unhandled rejections
- Use `page.request.get()` for API verification, not UI scraping
- Fix page objects first, test files second — locator changes belong in page objects
- Preserve original file content before applying any fix for rollback capability
- Report confidence scores honestly — low confidence fixes need human review
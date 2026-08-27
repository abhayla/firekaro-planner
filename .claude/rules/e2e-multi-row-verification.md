---
description: Multi-row insertion loops in E2E tests MUST verify per-iteration DB persistence + final UI render — never trust dialog-close as success
paths: ["e2e/tests/**/*.spec.ts"]
---

# E2E Multi-Row Insertion — Per-Iteration Verification

Any E2E test that creates more than one record in a loop MUST verify each iteration landed in the database BEFORE moving to the next iteration, AND MUST verify the final rendered UI shows all rows. End-of-loop counts and "dialog closed = success" idioms produce false-positive passes that hide real persistence bugs.

This rule promotes the project memory entry `feedback_per_iteration_db_verify.md` to a file-path-scoped rule that auto-loads when any E2E spec is open. The canonical helper is `expectRowAddedAfterIteration` in `e2e/utils/per-iteration-verify.ts`.

## Why "dialog closed = success" lies

Vuetify dialogs close on Save-button click regardless of the mutation outcome. A 400-Zod-rejection, an upsert that overwrote row 1, a snackbar racing the next iteration's dialog open — none of these prevent `await expect(dialog).toBeHidden()` from passing. The mutation may have failed silently while the test reports green. End-of-loop count assertions catch HTTP-level failures (POST returned non-2xx) but MISS:

- Upsert-with-wrong-unique-key that overwrites instead of inserts (count never grows past 1)
- Form-state pollution where iteration N+1 submits stale/empty fields and the server accepts a malformed row
- Vue Query stale-cache states where the UI doesn't reflect the DB even though the DB is correct
- Per-row data corruption (row persisted but with the wrong field values)

Per-iteration verify + final UI count catches all four.

## MUST / MUST NOT

- MUST gate every Save click in a multi-row loop on `page.waitForResponse()` inside `Promise.all([...])` and assert `response.status() === 201` (or 200 if the API uses 200-on-create). Dialog-close alone is insufficient.
- MUST call `expectRowAddedAfterIteration` (or an equivalent per-iter DB verify) INSIDE the loop after each insert. End-of-loop bulk count is insufficient — it misses iterations 2..N when iteration 1's row got overwritten.
- MUST end every multi-row test with `await page.reload({ waitUntil: 'networkidle' })` followed by a UI row-count assertion (via `data-testid="<entity>-row"` locator count or page-object equivalent). The reload flushes Vue Query's optimistic cache so the assertion sees what the user would see.
- MUST emit a final-state screenshot for visual review (the existing pipeline picks it up from `test-evidence/{run_id}/screenshots/<test>.final.png`). `expectRowAddedAfterIteration` captures this automatically when `captureFinalScreenshot: true` is passed.
- MUST add a row-count expectation to `e2e/visual-tests.template.yml` (the committed source) for any new multi-row test. Format: `'<spec>::<test name>': "Table contains exactly N <entity> rows including '<sample identifying text>'"`. Stage 0.7 of `/run-all-tests` merges this template into the gitignored `visual-tests.yml` at run start; without putting your entry in the template, the structural expectation gets wiped on every pipeline cycle. Without this, multimodal review falls back to generic AI strategy (low confidence) and won't reliably flag a missing-rows regression.
- MUST NOT use `expect(true).toBeTruthy()` or `expect(count).toBeGreaterThanOrEqual(initialCount)` as the terminal assertion of a multi-row loop. These are vacuous — they pass when zero rows persisted.
- MUST NOT use `await expect(dialog).toBeHidden()` as the per-iteration "success" signal. It lies. See "Why" above.
- MUST NOT bulk-POST via API and skip the UI rendering check unless the test's stated purpose is API-only (e.g., a calculation-formula test that uses API seeding deliberately — see `rules/e2e-api-verification.md`). If the test is intended to cover the UI insertion path, UI count verification is non-negotiable.

## Canonical Pattern

```ts
import { expectRowAddedAfterIteration } from "../../utils/per-iteration-verify";

test("seed N expenses via UI", async ({ page }) => {
  await page.goto("/expenses/track", { waitUntil: "networkidle" });

  const expenses = [
    { description: "Rent", amount: 50000 },
    { description: "Groceries", amount: 12000 },
    { description: "Fuel", amount: 4500 },
    // ... 10 records
  ];

  for (let i = 0; i < expenses.length; i++) {
    const expense = expenses[i];

    // Open dialog
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.waitForTimeout(300); // Vuetify dialog enter animation

    // Fill form (use plain fill for ref-based forms; pressSequentially for vee-validate
    // — see rules/e2e-vee-validate-forms.md)
    await page.getByLabel("Description").fill(expense.description);
    await page.getByLabel("Amount").fill(String(expense.amount));

    // Gate the click on the POST landing — NOT on dialog close
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/expenses") && r.request().method() === "POST",
        { timeout: 10000 },
      ),
      page.getByRole("button", { name: /save/i }).click(),
    ]);
    expect(response.status(), `iteration ${i + 1}: POST /api/expenses returned ${response.status()}`).toBe(201);

    // Per-iteration DB verify — names the exact failing iteration on regression
    await expectRowAddedAfterIteration<{ description: string }>(page, {
      listEndpoint: "/api/expenses",
      iterationIndex: i,
      expectedCountAfter: i + 1,
      rowMatcher: (e) => e.description === expense.description,
      rowDescription: "expense",
      totalIterations: expenses.length,
      captureFinalScreenshot: true, // emits .final.png on last iter
    });
  }

  // Final UI render check — flushes Vue Query cache + verifies the rows
  // actually paint to the DOM for the user
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#app[data-hydrated='true']");
  const visibleRows = await page.locator('[data-testid="expense-row"]').count();
  expect(visibleRows, `UI must render ${expenses.length} expense rows after seeding`)
    .toBeGreaterThanOrEqual(expenses.length);
});
```

## Anti-Pattern (what NOT to write)

```ts
// BROKEN — passes false-positively when rows 2..N silently drop
for (const expense of expenses) {
  await page.getByRole("button", { name: /add expense/i }).click();
  await page.getByLabel("Description").fill(expense.description);
  await page.getByLabel("Amount").fill(String(expense.amount));
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.locator(".v-dialog")).toBeHidden(); // ← LIES
}
expect(true).toBeTruthy(); // ← vacuous
```

This pattern is the root cause of the May 2026 multi-row regression observed by Abhay: only the first row persisted in some sections, but every section's data-setup spec passed.

## Performance Note

Per-iteration DB verify adds one `GET /api/<resource>` round-trip per iteration. For a 10-row loop on a domestic Postgres, that is ~50ms × 10 = 500ms of overhead — negligible. If a test inserts hundreds of rows, batch the verify (e.g., every 25 iterations + final), but never skip entirely.

## Existing Specs Already Compliant

As of 2026-05-16, these specs use `expectRowAddedAfterIteration` correctly and SHOULD NOT be migrated:

- `e2e/tests/journey/00-new-user-to-fire.spec.ts`
- `e2e/tests/journey/03-edge-cases.spec.ts`
- `e2e/tests/salary/20-career-progression-manual.spec.ts`
- `e2e/tests/salary/03-ui-to-api-chain.spec.ts`
- `e2e/tests/dashboard/populated-cards.spec.ts`
- `e2e/tests/fire-goals/26-variant-ordering.spec.ts`
- `e2e/tests/expenses/25-cross-page-consistency.spec.ts`

## Single-Insert Sibling: `expectRowAfterMutation`

For single-insert tests (not loops) whose post-`saveForm()` `expect(rowLocator).toBeVisible()` step flakes in bulk-run mode (passes in isolation; row IS in DB), use `expectRowAfterMutation` from `e2e/utils/wait-for-row-after-mutation.ts`. The flake class is documented in GitHub Issue #98 — Vue Query's stale-while-revalidate window can exceed the default 30s `expect` timeout under bulk-run contention.

The helper combines:
1. DB round-trip GET to confirm the row persisted (distinguishes DB-side from UI-side failures).
2. `page.reload({ waitUntil: 'networkidle' })` + hydration wait to flush Vue Query stale cache.
3. Locator visibility assertion with diagnostic message naming both API count and rendered tbody tr count.

Canonical pattern:

```ts
import { expectRowAfterMutation } from "../../utils/wait-for-row-after-mutation";

test("should add freelance business with 44ADA taxation", async ({ page }) => {
  const uniqueName = `${testData.businessName} ${Date.now()}`;
  await businessPage.openAddForm();
  await businessPage.fillBusinessForm({ businessName: uniqueName /* ... */ });
  await businessPage.saveForm(); // already gates on POST response

  await expectRowAfterMutation<{ businessName?: string }>(page, {
    listEndpoint: "/api/business-income",
    rowMatcher: (r) => r.businessName === uniqueName,
    rowLocator: businessPage.getTableRowByText(uniqueName).first(),
    rowDescription: "business-income",
  });
});
```

Use this in place of the dual-check pattern:

```ts
// REPLACE this pattern when it has flaked in bulk-run:
await businessPage.expectBusinessInTable(uniqueName); // ← flaky under bulk load
const apiRes = await page.request.get("/api/business-income");
expect(apiRes.ok()).toBeTruthy();
const rows = await apiRes.json();
expect(rows.some((r) => r.businessName === uniqueName)).toBeTruthy();
```

DO NOT pre-emptively migrate the entire repo. Migrate only specs that have been observed flaking under bulk-run. Premature migration adds a page reload to every test, slowing the suite for no benefit on tests that never flaked.

## Hub chip-metric race class (gh-issue #105)

A sibling class of the row-visibility flake surfaces on **derived chip
metrics** that fan out across multiple parallel Vue Query composables.
The canonical example is `/income` Filing Readiness chip, which derives
`completedItemsCount` from 6 parallel composables (`useBusinessIncome`,
`useRentalIncome`, `useCapitalGains`, `useInterestIncomeAPI`,
`useDividendIncomeAPI`, `useOtherIncome`). Any one of those resolving
after `BasePage.waitForPageLoad()` produces a transient under-count.

**Symptom:** test reads `hub.getCompletedItemsCount()` immediately after
`hub.goto()` and gets a value that is 1-2 short of the true count, then
flakes pass on retry. Bulk-run flake rate is sub-1% but real.

**Why `expectRowAfterMutation` doesn't apply:** the helper waits for a
specific table row to render. Chip metrics aren't rows — they're
aggregated counts derived from multiple queries. A reload would force
a refetch but does not guarantee all 6 parallel responses settle before
the chip is read.

**The pattern: `await expect.poll(...)` instead of direct read.**

```ts
// CORRECT — polls until all underlying queries settle.
await expect
  .poll(async () => await hub.getCompletedItemsCount(), {
    message: "Filing Readiness chip should reach >= 2 once income queries settle",
    timeout: 10_000,
  })
  .toBeGreaterThanOrEqual(2);

// WRONG — single read can race the slowest of N parallel queries.
const completed = await hub.getCompletedItemsCount();
expect(completed).toBeGreaterThanOrEqual(2); // ← flakes under bulk-run
```

**Regression-lock pattern:** stress the timing with `page.route()` +
delay on one of the parallel endpoints, then assert the polled chip
read still passes. See `e2e/tests/income/14-hub-navigation.spec.ts`
Scenario 8c for the canonical example.

**MUST / MUST NOT for chip metrics:**

- MUST use `expect.poll()` for any chip / badge / summary-card metric
  that derives from > 1 parallel Vue Query composable. Direct reads
  immediately after navigation flake under contention.
- MUST set a `message:` parameter naming the affected chip + Issue
  number so future failure messages are actionable.
- MUST NOT use a fixed `page.waitForTimeout(...)` as a substitute —
  fixed waits either flake (too short) or waste budget (too long).
- MUST NOT migrate every chip read in the repo pre-emptively. Migrate
  only chips with observed flake history. See sibling audit at
  gh-issue #105 closing comment for the candidate list.

## Related

- `e2e/utils/per-iteration-verify.ts` — multi-row loop verification (the helper this rule originally promoted)
- `e2e/utils/wait-for-row-after-mutation.ts` — single-insert post-mutation verification (added 2026-05-21 for Issue #98 flake class)
- `e2e/utils/db-helper.ts` — direct Prisma access (alternative for tests that need transaction-level verification)
- `rules/e2e-api-verification.md` — when API-only verification is the right call
- `rules/e2e-vee-validate-forms.md` — form-driving patterns that pair with this rule
- `e2e/visual-tests.template.yml` — committed source for persistent row-count expectations (merged into `visual-tests.yml` at Stage 0.7 of `/run-all-tests`)
- Memory: `feedback_per_iteration_db_verify.md` — the original guidance this rule promotes
- GitHub Issue #98 — the bulk-run row-not-visible flake class that prompted `expectRowAfterMutation`
- GitHub Issue #105 — chip-metric race class; canonical regression lock at `e2e/tests/income/14-hub-navigation.spec.ts` Scenario 8c

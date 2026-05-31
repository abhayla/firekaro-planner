---
description: Vuetify-specific wait strategies and timing conventions for Playwright E2E tests
globs: ["e2e/**/*.ts"]
---

# E2E Vuetify Timing

## Vue Hydration

After navigating to a page, wait for Vue 3 client hydration + Vuetify component mounting:

```typescript
await page.waitForSelector('#app', { timeout: 30000 })
await page.waitForTimeout(1500)  // Vue 3 hydration + Vuetify mount
```

The 1500ms delay accounts for Vue's async component resolution, Vuetify's theme injection, and component tree mounting. Skipping this causes flaky locator failures on initial page loads.

## Form Interaction Timing

Vuetify components use CSS transitions and internal state updates that need settling time:

| Interaction | Wait After | Reason |
|-------------|-----------|--------|
| Click select/dropdown | 300ms | Vuetify menu animation |
| Click tab | verify `aria-selected` | Tab transition |
| Toggle switch | 300-500ms | Ripple + state update |
| Open dialog | 300ms | Dialog enter transition |
| FY selector change | 1000-1500ms | Data reload + re-render |
| Form submission | `waitForResponse` | API round-trip |

## Select Dropdown Pattern

```typescript
// Click the select field
await page.locator('.v-select').filter({ hasText: /loan type/i }).click()
// Wait for dropdown animation
await page.waitForTimeout(300)
// Select the option by role
await page.getByRole('option', { name: /home loan/i }).click()
```

## Tab Selection and Verification

```typescript
// Click the tab
await page.getByRole('tab', { name: /salary/i }).click()
// Verify it is selected (not just clicked)
const tab = page.getByRole('tab', { name: /salary/i })
await expect(tab).toHaveAttribute('aria-selected', 'true')
```

## Dialog Handling

```typescript
// Click trigger button
await page.getByRole('button', { name: /add goal/i }).click()
// Wait for dialog animation
await page.waitForTimeout(300)
// Verify dialog is visible
await expect(page.locator('.v-dialog')).toBeVisible()
```

## Snackbar Verification

```typescript
await expect(this.snackbar).toBeVisible()
await expect(this.snackbar).toContainText('Goal created successfully')
```

Where `this.snackbar` is defined as `this.page.locator('.v-snackbar')`.

## Content Loading Strategy

Wait for either content cards or skeleton loaders (whichever appears first):

```typescript
await Promise.race([
  page.locator('.v-card').first().waitFor({ state: 'visible', timeout: 10000 }),
  page.locator('.v-skeleton-loader').first().waitFor({ state: 'visible', timeout: 10000 }),
]).catch(() => {})
```

The `.catch(() => {})` ensures the test continues even if neither appears (empty state).

## Summary Card Value Extraction

Values within summary cards use multiple possible selectors:

```typescript
const card = page.locator('.v-card').filter({ hasText: new RegExp(title, 'i') })
const value = card.locator('.text-h4, .text-h5, .text-h6, .text-currency').first()
return await value.textContent()
```

## Navigation with networkidle

```typescript
await page.goto('/dashboard', { waitUntil: 'networkidle' })
```

Always use `networkidle` for `goto()` calls — Vuetify pages make multiple API calls on mount, and `load` fires too early.

## Playwright Config Settings

```typescript
// playwright.config.ts
export default defineConfig({
  workers: 1,                    // Single worker — tests share data state
  fullyParallel: false,          // Serial execution within describe blocks
  retries: process.env.CI ? 2 : 0,  // CI-aware retries
  timeout: 60000,                // 60s per test
  expect: { timeout: 15000 },   // 15s for assertions
  use: {
    actionTimeout: 15000,        // 15s per action
    navigationTimeout: 30000,    // 30s for navigation
    headless: !!process.env.CI,  // Headed in dev, headless in CI
    storageState: 'e2e/.auth/user.json',  // Persisted auth session
    extraHTTPHeaders: {
      'x-dev-bypass': 'true',   // Skip rate limiting in dev/test
    },
  },
})
```

### Why `workers: 1` and `fullyParallel: false`

Tests are data-dependent — `00-data-setup.spec.ts` seeds data that subsequent tests read. Parallel execution causes data races. Within a describe block, tests run in file-number order.

## Error Tolerance on Non-Critical Waits

Use `.catch(() => {})` on waits for optional UI elements. This is an anti-pattern in general JavaScript but pragmatic for Vuetify E2E tests where optional elements (charts, badges, tooltips) may not render in all states:

```typescript
// Optional chart — don't fail the test if it's missing
await page.locator('.v-chart').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})

// Optional notification badge
const hasBadge = await page.locator('.v-badge').isVisible().catch(() => false)
```

## Storage State for Authentication

Global setup writes auth state to `e2e/.auth/user.json`. All tests reuse this state via Playwright's `storageState` config — no login flow per test.

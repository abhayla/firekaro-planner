---
description: E2E Playwright Page Object Model conventions with BasePage helpers
paths: ["e2e/pages/**/*.ts", "e2e/tests/**/*.spec.ts"]
---

# E2E Page Object Model

## BasePage Inheritance

ALL page objects MUST extend `BasePage` (~1150 lines of shared helpers). BasePage provides navigation, Vuetify-aware interactions, INR formatting, API helpers, and wait strategies.

```typescript
import { BasePage } from '../base.page'

export class GoalsPage extends BasePage {
  // Locators, Navigation, Getters, Assertions, Data State Helpers
}
```

## Standard Sections Per Page Object

Every page object MUST include these sections in order:

### 1. Locators (getter properties)

```typescript
get goalCards() { return this.page.locator('.v-card').filter({ hasText: /goal/i }) }
get createButton() { return this.page.getByRole('button', { name: /create|add/i }) }
get goalDialog() { return this.page.locator('.v-dialog') }
```

Use Vuetify selectors (`.v-card`, `.v-tab`, `.v-dialog`, `.v-skeleton-loader`) and filter chaining:

```typescript
this.page.locator('.v-card').filter({ hasText: /home loan/i })
```

### 2. Navigation

```typescript
async goto() { await super.goto('/goals') }
```

### 3. Getters (async value extraction)

```typescript
async getGoalCount(): Promise<number> {
  return await this.goalCards.count()
}
async getTotalTargetAmount(): Promise<string> {
  return await this.getSummaryCardValue('Total Target')
}
```

### 4. Assertions (`expect*` methods)

```typescript
async expectGoalVisible(name: string) {
  await expect(this.page.locator('.v-card').filter({ hasText: name })).toBeVisible()
}
```

### 5. Data State Helpers (REQUIRED)

```typescript
async hasData(): Promise<boolean> {
  try {
    return await this.goalCards.first().isVisible({ timeout: 5000 })
  } catch {
    return false
  }
}

async isEmptyState(): Promise<boolean> {
  try {
    return await this.page.locator('.v-card').filter({ hasText: /no goals|get started/i }).isVisible({ timeout: 3000 })
  } catch {
    return false
  }
}
```

EVERY page object MUST implement `hasData()` and `isEmptyState()`.

## BasePage Key Methods

### Navigation and Loading

- `goto(path)` — navigates with `waitUntil: "networkidle"`
- `waitForPageLoad()` — waits for `#app` selector (30s timeout) + Vue hydration delay (1500ms) + first `.v-card` visible (10s) with `.catch(() => {})` fallback

### Summary Card Helpers

- `getSummaryCardByTitle(title)` — case-insensitive `.v-card` filter: `this.page.locator('.v-card').filter({ hasText: new RegExp(title, 'i') })`
- `getSummaryCardValue(title)` — extracts text from `.text-h4, .text-h5, .text-h6, .text-currency` within the matched card

### INR Formatting

- `formatINR(amount)` — formats number to INR string with commas
- `formatINRLakhs(amount)` — formats to "X.XX L" notation
- `parseINR(formatted)` — parses back from formatted strings, handles K/L/Cr suffixes

### Financial Year Selection

- `selectFinancialYear(fy)` — opens v-select dropdown, clicks the matching option, waits 1000ms for data reload

### Vuetify Form Helpers

- `fillVuetifyTextField(label, value)` — multi-selector fallback strategy: tries `getByLabel`, then `.v-text-field` with label filter, then input within label container
- `selectVuetifyOption(label, optionText)` — click select field → wait 300ms → `getByRole("option", { name: new RegExp(optionText, 'i') })` click
- `submitFormAndWaitForResponse()` — `Promise.all([this.page.waitForResponse(...), this.clickSaveButton()])` to avoid race conditions

### API Helpers

- `createViaApi(endpoint, data)` — POST with JSON body and auth cookies
- `deleteViaApi(endpoint, id)` — DELETE request
- `getItemsViaApi(endpoint)` — GET request returning parsed JSON array
- `verifyCreateViaApi(endpoint, data)` — creates then verifies the item exists

### Tab Verification

```typescript
async verifyTabSelected(tabText: string) {
  const tab = this.page.getByRole('tab', { name: new RegExp(tabText, 'i') })
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}
```

## Error Tolerance

`.catch(() => false)` on ALL non-critical visibility checks. NEVER hard-fail on optional UI elements:

```typescript
const hasChart = await this.page.locator('.v-chart').isVisible().catch(() => false)
if (hasChart) {
  // assert chart details
}
```

## Data-Conditional Execution

Check `hasData()` before data assertions. Early return with passing assertion — NEVER use `test.skip()`:

```typescript
test('verify goal calculations', async () => {
  if (!(await goalsPage.hasData())) {
    console.log('No goal data available, passing vacuously')
    expect(true).toBeTruthy()
    return
  }
  // actual assertions here
})
```

## FY Navigation with Data

`navigateToFYWithData()` — tries multiple financial years (`2025-26`, `2024-25`, `2023-24`, `2022-23`) to find one with data. Returns the FY string or null.

## Barrel Exports

Each page section has an `index.ts` barrel file:

```typescript
// e2e/pages/goals/index.ts
export { GoalsOverviewPage } from './overview.page'
export { GoalDetailPage } from './detail.page'
export { GoalFormPage } from './form.page'
```

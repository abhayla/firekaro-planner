---
description: Indian Financial Year (April-March) handling conventions across the stack
globs: ["**/*.ts", "**/*.vue"]
---

# Financial Year Handling

## Format

Indian Financial Year uses the `YYYY-YY` string format (e.g., `"2024-25"`), running from April 1 to March 31.

## Core Utility Functions

Located in `src/types/salary.ts`:

### `getCurrentFinancialYear()`

Returns the current FY based on today's date. If the current month is January-March, the FY started the previous calendar year.

### `isValidFY(fy: string)`

Validates that the string matches `YYYY-YY` format and the end year equals start year + 1 (e.g., `"2024-25"` is valid, `"2024-26"` is not).

### `getFYMonthIndex(month: number, year: number, fy: string)`

Converts a calendar month to an FY month index where April = 0 and March = 11.

### `getCalendarMonthYear(fyMonthIndex: number, fy: string)`

Reverse mapping: converts an FY month index back to calendar month and year.

## FY Month Labels

The standard month label array for FY display, used in charts and tables:

```ts
const FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
```

April is always index 0, March is always index 11. All month-indexed arrays in FY context follow this ordering.

## Backend Calendar-to-FY Conversion

When the backend receives a calendar month (1-12) and needs to convert to an FY month index:

```ts
const fyMonthIndex = month <= 3 ? month + 9 : month - 3
// January (1) → 10, February (2) → 11, March (3) → 12
// April (4) → 1, May (5) → 2, ... December (12) → 9
```

Note: Backend uses 1-based FY month indices in some contexts (April = 1), while frontend uses 0-based (April = 0). Be explicit about which convention applies.

## FY Range

The application supports financial years from `2003-04` to the current year, covering 22+ years of career history. FY selectors and validators MUST allow this full range.

## Backend Validation

`financialYearSchema` in `server/lib/validators.ts` validates the `YYYY-YY` format using Zod:

```ts
const financialYearSchema = z.string().refine((val) => {
  const match = val.match(/^(\d{4})-(\d{2})$/)
  if (!match) return false
  const startYear = parseInt(match[1])
  const endYear = parseInt(match[2])
  return endYear === (startYear + 1) % 100
})
```

## URL-Synced FY Navigation

FY selection syncs with the URL query parameter for shareable links and browser history:

```ts
const selectedFY = computed({
  get: () => route.query.fy as string || getCurrentFinancialYear(),
  set: (val) => {
    if (val === getCurrentFinancialYear()) {
      // Remove param when it's the default
      router.push({ query: { ...route.query, fy: undefined } })
    } else {
      router.push({ query: { ...route.query, fy: val } })
    }
  }
})
```

When the selected FY is the current (default) FY, the `fy` param is removed from the URL to keep URLs clean.

## FinancialYearSelector Component

A shared `FinancialYearSelector` component is passed as a prop to tab components. The parent page owns the FY state and passes it down — tabs do not independently manage their own FY selection.

## Backend FY Query Parameter

Route handlers accept FY via query parameter with backward compatibility:

```ts
const fy = c.req.query('fy') || c.req.query('financialYear')
```

Both `fy` and `financialYear` param names MUST be supported. New code should use `fy` as the primary parameter name.

## MUST NOT

- MUST NOT store FY as a number or date — always use `YYYY-YY` string format
- MUST NOT assume calendar year equals financial year — January 2025 is in FY 2024-25
- MUST NOT hardcode the current FY — always use `getCurrentFinancialYear()`
- MUST NOT create separate FY state per tab — use the parent page's shared FY state
- MUST NOT omit `financialYear` backward compatibility on existing endpoints

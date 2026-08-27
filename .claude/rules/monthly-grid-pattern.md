---
description: 12-column monthly grid (Apr-Mar) used for salary and investment data entry
paths: ["src/components/salary/**/*.vue", "src/components/investments/**/*.vue"]
---

# Monthly Grid Pattern (Apr-Mar Financial Year)

## Grid Structure

A native `<table>` (NOT v-data-table) with 12 columns representing Indian financial year months (April through March), plus row labels and totals columns (Bonus, Perks, FY Total).

MUST use native `<table>` for this pattern because v-data-table does not support the required cell-level interactivity (inline editing, per-cell actions, sticky columns).

## Edit Mode Toggle

A `v-btn-toggle` switches between view mode and edit mode:

- **View mode**: Formatted INR values displayed with `.text-currency` class
- **Edit mode**: `EditableGridCell` components with `v-model` binding

```vue
<v-btn-toggle v-model="editMode" mandatory>
  <v-btn :value="false" size="small">View</v-btn>
  <v-btn :value="true" size="small">Edit</v-btn>
</v-btn-toggle>
```

## EditableGridCell Component

Each editable cell provides:
- `v-model` for two-way value binding
- Enter key to confirm the value
- Escape key to cancel and revert to the previous value
- `nextTick(() => inputRef.value?.focus())` when entering edit mode

```vue
<EditableGridCell
  v-model="salaryData[month].basicPay"
  :readonly="!editMode"
  :format="formatINR"
/>
```

## Column Actions (Month Header Click)

Clicking a month header reveals a menu with bulk actions:

| Action | Behavior |
|---|---|
| Copy to remaining months | Copies this month's values to all subsequent months in the FY |
| Copy from previous month | Copies values from the preceding month into this month |
| Clear this month | Resets all values in this month to zero |
| Import from previous FY | (April only) Imports March values from the prior FY as starting point |

## Copy Data Dialog

A dialog for bulk data operations with:
- Checkboxes for what to copy: Employer, Paid Days, All Earnings, All Deductions
- Overwrite warning: "This will overwrite existing values in X months"
- Month count indicator showing how many months will be affected

## Sticky First Column

The row label column (component names like "Basic Pay", "HRA", "DA") stays visible during horizontal scroll:

```css
.grid-table td:first-child,
.grid-table th:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);
}
```

## Section Header Rows

Group rows under section headers for `EARNINGS`, `DEDUCTIONS`, `EMPLOYER CONTRIBUTIONS`:

```css
.section-header {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(var(--v-theme-primary), 0.04);
}
```

Each section header has an icon + uppercase label (e.g., `mdi-cash-plus` EARNINGS).

## Summary Rows

Auto-calculated rows at the bottom of each section and the grid:

- **Gross Salary**: Sum of all earnings for each month
- **Total Deductions**: Sum of all deductions for each month
- **Net Salary**: Gross minus Deductions (highlighted row with `font-weight: 700`)

These rows are `computed` properties — NEVER store calculated totals as state.

## Per-Month Employer Dropdown

In edit mode, each month column has an employer selector dropdown allowing different employers per month (for job changes mid-year):

```vue
<v-select
  v-if="editMode"
  v-model="salaryData[month].employerId"
  :items="employers"
  item-title="name"
  item-value="id"
  density="compact"
  variant="plain"
  hide-details
/>
```

## Keyboard Navigation

- **Tab**: Move to next cell in the row
- **Enter**: Confirm current cell, move to the cell below
- **Escape**: Cancel edit, revert to previous value
- **Arrow keys**: Navigate between cells when not in text input mode

Implement with `@keydown` handlers on the grid container, delegating to the active `EditableGridCell`.

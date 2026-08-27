---
description: Indian Financial Year (April-March) handling — auto-current FY + tax-screen-scoped picker
paths: ["**/*.ts", "**/*.vue"]
---

# Financial Year Handling

## Format

Indian Financial Year uses the `YYYY-YY` string format (e.g. `"2024-25"`), running April 1 → March 31.
A `YYYY-YY` string sorts lexicographically in chronological order, which the tax-screen picker relies on.

## The FY contract (v6 — read this first)

There is **no global, user-selectable Financial Year** in this app. The retired tax-tracker heritage
had an app-bar `<v-select>` bound to `ui.currentFY`; flipping it silently recomputed the user's entire
forward FIRE plan on an old year's tax slabs. That was **demoted** (`docs/goals/2026-06-06-demote-fy-selector.md`):

1. **The current FY is auto-derived from the wall clock** via `getCurrentFinancialYear(now = new Date())`
   in `src/lib/expense-history.ts` (it wraps the colocated `financialYearOf(date)` — Apr–Mar logic; do
   NOT duplicate that math). It is NOT user-selectable globally.
2. **`derive()`, the salary/income forms, and the nudge/lifecycle loop always use the current FY** — they
   read `ui.currentFY` (the Pinia `ui` store), which is seeded and re-derived from `getCurrentFinancialYear()`
   on every hydrate. Keep them reading `ui.currentFY`; never point them at a screen-local FY ref.
3. **Manual FY selection exists ONLY on the tax-planning screen** (`src/pages/tax-planning/Index.vue`) as a
   **page-local `selectedFY` ref** that drives that screen's regime comparison + cliff chart and **nothing
   else**. It MUST NOT write `ui.currentFY` or any store — switching it recomputes only that screen.

## `getCurrentFinancialYear()` — the single source of "what FY is it"

```ts
// src/lib/expense-history.ts
export function getCurrentFinancialYear(now: Date = new Date()): string {
  return financialYearOf(now); // Apr–Mar → YYYY-YY; no clamping to configured tax FYs
}
```

- `now` is injectable so specs assert against a fixed date, never the live clock.
- No clamping to the configured tax FYs here — clamping to "current + next configured" is the
  tax-screen picker's job (below); `getTaxConfigForFY` already falls back for an unconfigured FY.

## `ui.currentFY` — derived, not persisted

`src/stores/ui.ts` holds `currentFY` as a **derived** value, not user state:

- Default: `ref(getCurrentFinancialYear())`.
- Hydrate: always recomputed (`currentFY.value = getCurrentFinancialYear()`); a legacy persisted
  `currentFY` (e.g. a stale `"2024-25"`) is **silently ignored** so it can never override the wall-clock FY.
- It is **not** in the persisted blob and **not** in the `watch([...])` list — it is recomputed, not stored.
- There is **no `setCurrentFY` action** — nothing mutates the global FY manually.

## Tax-screen page-local picker (`selectedFY`)

`src/pages/tax-planning/Index.vue` owns the only manual FY control:

```ts
const autoCurrentFY = getCurrentFinancialYear();
// Options = current + next configured FY (forward tax planning).
const fyOptions = computed<string[]>(() => {
  const forward = AVAILABLE_FYS.filter((fy) => fy >= autoCurrentFY);
  return forward.length > 0 ? forward : [AVAILABLE_FYS[AVAILABLE_FYS.length - 1]];
});
const selectedFY = ref(
  AVAILABLE_FYS.includes(autoCurrentFY) ? autoCurrentFY : AVAILABLE_FYS[AVAILABLE_FYS.length - 1],
);
```

- `AVAILABLE_FYS` (`src/lib/tax.ts`, `Object.keys(TAX_CONFIGS)`) is the option source; `getTaxConfigForFY`
  handles fallback. When the current FY is the newest configured year, the picker is single-option (no
  "next" year yet) — the next option auto-appears when a later FY is added to `tax.ts`.
- The picker mounts in the `LeafPageHeader` `#actions` slot (compact `<v-select label="Tax year">`).
- It writes ONLY `selectedFY` — never a store, never `ui.currentFY`.

## MUST / MUST NOT

- MUST store an FY as the `YYYY-YY` string — never a number or `Date`. January 2025 belongs to FY 2024-25.
- MUST derive the current FY from `getCurrentFinancialYear()` — never hardcode it, never re-add a global
  user-facing FY selector, and never persist `ui.currentFY`.
- MUST keep `derive()` / forms / nudges reading the auto-current `ui.currentFY`. MUST NOT point them at the
  tax screen's page-local `selectedFY`.
- The tax-screen picker MUST stay page-local — it MUST NOT mutate `ui.currentFY` or any store.
- MUST NOT duplicate the Apr–Mar math — reuse `financialYearOf` / `getCurrentFinancialYear` in
  `src/lib/expense-history.ts`.

---
description: Indian Rupee currency formatting conventions across the application
globs: ["src/**/*.ts", "src/**/*.vue", "server/**/*.ts"]
---

# INR Formatting Conventions

## Canonical Import Location

All INR formatting functions live in `src/utils/formatters.ts`. New code MUST import from there.

NOTE: `formatINR` is currently duplicated across 7+ composable files. Do NOT add new copies — always import from the canonical location.

```ts
import { formatINR, formatINRLakhs, formatINRCompact, parseINR } from '@/utils/formatters'
```

## Three Formatting Tiers

### Tier 1: `formatINR(amount)` — Full Format

Displays the complete Indian number format with rupee symbol and lakh/crore grouping.

```ts
// Output: ₹1,50,000
const formatINR = (amount: number): string => {
  if (typeof amount !== 'number' || isNaN(amount)) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}
```

Use for: table cells, detail views, form displays, any context where space permits.

### Tier 2: `formatINRLakhs(amount)` — Compact Without Symbol

Abbreviates large numbers for space-constrained contexts (chart axes, card subtitles).

```ts
// >=1Cr → "1.50Cr", >=1L → "5.25L", >=1K → "8.3K", else full number
formatINRLakhs(15000000)  // "1.50Cr"
formatINRLakhs(525000)    // "5.25L"
formatINRLakhs(8300)      // "8.3K"
formatINRLakhs(500)       // "500"
```

Use for: chart axis labels, sparkline annotations, compact metric cards.

### Tier 3: `formatINRCompact(amount)` — Compact With Spaces

Includes spaces for readability in medium-width contexts.

```ts
formatINRCompact(15000000)  // "1.50 Cr"
formatINRCompact(525000)    // "5.25 L"
```

Use for: overview cards, summary sections, dashboard widgets.

## NaN Guard

Every formatting function MUST guard against invalid input:

```ts
if (typeof amount !== 'number' || isNaN(amount)) return '₹0'
```

This prevents `NaN`, `undefined`, and string values from rendering as broken text.

## Reverse Parsing: `parseINR(formatted)`

Converts formatted strings back to numbers for calculations and comparisons:

```ts
parseINR('36.50 L')     // 3650000
parseINR('1.50 Cr')     // 15000000
parseINR('5.25 K')      // 5250
parseINR('₹1,50,000')   // 150000
```

## CSS Classes for Currency Display

### Monospace Alignment

Currency values in tables and grids MUST use monospace font for tabular alignment:

```css
.text-currency {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
}

.text-large-currency {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 1.5rem;
}

.text-xl-currency {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 2rem;
}
```

Apply `font-variant-numeric: tabular-nums` on ANY element displaying numeric currency values so digits align vertically in columns.

## Vuetify Input Fields

- Currency inputs: `prefix="₹"` on `v-text-field`
- Percentage inputs: `suffix="%"` on `v-text-field`
- Always pair with `type="number"` and `v-model.number`

```vue
<v-text-field
  v-model.number="amount"
  prefix="₹"
  type="number"
  variant="outlined"
  density="comfortable"
/>
```

## Testing Currency Values

NEVER exact-match formatted currency strings in tests. Use `compareWithTolerance()` for numeric comparisons:

```ts
// BAD: expect(result).toBe('₹1,50,000')
// GOOD: expect(compareWithTolerance(result, 150000, 0.01)).toBe(true)
```

Floating-point arithmetic makes exact currency comparisons unreliable.

---
description: Vue 3 component structure and rendering conventions for all SFC files
globs: ["src/components/**/*.vue", "src/pages/**/*.vue"]
---

# Vue Component Conventions

## Script Setup — No Exceptions

Every `.vue` file MUST use `<script setup lang="ts">`. Zero Options API anywhere in the codebase.

## Props and Emits

### Props
- Use `defineProps<T>()` with `withDefaults()` for defaults
- Complex components: define a `Props` interface above `defineProps`
- Simple components (3 or fewer props): inline type literal

```ts
// Complex
interface Props {
  goalId: string
  initialAmount?: number
  showChart?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  initialAmount: 0,
  showChart: true,
})

// Simple
const props = defineProps<{ title: string; value: number }>()
```

### Emits
- Use call-signature syntax with `defineEmits`
- Event names in kebab-case

```ts
const emit = defineEmits<{
  (e: 'update-goal', payload: Goal): void
  (e: 'delete-item', id: string): void
}>()
```

### Expose
- Use `defineExpose()` when parent components need method access

```ts
defineExpose({ focus, blur, reset })
```

## Imports

- `import type` for type-only imports — never import types as values
- `@/` alias for ALL imports except same-directory siblings
- Component naming: PascalCase filenames, kebab-case events, camelCase props

```ts
import type { Goal, AssetAllocation } from '@/types/fire'
import { useGoalsStore } from '@/stores/goals'
import { formatINR } from '@/utils/formatters'
```

## Two-Tab Pattern

Every major section uses tab decomposition:
- `*OverviewTab.vue` — summary cards, charts, high-level metrics
- `*DetailsTab.vue` — data tables, CRUD forms, detailed records
- Some sections add `*CalculatorTab.vue` or `*ReportsTab.vue`

## Three-State Rendering Chain

MUST render all three states in this order:

```vue
<template>
  <div v-if="data?.length">
    <!-- Content: tables, cards, charts -->
  </div>
  <div v-else-if="isLoading">
    <!-- Skeleton loaders matching content layout -->
  </div>
  <div v-else>
    <!-- Empty state -->
    <v-card variant="outlined" class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1" :icon="mdi-piggy-bank" />
      <div class="text-h6 mt-4">No goals yet</div>
      <div class="text-body-2 text-medium-emphasis mt-1">
        Start by adding your first FIRE goal
      </div>
      <v-btn color="primary" variant="flat" class="mt-4" @click="openAddDialog">
        Add Goal
      </v-btn>
    </v-card>
  </div>
</template>
```

NEVER skip the loading or empty state. NEVER use `v-show` for this pattern — use `v-if`/`v-else-if`/`v-else`.

## Defensive Computed Guards

Every computed that derives from API data MUST guard against null/undefined:

```ts
const allocationPercentage = computed(() => {
  const total = portfolio.value?.totalValue ?? 0
  const equity = portfolio.value?.equityValue ?? 0
  return total > 0 ? (equity / total) * 100 : 0
})

const annualizedReturn = computed(() => {
  const result = calculations.value?.cagr
  if (result == null || !isFinite(result)) return 0
  return result
})
```

Rules:
- Optional chaining on every nullable access: `data?.field`
- Nullish coalescing for fallback values: `?? 0`, `?? []`, `?? ''`
- Division-by-zero guard: `total > 0 ? x / total : 0`
- NaN/Infinity check: `isFinite(result)` before display
- Early return for null data in complex computeds

## Mock Data Fallback

When API data may be empty during development or initial setup:

```ts
const chartData = computed(() => {
  if (expenses.value?.length) return expenses.value
  return mockExpenseData
})
```

This ensures charts and tables always render meaningful content. Remove mock fallbacks before production release or gate behind a dev flag.

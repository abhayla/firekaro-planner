# Defensive Coding

## Principle

Many backend APIs may not be implemented yet. All frontend code that consumes API data MUST use defensive patterns to prevent runtime crashes from null, undefined, NaN, or unexpected response shapes.

## Required Guards

### Optional Chaining + Nullish Coalescing

```ts
const total = props.data?.total ?? 0
const items = response.data?.items ?? []
const name = user?.profile?.displayName ?? 'Unknown'
```

### Template Guards

```vue
<div v-if="data?.items?.length">
  <!-- render items -->
</div>
```

MUST NOT render lists or detail views without checking for null/undefined data first.

### NaN/Infinity Checks in Computed Properties

```ts
const percentage = computed(() => {
  const result = (partialValue / totalValue) * 100
  return isFinite(result) ? result : 0
})
```

Every computed property that performs division or derives from API numbers MUST guard against NaN and Infinity before returning.

### Safe Defaults on Non-OK Responses

```ts
const res = await fetch('/api/expenses')
if (!res.ok) return { items: [], total: 0 }
```

### Array.isArray() Guards

Some income APIs return objects instead of arrays. Always verify:

```ts
const items = Array.isArray(data) ? data : (data?.data ?? [])
```

### Division-by-Zero Guards

Coverage and percentage calculations MUST guard the denominator:

```ts
const coverage = total > 0 ? (current / total) * 100 : 0
const dti = monthlyIncome > 0 ? (monthlyDebt / monthlyIncome) * 100 : 0
```

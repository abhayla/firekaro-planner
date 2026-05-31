---
description: TanStack Vue Query conventions for composables including query keys, invalidation, and caching
globs: ["src/composables/**/*.ts", "src/plugins/vue-query.ts"]
---

# Vue Query Patterns

## Composable Naming

One exported function per query/mutation with `use` prefix:
- Queries: `useFIREMetrics()`, `useGoals()`, `useLoans()`, `useExpenses()`
- Mutations: `useCreateGoal()`, `useDeleteLoan()`, `useUpdateInvestment()`

## Query Keys

Hierarchical arrays following domain/sub-domain structure:

```typescript
['fire', 'metrics']
['goal', goalId, 'milestones']
['income', 'business', fy]
['insurance-policies']
['banking', 'accounts']
['expenses', 'categories']
```

Keys MUST be wrapped in `computed()` when they depend on reactive state:

```typescript
queryKey: computed(() => ['fire', 'metrics', uiStore.isFamilyView])
```

Family view state (`isFamilyView`) MUST be included in query keys for any data that changes based on family context. Omitting it causes stale cache hits across family-view toggles. The schema has no per-member selector — aggregation is whole-family (see `rules/family-view-pattern.md`).

## Query Functions

Use native `fetch()` — no axios in this codebase:

```typescript
queryFn: async () => {
  const res = await fetch(`/api/fire/metrics`)
  if (!res.ok) throw new Error('Failed to fetch FIRE metrics')
  return res.json()
}
```

Mutations add headers and stringify body:

```typescript
mutationFn: async (data: CreateGoalInput) => {
  const res = await fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create goal')
  return res.json()
}
```

Update mutations receive `{ id, data }`:

```typescript
mutationFn: async ({ id, data }: { id: string; data: Partial<GoalInput> }) => {
  const res = await fetch(`/api/goals/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update goal')
  return res.json()
}
```

## staleTime Tiers

Assign staleTime based on data volatility:

| Tier | staleTime | Use For |
|------|-----------|---------|
| Frequent | 2 min | Goals, expenses, transactions — user-modified data |
| Standard | 5 min | FIRE metrics, freedom score — derived calculations (global default) |
| Expensive | 10 min | Projections, Monte Carlo simulations, withdrawal strategy |
| Static | 1 hr | Expense categories, system constants, CII index |
| Manual | 0 + `enabled: false` | Exports, one-off reports — triggered explicitly |

## Global Defaults (vue-query.ts)

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 minutes
      gcTime: 30 * 60 * 1000,     // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

## Mutation Invalidation Chains

EVERY mutation MUST invalidate its own domain AND related domains that depend on the mutated data:

```typescript
// Goal mutations → goals + FIRE metrics (FIRE number depends on goals)
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['goals'] })
  queryClient.invalidateQueries({ queryKey: ['fire'] })
}

// Bank account mutations → banking + financial health
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['banking', 'accounts'] })
  queryClient.invalidateQueries({ queryKey: ['financial-health'] })
}

// Insurance mutations → policies + summary + coverage analysis
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['insurance-policies'] })
  queryClient.invalidateQueries({ queryKey: ['insurance-summary'] })
  queryClient.invalidateQueries({ queryKey: ['coverage-analysis'] })
}

// Loan mutations → loans + liabilities overview
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['loans'] })
  queryClient.invalidateQueries({ queryKey: ['liabilities-overview'] })
}

// Credit card mutations → credit cards + liabilities overview
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
  queryClient.invalidateQueries({ queryKey: ['liabilities-overview'] })
}

// Expense mutations → expenses + budgets
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['expenses'] })
  queryClient.invalidateQueries({ queryKey: ['budgets'] })
}

// Income mutations (salary, business, rental, etc.) → specific type + summary
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['income', 'salary'] })
  queryClient.invalidateQueries({ queryKey: ['income', 'summary'] })
}

// Withdrawal strategy → withdrawal + FIRE metrics
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['withdrawal-strategy'] })
  queryClient.invalidateQueries({ queryKey: ['fire'] })
}
```

## Graceful Degradation

Non-critical queries MUST degrade gracefully instead of throwing:

```typescript
queryFn: async () => {
  try {
    const res = await fetch('/api/expense-categories')
    if (!res.ok) throw new Error('Failed to fetch categories')
    return res.json()
  } catch {
    console.warn('Expense categories unavailable, using defaults')
    return DEFAULT_EXPENSE_CATEGORIES
  }
}
```

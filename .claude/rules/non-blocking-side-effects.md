---
description: Side effects in route handlers must never block the main response
globs: ["server/routes/**/*.ts"]
---

# Non-Blocking Side Effects

## Principle

Route handlers MUST return the primary response without waiting for secondary side effects. Side effects that fail MUST NOT cause the main request to fail or slow down.

## Budget Alert Checks

After expense CRUD operations, trigger budget alert checks as a fire-and-forget side effect:

```ts
// After creating/updating/deleting an expense
const expense = await prisma.expense.create({ data: { ... } })

// Non-blocking — do not await
checkBudgetAlerts(userId, expense.date).catch(err =>
  console.error('Error checking budget alerts:', err)
)

return c.json({ success: true, data: expense }, 201)
```

The `.catch(err => console.error('Error <action>:', err))` pattern MUST be appended to every fire-and-forget call. This prevents unhandled promise rejections while ensuring the main response is not delayed.

## Budget Actuals Recalculation

`updateBudgetActuals(userId, date)` is the ONE exception — this IS awaited because subsequent reads depend on accurate budget actuals:

```ts
await updateBudgetActuals(userId, expense.date)
```

This distinction is intentional: budget actuals affect data consistency for the current response, while alert checks are advisory notifications that can be eventually consistent.

## Cache Invalidation

When data changes that affects FIRE metrics, mark the metrics cache as stale rather than recalculating synchronously:

```ts
// After updating income, expenses, or investments
await prisma.metricsCache.updateMany({
  where: { userId },
  data: { isStale: true }
})
```

The cache is recalculated lazily on the next dashboard load, not eagerly on every write.

## Sync Triggers

Salary-to-EPF/NPS sync runs as a side effect when salary data changes. The sync updates related retirement contribution records based on the salary structure:

```ts
syncSalaryToRetirement(userId, financialYear).catch(err =>
  console.error('Error syncing salary to retirement:', err)
)
```

## Pattern Summary

| Side Effect | Awaited? | Reason |
|-------------|----------|--------|
| `checkBudgetAlerts()` | No | Advisory notification, eventually consistent |
| `updateBudgetActuals()` | Yes | Data consistency for current response |
| `metricsCache.update({ isStale: true })` | Yes | Simple flag set, fast operation |
| `syncSalaryToRetirement()` | No | Cross-domain sync, not needed for response |

## Helper Function Placement

Side effect helper functions (`checkBudgetAlerts`, `updateBudgetActuals`, etc.) are defined at module level within the route file that uses them. They are NOT exported — each route file owns its side effect logic.

## MUST NOT

- MUST NOT `await` fire-and-forget operations — this blocks the response
- MUST NOT omit `.catch()` on fire-and-forget promises — this causes unhandled rejection warnings
- MUST NOT let side effect failures propagate to the main try/catch — the user should get their primary response regardless of side effect status
- MUST NOT use `void` keyword as a substitute for `.catch()` — it suppresses errors silently without logging

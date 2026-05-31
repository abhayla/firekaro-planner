---
description: Hono backend route conventions for all 41 route files in server/routes/
globs: ["server/routes/**/*.ts", "server/index.ts"]
---

# Hono Route Conventions

## Route File Structure

Every route file in `server/routes/` MUST follow this structure:

```ts
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'

const app = new Hono()
app.use('*', authMiddleware)

// ... route handlers ...

export default app
```

Create a `new Hono()` instance, apply `app.use('*', authMiddleware)` globally, and `export default` the app instance. No exceptions.

## Zod Schema Patterns

Schemas are defined INLINE per route file, never shared across files.

- Create schema: full object with all required fields
- Update schema: reuse create schema with `.partial()`
- Enums: standalone `z.enum([...])` constants at module level

```ts
const statusEnum = z.enum(['ACTIVE', 'PAUSED', 'COMPLETED'])
const createGoalSchema = z.object({ name: z.string(), target: z.number(), status: statusEnum })
const updateGoalSchema = createGoalSchema.partial()
```

## Date Field Transforms

- Input (required): `z.string().transform((val) => new Date(val))`
- Input (optional): `z.string().optional().nullable().transform((val) => val ? new Date(val) : null)`
- Response output: `.toISOString().split('T')[0]` to produce `YYYY-MM-DD` strings

## Error Handling

Every handler MUST be wrapped in a try/catch block:

```ts
try {
  // handler logic
} catch (error) {
  console.error('Error <action>:', error)
  return c.json({ success: false, error: '...' }, 500)
}
```

## Status Codes

- `201` for resource creation
- `400` for validation failures
- `404` for not found (including ownership check failures)
- `500` for server errors in the catch block

## Ownership Verification

Before UPDATE or DELETE, MUST verify ownership:

```ts
const record = await prisma.model.findFirst({ where: { id, userId } })
if (!record) return c.json({ success: false, error: 'Not found' }, 404)
```

Use `findFirst` with both `id` and `userId` — never trust the client to own the resource.

## Sub-Resources and Nested Routes

Sub-resources use nested route paths off the parent ID:

- `/:id/transactions` — child collection under a parent
- `/:id/payments` — payment records for a specific entity
- `/:id/nominees` — nominee assignments for a specific entity

## Summary and Overview Endpoints

Alongside standard CRUD, include aggregation endpoints:

- `GET /overview` — dashboard-style combined data
- `GET /summary` — aggregated totals
- `GET /stats` — statistical breakdowns

## Action Endpoints

State-changing actions use POST, not PUT or PATCH:

- `POST /:id/pause`
- `POST /:id/resume`
- `POST /:id/skip`
- `POST /process`
- `POST /invalidate`

## Query Parameters

Extract query params via `c.req.query('param')` and build a typed `whereClause` object:

```ts
const fy = c.req.query('fy') || c.req.query('financialYear')
const whereClause: any = { userId }
if (fy) whereClause.financialYear = fy
```

The `fy` / `financialYear` backward compatibility pattern MUST be maintained on all FY-filtered endpoints.

## Response Transformation

Transform Prisma results inline before returning: format dates, map field names, add computed fields. Do not create separate serializer layers.

## Route Registration

All routes register in `server/index.ts` via `app.route('/api/<resource>', resourceRoutes)`, grouped by domain with comment blocks:

```ts
// Income
app.route('/api/salary', salaryRoutes)
app.route('/api/rental-income', rentalIncomeRoutes)

// Expenses
app.route('/api/expenses', expenseRoutes)
app.route('/api/budgets', budgetRoutes)
```

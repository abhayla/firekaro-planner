---
description: Family view multi-user data filtering across backend and frontend
paths: ["server/routes/**/*.ts", "src/composables/**/*.ts", "src/stores/**/*.ts"]
---

# Family View Pattern

> **This rule was rewritten in April 2026** when the dependent-records `FamilyMember` model
> was replaced with a true multi-user `Family` + `FamilyUser` (join) + `Invitation` schema.
> See `docs/Family-Section-Plan.md` (if present) and `server/routes/family.ts`.

## Overview

A user belongs to **at most one family**. The family is a group of real
authenticated users (each with their own login + financial data). Family view
toggles a UI mode where dashboard endpoints aggregate across all family
members. Privacy invariant: only **ADMIN** members see row-level data via
list endpoints; **MEMBER**-role users in family view consume aggregated
totals via dedicated `/api/family-summary/<domain>` endpoints. List
endpoints return 403 to members in family view.

## Backend: Membership Resolution + Role Gating at the Route Layer

Mount `familyVisibilityMiddleware` from `server/middleware/family-visibility.ts`
after `authMiddleware`. It calls `resolveEffectiveUserIds` once and exposes
four context variables:

- `c.get('effectiveUserIds'): string[]` — full member list when in a family + `?familyView=true`, otherwise caller-only
- `c.get('familyRole'): 'ADMIN' | 'MEMBER' | null`
- `c.get('familyId'): string | null`
- `c.get('isFamilyView'): boolean`

```ts
import { authMiddleware } from '../middleware/auth'
import { familyVisibilityMiddleware } from '../middleware/family-visibility'
import {
  isMemberFamilyViewBlocked,
  shouldAnnotateOwners,
  annotateOwner,
} from '../lib/family-helpers'

const app = new Hono()
app.use('*', authMiddleware)
app.use('*', familyVisibilityMiddleware)

app.get('/', async (c) => {
  // Privacy invariant: list endpoints are admin-only in family view.
  // Members must consume /api/family-summary/<domain> instead.
  if (isMemberFamilyViewBlocked({ familyRole: c.get('familyRole'), isFamilyView: c.get('isFamilyView') })) {
    return apiError(c, 'List view is admin-only in family view. Use /api/family-summary/<domain> instead.', 403, ErrorCode.FORBIDDEN)
  }

  const userIds = c.get('effectiveUserIds')
  const where = userIds.length === 1
    ? { userId: c.get('userId') }
    : { userId: { in: userIds } }
  // ...query and (optionally) annotateOwner per row
})
```

The resolver returns the **full member list** for both ADMIN and MEMBER when
in a family + familyView=true. Privacy enforcement lives at the route layer,
not the resolver — this keeps the same userIds set driving both list
endpoints (admin-only) and `/family-summary` endpoints (admin or member).

### Write Endpoints

Records MUST be owned by `userId` (the authenticated caller). The new schema has
**no `familyMemberId` column** anywhere — every model owns its rows by `userId`
and aggregation happens at read time via `userId IN (...)`. Do NOT add a
`familyMemberId` field to any new model.

### Aggregation Endpoints (per-domain summary)

Member-role users in family view consume `GET /api/family-summary/<domain>`
endpoints (see `server/routes/family-summary.ts`). These endpoints:

- Require `?familyView=true` AND multiple effective member ids — return 400 otherwise.
- Are open to both ADMIN and MEMBER roles.
- Return aggregate totals + groupings only — never row-level data.

When adding a new aggregation-aware domain, add a `GET /<domain>` handler in
`server/routes/family-summary.ts` and wire `isMemberFamilyViewBlocked` into
the domain's list endpoint.

## Frontend: UI Store State

`useUiStore()` (Pinia) holds a single `isFamilyView` boolean. There is **no
member-id selector** — the privacy model removed it.

```ts
// src/stores/ui.ts
const isFamilyView = ref(false)
function toggleFamilyView() { isFamilyView.value = !isFamilyView.value }
```

`AppBarFamilyToggle` shows the toggle when the user is in a family. Both
ADMIN and MEMBER can toggle; the response shape differs by role (admin sees
row-level data; member sees `FamilySummaryCard` aggregates).

## Frontend: Query Parameter Building

Composables append `?familyView=true` when toggled on. Nothing else.

```ts
function buildQueryParams(baseParams: Record<string, string> = {}) {
  const uiStore = useUiStore()
  const params = new URLSearchParams(baseParams)
  if (uiStore.isFamilyView) params.set('familyView', 'true')
  return params.toString() ? `?${params.toString()}` : ''
}
```

## Frontend: Query Key Invalidation

Vue Query keys MUST include `uiStore.isFamilyView` so the cache invalidates on
toggle. Do NOT include any member-id (it doesn't exist).

```ts
const { data } = useQuery({
  queryKey: computed(() => ['expenses', selectedFY.value, uiStore.isFamilyView]),
  queryFn: () => fetchExpenses(selectedFY.value),
})
```

When membership changes (create family / accept invite / leave / remove member),
`useFamily` mutations invalidate `['family']` plus the dashboard domain keys
(`['expenses']`, `['investments']`, etc.) so aggregates re-fetch with the new
member list.

## MUST / MUST NOT

- MUST mount `familyVisibilityMiddleware` after `authMiddleware` on every
  route file that aggregates over family members.
- MUST gate list endpoints with `isMemberFamilyViewBlocked` and return 403
  with `ErrorCode.FORBIDDEN` for member-family-view requests; point the
  caller at the corresponding `/api/family-summary/<domain>` endpoint.
- MUST include `uiStore.isFamilyView` in Vue Query keys for any data that
  changes shape based on the toggle.
- MUST unwrap responses via `unwrapResponse` / `unwrapArrayResponse` (see
  `api-response-unwrapping.md`) — same as every other endpoint.
- MUST NOT add a `familyMemberId` foreign key to any new model. Use `userId IN
  (members)` aggregation instead.
- MUST NOT inline a Prisma membership lookup in route handlers — go through
  the middleware (preferred) or `resolveEffectiveUserIds` directly.
- MUST NOT call the resolver and re-implement role gating — use
  `isMemberFamilyViewBlocked` (list endpoints) and `shouldAnnotateOwners`
  (admin row annotation) helpers instead.
- MUST NOT call `refetch()` / `invalidateQueries(['domain'])` from a component
  on toggle change — the reactive query key handles it. Manual invalidation is
  reserved for `useFamily` mutations after membership changes.

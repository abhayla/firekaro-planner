---
name: section-development-workflow
description: >
  Step-by-step workflow for adding a new dashboard section to FIREKaro.
  Covers Prisma schema, Hono routes, composables, pages, components, and E2E tests.
type: workflow
allowed-tools: "Read Write Edit Bash Grep Glob"
argument-hint: "<section-name>"
version: "1.0.0"
---

# Section Development Workflow

Before starting, read one existing completed section (e.g., salary) end-to-end as a reference.
Run `git status` to confirm a clean working tree. Create branch: `feature/vue-{section}`.

## STEP 1: Database Schema

Add the Prisma model in `prisma/schema.prisma` following project conventions.

Example model structure:

    model Insurance {
      id        String   @id @default(cuid())
      createdAt DateTime @default(now())
      updatedAt DateTime @updatedAt

      userId    String
      user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

      policyName    String
      provider      String
      policyType    String
      premiumAmount Float     @default(0)
      coverAmount   Float     @default(0)
      startDate     DateTime
      endDate       DateTime
      isActive      Boolean   @default(true)

      familyMemberId String?
      familyMember   FamilyMember? @relation(fields: [familyMemberId], references: [id])

      @@index([userId])
    }

Conventions that MUST be followed:
- `id` uses `cuid()`, not `uuid()` or autoincrement
- `createdAt` with `@default(now())` and `updatedAt` with `@updatedAt` on every model
- `userId String` with `@relation(fields: [userId], references: [id], onDelete: Cascade)`
- `@@index([userId])` for query performance
- All monetary fields: `Float @default(0)` — not `Decimal`, not `Int`
- Optional `familyMemberId String?` when the section supports family view

After adding the model, apply the schema with `npm run db:push`.

Commit: `feat(db): add {Section} prisma model with indexes`

## STEP 2: Backend Routes

Create `server/routes/{section}.ts` with the standard CRUD pattern:

1. Import `Hono`, `z` (Zod), `authMiddleware`, and `prisma`
2. Create app: `new Hono()` and apply `app.use('*', authMiddleware)`
3. Define Zod schemas inline in the route file — not in a separate validation file
4. Implement standard CRUD endpoints:
   - `GET /` — list all records for current user (filter by userId)
   - `GET /:id` — single record with userId ownership guard
   - `POST /` — create with Zod validation
   - `PUT /:id` — update with Zod validation and userId ownership guard
   - `DELETE /:id` — delete with userId ownership guard
   - `GET /overview` — aggregated summary data for the overview tab

5. Register in `server/index.ts`:
   - Add import: `import {section}Routes from './routes/{section}'`
   - Add route: `app.route('/api/{section}', {section}Routes)`

6. Extract pure calculation logic to `server/lib/calculations/{section}.ts` with a colocated `.spec.ts` unit test file. Calculations MUST be pure functions (no DB access, no request context).

Commit: `feat({section}): add CRUD routes and Zod validation`

## STEP 3: Frontend Composable

Create `src/composables/use{Section}.ts` with this structure:

**Exports:**
- TypeScript interfaces for the entity (e.g., `Insurance`, `InsuranceInput`)
- Type aliases for enum-like fields
- The composable function itself

**Inside the composable function:**

1. **Query keys** — MUST include `uiStore.isFamilyView` as a reactive dependency:
   `computed(() => ['{section}', { familyView: uiStore.isFamilyView }])`

2. **Queries** — Use `useQuery` from `@tanstack/vue-query`:
   - Main list query with the section query key
   - Overview query for aggregated dashboard data

3. **Mutations** — Use `useMutation` with invalidation chains:
   - `onSuccess` MUST invalidate own domain queries AND related cross-section queries
   - Example: insurance mutations invalidate both `['insurance']` and `['financial-health']`

4. **Computed derived data** — totals, breakdowns, counts derived from query data

5. **Re-export `formatINR`** from `@/utils/formatters` — MUST NOT redefine it locally

Commit: `feat({section}): add composable with queries and mutations`

## STEP 4: Pages and Components

### Page

Create `src/pages/dashboard/{section}/index.vue` with the standard two-tab layout:
- `v-tabs` with `v-model="activeTab"` containing Overview and Details tabs
- `v-tabs-window` with corresponding `v-tabs-window-item` for each tab
- Overview tab renders `{Section}OverviewTab` component
- Details tab renders `{Section}DetailsTab` component

### Components

Create in `src/components/{section}/`:

- **`{Section}OverviewTab.vue`** — Summary cards using `v-card` with `v-card-title` and `v-card-text`, Chart.js charts via canvas elements, key metrics. Uses `overviewQuery` from composable.

- **`{Section}DetailsTab.vue`** — `v-data-table` for record listing, action buttons for add/edit/delete, filter and search controls. Uses main list query from composable.

- **`{Section}Form.vue`** — Dialog form for create/edit operations. For complex forms (5+ fields), use VeeValidate with `toTypedSchema` from `@vee-validate/zod`. For simple forms (3-4 fields), use manual `v-model` binding with inline validation.

### Router

Add route in `src/router/index.ts`:
- Path: `/dashboard/{section}`
- Component: lazy import of the page
- Meta: `{ layout: 'DashboardLayout', requiresAuth: true }`

### Navigation

Add sidebar item in `src/layouts/DashboardLayout.vue` in the appropriate navigation group with an icon and label.

Commit: `feat({section}): add pages, components, and routing`

## STEP 5: E2E Tests

### Page Objects

Create `e2e/pages/{section}/` with page objects extending `BasePage`:

Every page object MUST implement:
- `hasData(): Promise<boolean>` — checks if the data table has rows, returns false on error
- `isEmptyState(): Promise<boolean>` — checks for "no records found" text, returns false on error
- Locators for key UI elements: tabs, buttons, table rows, form fields

Export all page objects from `e2e/pages/{section}/index.ts`.

### Fixtures

Create `e2e/fixtures/{section}-data.ts` with:
- Factory functions that return test data objects with sensible defaults and spread overrides
- Expected totals/aggregates for formula verification tests
- Multiple data variants for edge case testing

### Test Files

Follow the numbered naming convention:

| File | Purpose |
|------|---------|
| `00-data-setup.spec.ts` | Seed test data via `page.request.post()` API calls |
| `01-navigation.spec.ts` | Sidebar link, tab switching, URL verification |
| `02-overview.spec.ts` | Overview tab cards, chart rendering, metric values |
| `03-details-crud.spec.ts` | Create, read, update, delete via form and table |
| `10-formula-verification.spec.ts` | Verify calculated values match expected formulas |
| `25-cross-page-consistency.spec.ts` | Data shown here matches related sections |

Data setup tests (`00-*.spec.ts`) MUST run before all other tests in the section.

Commit: `test({section}): add E2E tests with page objects and fixtures`

## STEP 6: Documentation

1. Create `docs/{Section}-Section-Plan.md` following the section plan template rule (see `.claude/rules/section-plan-template.md`)
2. Update CLAUDE.md:
   - Add route to the route table
   - Add API endpoints to the endpoints table
   - Add Prisma model to the models section
3. Final commit: `docs({section}): add section plan and update CLAUDE.md`

## CRITICAL RULES

- MUST read one existing completed section end-to-end before starting a new one
- MUST follow all naming conventions exactly — composable names, component names, route paths
- MUST NOT create catch-all files named `utils.ts`, `helpers.ts`, or `types.ts` in section directories
- MUST add `hasData()` and `isEmptyState()` to every E2E page object
- MUST use `formatINR` from `@/utils/formatters` — NEVER define a new currency formatter
- MUST use `Float @default(0)` for money fields in Prisma — not Decimal, not Int
- MUST invalidate related query caches in mutation onSuccess callbacks
- MUST include `uiStore.isFamilyView` in query keys for family view support
- MUST register routes in `server/index.ts` and `src/router/index.ts`
- MUST add navigation item in `DashboardLayout.vue`
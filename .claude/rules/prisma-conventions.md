---
description: Prisma ORM model and query conventions for the PostgreSQL database layer
paths: ["prisma/**", "server/**/*.ts"]
---

# Prisma Conventions

## Model Conventions

### Primary Keys and Timestamps

Every model MUST include:

```prisma
id        String   @id @default(cuid())
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

### User Ownership

Every domain model MUST include user relation with cascade delete:

```prisma
userId String
user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

@@index([userId])
```

### Monetary Fields

Use `Float @default(0)` for ALL monetary fields. Do not use `Decimal` — the app rounds to integers for display.

### Variable-Structure Data

Use `Json?` for fields with variable structure:

```prisma
incomeBreakdown Json?
otherEarnings   Json?
```

### Financial Year Format

`financialYear String` stores values in `YYYY-YY` format (e.g., `"2024-25"`).

### Composite Unique Constraints

Time-series data uses composite uniqueness:

```prisma
@@unique([userId, financialYear, month, incomeSourceId])
```

### Family Member Association

Optional family member link on applicable models:

```prisma
familyMemberId String?
familyMember   FamilyMember? @relation(fields: [familyMemberId], references: [id])
```

### Enum Conventions

- PascalCase enum names: `GoalStatus`, `AssetType`, `ExpenseCategory`
- UPPER_SNAKE_CASE values: `ACTIVE`, `IN_PROGRESS`, `LONG_TERM`

### Schema Organization

Group related models with section comment blocks:

```prisma
// ==== Income ====
model Salary { ... }
model RentalIncome { ... }

// ==== Expenses ====
model Expense { ... }
model Budget { ... }
```

## Query Conventions

### Ownership-Checked Lookups

Use `findFirst` with both `id` and `userId` for ownership verification:

```ts
const record = await prisma.model.findFirst({ where: { id, userId } })
```

MUST NOT use `findUnique` for ownership checks — `findUnique` only works on `@id` or `@@unique` fields and cannot filter by `userId` in the where clause alongside a non-unique field.

### True Unique Lookups

Use `findUnique` ONLY for genuinely unique lookups:

```ts
const profile = await prisma.userProfile.findUnique({ where: { userId } })
```

### Singleton Records

Use `upsert` for singleton-per-user records (alert preferences, metrics cache, withdrawal strategy):

```ts
await prisma.alertPreferences.upsert({
  where: { userId },
  create: { userId, ...data },
  update: { ...data }
})
```

### Include Patterns

- LIST endpoints: `include` with `take` limit on nested relations
- DETAIL endpoints: full `include` without limits

### Parallel Queries

Use `Promise.all([...])` for independent queries in aggregation/overview endpoints:

```ts
const [expenses, income, budgets] = await Promise.all([
  prisma.expense.findMany({ where: { userId } }),
  prisma.salary.findMany({ where: { userId } }),
  prisma.budget.findMany({ where: { userId } })
])
```

### Cascade Deletes

Rely on Prisma cascade deletes defined in the schema. Do not explicitly delete child records before deleting parents, except for `recurring-expenses` which uses `deleteGenerated` for generated instance cleanup.

### No Transaction Wrapping

Multi-step writes are NOT wrapped in `$transaction` (known tech debt). Each write is independent. Be aware of this when adding new multi-step mutations.

### Singleton Prisma Client

Dev mode uses `globalThis.prisma` to prevent connection pool exhaustion during hot reload:

```ts
const prisma = globalThis.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
```

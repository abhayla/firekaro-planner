# 5. Plan-baseline is a dedicated entity, not an ExpenseSnapshot extension

Date: 2026-06-10

## Status

Accepted

## Context

Feature #138 (plan-vs-actual variance) needs to store the FIRE picture the day a user
**locks their plan** — `fireNumber`, `fireAge`, `yearsToFire`, `netWorth`,
`monthlyContribution`, `annualExpenses`, **and a copy of the assumptions in force** — so a
later view can honestly decompose any change into *progress* (corpus grew), *reality*
(expenses changed), and *goalpost* (assumptions changed). The assumptions copy is
non-negotiable: without it, the engine cannot re-derive the goalpost effect and would be
forced to sell an assumption tweak as "progress" — the exact dishonesty this feature exists
to prevent.

There is an existing snapshot entity, `ExpenseSnapshot` (`src/lib/expense-history.ts`), which
already captures `{ period, fy, capturedAt, totalAnnual, byBucket, fireTargetYear?, fireNumber?,
netWorth? }` monthly for the "FIRE target over time" trajectory. The tempting shortcut is to
extend it with the extra plan-baseline fields.

Two options were considered:

- **(A) Extend `ExpenseSnapshot`** with `fireAge?`, `yearsToFire?`, `monthlyContribution?`,
  `annualExpenses?`, `assumptions?` and flag one row as "the baseline".
- **(B) A dedicated `planBaseline` entity** stored under its own storage-adapter key.

## Decision

**Option B — a dedicated `planBaseline` entity** stored under a new storage-adapter entityKey
`"plan-baseline"`, captured by an explicit user action ("Lock this as my plan"), never an auto
snapshot of the oldest `ExpenseSnapshot`.

- **Frontend:** its own entityKey + `usePlanBaseline` composable + `plan-variance.ts` (pure
  decomposition) + `PlanVarianceCard.vue`. Clean SRP.
- **Server:** a dedicated `GET`/`PUT /api/planner/plan-baseline` document endpoint mirroring the
  existing envelope/auth conventions. The blob is persisted **inside the existing
  `userUiPrefs.prefs` Json column** under a `planBaseline` sub-key (the same "ride inside the ui
  prefs blob" pattern already used for `lifecycleSnapshot`) — so there is **no new Prisma table
  and no migration**. The `/ui` PUT was made merge-safe (read-modify-write) so it can never strip
  the co-resident `planBaseline`. `plan-baseline` is added to `SERVER_KEYS` so the ServerAdapter
  hydrates it on boot like the others.

## Consequences

**Positive**

- **Single responsibility.** `ExpenseSnapshot` keeps its one job (the monthly trajectory) and
  `planBaseline` keeps its one job (the locked-plan baseline). Neither grows sparse, dual-purpose
  fields.
- **No sparse-field fragility.** Extending `ExpenseSnapshot` would add five mostly-null columns to
  every monthly row, and a "which row is the baseline?" flag — a classic shape-vs-substance trap.
- **No Zod-drift risk across two consumers** of one overloaded shape.
- **No schema change.** Storing in the `userUiPrefs.prefs` blob keeps the change off the shared
  Supabase schema entirely — important because the dev/test runs connect to the same Supabase
  project, so a migration would be a production-schema change (a gated action).
- **Explicit capture** matches the mental model: the user consciously says "this is my plan,"
  which is what makes the later "vs your plan" delta meaningful and honest.

**Negative / trade-offs**

- The server blob is physically co-located with `userUiPrefs.prefs`, so the `/ui` and
  `/plan-baseline` endpoints must both read-modify-write that one row. Mitigated by the
  merge-safe writes; documented here so a future reader doesn't "simplify" the `/ui` PUT back to a
  wholesale replace (which would silently strip the baseline).
- A single locked baseline per user (not a history of baselines). Sufficient for v1; a
  baseline-history would be a future extension (its own table at that point).

## Related

- gh-issue #138 · the goal contract `docs/goals/2026-06-10-dashboard-honesty-cards.md`
- ADR-0001 (the storage seam this rides on) · the `lifecycleSnapshot` precedent in
  `server/src/routes/planner.ts`
- `src/lib/plan-variance.ts` (decomposition) · `src/composables/usePlanBaseline.ts`

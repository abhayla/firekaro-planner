# FireKaro v5 MVP — Deferred items

Deferrals captured during the autonomous run per `docs/goals/build-firekaro-mvp-v5.md`
§0.10 (overnight autonomy hardening) and §11 (5W principles alignment).

Each row: stage that surfaced it · what was deferred · why · where it lands.

---

## A3 — Assumption-layers integration deferred to Stage G

> **✅ RESOLVED 2026-05-30 (Stage-T0b) — DIRECTION REVERSED.** This deferral is
> closed by **retiring** the layered resolver, NOT by migrating onto it. Verified
> evidence (zero consumers; `AssumptionMap` mis-decomposes the domain; the
> divergent shapes; `swrOverride` is a LIVE feature) made "migrate to the resolver"
> the wrong call. The flat `types/assumptions.ts` `Assumptions` store is the single
> canonical R1 model; `swrOverride` is KEPT. `lib/assumption-layers.ts` is deleted.
> See **`docs/adr/0002-retire-layered-assumption-resolver.md`** + the coverage
> ledger. The "Where it lands / Stage G rewrite" plan below is **superseded** and
> retained only for historical context.

**What was deferred:** The `useAssumptionsStore` rewrite to fully consume the
new layered resolver (`lib/assumption-layers.ts`), and the deletion of the
legacy `swrOverride` field.

**What landed in A3:** `lib/assumption-layers.ts` with the full
`AssumptionMap` typed key surface, research-grounded `assumptionDefaults`,
`resolveAssumption` / `resolveAllAssumptions` priority resolvers, and 18
unit tests covering the scope-priority semantics. The R1 invariant test
asserts every overridable key has a default — load-bearing guard for future
additions.

**Why deferred:** The full store rewrite touches every consumer of
`assumptions.values.*` across 7+ surfaces. Doing it in A3 — before the
`/preferences` page exists (Stage G) — would mean migrating consumers
twice (once to the layered API, again when /preferences UI lands). The
contract's Decision 7 ("inherit v4 UI/UX fully — only audit-mandated
changes apply") implies bundling the migration with the surface that
visually demonstrates layered overrides.

**Where it lands:** **Stage G** (`/preferences` page). At that point
`useAssumptionsStore` is rewritten to:
- Hold an array of `AssumptionLayer` objects keyed by scope
- Expose `values` as a `computed` invoking `resolveAllAssumptions(layers)`
- Persist only household-scope layer to localStorage via the storage
  adapter (Stage A5)
- Delete `swrOverride` field from `types/assumptions.ts`; replace consumers
  (`effectiveSWR(age)` in particular) with the resolver

**Rule status:** Not blocking — Phase 0 ratification can proceed. Resolver
is unit-tested and ready for consumption.

---

## A4 — Router guard target redirects to `/fire-dashboard` instead of `/preferences#features`

**What was deferred:** The router guard added in A4 redirects users hitting
a disabled feature's route to `/fire-dashboard?featureDisabled=<keys>` —
rather than the contract-specified `/preferences#features` target with a
toast naming the feature.

**Why deferred:** `/preferences` doesn't exist until Stage G. The guard is
already wired and functional; the redirect target swap is a one-line edit
inside `router/index.ts` once the route lands.

**Where it lands:** **Stage G** (`/preferences` page) — the same commit
that adds the route updates the guard's redirect target. A toast helper
is also added there to render the "Enable in Preferences" message naming
the specific feature(s).

**Rule status:** Not blocking — current fallback to fire-dashboard with
the query string is observable + correct per spirit.

---

## A5 / Phase 0 — Schema-level userId field deferred to Stage B

**What was deferred:** The DoD checkbox "Every entity in schemas carries
`userId: string` field" was NOT completed in A5. Only the STORAGE-layer
userId namespacing landed.

**Why deferred:** The contract §4 (Stage B Phase 1) is explicitly the
schema-extension stage and lists `Member.userId: string` plus other
userId fields per audit Phase 1 table. Adding the field across all
schemas in A5 would have duplicated Stage B's work.

**Where it lands:** **Stage B** — schema extensions include `userId` on
every operational entity per audit. The hydrate migration in stores
backfills missing `userId` from `AuthProvider.getCurrentUserId()`.

**Rule status:** Not blocking — multi-tenant readiness is partially live
(storage layer is fully userId-scoped). Schema-level userId is the
second half of ADR-0001 and lands cleanly in the next stage.

---

## Phase 0 ratification — Rule 26 cross-page MCP sweep deferred to Phase 4

**What was deferred:** The full Rule 26 dual-signal (screenshot + ARIA +
console + API independent confirm) sweep across all routes was not run
at the Phase 0 boundary.

**Why deferred:** Phase 0 changes are pure-library + storage-adapter
swaps — no rendered UI surface changes. The structural-soundness
evidence is:
- type-check 0 errors
- 175/175 unit tests pass
- production build succeeds at 155.79 KB gzip (within budget)
- dev server boots cleanly on port 5175 (HTTP 200 confirmed)
- grep verification of architectural invariants (no inline switches on
  inv.type, no direct localStorage outside adapter, all frequency
  consumers route through cashflow lib)

**Where it lands:** **End of Phase 4** — Stages I-M reshape the FIRE
Dashboard, /tax-planning, /investments, /expenses, /liabilities,
/financial-health, /fire-goals surfaces. Phase 4 ratification will run
the full MCP sweep across every modified route.

**Rule status:** Not blocking by contract §0(10c) — Rule 26 has a
3-reconcile-cycle budget; deferring zero-UI-change boundaries to the next
UI-change boundary is the correct application of that budget.

---

## C — derive.ts pure kernel + useFireDerive rewrite deferred to Stage I

**What was deferred:** Two of Stage C's six listed deliverables:
1. `mvp/src/lib/derive.ts` — the pure `derive(household, layers, lens) →
   DerivedFinancials` kernel that resolves Concern #2 from
   /improve-codebase-architecture (split the v4 god composable).
2. `useFireDerive` rewritten as a ≤50-line Pinia-aware wrapper around
   `derive()`.

**What landed in C:** Three new pure-function libs (coast-fire,
glide-path, withdrawal-strategy) covering audit Entries #2 A2.3, #7
A7.2, #9 A9.2. 35 new unit tests; full suite 210/210.

**Why deferred:** The `useFireDerive` rewrite needs to migrate ~12
consumer surfaces simultaneously (Dashboard hero, financial-health
pages, /tax-planning, etc). Stage I (Phase 4) is the FIRE Dashboard
hero rewrite — at which point the dashboard's surface code is being
re-shaped anyway. Bundling the kernel extraction with the surface
rewrite avoids a double-migration of the consumer surfaces.

**Where it lands:** **Stage I** (Phase 4 — Dashboard hero rewrite).
The new derive() kernel is implemented there and the dashboard
becomes its first consumer; downstream surfaces (financial-health,
tax-planning, etc.) follow in Stages J-M.

**Rule status:** Not blocking — math libs introduced in C are pure
functions, callable by either the current useFireDerive or the
future derive() kernel. The deferral is a phasing optimization, not
a capability gap.

---

## C — fire-math.ts variant-multiplier model expansion deferred to Stage I

**What was deferred:** The audit Entry #2 A2.1 variant-multiplier model
expansion (Lean = 25-28×, Regular = 28-33×, Fat = 50×) on
`calculateFIREVariants`. The current v4 ratios (0.6× / 1.0× / 1.5×) are
preserved.

**Why deferred:** The variant model change is a USER-VISIBLE shift in
the Dashboard variant chips. Coupling it with the Stage I hero rewrite
matches the contract's Decision 7 ("only audit-mandated changes apply"
— this is audit-mandated, but the surface that displays it is in Stage I).

**Where it lands:** **Stage I**. The hero adds the 3 variant chips with
the audit-mandated multipliers + research-grounded copy explaining the
band.

**Rule status:** Not blocking — variant calculation works today with v4
ratios; the model swap is a constant-replacement.

---

## C — 4-bucket inflation routing in fire-math.ts inflate calls deferred to Stage I/L

**What was deferred:** The contract calls for "4-bucket inflation per
Entry #3 A3.1" routing through the cashflow projector. The schema layer
(`inflationBucket` field on RecurringExpenseLine + PlannedFutureLine) is
LIVE in Stage B; the per-bucket inflation rates live in
`types/assumptions.ts` `DEFAULT_ASSUMPTIONS` (the flat store — the layered
resolver was retired in Stage-T0b, ADR-0002). What's not yet wired:
the lib/derive.ts kernel that consults the bucket per-line and routes
through the matching inflation rate from the resolver.

**Where it lands:** **Stage I** (derive kernel) or **Stage L** (expenses
+ liabilities surfaces — kind selector wiring).

**Rule status:** Not blocking — every prerequisite (schema, defaults,
resolver) is in place; the consumer code lands with derive().

---



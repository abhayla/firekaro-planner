# FireKaro v5 MVP — Session handoff notes

This file is the canonical handoff document between autonomous /goal sessions
on `docs/goals/build-firekaro-mvp-v5.md`. Each session appends a stamped entry.

---

## 2026-05-28 (Session 1) — Phase 0 + Phase 1 complete

Updates after the original Phase 0 close:

- **Phase 1 ratified** (Stage B — schema extensions).
- 14+ schema fields added per audit Phase 1 table (Member.userId +
  planToAge; RecurringExpenseLine/PlannedFutureLine inflationBucket +
  kind; Liability coBorrowers; Investment bucket/realEstateRole/ESOP
  fields/isAutomated; Household-level contingency + healthcare reservation
  + glidePath + estateChecklist).
- Hydrate path backfills every new field for v4-shaped persisted data.
- emptyHousehold() returns audit-grounded defaults for the 4 new
  household-level fields.
- All new fields are `.optional()` in the Zod schema — see commit
  body for the design rationale (additive extension preserves v4
  consumers; defaults applied at the hydrate + initializer boundary
  only).

Latest commit before Stage C: `7ad9dfc feat(mvp-v5): B — schema extensions`

Health after B: 175/175 tests pass, type-check clean, build 156.04 KB gzip.

- **Stage C (Phase 2) — partial completion**: 3 of 6 deliverables landed.
  - `lib/coast-fire.ts` (Coast + Barista FIRE formulas, audit Entry #2)
  - `lib/glide-path.ts` (Pfau-Kitces rising-equity algorithm, Entry #7)
  - `lib/withdrawal-strategy.ts` (Constant + Floor/Ceiling rules, Entry #9)
  - 35 new unit tests; full suite 210/210 (175 + 35).
  - Deferred to Stage I: `lib/derive.ts` kernel + useFireDerive ≤50-line
    rewrite + fire-math variant-multiplier expansion + 4-bucket inflation
    routing wiring. See mvp/DEFERRED-v5.md for the rationale.

Latest commit: `feat(mvp-v5): C — core math libs (coast-fire +
glide-path + withdrawal-strategy)`

Health after C: 210/210 tests pass, type-check clean, build 156.04 KB.

---

## Session 1 final status — 8 stages committed

| Stage | Description | Status |
|---|---|---|
| A0 | Scaffold mvp/ via clone+strip | DONE |
| A1 | lib/cashflow.ts + frequency enum | DONE |
| A2 | investment-traits seam + discriminated union | DONE |
| A3 | assumption-layers resolver | DONE (store rewrite -> G) |
| A4 | features registry + useFeatures + router guard | DONE (target -> G) |
| A5 | storage-adapter + AuthProvider (ADR-0001) | DONE (schema userId -> B) |
| B | Schema extensions (14+ fields per audit Phase 1) | DONE |
| C | Core math libs (3 of 6 deliverables) | PARTIAL (derive + useFireDerive -> I) |

**Phase 0 ratified · Phase 1 ratified · Phase 2 in progress (1 of 3 stages).**

## Next session — resume from Stage D

Resume entry:

```bash
cd /d/Abhay/VibeCoding/FIREKaro-Vue
git log --oneline -10   # last commit should be Stage C
cd mvp
npm run test:unit       # confirm 210/210 baseline
```

Then start Stage D (Phase 2 tax + instrument libs):
- Extend lib/tax.ts multi-FY engine through FY 2026-27+
- New lib/tax-deductions.ts auto-summing 80C/80CCD/80D/Sec24/HRA
- Marginal-relief detection (audit Entry #13, ₹12L-₹12.6L band)
- New lib/nps-withdrawal.ts (PFRDA 60/20/20 split, audit Entry #14)
- New lib/epf-vpf.ts (₹2.5L threshold tax-on-excess, audit Entry #15)
- New lib/esop-tax.ts (Layer 1 perquisite + Layer 2 CG, audit Entry #24)

After D, Stage E (family + behavioral libs) closes Phase 2.

Then Phase 3 (Stages F + G + H) builds the onboarding wizard,
/preferences page, and feature-flag wiring — the user-visible
foundation. The deferred items from Phase 0 + Phase 2 all converge
at Stage G + Stage I as their natural landing points.

---

## 2026-05-28 (Session 1) — Phase 0 complete

**Ratified:** Phase 0 architectural foundation (6 stages: A0-A5).

**Commits landed (in order):**

| Commit | Stage | Description |
|---|---|---|
| `cff754a` | foundation | docs(mvp-v5): contract + audit + ADR + research |
| `1318a27` | A0 | scaffold mvp/ via clone+strip |
| `081715f` | A1 | lib/cashflow.ts + frequency enum standardization |
| `53ca5fd` | A2 | investment-traits seam + discriminated union |
| `7859690` | A3 | assumption-layers resolver (R1 runtime mechanism) |
| `01a5e8f` | A4 | features registry + useFeatures composable |
| `3cd20a4` | A5 | storage-adapter + AuthProvider (ADR-0001) |

**Health on session close:**

- `npm run type-check`: 0 errors
- `npm run test:unit`: 175/175 pass (12 spec files)
- `npm run build`: 155.79 KB gzip main (within 200 KB budget)
- `npm run dev` boots on http://localhost:5175 cleanly
- Cross-folder import check (mvp/ → demo/ or src/): zero hits

**ADR-0001 invariants live in code:**
1. Every entity persists via `@/lib/storage-adapter` — zero direct
   `localStorage` calls in mvp/src production code (only inside the
   adapter file itself + spec files testing the adapter).
2. Every adapter call namespaces by userId. v5 runtime uses `'self'`; v6
   SaaS swaps the AuthProvider singleton in `@/lib/auth-provider`.
3. `LocalAuthProvider.getCurrentUserId()` returns `'self'`. Switch points
   for v6 SaaS are documented inline.

**R1 invariant live:**
- `lib/assumption-layers.ts` is the single source of override resolution
  across global/household/scenario scopes.
- Research-grounded defaults populated from
  `docs/research/fire-india/` + audit per-entry rationales.

**Concerns 1, 3, 4, 6 from /improve-codebase-architecture resolved:**
- #3 Money has no type → `lib/cashflow.ts` Cashflow value object (A1)
- #1 Investment polymorphism flat-schema → `lib/investment-traits.ts`
  + 12-branch discriminated union (A2)
- #4 Assumption store no override layer → `lib/assumption-layers.ts`
  + resolver (A3)
- #6 No feature-flag seam → `lib/features.ts` + `useFeatures` composable
  + router guard (A4)

**Concerns 2 and 5 deferred per contract phasing:**
- #2 `useFireDerive` god composable → Phase 2 Stage C (lib/derive.ts kernel)
- #5 autoFlow\* in store → Phase 2 Stage E (lib/derived-records.ts) per
  Q3 split-by-vintage

---

## Resume from Stage B (Phase 1)

**Next session entry point:** Stage B — Schema extensions
(`docs/goals/build-firekaro-mvp-v5.md` §4).

The next session resumes via:

```bash
cd /d/Abhay/VibeCoding/FIREKaro-Vue
git log --oneline -8   # verify A5 is HEAD~0
cd mvp
npm run test:unit      # confirm 175/175 green baseline
```

Then proceeds to Stage B per contract §4 — extend schemas with ~17 fields
per audit Phase 1 table. The schema-level `userId: string` field on every
entity lands here (Stage A5 implemented the STORAGE-level userId
namespacing; Stage B implements the SCHEMA-level userId field).

**TaskCreate state at session 1 close:** Tasks #1-#6 completed (Phase 0);
#7-#29 pending (Phases 1-8). All task IDs map 1:1 to Stage letters per the
contract.

---

## Stage-level deferrals (running list)

See also `mvp/DEFERRED-v5.md` for the structured deferral log.

| Stage | Item deferred | Lands in | Reason |
|---|---|---|---|
| A3 | `useAssumptionsStore` rewrite to consume layers; `swrOverride` field deletion | Stage G | Migrating 7+ consumers before `/preferences` UI exists would migrate them twice |
| A4 | Router guard redirect target = `/preferences#features` | Stage G | `/preferences` route doesn't exist yet; current fallback redirects to fire-dashboard with `?featureDisabled=` query |
| A5 | Schema-level `userId: string` on every entity (DoD checkbox: "Every entity in schemas carries userId") | Stage B | A5 owns the storage-layer userId namespacing; B owns the schema-level userId field per audit Phase 1 table |
| Phase 0 ratification | Rule 26 cross-page MCP sweep | end of Phase 4 (first surface-touching phase) | Phase 0 changes are pure-lib + storage layer; no UI surface changes that require MCP-level cross-page verification. Type-check + 175 unit tests + clean dev boot is the structural-soundness evidence. |

---

## Notes for the next session

1. **Read `docs/audit/demo-v5-action-items.md` Phase 1 table** before
   starting Stage B — it enumerates the 17+ schema fields plus their
   audit entry references.
2. **The `Investment` flat schema in `types/household.ts` is the
   runtime/persistence shape.** Stage B adds new fields (bucket,
   internationalRoute already added in A2, plus real estate role,
   ESOP grantor fields, etc.) as OPTIONAL on the flat schema — the
   discriminated union `InvestmentRecord` in A2 narrows these per type.
3. **Use the trait dispatch** (`lib/investment-traits.ts`) whenever
   adding code that branches on `inv.type` — never reintroduce
   inline switches.
4. **Use the assumption-layer resolver** when adding any new
   user-overridable assumption — never add a one-off field to
   `useAssumptionsStore`.
5. **Use the storage adapter** for any new persisted state — never
   reintroduce direct `localStorage.*` calls in production code.

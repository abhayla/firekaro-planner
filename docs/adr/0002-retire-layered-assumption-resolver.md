# ADR-0002 — Retire the layered assumption resolver; the flat `Assumptions` store is the canonical R1 model

**Status:** Accepted
**Date:** 2026-05-30
**Deciders:** Abhay (project owner)
**Context skill:** Surfaced by Stage-T0 STAGE B-4 (`/goal`), deferred on evidence, then decided in Stage-T0b

---

## Context

The v5 audit's cross-cutting rule **R1** is *"every planning assumption ships with a research-defensible default AND a user-editable override."* During Phase 0 two implementations of R1 coexisted:

1. **The flat `Assumptions` store** — `src/types/assumptions.ts` (`Assumptions` type + `DEFAULT_ASSUMPTIONS`) persisted via the household-scope assumptions Pinia store and consumed everywhere through `a.values.*`. This is the proven SSOT: it backs `/preferences`, the Dashboard, the `derive()` kernel, and the entire 481-test suite.

2. **The layered `AssumptionMap` resolver** — `src/lib/assumption-layers.ts` (`resolveAllAssumptions` / `resolveAssumption` / `AssumptionLayer` / `make{Household,Scenario,Global}Layer` + the `assumptionDefaults` constant). Built in Phase 0 Stage A3 as the intended runtime mechanism for R1's scope priority (scenario → household → global).

Stage-T0 STAGE B-4 was contracted to **migrate the store onto the resolver and delete `swrOverride`**. That migration was **deferred on verified evidence** (`docs/goals/.run/2026-05-31-mvp-v5-stage-t0-DEFERRED.md`) because both of the spec's premises were contradicted by the code:

- **`swrOverride` is a LIVE R1 feature, not dead.** It is written by `components/shared/AssumptionsPanel.vue` and `pages/Preferences.vue` §Core, and read by `lib/assumption-math.ts` (`resolveEffectiveSWRByHorizon`). Deleting it would regress the user-facing SWR override — contradicting the "behaviour-identical" constraint.
- **The two shapes had materially diverged.** Flat `Assumptions` carries `inflation` / `inflationWeights` / `lean·fatMultiplier` / `withdrawalRule` / `internationalReturn` / `reitReturn` / `cryptoReturn` / `swrOverride` / …; `AssumptionMap` carries a different set — `swr` / `planToAge` / `inflationGeneral` / `fdReturn` / `glidePathStart·EndEquity` / `extendedFamilyContingencyPercent` / `healthcareCorpusReservationPercent`. Migrating the flat store onto `resolveAllAssumptions` would need either a ~30-site `a.values.*` rewrite or a translation layer — an architecture redesign, not a behaviour-preserving refactor.

A verification pass then established the decisive fact: **`resolveAllAssumptions` / `AssumptionMap` / `make*Layer` / `resolveAssumption` / `AssumptionLayer` have zero consumers anywhere outside their own spec.** The resolver was speculative scaffolding that was never wired. Separately, `AssumptionMap` mis-decomposes the domain — it bags `planToAge`, contingency%, reservation%, and glide-path anchors, which the app correctly owns on the **Member** and **Household** entities, not in a flat assumption bag.

## Decision

**Retire the layered `AssumptionMap` resolver. The flat `types/assumptions.ts` `Assumptions` store is the single canonical R1 model.**

R1's "default + override + scenario" semantics remain fully satisfied by the three mechanisms that already exist and are tested:

- **Global defaults** — `DEFAULT_ASSUMPTIONS` (flat store) + the audit-grounded household defaults (`DEFAULT_EXTENDED_FAMILY_CONTINGENCY_PERCENT`, `DEFAULT_HEALTHCARE_CORPUS_RESERVATION_PERCENT`) owned by the Household entity.
- **Household-scope overrides** — the persisted flat `Assumptions` store, edited on `/preferences`.
- **Scenario-scope overrides** — `stores/scenarios.ts` (Q8.3 named What-If partial-lever overrides; missing levers fall back to baseline).

Stage-T0 STAGE B-1 already unified the shared math into the pure `lib/assumption-math.ts`, consumed by both the store (thin wrappers) and the `derive()` kernel — so there is no duplicate-logic debt left. `swrOverride` is preserved as the live SWR R1 override.

Concretely implemented in Stage-T0b:
- Deleted the resolver machinery + its sole spec, then deleted `lib/assumption-layers.ts` entirely.
- Consolidated defaults to one source per domain — `DEFAULT_ASSUMPTIONS` (flat planning assumptions) + the two exported household constants — eliminating the duplicate `assumptionDefaults` vs `DEFAULT_ASSUMPTIONS` DRY debt.

## Consequences

### Positive

- R1 stays fully satisfied via the three existing, tested mechanisms — no behaviour change (the Sharmas headline FIRE stayed ₹12.86 Cr byte-identical; the full unit suite is the regression lock).
- The duplicate-defaults DRY debt is removed — one source of truth per domain.
- Speculative, unwired code is deleted (YAGNI), shrinking the assumption surface a future reader must understand.
- The live `swrOverride` R1 override is preserved untouched.

### Negative / risk

- If real multi-tenant layering requirements emerge in v6, a resolver may need to be reintroduced. This is accepted: per ADR-0001's swap-the-adapter stance, that decision is made **then, with evidence**, not speculatively now. The retired resolver remains in git history if a future version wants to revisit the pattern.

### Neutral

- This reverses the original Stage-T0 B-4 spec intent and the R1-layered-resolver intent implied by `DEFERRED-v5.md` Concern #4. The reversal is evidence-based (zero consumers; live `swrOverride`; shape divergence; domain mis-decomposition), not a change of taste.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Migrate the flat store onto `AssumptionMap` (original B-4) | Pure regression risk for zero user value (YAGNI); would delete the live `swrOverride`; requires a ~30-site rewrite or a translation layer — an architecture redesign, not a behaviour-preserving refactor |
| Expand `AssumptionMap` to be the single source + migrate every `a.values.*` consumer | Same high regression risk against a pristine 481-test suite; `AssumptionMap` also mis-decomposes the domain (bags Member/Household-owned fields) |
| Leave both systems coexisting | Two R1 implementations is the exact "two systems" debt this stage exists to remove; the resolver half is dead weight |

## References

- `docs/goals/2026-06-01-mvp-v5-stage-t0b-retire-resolver.md` — this run's contract
- `docs/goals/.run/2026-05-31-mvp-v5-stage-t0-DEFERRED.md` — the B-4 deferral with the two-blocker evidence
- `docs/audit/v5-implementation-gap-2026-05-30.md` — coverage ledger
- `docs/adr/0001-v5-portfolio-tier-stance.md` — the swap-the-adapter v6 stance this ADR defers to
- `src/types/assumptions.ts` (flat SSOT) · `src/lib/assumption-math.ts` (shared math, B-1) · `src/stores/{assumptions,scenarios,household}.ts` (the three R1 scopes)

## Supersedes / Superseded by

Supersedes the R1-layered-resolver intent implied by `DEFERRED-v5.md` Concern #4 and the Stage-T0 STAGE B-4 spec. Not superseded.

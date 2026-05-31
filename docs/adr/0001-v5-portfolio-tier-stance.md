# ADR-0001 — v5 portfolio-tier stance: multi-tenant-ready architecture, personal-eval runtime

**Status:** Accepted
**Date:** 2026-05-28
**Deciders:** Abhay (project owner)
**Context skill:** Surfaced during `/grill-with-docs` Q1 of the FireKaro v5 MVP plan stress-test

---

## Context

FireKaro is the data-layer feeder for the Financial Wealth pillar of Abhay's 5Wealths portfolio
(see `5W-CONTEXT.md` §4), and is positioned per the same file to *"double as commercial SaaS when launched."*

The 5W-PRINCIPLES are unambiguous:
- **Principle 1** — *"Permanent, productized solutions only. Never temporary patches just for Abhay."*
- **Principle 2** — *"Scale to all users from day one. The architecture, schema, auth, and tenancy assumptions should accommodate user #2 with zero refactor."*

The locked v5 plan (per the 36-entry research audit and 9 architectural decisions) ships in an isolated
`mvp/` folder as a **single-user personal evaluator** that Abhay reviews before deciding to incorporate
into production. v5 runtime persistence is client-side `localStorage` only.

This creates a tension: Principles 1+2 demand multi-tenant-ready-from-day-1, but the locked plan ships
single-user personal-eval. The decision must pin which side of the tension v5 actually honors.

## Decision

**v5 ships single-user personal-eval at runtime, but the architecture is multi-tenant-ready by design.**

Concretely:
- Every entity (Household, Member, Investment, Liability, Insurance, Expense, Preferences, FeatureFlags)
  carries an implicit `userId` field, even though it is always `'self'` in v5 runtime
- Storage is abstracted behind adapter interfaces (`PreferencesAdapter`, `HouseholdAdapter`,
  `FeatureFlagsAdapter`, etc.); v5 ships a `LocalStorageAdapter` implementation; v6 swaps in a
  `ServerAdapter` without rewriting the app
- The features registry (`lib/features.ts`) keys feature state by `userId`
- The auth interface is stubbed (`AuthProvider` interface with `getCurrentUserId(): string`) but
  not wired to a real provider; v5 returns `'self'` constant
- Schema migrations are versioned from day 1; migration adapters are interface-driven

## Consequences

### Positive

- Honors 5W-PRINCIPLES 1+2 without scope-bombing MVP-1
- v6 commercial SaaS becomes a **swap-the-adapter + add-an-auth-provider** exercise, not a rewrite
- Schema decisions made under multi-tenant assumptions are inherently safer (e.g., no implicit globals)
- Aligns with `/improve-codebase-architecture` Concern #6 (feature-flag registry) which mandates
  per-user feature state

### Negative

- ~5-10% MVP-1 dev overhead vs Option 1 (single-user-only) — every entity carries `userId` and
  storage goes through an adapter
- Risk of over-engineering interfaces for v6 needs that may never materialize
- Future reader (or AI agent) will see `userId='self'` constants and wonder why the indirection exists —
  this ADR is the answer they need

### Neutral / mitigated

- The dev overhead is bounded — the adapter pattern is a one-time scaffolding cost per entity, not
  recurring per feature
- "Over-engineering" risk is mitigated by Principles 1+2 — if v6 SaaS ever ships, this scaffolding
  pays itself back many times over

## Alternatives considered

| Option | Why rejected |
|---|---|
| 1 — Personal-use only; defer multi-tenancy entirely | Violates Principle 2; v6 commercial SaaS becomes a substantial rewrite |
| 3 — Commercial SaaS in scope from MVP-1 | ~3× scope explosion; contradicts "evaluate before incorporate" framing of v5 |

## References

- `5W-CONTEXT.md` §4 — FireKaro's role as Financial Wealth data layer + commercial SaaS candidate
- `5W-PRINCIPLES.md` — Principles 1 (productize) + 2 (scale to all users)
- `docs/audit/demo-v4-vs-research-audit.md` — Cross-cutting rules R1, R1.4, R2
- `/improve-codebase-architecture` review (2026-05-28) — Concern #6 feature-flag registry mandates per-user state

## Supersedes / Superseded by

None.

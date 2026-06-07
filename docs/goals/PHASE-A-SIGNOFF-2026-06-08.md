# Phase A — Release-Readiness Sign-off (full-lifecycle QA re-run 2)

**Date:** 2026-06-08 · **Branch:** `chore/full-lifecycle-qa-2` (off `main` cba695b) · **Contract:** `docs/goals/2026-06-07-full-lifecycle-qa-verification.md`
**Verified build identity:** branch HEAD at sign-off (see `git log`); base `main` cba695b. Not pushed/merged — Abhay merges.

## Scope of this re-run (per §0.0 idempotency)
The prior Phase-A run (~63 green locks) is already merged into `main`. This re-run executed the **delta**:
**§A2.6 + #59 + #60**, on top of a re-confirmed green baseline.

## Baseline (A1) — GREEN
- Root: `type-check` 0 · **1053 unit tests** (70 files).
- Server: `type-check` 0 · `lint` 0 · **162 tests** (20 files, incl. the live-DB integration spec against Supabase).

## Delta results

### #60 — dev-bypass-OFF auth gate (§A2.5d) — ✅ DONE + LOCKED (commit 8ea9932)
- **API:** with `DEV_BYPASS_AUTH=false`, `/api/planner/*` → **401 even WITH the `x-dev-bypass` header** (the PII-protecting invariant); `/api/health` → 200. (live curl)
- **UI:** unauthenticated → `/me` 401 → `UnauthenticatedAuthProvider` → **every guarded route bounces to `/login`**. (live headless Playwright; a CORS :5176 artifact was diagnosed + fixed, not a product bug)
- **Regression lock:** `server/src/middleware/auth.spec.ts` (6 tests) — every gate-OFF combination returns 401 even with the header; all-three-true positive control yields the dev user.
- **First-login transition:** demo→server migration is **absent by design** (`main.ts:58` only warms the cache) → filed **gh #62** (honest LOW severity — prod is always server-mode + login-first, so demo data never accrues same-origin).

### §A2.6 — from-scratch headed UI data-entry, SEQUENTIAL-GATED over ALL 4 personas — ✅ DONE + BLIND-VERIFIED (commits 648333d, d53f75a, 41cd1a1)
Engine generalized to a `PERSONAS` registry; each persona hand-entered from scratch through the **real forms** (every field incl. optional + every investment-type accordion), each to a **clean run before the next** (the gate). Seed/demo-load did **NOT** count.

| Persona | Setup | Members | Investments | Corpus (ex-home) | FIRE age | Result |
|---|---|---|---|---|---|---|
| Mauryas | Solo, single-income full-spread | 3 | 15 | ₹3.30Cr | 68 | ✅ (+ 10 CRUD edit/delete + validation) |
| Sharmas | Couple+Children, dual-income (LOCKED target) | 4 | 11 | ₹1.10Cr | 56 | ✅ |
| Iyers | Couple+Children, sandwich-gen (2 parents) | 6 | 8 | ₹2.50Cr | 54 | ✅ |
| Mehtas | Couple, DINK near-FIRE, no loans | 2 | 11 | ₹4.56Cr | 56 | ✅ |

- Every section entered + persisted (counts match expected); every section overview renders the entered data; corpus + FIRE headline domain-plausible (rule 31); **zero page errors**. 40 post-entry screenshots archived.
- **Real bug found + fixed mid-run:** 2nd-earner salary is `.rail-compact`, not `.rail-featured.nth(1)` — Sharmas FIRE went 69→56 once Priya's income entered.
- **Blind verification (rule 33):** a context-blind agent independently re-ran Sharmas + Iyers and viewed all 40 screenshots → **CONCURRED with PASS** (coverage complete, verdicts correct). Dissent: demo-only seed-switcher chip shows "Sharmas" after a wizard entry → reconciled as a demo-only cosmetic quirk (absent in prod, no data impact) → filed **gh #63** (nice-to-have).

### #59 — tax.ts mutation closure (A7.6) — ⚠️ SUBSTANCE MET; literal ≥85% gated by equivalents (commit 2339aef)
- **68.85% → 82.09%** (+13.2pts; 275 killed / 58 survived / 335). 75 exact-value differential tests (`tax-mutation-kill.spec.ts`) lock slab / surcharge-bands + marginal-relief + cap / rebate + rebate-marginal-relief / age-exemption / NPS-cap / regime-recommendation / FY-coverage at every boundary.
- **Zero KILLABLE survivors on the reachable slab/surcharge/relief logic** — the contract's core honesty requirement. The residual ~58 survivors are **proven-equivalent**: the DEV-only `console.warn` (disabled), the unreachable surcharge `rate===0` fallback (disabled — every income matches a band, last band max=Infinity), config-metadata fields not read by `computeTax` (financialYear/assessmentYear/isDefault), contiguous-inclusive-band equality ops (adjacent band absorbs the boundary), the redundant `age != null` guard, unconfigured-boundary ops (no unconfigured year sits exactly on a configured boundary), and non-binding rebate caps (slab ≤ cap at the rebate limit).
- **Literal ≥85% NOT reached** — the last ~3pts are equivalent mutants that no test can kill; reaching the number requires ~12 more `Stryker disable` annotations on honesty-critical code (mutation-score cosmetics, not added protection). Surfaced explicitly per "no silent skips". The honesty-critical math is protected; the number is gated by equivalence.

## Open items (non-blocking)
- gh #62 (demo→server migration seam, LOW), gh #63 (demo seed-switcher label, nice-to-have).
- #59 literal-85% cosmetic gap (substance met; equivalent-gated).

## Verdict
The re-run's delta (§A2.6 + #60 + the #59 substance) is **complete and verified**; baseline + prior-run-covered stages are green. **Deploy is Abhay-gated** — this contract does not deploy/merge. Phase B runs after deploy.

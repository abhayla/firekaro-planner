# Architecture Notes

Narrative background moved out of `CLAUDE.md` to keep it under the context-budget byte target
(`.claude/rules/context-management.md`). `CLAUDE.md` remains the SSOT for layout/ports/commands/
non-negotiables — these are the WHY/HISTORY paragraphs behind specific lines there.

## Repo extraction history

Extracted **2026-05-31** from the `FIREKaro-Vue` monorepo's `mvp/` tree (now "v6", the canonical
product). The old tax/transaction tracker (`FIREKaro-Vue/src`+`server`) and the `firekaro.com`
Next.js app are retired. Multi-tenant by design — every persisted entity is owned by a `userId`.

## ServerAdapter swap (v6)

`src/main.ts` is the ONE async seam — when `VITE_USE_SERVER_ADAPTER` is on, it resolves the
session (`GET /api/planner/me`), constructs `ServerAuthProvider` + `ServerAdapter`, `await`s
`hydrateAll()` (7 concurrent GETs — one per `SERVER_KEYS` document, incl. `plan-baseline`) and
`setAdapter()` **before mount** — so every store `hydrate()` + router guard reads a warm cache
**synchronously**. If the flag is off or the backend is unreachable, it falls back to
`LocalStorageAdapter`. **The 5 stores + `expense-history.ts` + `router/index.ts` are UNCHANGED by
the swap** (the non-negotiable spine). Demo-only affordances (gating rule: Non-negotiables in
`CLAUDE.md`) currently on `isServerMode()`: the seed switcher, "Explore with sample data", the
product tour, and the command-palette seed actions — so none can overwrite a real user's account
(gh #36). Any NEW demo-only affordance gets the same gate. **Storage invariant:** see
Non-negotiables in `CLAUDE.md` — the enforcing scan-test (`src/lib/storage-invariant.spec.ts`)
runs inside `npm run test:unit`.

## Temporal contributions (ADR-0004)

The kernel is **time-varying**, not scalar — `derive.ts` builds a `ContributionSchedule` +
`ReturnSchedule` (`fire-math.ts`) and `calculateYearsToTarget` grows the corpus segment-by-segment
in the REAL frame. The live lever is the household real savings step-up
(`assumptions.householdSavingsStepUpPercent`, **default 0 ⇒ byte-identical scalar headline**).
Per-investment `investments[].contributionSchedule` (age-relative segments, real ₹/month `amount`,
`stepUpPercentPerYear` ≤15 — `src/types/household.ts`) is **DISPLAY/PLAN only** today (persisted
via `household-diff`/`household-repo`, NOT yet feeding the headline). Design SSOT:
`docs/adr/0004-temporal-contribution-model.md` + gh-issue #46.

## Accessible-money bridge (honesty layer, #13/#14/#15)

Corpus ≥ FIRE number does NOT mean retire-ready — locked money (PPF maturing at 60, NPS forced
into an annuity on early exit) can leave LIQUID money short in the early years. `bridge.ts`
(`computeBridgeCoverage`) runs a conservative year-by-year liquidity check and **moves the
effective headline FIRE age LATER** when the liquid runway can't cover the bridge years. It
combines `accessibility.ts` (when/how-much each holding unlocks), `liquidation-tax.ts` (post-tax
net of selling a holding), plus bridge income streams `eps-pension.ts` (EPS) + `gratuity.ts` +
rental + NPS annuity. The headline FIRE verdict is gate-integrated, not a side card. Design SSOT:
`docs/goals/2026-06-03-accessible-money-bridge.md` + GitHub issues #13/#14/#15. `derive()` consumes
this layer.

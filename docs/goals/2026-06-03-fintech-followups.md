# Goal: FinTech-sweep follow-ups (L2 · M1 · #7 honesty bits · #10 retention · #12 seed reconciliation)

**Authored:** 2026-06-03 · **For:** the built-in `/goal` command (Abhay runs it) · **Author:** Claude.
Every design fork was resolved in the 2026-06-03 brainstorm and recorded on the GitHub issues — this
contract is zero-user-input.

> **Division of labor (rule 28):** this file is the *contract*. Abhay runs `/goal` on it; `/goal`
> executes autonomously to each phase's Definition of Done. Claude does NOT run `/goal`.

> **Decide everything against the goal + LOCKED persona** (`goal-anchored-decisions.md`, rule 30):
> the urban *salaried accumulator* whose headline number is the FIRE date; correctness/honesty is
> Tier-0. An *optimistic* error (earlier-than-real FIRE date → user under-saves) is the worst-case
> failure — fix it regardless of size.

## Context
The 2026-06-02 FinTech sweep + the 2026-06-03 brainstorm produced these **decided** follow-ups.
Already DONE (out of scope): **#11** (critical SIP double-count in the projection — fixed+closed,
`3a6d2b0`) and the partial Sharmas expense reconciliation (`89d0106`). The work below is decided;
build it. Each phase: **TDD red-first; rule-29 independent review (code-reviewer; PLUS
fintech-domain-analyst for ANY financial-math change — A2/B/C); rules 24/25/26 for UI;
conventional commits; `/post-fix-pipeline`.** Run order: A (independent) → B → C (after B) → D.

---

## Phase A — cheap honesty/correctness bits (independent, any order)

**A1 — #9 L2: coast-FIRE real-return clamp.** `src/components/.../FireMilestonesCard.vue` (~line 55)
clamps `realReturn = max(0.01, nominal − inflation)`, defeating `coast-fire.ts`'s correct
`realReturn ≤ 0 → coastCorpus = fireNumber` guard → understates the coast number for negative-real
(debt-heavy / high-inflation) cases (optimistic bias). **DoD:** remove the clamp so the true real
return flows to the library; a unit/spec lock asserting a negative-real case yields
`coast = fireNumber`; rules 24/25 on the card (renders, no console errors).

**A2 — #7 NPS annuity taxable marker** (financial-math → FinTech review). `src/lib/nps-withdrawal.ts:64-71`
returns `annuityIncomeAnnual` as a bare gross number; annuity income is **slab-taxable** each year
(the 60% lump sum is tax-free, the annuity is not). **DoD:** add an `annuityIncomeTaxable: true`
marker (or a post-tax companion field); ensure any consumer (`derive.ts` A14.2 + any UI showing
"retirement income") cannot present the annuity as net/tax-free; spec lock.

**A3 — #7 EPF-boundary doc.** Document, where EPF corpus is entered/shown
(`investment-traits.ts` accumulationRule + the relevant EPF UI hint), that **EPF corpus is
user-supplied and excludes EPS** (the engine does not derive the 3.67/8.33 split today). **DoD:**
clear in-code + UI note; no behavior change.

---

## Phase B — #9 M1: glide-path drives the projection (financial-math; changes core numbers)

Today `projectCorpus` (`src/lib/fire-math.ts`) compounds at one static `blendedReturn` for the whole
horizon; the correct `computeGlidePath`/`equityPercentAtYear` (75→40 equity taper) feeds only an
advisory nudge, never the projection — so a glide-enabled household projects its de-risked late years
at ~12% instead of ~9%, **over-stating terminal corpus → optimistically early FIRE date** (Tier-0 for
the accumulator). **DoD:**
- `projectCorpus` accepts a **per-year return** (a function `(yearIndex)=>return` or an array),
  derived from `equityPercentAtYear` blended with the per-instrument returns; `derive.ts` passes the
  household's glide when enabled, else the flat blended return (no change for non-glide households).
- **TDD red-first:** a glide-enabled household projects a LOWER terminal corpus / LATER FIRE year than
  the flat-return path; a non-glide household is byte-identical to today (no regression).
- The existing real/nominal coherence substance-lock (`derive.spec.ts`, `a2d6f2a`) stays green.
- **fintech-domain-analyst re-verifies** the new crossover years are correct; rules 24/25 on the FIRE
  screens. Re-verify all seeds (numbers shift).

---

## Phase C — #12: seed-persona reconciliation (AFTER Phase B; multi-screen)

Fixing #11 exposed the seed personas are financially over-committed (configured to invest more than
their surplus). Run AFTER M1 so the projection numbers are final. **DoD:**
- Make **all three personas** (Sharmas, Iyers, Mehtas) (a) internally **consistent** —
  `surplus (annualSavings/12) ≥ Σ(investment monthlyContribution)` — and (b) **compelling + realistic**
  accumulators (target ~40–50% savings rate, regular FIRE ~10–15 yr), by adjusting expenses / loan
  (EMI) burden / SIPs coherently per persona (the Sharmas' large EMIs currently anchor the date).
- **Add a consistency lock** (spec): for each seed, `monthlyContribution === round(annualSavings/12)`
  AND `surplus ≥ Σ(contributions)` — the invariant that would have caught the #11/#12 class.
- **App-level input guard:** flag to a live user when configured SIPs exceed their savings surplus
  ("your investments exceed your savings — review your expenses").
- **Verify across the expenses / liabilities / financial-health / FIRE screens** (rules 24/25/26 — the
  numbers move on all); fintech-domain-analyst sanity-checks the final demo figures.

---

## Phase D — #10: send-log retention purge (before A6 go-live)

DPDP data-minimization for `whatsapp_send_log` (stores recipient numbers plaintext + indexed).
**Decided: null the `toNumber` after 90 days, KEEP the anonymized row** (retains template/status/
timestamp analytics). **DoD:**
- A purge routine that sets `toNumber = ''` (and clears any other PII) on rows with `sentAt` older
  than 90 days, leaving the row; idempotent; unit-tested (>90d nulled, ≤90d untouched, row retained,
  re-run is a no-op).
- Wire it to the daily lifecycle cron (or a sibling daily cron); document the cron in `docs/DEPLOY.md`.

---

## Out of scope (deferred decisions — do NOT build)
- **#9 M2** (full corpus-bounded Guyton-Klinger) — decumulation sophistication, non-target user phase.
- **#7 accumulation engine** (EPF 3.67/8.33 split, EPS ₹1,250 cap, PPF ₹1.5L cap) — user-entered
  corpus is honest; not a FIRE-date gap (verified).
- **#10 claim-before-send** (concurrent double-send) — premature under PM2 `instances:1`.
- Flipping `WATI_ALLOW_ALL_RECIPIENTS` / A6 — Abhay's spend gate.

## Issue map
A1→#9 · A2/A3→#7 · B→#9 (M1) · C→#12 · D→#10. Close #9 after A1+B; #7 after A2+A3; #12 after C; leave
#10 open for the deferred claim-before-send after D.

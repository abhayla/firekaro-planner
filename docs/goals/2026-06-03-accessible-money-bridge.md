# Goal: the accessible-money honesty layer (#15 bridge · #14 EPS pension · #13 gratuity)

**Authored:** 2026-06-03 · **For:** the built-in `/goal` command (Abhay runs it) · **Author:** Claude.
Every design fork was resolved in the 2026-06-03 grill-me convergence with Abhay (Q1–Q7 + two
cross-cutting principles) and is recorded below — this contract is zero-user-input.

> **Division of labor (rule 28):** this file is the *contract*. Abhay runs `/goal` on it; `/goal`
> executes autonomously to each phase's Definition of Done. Claude does NOT run `/goal`.

> **Decide everything against the goal + LOCKED persona** (`goal-anchored-decisions.md`, rule 30):
> the urban *salaried accumulator* whose headline number is the FIRE date. The bug this layer fixes
> is the **worst class** for that persona — an *optimistic* FIRE date that counts locked or pre-tax
> money as spendable, making the user quit their job too early and run dry mid-retirement. Every
> fork below was resolved to the **conservative/safe direction**; build it that way.

## The problem (verified in code)
`derive.ts:245` `fireWithdrawableCorpus = totalCorpus − npsAnnuityCorpus` is the only accessibility
carve-out. It feeds **all three headline outputs** — `yearsToRegular/Lean/Fat` (the FIRE date),
`currentCorpus`, and `progressPct` (`derive.ts:329-363`). So locked EPF/VPF/PPF/NPS-lump and
*pre-tax* asset values currently count toward "you're FIRE-ready at 50" as if spendable in cash at
the FIRE age. The `liquidity()` classifier in `investment-traits.ts` exists but is **unused** in the
FIRE math. Primary-residence real estate is already excluded (`derive.ts:213`). The NPS annuity is
already post-tax (Phase A2, commit `25e21ed`).

## Two cross-cutting principles (apply in EVERY phase)
1. **Assumption transparency.** Wherever the engine falls back to an assumption (missing date/field)
   OR picks a default among real alternatives, the UI must surface: *(a) what I assumed, (b) why
   (the field you didn't fill / the rule that applies), (c) how it changes your FIRE goal,* and *(d)
   a one-tap way to correct it.* Emit a structured `assumptions: AssumptionNote[]` from `derive()`
   so the UI renders it uniformly. (Q3, Q5.)
2. **Post-tax spendable.** "Reachable money" is **net of the tax owed on liquidating it**, never the
   gross market value. (Q4.) Same honesty principle as the NPS-annuity post-tax fix, extended to
   every withdrawal.

Run order: A → B → C → (D, E independent) → F. Each phase: **TDD red-first; rule-29 independent
review — `code-reviewer` always, PLUS `fintech-domain-analyst` for ANY financial-math change
(A/B/C/D/E); rules 24/25/26 for UI (F); conventional commits; `/post-fix-pipeline`.** Re-verify all
three seed personas wherever headline numbers move.

---

## Phase A — accessibility classifier (pure lib; foundation, no behaviour change yet)
Add `accessibleAtAge(asset, retirementAge, memberDob)` (extend `investment-traits.ts` or a new
`src/lib/accessibility.ts`) → `{ unlockAge, accessibleLumpGross, incomeStream?, assumption? }`:
- **Liquid** (Stocks, MutualFunds, FD, Gold, REIT, Crypto, International, vested ESOP) → unlock at the FIRE age.
- **EPF/VPF** → FIRE age (accessible on job exit; current law — withdrawable after ~2mo unemployment).
- **PPF** → `openingYear + 15` if `openingYear` present; **else locked until age 60** (Q3) + an `assumption` note ("PPF open year not set → assumed locked till 60; add it for a usually-earlier unlock").
- **NPS** → at/after 60: 60% lump / 40% annuity. **If `retirementAge < 60`: early-exit 20% lump / 80% annuity** (corpus > ₹2.5L; ≤₹2.5L full lump) (Q5). The annuitised slice is an `incomeStream` starting at the FIRE age. Emit an `assumption` note exposing BOTH options ("touching NPS now → 20% cash; waiting till 60 → 60% — selected: early-exit (your retirement age)").
- **RealEstate** PrimaryResidence → already excluded from corpus (no-op); Investment/Inherited → `illiquid` (NOT in the bridge runway) (Q4).

**DoD:** pure fn + colocated spec covering every instrument branch + the PPF-blank fallback + the
NPS-early-exit-vs-60 split + the assumption-note emission. No change to `derive()` yet.

## Phase B — post-tax liquidation (the second principle, pure lib)
Add `postTaxLiquidation(asset, grossProceeds, context)` → net in-hand after liquidation tax, reusing
`tax.ts` / `esop-tax.ts`:
- **Tax-free on withdrawal** (current law): EPF (≥5yr service), PPF maturity, NPS lump (60% normal / 20% early).
- **LTCG-taxed**: equity & equity MF → 12.5% over the ₹1.25L/yr exemption; property, gold, debt, international → per current post-Budget-2024 law. Where **cost basis is unknown** (e.g. `value` is market value, no purchase price), apply a conservative LTCG approximation on a documented basis and emit an `assumption` note (principle 1). NPS annuity stays slab-taxed (already done — do not double-count).
- **CII-indexed LTCG is NOT modelled** (gh-issue #6) — use the flat post-Budget-2024 rates; note it.

**DoD:** pure fn + spec; tax-free instruments pass through unchanged; taxable instruments haircut on
the gain; unknown-cost-basis path is conservative + disclosed.

## Phase C — bridge coverage + headline integration (CORE; financial-math, changes the headline)
In `derive.ts`, build on A+B:
- Compute **reachable (post-tax) corpus** at the FIRE age and a **year-by-year bridge check** from the FIRE age to each unlock age, crediting **bridge income**: rental income (existing `otherIncome` Rental), the NPS early-exit pension (A), and the EPS pension (Phase D, from 58).
- **Redefine FIRE-ready / `yearsToRegular`** = years until **(total corpus ≥ FIRE number) AND (liquid bridge covered every year)**. A short bridge therefore **moves the headline FIRE age later** (Q1 + Q7a). Keep the corpus-only age available as a sub-line ("target reached at 50; sustainable from 53 due to locked money").
- Emit `bridgeCoverage: { covered, effectiveFireAge, shortfallYears, shortfallAmount, reachableCorpus, lockedCorpus, unlockTimeline[], assumptions[] }`.

**DoD — TDD red-first:**
- A locked-heavy early-retiree (e.g. large PPF/NPS, retire < 60) projects a **LATER `effectiveFireAge`** than the corpus-only path.
- A fully-liquid household is **byte-identical** to today (no regression) — lock it.
- The existing real/nominal + glide substance locks stay green.
- `fintech-domain-analyst` re-verifies the bridge arithmetic + the unlock ages against current law; rules 24/25 on the FIRE screens. Re-verify all three seeds (numbers move).

## Phase D — #14 EPS pension as a post-retirement income stream (financial-math)
Model the EPS pension (EPF 8.33% employer share): monthly pension ≈ `pensionable salary × pensionable
service / 70`, pensionable-salary-capped per current EPS rules, **starting at 58** (reduced early
pension from 50 — model the standard 58 start for MVP, note the early option). Derive pensionable
service/salary from existing member salary + age; **disclose the assumptions** (principle 1). Feed it
as **bridge income from 58** (helps cover the 58→later span) and as ongoing post-FIRE income.

**DoD:** pure calc + spec; wired into the Phase C bridge income; transparency note on assumed
pensionable service/salary; closes the #14 "EPS not modelled" gap.

## Phase E — #13 gratuity + exit benefits (financial-math)
Model gratuity (`15/26 × last drawn basic × completed years of service`, ₹20L tax-free cap) +
optional leave encashment as a **cash lump received AT job exit** — accessible (post-tax) corpus at
the FIRE age (the opposite-direction error: money the app currently misses). Derive years-of-service
from employment data where available, else assume + disclose (principle 1).

**DoD:** pure calc + spec; adds to the reachable corpus at the FIRE age in Phase C; tenure assumption
disclosed; closes the #13 gap.

## Phase F — UI: honest headline + bridge breakdown card (rules 24/25/26)
- **FireHero / headline**: show the bridge-adjusted **effective FIRE age** (Q7a) with the corpus-only age as a sub-line.
- **Bridge Breakdown card**: reachable vs locked money, the **unlock timeline**, the **liquid runway** vs bridge years, any **shortfall (₹ + years)**, and — rendered uniformly from `bridgeCoverage.assumptions[]` — every transparency disclosure (PPF assumption, NPS both-options, investment-property illiquid + rent-counts, post-tax haircuts, gratuity/EPS assumptions), each with its one-tap "fix this field" affordance (principle 1).

**DoD:** rules 24/25/26 across the FIRE + dashboard screens; the assumption-transparency UI renders
for a household that triggers each fallback; no console errors; cross-page consumers re-verified.

---

## Out of scope (do NOT build)
- An optional **"I'll sell this property at FIRE"** flag that moves investment real estate into the bridge as a lump — progressive enhancement, later (Q4 default is illiquid).
- **New mandatory onboarding inputs** — Q2 locked auto-derive; only optional *hints* are allowed.
- **CII-indexed LTCG** precision (gh-issue #6) — use flat post-Budget-2024 rates + disclose.
- **Full Monte-Carlo / SORR bridge** — the deterministic year-by-year coverage check is the MVP.
- Early-EPS-pension-from-50 modelling — note the option; model the standard 58 start.

## Issue map
A+B+C → #15 (bridge core) · D → #14 (EPS pension) · E → #13 (gratuity). Close #15/#14/#13 after F
with commit-referenced comments. The two cross-cutting principles + the conservative-default stance
are the acceptance lens for every phase.

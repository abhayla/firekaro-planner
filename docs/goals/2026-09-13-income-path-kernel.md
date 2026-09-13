# Goal: Banded income path in the FIRE kernel (replaces the savings step-up proxy)

**Status:** SPEC ONLY — parked 2026-09-13 for token budget. Nothing below is started.
**Owner decision:** Abhay, 2026-09-13 (D-2026-09-13-02/03/04 in `docs/PROJECT-LOG.md`).
**Tracking issue:** gh #185 (label `must-have`).
**Tier:** must-have (Tier-0 honesty for the LOCKED persona).
**Read first:** `CLAUDE.md` → Goal; `docs/v6-fire-planner-product-plan.md` §9; `docs/adr/0004-temporal-contribution-model.md`; `docs/adr/0006-*` (real frame); `src/lib/derive.ts`; `src/lib/fire-math.ts`; `src/types/assumptions.ts`.

---

## 1. Why (the defect, stated as a class)

**RCA (one sentence):** the kernel never grows the user's *income*; it grows the *savings* by a 2 %/yr
real step-up (`householdSavingsStepUpPercent`, tapering to 0 at age 50), so any household whose surplus
is small today has its future surplus understated by roughly the ratio income ÷ surplus.

**Class (data filter):** every household where `income − expenses` is small relative to income, i.e. the
whole lower-middle / middle band the persona now includes (₹2.5L–₹10L household income, age 20–35 most
of all). Rows before AND after the fix: all persisted households; the four seeds (₹42L+) move a little,
low-band users move a lot.

**Verified facts (2026-09-13):**
- `salary.hikePercent` (per earner, `src/types/household.ts`) is stored and shown on the Income pages
  (`EarnerSalaryForm.vue`, `income/Salary.vue`, `income/Overview.vue`) but is **never read by
  `derive.ts` or `fire-math.ts`**. `quick-number.ts` writes `hikePercent: 0`.
- The only growth term in the kernel is `householdSavingsStepUpPercent` (default 2, max 15, real frame,
  `STEP_UP_TAPER_AGE` = 50 in `derive.ts`). ADR-0006 comments already admit "lifestyle creep absorbs
  part of every raise" but there is no creep knob.
- `otherIncomeLineSchema` has no start date; types are Rental / Dividend / Interest / CapitalGains / Other.
- All 8 levers in `lever-catalog.ts` are savings- or tax-side. Every nudge in `nudge-engine.ts` is
  affluent-oriented (NPS cap, international allocation, estate gaps, real-estate overweight).
- Lowest seeded household income is ≈ ₹42L. `headline-plausibility.spec.ts` asserts savings rate
  15–70 % and FIRE age ≤ 70 on those seeds only. No test contains a low-band household.
- New-regime income tax is zero up to ₹12L (FY 2025-26 config in `src/lib/tax.ts`).

## 2. Worked example (the acceptance fixture — "Ravi")

Ravi, age 22, salary ₹3.0L, expenses ₹2.5L, saves ₹0.5L in year 0. Inflation 6 %, nominal return 12 %
(≈ 5.7 % real), SWR 3.5 %, growth stops at 50. FIRE number = that year's expenses ÷ 3.5 % (it inflates).
Actual rupees:

| Path | Salary growth | Expense growth | FIRE age |
|---|---|---|---|
| **Today's kernel** (savings +2 % real, salary flat) | — | inflation | **58** |
| **Conservative band** (headline) | +8 % nominal (≈2 % real) | +6 % (inflation) | **51** |
| **Expected band** (Ravi's own "12 % hikes") | +12 % | +6 % | **42** |
| Expected + lifestyle creep | +12 % | +8 % | 47 |
| Salary only matches inflation | +6 % | +6 % | never |

Conservative band, year by year (actual rupees):

| Yr | Age | Salary | Expenses | Saved | Corpus (start) | FIRE number | Reached |
|---|---|---|---|---|---|---|---|
| 0 | 22 | 3.0L | 2.5L | 0.5L | 0 | 71.4L | |
| 10 | 32 | 6.5L | 4.5L | 2.0L | 16.2L | 1.28Cr | |
| 20 | 42 | 14.0L | 8.0L | 6.0L | 1.06Cr | 2.29Cr | |
| 27 | 49 | 24.0L | 12.1L | 11.9L | 3.13Cr | 3.44Cr | |
| 29 | 51 | 24.0L | 13.5L | 10.4L | 4.17Cr | 3.87Cr | YES |

Row rule: `corpus_next = corpus × (1 + r) + saved`, `saved = salary − expenses`. Note year 29: salary
stopped at 50, expenses keep inflating, savings fall. That is the taper working.

**The point:** same 2 % growth rate as today's kernel, applied to the salary instead of the savings,
moves Ravi from 58 to 51. Applying 2 % to ₹50k is ₹1k/yr; applying it to ₹3L is ₹6k/yr, and every rupee
of it is surplus because expenses only track inflation.

## 3. Product rules (locked by Abhay 2026-09-13)

1. **A low income today is a starting point, never a verdict.** The plan must show how income growth
   and new income sources reach FIRE. A bare "not reachable" is a product defect.
2. **The headline uses the conservative band only.** The user's own hike % moves the *second* number
   ("FIRE at 51, or 42 if your 12 % hikes continue"), never the headline. Optimistic error for the
   target user stays Tier-0.
3. **Everything is configurable, per user, with research defaults:** salary growth per earner, own
   expected hike per earner, growth-stop age, expense growth above inflation (lifestyle creep), and
   optionally a growth schedule by age band. Every knob is also a non-persisting What-If lever via the
   existing scenario layer.
4. **Decision support, not advice.** "Raise income" / "add a side income" are levers, not product
   recommendations.

## 4. Design

### 4.1 Assumption layer (`src/types/assumptions.ts`, resolved scenario → household → global)

| New field | Type / bounds | Default | Notes |
|---|---|---|---|
| `salaryGrowthRealPercent` | number 0–10 | **research default, source REQUIRED (open fact §7)** | household-level fallback when an earner has no own value |
| `salaryGrowthTaperAge` | number 40–65 | 50 | replaces the hard-coded `STEP_UP_TAPER_AGE` |
| `expenseGrowthAboveInflationPercent` | number 0–5 | **small positive, source REQUIRED** | lifestyle creep; applied to the *discretionary* buckets only if the 4-bucket model allows, else to all |
| `householdSavingsStepUpPercent` | (existing) | 2 | **retired** from the headline path; keep the field for hydrate compatibility, mark deprecated, migrate stored non-zero values into `salaryGrowthRealPercent` once (gated on `assumptionsMigratedV`, same pattern as ADR-0006) |

### 4.2 Per-earner income path (`src/types/household.ts`)

- `salary.hikePercent` (existing, nominal, user-typed) → becomes **live**: feeds the **expected** band
  as `hikePercent − inflation`, capped at 15 real, tapering at `salaryGrowthTaperAge`.
- Optional `salary.growthSchedule?: IncomeGrowthSegment[]` — **reuse the ADR-0004 age-relative segment
  shape** (`fromAge`, `toAge`, `realPercentPerYear`). One rate is the simple case; a schedule is the
  "Advanced: vary by age" case. Same data shape, no later migration. This is how "adjust the hike every
  year" works without a 40-row form.

### 4.3 Kernel (`src/lib/derive.ts`, `src/lib/fire-math.ts`, `src/lib/contribution-schedule.ts`)

- Build an `IncomeSchedule` per earner (real frame, like `ContributionSchedule`): `income(t) = income(0)
  × Π(1 + g_t)`, `g_t` from the schedule / earner rate / household default, 0 after taper age.
- Expenses: `expenses(t) = expenses(0) × (1 + creep)^t` in real frame (creep is *above* inflation; the
  4-bucket inflation model stays as is).
- **Surplus(t) = income(t) − expenses(t) − fixed outflows(t)** replaces `surplus(0) × step-up^t`.
  Existing per-investment `contributionSchedule` (display-only today) is untouched by this goal.
- Two runs of the kernel per derive: **conservative** (defaults) and **expected** (earner hike %).
  Expose both: `householdFireAge` stays the conservative headline; add `expectedFireAge` +
  `expectedFireAgeBasis` (the hike % used). Monte-Carlo bands wrap the conservative run as today.
- Taper stays. After taper age, real income is flat and creep keeps eating surplus — intended.
- **Golden master will move for all four seeds** (`headline-golden-master.spec.ts.snap`). Re-baseline is
  an explicit, reviewed step with the before/after ages listed in the PR body (pattern: ADR-0006 PR).

### 4.4 UI

- Income page: the hike % field gets a helper line "used for your *expected* FIRE age; the headline
  uses a conservative default" + an "Advanced: vary by age" expander (segments).
- Preferences: `salaryGrowthRealPercent`, `salaryGrowthTaperAge`, `expenseGrowthAboveInflationPercent`
  with the research-default badge + "why" tooltip, deep-link `#pref-section-income-path`.
- Dashboard headline copy: "FIRE at **51** · 42 if your 12 % hikes continue" (second number only when an
  earner has a hike % > 0). What-If sliders for the three knobs via the existing scenario store.
- Screen standard: follow `SCREEN-STANDARD.md`; update it in the same change.

### 4.5 Test instruments (must land BEFORE the kernel change)

- **Seeds:** `src/seeds/ravi.ts` (single, 22, ₹3L CTC, ₹2.5L expenses, no assets, EPF on) and
  `src/seeds/sharma-jr.ts` or similar (family, ₹8L, one child, small SIP). Register in `src/seeds/index.ts`
  and the seed switcher (demo-only, `isServerMode()` gate).
- **Per-seed plausibility bounds** in `headline-plausibility.spec.ts` (replace the global 15–70 %
  savings-rate fence with per-seed ranges):

| Check on Ravi | Range |
|---|---|
| savings rate | 10–25 % |
| conservative FIRE age | 45–55 |
| expected FIRE age (12 %) | 36–46 |
| expected < conservative | always |
| corpus finite, ≥ 0 | always |

- Golden-master rows for both new seeds. `kernel-invariants.property.spec.ts`: add "income monotonicity"
  (higher growth ⇒ FIRE not later) and "creep monotonicity" (higher creep ⇒ FIRE not earlier).
- **These specs fail on today's kernel on purpose** (red-first), proving the defect before the fix.

## 5. Build steps (each needs Abhay's separate approval — first-principles skill rule)

| # | Step | Tier / model | Budget | Reversible |
|---|---|---|---|---|
| 1 | Record decision (DONE 2026-09-13: this spec, PROJECT-LOG D-2026-09-13-04, §9, CLAUDE.md) | C | — | yes |
| 2 | ADR-0007 "income path replaces step-up proxy" + cite the two research defaults (§7) | C, Sonnet | 30 min | yes |
| 3 | Seeds + per-seed bounds + property invariants (§4.5), red on main | B, Sonnet | 30 min / 60 calls | yes |
| 4 | Kernel (§4.1–4.3) + golden-master re-baseline; FinTech ∥ independent code review; mutation run on `fire-math`/`derive` | **A, Opus** (Why Opus: multi-file kernel change, fuzzy boundaries with ADR-0004/0006) | 60 min / 120 calls + reviewer 20/40 ×2 | code yes; every headline changes |
| 5 | UI knobs + headline copy + What-If wiring (§4.4); rules 24/25/26/32 + member-lens sweep | B, Sonnet | 30 min / 60 calls | yes |
| 6 | Start-dated income lines: `startAge?`, new types `Freelance` / `SideBusiness` / `SecondJob`; Prisma migration + `household-diff` + `household-repo` + server Zod parity spec | **A, Opus** | 60 min | **no** once prod rows exist |
| 7 | Income-side levers in `lever-catalog.ts` ("raise income X %", "add ₹Y/month side income from age Z"); first-mile nudges (emergency fund, term/health cover, first SIP); tax section collapses to "you pay zero tax" below ₹12L | B, Sonnet | 30 min each | yes |
| 8 | Re-tier the 43 open `must-have` issues against the new persona (catalog features → good/nice-to-have) | C | 20 min | yes |

Order is fixed: 3 before 4 (no proof without Ravi in the tests); 6 after 4 (schema is the only
irreversible step, do it on a proven kernel). Steps 1–5 ≈ 400–600k tokens incl. reviews.

## 6. Acceptance (the whole goal is DONE when)

- Ravi seed: conservative FIRE age in 45–55, expected in 36–46, on the DEFAULT lens
  (`isFamilyView:false`, `viewingMemberId:null`).
- Four existing seeds: headline ages move by a reviewed, listed delta; FinTech signs off the end-to-end
  numbers, not just the formula.
- Stryker: no surviving mutant in the new income-schedule arithmetic.
- Changing `hikePercent` on the Income page changes the *second* number and never the headline (E2E).
- Preferences knobs persist through `ServerAdapter` (rule 25: PUT 2xx + independent GET) and survive
  hydrate; server Zod strip-mode parity spec covers every new field (the ADR-0006 class).
- Member-lens sweep green on every route (`member-landscape-verification.md`).
- `No detection change` is NOT acceptable: the per-seed bounds + property invariants ARE the detection
  upgrade; name them in the PR body.

## 7. Open facts (must be settled inside step 2, before any kernel code)

1. **Conservative real salary-growth default for Indian lower-middle salaried earners, by age.** Needs a
   cited source (e.g. PLFS wage data, Aon/Mercer salary-increase surveys net of CPI). Without it the
   headline rests on an invented number — a Tier-0 honesty problem. If the sourced figure is ≈ 0 real,
   the income path collapses to today's proxy and step 4 shrinks to "make hikePercent feed the expected
   band only".
2. **Lifestyle-creep default.** Source or an explicit "assumption, unsourced, 1 %" disclosed in the
   Preferences tooltip.
3. Whether creep applies to all expense buckets or only discretionary ones (depends on the 4-bucket
   model's shape in `derive.ts`).

## 8. Explicitly NOT in this goal

- Hindi / regional UI (in scope for the persona, sequenced after this).
- Form 16 / CAS import as the setup story for the low band (killed for this band; five questions is the
  setup).
- Per-investment `contributionSchedule` feeding the headline (gh #46, separate).
- Any catalog feature currently mislabelled must-have (#97–#146 range).

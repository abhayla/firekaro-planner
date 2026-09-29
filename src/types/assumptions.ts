import { z } from "zod";

/**
 * Single source of the `salaryGrowthRealPercent` upper bound — used by the schema below AND by
 * `lever-catalog.ts`'s `raise-income` lever, so the lever can never ask the store to resolve a
 * value the schema itself would reject (gh #185 step 7 review — was duplicated as a magic `10`).
 */
export const SALARY_GROWTH_REAL_PERCENT_MAX = 10;

export const assumptionsSchema = z.object({
  // `inflation` is the GENERAL bucket (audit Entry #3). The household blend is
  // computed from the four buckets below via lib/fire-math.blendedInflation().
  inflation: z.number().min(0).max(0.25),
  equityReturn: z.number().min(0).max(0.5),
  debtReturn: z.number().min(0).max(0.5),
  realEstateReturn: z.number().min(0).max(0.5),
  goldReturn: z.number().min(0).max(0.5),
  npsReturn: z.number().min(0).max(0.5),
  ppfReturn: z.number().min(0).max(0.5),
  epfReturn: z.number().min(0).max(0.5),
  // Per-type returns for the v5 instrument types (audit Entry #4 / #18 / #20).
  // Previously collapsed into the debt-like "other" bucket; now first-class so
  // their corrected rates reach the portfolio blend (B-3).
  internationalReturn: z.number().min(0).max(0.5).default(0.1),
  reitReturn: z.number().min(0).max(0.5).default(0.08),
  cryptoReturn: z.number().min(0).max(0.5).default(0),
  healthcareInflation: z.number().min(0).max(0.5),
  // 4-bucket inflation (audit Entry #3 A3.1) — education + housing buckets.
  educationInflation: z.number().min(0).max(0.5),
  housingInflation: z.number().min(0).max(0.5),
  // 4-bucket inflation WEIGHTS (audit Entry #3 A3.2) — household blend weighting,
  // editable on /preferences §Inflation. Stored as percentages (default 74/8/0/18 —
  // ADR-0006; was 60/20/10/10). blendedInflation() normalizes by their sum, so they need not
  // sum to exactly 100, but the UI validates to 100 for clarity.
  // The weights MUST stay DISJOINT shares of the household budget: `general` is the ALL-ITEMS
  // CPI, which already CONTAINS health, education and housing, so any weight given to those
  // three double-counts them out of the general slice (FinTech CRITICAL-1).
  inflationWeights: z
    .object({
      general: z.number().min(0).max(100),
      healthcare: z.number().min(0).max(100),
      education: z.number().min(0).max(100),
      housing: z.number().min(0).max(100),
    })
    .default({ general: 74, healthcare: 8, education: 0, housing: 18 }),
  swrOverride: z.number().min(0.01).max(0.1).optional(),
  // FIRE variant multipliers (audit Entry #2 A2.4) — Lean/Fat as a fraction of
  // the Regular target. Regular is always 1.0 (the headline). Editable on
  // /preferences §Variants.
  leanMultiplier: z.number().min(0.3).max(1).default(0.6),
  fatMultiplier: z.number().min(1).max(3).default(1.5),
  // Withdrawal rule (audit Entry #9 A9.1). Constant = the v4-faithful pure
  // accumulation projection. FloorCeiling = overlays a post-retirement
  // decumulation phase using the research-grounded floor/ceiling band.
  withdrawalRule: z.enum(["Constant", "FloorCeiling"]).default("Constant"),
  // Temporal Phase 1 (gh-issue #46) — a REAL household-savings step-up: the rate (%/yr,
  // above inflation) at which the household's monthly savings residual (the SINGLE corpus
  // inflow, gh #11) is planned to grow. Clamped ≤15%/yr (an implausibly high real step-up
  // would optimistically pull the FIRE date in). REAL terms — a step-up here is growth NET of
  // general inflation, on top of the CPI-tracking baseline the kernel already gives every
  // contribution (ADR-0004 semantics, preserved by ADR-0006's nominal frame).
  //
  // ADR-0006: default 0 → 2. A flat real contribution for 25–40 years asserts ZERO real wage
  // growth for a salaried accumulator, which is the matched PESSIMISM to the old inflated
  // expense basket (FinTech MEDIUM-10).
  //
  // GROUNDING. Aon's India Salary Increase Survey has reported nominal increments of ~9.0–9.5%
  // p.a. across 2023–2025 against RBI/CPI headline inflation of ~5–6%, i.e. a REAL salary-growth
  // band of roughly 3–4% for the organised urban salaried workforce this product serves. The
  // default is deliberately set BELOW that band, at 2, for three reasons: (a) an increment survey
  // measures the average increase GIVEN to a continuing employee at surveyed firms, which is a
  // survivorship-biased upper bound on a household's lifetime path; (b) the SAVINGS residual is
  // what steps up here, not salary, and lifestyle creep absorbs part of every raise; (c) an
  // over-stated step-up pulls the FIRE date in, which is the optimistic direction and Tier-0 for
  // this persona. `derive.ts` additionally TAPERS it to 0 at age 50 (`STEP_UP_TAPER_AGE`) —
  // Indian salaried real wage growth flattens well before retirement, so no plan compounds a
  // promotion curve into a household's sixties.
  //
  // On hydrate a stored value of exactly 0 (the pre-ADR-0006 default) is treated as UNSET and
  // takes the new default — ONCE, gated on the `assumptionsMigratedV` stamp
  // (`src/stores/assumptions.ts`), so a 0 the user deliberately sets in /preferences survives
  // every later reload.
  // ADR-0007 / gh #185 step 4: DEPRECATED from the HEADLINE path. The kernel now grows each
  // earner's INCOME (`salaryGrowthRealPercent` below) and lets the savings residual fall out year
  // by year, which is the honest model for a household whose surplus is small relative to income
  // (a 2% step-up on a Rs 50k surplus is Rs 1k/yr; 2% on a Rs 3L income is Rs 6k/yr, and nearly
  // every rupee of income growth is surplus). The FIELD IS KEPT for hydrate/round-trip
  // compatibility (every persisted document carries it, the server's strip-mode Zod reads it, and
  // the `assumptionsMigratedV` ADR-0006 migration still writes it) and it is still read by the
  // What-If / lever surfaces that model "save more each year" as an explicit plan action
  // (`lever-catalog.ts`, `lever-impact.ts`, `useAcceleration.ts`). It NO LONGER feeds
  // `derive()`'s headline corpus inflow.
  householdSavingsStepUpPercent: z.number().min(0).max(15).default(0),

  // ===== ADR-0007 / gh #185 — the income path (replaces the savings step-up proxy) =====
  /**
   * CONSERVATIVE real (net-of-general-CPI) salary growth per year, per earner, used for the
   * HEADLINE FIRE date. 2% is a deliberately conservative FLOOR on an individual incumbent's
   * age-earnings path: an individual's path is steeply positive even when the PLFS population
   * aggregate is ~0% real, and 2% sits BELOW every individual-path estimate found (Aon ~3-4% real
   * for corporates; 8-15% nominal fresher first-appraisal hikes). It is NOT a midpoint of two
   * series and NOT a measured population figure. Mandatory caveat wherever this is surfaced:
   * "assumes continuous employment; real wage growth for this band was ~0% in FY22-24".
   * Full basis + sources: `docs/adr/0007-income-path-replaces-step-up-proxy.md` (a).
   *
   * The user's OWN `salary.hikePercent` never moves the headline — it drives the second,
   * "expected" number only (spec §3.2), because an optimistic headline makes this persona
   * UNDER-SAVE (Tier-0).
   */
  salaryGrowthRealPercent: z.number().min(0).max(SALARY_GROWTH_REAL_PERCENT_MAX).default(2),
  /**
   * The age at which real salary growth stops compounding. Real income then HOLDS flat (it never
   * drops) while expenses keep rising, so the surplus falls — intended, and the reason a plan
   * never compounds a promotion curve into a household's sixties. Replaces the hard-coded
   * `STEP_UP_TAPER_AGE = 50` in `derive.ts`.
   */
  salaryGrowthTaperAge: z.number().min(40).max(65).default(50),
  /**
   * Lifestyle creep: expense growth ABOVE price inflation, in percentage points per year.
   *
   * **UNSOURCED ASSUMPTION, not a research figure** — no India-specific quantified study was
   * found (ADR-0007 (b)); the Preferences tooltip MUST say so verbatim. Applied to the
   * **`general` inflation bucket ONLY** (ADR-0007 (c)): healthcare/education/housing are
   * non-volitional PRICE indices already set above general CPI, so adding a behavioural creep
   * term on top of them would double-count the same escalation. Folded into the ONE household
   * basket, so it grows the FIRE target as well as the expense line (ADR-0007 (d)) — creep is a
   * permanent lifestyle ratchet and the corpus must fund the crept level.
   *
   * **DEFAULT IS 0, and that is a Tier-0 honesty decision, not laziness (ADR-0007 (g)).** Measured
   * at the moment creep was correctly wired to BOTH legs: 1%/yr costs sharmas +2.8y, mehtas +1.0y,
   * iyers +2.8y, ravi +7.0y and mauryas +7.0y — pushing mauryas to age 75.1, past the #22 age-70
   * plausibility ceiling. An UNSOURCED term must not be the single largest lever in a model whose
   * SOURCED income-growth default (2% real) moves the same seeds by less. So the knob ships fully
   * functional, fully disclosed, and OFF: a user or a future sourced revision turns it on
   * deliberately. Shipping it at 1% would have made the headline rest on a guess.
   */
  expenseGrowthAboveInflationPercent: z.number().min(0).max(5).default(0),
  // #81 Phase 2 — the unified "household split" %: the share of SHARED costs/assets (ring-2
  // expenses + "Joint" corpus/debt + joint income streams) attributed to EACH adult when
  // computing that adult's STANDALONE individual FIRE. Default 50 (a two-adult 50/50 split).
  // DISPLAY-only for the per-adult individual view — it NEVER touches the household FIRE number
  // (the primary, decision-driving figure). Clamped 0–100. With N adults a single % is an
  // intentional simplification (each adult bears `split%` of shared); the household − Σ(adults)
  // gap surfaces whatever is unsplit (dependents + remainder).
  householdSplitPercent: z.number().min(0).max(100).default(50),
  /**
   * ADR-0006 Phase 1b — the one-shot migration STAMP for this document.
   *
   * `src/stores/assumptions.ts` needs to lift a stored `householdSavingsStepUpPercent` of exactly
   * 0 (the pre-ADR-0006 default) to the new default of 2. Phase 1 did that by SNIFFING THE VALUE
   * on every hydrate, which meant a user who deliberately chose 0 in /preferences got 2 back on
   * the next reload — a setting the product would not let them keep. A version stamp is the field
   * the store previously "had no way to distinguish choice from default" with: the migration runs
   * only while the stamp is absent, writes the stamp, and never runs again.
   *
   * Optional on purpose — every document persisted before this change lacks it, and that ABSENCE
   * is precisely the signal that the migration has not run. Declared here (rather than kept out of
   * the schema) so the server's shared strip-mode Zod keeps it on the round-trip.
   */
  assumptionsMigratedV: z.number().int().min(0).optional(),
});

export type Assumptions = z.infer<typeof assumptionsSchema>;

// Research-grounded defaults (audit Entries #3 + #4, ratified 2026-05-28).
// Inflation buckets: general 6% · healthcare 9% · education 9% · housing 6%
// Weights 74/8/0/18 (disjoint urban-household shares) ⇒ household basket ≈ 6.24%, i.e. a real
// target drift of (1.0624/1.06 − 1) ≈ 0.23%/yr over general CPI (ADR-0006, 2026-08-27).
//
// healthcareInflation 14% → 9%: CPI-Health runs ~4–7%; the private-tariff + retiree-mix excess
// adds ~3–4 pp. The 13–14% Aon/Marsh figure that used to sit here is an insurer CLAIMS-COST
// TREND (utilisation + mix + price), not a price index, and it belongs to the insurance PREMIUM
// line — which already auto-flows into `expenses.recurring` and is capitalised into the FIRE
// number. Held flat at 20% weight it drove healthcare to ~58% of the basket by year 25, which
// contradicts the fixed weights it was applied through (FinTech HIGH-3).
//
// education weight 20% → 0% in the PERPETUAL retirement basket: education spending ENDS. It is
// already funded as finite lump-sum goals via the family layer (fire-math.calculateFamilyLayerCorpus
// + adequacy.ts), which STILL inflates them at `educationInflation` (9%, unchanged). Carrying it in
// the perpetual basket as well was a straight double-count (ADR-0006 open question 2).
// (Ch 02 §2.2) → household blend ≈ 6.24% at the ADR-0006 74/8/0/18 weights. (It was 7.9% at the
// retired, NON-DISJOINT 60/20/10/10 weights with a 14% healthcare rate — that figure is history,
// not a target, and must not be quoted as the live basket anywhere.)
// Returns: equity 12% · gold 7% · real estate 6% (audit Entry #4 A4.1).
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  inflation: 0.06,
  equityReturn: 0.12,
  debtReturn: 0.07,
  realEstateReturn: 0.06,
  goldReturn: 0.07,
  npsReturn: 0.1,
  ppfReturn: 0.071,
  epfReturn: 0.0825,
  internationalReturn: 0.1,
  reitReturn: 0.08,
  cryptoReturn: 0,
  healthcareInflation: 0.09,
  educationInflation: 0.09,
  housingInflation: 0.06,
  inflationWeights: { general: 74, healthcare: 8, education: 0, housing: 18 },
  leanMultiplier: 0.6,
  fatMultiplier: 1.5,
  withdrawalRule: "Constant",
  householdSavingsStepUpPercent: 0,
  salaryGrowthRealPercent: 2,
  salaryGrowthTaperAge: 50,
  expenseGrowthAboveInflationPercent: 0,
  householdSplitPercent: 50,
};

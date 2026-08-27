import { z } from "zod";

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
  // expense basket (FinTech MEDIUM-10; Aon India salary growth ≈ 3–4% real). 2 is deliberately
  // BELOW that band, and `derive.ts` TAPERS it to 0 at age 50 (`STEP_UP_TAPER_AGE`) so no plan
  // compounds a promotion curve into a household's sixties. On hydrate a stored value of exactly
  // 0 (the pre-ADR-0006 default) is treated as UNSET and takes the new default —
  // `src/stores/assumptions.ts`; a deliberate 0 is re-settable in /preferences.
  householdSavingsStepUpPercent: z.number().min(0).max(15).default(2),
  // #81 Phase 2 — the unified "household split" %: the share of SHARED costs/assets (ring-2
  // expenses + "Joint" corpus/debt + joint income streams) attributed to EACH adult when
  // computing that adult's STANDALONE individual FIRE. Default 50 (a two-adult 50/50 split).
  // DISPLAY-only for the per-adult individual view — it NEVER touches the household FIRE number
  // (the primary, decision-driving figure). Clamped 0–100. With N adults a single % is an
  // intentional simplification (each adult bears `split%` of shared); the household − Σ(adults)
  // gap surfaces whatever is unsplit (dependents + remainder).
  householdSplitPercent: z.number().min(0).max(100).default(50),
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
// (Ch 02 §2.2) → household blend ≈ 7.9% at 60/20/10/10 weights.
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
  householdSavingsStepUpPercent: 2,
  householdSplitPercent: 50,
};

// Ported from server/lib/calculations/fire-metrics.ts + fire-projections.ts
// Pure functions, no server deps.

import { floorCeilingWithdrawal, type FloorCeilingWithdrawalConfig } from "@/lib/withdrawal-strategy";

// India SWR — deliberately conservative (3.5% vs the US 4% rule). Per ADR-0003, realized
// capital-gains / withdrawal taxation is NOT modelled per-transaction (that is tax-tracker
// scope, not FIRE-planner scope); the post-tax sustainability headroom is absorbed into this
// SWR. Keep this in mind before treating the FIRE number as a strictly pre-tax target.
export const INDIA_SWR = 0.035;
export const INDIA_INFLATION = 0.06;
// NB: the LIVE healthcare-inflation default is 14% (`DEFAULT_ASSUMPTIONS.healthcareInflation`
// in types/assumptions.ts) — research-grounded for Indian medical inflation. The old 8%
// `INDIA_HEALTHCARE_INFLATION` constant was stale + dead (no importers) and is removed to
// avoid a future editor "fixing" the wrong value (FinTech sweep 2026-06-02).
export const DEFAULT_RETURNS = 0.12;

export const SWR_AGE_TABLE: Array<{ maxAge: number; swr: number }> = [
  { maxAge: 40, swr: 0.03 },
  { maxAge: 50, swr: 0.0325 },
  { maxAge: 60, swr: 0.035 },
  { maxAge: 70, swr: 0.04 },
  { maxAge: Infinity, swr: 0.045 },
];

/**
 * @deprecated v4 age-driven SWR. SWR is a function of retirement HORIZON, not
 * current age (audit Entry #1). Use {@link getHorizonSWR}. Retained only for
 * back-compat with surfaces not yet migrated; the live FIRE engine uses the
 * horizon resolver.
 */
export function getAdjustedSWR(age?: number): number {
  if (!age) return INDIA_SWR;
  for (const entry of SWR_AGE_TABLE) {
    if (age < entry.maxAge) return entry.swr;
  }
  return INDIA_SWR;
}

/**
 * Horizon-driven SWR resolver (audit Entry #1 A1.1).
 *
 * SWR is a function of the *retirement horizon* (years the corpus must last =
 * planToAge − retirementAge), NOT current age. A 47-year-old retiring with a
 * plan-to age of 90 faces a 43-year horizon and should draw ~3.25%, not the
 * v4 age-table's 3.0–3.5%.
 *
 * 5-step bracket (audit-ratified 2026-05-27, Entry #1 Point 2):
 *   ≥50yr → 3.00%   ·  40–49yr → 3.25%  ·  30–39yr → 3.50%
 *   20–29yr → 4.00% ·  <20yr → 4.50%
 *
 * Research authority: only the ≥50yr (3.0%) and 30–39yr (3.5%) brackets are
 * directly research-quoted (Ch 02 §2.3, Ch 01 §1.4). The 40–49, 20–29, and
 * <20 brackets are FireKaro conservative interpolation — disclosed in the SWR
 * glossary entry per A1.4.
 */
export const SWR_HORIZON_TABLE: Array<{ minHorizon: number; swr: number }> = [
  { minHorizon: 50, swr: 0.03 },
  { minHorizon: 40, swr: 0.0325 },
  { minHorizon: 30, swr: 0.035 },
  { minHorizon: 20, swr: 0.04 },
  { minHorizon: 0, swr: 0.045 },
];

export function getHorizonSWR(args: { retirementAge?: number; planToAge?: number }): number {
  const { retirementAge, planToAge } = args;
  if (
    retirementAge == null ||
    planToAge == null ||
    !Number.isFinite(retirementAge) ||
    !Number.isFinite(planToAge)
  ) {
    return INDIA_SWR;
  }
  const horizon = planToAge - retirementAge;
  if (horizon <= 0) return INDIA_SWR;
  for (const entry of SWR_HORIZON_TABLE) {
    if (horizon >= entry.minHorizon) return entry.swr;
  }
  return INDIA_SWR;
}

/**
 * 4-bucket household inflation blend (audit Entry #3 A3.1).
 *
 * Indian expenses do not inflate at a single rate. The household blend weights
 * four buckets (research Ch 02 §2.2):
 *   general 60% · healthcare 20% · education 10% · housing 10%
 * With research-default rates (6/14/9/6%) the blend ≈ 7.9% — materially higher
 * than the v4 single 6%, which under-projected required corpus.
 */
export interface InflationBuckets {
  general: number;
  healthcare: number;
  education: number;
  housing: number;
}
export interface InflationWeights {
  general: number;
  healthcare: number;
  education: number;
  housing: number;
}
export const DEFAULT_INFLATION_WEIGHTS: InflationWeights = {
  general: 0.6,
  healthcare: 0.2,
  education: 0.1,
  housing: 0.1,
};

export function blendedInflation(
  buckets: InflationBuckets,
  weights: InflationWeights = DEFAULT_INFLATION_WEIGHTS,
): number {
  const wsum = weights.general + weights.healthcare + weights.education + weights.housing;
  if (wsum <= 0) return buckets.general;
  const blended =
    buckets.general * weights.general +
    buckets.healthcare * weights.healthcare +
    buckets.education * weights.education +
    buckets.housing * weights.housing;
  return blended / wsum;
}

/**
 * Additional FIRE corpus required by the family layer (audit Entry #6 A6.10),
 * over and above the base retirement FIRE number.
 *
 * "On top of, not part of" (Ch 02 §2.7): ignoring this under-funds a
 * sandwich-gen household's corpus by ~60%. Care is taken to avoid
 * DOUBLE-COUNTING — `parents`-kind recurring lines are already inside the
 * household's ongoing expenses (and thus already capitalized into the base
 * FIRE number), so they are NOT re-added here.
 *
 * Components added:
 *  - EVERY planned-future goal (T-376/gh-#165: was education+marriage kinds
 *    only — a `general` goal like a house upgrade silently never moved the
 *    FIRE number, an optimistic honesty error) → their today-rupee target
 *    amounts (one-shot future lump sums; not perpetual, so NOT divided by SWR).
 *  - extended-family contingency → an ongoing buffer, capitalized at SWR
 *    (annual ÷ swr) like any other perpetual expense.
 */
export function calculateFamilyLayerCorpus(args: {
  plannedGoalsLumpToday: number;
  extendedContingencyAnnual: number;
  swr: number;
}): number {
  const { plannedGoalsLumpToday, extendedContingencyAnnual, swr } = args;
  const contingencyCorpus = swr > 0 ? extendedContingencyAnnual / swr : 0;
  return Math.max(0, plannedGoalsLumpToday) + Math.max(0, contingencyCorpus);
}

/**
 * Full research-grounded FIRE target (audit Entry #6 A6.10 + Entry #10 A10.5):
 *
 *   target = base + familyLayerCorpus + base × healthcareReservationPct
 *
 * where `base` is the ongoing-expenses FIRE number (annualExpenses ÷ SWR),
 * `familyLayerCorpus` is the additive family layer, and the healthcare
 * reservation is a separate corpus buffer for medical shocks (distinct from
 * the healthcare INFLATION rate that already grows ongoing medical expenses).
 */
export function calculateFireTarget(args: {
  baseFireNumber: number;
  familyLayerCorpus: number;
  healthcareReservationPercent: number;
}): number {
  const { baseFireNumber, familyLayerCorpus, healthcareReservationPercent } = args;
  if (!Number.isFinite(baseFireNumber)) return baseFireNumber;
  const reservation = baseFireNumber * Math.max(0, healthcareReservationPercent);
  return baseFireNumber + Math.max(0, familyLayerCorpus) + reservation;
}

export function roundPercent(value: number, decimals = 1): number {
  const m = Math.pow(10, decimals);
  return Math.round(value * m) / m;
}

export function calculateFIRENumber(annualExpenses: number, swr?: number, _age?: number): number {
  // No-SWR fallback uses the canonical India SWR, NOT the deprecated age table — the live
  // kernel always passes the horizon-resolved effectiveSWR (derive.ts), so the age path was a
  // latent trap (re-introducing the age-vs-horizon bug audit Entry #1 fixed). `_age` retained
  // for caller signature compatibility (FinTech sweep 2026-06-02).
  const eff = swr ?? INDIA_SWR;
  if (eff <= 0) return Infinity;
  return annualExpenses / eff;
}

export interface FireVariants {
  leanFIRE: number;
  regularFIRE: number;
  fatFIRE: number;
}
export interface VariantMultipliers {
  lean: number;
  fat: number;
}
export function calculateFIREVariants(
  annualExpenses: number,
  swr: number = INDIA_SWR,
  multipliers: VariantMultipliers = { lean: 0.6, fat: 1.5 },
): FireVariants {
  const fireNumber = calculateFIRENumber(annualExpenses, swr);
  return {
    leanFIRE: fireNumber * multipliers.lean,
    regularFIRE: fireNumber,
    fatFIRE: fireNumber * multipliers.fat,
  };
}

export function calculateYearsToTarget(
  currentCorpus: number,
  targetCorpus: number,
  monthlySavings: ContributionSchedule,
  expectedReturns: ReturnSchedule = DEFAULT_RETURNS,
): number {
  if (currentCorpus >= targetCorpus) return 0;
  // Preserve the prior scalar guard EXACTLY: a constant non-positive contribution can never
  // reach the target (keeps the constant path byte-identical, incl. the Infinity sentinel the
  // empty-state headline relies on). A function schedule is not eagerly rejected — it may start
  // at 0 and ramp up — so it falls through to the loop.
  if (typeof monthlySavings === "number" && monthlySavings <= 0) return Infinity;
  let months = 0;
  let corpus = currentCorpus;
  while (corpus < targetCorpus && months < 1200) {
    // M1 (#9): resolve the return for the current year so a glide-path schedule
    // de-risks the headline "years to FIRE" the same way it de-risks the
    // projection. A constant rate is byte-identical to the prior flat loop.
    const yearIndex = Math.floor(months / 12);
    const r = resolveReturn(expectedReturns, yearIndex) / 12;
    // #46: resolve the contribution for the current year (constant ⇒ identical to the prior
    // `+ monthlySavings`; a step-up/stop schedule varies it year-by-year, same year-index origin
    // as projectCorpus so the headline and the chart curve agree).
    const contribution = resolveContribution(monthlySavings, yearIndex);
    corpus = corpus * (1 + r) + contribution;
    months++;
  }
  return months / 12;
}

export function calculateSavingsRate(monthlyIncome: number, monthlySavings: number): number {
  if (monthlyIncome <= 0) return 0;
  return roundPercent((monthlySavings / monthlyIncome) * 100);
}

/**
 * Multi-year corpus projection. Returns one data point per year (start of year).
 * Inflation grows annual expenses; returns grow corpus; contributions add monthly.
 */
export interface ProjectionPoint {
  year: number;
  ageYears: number;
  corpus: number;
  inflatedAnnualExpenses: number;
  targetForRegular: number;
  targetForLean: number;
  targetForFat: number;
  /** Annual withdrawal drawn this year once decumulation has begun (else undefined). */
  withdrawal?: number;
}

/**
 * Optional decumulation overlay (audit Entry #9 A9.1). When supplied, the
 * projection STOPS adding contributions at `retirementAge` and begins drawing
 * the Floor/Ceiling withdrawal from `withdrawal-strategy.ts` — visibly bending
 * the corpus curve downward under stress. When omitted (the Constant default),
 * the projection is pure accumulation, byte-identical to the prior behaviour.
 */
export interface DecumulationOverlay {
  retirementAge: number;
  config: FloorCeilingWithdrawalConfig;
  /**
   * Optional retirement-income stream (audit A14.2) — e.g. the annuitised NPS
   * pension. Offsets the corpus draw each decumulation year so the corpus
   * depletes more slowly. Nominal (documented simplification).
   */
  retirementIncomeAnnual?: number;
}

/**
 * A per-year expected-return schedule (M1, gh-issue #9): either one constant
 * rate for the whole horizon, or a function of the year index (0 = first
 * projected year) returning that year's expected return. The glide-path
 * projection passes a function so de-risking late years compound at their lower
 * implied return instead of a single static blend — otherwise a glide-enabled
 * household over-states its terminal corpus → an optimistically early FIRE date.
 */
export type ReturnSchedule = number | ((yearIndex: number) => number);

function resolveReturn(schedule: ReturnSchedule, yearIndex: number): number {
  const r = typeof schedule === "function" ? schedule(yearIndex) : schedule;
  // Defensive (defensive-coding.md): a schedule function could divide by zero or
  // return NaN/undefined; a non-finite return would silently poison the whole
  // corpus projection (Tier-0 math). Fall back to 0% for that year, not NaN.
  return Number.isFinite(r) ? r : 0;
}

/**
 * A per-year contribution schedule (Temporal Phase 1, gh-issue #46) — mirrors
 * {@link ReturnSchedule}: either one constant monthly amount for the whole horizon, or a
 * function of the year index (0 = first projected year) returning that year's monthly
 * contribution. A constant scalar is byte-identical to the prior single-amount loop; a
 * function lets a step-up / start-stop plan move the FIRE date. The flattening of segments
 * into this function lives in lib/contribution-schedule.ts (the single-kernel rule keeps
 * the math out of derive.ts).
 */
export type ContributionSchedule = number | ((yearIndex: number) => number);

function resolveContribution(schedule: ContributionSchedule, yearIndex: number): number {
  const c = typeof schedule === "function" ? schedule(yearIndex) : schedule;
  // Defensive (defensive-coding.md): a non-finite contribution would poison the corpus
  // path — fall back to 0 for that year, never NaN.
  return Number.isFinite(c) ? c : 0;
}

export function projectCorpus(args: {
  currentCorpus: number;
  monthlyContribution: ContributionSchedule;
  expectedReturns: ReturnSchedule;
  inflation: number;
  annualExpensesToday: number;
  startAge: number;
  swr: number;
  horizonYears: number;
  decumulation?: DecumulationOverlay;
}): ProjectionPoint[] {
  const {
    currentCorpus,
    monthlyContribution,
    expectedReturns,
    inflation,
    annualExpensesToday,
    startAge,
    swr,
    horizonYears,
    decumulation,
  } = args;

  const points: ProjectionPoint[] = [];
  let corpus = currentCorpus;
  let corpusAtRetirement: number | null = null;
  let retYear = 0;
  let prevWithdrawal = 0;
  for (let y = 0; y <= horizonYears; y++) {
    const age = startAge + y;
    // M1 (#9): this year's expected return — a per-year value when a glide-path
    // schedule is supplied, else the constant blended return (byte-identical).
    const er = resolveReturn(expectedReturns, y);
    const inflated = annualExpensesToday * Math.pow(1 + inflation, y);
    const target = inflated / Math.max(swr, 0.001);
    const inDecumulation = !!decumulation && age >= decumulation.retirementAge;
    points.push({
      year: new Date().getFullYear() + y,
      ageYears: age,
      corpus: Math.max(0, Math.round(corpus)),
      inflatedAnnualExpenses: Math.round(inflated),
      targetForRegular: Math.round(target),
      targetForLean: Math.round(target * 0.6),
      targetForFat: Math.round(target * 1.5),
      ...(inDecumulation ? { withdrawal: Math.round(prevWithdrawal) } : {}),
    });

    if (inDecumulation && decumulation) {
      // Decumulation phase: no new contributions; grow then withdraw per the
      // Floor/Ceiling rule (corpus path drives the floor/ceiling adjustments).
      if (corpusAtRetirement === null) {
        corpusAtRetirement = corpus;
        retYear = 0;
      }
      corpus = corpus * (1 + er);
      const wd = floorCeilingWithdrawal(
        decumulation.config,
        corpusAtRetirement,
        corpus,
        retYear,
        prevWithdrawal,
      );
      // A14.2 — retirement income (NPS annuity) offsets the draw from corpus.
      const netDraw = Math.max(0, wd.withdrawal - (decumulation.retirementIncomeAnnual ?? 0));
      corpus = Math.max(0, corpus - netDraw);
      prevWithdrawal = wd.withdrawal;
      retYear++;
    } else {
      // Accumulation phase: grow corpus over next 12 months + contribute. #46: the monthly
      // contribution is resolved ONCE for this year `y` (constant schedule ⇒ identical to the
      // prior `+ monthlyContribution`; a step-up/stop schedule varies it per year). Same
      // year-index origin as calculateYearsToTarget so headline and chart can't diverge.
      const contributionThisYear = resolveContribution(monthlyContribution, y);
      for (let m = 0; m < 12; m++) {
        corpus = corpus * (1 + er / 12) + contributionThisYear;
      }
    }
  }
  return points;
}

export interface CrossoverResult {
  variant: "lean" | "regular" | "fat";
  year: number | null;
  age: number | null;
  yearsFromNow: number | null;
}

export function findCrossovers(points: ProjectionPoint[]): {
  lean: CrossoverResult;
  regular: CrossoverResult;
  fat: CrossoverResult;
} {
  function find(targetKey: "targetForLean" | "targetForRegular" | "targetForFat", variant: "lean" | "regular" | "fat") {
    for (const p of points) {
      if (p.corpus >= p[targetKey]) {
        const yearsFromNow = p.year - new Date().getFullYear();
        return { variant, year: p.year, age: p.ageYears, yearsFromNow };
      }
    }
    return { variant, year: null, age: null, yearsFromNow: null };
  }
  return {
    lean: find("targetForLean", "lean"),
    regular: find("targetForRegular", "regular"),
    fat: find("targetForFat", "fat"),
  };
}

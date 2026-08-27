// Ported from server/lib/calculations/fire-metrics.ts + fire-projections.ts
// Pure functions, no server deps.

import { floorCeilingWithdrawal, type FloorCeilingWithdrawalConfig } from "@/lib/withdrawal-strategy";

// India SWR — deliberately conservative (3.5% vs the US 4% rule). Per ADR-0003, realized
// capital-gains / withdrawal taxation is NOT modelled per-transaction (that is tax-tracker
// scope, not FIRE-planner scope); the post-tax sustainability headroom is absorbed into this
// SWR. Keep this in mind before treating the FIRE number as a strictly pre-tax target.
export const INDIA_SWR = 0.035;
export const INDIA_INFLATION = 0.06;
// NB: the LIVE healthcare-inflation default is 9% (`DEFAULT_ASSUMPTIONS.healthcareInflation`
// in types/assumptions.ts) — CPI-Health runs ~4-7% and the private-tariff / retiree-mix excess
// adds ~3-4 pp (ADR-0006). It was 14% until 2026-08-27; that figure is an INSURER CLAIMS-COST
// TREND (Aon/Marsh), which belongs to the insurance-PREMIUM line (already auto-flowed into
// expenses), not to a price index. The old 8% `INDIA_HEALTHCARE_INFLATION` constant was stale +
// dead (no importers) and is removed to avoid a future editor "fixing" the wrong value.
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
 * four buckets. The weights MUST be DISJOINT shares of an urban household's budget
 * (ADR-0006 / FinTech CRITICAL-1): `general` is the ALL-ITEMS CPI, which already contains
 * health, education and housing, so the pre-ADR-0006 60/20/10/10 split double-counted those
 * three by construction and inflated the blend to 7.90%.
 *
 * Live grounding (ADR-0006, 2026-08-27): general 74% · healthcare 8% · education 0% · housing 18%
 * with rates 6 / 9 / 9 / 6% ⇒ blend ≈ 6.24%. Education carries weight 0 in the PERPETUAL
 * retirement basket because education spending ENDS — it is already funded as finite lump-sum
 * goals through the family layer (`calculateFamilyLayerCorpus` + `adequacy.ts`, which still
 * inflates them at `educationInflation`). Keeping it here too was a double-count.
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
  general: 0.74,
  healthcare: 0.08,
  education: 0,
  housing: 0.18,
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

/**
 * A per-year TARGET schedule (ADR-0006). Mirrors {@link ReturnSchedule}/{@link ContributionSchedule}:
 * either one constant target for the whole horizon (the pre-ADR-0006 today's-rupee scalar — kept
 * working for every legacy caller), or a function of the year index returning that year's target.
 *
 * ADR-0006 runs the headline in ONE nominal frame: the target grows at the household expense
 * basket `b` while the corpus compounds at the NOMINAL return, so this schedule carries the
 * inflating target. A constant scalar is byte-identical to the prior fixed-target loop.
 */
export type TargetSchedule = number | ((yearIndex: number) => number);

function resolveTarget(schedule: TargetSchedule, yearIndex: number): number {
  const t = typeof schedule === "function" ? schedule(yearIndex) : schedule;
  // Defensive (defensive-coding.md): a non-finite target would either return 0 years
  // ("already at FIRE") or loop to the cap — both are user-visible lies. Fall back to
  // +Infinity for that year, which the caller's 1200-month cap turns into "unreachable".
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export function calculateYearsToTarget(
  currentCorpus: number,
  targetCorpus: TargetSchedule,
  monthlySavings: ContributionSchedule,
  expectedReturns: ReturnSchedule = DEFAULT_RETURNS,
): number {
  if (currentCorpus >= resolveTarget(targetCorpus, 0)) return 0;
  // Preserve the prior scalar guard EXACTLY: a constant non-positive contribution can never
  // reach the target (keeps the constant path byte-identical, incl. the Infinity sentinel the
  // empty-state headline relies on). A function schedule is not eagerly rejected — it may start
  // at 0 and ramp up — so it falls through to the loop.
  if (typeof monthlySavings === "number" && monthlySavings <= 0) return Infinity;
  let months = 0;
  let corpus = currentCorpus;
  while (months < 1200) {
    // M1 (#9): resolve the return for the current year so a glide-path schedule
    // de-risks the headline "years to FIRE" the same way it de-risks the
    // projection. A constant rate is byte-identical to the prior flat loop.
    const yearIndex = Math.floor(months / 12);
    // ADR-0006: the target is resolved CONTINUOUSLY (fractional years), not at the year index.
    // The corpus is checked monthly, so quantising the target to the start of the year would let
    // eleven months of corpus growth race a target frozen in January — the household would be
    // declared FIRE-ready against last year's number (measured: it pulled the Mauryas headline
    // ~2 years ahead of the projection's own crossover). A scalar target resolves identically at
    // any index ⇒ byte-identical to the prior `while (corpus < targetCorpus)` loop.
    if (corpus >= resolveTarget(targetCorpus, months / 12)) break;
    const r = monthlyRate(resolveReturn(expectedReturns, yearIndex));
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
 *
 * ADR-0006 FRAME: this projection is NOMINAL and is the shape the whole kernel now runs in.
 * `inflation` is the household EXPENSE BASKET (`resolveHouseholdInflation`), not general CPI —
 * it grows the expense/target line only. `expectedReturns` are NOMINAL and `monthlyContribution`
 * is a NOMINAL schedule (real amount x (1+CPI)^y). Display deflation at general CPI happens
 * downstream in `useFireDerive.deflateProjectionPoints`, never here.
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

/**
 * The monthly rate EQUIVALENT to an annual rate: `(1+r)^(1/12) − 1`, not `r/12`.
 *
 * ADR-0006 — this MUST be the true equivalent, because the kernel now runs in the nominal frame
 * while the Monte Carlo band and the lever-impact engine stay in the CPI-real frame. With `r/12`
 * the effective annual rate is `(1+r/12)^12 > 1+r`, and the size of that excess depends on `r` —
 * so the SAME household reached FIRE ~1.2 years earlier in the nominal frame than in the real one
 * purely from the compounding convention (measured on the Sharmas seed). A frame the answer
 * depends on is not one frame.
 *
 * With the true equivalent, deflating the nominal path month by month reproduces the real path
 * exactly FOR RETURNS. It does NOT for CONTRIBUTIONS, and Phase 1b corrects the claim that it did:
 * the nominal inflow steps ONCE A YEAR (a salary is revised annually), so the contribution paid in
 * month `j` of year `y` is `C_real(y)·(1+CPI)^y` while the deflator at that instant is
 * `(1+CPI)^(y + (j+1)/12)`. Its real value is therefore `C_real(y)·(1+CPI)^−(j+1)/12` — below
 * `C_real(y)` for every month of the year, by `1 − (1/12)Σ_{k=1..12}(1+CPI)^−k/12` ≈ 3.2% at 6%
 * CPI. Any engine that works in the CPI-real frame (the Monte Carlo band, `lever-impact`) must
 * re-index its contributions by that factor or it runs optimistic against the nominal headline;
 * `derive().bandContributionSchedule` is the one place that factor is applied.
 *
 * It is also the conservative correction: `r/12` silently over-compounded every projection.
 */
function monthlyRate(annual: number): number {
  // (1+r)^(1/12) is undefined for r <= -1; the return floor elsewhere keeps us clear, but a
  // schedule is caller-supplied, so guard rather than emit NaN into a corpus path.
  if (!(annual > -1)) return -1;
  return Math.pow(1 + annual, 1 / 12) - 1;
}

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
  /**
   * ADR-0006 two-frame coherence. The REGULAR target the headline solves against is
   * `derive()`'s `fireNumber` = base + family layer (#165) + healthcare reservation — NOT
   * `annualExpensesToday / swr`. Before ADR-0006 this projection built its regular target from
   * expenses alone, so the chart crossover sat 4–8 years EARLIER than the headline on every seed
   * persona (measured: Sharmas 52 vs 56, Mehtas 45 vs 51, Iyers 52 vs 57, Mauryas 60 vs 68) —
   * an optimistic divergence in the one place `#20` claimed the two frames agreed. Passing the
   * headline target here makes them agree by construction (locked by
   * `inflation-frame-invariant.spec.ts` assertion 3). Omitted ⇒ the legacy expenses-only basis.
   * Lean/Fat keep the variant-multiplier basis they already share with the headline.
   */
  regularTargetToday?: number;
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
    regularTargetToday,
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
    const inflationFactor = Math.pow(1 + inflation, y);
    const inflated = annualExpensesToday * inflationFactor;
    const target = inflated / Math.max(swr, 0.001);
    // ADR-0006: the regular target is the headline FIRE number when supplied, inflated at the
    // SAME rate as the expense line (both are the household's spending basket).
    const regularTarget =
      regularTargetToday != null && Number.isFinite(regularTargetToday)
        ? regularTargetToday * inflationFactor
        : target;
    const inDecumulation = !!decumulation && age >= decumulation.retirementAge;
    points.push({
      year: new Date().getFullYear() + y,
      ageYears: age,
      corpus: Math.max(0, Math.round(corpus)),
      inflatedAnnualExpenses: Math.round(inflated),
      targetForRegular: Math.round(regularTarget),
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
      const mr = monthlyRate(er);
      for (let m = 0; m < 12; m++) {
        corpus = corpus * (1 + mr) + contributionThisYear;
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

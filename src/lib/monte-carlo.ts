/**
 * Monte Carlo FIRE confidence engine (gh-issue #18 — Tier-0 honesty).
 *
 * THE PROBLEM IT FIXES: a single deterministic "FIRE in N years" is false
 * precision. Two plans with the same expected return but different volatility do
 * NOT have the same real FIRE date — sequence-of-returns risk spreads the outcome.
 * Presenting one point hides the downside, which for an accumulator is the
 * optimistic error that makes them under-prepare. This engine returns the
 * DISTRIBUTION instead: p10/p50/p90 years, P(never reach), + the success curve.
 *
 * NO PARALLEL MATH: it drives the SAME deterministic projection
 * (`calculateYearsToTarget`, which already accepts a per-year `ReturnSchedule`)
 * many times with a stochastic return schedule, and collects the spread. Pure —
 * no store/DOM access. Seeded PRNG ⇒ reproducible (tests + caching).
 *
 * RETURN MODEL (v1): per-YEAR returns drawn IID **lognormal**, moment-matched so
 * E[r]=meanReturn and SD[r]=volatility exactly, reused across that year's 12
 * months. Lognormal is naturally bounded at −1 (no impossible worse-than-total
 * loss) — it replaced a Normal+floor whose left-only clamp lifted the mean
 * upward at high vol (optimistic; gh-issue #18 H1, FinTech review 2026-06-03).
 *
 * ⚠ NOT YET HEADLINE-READY (tracked in #18 — required BEFORE any UI wiring):
 *   1. IID omits sequence-of-returns AUTOCORRELATION (real bad years cluster),
 *      so IID can UNDER-state the bad tail vs a historical block-bootstrap (the
 *      v2 upgrade). Do NOT call this "conservative" until v2 lands.
 *   2. INFLATION FRAME: `meanReturn` and `targetCorpus` MUST be in the SAME
 *      frame. For FIRE, pass a REAL return (≈ nominal − inflation) with today's
 *      (un-inflated) target, OR inflate the target each year. Passing a NOMINAL
 *      return against a non-inflating target reaches too fast = optimistic (H3).
 *   3. GLIDE PATH: a single scalar mean/vol ignores equity→debt de-risking; the
 *      wiring should taper BOTH along the horizon (H3/integration).
 *   4. Headline MUST use a conservative percentile + honest disclosure, never p50
 *      alone, and surface P(never reach FIRE).
 */
import { calculateYearsToTarget } from "./fire-math";

/** calculateYearsToTarget caps the horizon at 1200 months (100 yrs). Exported so
 *  UI can treat any percentile >= this as "off the chart" and never render the
 *  never-reached SENTINEL (MAX+1) as a literal year/age (gh-issue #18 honesty). */
export const MAX_PROJECTION_YEARS = 100;

/** Sentinel for paths that never reach FIRE — strictly worse than any real outcome,
 *  so they sort to the pessimistic end (fixes #18 M2: never-reached must not be
 *  capped BELOW slow-but-successful paths). */
const NEVER_REACHED_YEARS = MAX_PROJECTION_YEARS + 1;

/**
 * Research-grounded annual return volatility (stdev) per instrument bucket for the
 * Indian market — companion inputs a caller blends into a portfolio `volatility`.
 * (FinTech review 2026-06-03: equity raised 0.18→0.20 toward the Nifty 20yr σ
 * ~0.20–0.24; realEstate is appraisal-SMOOTHED — true economic σ is ~0.15–0.20,
 * so 0.12 understates and must be treated as a floor.) Validated independently.
 */
export const INDIA_RETURN_VOLATILITY = {
  equity: 0.2,
  debt: 0.05,
  gold: 0.15,
  realEstate: 0.12,
  cash: 0.01,
} as const;

/**
 * Annual return volatility (stdev) per derive() return-bucket — the companion to
 * `assumption-math.blendPortfolioReturn`'s per-bucket RETURNS. `blendPortfolioVolatility`
 * value-weights these into one portfolio σ for the Monte Carlo headline band (#18).
 *
 * FinTech-validated 2026-06-03 (gh-issue #18). Every value is set on the
 * NON-UNDERSTATEMENT side — an under-stated σ shrinks the band and manufactures
 * false confidence, which for the accumulator is the optimistic failure mode:
 *  - realEstate 0.15 (NOT the appraisal-smoothed 0.12 floor — true economic σ 0.15–0.20)
 *  - nps 0.13 (NPS carries an equity sleeve; a debt-like 0.05 would understate — floor 0.12)
 *  - international 0.22 (USD equity + FX vol for an INR investor)
 *  - reit 0.20 (trades equity-like, not the smoothed-RE rate)
 *  - crypto 0.60 (a FLOOR — real σ is 0.80–1.00+; tiny weight, lognormal caps at −1)
 *  - ppf/epf 0.01 (sovereign fixed ≈ cash)
 *  - other 0.05 (debt-like, mirrors blendPortfolioReturn's treatment)
 */
export const RETURN_BUCKET_VOLATILITY = {
  equity: 0.2,
  debt: 0.05,
  realEstate: 0.15,
  gold: 0.15,
  nps: 0.13,
  ppf: 0.01,
  epf: 0.01,
  international: 0.22,
  reit: 0.2,
  crypto: 0.6,
  other: 0.05,
} as const;

export interface MonteCarloFireInput {
  currentCorpus: number;
  targetCorpus: number;
  monthlySavings: number;
  /** Expected annual return. MUST share an inflation frame with targetCorpus (see header). */
  meanReturn: number;
  /** Annual return stdev (e.g. blended from INDIA_RETURN_VOLATILITY). 0 ⇒ deterministic. */
  volatility: number;
  /** Years over which to report the success-probability curve (default 50). */
  horizonYears?: number;
  /** Simulated paths (default 1000). More ⇒ smoother tails, slower. */
  paths?: number;
  /** PRNG seed (default 1) — fixed ⇒ reproducible output. */
  seed?: number;
}

export interface MonteCarloFireResult {
  /** 10th-percentile years-to-FIRE — the optimistic/fast outcome. */
  p10Years: number;
  /** Median years-to-FIRE. */
  p50Years: number;
  /** 90th-percentile years-to-FIRE — the conservative/slow outcome (honesty anchor). */
  p90Years: number;
  /** Alias of p50Years for headline clarity. */
  medianYears: number;
  /** Fraction of paths that never reach FIRE within the 100-yr projection cap. */
  probabilityNeverReachFire: number;
  /** index y ⇒ P(reach FIRE within y years), cumulative, in [0,1]. Length horizonYears+1. */
  successProbabilityByYear: number[];
  /** Number of simulated paths. */
  paths: number;
}

/** Deterministic PRNG (mulberry32) — uniform in [0,1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard Normal draw via Box-Muller from a uniform PRNG. */
function nextNormal(rng: () => number): number {
  let u1 = rng();
  const u2 = rng();
  if (u1 < 1e-12) u1 = 1e-12; // avoid log(0)
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * One annual return, lognormal and moment-matched to arithmetic (mean, vol):
 * E[r] = mean and SD[r] = vol exactly, with r > −1 always. `z` is a standard
 * Normal. vol ≤ 0 collapses to the deterministic mean (zero-vol ⇒ point estimate).
 */
export function annualReturnFromStdNormal(mean: number, vol: number, z: number): number {
  if (vol <= 0) return mean;
  const base = Math.max(1 + mean, 1e-6); // guard mean ≤ −1 (not expected for a return)
  const variance = (vol * vol) / (base * base);
  const sigma2 = Math.log(1 + variance);
  const sigma = Math.sqrt(sigma2);
  const mu = Math.log(base) - sigma2 / 2;
  return Math.exp(mu + sigma * z) - 1;
}

/** Sample `count` IID annual returns (for distribution previews + moment tests). */
export function sampleAnnualReturns(mean: number, vol: number, count: number, seed = 1): number[] {
  const rng = mulberry32(seed >>> 0);
  const out = new Array<number>(Math.max(0, Math.floor(count)));
  for (let i = 0; i < out.length; i++) out[i] = annualReturnFromStdNormal(mean, vol, nextNormal(rng));
  return out;
}

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.round(q * (sortedAsc.length - 1));
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, idx))];
}

export function runMonteCarloFire(input: MonteCarloFireInput): MonteCarloFireResult {
  const horizon = Math.max(1, Math.floor(input.horizonYears ?? 50));
  const paths = Math.max(1, Math.floor(input.paths ?? 1000));
  const rng = mulberry32((input.seed ?? 1) >>> 0);

  const yearsPerPath: number[] = new Array(paths);
  let neverReached = 0;

  for (let p = 0; p < paths; p++) {
    // Pre-draw ONE return per year and reuse it across that year's 12 months.
    // calculateYearsToTarget calls the schedule per-month; drawing inside it
    // would average 12 sub-draws and silently understate annual volatility.
    const yearly: number[] = new Array(MAX_PROJECTION_YEARS);
    for (let y = 0; y < MAX_PROJECTION_YEARS; y++) {
      yearly[y] = annualReturnFromStdNormal(input.meanReturn, input.volatility, nextNormal(rng));
    }
    const schedule = (yearIndex: number): number => yearly[Math.min(yearIndex, MAX_PROJECTION_YEARS - 1)];

    const raw = calculateYearsToTarget(input.currentCorpus, input.targetCorpus, input.monthlySavings, schedule);
    // Reached only if finite AND inside the cap; raw === 100 means the loop hit the
    // month-cap without reaching ⇒ never-reached, must sort to the worst end (M2).
    const reached = Number.isFinite(raw) && raw < MAX_PROJECTION_YEARS;
    if (reached) {
      yearsPerPath[p] = raw;
    } else {
      yearsPerPath[p] = NEVER_REACHED_YEARS;
      neverReached++;
    }
  }

  const sorted = [...yearsPerPath].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);

  const successProbabilityByYear = new Array<number>(horizon + 1);
  for (let yr = 0; yr <= horizon; yr++) {
    let reached = 0;
    for (let i = 0; i < paths; i++) if (yearsPerPath[i] <= yr) reached++;
    successProbabilityByYear[yr] = reached / paths;
  }

  return {
    p10Years: percentile(sorted, 0.1),
    p50Years: p50,
    p90Years: percentile(sorted, 0.9),
    medianYears: p50,
    probabilityNeverReachFire: neverReached / paths,
    successProbabilityByYear,
    paths,
  };
}

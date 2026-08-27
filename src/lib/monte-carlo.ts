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
 * RETURN MODEL (v1, IID): per-YEAR returns drawn IID **lognormal**, moment-matched
 * so E[r]=meanReturn and SD[r]=volatility exactly, reused across that year's 12
 * months. Lognormal is naturally bounded at −1 (no impossible worse-than-total
 * loss) — it replaced a Normal+floor whose left-only clamp lifted the mean
 * upward at high vol (optimistic; gh-issue #18 H1, FinTech review 2026-06-03).
 * Still the FALLBACK path (and zero-vol point estimate) when no `historicalReturns`
 * series is passed. NOTE: the lognormal's right-skew is a BOUNDING ARTIFACT (forced by
 * the −1 floor to keep E[r]/SD[r]) — NOT a real market property; do not reason from it
 * that "lognormal is conservative" (the v2 history-fed band is milder-skewed and tighter).
 *
 * RETURN MODEL (v2, HISTORY-FED block-bootstrap — #24 Part 2): when a
 * `historicalReturns` series is passed, each path samples contiguous
 * ~`BOOTSTRAP_BLOCK_YEARS`-year BLOCKS (wrapping/circular) from that series,
 * standardizes each historical year to z=(r−μ_h)/σ_h, and maps it to the user's
 * frame via LOCATION-SCALE: r_user(y) = meanForYear(y) + z·volatility (floored at
 * −0.95). This borrows ONLY the historical SHAPE (real skew) + the real year-to-year
 * SERIAL STRUCTURE while ANCHORING the mean to the customizable forward schedule and
 * the spread to the blended portfolio σ. The historical MEAN and single-asset vol are
 * NOT imposed (they'd be optimistic / wrong-portfolio). Standardization makes the
 * embedded series AFFINE-INVARIANT — only its shape survives, which is why a
 * representative (not audited-exact) series is sufficient. Borrowing an EQUITY shape
 * for a blended portfolio is a documented simplification (a full multi-asset
 * aligned-history bootstrap is deferred — YAGNI); at the small blended σ the absolute
 * effect is minor. FinTech-validated 2026-06-05 (#24 Part 2).
 *
 * ⚠ HEADLINE-HONESTY NOTES (tracked in #18/#24):
 *   1. v2 is MORE-REAL, not "more conservative" (measured + FinTech-adjudicated
 *      2026-06-05). The original prior — "bad years cluster ⇒ heavier bad tail than
 *      IID" — DID NOT survive the data: at ANNUAL frequency Indian equity is only
 *      mildly right-skewed (Sensex std skew ≈ +0.21) and MEAN-REVERTS (lag-1 autocorr
 *      ≈ −0.20, big years reverse — 2008 −52% → 2009 +76%), which is STABILIZING, not
 *      clustering. The IID lognormal's heavier right-skew (≈ +0.59) is a moment-matching
 *      ARTIFACT (forced by the −1 bound) that manufactured a fat slow-tail real equity
 *      does NOT have. Net: the history-fed band is UNIFORMLY TIGHTER than the
 *      IID-lognormal (both tails pull in), p50 anchored & a hair later. Tighter here ≠
 *      optimistic — the thing it is tighter-than was distorted. The ONE residual
 *      optimism vector is REGIME risk (future markets mean-reverting LESS than
 *      1991–2024); that is disclosed in copy (fire-confidence-band.ts), never hidden.
 *      Substance is CI-locked by the skew + autocorr + p50-anchor + boot.p90≤iid.p90
 *      tests, not by a (now-deleted) false "heavier tail" assertion.
 *   2. INFLATION FRAME: `meanReturn` and `targetCorpus` MUST be in the SAME
 *      frame. For FIRE, pass a REAL return (≈ nominal − inflation) with today's
 *      (un-inflated) target, OR inflate the target each year. Passing a NOMINAL
 *      return against a non-inflating target reaches too fast = optimistic (H3).
 *      ADR-0006 CHOICE: the band stays in the CPI-REAL frame (real return + today's-₹
 *      target) and satisfies the precondition via `targetGrowthRate` — the REAL drift
 *      `g = (1+basket)/(1+CPI) − 1` at which the today's-₹ target rises, because the
 *      household's spending basket outruns general CPI. The alternative (moving the band to
 *      the nominal frame like the deterministic headline) was rejected: the volatility, the
 *      historical bootstrap series and every consumer of `realBlendedReturn` are REAL-frame,
 *      so nominalising here would have meant re-grounding σ and the return history too — a
 *      much larger, un-validated change for an algebraically identical result. Divide the
 *      nominal crossing condition through by (1+CPI)^t and you get exactly this model.
 *   3. GLIDE PATH: the per-year MEAN now tapers via the optional `meanReturnSchedule`
 *      (#24 Part 1 — p50 converges to the glide-tapered headline). The VOLATILITY is
 *      still a single scalar (a per-year vol taper needs a per-year ALLOCATION schedule
 *      derive() doesn't yet expose) — the remaining #24-v2 mean/vol refinement.
 *   4. Headline MUST use a conservative percentile + honest disclosure, never p50
 *      alone, and surface P(never reach FIRE).
 */
import { calculateYearsToTarget, type ReturnSchedule, type TargetSchedule } from "./fire-math";

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

/**
 * Representative Indian-equity (BSE Sensex) CALENDAR-year price returns, 1991→2024 (%).
 *
 * REPRESENTATIVE, NOT audited-exact (rule 20 honesty): whole-percent figures from the
 * widely-published year-wise Sensex calendar-return record (year-end close-to-close).
 * The block-bootstrap consumes ONLY the STANDARDIZED deviation (r−μ_h)/σ_h, so any
 * affine error (uniform level shift OR uniform scale) cancels mathematically — only
 * the SHAPE survives: skew, fat-tailed crash years (2008 −52%, 2011 −25%), and the
 * real crash→rebound SERIAL STRUCTURE (2008 −52% → 2009 +76% — annual MEAN-REVERSION)
 * that IID misses. Dividends (~1.3%/yr, price-index→TRI) are deliberately OMITTED: a flat
 * per-year add is inert under standardization, and the forward MEAN is supplied by the
 * user's REAL total-return schedule, not by this array. Calendar-year (Jan–Dec), not the
 * Apr–Mar FY — irrelevant to vol/skew/serial-structure shape. μ_h≈18.6%, σ_h≈30.5% (computed in code
 * from the array, never hardcoded). FinTech-sourced + validated 2026-06-05 (#24 Part 2).
 */
export const INDIA_EQUITY_ANNUAL_RETURNS: readonly number[] = [
  0.82, 0.37, 0.28, 0.17, -0.21, // 1991-1995
  -0.01, 0.19, -0.17, 0.64, -0.21, // 1996-2000
  -0.18, 0.04, 0.73, 0.13, 0.42, // 2001-2005
  0.47, 0.47, -0.52, 0.76, 0.17, // 2006-2010
  -0.25, 0.26, 0.09, 0.3, -0.05, // 2011-2015
  0.02, 0.28, 0.06, 0.14, 0.16, // 2016-2020
  0.22, 0.04, 0.19, 0.08, // 2021-2024
] as const;

/**
 * Block length (years) for the circular block-bootstrap (#24 Part 2). 5yr spans the
 * canonical Indian crash→rebound→recovery arcs (2008→2009→2010; 2000→2001→2002) and
 * sits at the Künsch (1989) n^(1/3)-toward-dependence-horizon sweet spot for a ~34yr
 * series: 3 splits the crash→rebound arcs, 7–10 leaves too few distinct wrapping blocks
 * (the tail under-disperses). Wrapping/circular (Politis–Romano) avoids the end-effect bias
 * where late-series years get under-sampled. FinTech-validated 2026-06-05.
 */
export const BOOTSTRAP_BLOCK_YEARS = 5;

/** Hard floor on a single year's mapped return — no impossible worse-than-near-total
 *  loss. At blended σ ≤ 0.20 it almost never binds (the worst standardized Sensex year,
 *  2008 ≈ −2.3σ, maps to ≈ −0.40 at σ=0.20), so its mean-lift on the band is negligible
 *  — but it MUST exist as a safety, and the moment-recovery test asserts it stays inert. */
const RETURN_FLOOR = -0.95;

export interface MonteCarloFireInput {
  currentCorpus: number;
  targetCorpus: number;
  /**
   * ADR-0006. Annual REAL growth of `targetCorpus`, i.e. how fast the FIRE number rises in
   * TODAY's rupees because the household's expense basket outruns general CPI
   * (`derive().realTargetDriftRate`). Omitted or 0 ⇒ a fixed target, byte-identical to the
   * pre-ADR-0006 path. MUST be a REAL rate — it shares the frame of `meanReturn`.
   */
  targetGrowthRate?: number;
  monthlySavings: number;
  /** Expected annual return. MUST share an inflation frame with targetCorpus (see header).
   *  Used as the per-year MEAN when `meanReturnSchedule` is absent (the v1 scalar path). */
  meanReturn: number;
  /**
   * Optional per-year MEAN return SCHEDULE (#24 Part 1 — glide-path taper). When provided,
   * the per-path draw uses this schedule's value for each year's mean instead of the scalar
   * `meanReturn`, so a glide-ON household's MC band de-risks along the horizon exactly like
   * the deterministic headline (`calculateYearsToTarget` already drives the same schedule) —
   * making the MC p50 CONVERGE to the headline instead of running optimistically fast off a
   * scalar pre-glide return. Absent ⇒ byte-identical to the v1 scalar path (backward-compat).
   * MUST share the same inflation frame as `targetCorpus` (a REAL schedule for FIRE).
   */
  meanReturnSchedule?: ReturnSchedule;
  /** Annual return stdev (e.g. blended from INDIA_RETURN_VOLATILITY). 0 ⇒ deterministic. */
  volatility: number;
  /**
   * Optional historical annual-return series for the v2 HISTORY-FED block-bootstrap
   * (#24 Part 2, e.g. INDIA_EQUITY_ANNUAL_RETURNS). When present (and volatility > 0),
   * each path draws contiguous ~`blockYears`-year blocks (wrapping) from this series,
   * standardizes them, and location-scales to (meanForYear, volatility) — borrowing the
   * historical SHAPE + serial structure (annual mean-reversion) while anchoring mean+spread
   * to the user's frame. ABSENT (or empty, or vol ≤ 0) ⇒ the IID lognormal v1 path, byte-identical &
   * backward-compatible (the rng draw sequence is untouched on the IID path).
   */
  historicalReturns?: readonly number[];
  /** Bootstrap block length in years (default BOOTSTRAP_BLOCK_YEARS). Ignored on the IID path. */
  blockYears?: number;
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

/**
 * Standardize a return series to mean 0, population stdev 1 — preserving skew/kurtosis
 * (scale-invariant) so the block-bootstrap borrows shape, not the historical mean/vol.
 * A degenerate (constant) series ⇒ all zeros (no deviations to borrow).
 */
export function standardizeSeries(series: readonly number[]): number[] {
  const n = series.length;
  if (n === 0) return [];
  const mean = series.reduce((s, r) => s + r, 0) / n;
  const variance = series.reduce((s, r) => s + (r - mean) * (r - mean), 0) / n;
  const sd = Math.sqrt(variance);
  if (sd <= 0) return series.map(() => 0);
  return series.map((r) => (r - mean) / sd);
}

/**
 * Fill a `years`-long sequence of STANDARDIZED deviations by sampling contiguous
 * circular blocks of length `blockLen` from `stdSeries` — preserving within-block
 * autocorrelation (the real serial structure / annual mean-reversion). Wrapping (`% n`)
 * makes every start index equally likely ⇒ E[z]=0 exactly ⇒ the mapped return's mean stays anchored.
 */
function fillBlockBootstrapZ(stdSeries: number[], blockLen: number, years: number, rng: () => number): number[] {
  const n = stdSeries.length;
  const z = new Array<number>(years);
  let filled = 0;
  while (filled < years) {
    const start = Math.floor(rng() * n) % n;
    for (let k = 0; k < blockLen && filled < years; k++) {
      z[filled++] = stdSeries[(start + k) % n];
    }
  }
  return z;
}

/**
 * Sample `count` history-fed annual returns via the circular block-bootstrap (the v2
 * companion to `sampleAnnualReturns`, for distribution previews + moment-recovery tests).
 * Maps each block-drawn standardized deviation `z` to the user frame:
 * r = max(RETURN_FLOOR, mean + z·vol). vol ≤ 0 ⇒ the deterministic mean (point estimate).
 */
export function sampleBlockBootstrapReturns(
  historical: readonly number[],
  mean: number,
  vol: number,
  count: number,
  blockYears: number = BOOTSTRAP_BLOCK_YEARS,
  seed = 1,
): number[] {
  const n = Math.max(0, Math.floor(count));
  if (vol <= 0 || historical.length === 0) return new Array<number>(n).fill(mean);
  const std = standardizeSeries(historical);
  const blockLen = Math.max(1, Math.floor(blockYears));
  const rng = mulberry32(seed >>> 0);
  const z = fillBlockBootstrapZ(std, blockLen, n, rng);
  return z.map((zi) => Math.max(RETURN_FLOOR, mean + zi * vol));
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

  // #24 Part 1: resolve the per-year MEAN from the optional glide-tapered schedule
  // (falling back to the scalar meanReturn) so the band de-risks like the headline and
  // the MC p50 converges to the deterministic years-to-FIRE for glide-ON households.
  // The VOLATILITY stays scalar for Part 1 — a per-year vol taper needs a per-year
  // ALLOCATION schedule that derive() does not currently expose (the band SPREAD widens
  // slightly vs a true equity→debt vol taper, but the MEAN schedule is what shifts p50;
  // the per-year vol taper is the remaining #24-v2 refinement).
  const meanSchedule = input.meanReturnSchedule;
  const meanForYear =
    typeof meanSchedule === "function"
      ? (y: number): number => meanSchedule(y)
      : meanSchedule !== undefined
        ? (_y: number): number => meanSchedule
        : (_y: number): number => input.meanReturn;

  // #24 Part 2: HISTORY-FED block-bootstrap when a series is passed (and vol > 0). The
  // standardized series is precomputed ONCE; each path draws fresh circular blocks. The
  // IID lognormal path is the fallback (and the byte-identical backward-compat path when
  // no series is passed — its rng draw sequence is untouched).
  // ADR-0006: the today's-₹ target rises at the REAL basket drift. A 0/absent rate resolves to
  // the constant scalar ⇒ byte-identical to the pre-ADR-0006 fixed-target path.
  const targetDrift = Number.isFinite(input.targetGrowthRate) ? (input.targetGrowthRate as number) : 0;
  const targetSchedule: TargetSchedule =
    targetDrift === 0
      ? input.targetCorpus
      : (yearIndex: number) => input.targetCorpus * Math.pow(1 + targetDrift, yearIndex);

  const useBootstrap = !!input.historicalReturns && input.historicalReturns.length > 0 && input.volatility > 0;
  const stdSeries = useBootstrap ? standardizeSeries(input.historicalReturns!) : null;
  const blockLen = Math.max(1, Math.floor(input.blockYears ?? BOOTSTRAP_BLOCK_YEARS));

  for (let p = 0; p < paths; p++) {
    // Pre-draw ONE return per year and reuse it across that year's 12 months.
    // calculateYearsToTarget calls the schedule per-month; drawing inside it
    // would average 12 sub-draws and silently understate annual volatility.
    const yearly: number[] = new Array(MAX_PROJECTION_YEARS);
    if (stdSeries) {
      // Location-scale: r(y) = meanForYear(y) + z·vol, z a circular-block-drawn
      // standardized historical deviation (preserves the real serial structure), floored.
      const z = fillBlockBootstrapZ(stdSeries, blockLen, MAX_PROJECTION_YEARS, rng);
      for (let y = 0; y < MAX_PROJECTION_YEARS; y++) {
        yearly[y] = Math.max(RETURN_FLOOR, meanForYear(y) + z[y] * input.volatility);
      }
    } else {
      for (let y = 0; y < MAX_PROJECTION_YEARS; y++) {
        yearly[y] = annualReturnFromStdNormal(meanForYear(y), input.volatility, nextNormal(rng));
      }
    }
    const schedule = (yearIndex: number): number => yearly[Math.min(yearIndex, MAX_PROJECTION_YEARS - 1)];

    const raw = calculateYearsToTarget(
      input.currentCorpus,
      targetSchedule,
      input.monthlySavings,
      schedule,
    );
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

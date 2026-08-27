/**
 * Per-lever confidence band (objective 2, gh-issue #48) — the honesty companion to the deterministic
 * lever-impact ranking. ONLY the variance-bearing lever (the risk-notch, which raises expected return
 * by shifting toward equity) gets a band: on a deterministic years-to-FIRE yardstick a return-raising
 * lever reads as a free lunch next to the risk-neutral cashflow levers (trim / 80CCD / save-more),
 * because it hides the wider spread of outcomes the added equity variance creates. This module closes
 * the HONESTY CAVEAT written into `lever-catalog.ts`'s risk-notch note: it reports the FIRE date as a
 * RANGE (p10 fast … p90 slow), not a single optimistic point.
 *
 * NO PARALLEL BAND METHOD: it reuses the objective-1 Monte Carlo engine (`monte-carlo.ts`,
 * history-fed block-bootstrap over the real Indian-equity series) on the PERTURBED baseline — the
 * risk-notch's higher expected return AND its higher portfolio volatility — and reports the FIRE-date
 * percentile spread in the SAME real frame as the headline (#20 invariant). The higher volatility is
 * the whole point: the band must widen (and its worse-left tail deepen), not just shift the mean.
 *
 * Keep pure (no store/DOM) per `.claude/rules/calculation-modules.md`.
 */
import { runMonteCarloFire, INDIA_EQUITY_ANNUAL_RETURNS, MAX_PROJECTION_YEARS } from "./monte-carlo";
import { blendPortfolioVolatility, type PortfolioReturnWeights } from "./assumption-math";
import { resolveBaselineSchedules, type FireBaseline } from "./lever-impact";

/**
 * Perturbed portfolio volatility after shifting `notchPoints` percentage-points of the portfolio into
 * equity, funded ONLY from the genuinely DEFENSIVE (low-σ) sleeve — debt, ppf, epf, gold, other —
 * scaled down proportionally (total fixed). Funding from the defensive sleeve (never from already
 * equity-like international/reit/crypto, whose σ ≥ equity's) GUARANTEES the blended σ rises — the added
 * variance the risk-notch band exists to disclose. Pure (no store/DOM). Returns null when there is no
 * shift to make or no defensive sleeve to redeploy (caller then renders no band).
 */
export function volatilityAfterEquityNotch(
  weights: PortfolioReturnWeights,
  notchPoints: number,
): number | null {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  if (total <= 0 || notchPoints <= 0) return null;
  const defensiveTotal = weights.debt + weights.ppf + weights.epf + weights.gold + weights.other;
  if (defensiveTotal <= 0) return null;
  const shiftAmt = Math.min((notchPoints / 100) * total, defensiveTotal);
  const factor = Math.max(0, (defensiveTotal - shiftAmt) / defensiveTotal);
  return blendPortfolioVolatility({
    equity: weights.equity + shiftAmt,
    debt: weights.debt * factor,
    ppf: weights.ppf * factor,
    epf: weights.epf * factor,
    gold: weights.gold * factor,
    other: weights.other * factor,
    // equity-like + crypto sleeves untouched (funding equity from them would not raise σ).
    realEstate: weights.realEstate,
    nps: weights.nps,
    international: weights.international,
    reit: weights.reit,
    crypto: weights.crypto,
  });
}

export interface LeverBand {
  /** 10th-percentile years-to-FIRE — the optimistic / fast outcome. */
  p10Years: number;
  /**
   * Median (p50) years-to-FIRE. NOTE: the median, not the distribution mean — the FIRE-date
   * distribution is right-skewed so the true mean sits later than p50; `p90Years` is the honesty anchor.
   */
  expectedYears: number;
  /** 90th-percentile years-to-FIRE — the conservative / slow outcome (the honesty anchor). */
  p90Years: number;
}

export interface LeverBandInput {
  /**
   * The PERTURBED baseline this lever produces (e.g. `riskNotchLever.apply(baseline)`) — its
   * `expectedReturn` is the post-notch REAL return. The corpus/target/savings are unchanged by the
   * risk-notch, so they carry through from the original baseline.
   */
  baseline: FireBaseline;
  /**
   * The PERTURBED portfolio volatility (annual σ) of the higher-equity allocation — REAL frame,
   * blended exactly like the obj-1 headline band's `portfolioVolatility`. MUST be higher than the
   * pre-notch σ (more equity ⇒ more variance); that wider spread is what the band exists to show.
   */
  volatility: number;
  /** Simulated paths (default inherited from `runMonteCarloFire` = 1000) — more ⇒ smoother tails. */
  paths?: number;
  /** PRNG seed (default inherited from `runMonteCarloFire` = 1) — fixed ⇒ reproducible band (tests + caching). */
  seed?: number;
}

/**
 * Confidence band (real-frame FIRE-date percentiles) for a variance-bearing lever, via the obj-1
 * Monte Carlo engine on the perturbed baseline. Returns `null` (NOT a fake band) when the conservative
 * tail never reaches FIRE within the projection horizon — mirroring `lever-impact`'s reachability
 * convention (`< MAX_PROJECTION_YEARS`), so a perturbed path that does not reliably reach FIRE is
 * surfaced as "no band", never a clamped/optimistic range.
 *
 * CALLER HONESTY NOTE (empirically measured, not assumed): the history-fed, mean-reverting engine
 * keeps the band's MEDIAN (`expectedYears`) ANCHORED at/near the deterministic "N years sooner" point
 * the engine produces for the same lever (tighter than an IID lognormal, which would drag the median
 * later via the σ²/2 geometric drag). The honesty therefore lives in the CONSERVATIVE TAIL: `p90Years`
 * is materially later than the deterministic point, so the variance-bearing lever can never read as a
 * guaranteed win. The card MUST surface the p90 tail as the honest "slow case" alongside the point —
 * never present the deterministic point as a risk-free outcome (FinTech 2026-06-06, rule 31).
 */
export function computeLeverBand(input: LeverBandInput): LeverBand | null {
  const mc = runMonteCarloFire({
    currentCorpus: input.baseline.currentCorpus,
    targetCorpus: input.baseline.targetCorpus,
    // ADR-0006: the band must bracket the SAME plan the deterministic point came from — a drifting
    // target and a stepping-up, CPI-indexed contribution. Built from the one shared helper so the
    // point and its band can never diverge into two models.
    targetGrowthRate: input.baseline.targetGrowthRate,
    monthlySavings: input.baseline.monthlySavings,
    monthlySavingsSchedule: resolveBaselineSchedules(input.baseline).savings,
    meanReturn: input.baseline.expectedReturn,
    volatility: input.volatility,
    // Borrow the real Indian-equity SHAPE + serial structure (mean-reversion) like the headline band,
    // location-scaled to this perturbed mean + σ. On the IID/zero-vol path this is inert.
    historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS,
    paths: input.paths,
    seed: input.seed,
  });
  // No honest band if the conservative tail does not reach FIRE within the horizon (off the chart).
  // `!(p90 < MAX)` (not `p90 >= MAX`) so a NaN p90 also fails CLOSED → null, never a fake band.
  if (!(mc.p90Years < MAX_PROJECTION_YEARS)) return null;
  return { p10Years: mc.p10Years, expectedYears: mc.p50Years, p90Years: mc.p90Years };
}

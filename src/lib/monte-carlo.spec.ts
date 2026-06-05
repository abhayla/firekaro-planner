import { describe, it, expect } from "vitest";
import {
  runMonteCarloFire,
  sampleAnnualReturns,
  sampleBlockBootstrapReturns,
  standardizeSeries,
  RETURN_BUCKET_VOLATILITY,
  INDIA_EQUITY_ANNUAL_RETURNS,
  BOOTSTRAP_BLOCK_YEARS,
} from "./monte-carlo";
import { calculateYearsToTarget } from "./fire-math";

/** Arithmetic mean / population stdev of a sample — for moment-recovery assertions. */
function meanStd(xs: number[]): { mean: number; std: number } {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / xs.length;
  return { mean, std: Math.sqrt(variance) };
}

/** Fisher–Pearson skewness — proves the band inherits the REAL return shape, not the lognormal artifact. */
function skewness(xs: number[]): number {
  const { mean, std } = meanStd(xs);
  if (std <= 0) return 0;
  return xs.reduce((s, x) => s + ((x - mean) / std) ** 3, 0) / xs.length;
}

/** Lag-1 autocorrelation — proves the bootstrap captures the real serial structure (mean reversion). */
function lag1Autocorr(xs: number[]): number {
  const { mean } = meanStd(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    den += (xs[i] - mean) ** 2;
    if (i > 0) num += (xs[i] - mean) * (xs[i - 1] - mean);
  }
  return den > 0 ? num / den : 0;
}

/**
 * Monte Carlo FIRE confidence engine (gh-issue #18 — Tier-0 honesty).
 * The headline FIRE date is a probability distribution, not a deterministic point.
 * These tests pin the statistical contract; the FinTech-domain validity of the
 * return model is reviewed independently (rule 29).
 */
describe("runMonteCarloFire", () => {
  const base = {
    currentCorpus: 2_000_000,
    targetCorpus: 30_000_000,
    monthlySavings: 100_000,
    meanReturn: 0.12,
    horizonYears: 60,
    paths: 2000,
    seed: 42,
  };

  it("collapses to the deterministic result when volatility is zero", () => {
    const det = calculateYearsToTarget(base.currentCorpus, base.targetCorpus, base.monthlySavings, base.meanReturn);
    const mc = runMonteCarloFire({ ...base, volatility: 0 });
    // Zero vol ⇒ every path identical ⇒ all percentiles equal the deterministic years.
    expect(mc.p10Years).toBeCloseTo(det, 5);
    expect(mc.p50Years).toBeCloseTo(det, 5);
    expect(mc.p90Years).toBeCloseTo(det, 5);
  });

  it("orders percentiles p10 <= p50 <= p90 (more years = worse outcome)", () => {
    const mc = runMonteCarloFire({ ...base, volatility: 0.18 });
    expect(mc.p10Years).toBeLessThanOrEqual(mc.p50Years);
    expect(mc.p50Years).toBeLessThanOrEqual(mc.p90Years);
  });

  it("widens the band as volatility rises (sequence-of-returns honesty)", () => {
    const lowVol = runMonteCarloFire({ ...base, volatility: 0.08 });
    const highVol = runMonteCarloFire({ ...base, volatility: 0.25 });
    const lowBand = lowVol.p90Years - lowVol.p10Years;
    const highBand = highVol.p90Years - highVol.p10Years;
    expect(highBand).toBeGreaterThan(lowBand);
  });

  it("is deterministic for a fixed seed (reproducible)", () => {
    const a = runMonteCarloFire({ ...base, volatility: 0.18 });
    const b = runMonteCarloFire({ ...base, volatility: 0.18 });
    expect(a.p50Years).toBe(b.p50Years);
    expect(a.successProbabilityByYear).toEqual(b.successProbabilityByYear);
  });

  it("returns a cumulative (non-decreasing) success probability by year, in [0,1]", () => {
    const mc = runMonteCarloFire({ ...base, volatility: 0.18 });
    expect(mc.successProbabilityByYear.length).toBe(base.horizonYears + 1);
    for (let y = 1; y < mc.successProbabilityByYear.length; y++) {
      expect(mc.successProbabilityByYear[y]).toBeGreaterThanOrEqual(mc.successProbabilityByYear[y - 1]);
      expect(mc.successProbabilityByYear[y]).toBeGreaterThanOrEqual(0);
      expect(mc.successProbabilityByYear[y]).toBeLessThanOrEqual(1);
    }
  });

  it("reports 0 years and full success when already at/above target", () => {
    const mc = runMonteCarloFire({ ...base, currentCorpus: 40_000_000, volatility: 0.18 });
    expect(mc.p50Years).toBe(0);
    expect(mc.successProbabilityByYear[0]).toBe(1);
  });

  it("honesty: the conservative (p90) date is later than the median — never hides downside", () => {
    const mc = runMonteCarloFire({ ...base, volatility: 0.2 });
    expect(mc.p90Years).toBeGreaterThan(mc.p50Years);
  });

  // SUBSTANCE tests (FinTech review 2026-06-03) — these fail on the original
  // optimism bugs, not just on shape.

  it("return distribution is moment-matched to (mean, vol) with NO upward bias, even at high vol (#18 H1)", () => {
    const xs = sampleAnnualReturns(0.12, 0.3, 50_000, 7);
    let sum = 0;
    let min = Infinity;
    for (const x of xs) {
      sum += x;
      if (x < min) min = x;
    }
    const mean = sum / xs.length;
    let sq = 0;
    for (const x of xs) sq += (x - mean) * (x - mean);
    const sd = Math.sqrt(sq / xs.length);
    expect(Math.abs(mean - 0.12)).toBeLessThan(0.01); // no floor-induced upward shift
    expect(Math.abs(sd - 0.3)).toBeLessThan(0.02); // stated volatility preserved
    expect(min).toBeGreaterThan(-1); // lognormal ⇒ no impossible worse-than-total loss
  });

  it("never-reach-FIRE paths sort to the WORST end and surface P(never reach) (#18 M2)", () => {
    // monthlySavings 0 ⇒ corpus alone can't close the gap ⇒ every path never reaches.
    const mc = runMonteCarloFire({
      currentCorpus: 1_000_000,
      targetCorpus: 50_000_000,
      monthlySavings: 0,
      meanReturn: 0.12,
      volatility: 0.2,
      horizonYears: 30,
      paths: 500,
      seed: 5,
    });
    expect(mc.probabilityNeverReachFire).toBe(1);
    expect(mc.p50Years).toBeGreaterThan(30); // sentinel — NOT capped below the horizon
  });

  it("a reaching plan reports a low P(never reach)", () => {
    const mc = runMonteCarloFire({ ...base, volatility: 0.18 });
    expect(mc.probabilityNeverReachFire).toBeLessThan(0.05);
  });

  // #24 Part 1 — the per-year MEAN schedule (glide taper).
  describe("meanReturnSchedule (#24 Part 1 — glide taper)", () => {
    it("a DECLINING mean schedule de-risks → LATER p50 than a flat-high scalar", () => {
      // Flat 0.09 throughout vs a glide that tapers 0.09 → 0.04 over the horizon. The
      // tapered plan earns LESS in later years, so it must reach FIRE LATER (higher p50).
      const flat = runMonteCarloFire({ ...base, meanReturn: 0.09, volatility: 0.12 });
      const declining = (y: number) => 0.09 - (0.05 * Math.min(y, 30)) / 30; // 0.09 → 0.04 by y=30
      const tapered = runMonteCarloFire({
        ...base,
        meanReturn: 0.09, // ignored when the schedule is present; kept as the documented fallback
        meanReturnSchedule: declining,
        volatility: 0.12,
      });
      expect(
        tapered.p50Years,
        `tapered p50 ${tapered.p50Years.toFixed(1)} must exceed flat-0.09 p50 ${flat.p50Years.toFixed(1)}`,
      ).toBeGreaterThan(flat.p50Years);
    });

    it("a CONSTANT-valued schedule equals the scalar of that value (resolution sanity)", () => {
      const scalar = runMonteCarloFire({ ...base, meanReturn: 0.1, volatility: 0.15 });
      const constSchedule = runMonteCarloFire({
        ...base,
        meanReturn: 0.1,
        meanReturnSchedule: () => 0.1,
        volatility: 0.15,
      });
      expect(constSchedule.p50Years).toBe(scalar.p50Years);
      expect(constSchedule.successProbabilityByYear).toEqual(scalar.successProbabilityByYear);
    });

    it("an ABSENT schedule is byte-identical to the scalar path (backward-compat)", () => {
      const withoutSchedule = runMonteCarloFire({ ...base, meanReturn: 0.11, volatility: 0.18 });
      const explicitUndefined = runMonteCarloFire({
        ...base,
        meanReturn: 0.11,
        meanReturnSchedule: undefined,
        volatility: 0.18,
      });
      expect(explicitUndefined.p50Years).toBe(withoutSchedule.p50Years);
      expect(explicitUndefined.p10Years).toBe(withoutSchedule.p10Years);
      expect(explicitUndefined.p90Years).toBe(withoutSchedule.p90Years);
      expect(explicitUndefined.successProbabilityByYear).toEqual(withoutSchedule.successProbabilityByYear);
      expect(explicitUndefined.probabilityNeverReachFire).toBe(withoutSchedule.probabilityNeverReachFire);
    });
  });
});

describe("RETURN_BUCKET_VOLATILITY — non-understatement floors (#18)", () => {
  // An UNDER-stated σ shrinks the confidence band and manufactures false
  // confidence — for the accumulator that is the optimistic failure mode. These
  // FinTech-validated floors (2026-06-03) must not be "tidied" downward.
  it("real estate σ is the true-economic floor, NOT the appraisal-smoothed 0.12", () => {
    expect(RETURN_BUCKET_VOLATILITY.realEstate).toBeGreaterThanOrEqual(0.15);
  });
  it("NPS σ reflects its equity sleeve (≥ 0.12, never debt-like)", () => {
    expect(RETURN_BUCKET_VOLATILITY.nps).toBeGreaterThanOrEqual(0.12);
  });
  it("international σ carries FX vol on top of equity (≥ 0.22)", () => {
    expect(RETURN_BUCKET_VOLATILITY.international).toBeGreaterThanOrEqual(0.22);
  });
  it("equity σ tracks the Nifty 20yr band (≥ 0.20)", () => {
    expect(RETURN_BUCKET_VOLATILITY.equity).toBeGreaterThanOrEqual(0.2);
  });
  it("crypto σ is a high floor (≥ 0.60)", () => {
    expect(RETURN_BUCKET_VOLATILITY.crypto).toBeGreaterThanOrEqual(0.6);
  });
  it("sovereign-fixed buckets (ppf/epf) are ~cash and debt stays low", () => {
    expect(RETURN_BUCKET_VOLATILITY.ppf).toBeLessThanOrEqual(0.02);
    expect(RETURN_BUCKET_VOLATILITY.epf).toBeLessThanOrEqual(0.02);
    expect(RETURN_BUCKET_VOLATILITY.debt).toBeLessThanOrEqual(0.06);
  });
});

// #24 Part 2 — HISTORY-FED block-bootstrap (samples real bad-year clustering IID omits).
describe("history-fed block-bootstrap (#24 Part 2)", () => {
  const base = {
    currentCorpus: 2_000_000,
    targetCorpus: 30_000_000,
    monthlySavings: 100_000,
    meanReturn: 0.1,
    horizonYears: 80,
    paths: 3000,
    seed: 42,
  };

  // --- The embedded historical series: substance/plausibility lock (not just "is an array"). ---
  describe("INDIA_EQUITY_ANNUAL_RETURNS — representative Sensex series", () => {
    it("spans ~3+ decades of real calendar-year returns", () => {
      expect(INDIA_EQUITY_ANNUAL_RETURNS.length).toBeGreaterThanOrEqual(30);
    });
    it("carries a realistic equity mean (representative, ~12–25%)", () => {
      const { mean } = meanStd([...INDIA_EQUITY_ANNUAL_RETURNS]);
      expect(mean).toBeGreaterThan(0.12);
      expect(mean).toBeLessThan(0.25);
    });
    it("contains the real crash + rebound shape that IID can't manufacture", () => {
      // A genuine deep crash year (2008 ≈ −52%) and a >50% rebound (2009 ≈ +76%) must be
      // present — these (and their adjacency) are the clustering the bootstrap borrows.
      expect(Math.min(...INDIA_EQUITY_ANNUAL_RETURNS)).toBeLessThanOrEqual(-0.45);
      expect(Math.max(...INDIA_EQUITY_ANNUAL_RETURNS)).toBeGreaterThanOrEqual(0.6);
    });
    it("standardizes to mean≈0, stdev≈1 (the deviation shape the engine consumes)", () => {
      const { mean, std } = meanStd(standardizeSeries(INDIA_EQUITY_ANNUAL_RETURNS));
      expect(Math.abs(mean)).toBeLessThan(1e-9);
      expect(std).toBeCloseTo(1, 6);
    });
  });

  it("is WIRED — passing the series changes the result vs the IID path (matched mean/vol/seed)", () => {
    const iid = runMonteCarloFire({ ...base, volatility: 0.2 });
    const boot = runMonteCarloFire({ ...base, volatility: 0.2, historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS });
    // Different model ⇒ the success curve must differ somewhere (proves not silently ignored).
    expect(boot.successProbabilityByYear).not.toEqual(iid.successProbabilityByYear);
  });

  it("ABSENT / empty series ⇒ byte-identical to the IID path (backward-compat)", () => {
    const iid = runMonteCarloFire({ ...base, volatility: 0.18 });
    const emptyArr = runMonteCarloFire({ ...base, volatility: 0.18, historicalReturns: [] });
    const undef = runMonteCarloFire({ ...base, volatility: 0.18, historicalReturns: undefined });
    expect(emptyArr.successProbabilityByYear).toEqual(iid.successProbabilityByYear);
    expect(emptyArr.p50Years).toBe(iid.p50Years);
    expect(undef.successProbabilityByYear).toEqual(iid.successProbabilityByYear);
  });

  it("is deterministic for a fixed seed (reproducible)", () => {
    const a = runMonteCarloFire({ ...base, volatility: 0.2, historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS });
    const b = runMonteCarloFire({ ...base, volatility: 0.2, historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS });
    expect(a.p50Years).toBe(b.p50Years);
    expect(a.successProbabilityByYear).toEqual(b.successProbabilityByYear);
  });

  // SUBSTANCE 1 (FinTech-required): moment recovery — the mapped returns must still
  // recover (mean, vol), proving the −0.95 floor stays inert (no optimistic mean-lift).
  it("moment-recovers (mean, vol) — the floor does NOT lift the mean (#24 Part 2 floor guard)", () => {
    for (const [mean, vol] of [
      [0.06, 0.12],
      [0.08, 0.2],
    ] as const) {
      const xs = sampleBlockBootstrapReturns(INDIA_EQUITY_ANNUAL_RETURNS, mean, vol, 60_000, BOOTSTRAP_BLOCK_YEARS, 7);
      const { mean: m, std: s } = meanStd(xs);
      expect(Math.abs(m - mean), `realized mean ${m.toFixed(4)} vs ${mean}`).toBeLessThan(0.01);
      expect(Math.abs(s - vol), `realized stdev ${s.toFixed(4)} vs ${vol}`).toBeLessThan(0.02);
    }
  });

  // SUBSTANCE 2 (FinTech-required): the band inherits the REAL return SHAPE — its skew
  // matches the historical series (~+0.21) and is DISTINCT from the IID lognormal's
  // moment-matching artifact (~+0.59). This proves we escaped the parametric artifact;
  // it is the strongest single "the band is real, not shape-only" lock.
  it("inherits the REAL return skew (≈ historical), NOT the lognormal artifact (#24 Part 2)", () => {
    const histSkew = skewness([...INDIA_EQUITY_ANNUAL_RETURNS]); // ~+0.21 (standardisation preserves skew)
    const boot = sampleBlockBootstrapReturns(INDIA_EQUITY_ANNUAL_RETURNS, 0.09, 0.22, 60_000, BOOTSTRAP_BLOCK_YEARS, 3);
    const iid = sampleAnnualReturns(0.09, 0.22, 60_000, 3);
    const bootSkew = skewness(boot);
    const iidSkew = skewness(iid);
    expect(Math.abs(bootSkew - histSkew), `boot skew ${bootSkew.toFixed(3)} vs hist ${histSkew.toFixed(3)}`)
      .toBeLessThan(0.1);
    // The lognormal's bounding-artifact right-skew is materially heavier — we are NOT it.
    expect(iidSkew, `IID skew ${iidSkew.toFixed(3)} must exceed boot skew ${bootSkew.toFixed(3)} + margin`)
      .toBeGreaterThan(bootSkew + 0.2);
  });

  // SUBSTANCE 3 (FinTech-required): the band captures the REAL serial structure — annual
  // Indian equity MEAN-REVERTS (lag-1 autocorr ≈ −0.20), which IID (≈0) cannot represent.
  // The bl=1 guard proves it is the BLOCK mechanism (not the series) that transmits it.
  it("captures the real mean-reversion serial structure (lag-1 < 0), absent in IID (#24 Part 2)", () => {
    const boot5 = sampleBlockBootstrapReturns(INDIA_EQUITY_ANNUAL_RETURNS, 0.09, 0.22, 60_000, 5, 3);
    const boot1 = sampleBlockBootstrapReturns(INDIA_EQUITY_ANNUAL_RETURNS, 0.09, 0.22, 60_000, 1, 3);
    const iid = sampleAnnualReturns(0.09, 0.22, 60_000, 3);
    expect(lag1Autocorr(boot5), "block=5 must transmit the historical mean-reversion (< −0.10)").toBeLessThan(-0.1);
    expect(Math.abs(lag1Autocorr(iid)), "IID has no serial structure").toBeLessThan(0.05);
    expect(Math.abs(lag1Autocorr(boot1)), "block=1 destroys serial structure (proves the BLOCK transmits it)")
      .toBeLessThan(0.05);
  });

  // SUBSTANCE 4 (FinTech-required, the EMPIRICALLY-TRUE inverse of the deleted false test):
  // the history-fed band is TIGHTER-OR-EQUAL to IID on the slow tail BY DESIGN — the
  // lognormal's fat slow-tail was a moment-matching artifact + real returns mean-revert.
  // Locking the true relationship makes a future tail-blowout a SIGNAL, not silently OK.
  it("slow tail is TIGHTER-or-equal to IID (lognormal's fat tail was an artifact) (#24 Part 2)", () => {
    const personas = [
      { targetCorpus: 30_000_000, monthlySavings: 100_000, meanReturn: 0.1, volatility: 0.2 },
      { targetCorpus: 60_000_000, monthlySavings: 45_000, meanReturn: 0.09, volatility: 0.22 },
      { targetCorpus: 50_000_000, monthlySavings: 30_000, meanReturn: 0.08, volatility: 0.24 },
    ];
    for (const p of personas) {
      const iid = runMonteCarloFire({ ...base, ...p, paths: 4000 });
      const boot = runMonteCarloFire({ ...base, ...p, paths: 4000, historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS });
      expect(
        boot.p90Years,
        `boot p90 ${boot.p90Years.toFixed(1)} must be <= IID p90 ${iid.p90Years.toFixed(1)} + tol (more-real, not heavier)`,
      ).toBeLessThanOrEqual(iid.p90Years + 1);
    }
  });

  // SUBSTANCE 3 (FinTech-required): the mean stays ANCHORED — p50 sits ≈ the deterministic
  // headline, and NEVER materially faster (a faster p50 ⇒ mean leaked upward = the
  // optimistic bug this whole feature exists to kill). Clustering may push it a touch later.
  it("p50 is anchored to the deterministic headline — never faster, at most a touch slower", () => {
    const det = calculateYearsToTarget(base.currentCorpus, base.targetCorpus, base.monthlySavings, base.meanReturn);
    const boot = runMonteCarloFire({ ...base, volatility: 0.18, historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS });
    expect(boot.p50Years, `boot p50 ${boot.p50Years.toFixed(1)} must not be faster than headline ${det.toFixed(1)}`)
      .toBeGreaterThanOrEqual(det - 1);
    expect(boot.p50Years, `boot p50 ${boot.p50Years.toFixed(1)} drifted too far past headline ${det.toFixed(1)}`)
      .toBeLessThanOrEqual(det + 6);
  });

  // The per-year MEAN schedule still drives the band ON the bootstrap path (deviations
  // wrap around meanForYear(y), NOT a scalar) — mirrors the #24 Part 1 glide test.
  it("applies the per-year mean schedule (declining glide ⇒ LATER p50) on the bootstrap path", () => {
    const flat = runMonteCarloFire({
      ...base,
      meanReturn: 0.09,
      volatility: 0.14,
      historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS,
    });
    const declining = (y: number) => 0.09 - (0.05 * Math.min(y, 30)) / 30; // 0.09 → 0.04 by y=30
    const tapered = runMonteCarloFire({
      ...base,
      meanReturn: 0.09,
      meanReturnSchedule: declining,
      volatility: 0.14,
      historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS,
    });
    expect(tapered.p50Years).toBeGreaterThan(flat.p50Years);
  });
});

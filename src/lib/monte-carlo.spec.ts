import { describe, it, expect } from "vitest";
import { runMonteCarloFire, sampleAnnualReturns } from "./monte-carlo";
import { calculateYearsToTarget } from "./fire-math";

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
});

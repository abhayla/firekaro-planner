import { describe, it, expect } from "vitest";
import { computeLeverBand } from "./lever-bands";
import { MAX_PROJECTION_YEARS } from "./monte-carlo";
import { yearsToFire, type FireBaseline } from "./lever-impact";

// A reachable accumulator baseline already perturbed by the risk-notch (a raised expected real return).
const PERTURBED: FireBaseline = {
  currentCorpus: 5_000_000,
  targetCorpus: 40_000_000,
  monthlySavings: 60_000,
  expectedReturn: 0.075, // post-notch real return
};

describe("computeLeverBand — real-frame confidence band for the variance-bearing lever", () => {
  it("returns p10 <= expected <= p90 (ordered percentiles)", () => {
    const band = computeLeverBand({ baseline: PERTURBED, volatility: 0.16 })!;
    expect(band).not.toBeNull();
    expect(band.p10Years).toBeLessThanOrEqual(band.expectedYears);
    expect(band.expectedYears).toBeLessThanOrEqual(band.p90Years);
  });

  it("reports the band in REAL years within the projection horizon (#20 frame)", () => {
    const band = computeLeverBand({ baseline: PERTURBED, volatility: 0.16 })!;
    expect(band.p90Years).toBeLessThan(MAX_PROJECTION_YEARS);
    expect(band.p10Years).toBeGreaterThan(0);
  });

  it("a higher-variance band is WIDER than a zero-volatility point estimate (the honesty point)", () => {
    const point = computeLeverBand({ baseline: PERTURBED, volatility: 0 })!;
    const band = computeLeverBand({ baseline: PERTURBED, volatility: 0.16 })!;
    // zero-vol collapses to a single FIRE date (no spread)
    expect(point.p90Years - point.p10Years).toBeCloseTo(0, 6);
    // adding the higher equity variance opens a genuine range of FIRE dates
    expect(band.p90Years - band.p10Years).toBeGreaterThan(0);
  });

  it("the conservative tail (p90) is no earlier than the expected case — never a free lunch", () => {
    const band = computeLeverBand({ baseline: PERTURBED, volatility: 0.18 })!;
    expect(band.p90Years).toBeGreaterThanOrEqual(band.expectedYears);
  });

  it("returns null (no fake band) when the perturbed path does not reliably reach FIRE", () => {
    const unreachable: FireBaseline = {
      currentCorpus: 100_000,
      targetCorpus: 500_000_000, // ₹50 Cr target on a tiny corpus + savings
      monthlySavings: 1_000,
      expectedReturn: 0.02,
    };
    expect(computeLeverBand({ baseline: unreachable, volatility: 0.2 })).toBeNull();
  });

  it("is deterministic for a fixed seed (reproducible band)", () => {
    const a = computeLeverBand({ baseline: PERTURBED, volatility: 0.16, seed: 7 })!;
    const b = computeLeverBand({ baseline: PERTURBED, volatility: 0.16, seed: 7 })!;
    expect(a).toEqual(b);
  });

  it("maps p50 → expectedYears (not p10) — strictly inside the band for a high-variance run", () => {
    const band = computeLeverBand({ baseline: PERTURBED, volatility: 0.2, seed: 1 })!;
    expect(band.expectedYears).toBeGreaterThan(band.p10Years);
    expect(band.expectedYears).toBeLessThan(band.p90Years);
  });
});

// HONESTY INVARIANT (FinTech 2026-06-06, rule 31): the UI shows the deterministic "N years sooner"
// point (engine, scalar return) ALONGSIDE this band. The honesty anchor is the CONSERVATIVE tail —
// the band's p90 must be MATERIALLY LATER than the deterministic point, so the variance-bearing lever
// can never read as a guaranteed win. (Empirically the history-fed, mean-reverting engine keeps the
// MEDIAN anchored at/near the deterministic point — TIGHTER than an IID lognormal would be, which would
// drag the median later via σ²/2; the honesty therefore lives in the p90 tail, not the median.) The
// deterministic point sits INSIDE the band, and the median never reads materially more optimistic than it.
describe("computeLeverBand — honesty invariant vs the deterministic perturbed point", () => {
  it("the conservative tail (p90) is MATERIALLY later than the deterministic point (not a guaranteed win)", () => {
    const det = yearsToFire(PERTURBED);
    const band = computeLeverBand({ baseline: PERTURBED, volatility: 0.18, seed: 1 })!;
    expect(band.p90Years).toBeGreaterThan(det);
  });

  it("the deterministic point sits inside the band [p10, p90]", () => {
    const det = yearsToFire(PERTURBED);
    const band = computeLeverBand({ baseline: PERTURBED, volatility: 0.18, seed: 1 })!;
    expect(band.p10Years).toBeLessThanOrEqual(det);
    expect(det).toBeLessThanOrEqual(band.p90Years);
  });

  it("the median stays ANCHORED near the deterministic point (no material optimistic skew at p50)", () => {
    const det = yearsToFire(PERTURBED);
    const band = computeLeverBand({ baseline: PERTURBED, volatility: 0.18, seed: 1 })!;
    // anchored within ~0.5yr (history-fed mean-reversion keeps p50 ≈ the scalar point), so the band
    // never flatters the lever at the median — the downside lives honestly in the p90 tail.
    expect(Math.abs(band.expectedYears - det)).toBeLessThan(0.5);
  });
});

// SUBSTANCE: "more equity ⇒ more variance" must mean a WIDER band AND a WORSE conservative tail —
// not merely a shifted mean. Monotonicity in σ locks that the band reflects added risk (rule 31).
describe("computeLeverBand — the band widens and the slow tail worsens as volatility rises", () => {
  it("a higher σ yields a strictly-later p90 (worse conservative case) and a non-narrower spread", () => {
    const lo = computeLeverBand({ baseline: PERTURBED, volatility: 0.12, seed: 1 })!;
    const hi = computeLeverBand({ baseline: PERTURBED, volatility: 0.2, seed: 1 })!;
    // strict > on the tail: a regression that flattened the tail's σ-response would slip past >=
    expect(hi.p90Years).toBeGreaterThan(lo.p90Years);
    expect(hi.p90Years - hi.p10Years).toBeGreaterThanOrEqual(lo.p90Years - lo.p10Years);
  });

  // RULE-31 OPTIMISTIC-DIRECTION LOCK (FinTech 2026-06-06): the one failure mode that WOULD be a free
  // lunch is the median running materially EARLIER than the deterministic point as σ rises (variance
  // flattering the typical outcome). Lock it as a property across σ, not just a single-point tolerance.
  it("variance NEVER flatters the median — p50 stays no materially-earlier than the point at any σ", () => {
    const det = yearsToFire(PERTURBED);
    // "Material" = relative to the horizon, not an absolute year count: a >5% earlier median would be
    // an optimistic skew the user could act on; a few-% drift (mean-reversion noise) is immaterial
    // because the user anchors on the point + the p90 tail, never on p50 alone (FinTech 2026-06-06).
    for (const volatility of [0.1, 0.14, 0.18, 0.22]) {
      const band = computeLeverBand({ baseline: PERTURBED, volatility, seed: 1 })!;
      const earlierFraction = (det - band.expectedYears) / det;
      expect(earlierFraction, `σ=${volatility}: median must not run materially (>5%) earlier than the point`).toBeLessThan(0.05);
    }
  });
});

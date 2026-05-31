import { describe, it, expect } from "vitest";
import {
  calculateEpfVpfYear,
  epfVpfOpportunityCostYears,
  epfBucketAfterTaxReturn,
  EPF_VPF_TAX_FREE_THRESHOLD,
  EPF_VPF_TAX_FREE_THRESHOLD_NO_EMPLOYER,
} from "./epf-vpf";

// The ₹2.5L EPF+VPF threshold rule (Budget 2021): interest on contributions
// ABOVE the threshold is taxed at slab. Tests pin the split, the post-tax
// effective-yield math, the ₹5L no-employer band, and the opportunity-cost
// payback used by the "cap your VPF" nudge.

describe("calculateEpfVpfYear — below the threshold", () => {
  it("treats a sub-₹2.5L contribution as fully tax-free (EEE)", () => {
    const r = calculateEpfVpfYear({ annualContribution: 200_000, marginalSlabRate: 0.3 });
    expect(r.taxFreeContribution).toBe(200_000);
    expect(r.taxableContribution).toBe(0);
    expect(r.taxableInterest).toBe(0);
    expect(r.taxOnExcessInterest).toBe(0);
    // effective yield == gross EPF rate when nothing is taxed
    expect(r.effectiveYield).toBe(0.0825);
  });

  it("treats a contribution exactly at the threshold as fully tax-free", () => {
    const r = calculateEpfVpfYear({ annualContribution: EPF_VPF_TAX_FREE_THRESHOLD, marginalSlabRate: 0.3 });
    expect(r.taxableContribution).toBe(0);
  });
});

describe("calculateEpfVpfYear — above the threshold", () => {
  it("splits the excess and taxes only the interest on it", () => {
    // ₹4.5L contribution, 30% slab, 8.25% rate.
    const r = calculateEpfVpfYear({ annualContribution: 450_000, marginalSlabRate: 0.3 });
    expect(r.taxFreeContribution).toBe(250_000);
    expect(r.taxableContribution).toBe(200_000);
    // interest: taxFree 250000*0.0825=20625; taxable 200000*0.0825=16500
    expect(r.taxFreeInterest).toBe(20_625);
    expect(r.taxableInterest).toBe(16_500);
    // tax on excess interest = 16500*0.3 = 4950; net = 11550
    expect(r.taxOnExcessInterest).toBe(4_950);
    expect(r.netExcessInterest).toBe(11_550);
    // effective yield = (20625 + 11550) / 450000 = 0.0715
    expect(r.effectiveYield).toBeCloseTo(0.0715, 4);
  });

  it("drops the effective yield as the slab rate rises (drag on the excess)", () => {
    const low = calculateEpfVpfYear({ annualContribution: 600_000, marginalSlabRate: 0.05 });
    const high = calculateEpfVpfYear({ annualContribution: 600_000, marginalSlabRate: 0.3 });
    expect(high.effectiveYield).toBeLessThan(low.effectiveYield);
    expect(low.effectiveYield).toBeLessThanOrEqual(0.0825);
  });

  it("honors a custom EPF rate", () => {
    const r = calculateEpfVpfYear({ annualContribution: 250_000, marginalSlabRate: 0.3, epfRate: 0.08 });
    expect(r.taxFreeInterest).toBe(20_000); // 250000 * 0.08
  });
});

describe("calculateEpfVpfYear — no-employer ₹5L band", () => {
  it("uses the ₹5L threshold when the employer does not contribute", () => {
    const r = calculateEpfVpfYear({
      annualContribution: 500_000,
      marginalSlabRate: 0.3,
      employerContributes: false,
    });
    expect(EPF_VPF_TAX_FREE_THRESHOLD_NO_EMPLOYER).toBe(500_000);
    expect(r.taxableContribution).toBe(0); // all tax-free under the ₹5L band
  });

  it("taxes only the portion above ₹5L in the no-employer case", () => {
    const r = calculateEpfVpfYear({
      annualContribution: 700_000,
      marginalSlabRate: 0.3,
      employerContributes: false,
    });
    expect(r.taxFreeContribution).toBe(500_000);
    expect(r.taxableContribution).toBe(200_000);
  });
});

describe("calculateEpfVpfYear — guards", () => {
  it("returns zero effective yield for a zero contribution", () => {
    const r = calculateEpfVpfYear({ annualContribution: 0, marginalSlabRate: 0.3 });
    expect(r.effectiveYield).toBe(0);
  });
});

describe("epfVpfOpportunityCostYears", () => {
  it("returns Infinity when there is no excess contribution", () => {
    expect(epfVpfOpportunityCostYears(0, 0.3)).toBe(Infinity);
  });

  it("returns Infinity when EPF after-tax beats the equity alternative", () => {
    // very low slab + low equity return → EPF after-tax can exceed equity → no gap
    expect(epfVpfOpportunityCostYears(200_000, 0.0, 0.0825, 0.05)).toBe(Infinity);
  });

  it("computes the years to ₹1L of foregone return for a high-slab earner", () => {
    // gap = 0.12 - 0.0825*(1-0.3) = 0.12 - 0.05775 = 0.06225
    // annualGap on ₹2L excess = 12450 → 100000/12450 ≈ 8.03 → round 8
    expect(epfVpfOpportunityCostYears(200_000, 0.3)).toBe(8);
  });

  it("shortens the payback as the excess grows (nudge fires sooner)", () => {
    const small = epfVpfOpportunityCostYears(200_000, 0.3);
    const large = epfVpfOpportunityCostYears(1_000_000, 0.3);
    expect(large).toBeLessThan(small);
  });
});

describe("epfBucketAfterTaxReturn (A15.3 — blended-return EPF bucket drag)", () => {
  const EPF = 0.0825;

  it("is an exact no-op at/below the ₹2.5L threshold (any slab)", () => {
    expect(epfBucketAfterTaxReturn({ annualContribution: 0, marginalSlabRate: 0.3 })).toBe(EPF);
    expect(epfBucketAfterTaxReturn({ annualContribution: 150_000, marginalSlabRate: 0.3 })).toBe(EPF);
    expect(epfBucketAfterTaxReturn({ annualContribution: 250_000, marginalSlabRate: 0.3 })).toBe(EPF);
  });

  it("drags the effective yield strictly below epfRate above the threshold at a 30% slab", () => {
    const r = epfBucketAfterTaxReturn({ annualContribution: 600_000, marginalSlabRate: 0.3 });
    expect(r).toBeLessThan(EPF);
    // matches calculateEpfVpfYear's effectiveYield for the same inputs
    expect(r).toBe(
      calculateEpfVpfYear({
        annualContribution: 600_000,
        marginalSlabRate: 0.3,
        epfRate: EPF,
        employerContributes: true,
      }).effectiveYield,
    );
  });

  it("no drag above the threshold when the slab rate is 0% (no tax to apply)", () => {
    expect(epfBucketAfterTaxReturn({ annualContribution: 600_000, marginalSlabRate: 0 })).toBe(EPF);
  });

  it("uses the ₹5L band when the employer does not contribute", () => {
    // ₹400K contribution: above ₹2.5L but below the ₹5L no-employer band → no drag
    expect(
      epfBucketAfterTaxReturn({
        annualContribution: 400_000,
        marginalSlabRate: 0.3,
        employerContributes: false,
      }),
    ).toBe(EPF);
  });

  it("deeper drag at a higher slab for the same excess", () => {
    const at20 = epfBucketAfterTaxReturn({ annualContribution: 800_000, marginalSlabRate: 0.2 });
    const at30 = epfBucketAfterTaxReturn({ annualContribution: 800_000, marginalSlabRate: 0.3 });
    expect(at30).toBeLessThan(at20);
    expect(at20).toBeLessThan(EPF);
  });
});

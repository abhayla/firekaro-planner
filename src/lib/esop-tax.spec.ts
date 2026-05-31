import { describe, it, expect } from "vitest";
import {
  calculatePerquisite,
  calculateEsopCapitalGains,
  LTCG_LISTED_EXEMPTION,
} from "./esop-tax";
import type { Investment } from "@/types/household";

// ESOP/RSU is a two-layer tax event: Layer 1 perquisite at vest/exercise
// (slab), Layer 2 capital gains at sale (LTCG/STCG post FY24-25). Tests pin
// the Indian-vs-foreign perquisite split, the spread approximation, and the
// four capital-gains branches + holding-period boundaries.

function esop(overrides: Partial<Investment> = {}): Investment {
  return {
    id: "i1",
    type: "ESOP",
    value: 1_000_000,
    ownerId: "m1",
    ...overrides,
  } as Investment;
}

describe("calculatePerquisite — Layer 1", () => {
  it("returns zero for a non-ESOP holding", () => {
    const r = calculatePerquisite({ inv: esop({ type: "Stocks" }), marginalSlabRate: 0.3 });
    expect(r.perquisiteValue).toBe(0);
    expect(r.perquisiteTax).toBe(0);
  });

  it("Indian ESOP: perquisite = vested × (fmv-ep)/fmv, taxed at slab, at exercise", () => {
    const r = calculatePerquisite({
      inv: esop({ grantorCountry: "India", vestedValueINR: 1_000_000, fmvAtVest: 100, exercisePrice: 40 }),
      marginalSlabRate: 0.3,
    });
    // spread = (100-40)/100 = 0.6 → 600000 perquisite
    expect(r.perquisiteValue).toBe(600_000);
    expect(r.perquisiteTax).toBe(180_000);
    expect(r.triggerAt).toBe("exercise");
  });

  it("Indian ESOP with missing fmv/ep falls back to full vested value (conservative)", () => {
    const r = calculatePerquisite({
      inv: esop({ grantorCountry: "India", vestedValueINR: 800_000 }),
      marginalSlabRate: 0.3,
    });
    expect(r.perquisiteValue).toBe(800_000);
    expect(r.perquisiteTax).toBe(240_000);
    expect(r.triggerAt).toBe("exercise");
  });

  it("Indian ESOP where exercise price ≥ fmv also falls back to full vested value", () => {
    const r = calculatePerquisite({
      inv: esop({ grantorCountry: "India", vestedValueINR: 500_000, fmvAtVest: 100, exercisePrice: 100 }),
      marginalSlabRate: 0.3,
    });
    expect(r.perquisiteValue).toBe(500_000);
  });

  it("Foreign RSU (US): full vested value at vest", () => {
    const r = calculatePerquisite({
      inv: esop({ grantorCountry: "US", vestedValueINR: 1_200_000 }),
      marginalSlabRate: 0.3,
    });
    expect(r.perquisiteValue).toBe(1_200_000);
    expect(r.perquisiteTax).toBe(360_000);
    expect(r.triggerAt).toBe("vest");
  });

  it("falls back to inv.value when vestedValueINR is absent", () => {
    const r = calculatePerquisite({
      inv: esop({ grantorCountry: "US", value: 700_000 }),
      marginalSlabRate: 0.3,
    });
    expect(r.perquisiteValue).toBe(700_000);
  });

  it("defaults grantor to India when unspecified", () => {
    const r = calculatePerquisite({
      inv: esop({ vestedValueINR: 500_000, fmvAtVest: 200, exercisePrice: 50 }),
      marginalSlabRate: 0.3,
    });
    expect(r.triggerAt).toBe("exercise"); // India path
  });
});

describe("calculateEsopCapitalGains — Layer 2", () => {
  it("listed Indian LTCG: 12.5% above the ₹1.25L exemption", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 1_000_000,
      costBasisINR: 400_000,
      holdingMonths: 18,
      isListedIndian: true,
      marginalSlabRate: 0.3,
    });
    // gain 600000; taxable 600000-125000=475000; tax round(475000*0.125)=59375
    expect(r.classification).toBe("LTCG");
    expect(r.exemption).toBe(LTCG_LISTED_EXEMPTION);
    expect(r.tax).toBe(59_375);
  });

  it("listed Indian LTCG below the exemption is tax-free", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 500_000,
      costBasisINR: 400_000,
      holdingMonths: 18,
      isListedIndian: true,
      marginalSlabRate: 0.3,
    });
    expect(r.classification).toBe("LTCG");
    expect(r.tax).toBe(0); // gain 100000 < 125000 exemption
  });

  it("listed Indian STCG: flat 20%", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 1_000_000,
      costBasisINR: 400_000,
      holdingMonths: 6,
      isListedIndian: true,
      marginalSlabRate: 0.3,
    });
    expect(r.classification).toBe("STCG");
    expect(r.tax).toBe(120_000); // 600000 * 0.20
  });

  it("foreign/unlisted LTCG: 12.5%, no exemption", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 1_000_000,
      costBasisINR: 400_000,
      holdingMonths: 30,
      isListedIndian: false,
      marginalSlabRate: 0.3,
    });
    expect(r.classification).toBe("LTCG");
    expect(r.exemption).toBe(0);
    expect(r.tax).toBe(75_000); // 600000 * 0.125
  });

  it("foreign/unlisted STCG: taxed at the marginal slab", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 1_000_000,
      costBasisINR: 400_000,
      holdingMonths: 12,
      isListedIndian: false,
      marginalSlabRate: 0.3,
    });
    expect(r.classification).toBe("STCG");
    expect(r.tax).toBe(180_000); // 600000 * 0.30 slab
  });

  it("a loss is classified as Loss with zero tax", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 300_000,
      costBasisINR: 400_000,
      holdingMonths: 30,
      isListedIndian: true,
      marginalSlabRate: 0.3,
    });
    expect(r.classification).toBe("Loss");
    expect(r.gain).toBe(-100_000);
    expect(r.tax).toBe(0);
  });

  it("respects the holding-period boundary (listed: >12mo = LTCG)", () => {
    const base = { salePriceINR: 1_000_000, costBasisINR: 400_000, isListedIndian: true, marginalSlabRate: 0.3 };
    expect(calculateEsopCapitalGains({ ...base, holdingMonths: 12 }).classification).toBe("STCG");
    expect(calculateEsopCapitalGains({ ...base, holdingMonths: 13 }).classification).toBe("LTCG");
  });

  it("respects the holding-period boundary (unlisted: >24mo = LTCG)", () => {
    const base = { salePriceINR: 1_000_000, costBasisINR: 400_000, isListedIndian: false, marginalSlabRate: 0.3 };
    expect(calculateEsopCapitalGains({ ...base, holdingMonths: 24 }).classification).toBe("STCG");
    expect(calculateEsopCapitalGains({ ...base, holdingMonths: 25 }).classification).toBe("LTCG");
  });
});

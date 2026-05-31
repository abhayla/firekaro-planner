/**
 * Consolidated unit tests for the 3 new instrument-tax libs:
 * - lib/nps-withdrawal.ts
 * - lib/epf-vpf.ts
 * - lib/esop-tax.ts
 * Phase 2 Stage D per docs/goals/build-firekaro-mvp-v5.md §5.
 */

import { describe, it, expect } from "vitest";
import {
  calculateNpsWithdrawal,
  suggestNpsCap,
  NPS_FULL_WITHDRAWAL_THRESHOLD,
} from "./nps-withdrawal";
import {
  calculateEpfVpfYear,
  epfVpfOpportunityCostYears,
  EPF_VPF_TAX_FREE_THRESHOLD,
} from "./epf-vpf";
import {
  calculatePerquisite,
  calculateEsopCapitalGains,
  LTCG_LISTED_EXEMPTION,
} from "./esop-tax";
import type { Investment } from "@/types/household";

// ============================================================================
// NPS withdrawal (PFRDA 2025 60/20/20)
// ============================================================================

describe("calculateNpsWithdrawal", () => {
  it("full lump sum when corpus <= ₹5L threshold", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: NPS_FULL_WITHDRAWAL_THRESHOLD });
    expect(r.lumpSum).toBe(NPS_FULL_WITHDRAWAL_THRESHOLD);
    expect(r.annuityCorpus).toBe(0);
    expect(r.isBelowThreshold).toBe(true);
  });

  it("60/40 split when corpus above threshold", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 10_000_000 });
    expect(r.lumpSum).toBe(6_000_000);
    expect(r.annuityCorpus).toBe(4_000_000);
    expect(r.isBelowThreshold).toBe(false);
  });

  it("annuity income uses provided annuityRate", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 10_000_000, annuityRate: 0.065 });
    expect(r.annuityIncomeAnnual).toBe(4_000_000 * 0.065);
  });

  it("default annuity rate is 0.06", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 10_000_000 });
    expect(r.annuityIncomeAnnual).toBe(240_000); // 4M * 0.06
  });
});

describe("suggestNpsCap", () => {
  it("suggests cap when projected corpus > 5 years × expenses / 0.6", () => {
    // expenses 12L -> threshold 60L/0.6 = 100L
    const r = suggestNpsCap(15_000_000, 1_200_000);
    expect(r.suggestCap).toBe(true);
    expect(r.suggestedCap).toBe(10_000_000);
  });

  it("does NOT suggest cap when projected corpus is at sweet spot", () => {
    const r = suggestNpsCap(8_000_000, 1_200_000);
    expect(r.suggestCap).toBe(false);
  });
});

// ============================================================================
// EPF/VPF threshold (₹2.5L tax-on-excess)
// ============================================================================

describe("calculateEpfVpfYear", () => {
  it("under threshold: zero taxable contribution + interest", () => {
    const r = calculateEpfVpfYear({
      annualContribution: 200_000,
      marginalSlabRate: 0.30,
    });
    expect(r.taxableContribution).toBe(0);
    expect(r.taxableInterest).toBe(0);
    expect(r.taxOnExcessInterest).toBe(0);
  });

  it("at exactly threshold: still zero taxable", () => {
    const r = calculateEpfVpfYear({
      annualContribution: EPF_VPF_TAX_FREE_THRESHOLD,
      marginalSlabRate: 0.30,
    });
    expect(r.taxableContribution).toBe(0);
  });

  it("above threshold: only excess interest is taxed", () => {
    const r = calculateEpfVpfYear({
      annualContribution: 400_000,
      marginalSlabRate: 0.30,
    });
    expect(r.taxableContribution).toBe(150_000);
    // 150k * 8.25% = 12375; tax @ 30% = 3712.5 (rounded)
    expect(r.taxableInterest).toBeCloseTo(12_375, 0);
    expect(r.taxOnExcessInterest).toBeCloseTo(3_713, 0);
  });

  it("threshold ₹5L when employer does not contribute", () => {
    const r = calculateEpfVpfYear({
      annualContribution: 400_000,
      marginalSlabRate: 0.30,
      employerContributes: false,
    });
    expect(r.taxableContribution).toBe(0);
  });

  it("effective yield drops as marginal slab increases", () => {
    const r30 = calculateEpfVpfYear({ annualContribution: 500_000, marginalSlabRate: 0.30 });
    const r10 = calculateEpfVpfYear({ annualContribution: 500_000, marginalSlabRate: 0.10 });
    expect(r10.effectiveYield).toBeGreaterThan(r30.effectiveYield);
  });
});

describe("epfVpfOpportunityCostYears", () => {
  it("infinity when no excess contribution", () => {
    expect(epfVpfOpportunityCostYears(0, 0.3)).toBe(Infinity);
  });

  it("infinity when alternative return is not better", () => {
    expect(epfVpfOpportunityCostYears(100_000, 0.0, 0.0825, 0.05)).toBe(Infinity);
  });

  it("returns finite years when gap exists", () => {
    // 1L excess * (0.12 - 0.0825*0.7) = 1L * 0.0623 = ~6230/yr gap
    // years to 1L = ~16
    const years = epfVpfOpportunityCostYears(100_000, 0.30, 0.0825, 0.12);
    expect(years).toBeGreaterThan(10);
    expect(years).toBeLessThan(30);
  });
});

// ============================================================================
// ESOP / RSU two-layer tax
// ============================================================================

function esopInv(overrides: Partial<Investment> = {}): Investment {
  return {
    id: "e1",
    type: "ESOP",
    value: 1_000_000,
    ownerId: "self",
    vestedValueINR: 1_000_000,
    ...overrides,
  };
}

describe("calculatePerquisite (Layer 1)", () => {
  it("zero for non-ESOP types", () => {
    const r = calculatePerquisite({
      inv: { id: "s1", type: "Stocks", value: 100_000, ownerId: "self" },
      marginalSlabRate: 0.30,
    });
    expect(r.perquisiteValue).toBe(0);
    expect(r.perquisiteTax).toBe(0);
  });

  it("Indian grantor: spread = FMV - exercisePrice", () => {
    const r = calculatePerquisite({
      inv: esopInv({
        grantorCountry: "India",
        fmvAtVest: 1_000,
        exercisePrice: 100,
        vestedValueINR: 1_000_000,
      }),
      marginalSlabRate: 0.30,
    });
    // spread ratio = (1000-100)/1000 = 0.9; perquisite = 1M * 0.9 = 900k
    expect(r.perquisiteValue).toBe(900_000);
    expect(r.perquisiteTax).toBe(270_000);
    expect(r.triggerAt).toBe("exercise");
  });

  it("Foreign grantor (US): perquisite = full vested value at vest", () => {
    const r = calculatePerquisite({
      inv: esopInv({ grantorCountry: "US", vestedValueINR: 1_000_000 }),
      marginalSlabRate: 0.30,
    });
    expect(r.perquisiteValue).toBe(1_000_000);
    expect(r.perquisiteTax).toBe(300_000);
    expect(r.triggerAt).toBe("vest");
  });

  it("falls back to full vested value when Indian grantor lacks fmv/exercise", () => {
    const r = calculatePerquisite({
      inv: esopInv({ grantorCountry: "India", vestedValueINR: 500_000 }),
      marginalSlabRate: 0.30,
    });
    expect(r.perquisiteValue).toBe(500_000);
  });
});

describe("calculateEsopCapitalGains (Layer 2)", () => {
  it("LTCG listed Indian: 12.5% above ₹1.25L exemption", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 1_500_000,
      costBasisINR: 1_000_000,
      holdingMonths: 18,
      isListedIndian: true,
      marginalSlabRate: 0.30,
    });
    // gain 5L; exempt 1.25L; taxable 3.75L * 12.5% = 46875
    expect(r.classification).toBe("LTCG");
    expect(r.exemption).toBe(LTCG_LISTED_EXEMPTION);
    expect(r.tax).toBe(46_875);
  });

  it("LTCG foreign / unlisted: 12.5% with NO exemption", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 1_500_000,
      costBasisINR: 1_000_000,
      holdingMonths: 30,
      isListedIndian: false,
      marginalSlabRate: 0.30,
    });
    expect(r.classification).toBe("LTCG");
    expect(r.exemption).toBe(0);
    expect(r.tax).toBe(62_500); // 5L * 12.5%
  });

  it("STCG listed Indian: 20% flat", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 1_200_000,
      costBasisINR: 1_000_000,
      holdingMonths: 6,
      isListedIndian: true,
      marginalSlabRate: 0.30,
    });
    expect(r.classification).toBe("STCG");
    expect(r.tax).toBe(40_000); // 2L * 20%
  });

  it("STCG foreign / unlisted: slab rate", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 1_200_000,
      costBasisINR: 1_000_000,
      holdingMonths: 12,
      isListedIndian: false,
      marginalSlabRate: 0.30,
    });
    expect(r.classification).toBe("STCG");
    expect(r.tax).toBe(60_000); // 2L * 30%
  });

  it("Loss case: zero tax", () => {
    const r = calculateEsopCapitalGains({
      salePriceINR: 800_000,
      costBasisINR: 1_000_000,
      holdingMonths: 20,
      isListedIndian: true,
      marginalSlabRate: 0.30,
    });
    expect(r.classification).toBe("Loss");
    expect(r.tax).toBe(0);
  });
});

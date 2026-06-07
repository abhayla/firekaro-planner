// A7.6 / #59 — mutation-kill differential spec for the honesty-critical tax kernel.
// Stryker baseline (2026-06-07) left tax.ts at 68.85% with survivors clustered in the
// surcharge band/relief logic (315-350), rebate marginal-relief (441-448), slab tax (262),
// age exemption (279-280), the 80CCD(2) NPS cap, and FY coverage. These assertions pin EXACT
// integer outputs at every boundary so any arithmetic/conditional/boundary/equality mutation
// changes a value and is KILLED. Golden values are the current FinTech-validated engine output
// (characterization) AND, where marked, independently reasoned (marginal relief = tax-at-threshold
// + income-above-threshold). Target: tax.ts ≥85% mutation score, ZERO survivors on slab/surcharge/relief.
import { describe, it, expect } from "vitest";
import {
  calculateSlabTax,
  calculateSurcharge,
  computeTax,
  recommendRegime,
  oldRegimeSlabsForAge,
  marginalSlabRate,
  npsCeilingFor,
  getTaxConfigCoverage,
  fireProjectionTaxNote,
  isProjectedTaxStale,
  type TaxSlabEntry,
  type SurchargeSlab,
} from "./tax";

const NEW: TaxSlabEntry[] = [
  { min: 0, max: 400000, rate: 0 },
  { min: 400000, max: 800000, rate: 0.05 },
  { min: 800000, max: 1200000, rate: 0.1 },
  { min: 1200000, max: 1600000, rate: 0.15 },
  { min: 1600000, max: 2000000, rate: 0.2 },
  { min: 2000000, max: 2400000, rate: 0.25 },
  { min: 2400000, max: Infinity, rate: 0.3 },
];
const OLD: TaxSlabEntry[] = [
  { min: 0, max: 250000, rate: 0 },
  { min: 250000, max: 500000, rate: 0.05 },
  { min: 500000, max: 1000000, rate: 0.2 },
  { min: 1000000, max: Infinity, rate: 0.3 },
];
const SUR: SurchargeSlab[] = [
  { min: 5000000, max: 10000000, rate: 0.1 },
  { min: 10000000, max: 20000000, rate: 0.15 },
  { min: 20000000, max: 50000000, rate: 0.25 },
  { min: 50000000, max: Infinity, rate: 0.37 },
];

describe("calculateSlabTax — exact at every boundary (kills slab arithmetic/boundary mutants)", () => {
  it.each([
    [0, 0], [250000, 0], [400000, 0], [500000, 5000], [800000, 20000],
    [1000000, 40000], [1200000, 60000], [1600000, 120000], [2000000, 200000],
    [2400000, 300000], [3000000, 480000],
  ])("NEW slab(%i) = %i", (inc, exp) => expect(calculateSlabTax(inc, NEW)).toBe(exp));
  it.each([
    [0, 0], [250000, 0], [500000, 12500], [1000000, 112500], [1500000, 262500],
  ])("OLD slab(%i) = %i", (inc, exp) => expect(calculateSlabTax(inc, OLD)).toBe(exp));
  it("income exactly AT a slab.min adds nothing for that slab (kills the <= boundary at 262)", () => {
    // At 400000 the 5% band starts; tax is still 0. At 400001, 1 rupee taxed at 5% → rounds to 0,
    // at 420000 → 1000. The <= vs < at line 262 flips whether the boundary rupee is taxed.
    expect(calculateSlabTax(420000, NEW)).toBe(1000);
    expect(calculateSlabTax(400000, NEW)).toBe(0);
  });
});

describe("oldRegimeSlabsForAge — exact reshaped slabs (kills 279/280 exemption conditionals)", () => {
  it("under 60 → slabs unchanged (₹2.5L exemption)", () => {
    expect(oldRegimeSlabsForAge(OLD, 45)).toEqual(OLD);
    expect(oldRegimeSlabsForAge(OLD, undefined)).toEqual(OLD);
  });
  it("senior 60-79 → ₹3L exemption, 5% band shrinks to 3-5L", () => {
    expect(oldRegimeSlabsForAge(OLD, 65)).toEqual([
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 500000, rate: 0.05 },
      { min: 500000, max: 1000000, rate: 0.2 },
      { min: 1000000, max: Infinity, rate: 0.3 },
    ]);
  });
  it("super-senior 80+ → ₹5L exemption, the 5% band is fully absorbed (gone)", () => {
    expect(oldRegimeSlabsForAge(OLD, 82)).toEqual([
      { min: 0, max: 500000, rate: 0 },
      { min: 500000, max: 1000000, rate: 0.2 },
      { min: 1000000, max: Infinity, rate: 0.3 },
    ]);
  });
  it("boundary ages: 59→standard, 60→senior, 79→senior, 80→super (kills >=60/>=80 mutants)", () => {
    expect(oldRegimeSlabsForAge(OLD, 59)).toEqual(OLD);
    expect(oldRegimeSlabsForAge(OLD, 60)[0].max).toBe(300000);
    expect(oldRegimeSlabsForAge(OLD, 79)[0].max).toBe(300000);
    expect(oldRegimeSlabsForAge(OLD, 80)[0].max).toBe(500000);
  });
});

describe("marginalSlabRate — exact top rate (kills loop break/compare mutants)", () => {
  it.each([
    [0, 0], [400000, 0], [800000, 0.05], [1200000, 0.1], [2400000, 0.25], [5000000, 0.3],
  ])("rate(%i) = %f", (inc, exp) => expect(marginalSlabRate(inc, NEW)).toBe(exp));
});

describe("npsCeilingFor — exact 80CCD(2) ceiling (kills the regime/sector conditionals)", () => {
  it("NEW = 14%, OLD-gov = 14%, OLD-private = 10%, OLD-undef = 10%", () => {
    expect(npsCeilingFor("NEW")).toBe(0.14);
    expect(npsCeilingFor("NEW", "private")).toBe(0.14);
    expect(npsCeilingFor("OLD", "government")).toBe(0.14);
    expect(npsCeilingFor("OLD", "private")).toBe(0.1);
    expect(npsCeilingFor("OLD")).toBe(0.1);
  });
});

describe("calculateSurcharge — band thresholds, cap, prevRate (kills 315-338 surcharge mutants)", () => {
  const T = 1500000; // fixed income tax, no marginal relief (no incomeSlabs)
  it("≤ ₹50L → 0 (kills the 315 boundary)", () => {
    expect(calculateSurcharge(T, 5000000, SUR, null)).toBe(0);
    expect(calculateSurcharge(T, 5000001, SUR, null)).toBe(150000); // 10%
  });
  it.each([
    [7500000, 150000], [10000000, 150000], [10000001, 225000], [15000000, 225000],
    [20000000, 225000], [20000001, 375000], [30000000, 375000], [50000000, 375000],
    [50000001, 555000], [60000000, 555000],
  ])("no-cap surcharge(income=%i) = %i", (inc, exp) => expect(calculateSurcharge(T, inc, SUR, null)).toBe(exp));
  it("NEW-regime cap 25% clamps the 37% band (kills the 337 cap clamp)", () => {
    expect(calculateSurcharge(T, 50000001, SUR, 0.25)).toBe(375000); // capped from 555000
    expect(calculateSurcharge(T, 60000000, SUR, 0.25)).toBe(375000);
  });
});

describe("calculateSurcharge — marginal relief across bands (kills 346-350 relief + 324/334/338 prevRate)", () => {
  // tax = slab tax at the income; relief caps total at (tax-at-threshold)*(1+prevRate) + (income-threshold).
  const sl = (i: number) => calculateSlabTax(i, NEW);
  it.each([
    [5000001, 1],        // ₹1 over ₹50L → relief shaves surcharge to ₹1
    [7500000, 183000],
    [10000000, 258000],
    [10000001, 258001],  // ₹1 over ₹1Cr (prevRate 10%) → relief continuity
    [20000001, 837001],  // ₹1 over ₹2Cr (prevRate 15%)
    [50000001, 3645001], // ₹1 over ₹5Cr (prevRate 25%), NO cap
  ])("relief no-cap (income=%i) = %i", (inc, exp) =>
    expect(calculateSurcharge(sl(inc), inc, SUR, null, NEW)).toBe(exp));
  it("relief WITH new-regime cap differs from no-cap above ₹5Cr (kills 338 prevRate cap clamp)", () => {
    expect(calculateSurcharge(sl(50000001), 50000001, SUR, 0.25, NEW)).toBe(3645000);
    expect(calculateSurcharge(sl(60000000), 60000000, SUR, 0.25, NEW)).toBe(4395000);
    // no-cap is materially higher → the cap path is exercised, not equivalent
    expect(calculateSurcharge(sl(60000000), 60000000, SUR, null, NEW)).toBe(6504600);
  });
});

describe("computeTax NEW 2025-26 — full pipeline exact (kills rebate/relief/surcharge-call mutants 417-455)", () => {
  const ct = (g: number) => computeTax({ grossIncome: g, regime: "NEW", fy: "2025-26" });
  it("rebate zeroes tax up to the ₹12L (taxable) rebate limit", () => {
    expect(ct(1275000).totalTax).toBe(0); // taxable 1.2M exactly → full rebate
    expect(ct(1275000).rebate).toBe(60000);
  });
  it("rebate marginal relief just above the limit (₹13L gross): tax = slab − above (kills 445/447)", () => {
    const r = ct(1300000);
    expect(r.taxableIncome).toBe(1225000);
    expect(r.slabTax).toBe(63750);
    expect(r.rebate).toBe(38750); // 63750 − (1225000−1200000)=38750  ← marginal relief
    expect(r.taxAfterRebate).toBe(25000);
    expect(r.totalTax).toBe(26000); // + 4% cess
  });
  it.each([
    [1600000, 113100], [5000000, 1099800], [5200000, 1253200],
    [10500000, 3238170], [21000000, 7614750], [52000000, 19704750],
  ])("total tax(gross=%i) = %i (surcharge bands + cess wired correctly)", (g, exp) =>
    expect(ct(g).totalTax).toBe(exp));
  it("surcharge kicks in above ₹50L taxable, not below (kills the surcharge-call arg 455)", () => {
    expect(ct(5000000).surcharge).toBe(0);
    expect(ct(5200000).surcharge).toBe(87500);
  });
});

describe("computeTax OLD — deductions + age exemption (kills the OLD-regime branches 412/438)", () => {
  it("deductions reduce taxable income (OLD only)", () => {
    const r = computeTax({ grossIncome: 2000000, regime: "OLD", fy: "2025-26", deductions: 150000 });
    expect(r.taxableIncome).toBe(1800000); // 2M − 50k SD − 150k ded
    expect(r.totalTax).toBe(366600);
  });
  it("senior/super-senior age lowers tax via the higher exemption (kills the age slab-selection 438)", () => {
    expect(computeTax({ grossIncome: 2000000, regime: "OLD", fy: "2025-26", taxpayerAge: 65 }).totalTax).toBe(410800);
    expect(computeTax({ grossIncome: 2000000, regime: "OLD", fy: "2025-26", taxpayerAge: 82 }).totalTax).toBe(400400);
  });
});

describe("computeTax — 80CCD(2) employer-NPS cap (kills 417/423/429 NPS-cap mutants)", () => {
  it("per-member cap: NPS capped at 14% NEW of own basic (300k vs 14%×1M=140k → 140k deducted)", () => {
    // taxable = 2M − 75k SD − min(300k, 140k)=140k → 1,785,000
    expect(computeTax({ grossIncome: 2000000, regime: "NEW", fy: "2025-26",
      employerNpsByMember: [{ nps: 300000, basic: 1000000, sector: "private" }] }).taxableIncome).toBe(1785000);
  });
  it("aggregate cap: OLD-private 10% of basic (300k vs 100k → 100k); SD 50k → taxable 1,850,000", () => {
    expect(computeTax({ grossIncome: 2000000, regime: "OLD", fy: "2025-26",
      employerNps: 300000, employerNpsBasic: 1000000 }).taxableIncome).toBe(1850000);
  });
});

describe("recommendRegime — exact comparison + savings (kills 483/485/490)", () => {
  it("high income + big deductions → OLD wins or NEW wins, savings is |Δ|", () => {
    const r = recommendRegime({ grossIncome: 2500000, fy: "2025-26", deductions: 500000 });
    expect(r.oldTax).toBe(413400);
    expect(r.newTax).toBe(319800);
    expect(r.recommended).toBe("NEW");
    expect(r.savings).toBe(93600);
  });
  it("low income → NEW (rebate) beats OLD", () => {
    const r = recommendRegime({ grossIncome: 800000, fy: "2025-26" });
    expect(r.recommended).toBe("NEW");
    expect(r.newTax).toBe(0);
    expect(r.savings).toBe(65000);
  });
});

describe("getTaxConfigCoverage / staleness — exact flags (kills 174/180/181 coverage conditionals)", () => {
  it("configured FY: isConfigured true, appliedFy = self, both unconfigured flags false", () => {
    const c = getTaxConfigCoverage("2025-26");
    expect(c.isConfigured).toBe(true);
    expect(c.appliedFy).toBe("2025-26");
    expect(c.isFutureUnconfigured).toBe(false);
    expect(c.isPastUnconfigured).toBe(false);
  });
  it("future unconfigured FY: isFutureUnconfigured true, appliedFy = newest, past flag false (kills 180)", () => {
    const c = getTaxConfigCoverage("2031-32");
    expect(c.isConfigured).toBe(false);
    expect(c.isFutureUnconfigured).toBe(true);
    expect(c.isPastUnconfigured).toBe(false);
    expect(c.appliedFy).toBe(c.newestConfiguredFy);
  });
  it("past unconfigured FY: isPastUnconfigured true, future false, appliedFy = oldest (kills 174/181)", () => {
    const c = getTaxConfigCoverage("2010-11");
    expect(c.isConfigured).toBe(false);
    expect(c.isPastUnconfigured).toBe(true);
    expect(c.isFutureUnconfigured).toBe(false);
    expect(c.appliedFy).toBe("2024-25"); // nearest = oldest for a past year
  });
  it("isProjectedTaxStale tracks isFutureUnconfigured exactly", () => {
    expect(isProjectedTaxStale("2031-32")).toBe(true);
    expect(isProjectedTaxStale("2025-26")).toBe(false);
    expect(isProjectedTaxStale("2010-11")).toBe(false);
  });
  it("fireProjectionTaxNote: null in-range, a note past newest, null for non-finite (kills 202)", () => {
    expect(fireProjectionTaxNote(2025)).toBeNull();
    expect(fireProjectionTaxNote(2035)).toContain("assumes today's slabs held constant");
    expect(fireProjectionTaxNote(Infinity)).toBeNull();
    expect(fireProjectionTaxNote(Number.NaN)).toBeNull();
  });
  it("coverage at the exact config boundaries (kills 180/181 conditionals at newest±/oldest±)", () => {
    // newest configured = 2026-27, oldest = 2024-25.
    expect(getTaxConfigCoverage("2026-27").isConfigured).toBe(true); // exactly newest → configured
    expect(getTaxConfigCoverage("2027-28").isFutureUnconfigured).toBe(true); // newest+1 → future
    expect(getTaxConfigCoverage("2024-25").isConfigured).toBe(true); // exactly oldest → configured
    expect(getTaxConfigCoverage("2023-24").isPastUnconfigured).toBe(true); // oldest-1 → past
    expect(getTaxConfigCoverage("2023-24").appliedFy).toBe("2024-25"); // past → oldest
  });
});

// ── WAVE 2 — paths wave 1 missed: FY 2024-25 (finite rebate + different slabs/config literals),
//    OLD-regime finite rebate, uncapped-NPS branches, regime tie, non-salaried. ──
describe("computeTax FY 2024-25 NEW — finite maxRebate + 2024-25 config slabs (kills 76/77/84-86 + 443/444)", () => {
  const ct = (g: number) => computeTax({ grossIncome: g, regime: "NEW", fy: "2024-25" });
  it("rebate (finite ₹25k, limit ₹7L taxable) zeroes tax up to the limit", () => {
    expect(ct(600000)).toMatchObject({ taxableIncome: 525000, slabTax: 11250, rebate: 11250, totalTax: 0 });
    expect(ct(775000)).toMatchObject({ taxableIncome: 700000, slabTax: 20000, rebate: 20000, totalTax: 0 });
  });
  it("above the ₹7L rebate limit → NO rebate (2024-25 NEW has no marginal relief) → tax due", () => {
    expect(ct(800000)).toMatchObject({ taxableIncome: 725000, rebate: 0, totalTax: 23400 });
    expect(ct(1000000).totalTax).toBe(44200);
    expect(ct(1500000).totalTax).toBe(130000);
    expect(ct(2000000).totalTax).toBe(278200);
  });
});

describe("computeTax OLD-regime finite rebate (maxRebate ₹12.5k, limit ₹5L) — kills line 49 + 444", () => {
  const ct = (g: number) => computeTax({ grossIncome: g, regime: "OLD", fy: "2025-26" });
  it("rebate = min(slabTax, ₹12.5k) up to taxable ₹5L; above → none", () => {
    expect(ct(500000)).toMatchObject({ taxableIncome: 450000, slabTax: 10000, rebate: 10000, totalTax: 0 });
    expect(ct(550000)).toMatchObject({ taxableIncome: 500000, slabTax: 12500, rebate: 12500, totalTax: 0 });
    expect(ct(700000)).toMatchObject({ taxableIncome: 650000, rebate: 0, totalTax: 44200 });
  });
});

describe("computeTax NPS uncapped branches + isSalaried (kills 423/429 ternaries + 408)", () => {
  it("aggregate employerNps with NO basic → uncapped (kills the basicForCap>0 ternary 429)", () => {
    expect(computeTax({ grossIncome: 2000000, regime: "OLD", fy: "2025-26", employerNps: 300000 }).taxableIncome).toBe(1650000);
  });
  it("per-member with basic=0 → uncapped that member (kills the basic>0 ternary 423)", () => {
    expect(computeTax({ grossIncome: 2000000, regime: "NEW", fy: "2025-26", employerNpsByMember: [{ nps: 250000, basic: 0 }] }).taxableIncome).toBe(1675000);
  });
  it("non-salaried → no standard deduction (kills the isSalaried branch 408)", () => {
    expect(computeTax({ grossIncome: 1000000, regime: "NEW", fy: "2025-26", isSalaried: false }).taxableIncome).toBe(1000000);
  });
});

describe("recommendRegime tie-break — equal tax → OLD via <= (kills 485)", () => {
  it("at ₹4L gross both regimes = ₹0 → recommends OLD (the <= tie-break), savings 0", () => {
    const r = recommendRegime({ grossIncome: 400000, fy: "2025-26" });
    expect(r.oldTax).toBe(0);
    expect(r.newTax).toBe(0);
    expect(r.recommended).toBe("OLD");
    expect(r.savings).toBe(0);
  });
});

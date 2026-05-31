import { describe, it, expect } from "vitest";
import { computeTax, recommendRegime, marginalSlabRate, getTaxConfigForFY } from "./tax";

describe("computeTax — New Regime FY 2024-25", () => {
  it("zero tax on income within rebate limit (₹7L)", () => {
    const r = computeTax({ grossIncome: 700000, regime: "NEW", fy: "2024-25" });
    // standardDeduction ₹75K → taxable ₹6.25L; rebate caps to zero
    expect(r.totalTax).toBe(0);
  });

  it("computes tax for ₹15L income", () => {
    const r = computeTax({ grossIncome: 1500000, regime: "NEW", fy: "2024-25" });
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.effectiveRate).toBeGreaterThan(0);
    expect(r.effectiveRate).toBeLessThan(20); // ~10-15% effective
  });

  it("surcharge applies above ₹50L (capped at 25% for New regime)", () => {
    const r = computeTax({ grossIncome: 10000000, regime: "NEW", fy: "2024-25" });
    expect(r.surcharge).toBeGreaterThan(0);
  });

  it("cess is 4% of (tax + surcharge)", () => {
    const r = computeTax({ grossIncome: 2000000, regime: "NEW", fy: "2024-25" });
    expect(r.cess).toBeGreaterThan(0);
    expect(r.cess).toBeCloseTo(Math.round((r.taxAfterRebate + r.surcharge) * 0.04), 0);
  });
});

describe("computeTax — Old Regime", () => {
  it("applies ₹50K standard deduction + deductions", () => {
    const r = computeTax({
      grossIncome: 1000000,
      regime: "OLD",
      fy: "2024-25",
      deductions: 150000, // 80C
    });
    // taxable = 1000000 - 50000 - 150000 = 800000
    expect(r.taxableIncome).toBe(800000);
  });

  it("ignores deductions in NEW regime", () => {
    const r = computeTax({
      grossIncome: 1000000,
      regime: "NEW",
      fy: "2024-25",
      deductions: 150000,
    });
    expect(r.estimatedDeductions).toBe(0);
  });
});

describe("computeTax — FY 2025-26 marginal relief", () => {
  it("zero tax exactly at ₹12L rebate limit", () => {
    const r = computeTax({ grossIncome: 1275000, regime: "NEW", fy: "2025-26" });
    // taxable ₹12L → full rebate
    expect(r.taxAfterRebate).toBe(0);
  });

  it("marginal relief applies just above ₹12L", () => {
    // At ₹13L gross (₹12.25L taxable) the slab tax would be higher than the income above rebate.
    // Marginal relief caps tax at the amount above rebate.
    const r = computeTax({ grossIncome: 1300000, regime: "NEW", fy: "2025-26" });
    expect(r.rebate).toBeGreaterThan(0);
  });
});

describe("recommendRegime", () => {
  it("returns the regime with lower total tax", () => {
    const r = recommendRegime({
      grossIncome: 1500000,
      fy: "2024-25",
      deductions: 200000,
    });
    expect(["OLD", "NEW"]).toContain(r.recommended);
    expect(r.savings).toBeGreaterThanOrEqual(0);
  });

  it("New regime usually wins at ₹10L with low deductions", () => {
    const r = recommendRegime({ grossIncome: 1000000, fy: "2024-25", deductions: 0 });
    expect(r.recommended).toBe("NEW");
  });
});

describe("marginalSlabRate (A15.3 — EPF excess-interest tax rate)", () => {
  const oldSlabs = getTaxConfigForFY("2024-25").oldRegime.slabs;

  it("returns the top slab rate the taxable income reaches (old regime)", () => {
    expect(marginalSlabRate(1_500_000, oldSlabs)).toBe(0.3); // >10L → 30%
    expect(marginalSlabRate(800_000, oldSlabs)).toBe(0.2); // 5L–10L → 20%
    expect(marginalSlabRate(400_000, oldSlabs)).toBe(0.05); // 2.5L–5L → 5%
  });

  it("returns 0 below the first taxable slab", () => {
    expect(marginalSlabRate(0, oldSlabs)).toBe(0);
    expect(marginalSlabRate(250_000, oldSlabs)).toBe(0); // exactly at 2.5L min, not above
  });

  it("uses the New-regime slab table when given New slabs", () => {
    const newSlabs = getTaxConfigForFY("2025-26").newRegime.slabs;
    expect(marginalSlabRate(2_500_000, newSlabs)).toBe(0.3); // >24L → 30%
    expect(marginalSlabRate(900_000, newSlabs)).toBe(0.1); // 8L–12L → 10%
  });
});

describe("effectiveRate", () => {
  it("scales with income", () => {
    const lo = computeTax({ grossIncome: 800000, regime: "NEW", fy: "2024-25" });
    const hi = computeTax({ grossIncome: 5000000, regime: "NEW", fy: "2024-25" });
    expect(hi.effectiveRate).toBeGreaterThan(lo.effectiveRate);
  });

  it("returns 0 for zero income", () => {
    const r = computeTax({ grossIncome: 0, regime: "NEW", fy: "2024-25" });
    expect(r.effectiveRate).toBe(0);
    expect(r.totalTax).toBe(0);
  });
});

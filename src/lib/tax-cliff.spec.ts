import { describe, it, expect } from "vitest";
import { taxCliffSeries, REBATE_CLIFF_BAND } from "@/lib/tax-cliff";

describe("taxCliffSeries (A13.3)", () => {
  const fy = "2025-26";

  it("samples the requested income range at the requested step", () => {
    const pts = taxCliffSeries({ fy, minIncome: 0, maxIncome: 1_000_000, step: 250_000 });
    expect(pts.map((p) => p.income)).toEqual([0, 250_000, 500_000, 750_000, 1_000_000]);
  });

  it("new-regime tax is zero at or below the ₹12L rebate limit", () => {
    const pts = taxCliffSeries({ fy, minIncome: 0, maxIncome: 1_200_000, step: 100_000 });
    expect(pts.every((p) => p.newTax === 0)).toBe(true);
  });

  it("new-regime tax rises steeply across the rebate-cliff band", () => {
    const lo = taxCliffSeries({ fy, minIncome: REBATE_CLIFF_BAND.lo, maxIncome: REBATE_CLIFF_BAND.lo, step: 1 })[0];
    const hi = taxCliffSeries({ fy, minIncome: 1_300_000, maxIncome: 1_300_000, step: 1 })[0];
    expect(lo.newTax).toBe(0);
    expect(hi.newTax).toBeGreaterThan(0);
  });

  it("old-regime curve reflects supplied deductions (more deductions → less tax)", () => {
    const noDed = taxCliffSeries({ fy, minIncome: 2_000_000, maxIncome: 2_000_000, step: 1, oldDeductions: 0 })[0];
    const withDed = taxCliffSeries({ fy, minIncome: 2_000_000, maxIncome: 2_000_000, step: 1, oldDeductions: 500_000 })[0];
    expect(withDed.oldTax).toBeLessThan(noDed.oldTax);
  });

  it("tax is monotonic non-decreasing in income (new regime)", () => {
    const pts = taxCliffSeries({ fy, minIncome: 0, maxIncome: 3_000_000, step: 100_000 });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].newTax).toBeGreaterThanOrEqual(pts[i - 1].newTax);
    }
  });
});

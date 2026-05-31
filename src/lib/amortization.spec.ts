import { describe, it, expect } from "vitest";
import { monthsRemaining, derivedEndYear, amortize, annualInterestForYear } from "./amortization";

describe("monthsRemaining", () => {
  it("returns 0 for zero balance", () => {
    expect(monthsRemaining(0, 10000, 8.5)).toBe(0);
  });

  it("returns 0 for non-positive EMI", () => {
    expect(monthsRemaining(100000, 0, 8.5)).toBe(0);
    expect(monthsRemaining(100000, -100, 8.5)).toBe(0);
  });

  it("handles zero interest rate as simple division", () => {
    expect(monthsRemaining(100000, 10000, 0)).toBe(10);
  });

  it("returns Infinity when EMI ≤ monthly interest (can never amortize)", () => {
    // 100L outstanding × 12% / 12 = ₹100K monthly interest; EMI ₹50K < interest
    expect(monthsRemaining(10000000, 50000, 12)).toBe(Infinity);
  });

  it("computes amortization period for a typical home loan", () => {
    // ₹38L outstanding @ 8.5%, EMI ₹42K — should be ~140 months
    const n = monthsRemaining(3800000, 42000, 8.5);
    expect(n).toBeGreaterThan(120);
    expect(n).toBeLessThan(180);
  });
});

describe("derivedEndYear", () => {
  it("returns null for non-amortizing loan", () => {
    expect(derivedEndYear(10000000, 50000, 12)).toBeNull();
  });

  it("returns a year >= startYear for amortizing loan", () => {
    const y = derivedEndYear(3800000, 42000, 8.5, 2026, 1);
    expect(y).toBeGreaterThanOrEqual(2026);
    expect(y).toBeLessThan(2050);
  });
});

describe("amortize", () => {
  it("returns empty array for zero balance", () => {
    expect(amortize(0, 10000, 8.5)).toEqual([]);
  });

  it("balance decreases monotonically and reaches zero (typical case)", () => {
    const steps = amortize(500000, 10000, 8.5, 120);
    expect(steps.length).toBeGreaterThan(0);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].balance).toBeLessThanOrEqual(steps[i - 1].balance);
    }
    expect(steps[steps.length - 1].balance).toBe(0);
  });

  it("returns one step (then exit) for non-amortizing case", () => {
    const steps = amortize(10000000, 50000, 12, 600);
    // Interest exceeds EMI immediately, so loop break-exits after 1 step
    expect(steps.length).toBeLessThanOrEqual(1);
  });
});

describe("annualInterestForYear", () => {
  it("returns 0 for zero balance", () => {
    expect(annualInterestForYear(0, 10000, 8.5)).toBe(0);
  });

  it("returns positive value for home loan year-1", () => {
    const y1 = annualInterestForYear(3800000, 42000, 8.5, 0);
    expect(y1).toBeGreaterThan(0);
    expect(y1).toBeLessThan(3800000); // sanity
  });

  it("year-N interest decreases as principal pays down", () => {
    const y0 = annualInterestForYear(3800000, 42000, 8.5, 0);
    const y10 = annualInterestForYear(3800000, 42000, 8.5, 10);
    expect(y10).toBeLessThan(y0);
  });
});

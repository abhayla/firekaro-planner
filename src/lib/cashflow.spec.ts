import { describe, it, expect } from "vitest";
import {
  toMonthly,
  toAnnual,
  inflate,
  add,
  legacyFreqToPeriod,
  type Cashflow,
} from "./cashflow";

describe("toMonthly", () => {
  it("returns amount as-is when period is monthly", () => {
    expect(toMonthly({ amount: 50000, period: "M" })).toBe(50000);
  });

  it("divides by 3 when period is quarterly", () => {
    expect(toMonthly({ amount: 30000, period: "Q" })).toBe(10000);
  });

  it("divides by 12 when period is annual", () => {
    expect(toMonthly({ amount: 1200000, period: "A" })).toBe(100000);
  });

  it("handles zero", () => {
    expect(toMonthly({ amount: 0, period: "A" })).toBe(0);
  });
});

describe("toAnnual", () => {
  it("multiplies by 12 when period is monthly", () => {
    expect(toAnnual({ amount: 50000, period: "M" })).toBe(600000);
  });

  it("multiplies by 4 when period is quarterly", () => {
    expect(toAnnual({ amount: 25000, period: "Q" })).toBe(100000);
  });

  it("returns amount as-is when period is annual", () => {
    expect(toAnnual({ amount: 1200000, period: "A" })).toBe(1200000);
  });
});

describe("inflate", () => {
  it("compounds amount forward by years at rate", () => {
    const cf: Cashflow = { amount: 1000, period: "M" };
    const inflated = inflate(cf, 2, 0.06);
    // 1000 * 1.06^2 = 1123.6
    expect(inflated.amount).toBeCloseTo(1123.6, 1);
    expect(inflated.period).toBe("M");
  });

  it("preserves period (does not coerce)", () => {
    expect(inflate({ amount: 100, period: "Q" }, 1, 0.05).period).toBe("Q");
    expect(inflate({ amount: 100, period: "A" }, 1, 0.05).period).toBe("A");
  });

  it("handles zero years (identity)", () => {
    const cf: Cashflow = { amount: 12345, period: "A" };
    const out = inflate(cf, 0, 0.07);
    expect(out.amount).toBe(12345);
  });

  it("handles negative years (deflate)", () => {
    const cf: Cashflow = { amount: 1123.6, period: "M" };
    const deflated = inflate(cf, -2, 0.06);
    expect(deflated.amount).toBeCloseTo(1000, 1);
  });

  it("handles fractional years", () => {
    const cf: Cashflow = { amount: 1000, period: "M" };
    const half = inflate(cf, 0.5, 0.10);
    // 1000 * 1.10^0.5 ≈ 1048.81
    expect(half.amount).toBeCloseTo(1048.81, 1);
  });

  it("zero amount stays zero regardless of rate/years", () => {
    expect(inflate({ amount: 0, period: "M" }, 10, 0.08).amount).toBe(0);
  });
});

describe("add", () => {
  it("returns annual sum across mixed periods", () => {
    const result = add(
      { amount: 1000, period: "M" }, // 12000 annual
      { amount: 3000, period: "Q" }, // 12000 annual
      { amount: 12000, period: "A" }, // 12000 annual
    );
    expect(result.amount).toBe(36000);
    expect(result.period).toBe("A");
  });

  it("empty list returns zero annual flow", () => {
    const result = add();
    expect(result.amount).toBe(0);
    expect(result.period).toBe("A");
  });

  it("single flow lifts to annual", () => {
    const result = add({ amount: 5000, period: "M" });
    expect(result.amount).toBe(60000);
    expect(result.period).toBe("A");
  });

  it("sum of two same-period flows", () => {
    const result = add(
      { amount: 100000, period: "M" },
      { amount: 50000, period: "M" },
    );
    // (100000 + 50000) * 12 = 1800000
    expect(result.amount).toBe(1800000);
  });
});

describe("legacyFreqToPeriod (hydrate migration)", () => {
  it("passes through valid period codes", () => {
    expect(legacyFreqToPeriod("M")).toBe("M");
    expect(legacyFreqToPeriod("Q")).toBe("Q");
    expect(legacyFreqToPeriod("A")).toBe("A");
  });

  it("translates v4 'monthly' -> 'M'", () => {
    expect(legacyFreqToPeriod("monthly")).toBe("M");
  });

  it("translates v4 'annual' -> 'A'", () => {
    expect(legacyFreqToPeriod("annual")).toBe("A");
  });

  it("translates rare 'quarterly' / 'yearly' aliases", () => {
    expect(legacyFreqToPeriod("quarterly")).toBe("Q");
    expect(legacyFreqToPeriod("yearly")).toBe("A");
  });

  it("defaults unknown/undefined to 'A'", () => {
    expect(legacyFreqToPeriod(undefined)).toBe("A");
    expect(legacyFreqToPeriod(null)).toBe("A");
    expect(legacyFreqToPeriod("bogus")).toBe("A");
    expect(legacyFreqToPeriod(42)).toBe("A");
  });
});

/**
 * Mutant-kill specs for the pure income-path arithmetic (ADR-0007, gh #185 step 4).
 *
 * These pin SUBSTANCE (exact numbers / directions / boundaries), not shape, so a wrong edit
 * to the taper/clamp/scale arithmetic breaks a test instead of shipping green. Written against
 * the Stryker survivor list of 2026-09-29 (`src/lib/income-path.ts` — 20 survivors).
 */
import { describe, it, expect } from "vitest";
import {
  realIncomeAt,
  realIncomeScaleAt,
  generalInflationWithCreep,
  clampIncomeGrowthRate,
  type EarnerIncomePath,
} from "@/lib/income-path";

function path(overrides: Partial<EarnerIncomePath> = {}): EarnerIncomePath {
  return {
    annualAmount: 1_200_000,
    ageAtYear0: 30,
    realGrowthPercent: 5,
    taperAge: 50,
    ...overrides,
  };
}

describe("realIncomeAt — l.55-64 taper/clamp arithmetic", () => {
  it("non-finite yearIndex → 0 (kills the `if (false)` / ConditionalExpression mutant at l.55)", () => {
    expect(realIncomeAt(path(), Number.NaN)).toBe(0);
    expect(realIncomeAt(path(), Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("non-positive annualAmount → 0, a POSITIVE amount is NOT gated away (kills `base = true ? … : 0` and the && → || mutant at l.56)", () => {
    expect(realIncomeAt(path({ annualAmount: 0 }), 5)).toBe(0);
    expect(realIncomeAt(path({ annualAmount: -100 }), 5)).toBe(0);
    // The zero-growth-rate branch (`rate === 0 → return base` at l.59) returns `base` RAW, with
    // no downstream finite/positive guard — so a negative annualAmount that slips past a broken
    // `base = true ? path.annualAmount : 0` mutant surfaces as a negative income here, whereas the
    // real guard zeroes it out before this branch is ever reached.
    expect(realIncomeAt(path({ annualAmount: -500, realGrowthPercent: 0 }), 5)).toBe(0);
    // A real, positive income must actually flow through — proves the guard isn't `true ? … : 0`
    // (which would also pass a bogus amount) nor a broken `||` (which would pass 0/negative too,
    // already covered above) nor `>= 0` (covered by the annualAmount:0 case returning exactly 0).
    expect(realIncomeAt(path({ annualAmount: 1_000_000, realGrowthPercent: 0 }), 0)).toBe(1_000_000);
  });

  it("rate === 0 short-circuits to flat base every year (kills `if (false) return base` at l.59)", () => {
    const p = path({ realGrowthPercent: 0, annualAmount: 900_000 });
    expect(realIncomeAt(p, 0)).toBe(900_000);
    expect(realIncomeAt(p, 10)).toBe(900_000);
    expect(realIncomeAt(p, 40)).toBe(900_000);
  });

  it("growthYears is floored at 0 for an earner already past taper (never a negative exponent)", () => {
    // age0=55, taperAge=50 ⇒ taperAge - age0 = -5; growthYears must clamp to 0, not compound
    // NEGATIVELY (which a broken min/max would do and silently shrink income — forbidden by
    // the module's own contract "never shrinking").
    const p = path({ ageAtYear0: 55, taperAge: 50, realGrowthPercent: 10, annualAmount: 500_000 });
    expect(realIncomeAt(p, 0)).toBe(500_000);
    expect(realIncomeAt(p, 5)).toBe(500_000);
  });

  it("growthYears is capped at (taperAge - age0): income HOLDS FLAT past the taper, exact value", () => {
    // age0=30, taperAge=40 ⇒ 10 years of compounding max. At yearIndex=10 and yearIndex=30 the
    // exponent must be IDENTICAL (10), proving the upper clamp — not merely "doesn't grow forever"
    // but the EXACT boundary the mutant `Math.min(Math.max(0, yearIndex), taperAge - age0)` encodes.
    const p = path({ ageAtYear0: 30, taperAge: 40, realGrowthPercent: 5, annualAmount: 1_000_000 });
    const atTaper = realIncomeAt(p, 10);
    const wellPastTaper = realIncomeAt(p, 30);
    const expected = 1_000_000 * Math.pow(1.05, 10);
    expect(atTaper).toBeCloseTo(expected, 6);
    expect(wellPastTaper).toBeCloseTo(expected, 6);
  });

  it("a negative yearIndex is floored to 0 growth years, never negative compounding", () => {
    const p = path({ ageAtYear0: 30, taperAge: 60, realGrowthPercent: 8, annualAmount: 1_000_000 });
    expect(realIncomeAt(p, -5)).toBe(1_000_000);
  });

  it("final finite/positive guard passes through a normal compounded value unchanged (kills the `>= 0` / `true ? value : 0` mutants at l.64)", () => {
    const p = path({ ageAtYear0: 30, taperAge: 60, realGrowthPercent: 5, annualAmount: 1_000_000 });
    const value = realIncomeAt(p, 5);
    expect(value).toBeCloseTo(1_000_000 * Math.pow(1.05, 5), 6);
    expect(value).toBeGreaterThan(1_000_000); // proves it is NOT the `>= 0` mutant silently allowing 0
  });
});

describe("realIncomeScaleAt — l.91-95", () => {
  it("non-finite yearIndex → 1 (kills the `if (false)` mutant at l.91)", () => {
    expect(realIncomeScaleAt([path()], Number.NaN)).toBe(1);
  });

  it("no income at year 0 (income0 <= 0) → neutral 1, never 0/0 (kills `!(income0 >= 0)` and `if (false)` at l.93)", () => {
    expect(realIncomeScaleAt([path({ annualAmount: 0 })], 5)).toBe(1);
    expect(realIncomeScaleAt([], 5)).toBe(1);
  });

  it("computes the EXACT ratio of income at yearIndex vs year 0 for a growing earner", () => {
    const p = path({ ageAtYear0: 30, taperAge: 60, realGrowthPercent: 5, annualAmount: 1_000_000 });
    const scale = realIncomeScaleAt([p], 5);
    expect(scale).toBeCloseTo(Math.pow(1.05, 5), 6);
    // Not 1 — proves the ratio is actually computed, not short-circuited to the neutral fallback.
    expect(scale).toBeGreaterThan(1.01);
  });

  it("negative yearIndex is floored to 0 inside the ratio (numerator == denominator == income0)", () => {
    const p = path({ ageAtYear0: 30, taperAge: 60, realGrowthPercent: 5, annualAmount: 1_000_000 });
    expect(realIncomeScaleAt([p], -5)).toBeCloseTo(1, 6);
  });
});

describe("clampIncomeGrowthRate", () => {
  it("clamps a negative percent to 0 and an over-cap percent to the max", () => {
    expect(clampIncomeGrowthRate(-5)).toBe(0);
    expect(clampIncomeGrowthRate(30)).toBeCloseTo(0.15, 6);
  });

  it("converts a mid-range percent to the exact decimal rate", () => {
    expect(clampIncomeGrowthRate(7)).toBeCloseTo(0.07, 6);
  });
});

describe("generalInflationWithCreep — l.139 (creep is DIVIDED by 100, not multiplied)", () => {
  it("adds creep/100 to general inflation, not creep*100 (kills the ArithmeticOperator mutant)", () => {
    // 5% CPI + 2 percentage points of creep ⇒ 0.07, never 0.05 + 200 = 200.05 (the * mutant).
    const result = generalInflationWithCreep(0.05, 2);
    expect(result).toBeCloseTo(0.07, 6);
    expect(result).toBeLessThan(1); // proves it is not the *100 mutant (which would blow past 1)
  });

  it("creep is clamped to [0, 5] before being applied", () => {
    expect(generalInflationWithCreep(0.05, -3)).toBeCloseTo(0.05, 6); // floored at 0
    expect(generalInflationWithCreep(0.05, 50)).toBeCloseTo(0.1, 6); // capped at 5 ⇒ +0.05
  });
});

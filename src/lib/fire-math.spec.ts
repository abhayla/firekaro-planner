import { describe, it, expect } from "vitest";
import {
  calculateFIRENumber,
  calculateFIREVariants,
  calculateSavingsRate,
  calculateYearsToTarget,
  projectCorpus,
  findCrossovers,
  getHorizonSWR,
  blendedInflation,
  calculateFamilyLayerCorpus,
  calculateFireTarget,
} from "./fire-math";

describe("calculateFIRENumber", () => {
  it("returns annualExpenses / SWR for typical case", () => {
    const fn = calculateFIRENumber(1000000, 0.035, 30);
    expect(fn).toBeGreaterThan(20000000);
    expect(fn).toBeLessThan(40000000);
  });

  it("returns 0 for zero expenses", () => {
    expect(calculateFIRENumber(0, 0.035, 30)).toBe(0);
  });

  it("scales inversely with SWR", () => {
    const lo = calculateFIRENumber(1000000, 0.03, 30);
    const hi = calculateFIRENumber(1000000, 0.04, 30);
    expect(lo).toBeGreaterThan(hi);
  });
});

describe("getHorizonSWR (audit Entry #1 A1.1 — horizon-driven)", () => {
  it("Sharmas case: retire@47, planTo@90 → 43yr horizon → 3.25%", () => {
    expect(getHorizonSWR({ retirementAge: 47, planToAge: 90 })).toBe(0.0325);
  });
  it("≥50yr horizon → 3.0% (research-quoted)", () => {
    expect(getHorizonSWR({ retirementAge: 40, planToAge: 90 })).toBe(0.03);
  });
  it("30–39yr horizon → 3.5% (research-quoted)", () => {
    expect(getHorizonSWR({ retirementAge: 55, planToAge: 90 })).toBe(0.035);
  });
  it("20–29yr horizon → 4.0%", () => {
    expect(getHorizonSWR({ retirementAge: 65, planToAge: 90 })).toBe(0.04);
  });
  it("<20yr horizon → 4.5%", () => {
    expect(getHorizonSWR({ retirementAge: 75, planToAge: 90 })).toBe(0.045);
  });
  it("is driven by horizon, NOT current age — equal horizon yields equal SWR at different ages", () => {
    // Both are 50-year horizons (40→90 and 45→95) → both resolve to 3.0%.
    expect(getHorizonSWR({ retirementAge: 40, planToAge: 90 })).toBe(0.03);
    expect(getHorizonSWR({ retirementAge: 45, planToAge: 95 })).toBe(0.03);
  });
  it("falls back to INDIA_SWR when ages missing or horizon non-positive", () => {
    expect(getHorizonSWR({})).toBe(0.035);
    expect(getHorizonSWR({ retirementAge: 90, planToAge: 90 })).toBe(0.035);
  });
});

describe("blendedInflation (audit Entry #3 A3.1 — 4-bucket)", () => {
  it("research defaults (6/9/9/6 at 74/8/0/18) blend to ~6.24% and stay within 100bp of CPI", () => {
    // RE-BASELINED (ADR-0006): was 6/14/9/6 at 60/20/10/10 ⇒ 7.90%. Both legs changed: 14%
    // healthcare is an insurer CLAIMS-COST trend, not a price index (CPI-Health ~4–7% + a 3–4pp
    // private-tariff excess ⇒ 9%), and the old weights were NOT DISJOINT — `general` is the
    // all-items CPI, which already contains health/education/housing, so the split double-counted
    // all three by construction.
    const blend = blendedInflation({
      general: 0.06,
      healthcare: 0.09,
      education: 0.09,
      housing: 0.06,
    });
    expect(blend).toBeCloseTo(0.0624, 6);
    // SUBSTANCE, not just the value: a household basket built from disjoint shares of the very
    // buckets CPI aggregates cannot credibly sit far from CPI. This bound is what makes the number
    // defensible — it would have failed at 7.90% by 90bp.
    expect(blend - 0.06, "basket must sit within 0–100bp of general CPI").toBeGreaterThanOrEqual(0);
    expect(blend - 0.06).toBeLessThanOrEqual(0.01);
  });
  it("blend exceeds the v4 single 6% general rate", () => {
    const blend = blendedInflation({
      general: 0.06,
      healthcare: 0.14,
      education: 0.09,
      housing: 0.06,
    });
    expect(blend).toBeGreaterThan(0.06);
  });
  it("degenerate weights fall back to general", () => {
    expect(
      blendedInflation(
        { general: 0.06, healthcare: 0.14, education: 0.09, housing: 0.06 },
        { general: 0, healthcare: 0, education: 0, housing: 0 },
      ),
    ).toBe(0.06);
  });
});

describe("calculateFamilyLayerCorpus (audit Entry #6 A6.10; T-376/gh-#165: arg renamed to plannedGoalsLumpToday — every plannedFuture kind, not just education/marriage)", () => {
  it("adds the full planned-goals lump sum + capitalizes contingency at SWR", () => {
    const corpus = calculateFamilyLayerCorpus({
      plannedGoalsLumpToday: 15000000, // ₹1.5 Cr planned-goals target (today rupees; any kind)
      extendedContingencyAnnual: 100000, // ₹1L/yr contingency
      swr: 0.035,
    });
    // 1.5Cr + (1L / 0.035 ≈ 28.57L)
    expect(corpus).toBeCloseTo(15000000 + 100000 / 0.035, 0);
  });
  it("returns 0 when no family layer", () => {
    expect(
      calculateFamilyLayerCorpus({ plannedGoalsLumpToday: 0, extendedContingencyAnnual: 0, swr: 0.035 }),
    ).toBe(0);
  });
});

describe("calculateFireTarget (audit Entry #6 A6.10 + Entry #10 A10.5)", () => {
  it("target = base + familyLayer + base×reservation%", () => {
    const t = calculateFireTarget({
      baseFireNumber: 30000000,
      familyLayerCorpus: 15000000,
      healthcareReservationPercent: 0.2,
    });
    expect(t).toBe(30000000 + 15000000 + 30000000 * 0.2);
  });
  it("with zero family layer + zero reservation, equals base", () => {
    expect(
      calculateFireTarget({ baseFireNumber: 30000000, familyLayerCorpus: 0, healthcareReservationPercent: 0 }),
    ).toBe(30000000);
  });
});

describe("calculateFIREVariants", () => {
  it("returns Lean < Regular < Fat", () => {
    const v = calculateFIREVariants(1000000, 0.035);
    expect(v.leanFIRE).toBeLessThan(v.regularFIRE);
    expect(v.regularFIRE).toBeLessThan(v.fatFIRE);
  });

  it("Lean = 60% of regular; Fat = 150% (defaults)", () => {
    const v = calculateFIREVariants(1000000, 0.035);
    expect(v.leanFIRE).toBeCloseTo(v.regularFIRE * 0.6, -2);
    expect(v.fatFIRE).toBeCloseTo(v.regularFIRE * 1.5, -2);
  });

  it("honors custom variant multipliers (A2.4)", () => {
    const v = calculateFIREVariants(1000000, 0.035, { lean: 0.7, fat: 2.0 });
    expect(v.leanFIRE).toBeCloseTo(v.regularFIRE * 0.7, -2);
    expect(v.fatFIRE).toBeCloseTo(v.regularFIRE * 2.0, -2);
    expect(v.regularFIRE).toBe(calculateFIREVariants(1000000, 0.035).regularFIRE); // regular unaffected
  });
});

describe("calculateSavingsRate", () => {
  it("returns percent of take-home being saved", () => {
    const rate = calculateSavingsRate(100000, 30000); // 30K saved on 100K take-home
    expect(rate).toBeCloseTo(30, 1);
  });

  it("returns 0 for zero income", () => {
    expect(calculateSavingsRate(0, 0)).toBe(0);
  });

  it("clamps negative savings to zero or below", () => {
    const rate = calculateSavingsRate(100000, -10000);
    expect(rate).toBeLessThanOrEqual(0);
  });
});

describe("calculateYearsToTarget", () => {
  it("returns finite years when contribution > 0 and target > corpus", () => {
    const years = calculateYearsToTarget(1000000, 5000000, 50000, 0.12);
    expect(Number.isFinite(years)).toBe(true);
    expect(years).toBeGreaterThan(0);
  });

  it("returns 0 (or negligible) when current already exceeds target", () => {
    const years = calculateYearsToTarget(10000000, 5000000, 50000, 0.12);
    expect(years).toBeLessThanOrEqual(1);
  });

  it("returns Infinity-like when contribution=0 and corpus below target", () => {
    const years = calculateYearsToTarget(1000000, 5000000, 0, 0);
    expect(years === Infinity || years > 100).toBe(true);
  });

  it("accepts a per-year return schedule; a constant function equals the numeric rate (M1, #9)", () => {
    const numeric = calculateYearsToTarget(1_000_000, 20_000_000, 50_000, 0.11);
    const fn = calculateYearsToTarget(1_000_000, 20_000_000, 50_000, () => 0.11);
    expect(fn).toBe(numeric);
  });

  it("a down-tapering schedule takes LONGER to reach target than the flat start rate (de-risking → later FIRE)", () => {
    const flatYears = calculateYearsToTarget(1_000_000, 20_000_000, 50_000, 0.11);
    const taper = (y: number) => Math.max(0.09, 0.11 - y * 0.002);
    const glidedYears = calculateYearsToTarget(1_000_000, 20_000_000, 50_000, taper);
    expect(glidedYears).toBeGreaterThan(flatYears);
  });
});

describe("projectCorpus", () => {
  it("returns array of yearly steps", () => {
    const steps = projectCorpus({
      currentCorpus: 1000000,
      monthlyContribution: 30000,
      expectedReturns: 0.12,
      inflation: 0.06,
      annualExpensesToday: 600000,
      startAge: 30,
      swr: 0.035,
      horizonYears: 20,
    });
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].year).toBeGreaterThanOrEqual(2024);
  });

  it("corpus grows over time with positive contributions", () => {
    const steps = projectCorpus({
      currentCorpus: 1000000,
      monthlyContribution: 30000,
      expectedReturns: 0.12,
      inflation: 0.06,
      annualExpensesToday: 600000,
      startAge: 30,
      swr: 0.035,
      horizonYears: 20,
    });
    const last = steps[steps.length - 1].corpus;
    const first = steps[0].corpus;
    expect(last).toBeGreaterThan(first);
  });

  it("targetForLean < targetForRegular < targetForFat in any year", () => {
    const steps = projectCorpus({
      currentCorpus: 1000000,
      monthlyContribution: 30000,
      expectedReturns: 0.12,
      inflation: 0.06,
      annualExpensesToday: 600000,
      startAge: 30,
      swr: 0.035,
      horizonYears: 20,
    });
    for (const s of steps) {
      expect(s.targetForLean).toBeLessThan(s.targetForRegular);
      expect(s.targetForRegular).toBeLessThan(s.targetForFat);
    }
  });

  // M1 (#9) — per-year return schedule (glide path drives the projection).
  it("accepts a per-year return function; a constant function is byte-identical to the numeric rate", () => {
    const common = {
      currentCorpus: 5_000_000,
      monthlyContribution: 50_000,
      inflation: 0.06,
      annualExpensesToday: 1_200_000,
      startAge: 35,
      swr: 0.035,
      horizonYears: 20,
    };
    const numeric = projectCorpus({ ...common, expectedReturns: 0.11 });
    const fn = projectCorpus({ ...common, expectedReturns: () => 0.11 });
    expect(fn.map((p) => p.corpus)).toEqual(numeric.map((p) => p.corpus));
  });

  it("a down-tapering return schedule yields a LOWER terminal corpus than the flat start rate (de-risking)", () => {
    const common = {
      currentCorpus: 5_000_000,
      monthlyContribution: 50_000,
      inflation: 0.06,
      annualExpensesToday: 1_200_000,
      startAge: 35,
      swr: 0.035,
      horizonYears: 20,
    };
    // Flat at the high (start-equity) return.
    const flat = projectCorpus({ ...common, expectedReturns: 0.11 });
    // A schedule that STARTS at 0.11 and tapers DOWN to 0.09 — never above flat.
    const taper = (y: number) => Math.max(0.09, 0.11 - y * 0.001);
    const glided = projectCorpus({ ...common, expectedReturns: taper });
    const lastIdx = flat.length - 1; // both runs share horizonYears → equal length
    expect(glided[lastIdx].corpus).toBeLessThan(flat[lastIdx].corpus);
  });

  // A9.1 — Floor/Ceiling decumulation overlay.
  it("with no decumulation overlay, output is unchanged (accumulation only, no withdrawals)", () => {
    const steps = projectCorpus({
      currentCorpus: 10_000_000,
      monthlyContribution: 100_000,
      expectedReturns: 0.1,
      inflation: 0.06,
      annualExpensesToday: 1_200_000,
      startAge: 40,
      swr: 0.0325,
      horizonYears: 30,
    });
    expect(steps.every((s) => s.withdrawal === undefined)).toBe(true);
  });

  it("Floor/Ceiling overlay bends the corpus down post-retirement vs accumulation", () => {
    const common = {
      currentCorpus: 30_000_000,
      monthlyContribution: 50_000,
      expectedReturns: 0.08,
      inflation: 0.06,
      annualExpensesToday: 1_200_000,
      startAge: 50,
      swr: 0.0325,
      horizonYears: 30,
    };
    const accumulation = projectCorpus(common);
    const decumulation = projectCorpus({
      ...common,
      decumulation: {
        retirementAge: 55,
        config: {
          kind: "FloorCeiling",
          swr: 0.0325,
          inflation: 0.06,
          floorMultiplier: 0.8,
          ceilingMultiplier: 1.2,
          floorAdjustment: 0.9,
          ceilingAdjustment: 1.0,
        },
      },
    });
    // Pre-retirement (age < 55, i.e. y < 5) the two paths match.
    expect(decumulation[4].corpus).toBe(accumulation[4].corpus);
    // Post-retirement the decumulating path is strictly lower (withdrawals drawn).
    const last = decumulation.length - 1;
    expect(decumulation[last].corpus).toBeLessThan(accumulation[last].corpus);
    // Withdrawals are recorded once decumulation begins.
    expect(decumulation.some((s) => typeof s.withdrawal === "number")).toBe(true);
  });
});

describe("findCrossovers", () => {
  it("returns lean/regular/fat with year or null each", () => {
    const steps = projectCorpus({
      currentCorpus: 10000000,
      monthlyContribution: 100000,
      expectedReturns: 0.12,
      inflation: 0.06,
      annualExpensesToday: 600000,
      startAge: 30,
      swr: 0.035,
      horizonYears: 40,
    });
    const c = findCrossovers(steps);
    expect(c).toHaveProperty("lean");
    expect(c).toHaveProperty("regular");
    expect(c).toHaveProperty("fat");
    // For this strong contributor, lean should cross
    if (c.lean.year) {
      expect(c.lean.year).toBeGreaterThan(2024);
    }
  });
});

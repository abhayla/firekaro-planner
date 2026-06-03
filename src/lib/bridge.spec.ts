/**
 * Phase C (#15) — bridge coverage.
 *
 * The honesty gate: corpus ≥ FIRE number is necessary but NOT sufficient — the
 * LIQUID runway must also cover every retirement year until locked money unlocks.
 * Pins the two DoD cases: a fully-liquid household is covered (no headline move),
 * a locked-heavy early-retiree fails the bridge (effective FIRE age moves later).
 */
import { describe, it, expect } from "vitest";
import { computeBridgeCoverage, type BridgeHolding, type BridgeInput } from "./bridge";
import type { Investment, InvestmentType } from "@/types/household";

const DOB_1986 = "1986-01-01"; // age 40 as of ASOF
const ASOF = new Date("2026-01-01T00:00:00Z");

function holding(type: InvestmentType, value: number, extras: Partial<Investment> = {}): BridgeHolding {
  return {
    asset: { id: `t-${type}-${value}`, type, value, ownerId: "self", ...extras },
    ownerDob: DOB_1986,
  };
}

function baseInput(over: Partial<BridgeInput> = {}): BridgeInput {
  return {
    holdings: [],
    retirementAge: 50,
    anchorAge: 40,
    planToAge: 90,
    annualExpenses: 1_200_000,
    income: { rentalAnnualPostTax: 0, epsAnnualPostTax: 0, epsStartAge: 58 },
    exitLumpNet: 0,
    marginalRate: 0.3,
    asOf: ASOF,
    ...over,
  };
}

describe("computeBridgeCoverage — fully-liquid household is covered (no headline move)", () => {
  it("all-liquid corpus → covered, effectiveFireAge == the corpus-adequate age", () => {
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 50,
        holdings: [holding("Stocks", 30_000_000), holding("FD", 5_000_000)],
      }),
    );
    expect(r.covered).toBe(true);
    expect(r.effectiveFireAge).toBe(50); // unchanged
    expect(r.shortfallYears).toBe(0);
    expect(r.shortfallAmount).toBe(0);
    expect(r.lockedCorpus).toBe(0);
    expect(r.unlockTimeline).toHaveLength(0);
    expect(r.reachableCorpus).toBeGreaterThan(0);
  });

  it("EPF counts as liquid at the FIRE age (job exit) → still covered", () => {
    const r = computeBridgeCoverage(
      baseInput({ retirementAge: 50, holdings: [holding("EPF_VPF", 20_000_000)] }),
    );
    expect(r.covered).toBe(true);
    expect(r.unlockTimeline).toHaveLength(0);
  });
});

describe("computeBridgeCoverage — locked-heavy early-retiree fails the bridge", () => {
  it("a corpus locked mostly in PPF (matures past the early FIRE age) → NOT covered, FIRE age moves later", () => {
    // Retire at 47; tiny liquid + a large PPF with NO opening year → assumed
    // locked till 60. The liquid runway can't fund 47→60, so the bridge fails.
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 47,
        annualExpenses: 1_200_000,
        holdings: [
          holding("FD", 1_000_000), // ~₹10L liquid — < 1 year of cover beyond a little
          holding("PPF", 25_000_000), // ₹2.5Cr locked till 60
        ],
      }),
    );
    expect(r.covered).toBe(false);
    expect(r.effectiveFireAge).toBeGreaterThan(47);
    expect(r.shortfallYears).toBeGreaterThan(0);
    expect(r.shortfallAmount).toBeGreaterThan(0);
    expect(r.lockedCorpus).toBeGreaterThan(r.reachableCorpus);
    expect(r.unlockTimeline.some((u) => u.age === 60)).toBe(true);
    expect(r.assumptions.some((a) => a.id === "bridge-shortfall")).toBe(true);
  });

  it("the SAME corpus, fully liquid instead, IS covered — proving lock (not size) is the cause", () => {
    const locked = computeBridgeCoverage(
      baseInput({ retirementAge: 47, holdings: [holding("FD", 1_000_000), holding("PPF", 25_000_000)] }),
    );
    const liquid = computeBridgeCoverage(
      baseInput({ retirementAge: 47, holdings: [holding("FD", 26_000_000)] }),
    );
    expect(locked.covered).toBe(false);
    expect(liquid.covered).toBe(true);
    expect(liquid.effectiveFireAge).toBe(47);
  });
});

describe("computeBridgeCoverage — bridge income shortens / closes the gap", () => {
  it("rental + EPS income reduces the net draw and can flip a gap to covered", () => {
    const noIncome = computeBridgeCoverage(
      baseInput({
        retirementAge: 56, // EPS (58) and a PPF unlock both near
        annualExpenses: 1_200_000,
        holdings: [holding("FD", 2_500_000), holding("PPF", 5_000_000, { openingYear: 2010 })],
      }),
    );
    const withIncome = computeBridgeCoverage(
      baseInput({
        retirementAge: 56,
        annualExpenses: 1_200_000,
        income: { rentalAnnualPostTax: 1_300_000, epsAnnualPostTax: 200_000, epsStartAge: 58 },
        holdings: [holding("FD", 2_500_000), holding("PPF", 5_000_000, { openingYear: 2010 })],
      }),
    );
    // Income strictly helps: covered-or-better, and never a larger shortfall.
    expect(withIncome.shortfallAmount).toBeLessThanOrEqual(noIncome.shortfallAmount);
    expect(withIncome.bridgeIncomeAnnual).toBeGreaterThan(noIncome.bridgeIncomeAnnual);
  });

  it("an exit lump (gratuity) adds to the reachable corpus at the FIRE age", () => {
    const withGratuity = computeBridgeCoverage(
      baseInput({ retirementAge: 47, exitLumpNet: 1_500_000, holdings: [holding("FD", 1_000_000)] }),
    );
    expect(withGratuity.reachableCorpus).toBeGreaterThanOrEqual(1_500_000);
  });
});

describe("computeBridgeCoverage — NPS early exit strands money in an annuity", () => {
  it("a large NPS on an early exit → most locked into an annuity income stream, not a lump", () => {
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 47,
        holdings: [holding("NPS", 10_000_000)],
      }),
    );
    // Only 20% (₹20L) is a cash lump on early exit; the 80% annuity shows up as
    // bridge income, not reachable corpus.
    expect(r.reachableCorpus).toBeLessThan(10_000_000);
    expect(r.bridgeIncomeAnnual).toBeGreaterThan(0);
  });
});

describe("computeBridgeCoverage — exact-value lock (catches sign/off-by-one drift)", () => {
  it("a single PPF tranche + zero income → exact effectiveFireAge, shortfall, and timeline", () => {
    // Fully determined: retire 50, expenses ₹10L/yr, ₹15L liquid FD, ₹5Cr PPF
    // (no opening year → locked till 60), no income, no scaling. Corpus is
    // adequate (₹5.15Cr) but mostly locked, so the early years are underwater
    // until the PPF unlocks at 60 — when the whole corpus turns liquid → covered.
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 50,
        annualExpenses: 1_000_000,
        income: { rentalAnnualPostTax: 0, epsAnnualPostTax: 0, epsStartAge: 58 },
        holdings: [holding("FD", 1_500_000), holding("PPF", 50_000_000)],
      }),
    );
    expect(r.covered).toBe(false);
    expect(r.unlockTimeline).toHaveLength(1);
    expect(r.unlockTimeline[0].age).toBe(60);
    expect(r.unlockTimeline[0].netAmount).toBe(50_000_000); // PPF is tax-free
    // The search finds the TIGHTEST covered age: retiring at 59, the ₹15L liquid
    // funds the single year 59→60, then the ₹5Cr PPF unlocks at 60 → covered.
    expect(r.effectiveFireAge).toBe(59);
    expect(r.reachableCorpus).toBe(1_500_000);
    expect(r.lockedCorpus).toBe(50_000_000);
  });

  it("the searched effectiveFireAge is ALWAYS genuinely covered (never a still-underwater age)", () => {
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 47,
        annualExpenses: 1_200_000,
        holdings: [holding("FD", 1_000_000), holding("PPF", 25_000_000)],
      }),
    );
    expect(r.covered).toBe(false);
    // Re-run the bridge AT the reported effective age — it must come back covered.
    const atEffective = computeBridgeCoverage(
      baseInput({
        retirementAge: r.effectiveFireAge,
        annualExpenses: 1_200_000,
        holdings: [holding("FD", 1_000_000), holding("PPF", 25_000_000)],
      }),
    );
    expect(atEffective.covered).toBe(true);
  });
});

describe("computeBridgeCoverage — NPS scaling does not over-credit the annuity (HIGH #1 lock)", () => {
  it("a corpusScale on a mixed NPS+liquid portfolio scales the NPS proportionally, not the income unboundedly", () => {
    // ₹10L NPS today, scaled ×4 → ₹40L at retirement. Early exit (retire 47):
    // 20% lump (₹8L) liquid + 80% annuity (₹32L → ~₹1.92L/yr pension). The income
    // must reflect the SCALED corpus exactly once, not a doubly-grown figure.
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 47,
        corpusScale: 4,
        holdings: [holding("NPS", 1_000_000), holding("FD", 500_000)],
      }),
    );
    // 20% of the scaled ₹40L = ₹8L lump (+ ₹2L FD scaled = ₹2M) reachable.
    expect(r.reachableCorpus).toBeGreaterThan(0);
    // Annuity income = post-tax of 80% × ₹40L × 6% = post-tax(₹1.92L). At 30% → ~₹1.34L.
    expect(r.bridgeIncomeAnnual).toBeGreaterThan(100_000);
    expect(r.bridgeIncomeAnnual).toBeLessThan(2_000_000); // bounded — not unbounded over-credit
  });
});

describe("computeBridgeCoverage — defensive / pure", () => {
  it("an empty household is trivially covered", () => {
    const r = computeBridgeCoverage(baseInput({ holdings: [] }));
    expect(r.covered).toBe(true);
    expect(r.reachableCorpus).toBe(0);
  });

  it("is pure: same inputs → deep-equal result", () => {
    const input = baseInput({ holdings: [holding("PPF", 5_000_000), holding("Stocks", 3_000_000)] });
    expect(computeBridgeCoverage(input)).toEqual(computeBridgeCoverage(input));
  });
});

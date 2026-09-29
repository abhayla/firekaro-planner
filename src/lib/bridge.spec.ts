/**
 * Phase C (#15) — bridge coverage.
 *
 * The honesty gate: corpus ≥ FIRE number is necessary but NOT sufficient — the
 * LIQUID runway must also cover every retirement year until locked money unlocks.
 * Pins the two DoD cases: a fully-liquid household is covered (no headline move),
 * a locked-heavy early-retiree fails the bridge (effective FIRE age moves later).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  computeBridgeCoverage,
  projectHoldingToRetirement,
  PPF_ANNUAL_CONTRIBUTION_CAP,
  type BridgeHolding,
  type BridgeInput,
  type BridgeProjection,
} from "./bridge";
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

// ---------------------------------------------------------------------------
// #212 — PER-TRANCHE PROJECTION. The bug: one portfolio-wide `corpusScale` grew
// EVERY holding as if the household's whole savings residual landed in it, so
// the locked slice was projected past what its instrument can physically reach
// (measured on the sharmas seed: a 6L PPF -> 53.32L at 8.89x, ~3.4x what
// 1.5L/yr at 7.1% can reach) while the ABSOLUTE liquid pool was inflated
// against a bill rising only at CPI-real. Every seed read `covered: true`:
// leniency, not coverage. These tests pin the three properties that make the
// replacement honest AND frame-consistent.
// ---------------------------------------------------------------------------

/** A projection whose returns/contributions are uniform unless a test overrides them. */
function projection(over: Partial<BridgeProjection> = {}): BridgeProjection {
  return {
    targetReal: 50_000_000,
    realReturnFor: () => 0.05,
    realMonthlyContributionFor: () => 0,
    yearsToRetirement: 10,
    ...over,
  };
}

describe("#212 projectHoldingToRetirement — each family grows by its OWN rule", () => {
  it("PPF: the statutory 1.5L/yr cap BINDS — a larger plan cannot buy a larger PPF", () => {
    const ppf = (monthly: number) =>
      projectHoldingToRetirement(
        { id: "p", type: "PPF", value: 600_000, ownerId: "self" },
        projection({
          realReturnFor: () => 0.071,
          realMonthlyContributionFor: () => monthly,
          yearsToRetirement: 21,
        }),
      );
    // 1.5L/yr is 12,500/mo. Anything above it must produce the SAME value — the cap BINDS.
    const atCap = ppf(12_500);
    expect(ppf(50_000)).toBeCloseTo(atCap, 6);
    expect(ppf(200_000)).toBeCloseTo(atCap, 6);
    // Below the cap the plan DOES move the value (proving the cap is a ceiling, not a flat rule).
    expect(ppf(5_000)).toBeLessThan(atCap);
    // A capped PPF at its own return can never reach the old uniform-scaled figure. The bridge's
    // REAL frame is what the seeds see (7.1% nominal is ~1% real), and there the measured sharmas
    // value is 42.45L against the old 53.32L — a strictly SMALLER locked slice.
    const atCapReal = projectHoldingToRetirement(
      { id: "p", type: "PPF", value: 600_000, ownerId: "self" },
      projection({
        realReturnFor: () => 0.0104, // 7.1% nominal de-inflated at ~6% general CPI
        realMonthlyContributionFor: () => 12_500,
        yearsToRetirement: 21,
      }),
    );
    expect(atCapReal).toBeLessThan(5_332_000);
    expect(atCapReal / 100_000).toBeGreaterThan(35);
    expect(atCapReal / 100_000).toBeLessThan(50);
  });

  it("real estate: appreciation ONLY — a contribution plan never tops a property up", () => {
    const p = (monthly: number) =>
      projectHoldingToRetirement(
        {
          id: "re",
          type: "RealEstate",
          value: 6_000_000,
          ownerId: "self",
          realEstateRole: "Investment",
        },
        projection({
          realReturnFor: () => 0,
          realMonthlyContributionFor: () => monthly,
          yearsToRetirement: 22,
        }),
      );
    // Zero real appreciation + no top-ups => exactly today's value, whatever the plan says.
    expect(p(0)).toBeCloseTo(6_000_000, 6);
    expect(p(100_000)).toBeCloseTo(6_000_000, 6);
  });

  it("EPF/NPS: grows on its OWN contributions, never on the rest of the plan", () => {
    const nps = projectHoldingToRetirement(
      { id: "n", type: "NPS", value: 1_200_000, ownerId: "self" },
      projection({
        realReturnFor: () => 0.04,
        realMonthlyContributionFor: (a) => (a.id === "n" ? 10_000 : 999_999),
        yearsToRetirement: 22,
      }),
    );
    // 1.2M at 4% for 22y plus 1.2L/yr for 22y — bounded well under any whole-plan scaling.
    expect(nps).toBeGreaterThan(1_200_000 * 1.04 ** 22);
    expect(nps).toBeLessThan(1_200_000 * 1.04 ** 22 + 120_000 * 22 * 1.04 ** 22);
  });
});

describe("#212 property invariant — a capped instrument never exceeds its own cap-ceiling", () => {
  it("PPF projected value <= (value + cap contributions) compounded at its OWN return, any plan", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20_000_000, noNaN: true }),
        fc.double({ min: 0, max: 1_000_000, noNaN: true }),
        fc.double({ min: 0, max: 0.2, noNaN: true }),
        fc.integer({ min: 0, max: 40 }),
        (value, monthly, r, years) => {
          const got = projectHoldingToRetirement(
            { id: "ppf", type: "PPF", value, ownerId: "self" },
            projection({
              realReturnFor: () => r,
              realMonthlyContributionFor: () => monthly,
              yearsToRetirement: years,
            }),
          );
          // The ceiling: today's value plus the STATUTORY cap every year, at its own return.
          let ceiling = value;
          for (let t = 0; t < years; t++) {
            ceiling = ceiling * (1 + r) + PPF_ANNUAL_CONTRIBUTION_CAP;
          }
          // A tiny relative tolerance for float accumulation over 40 compounding steps.
          expect(got).toBeLessThanOrEqual(ceiling * (1 + 1e-9) + 1e-6);
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe("#212 reconciliation identity — the household total still equals the adequacy target", () => {
  it("the liquid pool ABSORBS the residual: a bigger target grows the liquid side, not the PPF", () => {
    const run = (targetReal: number) =>
      computeBridgeCoverage(
        baseInput({
          retirementAge: 52,
          anchorAge: 31,
          holdings: [holding("Stocks", 1_800_000), holding("PPF", 600_000)],
          projection: {
            targetReal,
            realReturnFor: (a) => (a.type === "PPF" ? 0.071 : 0.06),
            realMonthlyContributionFor: () => 12_500,
            yearsToRetirement: 21,
          },
        }),
      );
    const small = run(50_000_000);
    const big = run(100_000_000);
    // The PPF tranche is CAPPED — doubling the target must not move it at all.
    expect(big.lockedCorpus).toBe(small.lockedCorpus);
    // The liquid runway is what absorbs the extra.
    expect(big.reachableCorpus).toBeGreaterThan(small.reachableCorpus);
  });

  it("floors at 0: bounded projections exceeding the target leave NO liquid runway (gate fires)", () => {
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 50,
        anchorAge: 40,
        annualExpenses: 1_200_000,
        holdings: [holding("Stocks", 1_000_000), holding("PPF", 30_000_000)],
        projection: {
          targetReal: 1_000_000, // absurdly below the PPF alone
          realReturnFor: () => 0.07,
          realMonthlyContributionFor: () => 0,
          yearsToRetirement: 10,
        },
      }),
    );
    // Liquid budget floors at 0 (never negative) and the PPF is locked until 60 -> bridge fails.
    expect(r.reachableCorpus).toBe(0);
    expect(r.covered).toBe(false);
    expect(r.effectiveFireAge).toBeGreaterThan(50);
  });
});

describe("#212 no-op guarantees — nothing changes where no rule applies", () => {
  it("NO `projection` supplied => the pre-#212 corpusScale path, unchanged", () => {
    const holdings = [
      holding("Stocks", 3_000_000),
      holding("PPF", 2_500_000),
      holding("NPS", 1_000_000),
    ];
    const x1 = computeBridgeCoverage(baseInput({ retirementAge: 50, corpusScale: 1, holdings }));
    const x4 = computeBridgeCoverage(baseInput({ retirementAge: 50, corpusScale: 4, holdings }));
    // The scalar path still scales every holding UNIFORMLY: 4x the inputs, so the locked PPF
    // tranche is exactly 4x too (it is EEE, so no tax haircut distorts the ratio).
    expect(x4.lockedCorpus).toBe(x1.lockedCorpus * 4);
    // And the liquid side grows with it (post-tax, so not exactly 4x — LTCG bites on the gain).
    expect(x4.reachableCorpus).toBeGreaterThan(x1.reachableCorpus);
  });

  it("a household with NO locked holdings is covered, unmoved, and lands exactly on the target", () => {
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 50,
        holdings: [holding("Stocks", 3_000_000), holding("FD", 500_000)],
        projection: {
          targetReal: 40_000_000,
          realReturnFor: () => 0.06,
          realMonthlyContributionFor: () => 30_000,
          yearsToRetirement: 10,
        },
      }),
    );
    expect(r.covered).toBe(true);
    expect(r.effectiveFireAge).toBe(50);
    expect(r.lockedCorpus).toBe(0);
    expect(r.unlockTimeline).toHaveLength(0);
    // Nothing is bounded, so the liquid pool absorbs the WHOLE target. `reachableCorpus` is the
    // POST-TAX net of liquidating it, so it sits just BELOW the target (the equity LTCG haircut on
    // the gain) and never above it — the identity, read through the tax layer that follows it.
    expect(r.reachableCorpus).toBeLessThan(40_000_000);
    expect(r.reachableCorpus).toBeGreaterThan(40_000_000 * 0.9);
  });
});

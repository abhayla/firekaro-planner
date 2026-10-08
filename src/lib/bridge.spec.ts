/**
 * Phase C (#15) — bridge coverage.
 *
 * The honesty gate: corpus ≥ FIRE number is necessary but NOT sufficient — the
 * LIQUID runway must also cover every retirement year until locked money unlocks.
 * Pins the two DoD cases: a fully-liquid household is covered (no headline move),
 * a locked-heavy early-retiree fails the bridge (effective FIRE age moves later).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { loadRaviSeed } from "@/seeds/ravi";
import { derive } from "@/lib/derive";
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
import {
  ASSUMED_PROPERTY_SALE_LAG_YEARS,
  REAL_ESTATE_ILLIQUIDITY_HAIRCUT,
} from "./accessibility";

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

// ---------------------------------------------------------------------------
// #212 RESIDUAL (a) — THE PROPORTIONAL LIQUID SPLIT, PINNED PER-HOLDING.
//
// `computeBridgeCoverage`'s documented rule (see `buildProjectedValues` in bridge.ts): the liquid
// budget `targetReal − boundedTotal` is distributed across liquid tranches IN PROPORTION TO EACH
// TRANCHE'S OWN STANDALONE PROJECTION (`projectHoldingToRetirement` run on that holding alone) —
// never an equal split, and never proportional to TODAY's value. Only the sum identity was
// guarded before this test; a mutant that swaps the rule for an equal split reads the exact same
// `projectedPreTaxTotal` (still equals `targetReal`) and would ship green.
//
// Both holdings are FD (`liquidationTaxTreatment` = "pass-through" — net == gross, NO tax haircut
// and no LTCG-exemption threading), so `reachableCorpus` reads the PRE-TAX split exactly — the
// cleanest possible surface to pin the DIVISION rule on, not just the sum.
//
// THE FIXTURE, BY HAND (node-verified this session, not freehand arithmetic):
// two liquid FD holdings, no locked tranche (boundedTotal = 0, so liquidBudget = targetReal = 1 Cr):
//   Holding A: value 10L,  monthly 0,      r=5%, 10y  -> standalone = value*(1.05)^10 = 16,28,894.63
//   Holding B: value 20L,  monthly 20,000, r=5%, 10y  -> standalone = 62,76,483.46 (compounding the
//     ANNUAL contribution of monthly*12 = 2,40,000/yr at 5%, 10 years, atop the 20L opening value)
//   Standalone total = 79,05,378.09
// Three splits of the SAME 1 Cr liquid budget, all different:
//   EQUAL split:              A = B = 50,00,000.00
//   VALUE-proportional (today's ₹ 10L:20L = 1:2): A = 33,33,333.33, B = 66,66,666.67
//   CORRECT (standalone-projection-proportional):  A = 20,60,489.21, B = 79,39,510.79
// ---------------------------------------------------------------------------
describe("#212 residual (a) — the liquid residual splits PROPORTIONAL TO EACH HOLDING'S OWN STANDALONE PROJECTION, never equally and never by today's value", () => {
  // A is FD ("pass-through" tax: net == gross, no haircut). B is Stocks ("equity-ltcg": taxed).
  // Mixing tax treatments is DELIBERATE and load-bearing: when both tranches share ONE tax
  // treatment, `reachableCorpus` (the sum) is IDENTICAL under every split rule (equal,
  // value-proportional, or correct) — verified by hand (see /tmp/calc2.js this session) — because
  // tax-free addition doesn't care how a fixed total is divided. Only a MIXED-tax pair makes the
  // DIVISION itself observable through the post-tax total, which is the only number
  // `computeBridgeCoverage`'s public API exposes.
  const holdingA = holding("FD", 1_000_000); // liquid, pass-through (0% tax), no contribution
  const holdingB = holding("Stocks", 2_000_000, { monthlyContribution: 20_000 }); // liquid, equity-ltcg, contributing

  const STANDALONE_A = 1_628_894.63;
  const STANDALONE_B = 6_276_483.46;
  const CORRECT_A = 2_060_489.21;
  const CORRECT_B = 7_939_510.79;
  const EQUAL_SPLIT = 5_000_000;
  const VALUE_PROPORTIONAL_A = 10_000_000 * (1_000_000 / 3_000_000); // 33,33,333.33
  const VALUE_PROPORTIONAL_B = 10_000_000 * (2_000_000 / 3_000_000); // 66,66,666.67

  // Equity-LTCG post-tax net, mirroring liquidation-tax.ts exactly (ASSUMED_GAIN_FRACTION 0.7,
  // LTCG_LISTED_EXEMPTION ₹1.25L, LTCG_LISTED_RATE 12.5%, 4% cess, Math.round on the tax only).
  function postTaxEquityNet(gross: number): number {
    const gain = gross * 0.7;
    const exemptUsed = Math.min(gain, 125_000);
    const taxable = Math.max(0, gain - exemptUsed);
    const tax = Math.round(taxable * 0.125 * 1.04);
    return gross - tax;
  }
  // Holding A is FD (pass-through, 0% tax) — its net always equals its gross share.
  const NET_TOTAL_CORRECT = CORRECT_A + postTaxEquityNet(CORRECT_B);
  const NET_TOTAL_EQUAL = EQUAL_SPLIT + postTaxEquityNet(EQUAL_SPLIT);

  function runWith(holdings: BridgeHolding[]) {
    return computeBridgeCoverage(
      baseInput({
        retirementAge: 50,
        anchorAge: 40,
        annualExpenses: 0, // isolate the split from any bridge-year drawdown noise
        holdings,
        projection: {
          targetReal: 10_000_000, // no locked holdings => the WHOLE budget is liquid
          realReturnFor: () => 0.05,
          realMonthlyContributionFor: (asset) => (asset.id === holdingB.asset.id ? 20_000 : 0),
          yearsToRetirement: 10,
        },
      }),
    );
  }

  it("the three candidate splits give materially different numbers — the fixture actually discriminates (sanity check on the hand derivation)", () => {
    expect(CORRECT_A).not.toBeCloseTo(EQUAL_SPLIT, -4);
    expect(CORRECT_A).not.toBeCloseTo(VALUE_PROPORTIONAL_A, -4);
    expect(CORRECT_B).not.toBeCloseTo(EQUAL_SPLIT, -4);
    expect(CORRECT_B).not.toBeCloseTo(VALUE_PROPORTIONAL_B, -4);
    // The mixed-tax post-tax TOTALS also differ materially (₹92.94L correct vs ₹95.61L equal) —
    // this is the gap `reachableCorpus` below is read against.
    expect(NET_TOTAL_EQUAL - NET_TOTAL_CORRECT).toBeGreaterThan(200_000);
  });

  it("real code: projectedPreTaxTotal pins the SUM (already guarded) at exactly the target, pre-tax and per-holding standalone projections match hand derivation to ₹1", () => {
    const r = runWith([holdingA, holdingB]);
    expect(r.projectedPreTaxTotal).not.toBeNull();
    expect(r.projectedPreTaxTotal!).toBeCloseTo(10_000_000, 0);
    const pA = projectHoldingToRetirement(holdingA.asset, {
      targetReal: 10_000_000,
      realReturnFor: () => 0.05,
      realMonthlyContributionFor: () => 0,
      yearsToRetirement: 10,
    });
    const pB = projectHoldingToRetirement(holdingB.asset, {
      targetReal: 10_000_000,
      realReturnFor: () => 0.05,
      realMonthlyContributionFor: () => 20_000,
      yearsToRetirement: 10,
    });
    expect(pA).toBeCloseTo(STANDALONE_A, 1);
    expect(pB).toBeCloseTo(STANDALONE_B, 1);
  });

  it("MUTANT PROOF: reachableCorpus (post-tax total) matches the CORRECT standalone-proportional split (₹92,93,754.52), NOT the equal-split total (₹95,61,250) — apply an equal-split mutant to buildProjectedValues, run this file, observe RED, then `git checkout -- src/lib/bridge.ts`", () => {
    // With A (FD, 0% tax) and B (Stocks, equity-LTCG taxed) mixed, the split rule determines HOW
    // MUCH of the ₹1 Cr liquid budget lands on the taxed side — a bigger share to B under the
    // correct rule (79.4% vs the equal rule's 50%) means MORE tax is paid, so reachableCorpus is
    // LOWER under the correct rule than an equal-split mutant would produce. This is the one
    // number the public API exposes that the split rule actually moves.
    const r = runWith([holdingA, holdingB]);
    // The correct-rule net total, pinned to the nearest rupee (rounding happens inside the tax calc).
    expect(r.reachableCorpus).toBeCloseTo(Math.round(NET_TOTAL_CORRECT), -1);
    // An equal-split mutant would instead produce ~₹95,61,250 — strictly and measurably HIGHER
    // (less tax paid because less of the budget sits on the taxed side) than what real code gives.
    expect(r.reachableCorpus).toBeLessThan(Math.round(NET_TOTAL_EQUAL) - 100_000);
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

const IDENTITY_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
type IH = ReturnType<typeof useHouseholdStore>;
type IA = ReturnType<typeof useAssumptionsStore>;
const IDENTITY_PERSONAS: Array<{ name: string; load: (h: IH, a: IA) => void }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a, IDENTITY_LENS.currentFY) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a, IDENTITY_LENS.currentFY) },
  { name: "ravi", load: (h, a) => loadRaviSeed(h, a) },
];

// ---------------------------------------------------------------------------
// #212 REVIEW — THE RECONCILIATION IDENTITY, ASSERTED PRE-TAX ON EVERY SEED.
//
// Why this exists: the first round pinned the per-tranche RULES but never the
// identity itself, because `reachableCorpus`/`lockedCorpus` are both POST-TAX
// (a liquidation haircut sits between the projection and them) and the NPS
// annuity slice leaves the lump entirely — so neither can express
// "Σ projections === targetReal". `projectedPreTaxTotal` is exposed for exactly
// this, and this block asserts it through the REAL `derive()` path (not a hand
// fixture) on all five populated seeds.
//
// It is also the ARBITER of the double-count question raised in review: the
// adequacy target is solved from `annualSavings`, which already contains every
// `investments[].monthlyContribution`, and `boundedTotal` then grows the locked
// tranches by those same earmarked inflows. If that were a duplication the sum
// would EXCEED the target and this test would be red. It is an attribution
// instead — each earmarked rupee counted once against its own locked tranche,
// with the liquid budget taking the remainder of the SAME target.
// ---------------------------------------------------------------------------
describe("#212 reconciliation identity — Σ pre-tax projections === the adequacy target (real derive)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of IDENTITY_PERSONAS) {
    it(`${persona.name}: |projectedPreTaxTotal − targetReal| < ₹1`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, IDENTITY_LENS, { currentYear: 2026 });
      const b = k.bridgeCoverage;
      expect(b).not.toBeNull();
      // The bridge ran with a per-tranche projection, so the total is exposed.
      expect(b!.projectedPreTaxTotal).not.toBeNull();
      // The target the adequacy leg solved to, at the age the bridge was tested at — read from the
      // same component schedule `derive()` hands the bridge, so this is the identity's other half
      // and not a re-derivation of it.
      const targetReal = k.regularTargetComponentsRealAt(
        b!.corpusOnlyFireAge - k.anchorAge,
      ).total;
      expect(Math.abs(b!.projectedPreTaxTotal! - targetReal)).toBeLessThan(1);
    });
  }
});

// ---------------------------------------------------------------------------
// #212 REVIEW — PROVE THE GATE ACTUALLY FIRES.
//
// The first round corrected the locked/liquid SPLIT but no seed's verdict moved,
// so nothing demonstrated the coverage check can still fail under the new
// projection. This is that proof, on a realistic locked-heavy household: a
// ₹1.2 Cr EPF + ₹40 L PPF + ₹2 Cr let-out property + ₹15 L MF retiring at 48,
// where the property never liquidates, the PPF is held to 60, and the liquid
// remainder cannot carry the bridge bill.
// ---------------------------------------------------------------------------
describe("#212 the gate fires — a locked-heavy early retiree is NOT covered", () => {
  it("retire at 48 with ₹2 Cr illiquid + ₹40 L PPF locked to 60 → covered:false, FIRE age moves later", () => {
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 48,
        anchorAge: 40,
        planToAge: 90,
        // The bridge bill: ₹30 L/yr for the 12 years to the PPF unlock at 60. Against a ₹3.75 Cr
        // adequate corpus that is an 8% draw — high, which is exactly why a household this
        // locked-heavy cannot fund the early years out of the liquid slice alone.
        annualExpenses: 3_000_000,
        exitLumpNet: 1_500_000,
        income: { rentalAnnualPostTax: 300_000, epsAnnualPostTax: 0, epsStartAge: 58 },
        holdings: [
          holding("EPF_VPF", 12_000_000),
          holding("PPF", 4_000_000),
          // #211 — this household INTENDS to hold the let-out flat (it is the rental income that
          // funds them), so the sale is dated at 75. Before #211 the property was implicitly
          // never-sold and this fixture needed no such field; it is stated explicitly now so the
          // gate keeps testing what it was written to test — a household whose LIQUID slice cannot
          // carry the early years — rather than being rescued by an assumed sale three years in.
          holding("RealEstate", 20_000_000, { realEstateRole: "Investment", plannedSaleAge: 75 }),
          holding("MutualFunds", 1_500_000),
        ],
        projection: {
          // The household is corpus-adequate at ₹3.75 Cr — but most of it cannot be spent at 48.
          targetReal: 37_500_000,
          realReturnFor: (asset) =>
            asset.type === "PPF" ? 0.01 : asset.type === "EPF_VPF" ? 0.02 : asset.type === "RealEstate" ? 0 : 0.06,
          realMonthlyContributionFor: (asset) =>
            asset.type === "PPF" ? 12_500 : asset.type === "EPF_VPF" ? 25_000 : 0,
          yearsToRetirement: 8,
        },
      }),
    );
    // The property is held to 75 and the PPF past 48 → the liquid runway is thin.
    expect(r.lockedCorpus).toBeGreaterThan(20_000_000);
    expect(r.unlockTimeline.length).toBeGreaterThan(0);
    // THE GATE: the liquid money does not carry the bridge, so the headline moves LATER.
    expect(r.covered).toBe(false);
    expect(r.shortfallYears).toBeGreaterThan(0);
    expect(r.shortfallAmount).toBeGreaterThan(0);
    expect(r.effectiveFireAge).toBeGreaterThan(r.corpusOnlyFireAge);
    // ...and it reports a surfaced reason, not a silent move.
    expect(r.assumptions.some((x) => x.id === "bridge-shortfall")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #212 RESIDUAL (b) — A PERSONA-PLAUSIBLE LOCKED-HEAVY FIXTURE THROUGH THE REAL
// `derive()` PATH (not a hand-built BridgeInput like the fixture above).
//
// REJECTED FIRST ATTEMPT (2026-09-29, this session): a ₹3.2 Cr PPF is not persona-plausible — the
// statutory cap is ₹1.5L/yr (₹1L before FY2014-15, ₹70k before FY2011-12); even 30 years at the
// CURRENT cap compounding at ~7.5-8% tops out around ₹1.5-1.7 Cr. That fixture was the forced case
// the brief forbids. Caps used below, derived by hand:
//   PPF ≤ ₹1.6 Cr  — years contributing × cap × growth: 30y × ₹1.5L/yr compounded @7.5% ≈ ₹1.55 Cr
//     (node-verified this session: ppfCompound(30, 150_000, 0.075) = 1,55,09,910).
//   NPS ≤ ₹60 L    — a ₹28L-CTC earner's own 50k/yr + ~10% employer share since 2009 (17y by 2026):
//     17y × ₹1.7L/yr compounded @8-9% ≈ ₹57-63L (node-verified: npsCompound(17, 170_000, 0.08..0.09)).
// This fixture uses PPF ₹1.5 Cr (15,000,000) and NPS ₹55L (5,500,000) — both inside the derived
// caps (PPF ≤ ₹1.6 Cr, NPS ≤ ₹60L).
//
// THE HONEST FINDING (searched ≤20 tool calls, 18 candidates tried — see the report's per-fixture
// table): `accessibility.ts` classifies EPF as unlocking AT the retirement age (job-exit rule) and
// NPS also unlocks AT the retirement age (only the annuity SLICE becomes non-lump income, credited
// from that same age) — so neither can create a bridge gap for a household retiring after its own
// FIRE-adequate age. The ONLY instrument that locks PAST a plausible early-retirement age is an
// UNDATED PPF (locks to 60, `ASSUMED_PENSION_UNLOCK_AGE`). Every candidate that pushed the
// corpus-ADEQUATE age (`corpusOnlyFireAge`, which `derive()` computes independently of
// `targetRetirementAge` — it is NOT an input the household can pin directly) early enough to leave
// a meaningful PPF-locked gap ALSO left enough liquid runway + bridge income (NPS annuity + partial
// income streams) to cover the resulting 1-2 year window. Every candidate that starved liquidity
// enough to matter pushed `corpusOnlyFireAge` to 59-63 — by which point the undated PPF's 60-age
// unlock leaves at most a 1-year gap, which even a thin liquid slice + bridge income covers.
//
// THIS IS THE STRONGEST PLAUSIBLE FIXTURE FOUND (candidate C12/C13 in the search table): a
// 55-year-old retiring once corpus-adequate (age 59, per derive()'s own solve), with a PPF at the
// derived cap (locked to 60 — only a 1-year bridge), a NPS at its derived cap, and a THIN liquid MF
// slice (₹1L). It is COVERED, and the margin (`reachableCorpus` minus the single bridge year's net
// draw) is recorded rather than forced — the honest finding #212 asks for.
// ---------------------------------------------------------------------------
describe("#212 residual (b) — limit recorded: no persona-plausible locked-heavy household binds the gate", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("strongest plausible fixture found (PPF at cap, NPS at cap, thin liquid MF) → covered:true, margin recorded", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.data.members = [
      {
        id: "you",
        name: "You",
        dateOfBirth: "1971-01-01", // age 55 as of this file's pinned currentYear (2026)
        role: "ADULT",
        targetRetirementAge: 55,
        planToAge: 90,
        relation: "",
        city: "Metro",
        health: "Healthy",
        riskAppetite: "Conservative",
        marital: "Married",
        employmentStatus: "Employed",
        salary: { annualCTC: 2_800_000, hikePercent: 4 }, // ₹28L CTC — inside the ₹2.5L–₹1Cr band
      },
    ] as typeof h.data.members;
    h.data.expenses.avgMonthly = 66_667; // ₹8L/yr today — inside the ₹8-10L/yr band the issue names
    h.data.investments = [];
    // PPF at the derived cap: 30y at the ₹1.5L statutory cap compounding at ~7.5% ≈ ₹1.5 Cr. NO
    // openingYear set — the household never recorded it, which is the DEFAULT path every real user
    // hits (per the #211 "no plannedSaleAge" precedent above) — so it locks to age 60
    // (`ASSUMED_PENSION_UNLOCK_AGE`), not a dated maturity.
    h.addInvestment({ type: "PPF", label: "PPF (near cap)", value: 15_000_000, monthlyContribution: 12_500, ownerId: "you" });
    // NPS at the derived cap: ~17y since 2009 of ~10% employer + ₹50k/yr own contribution, ≈₹55-60L.
    h.addInvestment({ type: "NPS", label: "NPS Tier I", value: 5_500_000, monthlyContribution: 4_000, ownerId: "you" });
    // A thin liquid MF pot — plausible for a household whose savings mostly went into PPF/NPS.
    h.addInvestment({ type: "MutualFunds", label: "Liquid MF", value: 100_000, monthlyContribution: 500, ownerId: "you" });

    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
    const k = derive(h.data, a.values, lens, { currentYear: 2026 });
    expect(k.bridgeCoverage).not.toBeNull();
    const b = k.bridgeCoverage!;

    // Exact locks, measured from this real derive() run (2026-09-29, this session).
    // `corpusOnlyFireAge` is derive()'s OWN solve for when the corpus becomes adequate — not the
    // household's stated targetRetirementAge (55) — and it lands at 59 for this contribution mix.
    expect(b.corpusOnlyFireAge).toBe(59);
    expect(b.unlockTimeline).toEqual([{ age: 60, netAmount: 16_241_805.200630352, label: "PPF (near cap)" }]);
    expect(b.reachableCorpus).toBe(6_320_373);
    expect(b.lockedCorpus).toBeCloseTo(16_241_805.2, 0);
    expect(b.bridgeIncomeAnnual).toBe(282_341);

    // THE HONEST RESULT: covered, not false. Recording the margin rather than forcing a fail.
    expect(b.covered).toBe(true);
    expect(b.effectiveFireAge).toBe(59); // unchanged — no bridge shortfall to push it later
    expect(b.shortfallYears).toBe(0);

    // THE MARGIN — reachableCorpus minus the single bridge year's (age 59, the only underwater
    // candidate before the PPF unlocks at 60) net draw. `k.baseFireNumber`/`regularTargetComponentsRealAt`
    // is the SAME expense-repricing seam the bridge itself reads (never a re-derived formula, per
    // the frame-lock test below) — t = corpusOnlyFireAge - k.anchorAge years from anchor.
    const t = b.corpusOnlyFireAge - k.anchorAge;
    const expenseRatio = k.regularTargetComponentsRealAt(t).base / k.baseFireNumber;
    const grossExpenseAtBridgeAge = k.annualExpensesToday * expenseRatio;
    const netDrawAtBridgeAge = grossExpenseAtBridgeAge - b.bridgeIncomeAnnual;
    const margin = b.reachableCorpus - netDrawAtBridgeAge;
    // The margin is POSITIVE (covered) and recorded exactly — this is the honest finding: even the
    // strongest plausible locked-heavy household found in an 18-candidate search still clears its
    // one-year bridge gap comfortably, because a plausible PPF/NPS cap can never lock enough, for
    // long enough past a plausible early-retirement age, to outrun even a thin liquid slice.
    expect(margin).toBeGreaterThan(0);
    expect(margin).toBeCloseTo(5_795_440.04, 0);
  });
});

// ---------------------------------------------------------------------------
// FRAME LOCK — the bridge's expense repricer, `annualExpensesAt`, must reprice at EXACTLY
// ((1+basket)/(1+CPI))^t, never a nominal curve fed into the real-frame bridge.
//
// Why this exists: a scratch prototype run last night (2026-09-29, see the #162 comment + D-2026-
// 09-29-09) fed a NOMINAL expense curve into this real-frame seam and fabricated a spurious 7-year
// gate print. `derive.ts` builds `annualExpensesAt(t)` as:
//     annualExpensesToday * (regularTargetComponentsRealAt(t).base / baseFireNumber)
// and `regularTargetComponentsRealAt(t).base = baseFireNumber * basketFactor(t) / deflator(t)`,
// where `basketFactor(t) = (1+householdInflation)^t` and `deflator(t) = (1+generalInflation)^t` —
// so the ratio collapses to exactly `((1+householdInflation)/(1+generalInflation))^t`, independent
// of `baseFireNumber`. This test locks that identity on the residual (b) household at t=1,10,25,
// reading it through the SAME `regularTargetComponentsRealAt` the bridge itself is fed (never a
// re-derived formula), within 1e-9 relative tolerance.
// ---------------------------------------------------------------------------
describe("frame lock — the bridge's annualExpensesAt reprices at exactly ((1+basket)/(1+CPI))^t, never a nominal curve", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("t in {1, 10, 25}: regularTargetComponentsRealAt(t).base / baseFireNumber matches the basket/CPI frame ratio to 1e-9", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.data.members = [
      {
        id: "you",
        name: "You",
        dateOfBirth: "1974-01-01",
        role: "ADULT",
        targetRetirementAge: 54,
        planToAge: 90,
        relation: "",
        city: "Metro",
        health: "Healthy",
        riskAppetite: "Conservative",
        marital: "Married",
        employmentStatus: "Employed",
        salary: { annualCTC: 2_800_000, hikePercent: 5 },
      },
    ] as typeof h.data.members;
    h.data.expenses.avgMonthly = 75_000;
    h.data.investments = [];
    h.addInvestment({ type: "PPF", label: "PPF (re-extended)", value: 32_000_000, monthlyContribution: 12_000, ownerId: "you" });
    h.addInvestment({ type: "NPS", label: "NPS Tier I", value: 9_000_000, monthlyContribution: 8_000, ownerId: "you" });
    h.addInvestment({ type: "MutualFunds", label: "Liquid MF", value: 4_000_000, monthlyContribution: 15_000, ownerId: "you" });

    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
    const k = derive(h.data, a.values, lens, { currentYear: 2026 });

    // The independently-known frame ratio: (1+householdBasket)/(1+generalCPI))^t. `realTargetDriftRate`
    // is EXPOSED by derive() as exactly `(1+householdInflation)/(1+generalInflation) - 1` (ADR-0006,
    // derive.ts:939/1595) — reading it, rather than re-deriving householdInflation/CPI ourselves,
    // pins the identity against the kernel's OWN stated frame invariant, not a parallel guess.
    const frameRatio = 1 + k.realTargetDriftRate;

    for (const t of [1, 10, 25]) {
      const components = k.regularTargetComponentsRealAt(t);
      const actualRatio = components.base / k.baseFireNumber;
      const expectedRatio = Math.pow(frameRatio, t);
      expect(Math.abs(actualRatio - expectedRatio) / expectedRatio).toBeLessThan(1e-9);
    }

    // Sanity: the ratio must actually MOVE across t (i.e. basket != CPI for this assumption set) —
    // otherwise the identity would be trivially true even for a broken (nominal) repricer that
    // happens to also be flat, and this lock would prove nothing.
    const ratioAt1 = k.regularTargetComponentsRealAt(1).base / k.baseFireNumber;
    const ratioAt25 = k.regularTargetComponentsRealAt(25).base / k.baseFireNumber;
    expect(Math.abs(ratioAt25 - ratioAt1)).toBeGreaterThan(1e-6);
  });
});

// ---------------------------------------------------------------------------
// #211 — A PROPERTY IS RUNWAY ONLY FROM ITS SALE, AND ITS RUPEES ARE NOT IN THE
// PRE-SALE LIQUID RESIDUAL.
//
// THE BUG. An investment/inherited property used to classify as `unlockAge:
// Infinity`, so Phase C added its whole projected value to `lockedCorpus` and
// created NO tranche. Its rupees therefore counted toward the corpus-adequacy
// total the bridge is layered on, while contributing exactly ₹0 of spendable
// runway — the household passed the gate on money it could not spend. Measured
// on the mehtas seed: a ₹3.5 Cr Bandra flat, 40% of the retirement corpus, with
// no unlock event anywhere in the timeline.
//
// THE MODEL. The property is a dated SALE EVENT: locked until `plannedSaleAge`
// (assumed `ASSUMED_PROPERTY_SALE_LAG_YEARS` into retirement when unstated),
// then credited as a tranche net of the illiquidity haircut and real-estate
// LTCG. `reachableCorpus` — the money available AT the retirement age — never
// includes it while it is unsold, which is the property this block pins.
// ---------------------------------------------------------------------------
describe("#211 investment property — a dated sale tranche, never pre-sale liquidity", () => {
  const propertyInput = (extras: Partial<Investment> = {}) =>
    baseInput({
      retirementAge: 50,
      anchorAge: 40,
      planToAge: 90,
      annualExpenses: 1_200_000,
      holdings: [
        holding("MutualFunds", 10_000_000),
        holding("RealEstate", 20_000_000, { realEstateRole: "Investment", ...extras }),
      ],
    });

  it("an unsold property is NOT in reachableCorpus but IS a dated tranche", () => {
    const r = computeBridgeCoverage(propertyInput());
    const saleAge = 50 + ASSUMED_PROPERTY_SALE_LAG_YEARS;
    const tranche = r.unlockTimeline.find((t) => t.age === saleAge);
    expect(tranche).toBeDefined();
    // Net of the 10% haircut AND real-estate LTCG — strictly less than the market value, and
    // strictly more than zero (the old behaviour).
    expect(tranche!.netAmount).toBeGreaterThan(0);
    expect(tranche!.netAmount).toBeLessThan(20_000_000 * (1 - REAL_ESTATE_ILLIQUIDITY_HAIRCUT));
    // The liquid money at the retirement age is the MF slice only — the property's rupees are not
    // in it (this is the anti-optimism assertion: ₹2 Cr of flat must not read as runway).
    expect(r.reachableCorpus).toBeLessThan(10_000_000);
    expect(r.lockedCorpus).toBeGreaterThan(0);
  });

  it("an explicit plannedSaleAge moves the tranche to exactly that age", () => {
    const r = computeBridgeCoverage(propertyInput({ plannedSaleAge: 68 }));
    expect(r.unlockTimeline.map((t) => t.age)).toContain(68);
    expect(r.reachableCorpus).toBeLessThan(10_000_000);
  });

  it("a sale planned AT the retirement age is spendable then — no tranche, in reachableCorpus", () => {
    const r = computeBridgeCoverage(propertyInput({ plannedSaleAge: 50 }));
    expect(r.unlockTimeline).toHaveLength(0);
    // Now it IS runway: the MF slice plus the post-haircut, post-LTCG property proceeds.
    expect(r.reachableCorpus).toBeGreaterThan(10_000_000);
  });

  it("primary residence is never sold: no tranche, no lump, locked forever (the property invariant)", () => {
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 50,
        holdings: [
          holding("MutualFunds", 10_000_000),
          holding("RealEstate", 20_000_000, { realEstateRole: "PrimaryResidence" }),
        ],
      }),
    );
    expect(r.unlockTimeline).toHaveLength(0);
    expect(r.lockedCorpus).toBe(20_000_000);
    expect(r.reachableCorpus).toBeLessThan(10_000_000);
  });

  it("a household with no real estate is byte-identical to its pre-#211 result", () => {
    // The whole change is gated behind the realEstate accessibility class, so a portfolio without
    // one must be bit-for-bit unchanged. Locked here as an exact-value snapshot of the same input
    // used by the pre-existing fully-liquid case above.
    const r = computeBridgeCoverage(
      baseInput({ retirementAge: 50, holdings: [holding("Stocks", 30_000_000), holding("FD", 5_000_000)] }),
    );
    expect(r.covered).toBe(true);
    expect(r.effectiveFireAge).toBe(50);
    expect(r.lockedCorpus).toBe(0);
    expect(r.unlockTimeline).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// #211 — PER-SEED BOUNDS, READ BACK FROM THE REAL `derive()` PATH.
//
// Derived from the T1 diagnostic run in PR #214, before AND after the fix. What
// moved and what deliberately did not:
//
//   seed     | reachableCorpus   | lockedCorpus      | timeline (property)
//   mehtas   | 599.3L → 599.3L   | 424.9L → 361.2L   | absent → Bandra flat @54
//   mauryas  | 992.8L → 992.8L   | 60.0L  → 49.1L    | absent → let-out flat @69
//   sharmas / iyers / ravi: every field byte-identical (no investment property).
//
// `reachableCorpus` is UNCHANGED on both property seeds, which is the fix's
// whole point: the property's rupees were never in the pre-sale liquid pool and
// still are not. `lockedCorpus` FALLS because the locked figure is now the
// post-haircut, post-LTCG net of a dated sale instead of the raw market value,
// and the same rupees now appear as a tranche the user can see. No seed's
// VERDICT moved (every one is `covered` with a runway far wider than the sale
// lag) — recorded honestly rather than engineered: the gate's ability to fire is
// proven on the #212 locked-heavy fixture above, not on a seed.
// ---------------------------------------------------------------------------
describe("#211 per-seed bounds through the real derive() path", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const EXPECT: Record<string, { propertyLabel: string | null; saleAge: number | null }> = {
    sharmas: { propertyLabel: null, saleAge: null },
    // #87: per-assessee household tax (₹19,99,140 → ₹13,57,200) moves the Mehtas golden-master
    // fireAge 50.83 → 50.08, so the corpus-only retirement age is 50 and the sale lands at 50 + 3.
    mehtas: { propertyLabel: "3BHK Bandra Mumbai", saleAge: 53 },
    iyers: { propertyLabel: null, saleAge: null },
    mauryas: { propertyLabel: "2BHK (let out)", saleAge: 69 },
    ravi: { propertyLabel: null, saleAge: null },
  };

  for (const persona of IDENTITY_PERSONAS) {
    it(`${persona.name}: the property (if any) is a dated tranche and never pre-sale liquidity`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, IDENTITY_LENS, { currentYear: 2026 });
      const b = k.bridgeCoverage;
      expect(b).not.toBeNull();
      const want = EXPECT[persona.name];

      if (want.propertyLabel == null) {
        // NO INVESTMENT PROPERTY ⇒ nothing about this seed's bridge may change. Every tranche in
        // the timeline is a financial instrument, never real estate.
        const re = h.data.investments.filter(
          (i) => i.type === "RealEstate" && i.realEstateRole !== "PrimaryResidence",
        );
        expect(re).toHaveLength(0);
        for (const t of b!.unlockTimeline) {
          expect(h.data.investments.find((i) => i.label === t.label)?.type).not.toBe("RealEstate");
        }
        return;
      }

      // The property is in the timeline, at its assumed sale age (the retirement age plus the lag),
      // and NOT in the money available at the retirement age.
      const tranche = b!.unlockTimeline.find((t) => t.label === want.propertyLabel);
      expect(tranche).toBeDefined();
      expect(tranche!.age).toBe(want.saleAge);
      expect(tranche!.age).toBe(b!.corpusOnlyFireAge + ASSUMED_PROPERTY_SALE_LAG_YEARS);
      expect(tranche!.netAmount).toBeGreaterThan(0);
      // Its rupees sit in the LOCKED side until that age, not in the runway.
      expect(b!.lockedCorpus).toBeGreaterThanOrEqual(tranche!.netAmount);
    });
  }
});

// ---------------------------------------------------------------------------
// #211 REVIEW — THE GATE FIRES ON THE DEFAULT PATH (no stated sale age).
//
// Why this exists. The #212 locked-heavy fixture above proves the gate fires, but
// only because it now states `plannedSaleAge: 75` — remove that one field and the
// assumed sale three years in rescues it. So nothing proved the gate can fire for
// the case EVERY real user hits: a property household that has typed no sale age
// at all, where the assumed lag is the only thing holding the property out of the
// runway. This is that proof, and it is exactly the three-year window the lag
// creates that has to go underwater.
//
// The profile: a household retiring at 50 whose corpus is almost entirely a
// ₹3 Cr let-out flat with a thin ₹25 L liquid slice, against a ₹40 L/yr bill.
// The flat is assumed sold at 53; the liquid slice cannot carry 50-52, so the
// verdict is NOT covered and the shortfall lands inside the lag window.
// ---------------------------------------------------------------------------
describe("#211 the gate fires with NO plannedSaleAge — the default-lag window is underwater", () => {
  it("thin liquid slice + an assumed-sale property → covered:false inside the lag window", () => {
    const r = computeBridgeCoverage(
      baseInput({
        retirementAge: 50,
        anchorAge: 40,
        planToAge: 90,
        annualExpenses: 4_000_000,
        exitLumpNet: 0,
        income: { rentalAnnualPostTax: 600_000, epsAnnualPostTax: 0, epsStartAge: 58 },
        holdings: [
          holding("FD", 2_500_000),
          // NO plannedSaleAge — the whole point of this fixture.
          holding("RealEstate", 30_000_000, { realEstateRole: "Investment" }),
        ],
      }),
    );
    const saleAge = 50 + ASSUMED_PROPERTY_SALE_LAG_YEARS;
    // The property is the only tranche, dated by the assumed lag alone.
    expect(r.unlockTimeline).toHaveLength(1);
    expect(r.unlockTimeline[0].age).toBe(saleAge);
    // THE GATE, on the default path: the liquid slice cannot fund the years before the sale.
    expect(r.covered).toBe(false);
    expect(r.shortfallYears).toBeGreaterThanOrEqual(1);
    expect(r.shortfallAmount).toBeGreaterThan(0);
    // The deficit is inside the lag window — the shortfall years cannot exceed it, because the
    // sale closes the gap the moment it lands.
    expect(r.shortfallYears).toBeLessThanOrEqual(ASSUMED_PROPERTY_SALE_LAG_YEARS);
    // ...and the headline moves later, with a surfaced reason rather than a silent shift.
    expect(r.effectiveFireAge).toBeGreaterThan(r.corpusOnlyFireAge);
    expect(r.assumptions.some((x) => x.id === "bridge-shortfall")).toBe(true);
    // The counterfactual that makes this fixture load-bearing: state the sale AT retirement and the
    // same household is covered — so what fails here is the LAG, not an under-funded portfolio.
    const sameButSoldAtRetirement = computeBridgeCoverage(
      baseInput({
        retirementAge: 50,
        anchorAge: 40,
        planToAge: 90,
        annualExpenses: 4_000_000,
        exitLumpNet: 0,
        income: { rentalAnnualPostTax: 600_000, epsAnnualPostTax: 0, epsStartAge: 58 },
        holdings: [
          holding("FD", 2_500_000),
          holding("RealEstate", 30_000_000, { realEstateRole: "Investment", plannedSaleAge: 50 }),
        ],
      }),
    );
    expect(sameButSoldAtRetirement.covered).toBe(true);
  });
});

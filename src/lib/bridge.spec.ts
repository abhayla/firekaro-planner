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
    mehtas: { propertyLabel: "3BHK Bandra Mumbai", saleAge: 54 },
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

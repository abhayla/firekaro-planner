/**
 * ADR-0006 Phase 1d (F2) — the bridge must not get BETTER COVERED just because the target drifted.
 *
 * THE BUG THIS WITNESSES. Phase 1c made `derive.ts` scale the bridge's incoming holdings by the
 * DRIFTED component target at the adequacy age (`corpusScale`), because that is the corpus the
 * adequacy leg actually reaches. But `bridge.ts` kept funding FLAT today's-rupee expenses. Half the
 * check moved to the drifted frame and half stayed still, so raising the household's own spending
 * basket — which makes the plan HARDER — made the liquidity check look EASIER. In the one layer
 * whose entire job is to refuse an optimistic FIRE date, that is the wrong direction.
 *
 * Both witnesses below are directional, not value locks: they compare runs of the same model, so
 * they survive any future re-baseline and go red only if the frames come apart again.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { computeBridgeCoverage, type BridgeHolding, type BridgeInput } from "./bridge";
import type { Investment, InvestmentType } from "@/types/household";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { derive } from "@/lib/derive";

const DOB_1986 = "1986-01-01";
const ASOF = new Date("2026-01-01T00:00:00Z");
const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

function holding(type: InvestmentType, value: number, extras: Partial<Investment> = {}): BridgeHolding {
  return { asset: { id: `w-${type}-${value}`, type, value, ownerId: "self", ...extras }, ownerDob: DOB_1986 };
}

/**
 * The canonical bridge-BOUND household: retire at 47 on a corpus that is ~96% PPF, locked until
 * 60. The liquid runway cannot fund 47 → 60, so the coverage verdict is a real shortfall with
 * room to move in either direction — which is what makes it a usable witness.
 */
function boundInput(over: Partial<BridgeInput> = {}): BridgeInput {
  return {
    holdings: [holding("FD", 1_000_000), holding("PPF", 25_000_000)],
    retirementAge: 47,
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

describe("bridge drift witness (a) — the mixed frame made coverage better; one frame does not", () => {
  // g is the base leg's real drift. Deliberately larger than the live ~0.45%/yr so the direction
  // is unambiguous at integer-rupee resolution — the property under test is a sign, not a size.
  const g = 0.02;
  const T = 7; // retirementAge 47 − anchorAge 40
  const scale = Math.pow(1 + g, T);

  /** No drift anywhere: the pre-ADR-0006 bridge. */
  const noDrift = computeBridgeCoverage(boundInput());

  /** The MIXED frame Phase 1c left behind: holdings scaled by the drifted target, bill flat. */
  const mixed = computeBridgeCoverage(
    boundInput({
      holdings: [holding("FD", 1_000_000 * scale), holding("PPF", 25_000_000 * scale)],
    }),
  );

  /** ONE frame (Phase 1d): the same drifted holdings, and the bill drifts with them. */
  const oneFrame = computeBridgeCoverage(
    boundInput({
      holdings: [holding("FD", 1_000_000 * scale), holding("PPF", 25_000_000 * scale)],
      annualExpensesAt: (t) => 1_200_000 * Math.pow(1 + g, t),
    }),
  );

  it("the fixture is genuinely bridge-bound (otherwise the rest of this file proves nothing)", () => {
    expect(noDrift.covered).toBe(false);
    expect(noDrift.shortfallAmount).toBeGreaterThan(0);
    expect(noDrift.effectiveFireAge).toBeGreaterThan(47);
  });

  it("REPRODUCES the bug: under the mixed frame a drifting target IMPROVED coverage", () => {
    expect(
      mixed.shortfallAmount,
      "mixed frame: scaling the holdings while the bill stands still shrinks the gap",
    ).toBeLessThan(noDrift.shortfallAmount);
  });

  it("FIXED: with the expense side on the same curve, drift never improves coverage", () => {
    expect(
      oneFrame.shortfallAmount,
      "one frame: a household whose costs rise faster is not more liquid",
    ).toBeGreaterThanOrEqual(noDrift.shortfallAmount);
    expect(oneFrame.effectiveFireAge).toBeGreaterThanOrEqual(noDrift.effectiveFireAge);
    // …and it is strictly worse than the mixed frame it replaces — the optimism is gone, not moved.
    expect(oneFrame.shortfallAmount).toBeGreaterThan(mixed.shortfallAmount);
  });

  it("a non-finite resolver falls back to the flat figure — no NaN reaches a coverage verdict", () => {
    const poisoned = computeBridgeCoverage(boundInput({ annualExpensesAt: () => Number.NaN }));
    expect(Number.isFinite(poisoned.shortfallAmount)).toBe(true);
    expect(poisoned.shortfallAmount).toBe(noDrift.shortfallAmount);
  });
});

describe("bridge drift witness (b) — end to end through derive(), g = 0 vs the live drift", () => {
  beforeEach(() => setActivePinia(createPinia()));

  /**
   * A bridge-bound household with NO dated goals and NO medical reservation, so the target's only
   * leg is the perpetual base — which means `corpusScale` and the bridge's bill drift at exactly
   * the same rate and the comparison isolates the frame. (With a reservation or goals present the
   * corpus scales slightly faster than the retiree's bill, and that is correct rather than a bug:
   * the corpus genuinely has to be bigger to carry a medical buffer and a school fee.)
   */
  function loadBridgeBound() {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.addMember({
      id: "solo", name: "Solo", dateOfBirth: DOB_1986, role: "ADULT",
      targetRetirementAge: 47, planToAge: 90, city: "Metro", health: "Healthy",
      riskAppetite: "Moderate", marital: "Single", employmentStatus: "Employed",
      salary: { annualCTC: 5_000_000 },
    } as never);
    h.data.expenses.avgMonthly = 100_000;
    h.data.expenses.plannedFuture = [];
    h.data.healthcareCorpusReservationPercent = 0;
    h.data.extendedFamilyContingencyPercent = 0;
    h.addInvestment({ name: "Liquid", type: "FD", value: 1_500_000, ownerId: "solo" } as never);
    h.addInvestment({ name: "Locked", type: "PPF", value: 40_000_000, ownerId: "solo" } as never);
    return { h, a };
  }

  it("a corpus-locked household is never MORE covered under the live drift than at g = 0", () => {
    const { h, a } = loadBridgeBound();

    // g = 0: every bucket at general CPI, so the real target stands still (the ADR positive control).
    const flat = derive(
      h.data,
      { ...a.values, healthcareInflation: a.values.inflation, educationInflation: a.values.inflation, housingInflation: a.values.inflation },
      LENS,
    );
    const live = derive(h.data, a.values, LENS);

    const fb = flat.bridgeCoverage;
    const lb = live.bridgeCoverage;
    expect(fb, "the fixture must actually evaluate a bridge at g = 0").not.toBeNull();
    expect(lb, "the fixture must actually evaluate a bridge under the live drift").not.toBeNull();
    expect(fb!.covered, "and it must be bridge-BOUND, else there is nothing to witness").toBe(false);

    expect(
      lb!.shortfallAmount,
      `drift must not shrink the liquidity gap (g=0 ₹${fb!.shortfallAmount} vs live ₹${lb!.shortfallAmount})`,
    ).toBeGreaterThanOrEqual(fb!.shortfallAmount);
    expect(lb!.effectiveFireAge).toBeGreaterThanOrEqual(fb!.effectiveFireAge);
    // The headline it feeds moves the same way — later or unchanged, never earlier.
    expect(live.yearsToRegular).toBeGreaterThanOrEqual(flat.yearsToRegular);
  });
});

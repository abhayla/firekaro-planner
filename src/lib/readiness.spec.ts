/**
 * readiness.spec.ts — locks the obj-3 readiness classifier across all 5 honest
 * states + the honesty invariants (never a false "ready", readyAtAge == the
 * bridge's effectiveFireAge == the FireHero headline frame).
 *
 * Seed personas (real derive path) cover the states they naturally produce
 * (corpus-short, unplannable). The three states no current seed reaches —
 * ready-now, ready-at-age, bridge-limited (no seeded household is already AT its
 * corpus with locked money) — are exercised with hand-built BridgeCoverage
 * fixtures, which is legitimate for a PURE classifier (calculation-modules.md).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import type { BridgeCoverage } from "@/lib/bridge";
import { computeReadiness } from "@/lib/readiness";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };

/** A minimal, valid BridgeCoverage with sensible defaults; override per test. */
function bc(over: Partial<BridgeCoverage>): BridgeCoverage {
  return {
    covered: true,
    effectiveFireAge: 55,
    corpusOnlyFireAge: 55,
    shortfallYears: 0,
    shortfallAmount: 0,
    reachableCorpus: 10_000_000,
    lockedCorpus: 0,
    unlockTimeline: [],
    bridgeIncomeAnnual: 0,
    assumptions: [],
    ...over,
  };
}

describe("computeReadiness — crafted bridge fixtures (the 5 states)", () => {
  it("ready-now: the sustainable age is at/below the current age", () => {
    const v = computeReadiness({
      bridge: bc({ effectiveFireAge: 50, corpusOnlyFireAge: 50, covered: true }),
      currentAge: 52,
      targetRetirementAge: 50,
    });
    expect(v.state).toBe("ready-now");
    expect(v.gapYears).toBe(0);
    expect(v.bindingConstraint).toBeNull();
    expect(v.readyAtAge).toBe(50);
  });

  it("ready-at-age: future date, on track to hit the target, no liquidity gap", () => {
    const v = computeReadiness({
      bridge: bc({ effectiveFireAge: 50, corpusOnlyFireAge: 50, covered: true }),
      currentAge: 35,
      targetRetirementAge: 55,
    });
    expect(v.state).toBe("ready-at-age");
    expect(v.readyAtAge).toBe(50);
    expect(v.gapYears).toBe(15);
    expect(v.bindingConstraint).toBeNull();
  });

  it("bridge-limited: corpus adequate NOW but locked money sets a later date", () => {
    const v = computeReadiness({
      // corpus adequate at 48 (≤ current 50), but the liquid runway is short → 53.
      bridge: bc({
        effectiveFireAge: 53,
        corpusOnlyFireAge: 48,
        covered: false,
        shortfallYears: 5,
        shortfallAmount: 4_000_000,
        lockedCorpus: 20_000_000,
      }),
      currentAge: 50,
      targetRetirementAge: 45,
    });
    expect(v.state).toBe("bridge-limited");
    expect(v.bindingConstraint).toBe("liquidity");
    expect(v.readyAtAge).toBe(53);
    expect(v.gapYears).toBe(3);
  });

  it("corpus-short: corpus not there yet AND past the target age → constraint is corpus", () => {
    const v = computeReadiness({
      bridge: bc({ effectiveFireAge: 56, corpusOnlyFireAge: 56, covered: true }),
      currentAge: 30,
      targetRetirementAge: 47,
    });
    expect(v.state).toBe("corpus-short");
    expect(v.bindingConstraint).toBe("corpus");
    expect(v.readyAtAge).toBe(56);
    expect(v.gapYears).toBe(26);
  });

  it("unplannable: null bridge → honest empty state, never a false ready", () => {
    const v = computeReadiness({ bridge: null, currentAge: 30, targetRetirementAge: 50 });
    expect(v.state).toBe("unplannable");
    expect(v.readyAtAge).toBeNull();
    expect(v.gapYears).toBeNull();
    expect(v.bindingConstraint).toBeNull();
  });

  it("unplannable: non-finite / absurd effectiveFireAge → unplannable (no false ready)", () => {
    expect(
      computeReadiness({
        bridge: bc({ effectiveFireAge: Number.POSITIVE_INFINITY }),
        currentAge: 30,
        targetRetirementAge: 50,
      }).state,
    ).toBe("unplannable");
    expect(
      computeReadiness({ bridge: bc({ effectiveFireAge: 200 }), currentAge: 30, targetRetirementAge: 50 })
        .state,
    ).toBe("unplannable");
    expect(
      computeReadiness({ bridge: bc({ effectiveFireAge: 50 }), currentAge: NaN, targetRetirementAge: 50 })
        .state,
    ).toBe("unplannable");
  });

  it("bridge-limited WINS over ready-at-age even when the sustainable age is ≤ target", () => {
    // Corpus adequate now (48 ≤ 50), liquidity gap pushes to 52, and 52 ≤ target 55.
    // The binding constraint is genuinely liquidity (rebalance pulls it earlier), so
    // the verdict must be bridge-limited, NOT a reassuring ready-at-age with no constraint.
    const v = computeReadiness({
      bridge: bc({ effectiveFireAge: 52, corpusOnlyFireAge: 48, covered: false, shortfallYears: 4 }),
      currentAge: 50,
      targetRetirementAge: 55,
    });
    expect(v.state).toBe("bridge-limited");
    expect(v.bindingConstraint).toBe("liquidity");
  });

  it("accumulating household with a NON-finite target → corpus-short (never the reassuring ready-at-age)", () => {
    const v = computeReadiness({
      bridge: bc({ effectiveFireAge: 58, corpusOnlyFireAge: 58, covered: true }),
      currentAge: 40,
      targetRetirementAge: Number.NaN,
    });
    expect(v.state).toBe("corpus-short");
    expect(v.bindingConstraint).toBe("corpus");
  });

  it("HONESTY: a never-coverable plan (effectiveFireAge = planToAge horizon) is never ready-now/ready-at-age", () => {
    // The bridge's uncoverable-within-plan fallback hands back effectiveFireAge = planToAge
    // (a still-underwater far age). It must read as a NOT-ready state, never ready.
    const v = computeReadiness({
      bridge: bc({ effectiveFireAge: 90, corpusOnlyFireAge: 60, covered: false, shortfallYears: 30 }),
      currentAge: 45,
      targetRetirementAge: 55,
    });
    expect(["bridge-limited", "corpus-short"]).toContain(v.state);
    expect(v.state).not.toBe("ready-now");
    expect(v.state).not.toBe("ready-at-age");
  });

  it("HONESTY: never reports ready-now when there is a live shortfall at the current age", () => {
    // Liquid runway short, effective age is in the FUTURE → must NOT be ready-now.
    const v = computeReadiness({
      bridge: bc({ effectiveFireAge: 60, corpusOnlyFireAge: 55, covered: false, shortfallYears: 5 }),
      currentAge: 55,
      targetRetirementAge: 55,
    });
    expect(v.state).not.toBe("ready-now");
    expect(v.state).toBe("bridge-limited");
  });
});

describe("computeReadiness — real seed-persona integration (derive path)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("sharmas (still accumulating, target 47, FIRE @56) → corpus-short; readyAtAge == bridge.effectiveFireAge == headline", () => {
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = derive(useHouseholdStore().data, useAssumptionsStore().values, LENS);
    const v = computeReadiness({
      bridge: d.bridgeCoverage,
      currentAge: d.anchorAge,
      targetRetirementAge: d.targetRetirementAge,
    });
    expect(v.state).toBe("corpus-short");
    expect(v.bindingConstraint).toBe("corpus");
    // Honesty anchor: readyAtAge is the bridge's effective age VERBATIM...
    expect(v.readyAtAge).toBe(d.bridgeCoverage!.effectiveFireAge);
    // ...and coherent with the FireHero headline frame (anchorAge + yearsToRegular, ±1).
    expect(v.readyAtAge!).toBeCloseTo(Math.round(d.anchorAge + d.yearsToRegular), 0);
    expect(v.gapYears).toBeGreaterThan(0);
    // Never more optimistic than the headline date.
    expect(v.readyAtAge!).toBeGreaterThanOrEqual(Math.floor(d.anchorAge + d.yearsToRegular));
  });

  it("mauryas (target 50, FIRE @67) → corpus-short with a finite gapYears", () => {
    loadMauryasSeed(useHouseholdStore(), useAssumptionsStore());
    const d = derive(useHouseholdStore().data, useAssumptionsStore().values, LENS);
    const v = computeReadiness({
      bridge: d.bridgeCoverage,
      currentAge: d.anchorAge,
      targetRetirementAge: d.targetRetirementAge,
    });
    expect(v.state).toBe("corpus-short");
    expect(Number.isFinite(v.gapYears!)).toBe(true);
    expect(v.gapYears).toBeGreaterThan(0);
    expect(v.readyAtAge).toBe(d.bridgeCoverage!.effectiveFireAge);
  });

  it("zero-data household → unplannable (never a false ready)", () => {
    const d = derive(useHouseholdStore().data, useAssumptionsStore().values, LENS);
    expect(d.bridgeCoverage).toBeNull();
    const v = computeReadiness({
      bridge: d.bridgeCoverage,
      currentAge: d.anchorAge,
      targetRetirementAge: d.targetRetirementAge,
    });
    expect(v.state).toBe("unplannable");
  });
});

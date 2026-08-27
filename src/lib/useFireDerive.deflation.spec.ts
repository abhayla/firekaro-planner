/**
 * #139 — Real (today's-₹) vs Nominal projection deflation (Stage A).
 *
 * Substance proofs (the honest-direction guarantees):
 *  - `real=false` ⇒ the deflated projection is byte-identical to the nominal one
 *    (the toggle OFF path can NEVER alter a single plotted ₹).
 *  - Deflating BOTH corpus and the FIRE targets by the SAME `(1+inflation)^yearIndex`
 *    PRESERVES the crossover year — a real-terms view must never move the FIRE date
 *    (the #47 chart-vs-headline divergence class).
 *  - The deflator is GENERAL CPI (`assumptions.inflation` = 6%), never the 4-bucket
 *    `householdInflation` (≈6.24% since ADR-0006, 7.90% before it) — re-using the EXPENSE basket
 *    as a RETURN deflator is the #20 "FIRE-at-115" bug. Since ADR-0006 the deflated Regular target
 *    RISES at `g`; it is not the flat line this file once asserted.
 *  - Plausibility: a far-future nominal corpus deflates to a sane, strictly-smaller
 *    today's-₹ figure (the whole point — ₹7Cr in 2045 ≈ ₹2.8Cr today, not absurd).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { useFireDerive, deflateProjectionPoints } from "@/lib/useFireDerive";
import type { ProjectionPoint } from "@/lib/fire-math";

function pt(year: number, age: number, corpus: number, target: number): ProjectionPoint {
  return {
    year,
    ageYears: age,
    corpus,
    inflatedAnnualExpenses: Math.round(target * 0.035),
    targetForRegular: target,
    targetForLean: Math.round(target * 0.6),
    targetForFat: Math.round(target * 1.5),
  };
}

// A synthetic accumulation path whose corpus first meets targetForRegular at index 2.
const SYNTHETIC: ProjectionPoint[] = [
  pt(2026, 30, 500_000, 5_000_000),
  pt(2027, 31, 2_500_000, 5_200_000),
  pt(2028, 32, 5_400_000, 5_400_000), // corpus >= target here (crossover)
  pt(2029, 33, 9_000_000, 5_600_000),
];

const firstRegularCrossover = (pts: ProjectionPoint[]): number | null => {
  const hit = pts.find((p) => p.corpus >= p.targetForRegular);
  return hit ? hit.year : null;
};

describe("#139 deflateProjectionPoints — pure display deflation", () => {
  it("real=false returns the input byte-identical (toggle OFF can never alter a ₹)", () => {
    const out = deflateProjectionPoints(SYNTHETIC, 0.06, false);
    expect(out).toEqual(SYNTHETIC);
  });

  it("real=true divides corpus + every target by (1+inflation)^(year-year0), rounded", () => {
    const inf = 0.06;
    const out = deflateProjectionPoints(SYNTHETIC, inf, true);
    out.forEach((p, i) => {
      const f = Math.pow(1 + inf, SYNTHETIC[i].year - SYNTHETIC[0].year);
      expect(p.corpus).toBe(Math.round(SYNTHETIC[i].corpus / f));
      expect(p.targetForRegular).toBe(Math.round(SYNTHETIC[i].targetForRegular / f));
      expect(p.targetForLean).toBe(Math.round(SYNTHETIC[i].targetForLean / f));
      expect(p.targetForFat).toBe(Math.round(SYNTHETIC[i].targetForFat / f));
      expect(p.year).toBe(SYNTHETIC[i].year); // years are invariant under deflation
    });
  });

  it("PRESERVES the crossover year (same factor on both series ⇒ FIRE date unmoved)", () => {
    const nominalCross = firstRegularCrossover(SYNTHETIC);
    const realCross = firstRegularCrossover(deflateProjectionPoints(SYNTHETIC, 0.06, true));
    expect(realCross).toBe(2028);
    expect(realCross).toBe(nominalCross);
  });

  it("year-0 point is unchanged (deflation factor = 1 at the origin year)", () => {
    const out = deflateProjectionPoints(SYNTHETIC, 0.06, true);
    expect(out[0].corpus).toBe(SYNTHETIC[0].corpus);
    expect(out[0].targetForRegular).toBe(SYNTHETIC[0].targetForRegular);
  });

  it("guards a non-finite inflation with the default general CPI (never NaN-poisons a ₹)", () => {
    const out = deflateProjectionPoints(SYNTHETIC, Number.NaN, true);
    out.forEach((p) => {
      expect(Number.isFinite(p.corpus)).toBe(true);
      expect(Number.isFinite(p.targetForRegular)).toBe(true);
    });
  });
});

describe("#139 useFireDerive.deflateProjection — Sharmas seed (end-to-end honesty)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("deflateProjection(false) is byte-identical to the live projection", () => {
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = useFireDerive();
    expect(d.deflateProjection(false)).toEqual(d.projection.value);
  });

  it("the real-deflated regular crossover YEAR equals the nominal crossover year", () => {
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = useFireDerive();
    const real = d.deflateProjection(true);
    const realCross = firstRegularCrossover(real);
    // crossovers come from fire.crossovers (NOT recomputed from the deflated series),
    // and deflation provably preserves the crossover year — so they must agree.
    expect(realCross).toBe(d.crossovers.value.regular.year);
  });

  it("the regular crossover year is never LATER than the headline FIRE year (documented frame relationship)", () => {
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = useFireDerive();
    const crossYear = d.crossovers.value.regular.year;
    const headlineAge = d.householdFireAge.value;
    expect(crossYear).not.toBeNull();
    expect(headlineAge).not.toBeNull();
    const currentYear = new Date().getFullYear();
    const headlineYear = currentYear + (headlineAge! - d.anchorAge.value);
    // The chart's "Regular" target is the BASE expenses/SWR number; the headline `fireNumber`
    // additionally carries the family layer + healthcare reservation, and the headline age is
    // bridge-adjusted. ALL of those push the headline LATER, never earlier — so the chart's
    // adequacy crossover is always ≤ the headline year (the pre-existing #47 frame difference,
    // NOT something this real/nominal toggle introduces). We assert the honest documented
    // relationship, never a false "exactly matches the headline" claim (contract §2 gotcha).
    expect(crossYear!).toBeLessThanOrEqual(headlineYear);
  });

  it("in today's ₹ the Regular target rises at EXACTLY the kernel's own target curve (origin-alignment guard)", () => {
    // RE-BASELINED TWICE, and the reason matters both times.
    //
    // Originally this asserted the deflated target was a CONSTANT line, which was true only while
    // the kernel inflated the target at general CPI — the same rate this view deflates by. ADR-0006
    // ended that: the target grows at the household BASKET, so in today's rupees it RISES.
    //
    // ADR-0006 Phase 1c ends the SECOND simplification. The target is not one rate at all: the
    // medical reservation drifts at healthcare inflation and every dated goal stops inflating on
    // its due year, so `(1+g)^i` is now the wrong curve (g is only the BASE leg's drift) and the
    // Sharmas' line sits ~0.8% above it by year 1. Asserting `(1+g)^i` here could only be made to
    // pass by collapsing the target back onto one rate — the assertion would be enforcing the bug.
    //
    // The ORIGIN-ALIGNMENT guard the test exists for is preserved and is SHARPER than either
    // version: the deflated point must equal the kernel's own today's-₹ target at that year,
    // point for point. Shift the projection start year and the deflation exponent desyncs from
    // the inflation exponent, and the measured value stops matching immediately.
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = useFireDerive();
    const real = d.deflateProjection(true);
    expect(real.length).toBeGreaterThan(3);
    const targetRealAt = d.regularTargetComponentsRealAt.value;
    const base = real[0].targetForRegular;
    expect(base).toBeGreaterThan(0);
    expect(base, "point 0 must be the headline number itself").toBeCloseTo(targetRealAt(0).total, -1);
    real.forEach((p, i) => {
      const expected = targetRealAt(i).total;
      // Relative tolerance absorbs the kernel's per-point Math.round on a ₹10^8-scale figure.
      expect(
        Math.abs(p.targetForRegular - expected) / expected,
        `point ${i} (year ${p.year}) must sit on the kernel's target curve, got ${p.targetForRegular} vs ${Math.round(expected)}`,
      ).toBeLessThan(1e-6);
    });
    // …and it must genuinely RISE — a flat line would mean the optimistic collapse came back.
    expect(
      real[real.length - 1].targetForRegular,
      "the today's-₹ target must still rise across the horizon",
    ).toBeGreaterThan(base);
  });

  it("deflates a far-future corpus to a sane, strictly-smaller today's-₹ value (plausibility)", () => {
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = useFireDerive();
    const nominal = d.projection.value;
    const real = d.deflateProjection(true);
    const last = nominal.length - 1;
    // far-future deflation is real and material: strictly smaller, still positive.
    expect(real[last].corpus).toBeGreaterThan(0);
    expect(real[last].corpus).toBeLessThan(nominal[last].corpus);
  });
});

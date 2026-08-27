import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useHouseholdStore } from "@/stores/household";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";

describe("assumptions store — householdInflation (A3.2 editable weights)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("default inflationWeights are the disjoint 74/8/0/18 (ADR-0006)", () => {
    const a = useAssumptionsStore();
    expect(a.values.inflationWeights).toEqual({
      general: 74,
      healthcare: 8,
      education: 0,
      housing: 18,
    });
  });

  it("blends at the default weights to ~6.24%, within 100bp of general CPI (ADR-0006)", () => {
    const a = useAssumptionsStore();
    // (0.06*74 + 0.09*8 + 0.09*0 + 0.06*18) / 100 = 6.24%
    // RE-BASELINED from 7.90% — see fire-math.spec.ts for the two grounding corrections. The BOUND
    // is the durable assertion: `general` is the all-items CPI, so a basket of disjoint shares of
    // its own components cannot credibly sit a full point above it.
    expect(a.householdInflation()).toBeCloseTo(0.0624, 6);
    expect(a.householdInflation() - a.values.inflation).toBeGreaterThanOrEqual(0);
    expect(a.householdInflation() - a.values.inflation).toBeLessThanOrEqual(0.01);
  });

  it("a stored step-up of exactly 0 (the pre-ADR-0006 default) is treated as unset on hydrate", () => {
    const a = useAssumptionsStore();
    expect(a.values.householdSavingsStepUpPercent).toBe(2);
  });

  it("shifting weight toward healthcare raises the blended rate", () => {
    const a = useAssumptionsStore();
    const before = a.householdInflation();
    a.set("inflationWeights", { general: 20, healthcare: 60, education: 10, housing: 10 });
    const after = a.householdInflation();
    expect(after).toBeGreaterThan(before);
    // (0.06*20 + 0.09*60 + 0.09*10 + 0.06*10) / 100 = 8.1%
    expect(after).toBeCloseTo(0.081, 6);
  });

  it("normalizes by weight-sum so non-100 weights with same ratios match the default", () => {
    const a = useAssumptionsStore();
    a.set("inflationWeights", { general: 37, healthcare: 4, education: 0, housing: 9 });
    expect(a.householdInflation()).toBeCloseTo(0.0624, 6);
  });
});

/**
 * ADR-0006 — ONE basket. `assumptions.householdInflation()` (what the expense chart, the
 * lifestyle-inflation nudge and the Preferences readout show) and `derive().householdInflation`
 * (what the FIRE target actually grows at) resolve the same blend from the same store. Nothing
 * enforced that until now, so a change to either resolver could have put a different rate on the
 * screen from the one in the plan — the #180 class, one layer down.
 */
describe("householdInflation is the SAME basket the kernel plans with (ADR-0006)", () => {
  const DEFAULT_PRODUCT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
  type Store = ReturnType<typeof useHouseholdStore>;
  type ASt = ReturnType<typeof useAssumptionsStore>;
  const PERSONAS: Array<{ name: string; load: (h: Store, a: ASt) => void }> = [
    { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
    { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
    { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
    { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
  ];

  beforeEach(() => setActivePinia(createPinia()));

  for (const p of PERSONAS) {
    it(`${p.name}: store basket === derive().householdInflation`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      p.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      expect(a.householdInflation()).toBeCloseTo(k.householdInflation, 12);
      // ...and it is strictly ABOVE general CPI, which is what makes the target drift real.
      expect(k.householdInflation).toBeGreaterThan(a.values.inflation);
      expect(k.realTargetDriftRate).toBeCloseTo(
        (1 + k.householdInflation) / (1 + a.values.inflation) - 1,
        12,
      );
    });
  }
});

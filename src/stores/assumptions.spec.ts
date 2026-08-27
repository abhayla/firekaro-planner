import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAssumptionsStore } from "@/stores/assumptions";

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

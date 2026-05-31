import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAssumptionsStore } from "@/stores/assumptions";

describe("assumptions store — householdInflation (A3.2 editable weights)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("default inflationWeights are 60/20/10/10", () => {
    const a = useAssumptionsStore();
    expect(a.values.inflationWeights).toEqual({
      general: 60,
      healthcare: 20,
      education: 10,
      housing: 10,
    });
  });

  it("blends at the default weights to ~7.9% (behaviour-preserving)", () => {
    const a = useAssumptionsStore();
    // (0.06*60 + 0.14*20 + 0.09*10 + 0.06*10) / 100 = 7.9%
    expect(a.householdInflation()).toBeCloseTo(0.079, 4);
  });

  it("shifting weight toward healthcare raises the blended rate", () => {
    const a = useAssumptionsStore();
    const before = a.householdInflation();
    a.set("inflationWeights", { general: 20, healthcare: 60, education: 10, housing: 10 });
    const after = a.householdInflation();
    expect(after).toBeGreaterThan(before);
    // (0.06*20 + 0.14*60 + 0.09*10 + 0.06*10) / 100 = 11.1%
    expect(after).toBeCloseTo(0.111, 4);
  });

  it("normalizes by weight-sum so non-100 weights with same ratios match the default", () => {
    const a = useAssumptionsStore();
    a.set("inflationWeights", { general: 6, healthcare: 2, education: 1, housing: 1 });
    expect(a.householdInflation()).toBeCloseTo(0.079, 4);
  });
});

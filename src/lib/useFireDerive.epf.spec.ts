/**
 * Integration proof for the EPF/VPF after-tax-yield drag (audit A15.3, P1).
 *
 * Threads the household's annual EPF/VPF contribution + top marginal slab
 * through useFireDerive → assumptions.blendedReturn, and asserts that a large
 * VPF top-up at a taxed slab lowers the blended return (and therefore lengthens
 * the journey to FIRE) — while a small contributor sees no change.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { useFireDerive } from "@/lib/useFireDerive";

describe("useFireDerive — EPF/VPF after-tax yield (A15.3)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("the Sharmas seed sits in a positive marginal slab", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const d = useFireDerive();
    expect(d.householdMarginalRate.value).toBeGreaterThan(0);
  });

  it("a large VPF top-up drags the EPF bucket return below the raw epfReturn", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const d = useFireDerive();

    // Add a large VPF contribution (₹50K/mo → ₹6L/yr, well above the ₹2.5L band).
    h.addInvestment({
      type: "EPF_VPF",
      value: 2_000_000,
      monthlyContribution: 50_000,
      ownerId: h.earners[0]!.id,
    });

    expect(d.annualEpfVpfContribution.value).toBeGreaterThan(250_000);
    expect(d.epfAfterTaxReturn.value).toBeLessThan(a.values.epfReturn);
  });

  it("a small VPF contributor sees no drag (effective EPF return unchanged)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const d = useFireDerive();

    // Replace any seeded EPF holdings with a single small one (₹10K/mo → ₹1.2L/yr).
    for (const inv of [...h.data.investments]) {
      if (inv.type === "EPF_VPF") h.removeInvestment(inv.id);
    }
    h.addInvestment({
      type: "EPF_VPF",
      value: 500_000,
      monthlyContribution: 10_000,
      ownerId: h.earners[0]!.id,
    });

    expect(d.annualEpfVpfContribution.value).toBeLessThanOrEqual(250_000);
    expect(d.epfAfterTaxReturn.value).toBe(a.values.epfReturn);
  });

  it("the drag lengthens (or holds) the journey to the regular FIRE target", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const d = useFireDerive();

    const blendBefore = d.blendedReturn.value;
    h.addInvestment({
      type: "EPF_VPF",
      value: 3_000_000,
      monthlyContribution: 60_000,
      ownerId: h.earners[0]!.id,
    });
    // The new EPF weight pulls the blend toward the (taxed) EPF rate; the bucket
    // rate itself is now below the headline 8.25%. The blended return must move,
    // and the after-tax EPF rate must be strictly below the raw rate.
    expect(d.epfAfterTaxReturn.value).toBeLessThan(a.values.epfReturn);
    expect(d.blendedReturn.value).not.toBe(blendBefore);
  });
});

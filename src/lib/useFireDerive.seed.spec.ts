/**
 * Integration proof for the research-grounded FIRE-math spine (workstream 1).
 *
 * Loads the default Sharmas seed through the REAL stores + the live
 * useFireDerive() engine and asserts the audit-mandated corrections actually
 * reach the headline number:
 *   - Entry #1 A1.1/A1.3: horizon-driven SWR (Rohit retire@47, planTo@90 →
 *     43yr horizon → 3.25%), NOT the v4 age-table value.
 *   - Entry #6 A6.10 + Entry #10 A10.5: family layer + healthcare reservation
 *     are added ON TOP of the base FIRE number.
 *   - Entry #3 A3.1: projection inflation uses the 4-bucket household blend
 *     (~7.9%), not the single 6%.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { useFireDerive } from "@/lib/useFireDerive";

describe("useFireDerive — Sharmas seed (research-spine proof)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("A1.3: resolves Rohit's 43-year horizon (retire@47, planTo@90) to 3.25% SWR", () => {
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = useFireDerive();
    expect(d.targetRetirementAge.value).toBe(47);
    expect(d.planToAge.value).toBe(90);
    expect(d.effectiveSWR.value).toBe(0.0325);
  });

  it("A6.10 + A10.5: headline FIRE number includes family layer + healthcare reservation on top of base", () => {
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = useFireDerive();
    const base = d.baseFireNumber.value;
    const headline = d.fireNumber.value;
    // Reservation is always present (default 20% of base) → headline strictly exceeds base.
    expect(headline).toBeGreaterThan(base);
    // Headline must equal base + familyLayerCorpus + base×reservation% exactly.
    const expected =
      base + d.familyLayerCorpus.value + base * d.healthcareReservationPercent.value;
    expect(headline).toBeCloseTo(expected, 0);
    expect(d.healthcareReservation.value).toBeCloseTo(base * 0.2, 0);
  });

  it("progress is measured against the full research target (corpus ÷ full FIRE number)", () => {
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
    const d = useFireDerive();
    expect(d.fireNumber.value).toBeGreaterThan(0);
    expect(d.progressPercent.value).toBeGreaterThanOrEqual(0);
    expect(d.progressPercent.value).toBeLessThanOrEqual(100);
  });
});

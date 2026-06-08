import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";
import { computeIndividualFire } from "@/lib/individual-fire";

describe("computeIndividualFire (#81 Phase 2 — standalone per-adult FIRE)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  function setup() {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // rohit + priya (adults) · aarav + meera (dependents)
    return { h, a };
  }

  it("returns null for a dependent or a missing member", () => {
    const { h, a } = setup();
    expect(computeIndividualFire(h.data, a.values, "aarav", "2025-26")).toBeNull();
    expect(computeIndividualFire(h.data, a.values, "ghost", "2025-26")).toBeNull();
  });

  it("produces a domain-SANE standalone FIRE for an earning adult", () => {
    const { h, a } = setup();
    const r = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(r).not.toBeNull();
    // Sane bounds (rule 31): an affluent mid-30s earner's personal FIRE number is crores,
    // not negative / zero / absurd; the personal FIRE age is plausible (35..75), not 81/115.
    expect(r.individualFireNumber).toBeGreaterThan(1_00_00_000); // > ₹1 Cr
    expect(r.individualFireNumber).toBeLessThan(100_00_00_000); // < ₹100 Cr
    expect(r.attributableAnnualExpenses).toBeGreaterThan(0);
    expect(r.attributableCorpus).toBeGreaterThan(0);
    expect(Number.isFinite(r.yearsToIndividualFire)).toBe(true);
    expect(r.individualFireAge).toBeGreaterThanOrEqual(r.anchorAge);
    expect(r.individualFireAge).toBeLessThan(90);
  });

  it("EXCLUDES ring-3 (dependents) costs from every adult's attributable expenses", () => {
    const { h, a } = setup();
    const before = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    // Add a large dependents-tagged cost — it must NOT raise any adult's attributable expenses.
    h.addRecurring({ label: "Kids international school", amount: 80000, frequency: "M", source: "manual", ownerId: "Dependents" });
    const after = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(after.attributableAnnualExpenses).toBeCloseTo(before.attributableAnnualExpenses, 0);
    const priya = computeIndividualFire(h.data, a.values, "priya", "2025-26")!;
    // The household total expense DID rise by that ₹80k/mo, but neither adult's attributable did.
    const householdAnnualExpenses = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" }).annualExpensesToday;
    expect(householdAnnualExpenses).toBeGreaterThan(after.attributableAnnualExpenses + priya.attributableAnnualExpenses);
  });

  it("split % raises each adult's share of SHARED costs (monotonic)", () => {
    const { h, a } = setup();
    a.values.householdSplitPercent = 30;
    const lo = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    a.values.householdSplitPercent = 70;
    const hi = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(hi.attributableAnnualExpenses).toBeGreaterThan(lo.attributableAnnualExpenses);
    expect(hi.attributableCorpus).toBeGreaterThanOrEqual(lo.attributableCorpus);
  });

  it("UNREACHABLE individual FIRE → Infinity age, never an absurd finite age (HIGH-1 rule-31 lock)", () => {
    const { h, a } = setup();
    // Force an unreachable-but-POSITIVE-savings adult: ~0 corpus, large own expenses, tiny surplus.
    // calculateYearsToTarget caps at 1200 months → returns 100.0 (finite); the helper must map that
    // to Infinity so the card shows "not within horizon", not "age 132".
    const rohit = h.data.members.find((m) => m.id === "rohit")!;
    rohit.salary = undefined; // no salary → income is the tiny exempt stream below
    h.data.businesses = []; // no business income either
    h.data.investments = []; // attributable corpus → 0
    h.data.expenses.avgMonthly = 0;
    h.data.expenses.recurring = [
      { id: "r1", label: "Rohit huge own cost", amount: 500000, frequency: "M", source: "manual", ownerId: "rohit" },
    ]; // ₹60L/yr, all his (ring 1)
    h.data.otherIncome = [
      // ₹60.06L/yr tax-exempt, his → savings ≈ ₹6k/yr (positive but minuscule vs a ~₹17 Cr target)
      { id: "o1", type: "Other", amount: 500500, frequency: "M", ownerId: "rohit", isTaxExempt: true } as never,
    ];
    const r = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(r.attributableAnnualSavings).toBeGreaterThan(0); // positive savings (the HIGH-1 path)
    expect(r.attributableCorpus).toBe(0);
    expect(Number.isFinite(r.yearsToIndividualFire)).toBe(false); // unreachable → Infinity
    expect(Number.isFinite(r.individualFireAge)).toBe(false); // NOT a finite absurd age
  });

  it("a member-OWNED expense lands fully in that adult, not split", () => {
    const { h, a } = setup();
    a.values.householdSplitPercent = 50;
    const before = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    h.addRecurring({ label: "Rohit's club", amount: 10000, frequency: "M", source: "manual", ownerId: "rohit" });
    const after = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    // Full ₹10k/mo × 12 = ₹1.2L added (ring-1, not halved).
    expect(after.attributableAnnualExpenses - before.attributableAnnualExpenses).toBeCloseTo(120000, 0);
    // And it does NOT touch Priya's attributable expenses.
    const priyaBeforeId = computeIndividualFire(h.data, a.values, "priya", "2025-26")!;
    expect(priyaBeforeId.attributableAnnualExpenses).not.toBeCloseTo(after.attributableAnnualExpenses, 0);
  });
});

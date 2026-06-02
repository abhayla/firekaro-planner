/**
 * Pure-kernel tests for derive() (Stage-T0 B-1).
 *
 * Exercises the kernel directly with plain inputs AND proves the wrapper
 * (useFireDerive) and the kernel agree byte-for-byte on the Sharmas headline —
 * the behaviour lock for the extraction.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { loadSeedPersona } from "@/lib/seed-persona";
import { useFireDerive } from "@/lib/useFireDerive";
import { derive } from "@/lib/derive";

describe("derive() — pure kernel", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("the wrapper and the kernel produce a byte-identical Sharmas headline", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    const ui = useUiStore();
    loadSeedPersona(h, a);

    const wrapper = useFireDerive();
    const kernel = derive(h.data, a.values, {
      isFamilyView: ui.isFamilyView,
      viewingMemberId: ui.viewingMemberId,
      currentFY: ui.currentFY,
    });

    // Headline + every load-bearing aggregate must match exactly.
    expect(kernel.fireNumber).toBe(wrapper.fireNumber.value);
    expect(kernel.baseFireNumber).toBe(wrapper.baseFireNumber.value);
    expect(kernel.familyLayerCorpus).toBe(wrapper.familyLayerCorpus.value);
    expect(kernel.healthcareReservation).toBe(wrapper.healthcareReservation.value);
    expect(kernel.effectiveSWR).toBe(wrapper.effectiveSWR.value);
    expect(kernel.totalCorpus).toBe(wrapper.totalCorpus.value);
    expect(kernel.annualTax).toBe(wrapper.annualTax.value);
    expect(kernel.progressPercent).toBe(wrapper.progressPercent.value);
    expect(kernel.projection.length).toBe(wrapper.projection.value.length);
  });

  it("the Sharmas headline includes family layer + healthcare reservation on top of base", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.fireNumber).toBeGreaterThan(k.baseFireNumber);
    expect(k.fireNumber).toBeCloseTo(
      k.baseFireNumber + k.familyLayerCorpus + k.baseFireNumber * k.healthcareReservationPercent,
      0,
    );
  });

  it("is pure — same inputs yield an equal headline across repeated calls", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
    const first = derive(h.data, a.values, lens).fireNumber;
    const second = derive(h.data, a.values, lens).fireNumber;
    expect(first).toBe(second);
  });

  it("gh-issue #2 review: a member lens does not leak the other earner's employer NPS into this earner's tax", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: rohit + priya earners (not solo → member lens active)
    const lens = { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" };

    const priya = h.data.members.find((m) => m.id === "priya")!;

    priya.salary!.employerNpsAnnual = 0;
    const rohitTaxBaseline = derive(h.data, a.values, lens).annualTax;

    // Give ONLY Priya a large employer-NPS deduction.
    priya.salary!.employerNpsAnnual = 500_000;
    const rohitTaxAfter = derive(h.data, a.values, lens).annualTax;

    // Rohit's lensed tax must be unchanged — Priya's employer NPS is her deduction, not his.
    // (Before the fix, deriveDeductions summed unlensed members and leaked it into his tax.)
    expect(rohitTaxAfter).toBe(rohitTaxBaseline);
  });

  it("gh-issue #9: projected expenses grow at a constant NOMINAL inflation (real/nominal coherence)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const p = k.projection;
    expect(p.length).toBeGreaterThan(15);

    // Year 0 expense = today's expense (inflation^0). The classic FIRE bug is a real-vs-nominal
    // mismatch; this pins that expenses compound at a CONSTANT nominal rate, not a real/zero one.
    const base = p[0].inflatedAnnualExpenses;
    const ratio = p[1].inflatedAnnualExpenses / base;
    expect(ratio).toBeGreaterThan(1.05); // 4-bucket blended inflation ≈ 7.9% — NOT ~1.0 (real/zero)
    expect(ratio).toBeLessThan(1.1);
    for (const n of [5, 10, 15]) {
      const expected = base * Math.pow(ratio, n);
      expect(Math.abs(p[n].inflatedAnnualExpenses - expected) / expected).toBeLessThan(0.001);
    }

    // Corpus accumulates (nominal blended return + contributions) — not flat/shrinking.
    expect(p[10].corpus).toBeGreaterThan(p[0].corpus);
  });

  it("an empty household yields a zero corpus and zero progress (defensive)", () => {
    const a = useAssumptionsStore();
    const h = useHouseholdStore();
    // Empty household from the store's default shape.
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.totalCorpus).toBe(0);
    expect(k.progressPercent).toBe(0);
  });

  it("A14.2 — the Sharmas' ₹4L NPS (below the ₹5L threshold) yields no annuity → headline unchanged", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.npsAnnuityIncome).toBe(0);
    expect(k.fireWithdrawableCorpus).toBe(k.totalCorpus);
  });

  it("A14.2 — an NPS corpus above ₹5L lowers the required FIRE number vs the same household without NPS", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };

    const withoutNps = derive(h.data, a.values, lens).fireNumber;

    // Add a large NPS holding (> ₹5L) so the mandatory 40% annuity kicks in.
    h.addInvestment({ type: "NPS", label: "NPS top-up", value: 5_000_000, monthlyContribution: 0, ownerId: "rohit" });
    const withNps = derive(h.data, a.values, lens);

    // Annuity income is positive (40% × 50L × 6% = ₹1.2L/yr).
    expect(withNps.npsAnnuityIncome).toBeGreaterThan(0);
    // The FIRE number drops by ~ annuityIncome / SWR (the annuity's present value).
    expect(withNps.fireNumber).toBeLessThan(withoutNps);
    // The withdrawable corpus excludes the annuitised 40% (no double-count).
    expect(withNps.fireWithdrawableCorpus).toBeLessThan(withNps.totalCorpus);
  });
});

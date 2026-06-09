/**
 * House-property tax collapse (§24a / §24b / municipal taxes / §71) — gh-issue #65.
 *
 * BUG: the /tax-planning screen fed GROSS rent into computeTax (no §24a), so it
 * showed a higher "annual tax" than the Cash-Flow / FIRE-model figure (which
 * correctly nets the §24(a) 30% standard deduction in derive.ts). Two screens,
 * two "annual tax" numbers for the same household.
 *
 * FIX: ONE shared pure helper (computeHousePropertyTax) used by BOTH derive.ts
 * and the /tax-planning page, so the rental→taxable-house-property collapse can
 * never diverge again. These specs lock (a) the helper math and (b) the
 * cross-screen coherence invariant: same household + FY + regime ⇒ same tax.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";
import {
  computeHousePropertyTax,
  deriveDeductions,
  SEC_24A_DEDUCTION_RATE,
  SEC_71_HP_LOSS_SETOFF_CAP,
} from "@/lib/tax-deductions";
import { computeTax, recommendRegime } from "@/lib/tax";
import { toAnnual } from "@/lib/cashflow";
import type { OtherIncomeLine } from "@/types/household";

const rental = (over: Partial<OtherIncomeLine> = {}): OtherIncomeLine => ({
  id: "r1",
  type: "Rental",
  source: "Direct",
  amount: 15000,
  frequency: "M",
  ownerId: "Joint",
  isTaxExempt: false,
  ...over,
});

describe("computeHousePropertyTax — §24a/§24b/municipal/§71 collapse (gh-issue #65)", () => {
  it("applies the §24(a) 30% standard deduction (Sharmas 1BHK: ₹1.8L gross → ₹1.26L taxable)", () => {
    const r = computeHousePropertyTax([rental()]);
    expect(r.grossRentTotal).toBe(180000);
    expect(r.taxableHouseProperty).toBe(126000); // 180000 × (1 − 0.30)
    expect(r.rentalTaxDeduction).toBe(54000); // 180000 − 126000
  });

  it("ignores tax-exempt rentals (and non-Rental other-income)", () => {
    const r = computeHousePropertyTax([
      rental({ isTaxExempt: true }),
      { ...rental(), id: "d1", type: "Dividend", amount: 50000, frequency: "A" },
    ]);
    expect(r.grossRentTotal).toBe(0);
    expect(r.taxableHouseProperty).toBe(0);
    expect(r.rentalTaxDeduction).toBe(0);
  });

  it("subtracts municipal taxes from NAV BEFORE the 30% deduction (§23/§24)", () => {
    // NAV = 180000 − 18000 = 162000; taxableHP = 162000 × 0.70 = 113400
    const r = computeHousePropertyTax([rental({ municipalTaxes: 18000 })]);
    expect(r.taxableHouseProperty).toBe(113400);
  });

  it("fully deducts §24(b) home-loan interest on a let-out property (no ₹2L self-occupied cap)", () => {
    // 180000 → 126000 after §24a; minus 300000 interest = −174000 (a loss within the §71 cap)
    const r = computeHousePropertyTax([rental({ homeLoanInterest: 300000 })]);
    expect(r.taxableHouseProperty).toBe(126000 - 300000); // −174000
  });

  it("caps a house-property LOSS set-off at ₹2,00,000 (§71)", () => {
    // taxableHP before cap = 126000 − 500000 = −374000 → capped to −200000
    const r = computeHousePropertyTax([rental({ homeLoanInterest: 500000 })]);
    expect(r.taxableHouseProperty).toBe(-SEC_71_HP_LOSS_SETOFF_CAP);
  });

  it("aggregates multiple let-out rentals", () => {
    const r = computeHousePropertyTax([
      rental({ id: "a", amount: 15000, frequency: "M" }), // 180000
      rental({ id: "b", amount: 120000, frequency: "A" }), // 120000
    ]);
    expect(r.grossRentTotal).toBe(300000);
    expect(r.taxableHouseProperty).toBe(210000); // 300000 × 0.70
    expect(r.rentalTaxDeduction).toBe(90000);
  });

  it("exposes the statutory constants", () => {
    expect(SEC_24A_DEDUCTION_RATE).toBe(0.3);
    expect(SEC_71_HP_LOSS_SETOFF_CAP).toBe(200000);
  });
});

describe("cross-screen annual-tax coherence (gh-issue #65)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("the /tax-planning tax base and derive()'s FIRE-model tax base BOTH net §24a — same household ⇒ same annual tax", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    const ui = useUiStore();
    loadSeedPersona(h, a);

    const k = derive(h.data, a.values, {
      isFamilyView: ui.isFamilyView,
      viewingMemberId: ui.viewingMemberId,
      currentFY: ui.currentFY,
    });

    // Replicate the /tax-planning page's taxable-income assembly (cash gross of
    // taxable rows — salary CTC + non-exempt business share + non-exempt other income).
    const grossTaxable =
      h.earners.reduce((s, m) => s + (m.salary?.annualCTC ?? 0), 0) +
      h.data.businesses.reduce((s, b) => {
        const share = toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100);
        const exempt = ["LLP", "Partnership", "HUF"].includes(b.legalKind);
        return s + (exempt ? 0 : share);
      }, 0) +
      h.data.otherIncome.reduce(
        (s, o) => s + (o.isTaxExempt ? 0 : toAnnual({ amount: o.amount, period: o.frequency })),
        0,
      );

    // The #65 fix: the page MUST collapse rent to taxable house-property income
    // (the SAME shared helper derive uses) before computeTax.
    const { rentalTaxDeduction } = computeHousePropertyTax(h.data.otherIncome);
    const pageTaxBase = grossTaxable - rentalTaxDeduction;

    const ded = deriveDeductions(h.data);
    const fy = ui.currentFY;
    const rec = recommendRegime({
      grossIncome: pageTaxBase,
      fy,
      deductions: ded.totalDeductions,
      employerNpsByMember: ded.employerNpsByMember,
    });
    const pageTax = computeTax({
      grossIncome: pageTaxBase,
      regime: rec.recommended,
      fy,
      deductions: ded.totalDeductions,
      employerNpsByMember: ded.employerNpsByMember,
    }).totalTax;

    // Coherence invariant: same household + FY + regime ⇒ identical annual tax on
    // both screens. (Before the fix, the page over-stated tax by ~₹56k for Sharmas.)
    expect(pageTax).toBe(k.householdAnnualTax);

    // Guard against a no-op "fix": the §24a collapse genuinely lowers the bill.
    const taxOnGrossRent = computeTax({
      grossIncome: grossTaxable, // the OLD buggy base (full gross rent, no §24a)
      regime: rec.recommended,
      fy,
      deductions: ded.totalDeductions,
      employerNpsByMember: ded.employerNpsByMember,
    }).totalTax;
    expect(taxOnGrossRent).toBeGreaterThan(pageTax);
  });
});

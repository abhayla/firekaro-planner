/**
 * #81 Phase 3 — the SAME-SCOPE Financial-Health resolver (useFireDerive().memberFinancials).
 *
 * The load-bearing honesty invariant: when an adult is selected, EVERY FH figure is that member's
 * OWN slice on BOTH sides of every ratio — never a member numerator over a household denominator
 * (the #23 / 281b994 trap). On the default "Whole household" view it equals the household figures.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { loadSeedPersona } from "@/lib/seed-persona";
import { useFireDerive } from "@/lib/useFireDerive";
import { derive } from "@/lib/derive";
import {
  statutoryPfFor,
  totalPf,
  PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
} from "@/lib/salary-cash";

describe("memberFinancials — same-scope FH resolver", () => {
  beforeEach(() => setActivePinia(createPinia()));

  /**
   * ADR-0006 Phase 1d — these cases compare `useFireDerive()` against a DIRECT `derive()` call, so
   * both sides must be handed exactly what the composable hands the kernel: the store's own
   * `currentFY` and the same wall-clock year. Pinning one side while the wrapper reads the clock
   * would make the comparison break on 1 January for a reason that has nothing to do with the
   * lens invariance being tested.
   */
  const wrapperLens = (ui: ReturnType<typeof useUiStore>) => ({
    isFamilyView: false,
    viewingMemberId: null,
    currentFY: ui.currentFY,
  });
  const wrapperOverrides = () => ({ currentYear: new Date().getFullYear() });

  function setup() {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    const ui = useUiStore();
    loadSeedPersona(h, a); // rohit + priya (adults) · aarav + meera (dependents)
    return { h, a, ui, fire: useFireDerive() };
  }

  it("default lens (Whole household) = the household figures", () => {
    const { h, a, ui, fire } = setup();
    const k = derive(h.data, a.values, wrapperLens(ui), wrapperOverrides());
    const fh = fire.memberFinancials.value;
    expect(fh.isMemberView).toBe(false);
    expect(fh.annualIncome).toBe(k.householdAnnualIncome);
    expect(fh.annualExpenses).toBe(k.annualExpensesToday);
    expect(fh.annualTax).toBe(k.householdAnnualTax);
    expect(fh.savingsRatePercent).toBe(k.savingsRate);
    expect(fh.fireProgressPercent).toBe(k.progressPercent);
    expect(fh.netWorth).toBe(fh.totalAssets - fh.totalLiabilities);
  });

  it("member lens = that adult's OWN slice on BOTH sides of every ratio (no member÷household)", () => {
    const { h, ui, fire } = setup();
    const household = fire.memberFinancials.value; // whole-household baseline
    ui.setViewingMemberId("rohit");
    const rohit = fire.memberFinancials.value;

    expect(rohit.isMemberView).toBe(true);
    expect(rohit.memberName).toBe("Rohit");
    // Every component shrinks to the member scope — income AND expenses AND assets AND liabilities,
    // so a ratio built from them can never mix member-numerator with household-denominator.
    expect(rohit.annualIncome).toBeLessThan(household.annualIncome);
    expect(rohit.annualExpenses).toBeLessThan(household.annualExpenses);
    expect(rohit.totalAssets).toBeLessThanOrEqual(household.totalAssets);
    expect(rohit.liquid).toBeLessThanOrEqual(household.liquid);
    // Coherence invariants (same set both sides):
    expect(rohit.netWorth).toBe(rohit.totalAssets - rohit.totalLiabilities);
    expect(rohit.savingsRatePercent).toBeGreaterThanOrEqual(0);
    expect(rohit.savingsRatePercent).toBeLessThanOrEqual(100);
    expect(rohit.fireProgressPercent).toBeGreaterThanOrEqual(0);
    expect(rohit.fireProgressPercent).toBeLessThanOrEqual(100);
    // gh #218 — monthlyTakeHome is the member's own CASH: their income minus their tax minus
    // THEIR OWN PF legs and professional tax. Still the member scope on both sides (never
    // member-numerator ÷ household-denominator, which is what this file exists to lock), just a
    // smaller, honest numerator. `savingsRatePercent` above deliberately keeps the post-tax-gross
    // base, because PF is funded out of that same residual (gh #11).
    const rohitMember = h.data.members.find((m) => m.id === "rohit");
    const rohitPf = statutoryPfFor(rohitMember?.salary);
    expect(rohit.monthlyTakeHome).toBeCloseTo(
      (rohit.annualIncome - rohit.annualTax - totalPf(rohitPf) - PROFESSIONAL_TAX_ANNUAL_PER_EARNER) / 12,
      0,
    );
    // …and therefore strictly BELOW the post-tax-gross figure it replaced (the #218 defect).
    expect(rohit.monthlyTakeHome).toBeLessThan((rohit.annualIncome - rohit.annualTax) / 12);
  });

  it("the household FIRE figures stay INVARIANT to the FH member lens", () => {
    const { h, a, ui, fire } = setup();
    const whole = derive(h.data, a.values, wrapperLens(ui), wrapperOverrides());
    for (const id of ["rohit", "priya"]) {
      ui.setViewingMemberId(id);
      // The resolver lenses FH display, but the household FIRE number/age must not move.
      expect(fire.fireNumber.value, `FIRE invariant under FH lens=${id}`).toBe(whole.fireNumber);
      expect(fire.yearsToRegular.value, `years invariant under FH lens=${id}`).toBe(whole.yearsToRegular);
    }
  });

  it("a member's Joint share uses the SAME split convention as their expenses (HIGH-1 lock)", () => {
    const { h, a, ui, fire } = setup();
    // Add a large Joint liquid FD so the split weight is observable.
    h.data.investments.push({
      id: "jfd",
      type: "FD",
      value: 10_000_000,
      monthlyContribution: 0,
      ownerId: "Joint",
    } as never);
    ui.setViewingMemberId("rohit");

    a.values.householdSplitPercent = 50;
    const half = fire.memberFinancials.value;
    a.values.householdSplitPercent = 100;
    const full = fire.memberFinancials.value;

    // The Joint FD is weighted by the split %: liquid + assets are higher at 100% than at 50%
    // (the member's SHARE of Joint scales with the split) — proving liquid uses the split convention,
    // NOT a flat 100%-Joint that would mismatch the split-scoped expense burn (the FinTech HIGH-1 trap).
    expect(full.liquid).toBeGreaterThan(half.liquid);
    expect(full.totalAssets).toBeGreaterThan(half.totalAssets);
    // The member's expense burn ALSO scales with the split (ring-2 shared × split) — so emergency
    // months = liquid ÷ burn divides two figures built on the IDENTICAL Joint convention at any split.
    expect(full.annualExpenses).toBeGreaterThanOrEqual(half.annualExpenses);
    // At a 0% split, the member's Joint share is zero on BOTH sides (no asymmetry).
    a.values.householdSplitPercent = 0;
    const none = fire.memberFinancials.value;
    expect(none.liquid).toBeLessThan(half.liquid);
  });

  it("switching adults changes the member slice (the lens actually re-scopes)", () => {
    const { ui, fire } = setup();
    ui.setViewingMemberId("rohit");
    const rohit = fire.memberFinancials.value;
    ui.setViewingMemberId("priya");
    const priya = fire.memberFinancials.value;
    expect(priya.memberName).toBe("Priya");
    // The two adults have different incomes → different member slices.
    expect(priya.annualIncome).not.toBe(rohit.annualIncome);
  });
});

/**
 * Stage C engine-wiring proof (gh-issue #46): the time-varying household savings schedule moves
 * the headline FIRE date, and per-investment contributionSchedule is BARRED from corpus inflow
 * (the gh-issue #11 lock). Per-persona sane-bounds CI locks live in headline-plausibility.spec.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";

const DEFAULT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

describe("derive — time-varying household savings schedule (#46 Stage C)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  function sharmas() {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    return { h, a };
  }

  it("the inflow is ALWAYS a resolver for an earning household (ADR-0007 income path), and 0% step-up is the no-op", () => {
    // RE-BASELINED TWICE.
    //  - #46: 0% step-up bypassed the resolver, so the inflow was a plain scalar.
    //  - ADR-0006: the default moved 0 → 2, so 0% became a non-default setting.
    //  - ADR-0007 / gh #185 (HERE): the inflow is the INCOME-PATH surplus residual, which is
    //    time-varying for EVERY earning household — income grows per earner and creep-adjusted
    //    expenses eat into the residual — so it is ALWAYS a resolver, never a scalar. The
    //    `monthlyContribution <= 0 → Infinity` empty-state sentinel that the old scalar path
    //    protected is now preserved EXPLICITLY in `derive.ts` (a non-positive residual passes
    //    through as a scalar), which is a stronger guarantee than relying on the 0%-step-up branch.
    //    That sentinel has its own lock below.
    // What still matters and is locked here: with the step-up back at its ADR-0007 default of 0, it
    // is a genuine NO-OP (the income path alone drives the inflow) and it never touches the FIRE
    // number; and a positive step-up is still earlier-or-equal.
    const { h, a } = sharmas();
    const base = derive(h.data, a.values, DEFAULT_LENS);
    const zeroStepUp = derive(h.data, { ...a.values, householdSavingsStepUpPercent: 0 }, DEFAULT_LENS);
    expect(typeof zeroStepUp.householdContributionSchedule).toBe("function");
    // The ADR-0007 default IS 0, so 0% must reproduce the default headline byte-for-byte.
    expect(zeroStepUp.corpusOnlyYearsToRegular).toBe(base.corpusOnlyYearsToRegular);
    expect(zeroStepUp.fireNumber).toBe(base.fireNumber);
    // The exposed scalar monthlyContribution is unchanged (MC / What-If baseline / retire-by-age read it).
    expect(zeroStepUp.monthlyContribution).toBe(base.monthlyContribution);
    // A household with NO surplus still short-circuits to the scalar sentinel (empty-state guard).
    const noSurplus = derive(
      { ...h.data, expenses: { ...h.data.expenses, avgMonthly: 10_000_000 } },
      a.values,
      DEFAULT_LENS,
    );
    expect(typeof noSurplus.householdContributionSchedule).toBe("number");
    expect(noSurplus.corpusOnlyYearsToRegular).toBe(Number.POSITIVE_INFINITY);
  });

  it("a positive REAL household step-up pulls the FIRE date earlier-or-equal (never later)", () => {
    const { h, a } = sharmas();
    const base = derive(h.data, a.values, DEFAULT_LENS);
    const stepped = derive(h.data, { ...a.values, householdSavingsStepUpPercent: 8 }, DEFAULT_LENS);
    expect(Number.isFinite(base.corpusOnlyYearsToRegular)).toBe(true);
    expect(stepped.corpusOnlyYearsToRegular).toBeLessThanOrEqual(base.corpusOnlyYearsToRegular);
    // and it actually moves for a savings-positive household (a real lever, not a no-op).
    expect(stepped.corpusOnlyYearsToRegular).toBeLessThan(base.corpusOnlyYearsToRegular);
  });

  it("per-investment contributionSchedule is DISPLAY-ONLY — it never moves the corpus headline (#11 lock)", () => {
    const { h, a } = sharmas();
    const base = derive(h.data, a.values, DEFAULT_LENS);
    // Plant an aggressive per-investment schedule on the first investment. If it leaked into
    // corpus inflow this would pull the FIRE date dramatically earlier (the #11 ~10× double-count).
    const planted = JSON.parse(JSON.stringify(h.data)) as typeof h.data;
    if (planted.investments[0]) {
      planted.investments[0].contributionSchedule = [
        { amount: 500000, startAtAge: 30, stepUpPercentPerYear: 15 },
      ];
    }
    const withSchedule = derive(planted, a.values, DEFAULT_LENS);
    expect(withSchedule.yearsToRegular).toBe(base.yearsToRegular);
    expect(withSchedule.corpusOnlyYearsToRegular).toBe(base.corpusOnlyYearsToRegular);
    expect(withSchedule.monthlyContribution).toBe(base.monthlyContribution);
  });
});

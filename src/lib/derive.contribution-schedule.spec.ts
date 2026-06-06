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

  it("0% household step-up reproduces the exact current headline (byte-identical default path)", () => {
    const { h, a } = sharmas();
    const base = derive(h.data, a.values, DEFAULT_LENS);
    const zeroStepUp = derive(h.data, { ...a.values, householdSavingsStepUpPercent: 0 }, DEFAULT_LENS);
    expect(zeroStepUp.yearsToRegular).toBe(base.yearsToRegular);
    expect(zeroStepUp.corpusOnlyYearsToRegular).toBe(base.corpusOnlyYearsToRegular);
    expect(zeroStepUp.fireNumber).toBe(base.fireNumber);
    // The exposed scalar monthlyContribution is unchanged (MC / What-If baseline / retire-by-age read it).
    expect(zeroStepUp.monthlyContribution).toBe(base.monthlyContribution);
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

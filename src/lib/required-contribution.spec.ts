/**
 * T-377 (QN-2) — the required-monthly-contribution solver.
 *
 * The honesty bar (rule 31): every number here must be reproducible by re-feeding the
 * solver's answer back into `derive()`. If "invest ₹X/month to retire at 50" does not
 * actually produce a FIRE age of 50 in the same kernel, the hero is lying.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { derive } from "@/lib/derive";
import { requiredMonthlyContributionFor, REQUIRED_CONTRIBUTION_TOLERANCE } from "@/lib/required-contribution";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

describe("requiredMonthlyContributionFor — solves through the REAL derive() path", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("Sharmas: re-feeding the solved amount reaches the target age (±0 years)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const targetAge = 50;

    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge,
    });

    expect(Number.isFinite(r.requiredMonthlyReal)).toBe(true);
    // THE proof: feed the answer back in and the kernel must agree the target is reached.
    const check = derive(h.data, a.values, LENS, {
      monthlyContributionReal: r.requiredMonthlyReal,
      targetRetirementAge: targetAge,
    });
    expect(check.householdFireAge).not.toBeNull();
    expect(check.householdFireAge!).toBeLessThanOrEqual(targetAge);
    // …and one tolerance-step LESS must NOT reach it (the answer is minimal, not merely sufficient).
    const short = derive(h.data, a.values, LENS, {
      monthlyContributionReal: Math.max(0, r.requiredMonthlyReal - 10 * REQUIRED_CONTRIBUTION_TOLERANCE),
      targetRetirementAge: targetAge,
    });
    expect(short.householdFireAge == null || short.householdFireAge > targetAge).toBe(true);
  });

  it("every ₹ field is finite and non-negative; needNominal ≥ needReal (rule 31)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 50 });

    for (const v of [r.needReal, r.haveAtTargetReal, r.currentMonthlyReal, r.needNominal]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isNaN(r.gapReal)).toBe(false);
    expect(r.gapReal).toBe(r.needReal - r.haveAtTargetReal);
    expect(r.needNominal).toBeGreaterThanOrEqual(r.needReal);
    expect(r.swrUsed).toBeGreaterThan(0);
    expect(r.swrUsed).toBeLessThan(0.15);
  });

  it("monotone in the target age: retiring later never needs MORE per month", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    let prev = Number.POSITIVE_INFINITY;
    for (const age of [45, 50, 55, 60]) {
      const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: age });
      expect(r.requiredMonthlyReal).toBeLessThanOrEqual(prev + REQUIRED_CONTRIBUTION_TOLERANCE);
      prev = r.requiredMonthlyReal;
    }
  });

  it("an impossible target returns Infinity (never a fabricated finite amount)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    // Retiring next year is not reachable at any realistic monthly amount.
    const anchor = derive(h.data, a.values, LENS).anchorAge;
    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge: anchor + 1,
    });
    expect(r.requiredMonthlyReal).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(r.requiredMonthlyReal)).toBe(false);
  });

  // FinTech review 2026-08-27 (MEDIUM-HIGH-5): pace and prescription MUST sit on one curve.
  // Reading the pace age from the STORED target's kernel run while the need/required came from
  // the SLIDER's run let one card say both "your current amount is enough for 55" and "at
  // today's pace: 56". The pace is now resolved from the same at-target run.
  it("paceFireAge sits on the SAME curve as the prescription beside it (no self-contradiction)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    for (const age of [45, 50, 55, 60]) {
      const atTarget = derive(h.data, a.values, LENS, { targetRetirementAge: age });
      const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: age });
      expect(r.paceFireAge).toBe(atTarget.householdFireAge);
      // The coherence property the old spec could not see: "current amount is already enough"
      // and "today's pace gets you there LATER than you want" can never both be true.
      const alreadyEnough = r.requiredMonthlyReal <= r.currentMonthlyReal;
      if (alreadyEnough && r.paceFireAge != null) {
        expect(
          r.paceFireAge,
          `at target ${age} the card claims the current amount suffices, so the pace age must not be later`,
        ).toBeLessThanOrEqual(age);
      }
    }
  });

  it("currentMonthlyReal is what the household actually invests today (never the solved amount)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const base = derive(h.data, a.values, LENS);
    for (const age of [45, 60]) {
      const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: age });
      expect(r.currentMonthlyReal).toBe(base.monthlyContribution);
    }
  });

  // ---- substance locks added after the 2026-08-27 reviews (they would have caught H1/H2) ----

  it("targetAge == anchorAge means 'today': no phantom year of growth is invented", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, LENS);
    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge: k.anchorAge,
    });
    expect(r.haveAtTargetReal).toBe(Math.round(k.fireWithdrawableCorpus));
  });

  it("haveAtTargetReal grows STRICTLY with the target age (one year = one year, never two)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    let prev = -1;
    for (const age of [45, 46, 47, 48]) {
      const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: age });
      expect(r.haveAtTargetReal).toBeGreaterThan(prev);
      prev = r.haveAtTargetReal;
    }
  });

  it("needNominal is needReal grown at GENERAL CPI over the real horizon (not a vacuous >= check)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, LENS);
    const targetAge = 50;
    const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge });
    const expected = r.needReal * Math.pow(1 + a.values.inflation, targetAge - k.anchorAge);
    expect(r.needNominal).toBe(Math.round(expected));
  });

  it("never prescribes an impossible amount: required <= monthly take-home, else Infinity", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, LENS);
    for (const age of [40, 42, 45, 50, 55, 60, 65, 70]) {
      const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: age });
      if (Number.isFinite(r.requiredMonthlyReal)) {
        expect(
          r.requiredMonthlyReal,
          `retiring at ${age} quotes more per month than the household takes home`,
        ).toBeLessThanOrEqual(k.monthlyTakeHome);
      }
    }
  });

  it("a TRUE solo household ignores a stale viewingMemberId (follows derive()'s own lens gate)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    // derive() switches off the member lens for a one-member household (`isSolo`). The solver
    // must follow that gate rather than keying off `viewingMemberId` alone — otherwise a stale
    // id silently swaps the household number for the individual one, which excludes ring-3
    // (dependant) costs. NOTE: a single parent WITH children is not `isSolo` (the children are
    // members), so the lens legitimately applies there and the member caveat carries the
    // "excludes the children" warning — that is #81's documented design, not this gate.
    const soloId = h.data.members.find((m) => m.role !== "DEPENDENT")!.id;
    h.data.members = h.data.members.filter((m) => m.id === soloId);

    const household = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge: 55,
    });
    const lensed = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: { ...LENS, viewingMemberId: soloId },
      targetAge: 55,
    });
    expect(lensed.needReal).toBe(household.needReal);
    expect(lensed.requiredMonthlyReal).toBe(household.requiredMonthlyReal);
  });

  it("a non-finite target age makes NO claim (NaN gap → the 'unknown' tone), never a number", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge: Number.NaN,
    });
    expect(r.requiredMonthlyReal).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(r.gapReal)).toBe(true);
    expect(r.paceFireAge).toBeNull();
  });

  it("member lens: returns THAT adult's individual number (#81), household stays primary", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadMehtasSeed(h, a);
    const k = derive(h.data, a.values, LENS);
    const adult = k.individualFireByMember[0];
    expect(adult).toBeTruthy();

    const household = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 55 });
    const member = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: { ...LENS, viewingMemberId: adult.memberId },
      targetAge: 55,
    });
    // The member's "need" is THAT adult's individual FIRE number at the SAME target age
    // (the number is horizon-dependent, so it must be read from the at-target kernel run —
    // comparing against the default-target figure would be comparing two different plans).
    const atTarget = derive(h.data, a.values, { ...LENS, viewingMemberId: adult.memberId }, {
      targetRetirementAge: 55,
    });
    const adultAtTarget = atTarget.individualFireByMember.find((m) => m.memberId === adult.memberId)!;
    expect(member.needReal).toBe(Math.round(adultAtTarget.individualFireNumber));
    // (rounded — every monetary output of the solver is an integer rupee, per the
    // calculation-module convention.)
    expect(household.needReal).toBe(
      Math.round(derive(h.data, a.values, LENS, { targetRetirementAge: 55 }).fireNumber),
    );
    // Household stays the PRIMARY, bigger claim — the individual view funds only that adult.
    expect(member.needReal).not.toBe(household.needReal);
    expect(member.currentMonthlyReal).toBeLessThanOrEqual(household.currentMonthlyReal);
  });
});

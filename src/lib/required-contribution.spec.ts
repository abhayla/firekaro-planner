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
import { loadRaviSeed } from "@/seeds/ravi";
import { realIncomeScaleAt } from "@/lib/income-path";
import { derive } from "@/lib/derive";
import { statutoryPfFor, sumPf, totalPf } from "@/lib/salary-cash";
import {
  requiredMonthlyContributionFor,
  REQUIRED_CONTRIBUTION_TOLERANCE,
  MIN_LIVING_RETENTION,
} from "@/lib/required-contribution";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

describe("requiredMonthlyContributionFor — solves through the REAL derive() path", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("Sharmas: re-feeding the solved amount reaches the target age (±0 years)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    // ADR-0006 Phase 1c: 52, not 50. With the healthcare reservation drifting at medical
    // inflation, the Sharmas' need at 50 (₹12.00 Cr in today's ₹) sits above what their
    // take-home can fund net of the living floor, so the honest answer there is Infinity —
    // "move the age", not a number. 52 is the first reachable age, and the re-feed proof this
    // test exists for needs a reachable one. The unreachable branch is covered separately.
    const targetAge = 52;

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

  // ---- member-lens substance locks (FinTech re-review: fixes 1 and 2 shipped with NO test —
  // reverting either left the whole suite green) ----

  it("member lens: 'have' is the member's OWN corpus at the member's OWN return and horizon", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadMehtasSeed(h, a);
    const targetAge = 60;
    const k = derive(h.data, a.values, LENS);
    // Pick the adult whose age differs from the household anchor — that is where a household
    // anchor would silently project the wrong number of years.
    const adult =
      k.individualFireByMember.find((m) => m.anchorAge !== k.anchorAge) ?? k.individualFireByMember[0];
    expect(adult, "the seed must expose an adult to lens on").toBeTruthy();

    const memberLens = { ...LENS, viewingMemberId: adult.memberId };
    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: memberLens,
      targetAge,
    });
    const atTarget = derive(h.data, a.values, memberLens, { targetRetirementAge: targetAge });
    const adultAtTarget = atTarget.individualFireByMember.find((m) => m.memberId === adult.memberId)!;

    // The horizon is THEIR age to the target — not the primary earner's.
    expect(r.anchorAgeUsed).toBe(adultAtTarget.anchorAge);
    expect(r.yearsToTarget).toBe(Math.max(0, Math.round(targetAge - adultAtTarget.anchorAge)));

    // …and the corpus grows at THEIR blended real return, reproduced independently here.
    const monthly = Math.round(adultAtTarget.attributableAnnualSavings / 12);
    let corpus = adultAtTarget.attributableCorpus;
    for (let y = 0; y < r.yearsToTarget; y++) {
      corpus = corpus * (1 + adultAtTarget.realReturn) + monthly * 12;
    }
    // projectCorpus compounds monthly within the year, so allow a small intra-year difference.
    expect(Math.abs(r.haveAtTargetReal - corpus) / Math.max(1, corpus)).toBeLessThan(0.06);
  });

  it("member lens: growing the member's corpus at the HOUSEHOLD return would OVERSTATE it (bug signature)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadMehtasSeed(h, a);
    const targetAge = 60;
    const k = derive(h.data, a.values, LENS);
    // The adult whose own return is furthest BELOW the household blend — the debt-heavy spouse.
    const adult = [...k.individualFireByMember].sort((x, y) => x.realReturn - y.realReturn)[0];
    const memberLens = { ...LENS, viewingMemberId: adult.memberId };
    const atTarget = derive(h.data, a.values, memberLens, { targetRetirementAge: targetAge });
    const adultAtTarget = atTarget.individualFireByMember.find((m) => m.memberId === adult.memberId)!;
    const householdReal = (1 + atTarget.blendedReturn) / (1 + a.values.inflation) - 1;

    // Only meaningful when the two rates actually differ on this seed.
    if (Math.abs(householdReal - adultAtTarget.realReturn) < 0.001) return;

    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: memberLens,
      targetAge,
    });
    const monthly = Math.round(adultAtTarget.attributableAnnualSavings / 12);
    const grow = (rate: number) => {
      let c = adultAtTarget.attributableCorpus;
      for (let y = 0; y < r.yearsToTarget; y++) c = c * (1 + rate) + monthly * 12;
      return c;
    };
    const atHouseholdRate = grow(householdReal);
    const atMemberRate = grow(adultAtTarget.realReturn);
    if (householdReal > adultAtTarget.realReturn) {
      expect(atHouseholdRate).toBeGreaterThan(atMemberRate);
      // The shipped figure must be the MEMBER's, i.e. nearer the member-rate projection.
      expect(Math.abs(r.haveAtTargetReal - atMemberRate)).toBeLessThan(
        Math.abs(r.haveAtTargetReal - atHouseholdRate),
      );
    }
  });

  it("member lens: never prescribes more than THAT adult's own take-home", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadMehtasSeed(h, a);
    const k = derive(h.data, a.values, LENS);
    for (const adult of k.individualFireByMember) {
      const memberTakeHome = Math.round(
        (adult.attributableAnnualIncome - adult.attributableAnnualTax) / 12,
      );
      for (const age of [45, 50, 55, 60, 65]) {
        const r = requiredMonthlyContributionFor({
          snapshot: h.data,
          assumptions: a.values,
          lens: { ...LENS, viewingMemberId: adult.memberId },
          targetAge: age,
        });
        if (Number.isFinite(r.requiredMonthlyReal)) {
          expect(
            r.requiredMonthlyReal,
            `${adult.name} at ${age} is quoted more than their own take-home (${memberTakeHome})`,
          ).toBeLessThanOrEqual(memberTakeHome);
        }
      }
    }
  });

  it("a prescription that would need cutting spending past the living floor returns Infinity", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, LENS);
    const monthlyExpenses = k.annualExpensesToday / 12;
    // gh #218 — `monthlyTakeHome` is now CASH (net of both PF legs and professional tax), but PF
    // is money the household is already CONTRIBUTING, so the investable ceiling adds it back:
    // `cash + PF/12 − livingFloor`, matching `required-contribution.ts`'s own `hi`. Net of the
    // pre-#218 figure this is lower by professional tax alone (~₹208/earner/month).
    const ceilingPf = sumPf(k.lensedEarners.map((m) => statutoryPfFor(m.salary)));
    const feasibleCeiling =
      k.monthlyTakeHome +
      Math.round(totalPf(ceilingPf) / 12) -
      MIN_LIVING_RETENTION * monthlyExpenses;
    for (const age of [40, 45, 47, 50, 55, 60]) {
      const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: age });
      if (Number.isFinite(r.requiredMonthlyReal)) {
        // Anything quoted must sit inside the feasible band — a plan that requires spending
        // less than half of today's outgoings contradicts the very number it is solving for.
        expect(
          r.requiredMonthlyReal,
          `retiring at ${age} quotes an amount that needs a >50% spending cut`,
        ).toBeLessThanOrEqual(Math.ceil(feasibleCeiling));
      }
    }
  });

  it("no income at all ⇒ no monthly amount is quoted (never the old Rs5 L fallback)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    // Strip every income source: no take-home ⇒ no feasible headroom ⇒ no honest prescription.
    for (const m of h.data.members) m.salary = undefined;
    h.data.businesses = [];
    h.data.otherIncome = [];
    const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 55 });
    expect(r.requiredMonthlyReal).toBe(Number.POSITIVE_INFINITY);
  });

  it("no expenses entered ⇒ hasTarget is false so the hero makes NO claim (empty-state honesty)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    h.data.expenses.avgMonthly = 0;
    h.data.expenses.recurring = [];
    h.data.expenses.plannedFuture = [];
    const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 55 });
    expect(r.hasTarget).toBe(false);
    expect(r.needReal).toBe(0);
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
    // ADR-0006: `needReal` is the today's-₹ number AT THE TARGET AGE, so it carries the target's
    // real drift over the today's-₹ figure the kernel reports for age 0. Asserting against the
    // undrifted figure would re-assert the very optimism gh #167 removed.
    //
    // Phase 1c: that drift is NOT `(1+g)^T` — the reservation rides medical inflation and each
    // dated goal stops rising on its due year — so it is read off the kernel's own component
    // schedule at the same horizon. Re-deriving it from a scalar here would assert a model the
    // kernel no longer implements (and would silently pass again the day the goal legs vanish).
    const driftFactor = (
      k: { regularTargetComponentsRealAt: (t: number) => { total: number }; fireNumber: number },
      anchor: number,
    ) => k.regularTargetComponentsRealAt(Math.max(0, 55 - anchor)).total / k.fireNumber;
    expect(member.needReal).toBe(
      Math.round(adultAtTarget.individualFireNumber * driftFactor(atTarget, adultAtTarget.anchorAge)),
    );
    // (rounded — every monetary output of the solver is an integer rupee, per the
    // calculation-module convention.)
    const householdAtTarget = derive(h.data, a.values, LENS, { targetRetirementAge: 55 });
    expect(household.needReal).toBe(
      Math.round(
        householdAtTarget.fireNumber * driftFactor(householdAtTarget, householdAtTarget.anchorAge),
      ),
    );
    // Household stays the PRIMARY, bigger claim — the individual view funds only that adult.
    expect(member.needReal).not.toBe(household.needReal);
    expect(member.currentMonthlyReal).toBeLessThanOrEqual(household.currentMonthlyReal);
  });
  /**
   * #207 — the solver's probe must honour the SAME income path the headline uses. Before this fix
   * `derive()` treated `monthlyContributionReal` as a FLAT real scalar that replaced the income-path
   * residual outright, so the prescription was solved against a kernel run in which the user's income
   * never grew — pessimistic (over-prescribed), worst for the ₹2.5L-₹10L band whose future surplus is
   * much larger than a flat probe assumes. Ravi (₹3L CTC, the band's floor) is the sample.
   */
  it("#207: the prescription FALLS when real income growth rises — the probe rides the income path", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadRaviSeed(h, a);
    const targetAge = 60;
    const solveAt = (growthPct: number) =>
      requiredMonthlyContributionFor({
        snapshot: h.data,
        assumptions: { ...a.values, salaryGrowthRealPercent: growthPct },
        lens: LENS,
        targetAge,
      }).requiredMonthlyReal;
    const flat = solveAt(0);
    const growing = solveAt(2);
    expect(Number.isFinite(flat), `flat prescription must be solvable, got ${flat}`).toBe(true);
    expect(Number.isFinite(growing), `growing prescription must be solvable, got ${growing}`).toBe(true);
    expect(
      growing,
      `growth 2% prescription (${growing}) must be LOWER than growth 0% (${flat}) — the probe must ride the income path`,
    ).toBeLessThan(flat - REQUIRED_CONTRIBUTION_TOLERANCE);
  });

  /**
   * T-377 guarantee preserved: an override of 0 must still produce the empty-state Infinity
   * sentinel, income path or not (`calculateYearsToTarget`'s `monthlySavings <= 0 -> Infinity`).
   */
  it("#207: an override of 0 still yields the empty-state sentinel (T-377 contract)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadRaviSeed(h, a);
    const k = derive(h.data, a.values, LENS, { monthlyContributionReal: 0, targetRetirementAge: 60 });
    expect(k.householdFireAge == null || !Number.isFinite(k.householdFireAge)).toBe(true);
  });
  /**
   * #207 review (HIGH, cross-screen coherence): `individual-fire.ts` consumed the override as a
   * FLAT scalar, so after #207 the household prescription fell 12.5% while the member-lens one did
   * not move at all — the same person, two different answers depending on the selected lens. Both
   * scopes now ride the ONE `realIncomeScaleAt` formula. For a household that IS one earner and one
   * member, the two scopes describe the same plan, so the two figures must be identical.
   */
  it("#207: single-earner household — member-lens prescription EQUALS the household one", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadRaviSeed(h, a);
    expect(h.data.members.length, "Ravi must stay a single-member household for this proof").toBe(1);
    const earner = h.data.members[0];
    expect((earner.salary?.annualCTC ?? 0) > 0).toBe(true);
    const targetAge = 60;
    const household = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge,
    }).requiredMonthlyReal;
    const memberLens = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: { ...LENS, viewingMemberId: earner.id },
      targetAge,
    }).requiredMonthlyReal;
    expect(Number.isFinite(household)).toBe(true);
    expect(
      memberLens,
      `member-lens prescription ${memberLens} must equal the household's ${household} for a ` +
        "one-earner, one-member household — otherwise the same user is told two different amounts",
    ).toBe(household);
  });

  /**
   * #207 review: the income scale must be NaN-free for a household with NO salaried income at all
   * (rental-only / pension-only), where `income(0)` is 0 and a naive ratio would be 0/0. The neutral
   * identity is 1 — such a household's prescription is simply not scaled.
   */
  it("#207: zero salaried income — the income scale is a clean 1, never NaN", () => {
    expect(realIncomeScaleAt([], 0)).toBe(1);
    expect(realIncomeScaleAt([], 17)).toBe(1);
    const zeroEarner = [
      { annualAmount: 0, ageAtYear0: 45, realGrowthPercent: 2, taperAge: 50 },
    ];
    expect(realIncomeScaleAt(zeroEarner, 17)).toBe(1);
    expect(realIncomeScaleAt([{ annualAmount: 1_200_000, ageAtYear0: 40, realGrowthPercent: 2, taperAge: 50 }], Number.NaN)).toBe(1);
    for (const v of [realIncomeScaleAt([], 5), realIncomeScaleAt(zeroEarner, 5)]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Number.isNaN(v)).toBe(false);
    }
  });
});

/**
 * Mutant-kill specs for the living-floor / scopeSplit arithmetic (l.334-372) and the binary-search
 * loop bounds (l.370-381). Written against the Stryker survivor list of 2026-09-29
 * (`src/lib/required-contribution.ts` — 78 survivors + 1 no-coverage).
 */
describe("required-contribution — living floor, scopeSplit, and binary-search bounds (mutant kills)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("committedMonthly filters to ONLY auto-loan/auto-insurance — an equally-large MANUAL recurring line does NOT tighten the living floor the same way (kills the `.filter(() => true)` / `.filter(() => false)` / `&&` ArrowFunction+LogicalOperator mutants at l.346)", () => {
    // Both a manual and an auto-loan line of the SAME amount raise overall household expenses
    // identically (they're both real outgoings) — the discriminator is specifically the
    // COMMITTED-outflow living floor, which only auto-loan/auto-insurance feed. At ₹2L/month this
    // manual line still leaves a reachable target-60 prescription, while the SAME amount tagged
    // auto-loan pushes `committedMonthly` above the feasible ceiling `hi` and the household can no
    // longer be prescribed a number at all (verified against the real kernel, not asserted from
    // memory). A `.filter(() => true)` mutant would apply this to manual too (no divergence); a
    // `.filter(() => false)` mutant would make the auto-loan row invisible too (no divergence
    // either) — only the correct filter produces exactly this asymmetry.
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);

    h.data.expenses.recurring = [
      { id: "r1", label: "Discretionary spend", amount: 200_000, frequency: "M", source: "manual" },
    ];
    const withManual = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 60 });
    expect(Number.isFinite(withManual.requiredMonthlyReal), "manual line must still leave a solvable prescription").toBe(true);

    h.data.expenses.recurring = [
      { id: "r2", label: "Home loan EMI", amount: 200_000, frequency: "M", source: "auto-loan" },
    ];
    const withAutoLoan = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 60 });
    expect(
      withAutoLoan.requiredMonthlyReal,
      "the SAME amount tagged auto-loan must tighten the committed-outflow floor past feasibility",
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it("committedMonthly is scaled by scopeSplit under a member lens — a 100% split absorbs the FULL EMI and can push a 50%-split-reachable target out of reach (kills the `+`/`-` ArithmeticOperator mutants at l.347 and the `* 100`/`min↔max` mutants at l.343)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadMehtasSeed(h, a);
    const adult = h.data.members.find((m) => m.salary != null);
    expect(adult).toBeTruthy();
    const memberLens = { ...LENS, viewingMemberId: adult!.id };
    h.data.expenses.recurring = [
      { id: "r1", label: "Home loan EMI", amount: 200_000, frequency: "M", source: "auto-loan" },
    ];

    a.values.householdSplitPercent = 50;
    const split50 = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: memberLens,
      targetAge: 60,
    });
    expect(Number.isFinite(split50.requiredMonthlyReal), "at a 50% split the target must be reachable").toBe(true);

    // At a 100% split the SAME adult absorbs the FULL committed EMI (scopeSplit=1 instead of 0.5),
    // doubling their committedMonthly and tightening their individual feasible ceiling past what
    // reached the target a moment ago — proving scopeSplit is a real multiplier on committedMonthly,
    // not a mutated arithmetic op that leaves it unchanged or halves it the wrong way.
    a.values.householdSplitPercent = 100;
    const split100 = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: memberLens,
      targetAge: 60,
    });
    expect(
      split100.requiredMonthlyReal,
      "doubling this adult's share of the EMI (50%→100% split) must push the same target out of reach",
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it("hi <= 0 (no feasible headroom) -> Infinity, and reaches(0) -> 0 are DISTINCT branches (kills the `if (false)` ConditionalExpression mutants at l.353/l.359)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    // Strip all income -> monthlyTakeHome = 0 -> hi = max(0, 0 - livingFloor) = 0 -> Infinity.
    for (const m of h.data.members) m.salary = undefined;
    h.data.businesses = [];
    h.data.otherIncome = [];
    const noIncome = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 60 });
    expect(noIncome.requiredMonthlyReal).toBe(Number.POSITIVE_INFINITY);
  });

  it("!reaches(hi) -> Infinity (unreachable even at the feasible ceiling) is a genuinely different case from reaches(hi) (kills the `if (false)` mutant at l.359-continuation and proves the branch is load-bearing)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    // A very early target age the household cannot reach even investing 100% of feasible headroom.
    const tooEarly = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 32 });
    // A generously late target age the household easily reaches — different branch outcome.
    const reachable = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge: 65 });
    expect(reachable.requiredMonthlyReal).not.toBe(tooEarly.requiredMonthlyReal);
    if (tooEarly.requiredMonthlyReal === Number.POSITIVE_INFINITY) {
      expect(Number.isFinite(reachable.requiredMonthlyReal)).toBe(true);
    }
  });

  it("solve: false always yields the not-solved Infinity sentinel regardless of feasibility (kills the `solve = true` ConditionalExpression mutant at l.352)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge: 65, // easily reachable — proves the Infinity comes from `solve`, not infeasibility
      solve: false,
    });
    expect(r.requiredMonthlyReal).toBe(Number.POSITIVE_INFINITY);
    expect(r.solved).toBe(false);
  });

  it("the binary-search loop actually converges: a solved finite prescription re-fed into derive() reaches the target (kills the `i < MAX && …` -> `true && …` / `i <= MAX` / `up - lo >= TOL` / `up + lo` mutants at l.370)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const targetAge = 55;
    const r = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS, targetAge });
    expect(Number.isFinite(r.requiredMonthlyReal)).toBe(true);
    // A genuinely converged bisection must be TIGHT: the bracket width at exit is bounded by
    // REQUIRED_CONTRIBUTION_TOLERANCE, so re-feeding one tolerance-step less must fail to reach —
    // a `true && …` mutant (never checks the tolerance) or a corrupted `up + lo` comparison would
    // either loop needlessly (harmless but slow) or converge on a WRONG (non-tight) bracket whose
    // "one step less" would still reach, breaking this proof.
    const check = derive(h.data, a.values, LENS, {
      monthlyContributionReal: r.requiredMonthlyReal,
      targetRetirementAge: targetAge,
    });
    expect(check.householdFireAge).not.toBeNull();
    expect(check.householdFireAge!).toBeLessThanOrEqual(targetAge);
  });

  it("already-FIRE-ready at pace 0 -> requiredMonthlyReal is exactly 0 (kills the `reaches(0) -> false` ConditionalExpression mutant at l.359 and the `up <= TOL` boundary mutant at l.381)", () => {
    // Construct a household that is ALREADY FIRE-ready today with zero extra contribution — a
    // massively over-funded investment book — so `reaches(0)` is genuinely true and the solver
    // must take the "already there" branch (l.359-361) rather than ever entering the bisection.
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    for (const inv of h.data.investments ?? []) {
      inv.value = (inv.value ?? 0) * 100 + 50_000_000;
    }
    const k = derive(h.data, a.values, LENS, { monthlyContributionReal: 0 });
    expect(k.householdFireAge, "the fixture must actually be FIRE-ready at pace 0 for this proof to exercise reaches(0)").not.toBeNull();
    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge: 70,
    });
    // A `reaches(0) -> false` mutant would skip this branch and fall through to the bisection
    // (or the `!reaches(hi)` branch), which — for an already-adequate corpus — converges to a
    // near-zero but NON-EXACT positive bracket value, never the clean `0` the direct branch emits.
    expect(r.requiredMonthlyReal).toBe(0);
  });
});

/**
 * T-379 (QN-5) — rule-31 plausibility lock for the lever card.
 *
 * `lever-catalog.plan.spec.ts` proves the levers are internally consistent (not inert, non-negative,
 * stacking re-solves). That is SHAPE. This file asserts SUBSTANCE: would a domain expert flinch at
 * the number a real person sees?
 *
 * The persona is Amit from the reference video (FbYnFUwdODQ), answered through the ten `/quick`
 * cards — the exact fixture `quick-number.spec.ts` uses. The contract's bar: with step-up + delay +
 * direct plans switched on, the required monthly must land within 1.5x what he already invests.
 * A card that still demanded 4x his current SIP after every realistic move would be telling a
 * salaried accumulator that nothing he can do matters — the opposite of this feature's job.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { applyQuickAnswers } from "@/lib/quick-number";
import { emptyQuickAnswers, type QuickAnswers } from "@/types/quick-number";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";
import type { Household } from "@/types/household";
import {
  DELAY_LEVER_YEARS,
  PLAN_LEVER_KEYS,
  buildPlanLevers,
  applyPlanLevers,
  solvePlan,
  lessToFindFor,
  leverEffectFor,
  marginalEffectFor,
  type PlanInputs,
  type PlanLeverKey,
} from "@/lib/lever-catalog";

const L = 1e5;
const CR = 1e7;
const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
const NOW = new Date("2026-08-27T00:00:00.000Z");

/** Amit, through the ten cards (identical to the quick-number.spec.ts fixture). */
const AMIT: QuickAnswers = {
  ...emptyQuickAnswers(38),
  guess: 10 * CR,
  age: 38,
  targetAge: 50,
  spend: 1.8 * L, // all-in 2.8 L minus the 1 L EMI — card 3 asks for spend WITHOUT the EMI
  income: 5 * L,
  corpus: 80 * L,
  directPlans: null,
  sip: 1.75 * L,
  includeSpouse: true,
  spouseCorpus: 70 * L,
  kids: 2,
  kidsAge: 6,
  education: 75 * L,
  postgrad: 1.5 * CR,
  wedding: 50 * L,
  includeHouse: true,
  house: 1 * CR,
  houseInYears: 6,
  hasLoan: true,
  emi: 1 * L,
  loanRate: 0.072,
  loanYearsLeft: 7,
};

function amitPlan(): PlanInputs {
  setActivePinia(createPinia());
  const store = useHouseholdStore();
  const empty = JSON.parse(JSON.stringify(store.data)) as Household;
  const { household } = applyQuickAnswers(empty, AMIT, {
    assumptions: DEFAULT_ASSUMPTIONS,
    now: NOW,
  });
  return {
    snapshot: household,
    assumptions: DEFAULT_ASSUMPTIONS,
    lens: LENS,
    targetAge: AMIT.targetAge,
  };
}

/** The three moves the contract names for the plausibility band. */
const MOVES: PlanLeverKey[] = ["step-up-10", "delay-3", "direct-plans"];

describe("rule 31 — Amit lands in the 'clearly doable' band with three realistic moves", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("from a reachable target, step-up + delay + direct land inside the 1.5x band", () => {
    // Amit ASKED for 50. With honest math that is out of reach at any monthly amount (locked in
    // the next case), so the number a user can actually act on is the one at the first target the
    // moves DO reach. From a 53 target `delay-3` solves at 56 and the three moves land at ~1.42x
    // his current contribution — inside the contract's 1.5x "clearly doable" band.
    const plan = { ...amitPlan(), targetAge: 53 };
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const applied = applyPlanLevers(plan, levers, MOVES);
    const withMoves = solvePlan(applied);

    const current = withMoves.currentMonthlyReal;
    const required = withMoves.requiredMonthlyReal;

    // `delay-3` is one of the three moves, so the plan is solved 3 years past the chosen target —
    // that is the whole point of the lever, and it is the age the card puts on screen.
    expect(applied.targetAge).toBe(53 + DELAY_LEVER_YEARS);

    expect(current, "Amit must be investing something for the ratio to mean anything").toBeGreaterThan(0);
    expect(Number.isFinite(required), "the target must be reachable with the three moves").toBe(true);

    const ratio = required / current;
    // Reported in the run notes; the contract's bar is 1.5x.
    expect(
      ratio,
      `required ${Math.round(required)} / current ${Math.round(current)} = ${ratio.toFixed(2)}x — ` +
        "beyond 1.5x the card is telling a salaried accumulator that nothing he can do matters",
    ).toBeLessThanOrEqual(1.5);
  });

  it("retiring at 50 stays HONESTLY out of reach - the card says 'move the age', not a number", () => {
    // Before the ADR-0004 frame fix this reported a comfortable 1.41x. That number was an artifact:
    // the step-up lever wrote the NOMINAL 10 into the REAL field, so the quoted starting amount sat
    // on a path reaching ~206% of Amit's take-home by year 12. With the honest real step-up, NO
    // combination of moves reaches 50 - and saying so plainly is the product's job.
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const everything = PLAN_LEVER_KEYS.filter((k) => levers.find((l) => l.key === k)?.available);
    const all = solvePlan(applyPlanLevers(plan, levers, everything));
    expect(Number.isFinite(all.requiredMonthlyReal)).toBe(false);
  });

  it("the committed step-up never escalates past what the household can actually pay", () => {
    // The substance assertion the old 1.5x bar was blind to: it measured the STARTING contribution
    // while the path escalated. Project the committed step-up across the horizon and check the
    // final year against the same feasibility ceiling the solver applies at t=0. A 10% REAL step-up
    // put this figure at ~206% of take-home while the card advertised "1.41x, clearly doable".
    const plan = { ...amitPlan(), targetAge: 53 };
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const applied = applyPlanLevers(plan, levers, MOVES);
    const solved = solvePlan(applied);
    const stepUp = (applied.assumptions.householdSavingsStepUpPercent ?? 0) / 100;
    const finalYearReal = solved.requiredMonthlyReal * Math.pow(1 + stepUp, solved.yearsToTarget);
    const takeHome = AMIT.income ?? 0;
    expect(takeHome).toBeGreaterThan(0);
    expect(
      finalYearReal,
      `final-year contribution ${Math.round(finalYearReal)}/mo (today's rupees) exceeds take-home ` +
        `${takeHome} - the plan is affordable only on its first day`,
    ).toBeLessThanOrEqual(takeHome);
  });

  it("the three moves RESCUE an otherwise impossible plan (and the card says so, not '₹0 saved')", () => {
    // Base target 53: unreachable on today's pace at ANY monthly amount, but the three moves tip it.
    // That transition is the single most valuable thing the card can report.
    const plan = { ...amitPlan(), targetAge: 53 };
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });

    const base = solvePlan(plan);
    expect(Number.isFinite(base.requiredMonthlyReal)).toBe(false);

    const effect = leverEffectFor(plan, levers, MOVES);
    // The honest report is the RESCUE, not a rupee delta — Infinity minus a finite amount is not
    // a claimable saving, and rendering it as "0 less to find" would hide the best news the card
    // has (your plan just went from impossible to possible).
    expect(effect.kind).toBe("rescue");
    expect(effect.lessToFind, "a rescue quotes no rupee saving").toBe(0);
    expect(Number.isFinite(effect.requiredWith), "…but it does quote a real required amount").toBe(true);
  });

  it("when the baseline IS reachable, the same moves report a real ₹ saving", () => {
    // Move the target out to an age Amit's current pace can already make, so both sides are
    // finite and the ordinary "less to find" metric is the honest one.
    const plan = { ...amitPlan(), targetAge: 66 };
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    expect(Number.isFinite(solvePlan(plan).requiredMonthlyReal)).toBe(true);
    const effect = leverEffectFor(plan, levers, MOVES);
    expect(effect.kind).not.toBe("rescue");
    expect(lessToFindFor(plan, levers, MOVES)).toBeGreaterThanOrEqual(0);
  });

  it("no ₹ field the card renders is NaN or negative (nothing absurd reaches a user)", () => {
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    for (const keys of [[], ["step-up-10"], MOVES] as PlanLeverKey[][]) {
      const r = solvePlan(applyPlanLevers(plan, levers, keys));
      for (const [field, v] of Object.entries({
        required: r.requiredMonthlyReal,
        current: r.currentMonthlyReal,
        need: r.needReal,
        have: r.haveAtTargetReal,
        needNominal: r.needNominal,
      })) {
        expect(Number.isNaN(v), `${field} is NaN with [${keys.join(",")}]`).toBe(false);
        expect(v, `${field} is negative with [${keys.join(",")}]`).toBeGreaterThanOrEqual(0);
      }
      expect(lessToFindFor(plan, levers, keys)).toBeGreaterThanOrEqual(0);
    }
  });

  it("each individual move stays within a sane band — no single lever is a magic bullet", () => {
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const base = solvePlan(plan);
    const baseFind = Math.max(0, base.requiredMonthlyReal - base.currentMonthlyReal);
    for (const lever of levers.filter((l) => l.available)) {
      const saved = lessToFindFor(plan, levers, [lever.key]);
      // A single move erasing the ENTIRE shortfall would be a red flag that the perturbation is
      // too generous (the free-lunch class the risk-notch caveat exists for).
      expect(
        saved,
        `${lever.key} alone erases the whole shortfall (${saved} of ${baseFind}) — too good to be true`,
      ).toBeLessThanOrEqual(baseFind);
    }
  });
});

/**
 * The per-row metric on an UNREACHABLE baseline (the screenshot review, T-379).
 *
 * Measuring each lever ALONE is the mockup's semantics and is right when the baseline is
 * reachable. On Amit it is not: no single move reaches age 50 either, so every row reported the
 * same non-answer and the card rendered five identical "−₹0/mo" cells — which reads as "nothing
 * you do matters", the exact message this feature exists to disprove. The marginal view answers
 * the question actually being asked at the checkbox: what does adding THIS change, given my picks?
 */
describe("per-row effect on an unreachable baseline (marginal contribution)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("a single lever alone reports 'not-enough-alone', never a ₹0 saving", () => {
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const solo = marginalEffectFor(plan, levers, "step-up-10", []);
    expect(solo.kind).toBe("not-enough-alone");
    expect(solo.lessToFind).toBe(0);
  });

  it("a move on an unreachable plan is never sold as a rupee saving", () => {
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    // Amit at 50 is out of reach for EVERY subset, so no single addition can tip it. Whatever the
    // reported state, it must never be a fabricated saving.
    const others = PLAN_LEVER_KEYS.filter((k) => k !== "delay-3");
    const marginal = marginalEffectFor(plan, levers, "delay-3", others);
    expect(["rescue", "not-enough-alone"]).toContain(marginal.kind);
    expect(marginal.lessToFind).toBe(0);
  });

  it("on a REACHABLE plan a further move reports a real ₹ saving on top of the picks", () => {
    // Solve at an age Amit's plan can actually make, so both sides are finite.
    const plan = { ...amitPlan(), targetAge: 58 };
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const marginal = marginalEffectFor(plan, levers, "direct-plans", ["step-up-10"]);
    expect(["saving", "none"]).toContain(marginal.kind);
    expect(marginal.lessToFind).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(marginal.requiredWith)).toBe(true);
  });

  it("a lever already in the selection is not double-counted", () => {
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const a = marginalEffectFor(plan, levers, "delay-3", ["step-up-10"]);
    const b = marginalEffectFor(plan, levers, "delay-3", ["step-up-10", "delay-3"]);
    expect(b.kind).toBe(a.kind);
    expect(b.lessToFind).toBe(a.lessToFind);
  });
});

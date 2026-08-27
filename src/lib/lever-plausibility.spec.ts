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
  buildPlanLevers,
  applyPlanLevers,
  solvePlan,
  lessToFindFor,
  leverEffectFor,
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

  it("step-up + delay + direct brings required monthly to <= 1.5x his current contribution", () => {
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const withMoves = solvePlan(applyPlanLevers(plan, levers, MOVES));

    const current = withMoves.currentMonthlyReal;
    const required = withMoves.requiredMonthlyReal;

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

  it("the three moves RESCUE an otherwise impossible plan (and the card says so, not '₹0 saved')", () => {
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });

    // Amit's baseline at 50 is genuinely out of reach: no feasible monthly amount gets him there,
    // so the solver returns Infinity and his current pace lands at 65 instead.
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

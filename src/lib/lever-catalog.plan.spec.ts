/**
 * T-379 (QN-5) — the four PLAN levers of "How to get there — pick your moves".
 *
 * Design SSOT: `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html` (the levers card)
 * and its target shot `shots/option-c-merged.plan.1280.png`.
 *
 * These levers are a DIFFERENT shape from the scalar-baseline `Lever`s in `lever-catalog.spec.ts`:
 * they perturb the PLAN INPUTS (`{snapshot, assumptions, targetAge}`) and are measured by
 * re-solving through `required-contribution.ts` → `derive()`. The scalar catalog is untouched;
 * this file locks the additive plan-lever surface.
 *
 * The honesty bars this file exists to enforce:
 *  - **No inert lever** (lesson `project_lever_value_requires_unassumed_baseline`): every lever must
 *    actually move the solver on Sharmas. A lever whose effect is already baked into the baseline
 *    is a lie by omission — it advertises a win the user already has.
 *  - **Stacking is a re-solve, never a sum** — compounding is real, so `stacked !== Σ parts`.
 *  - **"less to find" is never negative** — a lever may not be presented as making things worse.
 *  - **Availability is honest** — the no-prepay lever must be UNAVAILABLE (with the "prepay it"
 *    reason) when the loan costs more than investing earns.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import {
  buildPlanLevers,
  applyPlanLevers,
  lessToFindFor,
  solvePlan,
  PLAN_LEVER_KEYS,
  STEP_UP_LEVER_NOMINAL_PERCENT,
  realStepUpPercentFor,
  DELAY_LEVER_YEARS,
  DIRECT_PLAN_RETURN_UPLIFT,
  type PlanInputs,
  type PlanLeverContext,
} from "@/lib/lever-catalog";
import type { Liability } from "@/types/household";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

/** Sharmas + a resolved plan-lever context, the fixture every case below builds on. */
function sharmasPlan(): { plan: PlanInputs; ctx: PlanLeverContext } {
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  loadSeedPersona(h, a);
  const plan: PlanInputs = {
    snapshot: h.data,
    assumptions: a.values,
    lens: LENS,
    targetAge: 50,
  };
  return { plan, ctx: { plan, directPlans: null } };
}

/**
 * REPLACES the household's liabilities with exactly one loan, deliberately — the Sharmas seed
 * already carries a cheap home loan, so appending a dear one would leave a cheap loan in the list
 * and the availability rule (correctly) still fires. Each availability case must own the whole
 * liability picture for its assertion to mean what it says.
 */
function withOnlyLoan(plan: PlanInputs, over: Partial<Liability> = {}): PlanInputs {
  const owner = plan.snapshot.members[0].id;
  const loan: Liability = {
    id: "loan-test",
    name: "Home loan",
    type: "HomeLoan",
    outstandingBalance: 6_000_000,
    monthlyEMI: 100_000,
    interestRate: 7.2,
    ownerId: owner,
    isSharedWithSpouse: false,
    derivedEndYear: new Date().getFullYear() + 7,
    ...over,
  };
  return { ...plan, snapshot: { ...plan.snapshot, liabilities: [loan] } };
}

describe("buildPlanLevers — the QN-5 catalog", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("emits step-up-10, delay-3 and direct-plans for a plain household", () => {
    const { ctx } = sharmasPlan();
    const keys = buildPlanLevers(ctx).map((l) => l.key);
    expect(keys).toContain("step-up-10");
    expect(keys).toContain("delay-3");
    expect(keys).toContain("direct-plans");
  });

  it("every lever carries a label and a one-line note (the card renders both)", () => {
    const { ctx } = sharmasPlan();
    for (const lever of buildPlanLevers(ctx)) {
      expect(lever.label, `${lever.key} needs a label`).toBeTruthy();
      expect(lever.note, `${lever.key} needs a note`).toBeTruthy();
    }
  });

  it("the catalog key list is exactly the five Option-C moves, in the mockup's order", () => {
    expect(PLAN_LEVER_KEYS).toEqual([
      "step-up-10",
      "delay-3",
      "trim-expenses",
      "direct-plans",
      "no-prepay-roll-emi",
    ]);
  });
});

describe("lever semantics — each maps to the spec's exact mechanism", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("step-up-10 writes the REAL-frame step-up, NOT the nominal headline (ADR-0004 section 3)", () => {
    const { plan, ctx } = sharmasPlan();
    const out = applyPlanLevers(plan, buildPlanLevers(ctx), ["step-up-10"]);
    const written = out.assumptions.householdSavingsStepUpPercent;
    // The kernel field is REAL. Writing the nominal 10 there asserts a 16.6%/yr nominal
    // escalation and puts the reference persona's final-year contribution at ~206% of take-home.
    expect(written).toBeCloseTo(realStepUpPercentFor(plan.assumptions.inflation), 6);
    expect(written).toBeLessThan(STEP_UP_LEVER_NOMINAL_PERCENT);
    // At the 6% default that is ~3.8%/yr real — consistent with ~9-9.5% nominal Indian increments.
    expect(written).toBeGreaterThan(3);
    expect(written).toBeLessThan(5);
  });

  it("realStepUpPercentFor deflates the nominal headline and never sells a real-terms cut", () => {
    expect(realStepUpPercentFor(0.06, 10)).toBeCloseTo(((1.1 / 1.06) - 1) * 100, 6);
    // A nominal step-up at or below inflation is not an accelerator — it floors at 0, never negative.
    expect(realStepUpPercentFor(0.06, 6)).toBe(0);
    expect(realStepUpPercentFor(0.06, 4)).toBe(0);
    // Clamped to the ADR-0004 ceiling.
    expect(realStepUpPercentFor(0.06, 100)).toBeLessThanOrEqual(15);
    // A non-finite inflation falls back to the 6% default rather than producing NaN.
    expect(Number.isFinite(realStepUpPercentFor(Number.NaN))).toBe(true);
  });

  it("step-up-10 never LOWERS an already-higher step-up (max, not overwrite)", () => {
    const { plan, ctx } = sharmasPlan();
    const rich: PlanInputs = {
      ...plan,
      assumptions: { ...plan.assumptions, householdSavingsStepUpPercent: 12 },
    };
    const out = applyPlanLevers(rich, buildPlanLevers(ctx), ["step-up-10"]);
    expect(out.assumptions.householdSavingsStepUpPercent).toBe(12);
  });

  it("delay-3 moves the target age by exactly +3 years", () => {
    const { plan, ctx } = sharmasPlan();
    const out = applyPlanLevers(plan, buildPlanLevers(ctx), ["delay-3"]);
    expect(out.targetAge).toBe(plan.targetAge + DELAY_LEVER_YEARS);
  });

  it("direct-plans adds +0.8pp to the equity-class return only (a What-If lever value, no new field)", () => {
    const { plan, ctx } = sharmasPlan();
    const before = plan.assumptions.equityReturn;
    const out = applyPlanLevers(plan, buildPlanLevers(ctx), ["direct-plans"]);
    expect(out.assumptions.equityReturn).toBeCloseTo(before + DIRECT_PLAN_RETURN_UPLIFT, 10);
    // Non-equity classes are untouched — the TER saving is a mutual-fund fee, not a gilt yield.
    expect(out.assumptions.debtReturn).toBe(plan.assumptions.debtReturn);
    expect(out.assumptions.goldReturn).toBe(plan.assumptions.goldReturn);
    // And it must NOT invent a persisted assumption field (contract: no new persisted field).
    expect(Object.keys(out.assumptions).sort()).toEqual(Object.keys(plan.assumptions).sort());
  });

  it("no-prepay-roll-emi rolls the EMI into savings from the loan's end year (ADR-0004 segments)", () => {
    const { plan, ctx } = sharmasPlan();
    const withLoan = withOnlyLoan(plan);
    const levers = buildPlanLevers({ ...ctx, plan: withLoan });
    const out = applyPlanLevers(withLoan, levers, ["no-prepay-roll-emi"]);
    // The EMI stops being a permanent expense: the perturbed plan must free it up.
    const emi = withLoan.snapshot.liabilities[0].monthlyEMI;
    expect(out.rolledEmiMonthly).toBeGreaterThan(0);
    expect(out.rolledEmiMonthly).toBeLessThanOrEqual(emi);
    expect(out.rolledEmiFromYear).toBeGreaterThan(new Date().getFullYear());
  });
});

describe("availability rules (honest gating)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("direct-plans is UNAVAILABLE when the user said they are already on direct plans", () => {
    const { ctx } = sharmasPlan();
    const lever = buildPlanLevers({ ...ctx, directPlans: true }).find((l) => l.key === "direct-plans")!;
    expect(lever.available).toBe(false);
    expect(lever.unavailableNote).toMatch(/already on direct plans/i);
  });

  it("direct-plans stays AVAILABLE when the answer is unknown (absent / not sure)", () => {
    const { ctx } = sharmasPlan();
    for (const answer of [null, undefined, false] as const) {
      const lever = buildPlanLevers({ ...ctx, directPlans: answer }).find((l) => l.key === "direct-plans")!;
      expect(lever.available, `directPlans=${String(answer)} must leave the lever available`).toBe(true);
    }
  });

  it("no-prepay is UNAVAILABLE with no loan at all", () => {
    const { ctx } = sharmasPlan();
    const noLoanPlan = { ...ctx.plan, snapshot: { ...ctx.plan.snapshot, liabilities: [] } };
    const lever = buildPlanLevers({ ...ctx, plan: noLoanPlan }).find((l) => l.key === "no-prepay-roll-emi")!;
    expect(lever.available).toBe(false);
    expect(lever.unavailableNote).toMatch(/no home loan/i);
  });

  it("no-prepay is AVAILABLE when the loan rate is BELOW the expected equity return", () => {
    const { plan, ctx } = sharmasPlan();
    const cheap = withOnlyLoan(plan, { interestRate: 7.2 });
    expect(plan.assumptions.equityReturn).toBeGreaterThan(0.072);
    const lever = buildPlanLevers({ ...ctx, plan: cheap }).find((l) => l.key === "no-prepay-roll-emi")!;
    expect(lever.available).toBe(true);
  });

  it("no-prepay is UNAVAILABLE when the loan costs MORE than investing earns → 'prepay it'", () => {
    const { plan, ctx } = sharmasPlan();
    const dear = withOnlyLoan(plan, { interestRate: 18 }); // a personal loan, above any equity assumption
    const lever = buildPlanLevers({ ...ctx, plan: dear }).find((l) => l.key === "no-prepay-roll-emi")!;
    expect(lever.available).toBe(false);
    expect(lever.unavailableNote).toMatch(/prepay it/i);
  });

  it("the rate rule compares like with like — a 12% loan against a 12% return is NOT a win", () => {
    const { plan, ctx } = sharmasPlan();
    const equal = withOnlyLoan(plan, { interestRate: plan.assumptions.equityReturn * 100 });
    const lever = buildPlanLevers({ ...ctx, plan: equal }).find((l) => l.key === "no-prepay-roll-emi")!;
    expect(lever.available).toBe(false);
  });
});

describe("'less to find' — the ONE effect metric (Δ required − current)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("NO INERT LEVER: every available lever changes the solver output on Sharmas", () => {
    const { plan, ctx } = sharmasPlan();
    const withLoan = withOnlyLoan(plan);
    const levers = buildPlanLevers({ ...ctx, plan: withLoan }).filter((l) => l.available);
    expect(levers.length).toBeGreaterThanOrEqual(4);
    const base = solvePlan(withLoan);
    for (const lever of levers) {
      const perturbed = solvePlan(applyPlanLevers(withLoan, levers, [lever.key]));
      expect(
        perturbed.requiredMonthlyReal,
        `${lever.key} is INERT — it does not move the solver (lesson project_lever_value_requires_unassumed_baseline)`,
      ).not.toBe(base.requiredMonthlyReal);
    }
  });

  it("every lever's 'less to find' is >= 0 (a move is never presented as a setback)", () => {
    const { plan, ctx } = sharmasPlan();
    const withLoan = withOnlyLoan(plan);
    const levers = buildPlanLevers({ ...ctx, plan: withLoan }).filter((l) => l.available);
    for (const lever of levers) {
      const delta = lessToFindFor(withLoan, levers, [lever.key]);
      expect(delta, `${lever.key} produced a negative 'less to find'`).toBeGreaterThanOrEqual(0);
    }
  });

  it("stacking RE-SOLVES: the stacked effect is not the sum of the parts", () => {
    const { plan, ctx } = sharmasPlan();
    const withLoan = withOnlyLoan(plan);
    const levers = buildPlanLevers({ ...ctx, plan: withLoan }).filter((l) => l.available);
    const keys = ["step-up-10", "delay-3", "direct-plans"] as const;
    const parts = keys.map((k) => lessToFindFor(withLoan, levers, [k]));
    const sumOfParts = parts.reduce((s, v) => s + v, 0);
    const stacked = lessToFindFor(withLoan, levers, [...keys]);
    expect(stacked).toBeGreaterThan(0);
    // Compounding is real: the joint solve cannot equal the arithmetic sum.
    expect(Math.abs(stacked - sumOfParts)).toBeGreaterThan(1);
  });

  it("stacking more moves never finds LESS than the best single move alone (monotone in effort)", () => {
    const { plan, ctx } = sharmasPlan();
    const levers = buildPlanLevers(ctx).filter((l) => l.available);
    const one = lessToFindFor(plan, levers, ["step-up-10"]);
    const two = lessToFindFor(plan, levers, ["step-up-10", "delay-3"]);
    expect(two).toBeGreaterThanOrEqual(one - 1); // −₹1 tolerance for rupee rounding
  });

  it("no levers selected → zero less to find (the baseline is the baseline)", () => {
    const { plan, ctx } = sharmasPlan();
    expect(lessToFindFor(plan, buildPlanLevers(ctx), [])).toBe(0);
  });

  it("an UNAVAILABLE lever is inert by construction — selecting it changes nothing", () => {
    const { plan, ctx } = sharmasPlan();
    // no loan on the plain Sharmas plan → no-prepay is unavailable
    const noLoanPlan = { ...plan, snapshot: { ...plan.snapshot, liabilities: [] } };
    const levers = buildPlanLevers({ ...ctx, plan: noLoanPlan });
    expect(lessToFindFor(noLoanPlan, levers, ["no-prepay-roll-emi"])).toBe(0);
  });

  it("never emits NaN — an unreachable baseline yields 0, not a fabricated saving (rule 31)", () => {
    const { plan, ctx } = sharmasPlan();
    // An impossible target (retire yesterday) makes the solver return Infinity.
    const impossible = { ...plan, targetAge: 30 };
    const levers = buildPlanLevers({ ...ctx, plan: impossible });
    const delta = lessToFindFor(impossible, levers, ["step-up-10", "delay-3"]);
    expect(Number.isFinite(delta)).toBe(true);
    expect(delta).toBeGreaterThanOrEqual(0);
  });
});

describe("member lens — levers use the individual number (#81)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("under a member lens the solve is the lensed adult's, not the household's", () => {
    const { plan, ctx } = sharmasPlan();
    const adults = plan.snapshot.members.filter((m) => m.role !== "DEPENDENT");
    expect(adults.length).toBeGreaterThan(1); // Sharmas are a couple
    const lensed: PlanInputs = {
      ...plan,
      lens: { ...LENS, viewingMemberId: adults[1].id },
    };
    const levers = buildPlanLevers({ ...ctx, plan: lensed }).filter((l) => l.available);
    const household = solvePlan(plan);
    const member = solvePlan(lensed);
    // The individual scope is a genuinely different number (the #81 contract).
    expect(member.needReal).not.toBe(household.needReal);
    // …and the levers still produce an honest, finite, non-negative saving in that scope.
    const delta = lessToFindFor(lensed, levers, ["step-up-10"]);
    expect(Number.isFinite(delta)).toBe(true);
    expect(delta).toBeGreaterThanOrEqual(0);
  });
});

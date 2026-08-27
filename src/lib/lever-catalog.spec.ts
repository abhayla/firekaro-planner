import { describe, it, expect } from "vitest";
import { resolveBaselineSchedules } from "@/lib/lever-impact";
import {
  buildAccelerationLevers,
  makeSaveMoreLever,
  buildPlanLevers,
  applyPlanLevers,
  evaluatePlanLevers,
  planToFind,
  trimmableMonthlyExpenses,
  PLAN_DIRECT_PLAN_UPLIFT,
  PLAN_STEP_UP_PERCENT,
  type AccelerationContext,
  type PlanInputs,
  type PlanLeverContext,
} from "./lever-catalog";
import { REQUIRED_CONTRIBUTION_TOLERANCE } from "./required-contribution";
import { derive, type DeriveLens } from "./derive";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { applyQuickAnswers } from "@/lib/quick-number";
import type { Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import { computeLeverImpact, rankLeverImpacts, yearsToFire, type FireBaseline } from "./lever-impact";
import { LIMIT_80CCD_1B } from "./tax-deductions";

const BASE: FireBaseline = {
  currentCorpus: 5_000_000,
  targetCorpus: 40_000_000,
  monthlySavings: 60_000,
  expectedReturn: 0.07,
};

const CTX: AccelerationContext = {
  baseline: BASE,
  monthlyExpenses: 100_000,
  realisticExpenseTrimPct: 0.1,
  swr: 0.035,
  currentEquityPct: 55,
  maxEquityPct: 75,
  realReturnPerEquityPoint: 0.0005, // +0.05% real return per +1pp equity
  currentNps80ccd1bUsed: 20_000, // ₹20k of the ₹50k 80CCD(1B) sub-limit already claimed
  marginalTaxRate: 0.3, // 30% slab (incl. cess in the real wiring) — a typical accumulator
  regime: "OLD", // 80CCD(1B) only saves tax in the OLD regime
};

describe("buildAccelerationLevers — realistic max-effort catalog", () => {
  it("emits the expense-trim and allocation levers when each has headroom", () => {
    const keys = buildAccelerationLevers(CTX).map((l) => l.key);
    expect(keys).toContain("trim-expenses");
    expect(keys).toContain("risk-notch");
  });

  it("never emits an invest-surplus lever (moot — surplus is already invested per derive, D-11)", () => {
    expect(buildAccelerationLevers(CTX).map((l) => l.key)).not.toContain("invest-surplus");
  });

  it("every lever carries a transparent bound note (honesty requirement)", () => {
    for (const lever of buildAccelerationLevers(CTX)) {
      expect(lever.note, `${lever.key} must show its realistic bound`).toBeTruthy();
    }
  });

  it("trim-expenses BOTH lowers the FIRE target and raises savings (modeled via SWR)", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "trim-expenses")!;
    const perturbed = lever.apply(BASE);
    const monthlyCut = CTX.realisticExpenseTrimPct * CTX.monthlyExpenses; // 10k
    expect(perturbed.monthlySavings).toBe(BASE.monthlySavings + monthlyCut);
    // freed target = (annual cut) / SWR
    expect(perturbed.targetCorpus).toBeCloseTo(BASE.targetCorpus - (monthlyCut * 12) / CTX.swr, 0);
    expect(perturbed.targetCorpus).toBeLessThan(BASE.targetCorpus);
  });

  it("risk-notch raises expected real return by one bounded equity notch", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "risk-notch")!;
    const perturbed = lever.apply(BASE);
    const notch = Math.min(10, CTX.maxEquityPct - CTX.currentEquityPct); // 10
    expect(perturbed.expectedReturn).toBeCloseTo(BASE.expectedReturn + notch * CTX.realReturnPerEquityPoint, 6);
  });

  // HONESTY LOCK (FinTech review, 2026-06-06): the risk-notch lever raises return on a deterministic
  // yardstick, so without a caveat it reads as a free lunch next to the risk-neutral levers. Its note
  // MUST disclose the added market/volatility risk — assert the substance so it can't regress.
  it("risk-notch discloses the added market risk in its note (not a free lunch)", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "risk-notch")!;
    expect(lever.note).toMatch(/risk|volatil|range of outcomes/i);
  });

  it("every emitted lever is a genuine ACCELERATOR (saves years) on a reachable baseline", () => {
    const ranked = rankLeverImpacts(BASE, buildAccelerationLevers(CTX));
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      expect(r.deltaYears, `${r.key} should not delay FIRE`).toBeGreaterThan(0);
    }
    // sanity: a real accumulator with these levers reaches FIRE sooner than baseline
    expect(yearsToFire(BASE)).toBeGreaterThan(0);
  });
});

describe("80CCD(1B) NPS headroom lever — tax-saved-only model (double-count guard, D-2026-06-06-11)", () => {
  it("emits the 80CCD lever when there is unused 80CCD(1B) headroom", () => {
    const keys = buildAccelerationLevers(CTX).map((l) => l.key);
    expect(keys).toContain("nps-80ccd1b");
  });

  it("adds ONLY the marginal tax SAVED on the headroom to savings — NOT the ₹50k itself (no double-count)", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "nps-80ccd1b")!;
    const headroom = LIMIT_80CCD_1B - CTX.currentNps80ccd1bUsed; // 30k
    const annualTaxSaved = headroom * CTX.marginalTaxRate; // 9k
    const perturbed = lever.apply(BASE);
    // The inflow rises by tax-saved/12 — the surplus (₹50k) is ALREADY invested per derive (D-11),
    // so adding it again would double-count. Only the freed TAX is genuinely new cashflow.
    //
    // ADR-0006 Phase 1b: it lands on `flatExtraMonthlySavings`, NOT `monthlySavings`. A fixed
    // statutory headroom times a slab rate does not grow with the household's real wage curve, so
    // it must not inherit the savings step-up — it did, and the step-up compounded a constant into
    // a rising series, over-stating this lever against every other one in the ranking.
    expect(perturbed.monthlySavings, "the residual itself is untouched").toBe(BASE.monthlySavings);
    expect(perturbed.flatExtraMonthlySavings).toBeCloseTo(annualTaxSaved / 12, 6);
    // explicit anti-double-count assertion: the inflow did NOT jump by the full headroom/12
    expect(perturbed.flatExtraMonthlySavings!).toBeLessThan(headroom / 12);

    // …and the resolved schedule proves it: the flat part is CPI-grown but NEVER step-up-grown.
    const stepped = { ...BASE, savingsStepUpPercent: 10, savingsStepUpTaperYears: 20, savingsInflationRate: 0 };
    const withLever = lever.apply(stepped);
    const s0 = resolveBaselineSchedules(withLever).savings;
    const s10 = typeof s0 === "function" ? s0(10) : s0;
    const expectedAt10 =
      stepped.monthlySavings * Math.pow(1.1, 10) + annualTaxSaved / 12;
    expect(s10).toBeCloseTo(expectedAt10, 6);
    // target unchanged (80CCD does not lower the FIRE number)
    expect(perturbed.targetCorpus).toBe(BASE.targetCorpus);
    // NPS lock-in honesty (FinTech 2026-06-06): only the freed TAX (liquid) enters savings — the
    // ₹50k NPS principal is locked till 60 with forced annuitisation, so it MUST NOT enter the
    // liquid corpus base. currentCorpus is untouched.
    expect(perturbed.currentCorpus).toBe(BASE.currentCorpus);
  });

  it("omits the 80CCD lever when the headroom is already exhausted (locked, no fake impact)", () => {
    const keys = buildAccelerationLevers({ ...CTX, currentNps80ccd1bUsed: LIMIT_80CCD_1B }).map((l) => l.key);
    expect(keys).not.toContain("nps-80ccd1b");
  });

  it("omits the 80CCD lever when the marginal rate is 0 (no tax to save ⇒ no acceleration)", () => {
    const keys = buildAccelerationLevers({ ...CTX, marginalTaxRate: 0 }).map((l) => l.key);
    expect(keys).not.toContain("nps-80ccd1b");
  });

  // FinTech HIGH lock (2026-06-06): 80CCD(1B) is an OLD-regime-only deduction. Under the NEW regime
  // (the persona majority post-Budget-2025) it saves ₹0 — the lever MUST be locked, never showing a
  // phantom "years sooner" for a benefit the user legally cannot claim (rule 31 optimistic-skew guard).
  it("omits the 80CCD lever for a NEW-regime household (deduction disallowed ⇒ ₹0 saved)", () => {
    const keys = buildAccelerationLevers({ ...CTX, regime: "NEW" }).map((l) => l.key);
    expect(keys).not.toContain("nps-80ccd1b");
  });

  it("carries a transparent bound note naming the headroom and the tax saved", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "nps-80ccd1b")!;
    expect(lever.note).toMatch(/80CCD|NPS/i);
    expect(lever.note).toMatch(/tax/i);
  });

  it("is a genuine accelerator (saves years) on a reachable baseline", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "nps-80ccd1b")!;
    const impact = computeLeverImpact(BASE, lever);
    expect(impact.reachable).toBe(true);
    expect(impact.deltaYears).toBeGreaterThan(0);
  });

  it("does not mutate the baseline", () => {
    const snapshot = JSON.stringify(BASE);
    buildAccelerationLevers(CTX).forEach((l) => l.apply(BASE));
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });
});

describe("makeSaveMoreLever — user-parameterised save-more sensitivity (pure factory)", () => {
  it("perturbs ONLY monthlySavings by the extra amount, leaving the target untouched", () => {
    const lever = makeSaveMoreLever(15_000);
    const perturbed = lever.apply(BASE);
    expect(perturbed.monthlySavings).toBe(BASE.monthlySavings + 15_000);
    expect(perturbed.targetCorpus).toBe(BASE.targetCorpus);
    expect(perturbed.currentCorpus).toBe(BASE.currentCorpus);
    expect(perturbed.expectedReturn).toBe(BASE.expectedReturn);
  });

  it("has the stable key 'save-more' and a transparent note naming the amount", () => {
    const lever = makeSaveMoreLever(15_000);
    expect(lever.key).toBe("save-more");
    expect(lever.note).toMatch(/15|more/i);
  });

  it("produces a positive years-saved for a positive amount on a reachable baseline", () => {
    const impact = computeLeverImpact(BASE, makeSaveMoreLever(20_000));
    expect(impact.reachable).toBe(true);
    expect(impact.deltaYears).toBeGreaterThan(0);
  });

  it("a zero/negative amount yields no acceleration (caller is expected to omit it)", () => {
    expect(computeLeverImpact(BASE, makeSaveMoreLever(0)).deltaYears).toBeCloseTo(0, 6);
  });

  it("does not mutate the baseline", () => {
    const snapshot = JSON.stringify(BASE);
    makeSaveMoreLever(25_000).apply(BASE);
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });
});

describe("buildAccelerationLevers — no-headroom levers are LOCKED, not faked", () => {
  it("omits risk-notch when already at the equity ceiling", () => {
    const keys = buildAccelerationLevers({ ...CTX, currentEquityPct: 75, maxEquityPct: 75 }).map((l) => l.key);
    expect(keys).not.toContain("risk-notch");
  });

  it("omits trim-expenses when there are no expenses to trim", () => {
    const keys = buildAccelerationLevers({ ...CTX, monthlyExpenses: 0 }).map((l) => l.key);
    expect(keys).not.toContain("trim-expenses");
  });

  it("guards against a non-positive SWR (no divide-by-zero in the expense lever)", () => {
    const levers = buildAccelerationLevers({ ...CTX, swr: 0 });
    // either omitted, or applied without producing a non-finite target
    const trim = levers.find((l) => l.key === "trim-expenses");
    if (trim) expect(Number.isFinite(trim.apply(BASE).targetCorpus)).toBe(true);
  });

  it("does not mutate the baseline", () => {
    const snapshot = JSON.stringify(BASE);
    buildAccelerationLevers(CTX).forEach((l) => l.apply(BASE));
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });
});

describe("trimmableMonthlyExpenses — the ONE trim base shared by both 'Trim spending 10%' levers", () => {
  it("excludes the auto-flowed EMI / insurance lines and converts each manual line to monthly", () => {
    const expenses = {
      avgMonthly: 50_000,
      recurring: [
        { id: "r1", label: "Gym", amount: 3_000, frequency: "M", source: "manual" },
        { id: "r2", label: "School fees", amount: 60_000, frequency: "A", source: "manual" }, // → 5,000/mo
        { id: "r3", label: "Club dues", amount: 9_000, frequency: "Q", source: "manual" }, //  → 3,000/mo
        { id: "r4", label: "Home loan EMI", amount: 45_000, frequency: "M", source: "auto-loan" },
        { id: "r5", label: "Term cover", amount: 24_000, frequency: "A", source: "auto-insurance" },
      ],
    } as unknown as Parameters<typeof trimmableMonthlyExpenses>[0];

    // 50,000 + 3,000 + (60,000/12) + (9,000/3) = 61,000 — the EMI and the premium are left alone.
    expect(trimmableMonthlyExpenses(expenses)).toBe(61_000);
  });

  it("is 0 when nothing discretionary is entered (⇒ both trim levers lock, never fake an impact)", () => {
    const expenses = {
      avgMonthly: 0,
      recurring: [{ id: "r1", label: "Car EMI", amount: 20_000, frequency: "M", source: "auto-loan" }],
    } as unknown as Parameters<typeof trimmableMonthlyExpenses>[0];
    expect(trimmableMonthlyExpenses(expenses)).toBe(0);
  });
});

// ============================================================================================
// QN-5 (T-379) — plan levers: availability rules, "less to find", stacking, no-inert guard.
// Every assertion here runs the REAL solver on the REAL Sharmas seed (never a stub kernel).
// ============================================================================================
describe("QN-5 plan levers — buildPlanLevers / evaluatePlanLevers (Sharmas, real solver)", () => {
  const LENS: DeriveLens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
  const YEAR = new Date().getFullYear();

  function sharmas() {
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    return { snapshot: h.data, assumptions: a.values };
  }
  function ctxFor(snapshot: Household, assumptions: Assumptions, memberLens = false): PlanLeverContext {
    return { anchorAge: derive(snapshot, assumptions, LENS).anchorAge, directPlans: null, memberLens, currentYear: YEAR };
  }
  /** First target age (from 50) at which today's plan is reachable — the levers need a finite baseline. */
  function reachableTargetAge(snapshot: Household, assumptions: Assumptions): number {
    for (let age = 50; age <= 65; age++) {
      const r = planToFind({ snapshot, assumptions, targetAge: age, extraSegments: [] }, LENS);
      if (Number.isFinite(r.toFind)) return age;
    }
    throw new Error("Sharmas never reachable between 50 and 65 — fixture drifted");
  }

  it("emits exactly the five spec levers, in catalog order, every one with label + note", () => {
    const { snapshot, assumptions } = sharmas();
    const levers = buildPlanLevers(snapshot, assumptions, ctxFor(snapshot, assumptions));
    expect(levers.map((l) => l.key)).toEqual(["step-up-10", "delay-3", "trim-expenses", "direct-plans", "no-prepay-roll-emi"]);
    for (const l of levers) {
      expect(l.label.length).toBeGreaterThan(5);
      expect(l.note.length).toBeGreaterThan(10);
    }
  });

  it("on Sharmas every lever is AVAILABLE (step-up 0, a loan below the equity return, direct unknown)", () => {
    const { snapshot, assumptions } = sharmas();
    const levers = buildPlanLevers(snapshot, assumptions, ctxFor(snapshot, assumptions));
    expect(levers.every((l) => l.available)).toBe(true);
  });

  it("NO-INERT-LEVER GUARD: every available lever CHANGES the solver output on Sharmas (lesson: unassumed baseline)", () => {
    const { snapshot, assumptions } = sharmas();
    const targetAge = reachableTargetAge(snapshot, assumptions);
    const base: PlanInputs = { snapshot, assumptions, targetAge, extraSegments: [] };
    const levers = buildPlanLevers(snapshot, assumptions, ctxFor(snapshot, assumptions));
    const baseline = planToFind(base, LENS);
    for (const l of levers.filter((x) => x.available)) {
      const one = planToFind(l.apply(base), LENS);
      expect(
        one.requiredMonthlyReal !== baseline.requiredMonthlyReal || one.currentMonthlyReal !== baseline.currentMonthlyReal,
        `${l.key} is INERT — it does not move the solver (required ${baseline.requiredMonthlyReal} → ${one.requiredMonthlyReal})`,
      ).toBe(true);
    }
  });

  it("every lever's 'less to find' is >= 0 and finite; unavailable levers report 0", () => {
    const { snapshot, assumptions } = sharmas();
    const targetAge = reachableTargetAge(snapshot, assumptions);
    const base: PlanInputs = { snapshot, assumptions, targetAge, extraSegments: [] };
    const levers = buildPlanLevers(snapshot, assumptions, ctxFor(snapshot, assumptions));
    const { effects } = evaluatePlanLevers(base, LENS, levers);
    expect(effects).toHaveLength(levers.length);
    for (const e of effects) {
      expect(Number.isFinite(e.lessToFind), `${e.key} lessToFind finite`).toBe(true);
      expect(e.lessToFind, `${e.key} lessToFind >= 0`).toBeGreaterThanOrEqual(0);
    }
    // At least the step-up and the delay must actually reduce what there is to find.
    const by = Object.fromEntries(effects.map((e) => [e.key, e.lessToFind]));
    expect(by["step-up-10"]).toBeGreaterThan(0);
    expect(by["delay-3"]).toBeGreaterThan(0);
  });

  it("STACKING re-solves: the stacked 'less to find' is NOT the sum of the parts", () => {
    const { snapshot, assumptions } = sharmas();
    const targetAge = reachableTargetAge(snapshot, assumptions);
    const base: PlanInputs = { snapshot, assumptions, targetAge, extraSegments: [] };
    const levers = buildPlanLevers(snapshot, assumptions, ctxFor(snapshot, assumptions));
    const { baseline, effects } = evaluatePlanLevers(base, LENS, levers);
    const sumOfParts = effects.reduce((s, e) => s + e.lessToFind, 0);
    const stacked = planToFind(applyPlanLevers(base, levers, new Set(levers.map((l) => l.key))), LENS);
    const stackedLess = baseline.toFind - stacked.toFind;
    expect(stackedLess).toBeGreaterThan(0);
    // The parts overlap (a lower target after trimming needs less step-up, etc.) — a plain sum
    // would overstate the plan. Anything within one solver tolerance of the sum is suspicious.
    expect(Math.abs(stackedLess - sumOfParts)).toBeGreaterThan(REQUIRED_CONTRIBUTION_TOLERANCE);
    // Stacking everything can never leave MORE to find than the baseline.
    expect(stacked.toFind).toBeLessThanOrEqual(baseline.toFind);
  });

  it("no-prepay: UNAVAILABLE with the 'prepay it' copy when every loan's rate >= the expected equity return", () => {
    const { snapshot, assumptions } = sharmas();
    const dear = { ...snapshot, liabilities: snapshot.liabilities.map((l) => ({ ...l, interestRate: 13 })) };
    const lever = buildPlanLevers(dear, assumptions, ctxFor(snapshot, assumptions)).find((l) => l.key === "no-prepay-roll-emi")!;
    expect(lever.available).toBe(false);
    expect(lever.unavailableReason).toMatch(/prepay it/);
    // Identity when unavailable — it must not smuggle a segment in.
    const base: PlanInputs = { snapshot: dear, assumptions, targetAge: 55, extraSegments: [] };
    expect(lever.apply(base)).toBe(base);
  });

  it("no-prepay: UNAVAILABLE ('no home loan') without a loan; 'add the end year' when the end year is missing", () => {
    const { snapshot, assumptions } = sharmas();
    const none = { ...snapshot, liabilities: [] };
    expect(buildPlanLevers(none, assumptions, ctxFor(snapshot, assumptions)).find((l) => l.key === "no-prepay-roll-emi")!.unavailableReason).toBe("no home loan");
    const noEnd = { ...snapshot, liabilities: snapshot.liabilities.map((l) => ({ ...l, derivedEndYear: undefined })) };
    const lever = buildPlanLevers(noEnd, assumptions, ctxFor(snapshot, assumptions)).find((l) => l.key === "no-prepay-roll-emi")!;
    expect(lever.available).toBe(false);
    expect(lever.unavailableReason).toMatch(/end year/);
  });

  it("no-prepay: adds ONE real segment per qualifying loan, starting at the loan's end age, deflated below the nominal EMI", () => {
    const { snapshot, assumptions } = sharmas();
    const ctx = ctxFor(snapshot, assumptions);
    const lever = buildPlanLevers(snapshot, assumptions, ctx).find((l) => l.key === "no-prepay-roll-emi")!;
    const base: PlanInputs = { snapshot, assumptions, targetAge: 60, extraSegments: [] };
    const out = lever.apply(base);
    expect(base.extraSegments).toEqual([]); // pure
    expect(out.extraSegments).toHaveLength(1);
    const loan = snapshot.liabilities[0];
    const seg = out.extraSegments[0];
    expect(seg.startAtAge).toBe(ctx.anchorAge + ((loan.derivedEndYear as number) - YEAR));
    expect(seg.amount).toBeGreaterThan(0);
    expect(seg.amount).toBeLessThan(loan.monthlyEMI); // real, not nominal
    expect(seg.endAtAge).toBeUndefined();
  });

  it("direct-plans: UNAVAILABLE when the user said their funds are already direct; the 'ignore this' hint only when unknown", () => {
    const { snapshot, assumptions } = sharmas();
    const direct = buildPlanLevers(snapshot, assumptions, { ...ctxFor(snapshot, assumptions), directPlans: true }).find((l) => l.key === "direct-plans")!;
    expect(direct.available).toBe(false);
    expect(direct.unavailableReason).toMatch(/already on direct/);
    const unknown = buildPlanLevers(snapshot, assumptions, { ...ctxFor(snapshot, assumptions), directPlans: null }).find((l) => l.key === "direct-plans")!;
    expect(unknown.note).toMatch(/ignore this/);
    const regular = buildPlanLevers(snapshot, assumptions, { ...ctxFor(snapshot, assumptions), directPlans: false }).find((l) => l.key === "direct-plans")!;
    expect(regular.available).toBe(true);
    expect(regular.note).not.toMatch(/ignore this/);
    // The uplift is SCALED by the fund-held share of the equity bucket (stocks pay no TER) and
    // never touches debt — a What-If on the assumptions, not a new field.
    const equity = snapshot.investments.filter((i) => i.type === "MutualFunds" || i.type === "Stocks");
    const fundShare =
      equity.filter((i) => i.type === "MutualFunds").reduce((s, i) => s + i.value, 0) /
      equity.reduce((s, i) => s + i.value, 0);
    expect(fundShare).toBeGreaterThan(0);
    const base: PlanInputs = { snapshot, assumptions, targetAge: 55, extraSegments: [] };
    const out = regular.apply(base);
    expect(out.assumptions.equityReturn).toBeCloseTo(assumptions.equityReturn + PLAN_DIRECT_PLAN_UPLIFT * fundShare, 6);
    expect(out.assumptions.debtReturn).toBe(assumptions.debtReturn);
    expect(base.assumptions.equityReturn).toBe(assumptions.equityReturn); // pure
  });

  it("direct-plans: a STOCKS-ONLY equity book gets no uplift (unavailable, stocks pay no fund fee); a half-fund book gets half", () => {
    const { snapshot, assumptions } = sharmas();
    const noFunds = {
      ...snapshot,
      investments: snapshot.investments
        .filter((i) => i.type !== "International")
        .map((i) => (i.type === "MutualFunds" ? { ...i, type: "Stocks" as const } : i)),
    };
    const lever = buildPlanLevers(noFunds, assumptions, ctxFor(snapshot, assumptions)).find((l) => l.key === "direct-plans")!;
    expect(lever.available).toBe(false);
    expect(lever.unavailableReason).toMatch(/no mutual funds/);
    const half = {
      ...snapshot,
      investments: [
        ...snapshot.investments.filter((i) => i.type !== "MutualFunds" && i.type !== "Stocks" && i.type !== "International"),
        { ...snapshot.investments.find((i) => i.type === "MutualFunds")!, id: "mf-1", value: 1_000_000 },
        { ...snapshot.investments.find((i) => i.type === "MutualFunds")!, id: "st-1", type: "Stocks" as const, value: 1_000_000 },
      ],
    };
    const halfLever = buildPlanLevers(half, assumptions, ctxFor(snapshot, assumptions)).find((l) => l.key === "direct-plans")!;
    expect(halfLever.available).toBe(true);
    expect(halfLever.note).toMatch(/50% of your equity/);
    const out = halfLever.apply({ snapshot: half, assumptions, targetAge: 55, extraSegments: [] });
    expect(out.assumptions.equityReturn).toBeCloseTo(assumptions.equityReturn + PLAN_DIRECT_PLAN_UPLIFT * 0.5, 6);
  });

  it("step-up: UNAVAILABLE once the household already steps up >= 10%/yr; never lowers an existing higher step-up", () => {
    const { snapshot, assumptions } = sharmas();
    const already = { ...assumptions, householdSavingsStepUpPercent: 12 };
    const lever = buildPlanLevers(snapshot, already, ctxFor(snapshot, assumptions)).find((l) => l.key === "step-up-10")!;
    expect(lever.available).toBe(false);
    expect(lever.unavailableReason).toMatch(/12%/);
    const on = buildPlanLevers(snapshot, assumptions, ctxFor(snapshot, assumptions)).find((l) => l.key === "step-up-10")!;
    expect(on.apply({ snapshot, assumptions, targetAge: 55, extraSegments: [] }).assumptions.householdSavingsStepUpPercent).toBe(PLAN_STEP_UP_PERCENT);
  });

  it("trim: cuts the discretionary lines 10% and leaves the auto-flowed EMI / premium lines untouched", () => {
    const { snapshot, assumptions } = sharmas();
    const lever = buildPlanLevers(snapshot, assumptions, ctxFor(snapshot, assumptions)).find((l) => l.key === "trim-expenses")!;
    const out = lever.apply({ snapshot, assumptions, targetAge: 55, extraSegments: [] });
    expect(out.snapshot.expenses.avgMonthly).toBe(Math.round(snapshot.expenses.avgMonthly * 0.9));
    for (const [i, r] of out.snapshot.expenses.recurring.entries()) {
      const before = snapshot.expenses.recurring[i];
      if (before.source === "manual") expect(r.amount).toBe(Math.round(before.amount * 0.9));
      else expect(r.amount).toBe(before.amount);
    }
    expect(snapshot.expenses.avgMonthly).not.toBe(out.snapshot.expenses.avgMonthly); // pure: original untouched
  });

  it("member lens: household-level moves (step-up, no-prepay) are unavailable with the household reason; delay evaluates on the INDIVIDUAL number", () => {
    const { snapshot, assumptions } = sharmas();
    const adult = snapshot.members[0];
    const memberLens: DeriveLens = { ...LENS, viewingMemberId: adult.id };
    const levers = buildPlanLevers(snapshot, assumptions, ctxFor(snapshot, assumptions, true));
    expect(levers.find((l) => l.key === "step-up-10")!.available).toBe(false);
    expect(levers.find((l) => l.key === "no-prepay-roll-emi")!.available).toBe(false);
    expect(levers.find((l) => l.key === "step-up-10")!.unavailableReason).toMatch(/Whole household/);
    const base: PlanInputs = { snapshot, assumptions, targetAge: 60, extraSegments: [] };
    const household = planToFind(base, LENS);
    const individual = planToFind(base, memberLens);
    // The lensed "current" is that adult's own attributable savings, not the couple's.
    expect(individual.currentMonthlyReal).not.toBe(household.currentMonthlyReal);
    expect(individual.currentMonthlyReal).toBeLessThan(household.currentMonthlyReal);
  });
});

describe("derive() — extraContributionSegments override (the seam the roll-the-EMI lever uses)", () => {
  const LENS: DeriveLens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
  it("is byte-identical with no / empty segments, and reaches FIRE SOONER with an added segment", () => {
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const plain = derive(h.data, a.values, LENS);
    const empty = derive(h.data, a.values, LENS, { extraContributionSegments: [] });
    expect(empty.yearsToRegular).toBe(plain.yearsToRegular);
    expect(empty.householdFireAge).toBe(plain.householdFireAge);
    const boosted = derive(h.data, a.values, LENS, {
      extraContributionSegments: [{ amount: 40_000, startAtAge: plain.anchorAge + 5 }],
    });
    expect(boosted.yearsToRegular).toBeLessThan(plain.yearsToRegular);
    // A junk segment (non-positive / non-finite) is ignored, never poisons the kernel.
    const junk = derive(h.data, a.values, LENS, {
      extraContributionSegments: [{ amount: -5, startAtAge: 40 }, { amount: Number.NaN, startAtAge: 41 }],
    });
    expect(junk.yearsToRegular).toBe(plain.yearsToRegular);
  });
});

describe("QN-5 plan levers — Amit (the /quick persona) at 50: out-of-reach baseline, real kernel (rule 31)", () => {
  const LENS: DeriveLens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
  const L = 100_000;
  const CR = 10_000_000;
  const AMIT = {
    guess: 10 * CR, age: 38, targetAge: 50, spend: 2.8 * L, income: 5 * L, corpus: 80 * L, spouseCorpus: 70 * L,
    includeSpouse: true, sip: 1.75 * L, kids: 2, kidsAge: 6, education: 75 * L, postgrad: 1.5 * CR, wedding: 50 * L,
    house: 1 * CR, includeHouse: true, directPlans: null, hasLoan: true, emi: 1 * L, loanRate: 0.072, loanYearsLeft: 7,
  };
  function amit() {
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.hydrate();
    a.hydrate();
    const snapshot = applyQuickAnswers(h.data, AMIT as never, { assumptions: a.values }).household;
    return { snapshot, assumptions: a.values };
  }

  it("every move is available (7.2% loan < 12% equity, funds 'not sure', step-up 0, spending entered)", () => {
    const { snapshot, assumptions } = amit();
    const anchor = derive(snapshot, assumptions, LENS).anchorAge;
    const levers = buildPlanLevers(snapshot, assumptions, { anchorAge: anchor, directPlans: null, memberLens: false, currentYear: new Date().getFullYear() });
    expect(levers.every((l) => l.available)).toBe(true);
    // Reasons are only ever set on an unavailable lever — an available one carries none.
    expect(levers.every((l) => l.unavailableReason === undefined)).toBe(true);
  });

  it("at 50 the baseline is OUT OF REACH; each move alone still closes a positive slice of the gap; all five together make it a finite plan", () => {
    const { snapshot, assumptions } = amit();
    const anchor = derive(snapshot, assumptions, LENS).anchorAge;
    const levers = buildPlanLevers(snapshot, assumptions, { anchorAge: anchor, directPlans: null, memberLens: false, currentYear: new Date().getFullYear() });
    const base: PlanInputs = { snapshot, assumptions, targetAge: 50, extraSegments: [] };
    const { baseline, effects } = evaluatePlanLevers(base, LENS, levers);
    expect(Number.isFinite(baseline.toFind)).toBe(false); // "Move the age" today — the honest T-378 verdict
    for (const e of effects) {
      expect(e.gapClosed, `${e.key} must close some of the gap`).toBeGreaterThan(0);
      expect(e.lessToFind).toBe(0); // ∞ − ∞ is not a number we quote
    }
    const all = planToFind(applyPlanLevers(base, levers, new Set(levers.map((l) => l.key))), LENS);
    expect(Number.isFinite(all.requiredMonthlyReal)).toBe(true);
    expect(all.requiredMonthlyReal).toBeGreaterThan(0);
    // Sanity band: the stacked prescription must stay within the feasible ceiling the solver
    // enforces (never more than take-home minus the living floor) — a finite number here IS the
    // proof it does; the ratio to today's investing is a product observation, not a gate.
    expect(all.requiredMonthlyReal / all.currentMonthlyReal).toBeLessThan(2);
  });
});

import { describe, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { applyQuickAnswers } from "@/lib/quick-number";
import { emptyQuickAnswers, type QuickAnswers } from "@/types/quick-number";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";
import type { Household } from "@/types/household";
import { buildPlanLevers, applyPlanLevers, solvePlan, type PlanInputs } from "@/lib/lever-catalog";
const L = 1e5, CR = 1e7;
const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
const AMIT: QuickAnswers = { ...emptyQuickAnswers(38), guess: 10*CR, age: 38, targetAge: 50, spend: 1.8*L, income: 5*L, corpus: 80*L, directPlans: null, sip: 1.75*L, includeSpouse: true, spouseCorpus: 70*L, kids: 2, kidsAge: 6, education: 75*L, postgrad: 1.5*CR, wedding: 50*L, includeHouse: true, house: 1*CR, houseInYears: 6, hasLoan: true, emi: 1*L, loanRate: 0.072, loanYearsLeft: 7 };
describe("chk", () => {
  it("x", () => {
    setActivePinia(createPinia());
    const store = useHouseholdStore();
    const empty = JSON.parse(JSON.stringify(store.data)) as Household;
    const { household } = applyQuickAnswers(empty, AMIT, { assumptions: DEFAULT_ASSUMPTIONS, now: new Date("2026-08-27") });
    const plan: PlanInputs = { snapshot: household, assumptions: DEFAULT_ASSUMPTIONS, lens: LENS, targetAge: 50 };
    const levers = buildPlanLevers({ plan, directPlans: null });
    for (const base of [50,52,53,54,55,56,57,58]) {
      const pb: PlanInputs = { ...plan, targetAge: base };
      const lb = buildPlanLevers({ plan: pb, directPlans: null });
      const three = solvePlan(applyPlanLevers(pb, lb, ["step-up-10","delay-3","direct-plans"]));
      const f=(v:number)=>Number.isFinite(v)?Math.round(v):"INF";
      console.log(`base=${base} solvedAt=${base+3} three=${f(three.requiredMonthlyReal)} cur=${three.currentMonthlyReal} ratio=${Number.isFinite(three.requiredMonthlyReal)?(three.requiredMonthlyReal/three.currentMonthlyReal).toFixed(2):"-"}`);
    }
  });
});

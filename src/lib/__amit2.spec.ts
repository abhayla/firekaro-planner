import { describe, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { applyQuickAnswers } from "@/lib/quick-number";
import { emptyQuickAnswers, type QuickAnswers } from "@/types/quick-number";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";
import type { Household } from "@/types/household";
import { buildPlanLevers, applyPlanLevers, solvePlan, type PlanInputs, type PlanLeverKey } from "@/lib/lever-catalog";
const L = 1e5, CR = 1e7;
const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
const AMIT: QuickAnswers = { ...emptyQuickAnswers(38), guess: 10*CR, age: 38, targetAge: 50, spend: 1.8*L, income: 5*L, corpus: 80*L, directPlans: null, sip: 1.75*L, includeSpouse: true, spouseCorpus: 70*L, kids: 2, kidsAge: 6, education: 75*L, postgrad: 1.5*CR, wedding: 50*L, includeHouse: true, house: 1*CR, houseInYears: 6, hasLoan: true, emi: 1*L, loanRate: 0.072, loanYearsLeft: 7 };
function mk(targetAge: number): PlanInputs {
  setActivePinia(createPinia());
  const store = useHouseholdStore();
  const empty = JSON.parse(JSON.stringify(store.data)) as Household;
  const { household } = applyQuickAnswers(empty, AMIT, { assumptions: DEFAULT_ASSUMPTIONS, now: new Date("2026-08-27") });
  return { snapshot: household, assumptions: DEFAULT_ASSUMPTIONS, lens: LENS, targetAge };
}
describe("amit2", () => {
  it("scan", () => {
    const ALL: PlanLeverKey[] = ["step-up-10","delay-3","trim-expenses","direct-plans","no-prepay-roll-emi"];
    for (const t of [50, 53, 55, 58, 60]) {
      const plan = mk(t);
      const levers = buildPlanLevers({ plan, directPlans: null });
      const base = solvePlan(plan);
      const three = solvePlan(applyPlanLevers(plan, levers, ["step-up-10","delay-3","direct-plans"]));
      const all = solvePlan(applyPlanLevers(plan, levers, ALL));
      const f = (v:number)=>Number.isFinite(v)?Math.round(v):"UNREACHABLE";
      console.log(`target=${t} base=${f(base.requiredMonthlyReal)} three=${f(three.requiredMonthlyReal)} all=${f(all.requiredMonthlyReal)} cur=${base.currentMonthlyReal} pace=${base.paceFireAge}`);
    }
  });
});

import { describe, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { applyQuickAnswers } from "./quick-number";
import { emptyQuickAnswers, type QuickAnswers } from "@/types/quick-number";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";
import { derive } from "@/lib/derive";
import { requiredMonthlyContributionFor } from "@/lib/required-contribution";
import { useHouseholdStore } from "@/stores/household";
import type { Household } from "@/types/household";

const L = 1e5;
const CR = 1e7;
const NOW = new Date("2026-08-27T00:00:00.000Z");

const AMIT: QuickAnswers = {
  ...emptyQuickAnswers(38),
  guess: 10 * CR,
  age: 38,
  targetAge: 50,
  spend: 1.8 * L,
  income: 5 * L,
  corpus: 80 * L,
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

describe("amit probe", () => {
  it("prints the real numbers", () => {
    setActivePinia(createPinia());
    const store = useHouseholdStore();
    const r = applyQuickAnswers(JSON.parse(JSON.stringify(store.data)) as Household, AMIT, {
      assumptions: DEFAULT_ASSUMPTIONS,
      now: NOW,
    });
    store.replaceAll(r.household);
    store.autoFlowEMIToRecurring();
    store.autoFlowSalaryToEPF();
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2026-27" };
    const k = derive(store.data, DEFAULT_ASSUMPTIONS, lens);
    const req = requiredMonthlyContributionFor({
      snapshot: store.data,
      assumptions: DEFAULT_ASSUMPTIONS,
      lens,
      targetAge: 50,
    });
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ctc: r.salaryAnnualCTC,
          monthlyContribution: k.monthlyContribution,
          monthlyTakeHome: k.monthlyTakeHome,
          annualExpensesToday: k.annualExpensesToday,
          effectiveSWR: k.effectiveSWR,
          planToAge: k.planToAge,
          anchorAge: k.anchorAge,
          fireNumber: k.fireNumber,
          baseFireNumber: k.baseFireNumber,
          familyLayerCorpus: k.familyLayerCorpus,
          householdFireAge: k.householdFireAge,
          req,
        },
        null,
        1,
      ),
    );
  });
});

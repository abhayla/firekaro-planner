import { describe, it, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { applyQuickAnswers, QUICK_INVESTMENT_LABEL } from "./quick-number";
import { emptyQuickAnswers, type QuickAnswers } from "@/types/quick-number";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";
import { derive } from "@/lib/derive";
import { useHouseholdStore } from "@/stores/household";
import type { Household } from "@/types/household";

const NOW = new Date("2026-08-27T00:00:00.000Z");
const L = 1e5;
const CR = 1e7;

/** Amit from the reference video (FbYnFUwdODQ), answered through the ten cards. */
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

function emptyHouseholdFixture(): Household {
  setActivePinia(createPinia());
  const store = useHouseholdStore();
  return JSON.parse(JSON.stringify(store.data)) as Household;
}

function apply(answers: QuickAnswers = AMIT, previousCreatedIds?: string[]) {
  return applyQuickAnswers(emptyHouseholdFixture(), answers, {
    assumptions: DEFAULT_ASSUMPTIONS,
    now: NOW,
    previousCreatedIds,
  });
}

describe("applyQuickAnswers — people", () => {
  it("creates the adult with the stated age and target retirement age", () => {
    const { household } = apply();
    const adults = household.members.filter((m) => m.role === "ADULT");
    expect(adults.length).toBe(2); // self + spouse
    const self = adults[0];
    const birthYear = Number(self.dateOfBirth.slice(0, 4));
    expect(NOW.getFullYear() - birthYear).toBe(38);
    expect(self.targetRetirementAge).toBe(50);
  });

  it("omits the spouse when the spouse card is unticked", () => {
    const { household } = apply({ ...AMIT, includeSpouse: false });
    expect(household.members.filter((m) => m.role === "ADULT").length).toBe(1);
  });

  it("creates one DEPENDENT per kid with an age-derived education stage", () => {
    const { household } = apply();
    const kids = household.members.filter((m) => m.role === "DEPENDENT");
    expect(kids.length).toBe(2);
    expect(kids[0].educationStage).toBe("Primary"); // age 6
    const teen = apply({ ...AMIT, kidsAge: 15 }).household.members.find(
      (m) => m.role === "DEPENDENT",
    );
    expect(teen?.educationStage).toBe("Secondary");
  });
});

describe("applyQuickAnswers — money", () => {
  it("puts ALL investments on one quick line per adult, tagged so a re-run can find it", () => {
    const { household } = apply();
    const quickLines = household.investments.filter((i) => i.quickSource === true);
    expect(quickLines.length).toBe(2);
    expect(quickLines.map((i) => i.value).sort((a, b) => a - b)).toEqual([70 * L, 80 * L]);
    expect(quickLines[0].type).toBe("MutualFunds");
    expect(quickLines[0].label).toBe(QUICK_INVESTMENT_LABEL);
  });

  it("records the spend EXACTLY as answered and lets the loan auto-flow add the EMI once", () => {
    const { household } = apply();
    expect(household.expenses.avgMonthly).toBe(1.8 * L);
    const emiLines = household.expenses.recurring.filter((r) => r.source === "auto-loan");
    expect(emiLines.length).toBe(1);
    expect(emiLines[0].amount).toBe(1 * L);
    // The EMI must NOT also be inside avgMonthly — that is the double-count this guards.
    expect(household.expenses.avgMonthly).not.toBe(2.8 * L);
  });

  it("creates the home loan with the rate as a percent and an end year", () => {
    const { household } = apply();
    expect(household.liabilities.length).toBe(1);
    const loan = household.liabilities[0];
    expect(loan.type).toBe("HomeLoan");
    expect(loan.monthlyEMI).toBe(1 * L);
    expect(loan.interestRate).toBeCloseTo(7.2, 5);
    expect(loan.derivedEndYear).toBe(NOW.getFullYear() + 7);
  });

  it("creates no loan and no EMI line when the loan card is unticked", () => {
    const { household } = apply({ ...AMIT, hasLoan: false });
    expect(household.liabilities.length).toBe(0);
    expect(household.expenses.recurring.filter((r) => r.source === "auto-loan").length).toBe(0);
  });
});

describe("applyQuickAnswers — planned goals", () => {
  it("times education at 18, post-grad at 22 and weddings at 30", () => {
    const { household } = apply();
    const byKind = (kind: string, label: RegExp) =>
      household.expenses.plannedFuture.find((p) => p.kind === kind && label.test(p.label));
    const edu = byKind("education", /education/i)!;
    const pg = byKind("education", /post-grad/i)!;
    const wed = byKind("marriage", /wedding/i)!;
    expect(edu.targetYear).toBe(NOW.getFullYear() + 12); // 18 - 6
    expect(pg.targetYear).toBe(NOW.getFullYear() + 16);
    expect(wed.targetYear).toBe(NOW.getFullYear() + 24); // 30 - 6
    expect(edu.todayAmount).toBe(75 * L);
    expect(wed.todayAmount).toBe(50 * L);
  });

  it("records the big purchase as a general goal — which now moves the FIRE number (#165)", () => {
    const { household } = apply();
    const purchase = household.expenses.plannedFuture.find((p) => p.kind === "general")!;
    expect(purchase.todayAmount).toBe(1 * CR);
    expect(purchase.targetYear).toBe(NOW.getFullYear() + 6);
  });

  it("skips goal lines that were left at zero or unticked", () => {
    const { household } = apply({
      ...AMIT,
      includeHouse: false,
      postgrad: 0,
      kids: 0,
      education: 0,
      wedding: 0,
    });
    expect(household.expenses.plannedFuture.length).toBe(0);
  });
});

describe("applyQuickAnswers — the plan is anchored on what the user actually invests", () => {
  it("solves the salary so derive()'s monthly contribution matches the stated investing", () => {
    const { household, salaryAnnualCTC } = apply();
    expect(salaryAnnualCTC).toBeGreaterThan(0);
    const k = derive(household, DEFAULT_ASSUMPTIONS, {
      isFamilyView: false,
      viewingMemberId: null,
      currentFY: "2026-27",
    });
    // Within 5% of the stated 1.75 L/month — never ABOVE it (over-stating the pace is the
    // optimism error rule 31 exists to prevent).
    expect(k.monthlyContribution).toBeLessThanOrEqual(1.75 * L * 1.05);
    expect(k.monthlyContribution).toBeGreaterThanOrEqual(1.75 * L * 0.95);
  });

  it("produces a plausible headline — no NaN, no absurd age (rule 31)", () => {
    const { household } = apply();
    const k = derive(household, DEFAULT_ASSUMPTIONS, {
      isFamilyView: false,
      viewingMemberId: null,
      currentFY: "2026-27",
    });
    expect(Number.isNaN(k.fireNumber)).toBe(false);
    expect(k.fireNumber).toBeGreaterThan(1 * CR);
    expect(k.fireNumber).toBeLessThan(100 * CR);
    expect(k.annualExpensesToday).toBeGreaterThan(0);
  });

  it("never asks for more contribution than the user said, even with no income answer", () => {
    const { household } = apply({ ...AMIT, income: 0 });
    const k = derive(household, DEFAULT_ASSUMPTIONS, {
      isFamilyView: false,
      viewingMemberId: null,
      currentFY: "2026-27",
    });
    expect(k.monthlyContribution).toBeLessThanOrEqual(1.75 * L * 1.05);
  });
});

describe("applyQuickAnswers — idempotency", () => {
  it("a second run updates the same lines instead of duplicating them", () => {
    const first = apply();
    const second = applyQuickAnswers(first.household, { ...AMIT, corpus: 90 * L }, {
      assumptions: DEFAULT_ASSUMPTIONS,
      now: NOW,
      previousCreatedIds: first.createdIds,
    });
    expect(second.household.members.length).toBe(first.household.members.length);
    expect(second.household.investments.length).toBe(first.household.investments.length);
    expect(second.household.liabilities.length).toBe(first.household.liabilities.length);
    expect(second.household.expenses.plannedFuture.length).toBe(
      first.household.expenses.plannedFuture.length,
    );
    const quick = second.household.investments.filter((i) => i.quickSource === true);
    expect(quick.some((i) => i.value === 90 * L)).toBe(true);
  });

  it("returns every id it created so the ui.quick blob can find them again", () => {
    const { household, createdIds } = apply();
    expect(createdIds.length).toBeGreaterThan(0);
    const known = new Set([
      ...household.members.map((m) => m.id),
      ...household.investments.map((i) => i.id),
      ...household.liabilities.map((l) => l.id),
      ...household.expenses.plannedFuture.map((p) => p.id),
    ]);
    for (const id of createdIds) expect(known.has(id)).toBe(true);
  });
});

describe("applyQuickAnswers — through the real store (auto-flows included)", () => {
  it("survives replaceAll + the store's own auto-flows without duplicating the EMI line", () => {
    setActivePinia(createPinia());
    const store = useHouseholdStore();
    const { household } = applyQuickAnswers(
      JSON.parse(JSON.stringify(store.data)) as Household,
      AMIT,
      { assumptions: DEFAULT_ASSUMPTIONS, now: NOW },
    );
    store.replaceAll(household);
    store.autoFlowEMIToRecurring();
    store.autoFlowSalaryToEPF();
    const emiLines = store.data.expenses.recurring.filter((r) => r.source === "auto-loan");
    expect(emiLines.length).toBe(1);
    expect(store.data.expenses.avgMonthly).toBe(1.8 * L);
    const k = derive(store.data, DEFAULT_ASSUMPTIONS, {
      isFamilyView: false,
      viewingMemberId: null,
      currentFY: "2026-27",
    });
    expect(k.monthlyContribution).toBeLessThanOrEqual(1.75 * L * 1.05);
    expect(k.monthlyContribution).toBeGreaterThanOrEqual(1.75 * L * 0.95);
  });
});

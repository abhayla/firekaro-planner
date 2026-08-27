import { describe, it, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import {
  applyQuickAnswers,
  quickAnswersFromHousehold,
  QUICK_INVESTMENT_LABEL,
} from "./quick-number";
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

  // T-378C finding F2: the balance used to be the undiscounted sum of remaining payments
  // (emi * 12 * yearsLeft = ₹84L), a 28% over-statement of the real ₹65.8L PV-annuity principal
  // for a ₹1L EMI / 7.2% / 7yr loan — and it reached the user via the plan-baseline net worth.
  it("books the loan balance as the PV-annuity principal, not the undiscounted sum of payments", () => {
    const { household } = apply();
    const loan = household.liabilities[0];
    // Undiscounted sum would be 1L * 12 * 7 = 84L — must NOT equal that.
    expect(loan.outstandingBalance).not.toBeCloseTo(84 * L, -3);
    // The true PV-annuity principal at 7.2%/84 months is ~₹65.8L.
    expect(loan.outstandingBalance).toBeCloseTo(65.8 * L, -4);
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
      ...household.expenses.recurring.map((r) => r.id),
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

describe("applyQuickAnswers — the unaccounted rupee is spent, not deleted", () => {
  it("records take-home minus (spend + EMI + investing) as a visible expense line", () => {
    const { household, unaccountedMonthly } = apply();
    // 5.00 L take-home − 1.80 L spend − 1.00 L EMI − 1.75 L investing = 0.45 L unaccounted.
    expect(unaccountedMonthly).toBe(45_000);
    const line = household.expenses.recurring.find((r) => /Unaccounted/.test(r.label));
    expect(line, "the leak must be a line the user can see and edit").toBeTruthy();
    expect(line!.amount).toBe(45_000);
  });

  it("raises the FIRE number rather than flattering it — the leak is real spending", () => {
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2026-27" };
    const withLeak = derive(apply().household, DEFAULT_ASSUMPTIONS, lens);
    // The same answers with no stated take-home have no leak to reconcile.
    const noIncome = derive(apply({ ...AMIT, income: 0 }).household, DEFAULT_ASSUMPTIONS, lens);
    expect(withLeak.fireNumber).toBeGreaterThan(noIncome.fireNumber);
  });

  it("does not invent a leak when the answers already balance", () => {
    const { unaccountedMonthly, household } = apply({
      ...AMIT,
      income: 1.8 * L + 1 * L + 1.75 * L,
    });
    expect(unaccountedMonthly).toBe(0);
    expect(household.expenses.recurring.some((r) => /Unaccounted/.test(r.label))).toBe(false);
  });

  it("with nothing invested, the surplus is spending — not a silently assumed contribution", () => {
    const { household } = apply({ ...AMIT, sip: 0 });
    const k = derive(household, DEFAULT_ASSUMPTIONS, {
      isFamilyView: false,
      viewingMemberId: null,
      currentFY: "2026-27",
    });
    // The old fallback assumed every unspent rupee reached the market (~2.2 L/month here).
    expect(k.monthlyContribution).toBeLessThan(10_000);
  });
});

describe("applyQuickAnswers — re-entry safety", () => {
  it("keeps investments the user added by hand after the quick run", () => {
    const first = apply();
    const withManual: Household = {
      ...first.household,
      investments: [
        ...first.household.investments,
        {
          id: "inv-manual-1",
          type: "PPF",
          label: "My PPF",
          value: 12_00_000,
          ownerId: "quick-self",
        },
      ],
    };
    const second = applyQuickAnswers(withManual, AMIT, {
      assumptions: DEFAULT_ASSUMPTIONS,
      now: NOW,
      previousCreatedIds: first.createdIds,
    });
    expect(second.household.investments.some((i) => i.id === "inv-manual-1")).toBe(true);
  });

  it("clamps an absent or absurd age instead of anchoring the plan at zero", () => {
    const { household } = apply({ ...AMIT, age: undefined as unknown as number, targetAge: 200 });
    const self = household.members.find((m) => m.id === "quick-self")!;
    expect(NOW.getFullYear() - Number(self.dateOfBirth.slice(0, 4))).toBe(35);
    expect(self.targetRetirementAge).toBeLessThanOrEqual(75);
    expect(self.targetRetirementAge).toBeGreaterThan(35);
  });

  it("rebuilds the ten answers from the household a previous run wrote", () => {
    const { household } = apply();
    const back = quickAnswersFromHousehold(household, 10 * CR, NOW)!;
    expect(back).toBeTruthy();
    expect(back.age).toBe(38);
    expect(back.targetAge).toBe(50);
    expect(back.spend).toBe(1.8 * L);
    expect(back.corpus).toBe(80 * L);
    expect(back.includeSpouse).toBe(true);
    expect(back.spouseCorpus).toBe(70 * L);
    expect(back.kids).toBe(2);
    expect(back.kidsAge).toBe(6);
    expect(back.education).toBe(75 * L);
    expect(back.wedding).toBe(50 * L);
    expect(back.includeHouse).toBe(true);
    expect(back.hasLoan).toBe(true);
    expect(back.emi).toBe(1 * L);
    expect(back.loanRate).toBeCloseTo(0.072, 3);
    // The identity the mapping enforces: take-home = spend + EMI + investing + the leak.
    expect(back.income).toBe(5 * L);
    expect(back.sip).toBeCloseTo(1.75 * L, -3);
  });

  it("returns null for a household the express path never touched", () => {
    expect(quickAnswersFromHousehold(emptyHouseholdFixture(), 0, NOW)).toBeNull();
  });
});

describe("applyQuickAnswers — the minimal honest answer set", () => {
  // The express path promises "rough is fine": a single person with no spouse, no kids, no goals
  // and no loan who answers only age, target, spend and investing must still get a real number.
  const MINIMAL: QuickAnswers = {
    ...emptyQuickAnswers(30),
    age: 30,
    targetAge: 55,
    spend: 60_000,
    sip: 40_000,
    corpus: 20_00_000,
  };

  it("produces a plausible plan from four answers", () => {
    const { household } = apply(MINIMAL);
    expect(household.members.length).toBe(1);
    expect(household.expenses.plannedFuture.length).toBe(0);
    expect(household.liabilities.length).toBe(0);
    const k = derive(household, DEFAULT_ASSUMPTIONS, {
      isFamilyView: false,
      viewingMemberId: null,
      currentFY: "2026-27",
    });
    // 7.2 L/yr of spending at roughly a 3% horizon SWR is a low-two-digit-crore target — nowhere
    // near NaN, zero, or the tens of crores an absurd anchor age would produce (rule 31).
    expect(k.fireNumber).toBeGreaterThan(2 * CR);
    expect(k.fireNumber).toBeLessThan(15 * CR);
    expect(k.monthlyContribution).toBeGreaterThan(0);
    expect(Number.isFinite(k.householdFireAge ?? Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("invents no unaccounted spending when no take-home was given", () => {
    expect(apply(MINIMAL).unaccountedMonthly).toBeLessThanOrEqual(0);
    expect(
      apply(MINIMAL).household.expenses.recurring.some((r) => /Unaccounted/.test(r.label)),
    ).toBe(false);
  });
});

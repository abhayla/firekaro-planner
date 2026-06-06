import { describe, it, expect } from "vitest";
import type {
  Household,
  Member,
  Investment,
  Liability,
  RecurringExpenseLine,
} from "@planner/types/household";
import { diffHousehold, simulateApply } from "./household-diff";

// ----------------------------------------------------------------------------
// Fixtures — real shapes from mvp/src/types/household.ts (the Zod contract).
// No DB: the diff engine is a pure function over `Household` documents. These
// tests ARE the in-session persistence-correctness proof (goal contract §0.3:
// the live round-trip is Tier-2; this is its runnable substitute).
// ----------------------------------------------------------------------------

function makeMember(id: string, over: Partial<Member> = {}): Member {
  return {
    id,
    name: `Member ${id}`,
    dateOfBirth: "1985-01-01",
    role: "EARNER",
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
    ...over,
  };
}

function makeInvestment(id: string, over: Partial<Investment> = {}): Investment {
  return {
    id,
    type: "MutualFunds",
    value: 1_000_000,
    ownerId: "you",
    ...over,
  };
}

function makeLiability(id: string, over: Partial<Liability> = {}): Liability {
  return {
    id,
    name: `Loan ${id}`,
    type: "HomeLoan",
    outstandingBalance: 5_000_000,
    monthlyEMI: 45_000,
    interestRate: 8.5,
    ownerId: "you",
    isSharedWithSpouse: false,
    ...over,
  };
}

function makeRecurring(id: string, over: Partial<RecurringExpenseLine> = {}): RecurringExpenseLine {
  return {
    id,
    label: `Expense ${id}`,
    amount: 10_000,
    frequency: "M",
    source: "manual",
    ...over,
  };
}

function emptyHousehold(over: Partial<Household> = {}): Household {
  return {
    name: "Test",
    setupMode: "Couple",
    profileComplete: true,
    wizardCompleted: true,
    members: [],
    businesses: [],
    otherIncome: [],
    investments: [],
    liabilities: [],
    insurance: [],
    expenses: { avgMonthly: 50_000, recurring: [], plannedFuture: [] },
    ...over,
  };
}

/** Normalize for deep-equal: sort every array by its match key. */
function normalize(h: Household): Household {
  const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);
  return {
    ...h,
    members: [...h.members].sort(byId),
    businesses: [...h.businesses].sort(byId),
    otherIncome: [...h.otherIncome].sort(byId),
    investments: [...h.investments].sort(byId),
    liabilities: [...h.liabilities].sort(byId),
    insurance: [...h.insurance].sort(byId),
    expenses: {
      ...h.expenses,
      recurring: [...h.expenses.recurring].sort(byId),
      plannedFuture: [...h.expenses.plannedFuture].sort(byId),
    },
    // The DB has no "undefined" — an empty estate-checklist child table reads
    // back as []. The live store also backfills estateChecklist=[] on hydrate.
    // So canonicalize absent -> [] on both sides for the round-trip comparison.
    estateChecklist: [...(h.estateChecklist ?? [])].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

describe("diffHousehold — classification", () => {
  it("classifies an added member as an insert", () => {
    const current = emptyHousehold({ members: [makeMember("you")] });
    const incoming = emptyHousehold({ members: [makeMember("you"), makeMember("spouse")] });
    const plan = diffHousehold(current, incoming);
    expect(plan.members.inserts.map((m) => m.id)).toEqual(["spouse"]);
    expect(plan.members.deletes).toHaveLength(0);
    expect(plan.members.unchanged.map((m) => m.id)).toEqual(["you"]);
  });

  it("classifies a removed member as a delete (orphan cleanup)", () => {
    const current = emptyHousehold({ members: [makeMember("you"), makeMember("spouse")] });
    const incoming = emptyHousehold({ members: [makeMember("you")] });
    const plan = diffHousehold(current, incoming);
    expect(plan.members.deletes.map((m) => m.id)).toEqual(["spouse"]);
    expect(plan.members.inserts).toHaveLength(0);
  });

  it("classifies an edited investment subtypeData change as an update", () => {
    const current = emptyHousehold({
      investments: [makeInvestment("inv1", { units: 100, navPerUnit: 50 })],
    });
    const incoming = emptyHousehold({
      investments: [makeInvestment("inv1", { units: 200, navPerUnit: 55 })],
    });
    const plan = diffHousehold(current, incoming);
    expect(plan.investments.updates.map((i) => i.id)).toEqual(["inv1"]);
    expect(plan.investments.inserts).toHaveLength(0);
    expect(plan.investments.deletes).toHaveLength(0);
  });

  it("classifies a contributionSchedule change as an update; an identical one as unchanged (#46)", () => {
    const schedule = [{ amount: 25000, startAtAge: 30, stepUpPercentPerYear: 10 }];
    const current = emptyHousehold({
      investments: [makeInvestment("inv1", { contributionSchedule: schedule })],
    });
    // Identical (canonical) schedule → unchanged → zero writes (idempotent PUT).
    const same = emptyHousehold({
      investments: [makeInvestment("inv1", { contributionSchedule: [{ ...schedule[0] }] })],
    });
    const noChange = diffHousehold(current, same);
    expect(noChange.investments.updates).toHaveLength(0);
    expect(noChange.investments.unchanged.map((i) => i.id)).toEqual(["inv1"]);

    // A changed schedule → update.
    const changed = emptyHousehold({
      investments: [
        makeInvestment("inv1", {
          contributionSchedule: [{ amount: 25000, startAtAge: 30, stepUpPercentPerYear: 12 }],
        }),
      ],
    });
    const plan = diffHousehold(current, changed);
    expect(plan.investments.updates.map((i) => i.id)).toEqual(["inv1"]);
    expect(plan.investments.inserts).toHaveLength(0);
  });

  it("does NOT duplicate an auto-flow row that already exists (match by sourceRefId)", () => {
    // The store may regenerate the auto-loan recurring line with a NEW row id
    // but the SAME sourceRefId (pointing at the liability). Matching by
    // sourceRefId keeps it a single row (the ON CONFLICT(userId,sourceRefId) case).
    const current = emptyHousehold({
      expenses: {
        avgMonthly: 50_000,
        recurring: [makeRecurring("r-old", { source: "auto-loan", sourceRefId: "loan-1" })],
        plannedFuture: [],
      },
    });
    const incoming = emptyHousehold({
      expenses: {
        avgMonthly: 50_000,
        recurring: [makeRecurring("r-new", { source: "auto-loan", sourceRefId: "loan-1", amount: 46_000 })],
        plannedFuture: [],
      },
    });
    const plan = diffHousehold(current, incoming);
    // Matched by sourceRefId -> update (amount changed), NOT insert+delete.
    expect(plan.recurring.inserts).toHaveLength(0);
    expect(plan.recurring.deletes).toHaveLength(0);
    expect(plan.recurring.updates.map((r) => r.sourceRefId)).toEqual(["loan-1"]);
  });

  it("carries a 'Joint' ownerId through unchanged (no special handling, no FK assumption)", () => {
    const joint = makeLiability("loan-j", { ownerId: "Joint" });
    const current = emptyHousehold();
    const incoming = emptyHousehold({ liabilities: [joint] });
    const plan = diffHousehold(current, incoming);
    expect(plan.liabilities.inserts).toHaveLength(1);
    expect(plan.liabilities.inserts[0].ownerId).toBe("Joint");
  });

  it("empty -> full classifies everything as inserts", () => {
    const incoming = emptyHousehold({
      members: [makeMember("you"), makeMember("spouse")],
      investments: [makeInvestment("inv1")],
      liabilities: [makeLiability("loan1", { ownerId: "Joint" })],
    });
    const plan = diffHousehold(null, incoming);
    expect(plan.members.inserts).toHaveLength(2);
    expect(plan.investments.inserts).toHaveLength(1);
    expect(plan.liabilities.inserts).toHaveLength(1);
    expect(plan.members.deletes).toHaveLength(0);
  });

  it("full -> empty classifies everything as deletes", () => {
    const current = emptyHousehold({
      members: [makeMember("you")],
      investments: [makeInvestment("inv1")],
    });
    const incoming = emptyHousehold();
    const plan = diffHousehold(current, incoming);
    expect(plan.members.deletes).toHaveLength(1);
    expect(plan.investments.deletes).toHaveLength(1);
    expect(plan.members.inserts).toHaveLength(0);
  });

  it("identical input is a no-op (idempotency — Rule 26 / row-count stability)", () => {
    const h = emptyHousehold({
      members: [makeMember("you"), makeMember("spouse")],
      investments: [makeInvestment("inv1")],
      liabilities: [makeLiability("loan-j", { ownerId: "Joint" })],
      expenses: {
        avgMonthly: 50_000,
        recurring: [makeRecurring("r1", { source: "auto-loan", sourceRefId: "loan-1" })],
        plannedFuture: [],
      },
    });
    const plan = diffHousehold(h, h);
    expect(plan.configChanged).toBe(false);
    for (const d of [plan.members, plan.investments, plan.liabilities, plan.recurring]) {
      expect(d.inserts).toHaveLength(0);
      expect(d.updates).toHaveLength(0);
      expect(d.deletes).toHaveLength(0);
    }
  });

  it("detects a config scalar change", () => {
    const current = emptyHousehold({ expenses: { avgMonthly: 50_000, recurring: [], plannedFuture: [] } });
    const incoming = emptyHousehold({ expenses: { avgMonthly: 75_000, recurring: [], plannedFuture: [] } });
    const plan = diffHousehold(current, incoming);
    expect(plan.configChanged).toBe(true);
    expect(plan.config.expensesAvgMonthly).toBe(75_000);
  });
});

describe("simulateApply — PUT -> reconstruct fidelity (Rule 26, pure tier)", () => {
  const cases: Array<[string, Household | null, Household]> = [
    ["empty -> full", null, emptyHousehold({
      members: [makeMember("you"), makeMember("spouse", { role: "DEPENDENT" })],
      investments: [makeInvestment("inv1", { units: 100 })],
      liabilities: [makeLiability("loan-j", { ownerId: "Joint", coBorrowers: ["you", "spouse"] })],
      expenses: {
        avgMonthly: 60_000,
        recurring: [
          makeRecurring("r1"),
          makeRecurring("r2", { source: "auto-loan", sourceRefId: "loan-j" }),
        ],
        plannedFuture: [],
      },
      estateChecklist: [{ key: "will", completed: true }],
    })],
    ["full -> empty", emptyHousehold({ members: [makeMember("you")] }), emptyHousehold()],
    ["member add", emptyHousehold({ members: [makeMember("you")] }),
      emptyHousehold({ members: [makeMember("you"), makeMember("spouse")] })],
    ["member remove (orphan cleanup)",
      emptyHousehold({ members: [makeMember("you"), makeMember("spouse")] }),
      emptyHousehold({ members: [makeMember("you")] })],
    ["subtypeData edit",
      emptyHousehold({ investments: [makeInvestment("inv1", { units: 100 })] }),
      emptyHousehold({ investments: [makeInvestment("inv1", { units: 250 })] })],
  ];

  for (const [name, current, incoming] of cases) {
    it(`reconstructs deep-equal after apply: ${name}`, () => {
      const plan = diffHousehold(current, incoming);
      const result = simulateApply(current, plan);
      expect(normalize(result)).toEqual(normalize(incoming));
    });
  }

  it("apply is idempotent: applying the same plan twice yields the same household", () => {
    const current = emptyHousehold({ members: [makeMember("you")] });
    const incoming = emptyHousehold({ members: [makeMember("you"), makeMember("spouse")] });
    const plan = diffHousehold(current, incoming);
    const once = simulateApply(current, plan);
    const twice = simulateApply(once, diffHousehold(once, incoming));
    expect(normalize(twice)).toEqual(normalize(incoming));
  });
});

import { describe, it, expect } from "vitest";
import {
  EXPENSE_OWNER_HOUSEHOLD,
  EXPENSE_OWNER_DEPENDENTS,
  expenseRing,
  expenseOwnerMatches,
  buildExpenseOwnerOptions,
  expenseOwnerLabel,
  autoFlowOwnerId,
} from "@/lib/expense-attribution";
import type { Member } from "@/types/household";

function member(id: string, role: Member["role"]): Member {
  return {
    id,
    name: id,
    dateOfBirth: "1985-01-01",
    role,
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
  } as Member;
}

const adultA = member("m-adult-a", "ADULT");
const adultB = member("m-adult-b", "ADULT");
const child = member("m-child", "DEPENDENT");
const members = [adultA, adultB, child];

describe("expenseRing (#81 Phase 1 — canonical ring derivation)", () => {
  it("adult-member-owned → personal (ring 1)", () => {
    expect(expenseRing(adultA.id, members)).toBe("personal");
    expect(expenseRing(adultB.id, members)).toBe("personal");
  });
  it('"Household" sentinel → shared (ring 2)', () => {
    expect(expenseRing(EXPENSE_OWNER_HOUSEHOLD, members)).toBe("shared");
  });
  it("dependent-member-owned → dependents (ring 3)", () => {
    expect(expenseRing(child.id, members)).toBe("dependents");
  });
  it('"Dependents" sentinel → dependents (ring 3)', () => {
    expect(expenseRing(EXPENSE_OWNER_DEPENDENTS, members)).toBe("dependents");
  });
  it("unknown owner → shared (safe Household fallback, never crashes)", () => {
    expect(expenseRing("ghost-id", members)).toBe("shared");
  });
});

describe("expenseOwnerMatches (#81 Phase 1 — expense member-lens matcher)", () => {
  const lensA = new Set([adultA.id]);
  it("no lens → everything visible (consolidated)", () => {
    expect(expenseOwnerMatches(adultA.id, false, lensA)).toBe(true);
    expect(expenseOwnerMatches(adultB.id, false, lensA)).toBe(true);
    expect(expenseOwnerMatches(child.id, false, lensA)).toBe(true);
    expect(expenseOwnerMatches(EXPENSE_OWNER_HOUSEHOLD, false, lensA)).toBe(true);
  });
  it("lensed adult sees OWN + shared Household", () => {
    expect(expenseOwnerMatches(adultA.id, true, lensA)).toBe(true);
    expect(expenseOwnerMatches(EXPENSE_OWNER_HOUSEHOLD, true, lensA)).toBe(true);
  });
  it("lensed adult does NOT see the other adult's personal lines", () => {
    expect(expenseOwnerMatches(adultB.id, true, lensA)).toBe(false);
  });
  it('lensed adult does NOT see "Dependents"-tagged or a child\'s personal lines', () => {
    expect(expenseOwnerMatches(EXPENSE_OWNER_DEPENDENTS, true, lensA)).toBe(false);
    expect(expenseOwnerMatches(child.id, true, lensA)).toBe(false);
  });
});

describe("buildExpenseOwnerOptions (#81 Phase 1 — grouped owner picker)", () => {
  it("orders Household → adults → children → Kids(shared)", () => {
    const opts = buildExpenseOwnerOptions(members);
    expect(opts.map((o) => o.value)).toEqual([
      EXPENSE_OWNER_HOUSEHOLD,
      adultA.id,
      adultB.id,
      child.id,
      EXPENSE_OWNER_DEPENDENTS,
    ]);
  });
  it('omits "Kids (shared)" when there are no dependents', () => {
    const opts = buildExpenseOwnerOptions([adultA, adultB]);
    expect(opts.some((o) => o.value === EXPENSE_OWNER_DEPENDENTS)).toBe(false);
  });
});

describe("expenseOwnerLabel + autoFlowOwnerId", () => {
  it("labels sentinels + members", () => {
    expect(expenseOwnerLabel(undefined, members)).toBe("Household");
    expect(expenseOwnerLabel(EXPENSE_OWNER_HOUSEHOLD, members)).toBe("Household");
    expect(expenseOwnerLabel(EXPENSE_OWNER_DEPENDENTS, members)).toBe("Kids");
    expect(expenseOwnerLabel(adultA.id, members)).toBe(adultA.id); // name === id in fixture
  });
  it("auto-flow maps Joint → Household, keeps a member id", () => {
    expect(autoFlowOwnerId("Joint")).toBe(EXPENSE_OWNER_HOUSEHOLD);
    expect(autoFlowOwnerId(adultA.id)).toBe(adultA.id);
  });
});

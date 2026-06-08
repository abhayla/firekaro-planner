import { describe, it, expect } from "vitest";
import { isEarningMember } from "./member-earning";
import type { Member, Business } from "@/types/household";

// gh #67: earning is DERIVED from LABOUR income (salary OR active business), never a role flag.
// Capital income (rental/dividend/interest) does NOT make an adult an earner.

function adult(overrides: Partial<Member> = {}): Member {
  return {
    id: "a1",
    name: "Adult",
    dateOfBirth: "1988-01-01",
    role: "ADULT",
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
    ...overrides,
  };
}

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: "b1",
    name: "Biz",
    legalKind: "SoleProp",
    annualProfit: 500_000,
    frequency: "A",
    sharePercent: 100,
    ownerId: "a1",
    isOperated: true,
    ...overrides,
  };
}

describe("isEarningMember — earning derived from labour income (gh #67)", () => {
  it("TRUE for an adult with salary CTC > 0", () => {
    expect(isEarningMember(adult({ salary: { annualCTC: 1_200_000, hikePercent: 8 } }), [])).toBe(true);
  });

  it("TRUE for an adult who owns an active, profit-making business (no salary)", () => {
    expect(isEarningMember(adult({ id: "owner" }), [business({ ownerId: "owner" })])).toBe(true);
  });

  it("FALSE for an adult with ₹0 CTC and no business", () => {
    expect(isEarningMember(adult({ salary: { annualCTC: 0, hikePercent: 0 } }), [])).toBe(false);
    expect(isEarningMember(adult(), [])).toBe(false);
  });

  it("FALSE for a capital-income-only adult (a non-operated / zero-profit business does NOT count)", () => {
    // Owns a passive legal entity (isOperated:false) and a zero-profit business → still non-earning.
    expect(
      isEarningMember(adult({ id: "owner" }), [
        business({ ownerId: "owner", isOperated: false }),
        business({ id: "b2", ownerId: "owner", isOperated: true, annualProfit: 0 }),
      ]),
    ).toBe(false);
  });

  it("FALSE for a business owned by a DIFFERENT member", () => {
    expect(isEarningMember(adult({ id: "homemaker" }), [business({ ownerId: "earner" })])).toBe(false);
  });

  it("FALSE for a DEPENDENT even if salary data leaks in (dependents never earn labour income)", () => {
    expect(
      isEarningMember(adult({ role: "DEPENDENT", salary: { annualCTC: 1_000_000, hikePercent: 5 } }), []),
    ).toBe(false);
  });
});

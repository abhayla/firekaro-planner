import { describe, it, expect } from "vitest";
import {
  validateMemberHorizon,
  hasBlockingHorizonIssue,
} from "@/lib/member-horizon";

describe("validateMemberHorizon (A5.x)", () => {
  it("no issues for a healthy horizon (retire 50, plan-to 90 = 40 yrs)", () => {
    const issues = validateMemberHorizon({ retirementAge: 50, planToAge: 90 });
    expect(issues).toHaveLength(0);
  });

  it("returns nothing until a retirement age is set", () => {
    expect(validateMemberHorizon({ retirementAge: null, planToAge: 90 })).toHaveLength(0);
    expect(validateMemberHorizon({ retirementAge: undefined, planToAge: 90 })).toHaveLength(0);
  });

  it("BLOCKS planToAge <= retirementAge", () => {
    const issues = validateMemberHorizon({ retirementAge: 60, planToAge: 60 });
    expect(hasBlockingHorizonIssue(issues)).toBe(true);
    expect(issues[0].message).toMatch(/greater than the target retirement age/i);

    const below = validateMemberHorizon({ retirementAge: 60, planToAge: 55 });
    expect(hasBlockingHorizonIssue(below)).toBe(true);
  });

  it("BLOCKS a horizon under 5 years", () => {
    const issues = validateMemberHorizon({ retirementAge: 60, planToAge: 63 });
    expect(hasBlockingHorizonIssue(issues)).toBe(true);
    expect(issues.some((i) => /too short/i.test(i.message))).toBe(true);
  });

  it("SOFT-WARNS a horizon under 20 years (no block)", () => {
    const issues = validateMemberHorizon({ retirementAge: 60, planToAge: 75 });
    expect(hasBlockingHorizonIssue(issues)).toBe(false);
    expect(issues.some((i) => i.level === "warn" && /short horizon/i.test(i.message))).toBe(true);
  });

  it("SOFT-WARNS a horizon over 60 years (no block)", () => {
    const issues = validateMemberHorizon({ retirementAge: 40, planToAge: 105 });
    expect(hasBlockingHorizonIssue(issues)).toBe(false);
    expect(issues.some((i) => i.level === "warn" && /very long horizon/i.test(i.message))).toBe(true);
  });

  it("SOFT-WARNS retirementAge < 35", () => {
    const issues = validateMemberHorizon({ retirementAge: 32, planToAge: 90 });
    expect(hasBlockingHorizonIssue(issues)).toBe(false);
    expect(issues.some((i) => i.level === "warn" && /before 35/i.test(i.message))).toBe(true);
  });

  it("stacks the early-retirement warning with other checks (retire 30, plan-to 45 = 15 yrs)", () => {
    const issues = validateMemberHorizon({ retirementAge: 30, planToAge: 45 });
    // retire<35 warn + horizon<20 warn
    expect(issues.filter((i) => i.level === "warn")).toHaveLength(2);
    expect(hasBlockingHorizonIssue(issues)).toBe(false);
  });
});

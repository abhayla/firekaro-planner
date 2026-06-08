import { describe, it, expect } from "vitest";
import { finalizeMemberDraft } from "./member-draft";
import type { MemberDraft } from "@/types/household";

// gh #34/#67: the draft→Member finalizer gates fields by (role + DERIVED earning). The regressions
// these lock: (#34) a non-earning adult's planToAge MUST survive finalize (their longevity funds the
// household plan horizon); (#67) retire-from-job age + employmentStatus render ONLY for an earning
// adult, never on a manual role flag.

function draft(overrides: Partial<MemberDraft>): MemberDraft {
  return {
    id: "m1",
    name: "",
    dateOfBirth: "1988-01-01",
    role: "ADULT",
    isEarning: true,
    targetRetirementAge: 55,
    planToAge: 92,
    relation: "",
    city: "Metro",
    health: "Healthy",
    educationStage: null,
    riskAppetite: "Moderate",
    marital: "Married",
    employmentStatus: "Employed",
    ...overrides,
  };
}

describe("finalizeMemberDraft — role + earning-gated fields", () => {
  it("an EARNING adult keeps retire-age + employmentStatus + planToAge", () => {
    const p = finalizeMemberDraft(draft({ role: "ADULT", isEarning: true, planToAge: 90 }));
    expect(p.role).toBe("ADULT");
    expect(p.planToAge).toBe(90);
    expect(p.targetRetirementAge).toBe(55);
    expect(p.employmentStatus).toBe("Employed");
    expect(p.educationStage).toBeUndefined();
  });

  // gh #34 + #67: a non-earning adult RETAINS planToAge (the survivor-years longevity) but carries
  // NO retire-from-job age / employmentStatus (those follow income, which they don't have).
  it("a NON-EARNING adult RETAINS planToAge but drops retire-age + employmentStatus", () => {
    const p = finalizeMemberDraft(
      draft({ role: "ADULT", isEarning: false, planToAge: 95, employmentStatus: null }),
    );
    expect(p.role).toBe("ADULT");
    expect(p.planToAge).toBe(95); // ← the longevity that funds the survivor years
    expect(p.targetRetirementAge).toBeUndefined(); // no retirement-from-a-job
    expect(p.employmentStatus).toBeUndefined();
    expect(p.educationStage).toBeUndefined(); // not a child
  });

  it("a non-earning adult with no entered planToAge defaults to 90 (an adult horizon, not dropped)", () => {
    const p = finalizeMemberDraft(draft({ role: "ADULT", isEarning: false, planToAge: null }));
    expect(p.planToAge).toBe(90);
  });

  it("DEPENDENT (child) drops planToAge + salary fields, keeps educationStage", () => {
    const p = finalizeMemberDraft(
      draft({ role: "DEPENDENT", isEarning: false, planToAge: 88, educationStage: "Primary", employmentStatus: null }),
    );
    expect(p.role).toBe("DEPENDENT");
    expect(p.planToAge).toBeUndefined(); // a child has no plan-to age
    expect(p.educationStage).toBe("Primary");
    expect(p.targetRetirementAge).toBeUndefined();
    expect(p.employmentStatus).toBeUndefined();
  });

  it("fills a role-appropriate fallback name when the name is blank", () => {
    expect(finalizeMemberDraft(draft({ role: "ADULT", name: "" })).name).toBe("Adult");
    expect(finalizeMemberDraft(draft({ role: "DEPENDENT", name: "" })).name).toBe("Dependent");
  });
});

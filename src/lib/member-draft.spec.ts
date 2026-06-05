import { describe, it, expect } from "vitest";
import { finalizeMemberDraft } from "./member-draft";
import type { MemberDraft } from "@/types/household";

// gh #34: the draft→Member finalizer gates fields by role. The regression these lock is the
// original bug — the save paths wiped planToAge for any non-EARNER, dropping a homemaker
// spouse's longevity (which the household plan horizon needs).

function draft(overrides: Partial<MemberDraft>): MemberDraft {
  return {
    id: "m1",
    name: "",
    dateOfBirth: "1988-01-01",
    role: "EARNER",
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

describe("finalizeMemberDraft — role-gated fields", () => {
  it("EARNER keeps salary-side fields + planToAge", () => {
    const p = finalizeMemberDraft(draft({ role: "EARNER", planToAge: 90 }));
    expect(p.role).toBe("EARNER");
    expect(p.planToAge).toBe(90);
    expect(p.targetRetirementAge).toBe(55);
    expect(p.employmentStatus).toBe("Employed");
    expect(p.educationStage).toBeUndefined();
  });

  // The exact gh #34 bug: a NON_EARNING_ADULT's planToAge MUST survive finalize (it was
  // previously wiped because the gate was role === "EARNER", not isAdultRole).
  it("NON_EARNING_ADULT RETAINS planToAge but drops salary-side fields", () => {
    const p = finalizeMemberDraft(
      draft({ role: "NON_EARNING_ADULT", planToAge: 95, employmentStatus: null }),
    );
    expect(p.role).toBe("NON_EARNING_ADULT");
    expect(p.planToAge).toBe(95); // ← the longevity that funds the survivor years
    expect(p.targetRetirementAge).toBeUndefined(); // no retirement-from-a-job
    expect(p.employmentStatus).toBeUndefined();
    expect(p.educationStage).toBeUndefined(); // not a child
  });

  it("a NON_EARNING_ADULT with no entered planToAge defaults to 90 (an adult horizon, not dropped)", () => {
    const p = finalizeMemberDraft(draft({ role: "NON_EARNING_ADULT", planToAge: null }));
    expect(p.planToAge).toBe(90);
  });

  it("DEPENDENT (child) drops planToAge + salary fields, keeps educationStage", () => {
    const p = finalizeMemberDraft(
      draft({ role: "DEPENDENT", planToAge: 88, educationStage: "Primary", employmentStatus: null }),
    );
    expect(p.role).toBe("DEPENDENT");
    expect(p.planToAge).toBeUndefined(); // a child has no plan-to age
    expect(p.educationStage).toBe("Primary");
    expect(p.targetRetirementAge).toBeUndefined();
    expect(p.employmentStatus).toBeUndefined();
  });

  it("fills a role-appropriate fallback name when the name is blank", () => {
    expect(finalizeMemberDraft(draft({ role: "EARNER", name: "" })).name).toBe("Earner");
    expect(finalizeMemberDraft(draft({ role: "NON_EARNING_ADULT", name: "" })).name).toBe("Spouse");
    expect(finalizeMemberDraft(draft({ role: "DEPENDENT", name: "" })).name).toBe("Dependent");
  });
});

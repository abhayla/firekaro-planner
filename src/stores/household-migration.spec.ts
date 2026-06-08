import { describe, it, expect } from "vitest";
import { migrateRole, migrateMember, type LegacyMember } from "./household";
import { isEarningMember } from "@/lib/member-earning";
import { derive } from "@/lib/derive";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";
import type { Household, Member } from "@/types/household";

// gh #67 migration lock: live households carry the retired "EARNER" / "NON_EARNING_ADULT" role flag.
// migrate-on-hydrate MUST collapse them to "ADULT" (earning then DERIVED from income) AND the FIRE
// number/age must stay BYTE-IDENTICAL — a migrated EARNER with salary derives isEarning=true (same
// earner set as before), a migrated NON_EARNING_ADULT derives isEarning=false.

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

describe("migrateRole — collapse retired roles to ADULT (gh #67)", () => {
  it("EARNER → ADULT", () => expect(migrateRole("EARNER")).toBe("ADULT"));
  it("NON_EARNING_ADULT → ADULT", () => expect(migrateRole("NON_EARNING_ADULT")).toBe("ADULT"));
  it("DEPENDENT → DEPENDENT (unchanged)", () => expect(migrateRole("DEPENDENT")).toBe("DEPENDENT"));
  it("unknown legacy value → ADULT (safe adult default)", () => expect(migrateRole("WHATEVER")).toBe("ADULT"));
});

describe("migrateMember — derived earning preserved across the role collapse (gh #67)", () => {
  it("a legacy EARNER with salary → ADULT that derives isEarning=true", () => {
    const legacy: LegacyMember = {
      id: "you", name: "You", dateOfBirth: "1986-01-01", role: "EARNER",
      targetRetirementAge: 55, planToAge: 88, salary: { annualCTC: 3_000_000, hikePercent: 8 },
    };
    const m = migrateMember(legacy);
    expect(m.role).toBe("ADULT");
    expect(m.targetRetirementAge).toBe(55);
    expect(m.planToAge).toBe(88);
    expect(isEarningMember(m, [])).toBe(true);
  });

  it("a legacy NON_EARNING_ADULT (no salary) → ADULT that derives isEarning=false, keeps planToAge", () => {
    const legacy: LegacyMember = {
      id: "spouse", name: "Spouse", dateOfBirth: "1988-01-01", role: "NON_EARNING_ADULT", planToAge: 95,
    };
    const m = migrateMember(legacy);
    expect(m.role).toBe("ADULT");
    expect(m.planToAge).toBe(95); // longevity preserved (gh #34)
    expect(m.employmentStatus).toBeUndefined(); // no fabricated job
    expect(isEarningMember(m, [])).toBe(false);
  });

  it("a legacy DEPENDENT → DEPENDENT, never earning", () => {
    const m = migrateMember({ id: "kid", name: "Kid", dateOfBirth: "2014-01-01", role: "DEPENDENT" });
    expect(m.role).toBe("DEPENDENT");
    expect(isEarningMember(m, [])).toBe(false);
  });
});

describe("migration FIRE byte-identical lock (gh #67)", () => {
  it("a household migrated from legacy roles has the SAME FIRE number/age as the native-ADULT household", () => {
    // Same household, two ways: legacy roles run through migrateMember, vs authored directly as ADULT.
    const legacyMembers: LegacyMember[] = [
      { id: "you", name: "You", dateOfBirth: "1986-01-01", role: "EARNER",
        targetRetirementAge: 55, planToAge: 85, salary: { annualCTC: 3_000_000, hikePercent: 8 },
        city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married", employmentStatus: "Employed" },
      { id: "spouse", name: "Spouse", dateOfBirth: "1988-01-01", role: "NON_EARNING_ADULT",
        planToAge: 95, city: "Metro", health: "Healthy", riskAppetite: "Conservative", marital: "Married" },
      { id: "kid", name: "Kid", dateOfBirth: "2014-01-01", role: "DEPENDENT",
        city: "Metro", health: "Healthy", riskAppetite: "Conservative", marital: "Single", educationStage: "Primary" },
    ];
    const migrated = legacyMembers.map(migrateMember);

    const native: Member[] = migrated.map((m) => ({ ...m })); // identical post-migration shape

    const base: Omit<Household, "members"> = {
      name: "T", setupMode: "Couple+Children", profileComplete: true, wizardCompleted: true,
      businesses: [], otherIncome: [], investments: [], liabilities: [], insurance: [],
      expenses: { avgMonthly: 80_000, recurring: [], plannedFuture: [] },
    };

    const kMigrated = derive({ ...base, members: migrated }, DEFAULT_ASSUMPTIONS, LENS);
    const kNative = derive({ ...base, members: native }, DEFAULT_ASSUMPTIONS, LENS);

    // The migration preserves the earner set + every projection input, so the headline is identical.
    expect(kMigrated.fireNumber).toBe(kNative.fireNumber);
    expect(kMigrated.yearsToRegular).toBe(kNative.yearsToRegular);
    expect(kMigrated.planToAge).toBe(95); // the non-earning spouse's longevity drives the horizon
    expect(kMigrated.lensedEarners.length).toBe(1); // only the salaried adult derives as an earner
  });
});

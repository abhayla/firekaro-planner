// Single source of truth for turning a mid-edit MemberDraft into the persisted
// Member patch — shared by the onboarding wizard (ProfileStep.vue) and the profile
// page (profile/Index.vue), which previously carried copy-pasted, drift-prone logic.
//
// gh #34: the field gating is BY ROLE and must be coherent:
//   - targetRetirementAge / employmentStatus / salary → EARNER only (retiring from a job).
//   - planToAge (longevity) → every ADULT (EARNER + NON_EARNING_ADULT). The old logic kept
//     planToAge for EARNER only, silently dropping a non-earning spouse's longevity, so the
//     household plan horizon (derive.ts) under-provisioned a surviving homemaker.
//   - educationStage → DEPENDENT (child) only.
import { isAdultRole, type MemberDraft, type MemberRole } from "@/types/household";

function fallbackName(role: MemberRole): string {
  if (role === "EARNER") return "Earner";
  if (role === "NON_EARNING_ADULT") return "Spouse"; // matches MembersForm.addPerson default
  return "Dependent";
}

/**
 * Build the persisted-Member field patch from a draft, gating each field by role.
 * Returned shape matches what household.updateMember / addMember accept.
 */
export function finalizeMemberDraft(m: MemberDraft) {
  const adult = isAdultRole(m.role);
  return {
    name: m.name || fallbackName(m.role),
    dateOfBirth: m.dateOfBirth,
    role: m.role,
    targetRetirementAge: m.role === "EARNER" ? (m.targetRetirementAge ?? 50) : undefined,
    // gh #34: adults (incl. a non-earning spouse) keep their plan-to age; children don't have one.
    planToAge: adult ? (m.planToAge ?? 90) : undefined,
    relation: m.relation || undefined,
    city: m.city,
    health: m.health,
    educationStage: m.role === "DEPENDENT" ? (m.educationStage ?? undefined) : undefined,
    riskAppetite: m.riskAppetite,
    marital: m.marital,
    employmentStatus: m.role === "EARNER" ? (m.employmentStatus ?? undefined) : undefined,
  };
}

// Single source of truth for turning a mid-edit MemberDraft into the persisted
// Member patch — shared by the onboarding wizard (ProfileStep.vue) and the profile
// page (profile/Index.vue), which previously carried copy-pasted, drift-prone logic.
//
// gh #67: field gating is now BY (role + DERIVED earning), never a manual earner flag:
//   - targetRetirementAge / employmentStatus → only when the adult is EARNING (has labour income).
//     A non-earning adult (homemaker / career break) shows no retire-from-job age. (gh #67 Q3.)
//   - planToAge (longevity) → every ADULT (earning or not). The old logic kept planToAge for earners
//     only, silently dropping a non-earning spouse's longevity, so the household plan horizon
//     (derive.ts) under-provisioned a surviving homemaker (gh #34).
//   - educationStage → DEPENDENT (child) only.
import { isAdultRole, type MemberDraft, type MemberRole } from "@/types/household";

function fallbackName(role: MemberRole): string {
  if (role === "ADULT") return "Adult";
  return "Dependent";
}

/**
 * Build the persisted-Member field patch from a draft, gating each field by role.
 * Returned shape matches what household.updateMember / addMember accept.
 */
export function finalizeMemberDraft(m: MemberDraft) {
  const adult = isAdultRole(m.role);
  // gh #67: an earning adult keeps retire-from-job age + employmentStatus; a non-earning adult
  // (or dependent) carries neither. `isEarning` is the derived projection set on the draft at load.
  const earning = adult && m.isEarning;
  return {
    name: m.name || fallbackName(m.role),
    dateOfBirth: m.dateOfBirth,
    role: m.role,
    targetRetirementAge: earning ? (m.targetRetirementAge ?? 50) : undefined,
    // gh #34: adults (incl. a non-earning spouse) keep their plan-to age; children don't have one.
    planToAge: adult ? (m.planToAge ?? 90) : undefined,
    relation: m.relation || undefined,
    city: m.city,
    health: m.health,
    educationStage: m.role === "DEPENDENT" ? (m.educationStage ?? undefined) : undefined,
    riskAppetite: m.riskAppetite,
    marital: m.marital,
    employmentStatus: earning ? (m.employmentStatus ?? undefined) : undefined,
  };
}

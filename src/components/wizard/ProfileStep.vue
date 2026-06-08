<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useHouseholdStore } from "@/stores/household";
import type { MemberDraft, SetupMode, MemberRole } from "@/types/household";
import { ageFromDOB, dobFromAge } from "@/lib/age";
import { finalizeMemberDraft } from "@/lib/member-draft";
import { isEarningMember } from "@/lib/member-earning";
import { validateMemberHorizon, hasBlockingHorizonIssue } from "@/lib/member-horizon";
import HouseholdSetupForm from "@/components/forms/HouseholdSetupForm.vue";
import MembersForm from "@/components/forms/MembersForm.vue";

const household = useHouseholdStore();

const setupMode = ref<SetupMode>(household.data.setupMode ?? "Couple+Children");
const householdName = ref(household.data.name);

const draftMembers = ref<MemberDraft[]>(membersFromStore());

// Q2.1 — sensible role-aware defaults so the wizard never blocks on the 6 new fields.
// Earners default to Married/Employed; dependents (children) default to Single/Preschool.
function defaultsForRole(role: MemberRole): Pick<
  MemberDraft,
  "city" | "health" | "educationStage" | "riskAppetite" | "marital" | "employmentStatus"
> {
  if (role === "ADULT") {
    // gh #67: a fresh adult is non-earning until salary is added on the Income screen → no job yet.
    return {
      city: "Metro",
      health: "Healthy",
      educationStage: null,
      riskAppetite: "Moderate",
      marital: "Married",
      employmentStatus: null,
    };
  }
  return {
    city: "Metro",
    health: "Healthy",
    educationStage: "Preschool",
    riskAppetite: "Conservative",
    marital: "Single",
    employmentStatus: null,
  };
}

function membersFromStore(): MemberDraft[] {
  if (household.members.length > 0) {
    return household.members.map((m) => ({
      id: m.id,
      name: m.name,
      dateOfBirth: m.dateOfBirth,
      role: m.role,
      // gh #67: earning is DERIVED from the committed member's labour income, not a stored flag.
      isEarning: isEarningMember(m, household.data.businesses),
      targetRetirementAge: m.targetRetirementAge ?? null,
      planToAge: m.planToAge ?? null,
      relation: m.relation ?? "",
      city: m.city,
      health: m.health,
      educationStage: m.educationStage ?? null,
      riskAppetite: m.riskAppetite,
      marital: m.marital,
      employmentStatus: m.employmentStatus ?? null,
    }));
  }
  return defaultsForMode(setupMode.value);
}

function defaultsForMode(mode: SetupMode): MemberDraft[] {
  const adultDOB = dobFromAge(30);
  const childDOB = dobFromAge(5);
  // gh #67: fresh adults are non-earning (isEarning:false) until salary is added on the Income step.
  const adult = (id: string, name: string, relation: string): MemberDraft => ({
    id, name, dateOfBirth: adultDOB, role: "ADULT", isEarning: false,
    targetRetirementAge: null, planToAge: 90, relation, ...defaultsForRole("ADULT"),
  });
  switch (mode) {
    case "Solo":
      return [adult("you", "You", "")];
    case "Couple":
      return [adult("you", "You", ""), adult("spouse", "Spouse", "Spouse")];
    case "Couple+Children":
      return [
        adult("you", "You", ""),
        adult("spouse", "Spouse", "Spouse"),
        { id: "child1", name: "Child", dateOfBirth: childDOB, role: "DEPENDENT", isEarning: false, targetRetirementAge: null, planToAge: null, relation: "Child", ...defaultsForRole("DEPENDENT") },
      ];
    case "Custom":
    default:
      return [adult("you", "You", "")];
  }
}

watch(setupMode, (mode) => {
  // Reset draft to defaults only when there are no existing committed members.
  // Preserves user edits when they cycle setup-mode mid-edit.
  if (household.members.length === 0) {
    draftMembers.value = defaultsForMode(mode);
  }
});

// gh #67: a household needs ≥1 ADULT (earning is established later via income, not at profile time).
const adultCount = computed(() => draftMembers.value.filter((m) => m.role === "ADULT").length);

// Q2 — validate via DOB-derived age instead of stored age. Bounds: 0–120 inclusive.
const canSave = computed(() => {
  if (adultCount.value === 0) return false;
  return draftMembers.value.every((m) => {
    const validDOB = /^\d{4}-\d{2}-\d{2}$/.test(m.dateOfBirth) && ageFromDOB(m.dateOfBirth) <= 120;
    if (!validDOB) return false;
    // Retire-from-job age only applies to an EARNING adult; a non-earning adult has none yet.
    if (m.role === "ADULT" && m.isEarning) {
      if (typeof m.targetRetirementAge !== "number" || m.targetRetirementAge < 30) return false;
      // A5.x — block proceed on any blocking horizon issue (plan-to ≤ retire, horizon < 5).
      if (
        hasBlockingHorizonIssue(
          validateMemberHorizon({ retirementAge: m.targetRetirementAge, planToAge: m.planToAge }),
        )
      ) {
        return false;
      }
    }
    return true;
  });
});

function saveProfile() {
  if (!canSave.value) return;
  // Preserve existing salary on retained members; only remove members the draft drops.
  const existingSalaryById = new Map(
    household.data.members.map((m) => [m.id, m.salary] as const),
  );
  const draftIds = new Set(draftMembers.value.map((m) => m.id));

  for (const m of [...household.data.members]) {
    if (!draftIds.has(m.id)) household.removeMember(m.id);
  }

  for (const m of draftMembers.value) {
    const existing = household.data.members.find((x) => x.id === m.id);
    const patch = finalizeMemberDraft(m);

    if (existing) {
      household.updateMember(m.id, patch);
    } else {
      household.addMember({
        id: m.id,
        ...patch,
        salary: existingSalaryById.get(m.id),
      });
    }
  }
  household.setSetupMode(setupMode.value);
  household.setHouseholdName(householdName.value);
  household.markProfileComplete();
  household.autoFlowSalaryToEPF();
}
</script>

<template>
  <div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Tell us about your household. Profile is required — age + target retirement age drive every projection downstream.
    </p>

    <HouseholdSetupForm v-model:setup-mode="setupMode" v-model:household-name="householdName" />

    <v-divider class="my-4" />

    <MembersForm v-model:members="draftMembers" />

    <v-divider class="my-4" />

    <div class="d-flex align-center justify-end">
      <v-btn
        color="primary"
        variant="flat"
        :disabled="!canSave"
        @click="saveProfile"
      >
        <v-icon icon="mdi-content-save" class="mr-1" />
        Save profile
      </v-btn>
    </div>

    <v-alert
      v-if="household.profileComplete"
      type="success"
      density="compact"
      variant="tonal"
      class="mt-3"
    >
      Profile saved. You can now move to the next step.
    </v-alert>
  </div>
</template>

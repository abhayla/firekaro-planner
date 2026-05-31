<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useHouseholdStore } from "@/stores/household";
import type { MemberDraft, SetupMode, MemberRole } from "@/types/household";
import { ageFromDOB, dobFromAge } from "@/lib/age";
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
  if (role === "EARNER") {
    return {
      city: "Metro",
      health: "Healthy",
      educationStage: null,
      riskAppetite: "Moderate",
      marital: "Married",
      employmentStatus: "Employed",
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
  const earnerDOB = dobFromAge(30);
  const childDOB = dobFromAge(5);
  switch (mode) {
    case "Solo":
      return [
        { id: "you", name: "You", dateOfBirth: earnerDOB, role: "EARNER", targetRetirementAge: 50, planToAge: 90, relation: "", ...defaultsForRole("EARNER") },
      ];
    case "Couple":
      return [
        { id: "you", name: "You", dateOfBirth: earnerDOB, role: "EARNER", targetRetirementAge: 50, planToAge: 90, relation: "", ...defaultsForRole("EARNER") },
        { id: "spouse", name: "Spouse", dateOfBirth: earnerDOB, role: "EARNER", targetRetirementAge: 50, planToAge: 90, relation: "Spouse", ...defaultsForRole("EARNER") },
      ];
    case "Couple+Children":
      return [
        { id: "you", name: "You", dateOfBirth: earnerDOB, role: "EARNER", targetRetirementAge: 50, planToAge: 90, relation: "", ...defaultsForRole("EARNER") },
        { id: "spouse", name: "Spouse", dateOfBirth: earnerDOB, role: "EARNER", targetRetirementAge: 50, planToAge: 90, relation: "Spouse", ...defaultsForRole("EARNER") },
        { id: "child1", name: "Child", dateOfBirth: childDOB, role: "DEPENDENT", targetRetirementAge: null, planToAge: null, relation: "Child", ...defaultsForRole("DEPENDENT") },
      ];
    case "Custom":
    default:
      return [
        { id: "you", name: "You", dateOfBirth: earnerDOB, role: "EARNER", targetRetirementAge: 50, planToAge: 90, relation: "", ...defaultsForRole("EARNER") },
      ];
  }
}

watch(setupMode, (mode) => {
  // Reset draft to defaults only when there are no existing committed members.
  // Preserves user edits when they cycle setup-mode mid-edit.
  if (household.members.length === 0) {
    draftMembers.value = defaultsForMode(mode);
  }
});

const earnerCount = computed(() => draftMembers.value.filter((m) => m.role === "EARNER").length);

// Q2 — validate via DOB-derived age instead of stored age. Bounds: 0–120 inclusive.
const canSave = computed(() => {
  if (earnerCount.value === 0) return false;
  return draftMembers.value.every((m) => {
    const validDOB = /^\d{4}-\d{2}-\d{2}$/.test(m.dateOfBirth) && ageFromDOB(m.dateOfBirth) <= 120;
    if (!validDOB) return false;
    if (m.role === "EARNER" && (typeof m.targetRetirementAge !== "number" || m.targetRetirementAge < 30)) {
      return false;
    }
    // A5.x — block proceed on any blocking horizon issue (plan-to ≤ retire, horizon < 5).
    if (
      m.role === "EARNER" &&
      hasBlockingHorizonIssue(
        validateMemberHorizon({ retirementAge: m.targetRetirementAge, planToAge: m.planToAge }),
      )
    ) {
      return false;
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
    const patch = {
      name: m.name || (m.role === "EARNER" ? "Earner" : "Dependent"),
      dateOfBirth: m.dateOfBirth,
      role: m.role,
      targetRetirementAge: m.role === "EARNER" ? (m.targetRetirementAge ?? 50) : undefined,
      planToAge: m.role === "EARNER" ? (m.planToAge ?? 90) : undefined,
      relation: m.relation || undefined,
      city: m.city,
      health: m.health,
      educationStage: m.role === "DEPENDENT" ? (m.educationStage ?? undefined) : undefined,
      riskAppetite: m.riskAppetite,
      marital: m.marital,
      employmentStatus: m.role === "EARNER" ? (m.employmentStatus ?? undefined) : undefined,
    };

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

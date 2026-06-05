<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useHouseholdStore } from "@/stores/household";
import type { MemberDraft, SetupMode } from "@/types/household";
import { ageFromDOB } from "@/lib/age";
import { finalizeMemberDraft } from "@/lib/member-draft";
import { formatINRCompact } from "@/lib/formatters";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import HouseholdSetupForm from "@/components/forms/HouseholdSetupForm.vue";
import MembersForm from "@/components/forms/MembersForm.vue";

const household = useHouseholdStore();

// Q1 (v3) — full members CRUD as a dedicated sidebar route. Mirrors ProfileStep.vue
// shape, except saves auto-persist on change (no Save button).
const setupMode = ref<SetupMode>(household.data.setupMode ?? "Solo");
const householdName = ref(household.data.name);
const draftMembers = ref<MemberDraft[]>(membersFromStore());

function membersFromStore(): MemberDraft[] {
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

const lastSavedTick = ref<number | null>(null);
const justSaved = computed(() => {
  if (!lastSavedTick.value) return false;
  return Date.now() - lastSavedTick.value < 2500;
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistDraft() {
  // Same logic as ProfileStep.saveProfile, factored to run on every change.
  const existingSalaryById = new Map(
    household.data.members.map((m) => [m.id, m.salary] as const),
  );
  const draftIds = new Set(draftMembers.value.map((m) => m.id));
  for (const m of [...household.data.members]) {
    if (!draftIds.has(m.id)) household.removeMember(m.id);
  }
  for (const m of draftMembers.value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.dateOfBirth)) continue;
    const existing = household.data.members.find((x) => x.id === m.id);
    const patch = finalizeMemberDraft(m);
    if (existing) {
      household.updateMember(m.id, patch);
    } else {
      household.addMember({ id: m.id, ...patch, salary: existingSalaryById.get(m.id) });
    }
  }
  household.setSetupMode(setupMode.value);
  household.setHouseholdName(householdName.value);
  household.markProfileComplete();
  household.autoFlowSalaryToEPF();
  lastSavedTick.value = Date.now();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  // Debounce so rapid typing doesn't thrash the store; "on blur" feel without manual blur events.
  saveTimer = setTimeout(persistDraft, 400);
}

watch([setupMode, householdName, draftMembers], scheduleSave, { deep: true });

// Reflect store edits made elsewhere (e.g. Salary's "+ Add earner" shortcut) back into the draft.
watch(
  () => household.members.map((m) => m.id).join("|"),
  () => {
    draftMembers.value = membersFromStore();
  },
);

// ───── Household summary strip (at-a-glance anchor) ─────
const draftEarners = computed(() => draftMembers.value.filter((m) => m.role === "EARNER"));
const earnerCount = computed(() => draftEarners.value.length);
const nonEarningAdultCount = computed(
  () => draftMembers.value.filter((m) => m.role === "NON_EARNING_ADULT").length,
);
const dependentCount = computed(() => draftMembers.value.filter((m) => m.role === "DEPENDENT").length);
const primaryEarner = computed(() => draftEarners.value[0] ?? null);
const earliestRetirement = computed(() => {
  const ages = draftEarners.value
    .map((m) => m.targetRetirementAge)
    .filter((a): a is number => typeof a === "number");
  if (!ages.length) return null;
  const min = Math.min(...ages);
  const who = draftEarners.value.find((m) => m.targetRetirementAge === min);
  return { age: min, name: who?.name ?? "" };
});
// Combined CTC comes from the store (salary is edited on the Salary screen, not here).
const combinedCTC = computed(() => household.totalAnnualIncome.salaryIncome);

</script>

<template>
  <v-container fluid class="py-6 profile-page">
    <div class="profile-head">
      <LeafPageHeader
        eyebrow="Household"
        title="Profile"
        description="Who's in your household. Date of birth and target retirement age drive every downstream projection — changes auto-save as you type."
      />
      <v-chip
        v-if="justSaved"
        size="small"
        variant="tonal"
        color="success"
        prepend-icon="mdi-check"
        class="profile-head__saved"
      >
        Saved
      </v-chip>
    </div>

    <div class="household-strip mb-6">
      <div class="hh-tile hh-tile--accent">
        <div class="hh-tile__eyebrow">Members</div>
        <div class="hh-tile__value">{{ draftMembers.length }}</div>
        <div class="hh-tile__meta">{{ earnerCount }} earner{{ earnerCount === 1 ? "" : "s" }}<template v-if="nonEarningAdultCount"> · {{ nonEarningAdultCount }} non-earning adult{{ nonEarningAdultCount === 1 ? "" : "s" }}</template> · {{ dependentCount }} dependent{{ dependentCount === 1 ? "" : "s" }}</div>
      </div>
      <div class="hh-tile">
        <div class="hh-tile__eyebrow">Primary earner</div>
        <div class="hh-tile__value-row">
          <v-icon icon="mdi-account-tie" color="primary" size="small" />
          <span class="hh-tile__trunc">{{ primaryEarner?.name || "—" }}</span>
        </div>
        <div class="hh-tile__meta">
          {{ primaryEarner ? `age ${ageFromDOB(primaryEarner.dateOfBirth)}` : "no earners yet" }}
        </div>
      </div>
      <div class="hh-tile">
        <div class="hh-tile__eyebrow">Earliest retirement</div>
        <div class="hh-tile__value">{{ earliestRetirement ? `age ${earliestRetirement.age}` : "—" }}</div>
        <div class="hh-tile__meta">{{ earliestRetirement?.name || "set a target age" }}</div>
      </div>
      <div class="hh-tile">
        <div class="hh-tile__eyebrow">Combined CTC</div>
        <div class="hh-tile__value">{{ formatINRCompact(combinedCTC) }}</div>
        <div class="hh-tile__meta">salary · per year</div>
      </div>
    </div>

    <div class="section-eyebrow">Setup</div>
    <v-card variant="outlined" rounded="xl" class="pa-4 mb-6 setup-card">
      <HouseholdSetupForm v-model:setup-mode="setupMode" v-model:household-name="householdName" variant="cards" />
    </v-card>

    <MembersForm v-model:members="draftMembers" />
  </v-container>
</template>

<style scoped>
.profile-page {
  max-width: 1280px;
}
.profile-head {
  position: relative;
}
.profile-head__saved {
  position: absolute;
  top: 4px;
  right: 0;
}
.section-eyebrow {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin: 0 4px 12px;
}

.household-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 760px) {
  .household-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.hh-tile {
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
}
.hh-tile--accent {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.09), rgba(var(--v-theme-primary), 0.02) 70%);
  border-color: rgba(var(--v-theme-primary), 0.22);
}
.hh-tile__eyebrow {
  font-size: 0.64rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-weight: 700;
  margin-bottom: 6px;
}
.hh-tile__value {
  font-family: "JetBrains Mono", monospace;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-variant-numeric: tabular-nums;
}
.hh-tile--accent .hh-tile__value { color: rgb(var(--v-theme-primary)); }
.hh-tile__value-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.hh-tile__trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hh-tile__meta {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 6px;
}
</style>

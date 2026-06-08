<script setup lang="ts">
import { computed, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import { lifeCoverAdequacy, healthCoverAdequacy } from "@/lib/adequacy";
import { isEarningMember } from "@/lib/member-earning";
import type { InsuranceType, InsurancePolicy } from "@/types/household";
import EmptyState from "@/components/shared/EmptyState.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";

const household = useHouseholdStore();
const fire = useFireDerive();

// gh #66: the "Your policies" DISPLAY list is member-lensed (selected member + "Joint"); equals
// household.data.insurance on the default "Whole household" view and in the onboarding wizard.
// Insured-person options and draft defaults intentionally stay on the full household roster.
const lensedInsurance = computed(() => fire.lensedInsurance.value);

const TYPES: { value: InsuranceType; label: string; icon: string; color: string }[] = [
  { value: "Life", label: "Life", icon: "mdi-shield-account", color: "primary" },
  { value: "Health", label: "Health", icon: "mdi-medical-bag", color: "success" },
  { value: "Vehicle", label: "Vehicle", icon: "mdi-car-cog", color: "warning" },
];
function typeVis(t: InsuranceType) {
  return TYPES.find((x) => x.value === t) ?? { icon: "mdi-shield", color: "primary" };
}

const memberOptions = computed(() =>
  household.members.map((m) => ({ value: m.id, label: m.name || "Person" })),
);

const draft = ref<{
  type: InsuranceType;
  provider: string;
  sumAssured: number | null;
  annualPremium: number | null;
  insuredPersonId: string;
  premiumPer: "yearly" | "monthly";
}>({
  type: "Health",
  provider: "",
  sumAssured: null,
  annualPremium: null,
  insuredPersonId: household.adults[0]?.id ?? household.members[0]?.id ?? "you",
  premiumPer: "yearly",
});

// Q5 (v3) — reactive validation.
const providerRules = [(v: string) => (!!v && v.trim().length > 0) || "Provider required"];
const positiveRules = [(v: number | null) => (v !== null && v > 0) || "Must be > 0"];
const isAddValid = computed(() =>
  !!draft.value.provider?.trim() &&
  draft.value.sumAssured !== null && draft.value.sumAssured > 0 &&
  draft.value.annualPremium !== null && draft.value.annualPremium > 0,
);
const isEditValid = computed(() =>
  !!editing.value && !!editing.value.provider?.trim() &&
  editing.value.sumAssured > 0 && editing.value.annualPremium > 0,
);

function addPolicy() {
  if (!isAddValid.value) return;
  const annualPrem =
    draft.value.premiumPer === "monthly"
      ? Number(draft.value.annualPremium) * 12
      : Number(draft.value.annualPremium);

  household.addInsurance({
    type: draft.value.type,
    provider: draft.value.provider,
    sumAssured: Number(draft.value.sumAssured),
    annualPremium: annualPrem,
    insuredPersonId: draft.value.insuredPersonId,
  });
  draft.value = {
    type: draft.value.type,
    provider: "",
    sumAssured: null,
    annualPremium: null,
    insuredPersonId: draft.value.insuredPersonId,
    premiumPer: "yearly",
  };
}

function adequacyFor(policy: InsurancePolicy) {
  if (policy.type === "Life") {
    const insured = household.members.find((m) => m.id === policy.insuredPersonId);
    const annualIncome = insured?.salary?.annualCTC ?? 0;
    return lifeCoverAdequacy(policy.sumAssured, annualIncome);
  }
  if (policy.type === "Health") return healthCoverAdequacy(policy.sumAssured, true);
  return null;
}

function isNonEarnerLife(policy: InsurancePolicy): boolean {
  if (policy.type !== "Life") return false;
  const insured = household.members.find((m) => m.id === policy.insuredPersonId);
  // gh #67: "life cover on a non-earner" flag — derived from actual labour income, not a role flag.
  return !insured || !isEarningMember(insured, household.data.businesses);
}

function insuredNameFor(id: string): string {
  return household.members.find((m) => m.id === id)?.name ?? "—";
}

// Q4 (v3) — pencil-edit dialog pattern.
const editing = ref<InsurancePolicy | null>(null);
const showEdit = computed({
  get: () => !!editing.value,
  set: (v) => { if (!v) editing.value = null; },
});
function startEdit(row: InsurancePolicy) {
  editing.value = { ...row };
}
function saveEdit() {
  if (!editing.value) return;
  household.updateInsurance(editing.value.id, {
    type: editing.value.type,
    provider: editing.value.provider,
    sumAssured: Number(editing.value.sumAssured),
    annualPremium: Number(editing.value.annualPremium),
    insuredPersonId: editing.value.insuredPersonId,
  });
  editing.value = null;
}
</script>

<template>
  <div>
    <PanelCard title="Add a policy" icon="mdi-shield-plus-outline" icon-color="primary" class="mb-4">
      <v-row dense align="center">
        <v-col cols="12" md="2">
          <v-select
            v-model="draft.type"
            :items="TYPES"
            item-title="label"
            item-value="value"
            label="Type"
            density="compact"
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-text-field
            v-model="draft.provider"
            label="Provider *"
            density="compact"
            placeholder="LIC / HDFC Ergo / Star Health"
            :rules="providerRules"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="draft.sumAssured" type="number" label="Sum assured *" prefix="₹" density="compact" :rules="positiveRules" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="draft.annualPremium" type="number" label="Premium *" prefix="₹" density="compact" :rules="positiveRules" />
        </v-col>
        <v-col cols="3" md="1">
          <v-select
            v-model="draft.premiumPer"
            :items="[
              { value: 'yearly', label: '/yr' },
              { value: 'monthly', label: '/mo' },
            ]"
            item-title="label"
            item-value="value"
            label="Per"
            density="compact"
          />
        </v-col>
        <v-col cols="9" md="2">
          <v-select
            v-model="draft.insuredPersonId"
            :items="memberOptions"
            item-title="label"
            item-value="value"
            label="Insured person"
            density="compact"
          />
        </v-col>
        <v-col cols="12" class="text-right mt-1">
          <v-btn size="small" variant="flat" color="primary" :disabled="!isAddValid" @click="addPolicy">
            <v-icon icon="mdi-plus" class="mr-1" /> Add policy
          </v-btn>
        </v-col>
      </v-row>
    </PanelCard>

    <template v-if="lensedInsurance.length">
      <div class="section-eyebrow">Your policies</div>
      <PanelCard>
        <EntityRow
          v-for="p in lensedInsurance"
          :key="p.id"
          :title="p.provider"
          :value="formatINRCompact(p.sumAssured)"
          :accent="typeVis(p.type).color"
        >
          <template #leading>
            <v-icon :icon="typeVis(p.type).icon" :color="typeVis(p.type).color" />
          </template>
          <template #meta>
            {{ p.type }} · Premium {{ formatINRCompact(p.annualPremium) }}/yr · Insured {{ insuredNameFor(p.insuredPersonId) }}
          </template>
          <template #trailing>
            <v-chip
              v-if="adequacyFor(p)"
              size="x-small"
              :color="adequacyFor(p)?.status === 'adequate' ? 'success' : adequacyFor(p)?.status === 'under' ? 'warning' : 'info'"
              variant="tonal"
            >
              <v-icon :icon="adequacyFor(p)?.status === 'adequate' ? 'mdi-check-circle' : 'mdi-alert'" size="x-small" class="mr-1" />
              {{ adequacyFor(p)?.status === 'adequate' ? 'Adequate' : adequacyFor(p)?.status === 'under' ? 'Under-insured' : 'Note' }}
            </v-chip>
            <v-btn icon size="x-small" variant="text" aria-label="Edit" @click="startEdit(p)">
              <v-icon icon="mdi-pencil" />
            </v-btn>
            <v-btn icon size="x-small" variant="text" aria-label="Delete" @click="household.removeInsurance(p.id)">
              <v-icon icon="mdi-delete" />
            </v-btn>
          </template>
        </EntityRow>
      </PanelCard>
    </template>
    <EmptyState
      v-else
      icon="mdi-shield-outline"
      title="No insurance policies tracked yet"
      copy="Add your term life and health policies so we can flag coverage gaps and feed your Freedom Score's insurance-adequacy factor."
    />

    <v-dialog v-model="showEdit" max-width="800" persistent>
      <v-card v-if="editing">
        <v-card-title>Edit insurance policy</v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <v-row dense>
            <v-col cols="12" md="4">
              <v-select
                v-model="editing.type"
                :items="TYPES"
                item-title="label"
                item-value="value"
                label="Type"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12" md="8">
              <v-text-field v-model="editing.provider" label="Provider *" density="comfortable" :rules="providerRules" />
            </v-col>
            <v-col cols="6" md="4">
              <v-text-field v-model.number="editing.sumAssured" type="number" label="Sum assured *" prefix="₹" density="comfortable" :rules="positiveRules" />
            </v-col>
            <v-col cols="6" md="4">
              <v-text-field v-model.number="editing.annualPremium" type="number" label="Annual premium *" prefix="₹" density="comfortable" :rules="positiveRules" />
            </v-col>
            <v-col cols="12" md="4">
              <v-select
                v-model="editing.insuredPersonId"
                :items="memberOptions"
                item-title="label"
                item-value="value"
                label="Insured person"
                density="comfortable"
              />
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" @click="editing = null">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!isEditValid" @click="saveEdit">
            <v-icon icon="mdi-content-save" class="mr-1" />
            Save changes
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

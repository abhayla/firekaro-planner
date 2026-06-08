<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { derivedEndYear } from "@/lib/amortization";
import { formatINRCompact } from "@/lib/formatters";
import type { LoanType, Liability } from "@/types/household";
import EmptyState from "@/components/shared/EmptyState.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";

const household = useHouseholdStore();

// Per-loan-type colour for the EntityRow accent + leading chip.
function loanColor(t: LoanType): string {
  switch (t) {
    case "HomeLoan":
      return "primary";
    case "CommercialPropertyLoan":
      return "deep-purple";
    case "CarLoan":
      return "info";
    case "PersonalLoan":
      return "warning";
    case "EducationLoan":
      return "success";
    case "CreditCard":
      return "error";
    default:
      return "secondary";
  }
}

const TYPES: { value: LoanType; label: string; defaultRate: number; helper?: string }[] = [
  { value: "HomeLoan", label: "Home Loan", defaultRate: 8.5 },
  { value: "CommercialPropertyLoan", label: "Commercial Loan", defaultRate: 11, helper: "A shop or business premises — taxed differently from a home loan." },
  { value: "PersonalLoan", label: "Personal Loan", defaultRate: 12 },
  { value: "CarLoan", label: "Car Loan", defaultRate: 9.5 },
  { value: "EducationLoan", label: "Education Loan", defaultRate: 10 },
  { value: "CreditCard", label: "Credit Card", defaultRate: 36, helper: "Only add carried balance if you don't pay your bill in full each month." },
  { value: "Other", label: "Other", defaultRate: 12 },
];

const earnerOptions = computed(() =>
  household.adults.map((m) => ({ value: m.id, label: m.name || "Earner" })),
);

const draft = ref<{
  name: string;
  type: LoanType;
  outstandingBalance: number | null;
  monthlyEMI: number | null;
  interestRate: number;
  ownerId: string;
  isSharedWithSpouse: boolean;
  coBorrowers: string[];
}>({
  name: "",
  type: "HomeLoan",
  outstandingBalance: null,
  monthlyEMI: null,
  interestRate: 8.5,
  ownerId: household.adults[0]?.id ?? household.members[0]?.id ?? "you",
  isSharedWithSpouse: false,
  coBorrowers: [],
});

watch(
  () => draft.value.type,
  (t) => {
    const cfg = TYPES.find((x) => x.value === t);
    if (cfg) draft.value.interestRate = cfg.defaultRate;
  },
);

const derivedYear = computed(() => {
  if (!draft.value.outstandingBalance || !draft.value.monthlyEMI) return null;
  return derivedEndYear(
    Number(draft.value.outstandingBalance),
    Number(draft.value.monthlyEMI),
    Number(draft.value.interestRate),
  );
});

// Q5 (v3) — reactive validation rules.
const nameRules = [(v: string) => (!!v && v.trim().length > 0) || "Name is required"];
const positiveRules = [(v: number | null) => (v !== null && v > 0) || "Must be > 0"];
const rateRules = [(v: number | null) => (v !== null && v >= 0 && v <= 50) || "0-50%"];
const isAddValid = computed(() =>
  !!draft.value.name?.trim() &&
  draft.value.outstandingBalance !== null && draft.value.outstandingBalance > 0 &&
  draft.value.monthlyEMI !== null && draft.value.monthlyEMI > 0 &&
  draft.value.interestRate >= 0 && draft.value.interestRate <= 50,
);
const isEditValid = computed(() =>
  !!editing.value && !!editing.value.name?.trim() &&
  editing.value.outstandingBalance > 0 && editing.value.monthlyEMI > 0 &&
  editing.value.interestRate >= 0 && editing.value.interestRate <= 50,
);

function addLoan() {
  if (!isAddValid.value) return;
  household.addLiability({
    name: draft.value.name,
    type: draft.value.type,
    outstandingBalance: Number(draft.value.outstandingBalance),
    monthlyEMI: Number(draft.value.monthlyEMI),
    interestRate: Number(draft.value.interestRate),
    ownerId: draft.value.ownerId,
    isSharedWithSpouse: draft.value.isSharedWithSpouse,
    derivedEndYear: derivedYear.value ?? undefined,
    coBorrowers: draft.value.coBorrowers,
  });
  draft.value = {
    name: "",
    type: draft.value.type,
    outstandingBalance: null,
    monthlyEMI: null,
    interestRate: draft.value.interestRate,
    ownerId: draft.value.ownerId,
    isSharedWithSpouse: false,
    coBorrowers: [],
  };
}

function typeLabelFor(t: LoanType): string {
  return TYPES.find((x) => x.value === t)?.label ?? t;
}
function ownerNameFor(id: string): string {
  return household.members.find((m) => m.id === id)?.name ?? "—";
}

const helperForType = computed(() => TYPES.find((x) => x.value === draft.value.type)?.helper);

// Q4 (v3) — pencil-edit dialog pattern.
const editing = ref<Liability | null>(null);
const showEdit = computed({
  get: () => !!editing.value,
  set: (v) => { if (!v) editing.value = null; },
});
function startEdit(row: Liability) {
  editing.value = { ...row };
}
const editingDerivedYear = computed(() => {
  if (!editing.value?.outstandingBalance || !editing.value?.monthlyEMI) return null;
  return derivedEndYear(
    Number(editing.value.outstandingBalance),
    Number(editing.value.monthlyEMI),
    Number(editing.value.interestRate),
  );
});
function saveEdit() {
  if (!editing.value) return;
  household.updateLiability(editing.value.id, {
    name: editing.value.name,
    type: editing.value.type,
    outstandingBalance: Number(editing.value.outstandingBalance),
    monthlyEMI: Number(editing.value.monthlyEMI),
    interestRate: Number(editing.value.interestRate),
    ownerId: editing.value.ownerId,
    isSharedWithSpouse: editing.value.isSharedWithSpouse,
    derivedEndYear: editingDerivedYear.value ?? undefined,
  });
  editing.value = null;
}
</script>

<template>
  <div>
    <PanelCard title="Add a loan" icon="mdi-bank-plus" icon-color="primary" class="mb-4">
      <v-row dense align="center">
        <v-col cols="12" md="3">
          <v-text-field v-model="draft.name" label="Loan name *" density="compact" placeholder="SBI Home Loan" :rules="nameRules" />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="draft.type"
            :items="TYPES"
            item-title="label"
            item-value="value"
            label="Type"
            density="compact"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="draft.outstandingBalance" type="number" label="Outstanding *" prefix="₹" density="compact" :rules="positiveRules" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="draft.monthlyEMI" type="number" label="Monthly EMI *" prefix="₹" density="compact" :rules="positiveRules" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="draft.interestRate" type="number" label="Interest % *" suffix="%" density="compact" step="0.1" :rules="rateRules" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="draft.ownerId"
            :items="earnerOptions"
            item-title="label"
            item-value="value"
            label="Owner"
            density="compact"
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-checkbox v-model="draft.isSharedWithSpouse" label="Shared with spouse" density="compact" hide-details />
        </v-col>
        <!-- Phase 4 Stage L — coBorrower selector (audit Entry #23 A23.2). -->
        <!-- Joint home loan -> both borrowers get ₹2L Sec 24 deduction. -->
        <v-col v-if="draft.type === 'HomeLoan' && earnerOptions.length > 1" cols="12" md="6">
          <v-select
            v-model="draft.coBorrowers"
            :items="earnerOptions"
            item-title="label"
            item-value="value"
            label="Co-borrowers (multi-select)"
            density="compact"
            multiple
            chips
            hint="Joint home loan — each co-borrower claims ₹2L Sec 24 interest deduction independently."
            persistent-hint
            data-testid="loan-coborrowers"
          />
        </v-col>
        <v-col cols="12" md="6" class="text-right">
          <v-btn size="small" variant="flat" color="primary" :disabled="!isAddValid" @click="addLoan">
            <v-icon icon="mdi-plus" class="mr-1" /> Add loan
          </v-btn>
        </v-col>
      </v-row>
      <div v-if="derivedYear" class="text-caption text-medium-emphasis mt-1">
        At {{ draft.interestRate }}%, this loan ends in <strong>{{ derivedYear }}</strong>.
      </div>
      <v-alert v-if="helperForType" type="warning" density="compact" variant="tonal" class="mt-2">
        {{ helperForType }}
      </v-alert>
    </PanelCard>

    <template v-if="household.data.liabilities.length">
      <div class="section-eyebrow">Your loans</div>
      <PanelCard>
        <EntityRow
          v-for="l in household.data.liabilities"
          :key="l.id"
          :title="l.name"
          :value="formatINRCompact(l.outstandingBalance)"
          :accent="loanColor(l.type)"
        >
          <template #leading>
            <v-chip size="x-small" variant="tonal" :color="loanColor(l.type)">{{ typeLabelFor(l.type) }}</v-chip>
          </template>
          <template #meta>
            EMI {{ formatINRCompact(l.monthlyEMI) }}/mo @ {{ l.interestRate }}% · Ends ~{{ l.derivedEndYear ?? "—" }} · Owner: {{ ownerNameFor(l.ownerId) }}{{ l.isSharedWithSpouse ? " (shared)" : "" }}
          </template>
          <template #trailing>
            <v-btn icon size="x-small" variant="text" aria-label="Edit" @click="startEdit(l)">
              <v-icon icon="mdi-pencil" />
            </v-btn>
            <v-btn icon size="x-small" variant="text" aria-label="Delete" @click="household.removeLiability(l.id)">
              <v-icon icon="mdi-delete" />
            </v-btn>
          </template>
        </EntityRow>
      </PanelCard>
    </template>
    <EmptyState
      v-else
      icon="mdi-credit-card-off-outline"
      title="No loans tracked yet"
      copy="When you add a loan or carried credit-card balance above, it'll show up here with its derived payoff year."
    />

    <v-dialog v-model="showEdit" max-width="800" persistent>
      <v-card v-if="editing">
        <v-card-title>Edit loan</v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field v-model="editing.name" label="Loan name *" density="comfortable" :rules="nameRules" />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="editing.type"
                :items="TYPES"
                item-title="label"
                item-value="value"
                label="Type"
                density="comfortable"
              />
            </v-col>
            <v-col cols="6" md="4">
              <v-text-field v-model.number="editing.outstandingBalance" type="number" label="Outstanding *" prefix="₹" density="comfortable" :rules="positiveRules" />
            </v-col>
            <v-col cols="6" md="4">
              <v-text-field v-model.number="editing.monthlyEMI" type="number" label="Monthly EMI *" prefix="₹" density="comfortable" :rules="positiveRules" />
            </v-col>
            <v-col cols="6" md="4">
              <v-text-field v-model.number="editing.interestRate" type="number" label="Interest % *" suffix="%" density="comfortable" step="0.1" :rules="rateRules" />
            </v-col>
            <v-col cols="6" md="6">
              <v-select
                v-model="editing.ownerId"
                :items="earnerOptions"
                item-title="label"
                item-value="value"
                label="Owner"
                density="comfortable"
              />
            </v-col>
            <v-col cols="6" md="6">
              <v-checkbox v-model="editing.isSharedWithSpouse" label="Shared with spouse" density="comfortable" hide-details />
            </v-col>
          </v-row>
          <div v-if="editingDerivedYear" class="text-caption text-medium-emphasis mt-1">
            At {{ editing.interestRate }}%, this loan ends in <strong>{{ editingDerivedYear }}</strong>.
          </div>
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

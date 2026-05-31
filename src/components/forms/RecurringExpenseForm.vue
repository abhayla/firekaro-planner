<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import type {
  RecurringExpenseLine,
  RecurringFreq,
  RecurringExpenseKind,
  InflationBucket,
} from "@/types/household";
import PanelCard from "@/components/shared/PanelCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";

const household = useHouseholdStore();

const FREQ_OPTIONS = [
  { value: "M", label: "Monthly" },
  { value: "Q", label: "Quarterly" },
  { value: "A", label: "Annual" },
];

// Phase 4 Stage L — kind selector (audit Entry #6 A6.1 + #10 A10.2).
// Each kind auto-routes to the matching inflation bucket per the
// kind -> bucket map below; user can override.
const KIND_OPTIONS: { value: RecurringExpenseKind; label: string; defaultBucket: InflationBucket }[] = [
  { value: "general", label: "General", defaultBucket: "general" },
  { value: "parents", label: "Parents (sandwich-gen)", defaultBucket: "healthcare" },
  { value: "extended-contingency", label: "Extended-family contingency", defaultBucket: "general" },
  { value: "medical", label: "Medical / chronic care", defaultBucket: "healthcare" },
];

const recurringDraft = ref<{
  label: string;
  amount: number | null;
  frequency: RecurringFreq;
  endYear: number | null;
  kind: RecurringExpenseKind;
  inflationBucket: InflationBucket;
}>({
  label: "",
  amount: null,
  frequency: "M",
  endYear: null,
  kind: "general",
  inflationBucket: "general",
});

// Phase 4 Stage L — when kind changes, auto-route inflationBucket per
// the audit-grounded default (Entry #3 A3.6). User can override the
// bucket independently if needed.
watch(
  () => recurringDraft.value.kind,
  (kind) => {
    const opt = KIND_OPTIONS.find((k) => k.value === kind);
    if (opt) recurringDraft.value.inflationBucket = opt.defaultBucket;
  },
);

function addRecurring() {
  if (!isAddValid.value) return;
  household.addRecurring({
    label: recurringDraft.value.label,
    amount: Number(recurringDraft.value.amount),
    frequency: recurringDraft.value.frequency,
    endYear: recurringDraft.value.endYear ?? undefined,
    source: "manual",
    kind: recurringDraft.value.kind,
    inflationBucket: recurringDraft.value.inflationBucket,
  });
  recurringDraft.value = {
    label: "",
    amount: null,
    frequency: "M",
    endYear: null,
    kind: "general",
    inflationBucket: "general",
  };
}

// Q5 (v3) — reactive validation. Add disabled until label + positive amount.
const labelRules = [(v: string) => (!!v && v.trim().length > 0) || "Label is required"];
const positiveAmountRules = [
  (v: number | null) => (v !== null && v > 0) || "Amount must be greater than 0",
];
const isAddValid = computed(() =>
  !!recurringDraft.value.label?.trim() &&
  recurringDraft.value.amount !== null &&
  recurringDraft.value.amount > 0,
);
const isEditValid = computed(
  () => !!editing.value && !!editing.value.label?.trim() && editing.value.amount > 0,
);

const manualRecurring = computed(() =>
  household.data.expenses.recurring.filter((r) => r.source === "manual"),
);
const autoRecurring = computed(() =>
  household.data.expenses.recurring.filter((r) => r.source !== "manual"),
);

// Q4 (v3) — pencil-edit pattern. Click pencil → dialog opens with row pre-populated.
const editing = ref<RecurringExpenseLine | null>(null);
const showEdit = computed({
  get: () => !!editing.value,
  set: (v) => {
    if (!v) editing.value = null;
  },
});
function startEdit(row: RecurringExpenseLine) {
  editing.value = { ...row };
}
function saveEdit() {
  if (!editing.value) return;
  household.updateRecurring(editing.value.id, {
    label: editing.value.label,
    amount: Number(editing.value.amount),
    frequency: editing.value.frequency,
    endYear: editing.value.endYear ?? undefined,
  });
  editing.value = null;
}
</script>

<template>
  <div>
    <PanelCard title="Add a recurring expense" icon="mdi-calendar-sync-outline" icon-color="warning" class="mb-4">
      <v-row dense align="center">
        <v-col cols="12" md="3">
          <v-text-field v-model="recurringDraft.label" label="Label *" density="compact" :rules="labelRules" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="recurringDraft.amount" type="number" label="Amount *" prefix="₹" density="compact" :rules="positiveAmountRules" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="recurringDraft.frequency"
            :items="FREQ_OPTIONS"
            item-title="label"
            item-value="value"
            label="Frequency"
            density="compact"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="recurringDraft.endYear" type="number" label="End year" density="compact" placeholder="optional" />
        </v-col>
        <v-col cols="6" md="2" class="text-right">
          <v-btn size="small" variant="flat" color="primary" :disabled="!isAddValid" @click="addRecurring">
            <v-icon icon="mdi-plus" class="mr-1" /> Add
          </v-btn>
        </v-col>
        <!-- Phase 4 Stage L — kind selector (audit Entry #6 + #10). -->
        <v-col cols="12" md="6">
          <v-select
            v-model="recurringDraft.kind"
            :items="KIND_OPTIONS"
            item-title="label"
            item-value="value"
            label="Expense kind"
            density="compact"
            hint="Auto-routes to the correct inflation bucket."
            persistent-hint
            data-testid="recurring-kind"
          />
        </v-col>
      </v-row>
    </PanelCard>

    <template v-if="manualRecurring.length">
      <div class="section-eyebrow">Your recurring commitments</div>
      <PanelCard>
        <EntityRow
          v-for="r in manualRecurring"
          :key="r.id"
          :title="r.label"
          :value="`${formatINRCompact(r.amount)}/${r.frequency === 'M' ? 'mo' : r.frequency === 'Q' ? 'qtr' : 'yr'}`"
          accent="warning"
        >
          <template #leading>
            <v-icon icon="mdi-calendar-refresh-outline" color="warning" />
          </template>
          <template v-if="r.endYear" #meta>Until {{ r.endYear }}</template>
          <template #trailing>
            <v-btn icon size="x-small" variant="text" aria-label="Edit" @click="startEdit(r)">
              <v-icon icon="mdi-pencil" />
            </v-btn>
            <v-btn icon size="x-small" variant="text" aria-label="Delete" @click="household.removeRecurring(r.id)">
              <v-icon icon="mdi-delete" />
            </v-btn>
          </template>
        </EntityRow>
      </PanelCard>
    </template>

    <template v-if="autoRecurring.length">
      <div class="section-eyebrow">Auto-flowed from Insurance / Liabilities</div>
      <PanelCard>
        <EntityRow
          v-for="r in autoRecurring"
          :key="r.id"
          :title="r.label"
          :value="`${formatINRCompact(r.amount)}/mo`"
          :accent="r.source === 'auto-insurance' ? 'info' : 'warning'"
        >
          <template #leading>
            <v-chip size="x-small" :color="r.source === 'auto-insurance' ? 'info' : 'warning'" variant="tonal">
              {{ r.source === "auto-insurance" ? "Insurance" : "Loan" }}
            </v-chip>
          </template>
          <template #meta>Edit on the source step{{ r.endYear ? ` · ends ${r.endYear}` : "" }}</template>
        </EntityRow>
      </PanelCard>
    </template>

    <v-dialog v-model="showEdit" max-width="600" persistent>
      <v-card v-if="editing">
        <v-card-title>Edit recurring expense</v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field v-model="editing.label" label="Label *" density="comfortable" :rules="labelRules" />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="editing.amount" type="number" label="Amount *" prefix="₹" density="comfortable" :rules="positiveAmountRules" />
            </v-col>
            <v-col cols="6" md="3">
              <v-select
                v-model="editing.frequency"
                :items="FREQ_OPTIONS"
                item-title="label"
                item-value="value"
                label="Frequency"
                density="comfortable"
              />
            </v-col>
            <v-col cols="6" md="6">
              <v-text-field v-model.number="editing.endYear" type="number" label="End year (optional)" density="comfortable" />
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

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import type { PlannedFutureLine, PlannedFutureKind, InflationBucket } from "@/types/household";
import { expenseOwnerLabel, EXPENSE_OWNER_HOUSEHOLD } from "@/lib/expense-attribution";
import { plannedGoalInflationBucket } from "@/lib/derived-records";
import EmptyState from "@/components/shared/EmptyState.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";
import ExpenseOwnerSelect from "@/components/expenses/ExpenseOwnerSelect.vue";

const household = useHouseholdStore();
const assumptions = useAssumptionsStore();
// #81 Phase 1 — the displayed list is the KERNEL's member-lensed planned set (single source
// of the lens; household total unchanged). Selected adult → own + shared Household; else all.
const fire = useFireDerive();
const showOwnerChip = computed(() => household.data.members.length > 1);
const visiblePlanned = computed(() => fire.lensedPlannedExpenses.value);
const ownerLabelFor = (p: PlannedFutureLine): string =>
  expenseOwnerLabel(p.ownerId, household.data.members);

// v5 P4 (A6.5/A10.3) — goal kind → inflation-bucket routing (mirrors
// RecurringExpenseForm). Selecting a non-general kind auto-routes the bucket so
// the goal inflates at the correct rate; user can still override.
// ADR-0006 Phase 1d: `defaultBucket` reads `plannedGoalInflationBucket`, the same map the kernel
// and the store's legacy backfill use — this table used to be a fourth hand-written copy of it.
const PLANNED_KIND_OPTIONS: { value: PlannedFutureKind; label: string; defaultBucket: InflationBucket }[] = (
  [
    { value: "general", label: "General" },
    { value: "education", label: "Education" },
    { value: "marriage", label: "Marriage" },
    { value: "medical", label: "Medical" },
  ] as const
).map((o) => ({ ...o, defaultBucket: plannedGoalInflationBucket(o.value) }));

const plannedDraft = ref<{
  label: string;
  todayAmount: number | null;
  targetYear: number;
  isMultiYear: boolean;
  durationYears: number;
  kind: PlannedFutureKind;
  inflationBucket: InflationBucket;
  ownerId: string;
}>({
  label: "",
  todayAmount: null,
  targetYear: new Date().getFullYear() + 5,
  isMultiYear: false,
  durationYears: 4,
  kind: "general",
  inflationBucket: "general",
  ownerId: EXPENSE_OWNER_HOUSEHOLD,
});

watch(
  () => plannedDraft.value.kind,
  (kind) => {
    const opt = PLANNED_KIND_OPTIONS.find((k) => k.value === kind);
    if (opt) plannedDraft.value.inflationBucket = opt.defaultBucket;
  },
);

function inflatedAt(amount: number, year: number): number {
  const yrs = Math.max(0, year - new Date().getFullYear());
  return Math.round(amount * Math.pow(1 + assumptions.values.inflation, yrs));
}

// Q5 (v3) — reactive validation.
const labelRules = [(v: string) => (!!v && v.trim().length > 0) || "Label is required"];
const positiveAmountRules = [(v: number | null) => (v !== null && v > 0) || "Amount must be positive"];
const yearRules = [(v: number | null) => (v !== null && v >= new Date().getFullYear()) || "Year must be current or future"];
const isAddValid = computed(() =>
  !!plannedDraft.value.label?.trim() &&
  plannedDraft.value.todayAmount !== null && plannedDraft.value.todayAmount > 0 &&
  plannedDraft.value.targetYear >= new Date().getFullYear(),
);
const isEditValid = computed(() =>
  !!editing.value && !!editing.value.label?.trim() && editing.value.todayAmount > 0 && editing.value.targetYear >= new Date().getFullYear(),
);

function addPlanned() {
  if (!isAddValid.value) return;
  household.addPlannedFuture({
    label: plannedDraft.value.label,
    todayAmount: Number(plannedDraft.value.todayAmount),
    targetYear: Number(plannedDraft.value.targetYear),
    isMultiYear: plannedDraft.value.isMultiYear,
    durationYears: plannedDraft.value.isMultiYear ? plannedDraft.value.durationYears : undefined,
    kind: plannedDraft.value.kind,
    inflationBucket: plannedDraft.value.inflationBucket,
    ownerId: plannedDraft.value.ownerId,
  });
  plannedDraft.value = {
    label: "",
    todayAmount: null,
    targetYear: new Date().getFullYear() + 5,
    isMultiYear: false,
    durationYears: 4,
    kind: "general",
    inflationBucket: "general",
    ownerId: EXPENSE_OWNER_HOUSEHOLD,
  };
}

// Q4 (v3) — pencil-edit dialog pattern.
const editing = ref<PlannedFutureLine | null>(null);
const showEdit = computed({
  get: () => !!editing.value,
  set: (v) => { if (!v) editing.value = null; },
});
function startEdit(row: PlannedFutureLine) {
  editing.value = { ...row, kind: row.kind ?? "general", ownerId: row.ownerId ?? EXPENSE_OWNER_HOUSEHOLD };
}
function saveEdit() {
  if (!editing.value) return;
  const kind = editing.value.kind ?? "general";
  // Auto-route the bucket from the kind on save (mirrors the add-form watcher).
  const bucket = PLANNED_KIND_OPTIONS.find((k) => k.value === kind)?.defaultBucket ?? "general";
  household.updatePlannedFuture(editing.value.id, {
    label: editing.value.label,
    todayAmount: Number(editing.value.todayAmount),
    targetYear: Number(editing.value.targetYear),
    isMultiYear: editing.value.isMultiYear,
    durationYears: editing.value.isMultiYear ? editing.value.durationYears : undefined,
    kind,
    inflationBucket: bucket,
    ownerId: editing.value.ownerId ?? EXPENSE_OWNER_HOUSEHOLD,
  });
  editing.value = null;
}
</script>

<template>
  <div>
    <PanelCard title="Add a planned expense" icon="mdi-calendar-plus" icon-color="primary" class="mb-4">
      <v-row dense align="center">
        <v-col cols="12" md="3">
          <v-text-field v-model="plannedDraft.label" label="Label *" density="compact" :rules="labelRules" />
        </v-col>
        <v-col cols="6" md="2">
          <v-select
            v-model="plannedDraft.kind"
            :items="PLANNED_KIND_OPTIONS"
            item-title="label"
            item-value="value"
            label="Kind"
            density="compact"
            data-testid="planned-kind-select"
            hint="Every planned purchase — including General — counts toward your FIRE number."
            persistent-hint
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="plannedDraft.todayAmount" type="number" label="Today's ₹ *" prefix="₹" density="compact" :rules="positiveAmountRules" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="plannedDraft.targetYear" type="number" label="Target year *" density="compact" :rules="yearRules" />
        </v-col>
        <v-col cols="6" md="2">
          <v-checkbox v-model="plannedDraft.isMultiYear" label="Multi-year" density="compact" hide-details />
        </v-col>
        <v-col cols="6" md="2" v-if="plannedDraft.isMultiYear">
          <v-text-field v-model.number="plannedDraft.durationYears" type="number" label="Years" density="compact" />
        </v-col>
        <v-col cols="6" md="1" class="text-right">
          <v-btn size="small" variant="flat" color="primary" :disabled="!isAddValid" @click="addPlanned">
            <v-icon icon="mdi-plus" />
          </v-btn>
        </v-col>
        <!-- #81 Phase 1 — member attribution owner picker (hidden when solo). -->
        <v-col cols="12" md="4">
          <ExpenseOwnerSelect v-model="plannedDraft.ownerId" />
        </v-col>
      </v-row>
      <div
        v-if="plannedDraft.todayAmount && plannedDraft.targetYear"
        class="text-caption text-medium-emphasis mt-1"
      >
        {{ formatINRCompact(plannedDraft.todayAmount) }} today →
        ~{{ formatINRCompact(inflatedAt(plannedDraft.todayAmount, plannedDraft.targetYear)) }}
        in {{ plannedDraft.targetYear }} at {{ Math.round(assumptions.values.inflation * 100) }}% inflation.
      </div>
    </PanelCard>

    <template v-if="visiblePlanned.length">
      <div class="section-eyebrow">Your planned expenses</div>
      <PanelCard>
        <EntityRow
          v-for="p in visiblePlanned"
          :key="p.id"
          :title="p.label"
          :value="formatINRCompact(p.todayAmount)"
          accent="primary"
        >
          <template #leading>
            <v-icon icon="mdi-calendar-star-outline" color="primary" />
          </template>
          <template #meta>
            <v-chip
              v-if="showOwnerChip"
              size="x-small"
              variant="tonal"
              color="primary"
              class="mr-1"
              data-testid="planned-owner-chip"
            >
              {{ ownerLabelFor(p) }}
            </v-chip>
            {{ p.isMultiYear ? `${p.durationYears} yrs from ${p.targetYear}` : `One-time in ${p.targetYear}` }}
            · inflates to ~{{ formatINRCompact(inflatedAt(p.todayAmount, p.targetYear)) }}
          </template>
          <template #trailing>
            <v-btn icon size="x-small" variant="text" aria-label="Edit" @click="startEdit(p)">
              <v-icon icon="mdi-pencil" />
            </v-btn>
            <v-btn icon size="x-small" variant="text" aria-label="Delete" @click="household.removePlannedFuture(p.id)">
              <v-icon icon="mdi-delete" />
            </v-btn>
          </template>
        </EntityRow>
      </PanelCard>
    </template>
    <EmptyState
      v-else
      icon="mdi-calendar-arrow-right"
      title="No planned future expenses yet"
      copy="Capture upcoming one-offs (a wedding, college, a sabbatical year) in today's rupees — we inflate to the target year and roll them into your FIRE plan."
    />

    <v-dialog v-model="showEdit" max-width="640" persistent>
      <v-card v-if="editing">
        <v-card-title>Edit planned expense</v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field v-model="editing.label" label="Label *" density="comfortable" :rules="labelRules" />
            </v-col>
            <v-col cols="6" md="3">
              <v-select v-model="editing.kind" :items="PLANNED_KIND_OPTIONS" item-title="label" item-value="value" label="Kind" density="comfortable" />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="editing.todayAmount" type="number" label="Today's ₹ *" prefix="₹" density="comfortable" :rules="positiveAmountRules" />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="editing.targetYear" type="number" label="Target year *" density="comfortable" :rules="yearRules" />
            </v-col>
            <v-col cols="6" md="3">
              <v-checkbox v-model="editing.isMultiYear" label="Multi-year" density="comfortable" hide-details />
            </v-col>
            <v-col cols="6" md="3" v-if="editing.isMultiYear">
              <v-text-field v-model.number="editing.durationYears" type="number" label="Years" density="comfortable" />
            </v-col>
            <v-col cols="12" md="6">
              <ExpenseOwnerSelect v-model="editing.ownerId" density="comfortable" />
            </v-col>
          </v-row>
          <div
            v-if="editing.todayAmount && editing.targetYear"
            class="text-caption text-medium-emphasis mt-1"
          >
            {{ formatINRCompact(editing.todayAmount) }} today →
            ~{{ formatINRCompact(inflatedAt(editing.todayAmount, editing.targetYear)) }}
            in {{ editing.targetYear }} at {{ Math.round(assumptions.values.inflation * 100) }}% inflation.
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

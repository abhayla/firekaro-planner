<script setup lang="ts">
import { computed, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useUiStore } from "@/stores/ui";
import { formatINRCompact } from "@/lib/formatters";
import { toAnnual } from "@/lib/cashflow";
import type {
  OtherIncomeLine,
  OtherIncomeType,
  BusinessLegalKind,
  Period,
} from "@/types/household";
import EmptyState from "@/components/shared/EmptyState.vue";

const household = useHouseholdStore();
const ui = useUiStore();

interface TypeMeta {
  value: OtherIncomeType;
  label: string;
  icon: string;
  color: string;
  hint: string;
}

const OTHER_TYPES: TypeMeta[] = [
  { value: "Rental", label: "Rental", icon: "mdi-home-city-outline", color: "primary", hint: "Rent received from property" },
  { value: "Dividend", label: "Dividend", icon: "mdi-chart-line-variant", color: "success", hint: "Equity / MF / business dividends" },
  { value: "Interest", label: "Interest", icon: "mdi-bank-outline", color: "info", hint: "Savings, FD, bond interest" },
  { value: "CapitalGains", label: "Capital Gains", icon: "mdi-trending-up", color: "warning", hint: "Realized gains from sales" },
  { value: "Other", label: "Other", icon: "mdi-cash-plus", color: "secondary", hint: "Anything else passive" },
];

function metaFor(type: OtherIncomeType): TypeMeta {
  return OTHER_TYPES.find((t) => t.value === type) ?? OTHER_TYPES[OTHER_TYPES.length - 1];
}

function businessDefaultExempt(kind: BusinessLegalKind): boolean {
  return kind === "HUF" || kind === "LLP" || kind === "Partnership";
}

const otherDraft = ref<Partial<OtherIncomeLine>>({
  type: "Rental",
  source: "Direct",
  label: "",
  amount: undefined,
  frequency: "M",
  ownerId: household.earners[0]?.id ?? household.members[0]?.id ?? "you",
  isTaxExempt: false,
  homeLoanInterest: undefined,
  municipalTaxes: undefined,
});

const positiveRules = [(v: number | null | undefined) => (v !== null && v !== undefined && v > 0) || "Amount must be > 0"];
const isAddValid = computed(() =>
  !!otherDraft.value.type &&
  !!otherDraft.value.ownerId &&
  otherDraft.value.amount !== null && otherDraft.value.amount !== undefined &&
  Number(otherDraft.value.amount) > 0,
);
const isEditValid = computed(() =>
  !!editing.value && !!editing.value.type && !!editing.value.ownerId && Number(editing.value.amount) > 0,
);

// Track which row was most recently added — used to highlight + scroll-into-view.
const recentlyAddedId = ref<string | null>(null);

// §24(b) interest + municipal taxes are relevant ONLY for let-out (Rental) lines; for any other
// type they stay undefined (⇒ 0 in the tax engine). Coerce a blank/0 input to undefined so the
// persisted shape stays clean. gh-issue #32.
function rentalTaxFields(
  draft: Partial<OtherIncomeLine>,
): Pick<OtherIncomeLine, "homeLoanInterest" | "municipalTaxes"> {
  if (draft.type !== "Rental") return { homeLoanInterest: undefined, municipalTaxes: undefined };
  const hli = Number(draft.homeLoanInterest);
  const mt = Number(draft.municipalTaxes);
  return {
    homeLoanInterest: Number.isFinite(hli) && hli > 0 ? hli : undefined,
    municipalTaxes: Number.isFinite(mt) && mt > 0 ? mt : undefined,
  };
}

function addOtherIncome() {
  if (!isAddValid.value) return;
  const isEntity = otherDraft.value.source !== "Direct";
  const added = household.addOtherIncome({
    type: otherDraft.value.type as OtherIncomeType,
    source: isEntity ? (otherDraft.value.source as string) : "Direct",
    sourceEntityId: isEntity ? (otherDraft.value.source as string) : undefined,
    label: otherDraft.value.label,
    amount: Number(otherDraft.value.amount),
    frequency: otherDraft.value.frequency as Period,
    ownerId: otherDraft.value.ownerId as string,
    isTaxExempt: !!otherDraft.value.isTaxExempt,
    ...rentalTaxFields(otherDraft.value),
  });
  if (added && typeof added === "object" && "id" in added) {
    recentlyAddedId.value = (added as { id: string }).id;
    setTimeout(() => {
      if (recentlyAddedId.value === (added as { id: string }).id) {
        recentlyAddedId.value = null;
      }
    }, 4000);
  }
  otherDraft.value = {
    type: "Rental",
    source: "Direct",
    label: "",
    amount: undefined,
    frequency: "M",
    ownerId: otherDraft.value.ownerId,
    isTaxExempt: false,
    homeLoanInterest: undefined,
    municipalTaxes: undefined,
  };
}

function onSourceChange(newSrc: string) {
  if (newSrc === "Direct") {
    otherDraft.value.isTaxExempt = false;
    return;
  }
  const biz = household.data.businesses.find((b) => b.id === newSrc);
  if (biz) otherDraft.value.isTaxExempt = businessDefaultExempt(biz.legalKind);
}

const sourceOptions = computed(() => [
  { value: "Direct", label: "Direct (to my account)" },
  ...household.data.businesses.map((b) => ({
    value: b.id,
    label: `${b.name} (${b.legalKind})${b.isOperated === false ? " — passive" : ""}`,
  })),
]);

const memberOptions = computed(() =>
  household.members.map((m) => ({ value: m.id, label: m.name || "Earner" })),
);

function entityLabelFor(id: string | undefined): string {
  if (!id || id === "Direct") return "Direct";
  return household.data.businesses.find((b) => b.id === id)?.name ?? "—";
}

function ownerLabelFor(id: string): string {
  return household.members.find((m) => m.id === id)?.name || id || "—";
}

function annualOf(line: OtherIncomeLine): number {
  return toAnnual({ amount: line.amount, period: line.frequency });
}

function periodSuffix(p: Period): string {
  if (p === "M") return "/mo";
  if (p === "Q") return "/qtr";
  return "/yr";
}

function periodLabel(p: Period): string {
  if (p === "M") return "monthly";
  if (p === "Q") return "quarterly";
  return "annual";
}

// --- Search / filter / sort (web-research pattern) ---
const searchQuery = ref("");
const activeTypeFilter = ref<OtherIncomeType | "all">("all");
type SortKey = "recent" | "amount-desc" | "amount-asc" | "type";
const sortKey = ref<SortKey>("recent");

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently added" },
  { value: "amount-desc", label: "Amount: high to low" },
  { value: "amount-asc", label: "Amount: low to high" },
  { value: "type", label: "By type" },
];

// All lines filtered + sorted (NOT yet grouped — the template groups after).
const filteredLines = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  let lines = [...household.data.otherIncome];

  if (q) {
    lines = lines.filter((l) => {
      const haystack = [
        l.label ?? "",
        metaFor(l.type).label,
        entityLabelFor(l.sourceEntityId || l.source),
        ownerLabelFor(l.ownerId),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  if (activeTypeFilter.value !== "all") {
    lines = lines.filter((l) => l.type === activeTypeFilter.value);
  }

  if (sortKey.value === "amount-desc") {
    lines.sort((a, b) => annualOf(b) - annualOf(a));
  } else if (sortKey.value === "amount-asc") {
    lines.sort((a, b) => annualOf(a) - annualOf(b));
  } else if (sortKey.value === "type") {
    const order: Record<OtherIncomeType, number> = {
      Rental: 0, Dividend: 1, Interest: 2, CapitalGains: 3, Other: 4,
    };
    lines.sort((a, b) => order[a.type] - order[b.type]);
  }
  // "recent" is insertion order — leave alone.

  return lines;
});

// Counts per type for the filter chip strip — based on the FULL set,
// not filtered (so the chip badges show absolute totals).
const typeCounts = computed(() => {
  const out: Record<OtherIncomeType, number> = {
    Rental: 0, Dividend: 0, Interest: 0, CapitalGains: 0, Other: 0,
  };
  for (const l of household.data.otherIncome) out[l.type]++;
  return out;
});

const totalCount = computed(() => household.data.otherIncome.length);

// Group the filtered set by type for rendering. Only show sections with content.
const linesByType = computed(() => {
  const out: Record<OtherIncomeType, OtherIncomeLine[]> = {
    Rental: [], Dividend: [], Interest: [], CapitalGains: [], Other: [],
  };
  for (const line of filteredLines.value) {
    out[line.type].push(line);
  }
  return out;
});

const typesPresent = computed(() =>
  OTHER_TYPES.filter((t) => linesByType.value[t.value].length > 0),
);

const hasActiveFilters = computed(
  () => searchQuery.value.trim().length > 0 || activeTypeFilter.value !== "all",
);

function clearFilters() {
  searchQuery.value = "";
  activeTypeFilter.value = "all";
}

// Q4 (v3) — pencil-edit dialog pattern.
const editing = ref<OtherIncomeLine | null>(null);
const showEdit = computed({
  get: () => !!editing.value,
  set: (v) => { if (!v) editing.value = null; },
});
function startEdit(row: OtherIncomeLine) {
  editing.value = { ...row };
}
function saveEdit() {
  if (!editing.value) return;
  const isEntity = editing.value.source !== "Direct";
  household.updateOtherIncome(editing.value.id, {
    type: editing.value.type,
    source: isEntity ? editing.value.source : "Direct",
    sourceEntityId: isEntity ? editing.value.source : undefined,
    label: editing.value.label,
    amount: Number(editing.value.amount),
    frequency: editing.value.frequency,
    ownerId: editing.value.ownerId,
    isTaxExempt: !!editing.value.isTaxExempt,
    ...rentalTaxFields(editing.value),
  });
  editing.value = null;
}
</script>

<template>
  <div>
    <!-- ────────────────────────────────────────────────────────────
         ADD FORM — chip-style type picker + clear field grid
         ──────────────────────────────────────────────────────────── -->
    <v-card variant="outlined" class="add-card pa-4 mb-4">
      <div class="d-flex align-center mb-3" style="gap: 8px">
        <v-icon icon="mdi-plus-circle-outline" color="primary" />
        <h2 class="text-h6 font-weight-bold mb-0">Add income source</h2>
        <v-spacer />
        <span class="text-caption text-medium-emphasis">
          FY {{ ui.currentFY }}
        </span>
      </div>

      <div class="type-picker mb-3">
        <button
          v-for="t in OTHER_TYPES"
          :key="t.value"
          type="button"
          class="type-chip"
          :class="{ 'type-chip--active': otherDraft.type === t.value }"
          :style="{
            '--chip-color': `rgb(var(--v-theme-${t.color}))`,
            '--chip-bg': `rgba(var(--v-theme-${t.color}), 0.08)`,
          }"
          @click="otherDraft.type = t.value"
        >
          <v-icon :icon="t.icon" />
          <span class="type-chip__label">{{ t.label }}</span>
        </button>
      </div>
      <div class="text-caption text-medium-emphasis mb-3">
        <v-icon icon="mdi-lightbulb-outline" size="x-small" class="mr-1" />
        {{ metaFor(otherDraft.type as OtherIncomeType).hint }}
      </div>

      <v-row dense>
        <v-col cols="12" md="6">
          <v-select
            :model-value="otherDraft.source"
            :items="sourceOptions"
            item-title="label"
            item-value="value"
            label="Source"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-bank-transfer"
            @update:model-value="(v) => { otherDraft.source = v; onSourceChange(v); }"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="otherDraft.label"
            label="Label (optional)"
            placeholder="e.g. 1BHK rental"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-tag-outline"
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field
            v-model.number="otherDraft.amount"
            type="number"
            label="Amount *"
            prefix="₹"
            variant="outlined"
            density="comfortable"
            :rules="positiveRules"
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="otherDraft.frequency"
            :items="[{ value: 'M', label: 'Monthly' }, { value: 'Q', label: 'Quarterly' }, { value: 'A', label: 'Annual' }]"
            item-title="label"
            item-value="value"
            label="Frequency"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-calendar-clock-outline"
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            v-model="otherDraft.ownerId"
            :items="memberOptions"
            item-title="label"
            item-value="value"
            label="Owner"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-account-outline"
          />
        </v-col>
        <v-col cols="12" md="2" class="d-flex align-center">
          <v-btn
            block
            size="large"
            variant="flat"
            color="primary"
            :disabled="!isAddValid"
            @click="addOtherIncome"
          >
            <v-icon icon="mdi-plus" class="mr-1" />Add
          </v-btn>
        </v-col>
      </v-row>

      <!-- §24(b) home-loan interest + municipal taxes — let-out rental only. Both ANNUAL.
           They reduce taxable house-property income only, never the cash you receive. #32 -->
      <v-expand-transition>
        <v-row v-if="otherDraft.type === 'Rental'" dense class="mt-1">
          <v-col cols="12" md="6">
            <v-text-field
              v-model.number="otherDraft.homeLoanInterest"
              type="number"
              label="Home-loan interest (optional)"
              prefix="₹"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-percent-outline"
              hint="Annual §24(b) interest on a loan for this let-out property — fully deductible"
              persistent-hint
              suffix="/yr"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model.number="otherDraft.municipalTaxes"
              type="number"
              label="Municipal taxes paid (optional)"
              prefix="₹"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-city-variant-outline"
              hint="Annual municipal / property tax you paid — lowers the taxable rental value"
              persistent-hint
              suffix="/yr"
            />
          </v-col>
        </v-row>
      </v-expand-transition>

      <v-expand-transition>
        <v-alert
          v-if="otherDraft.source !== 'Direct'"
          type="info"
          variant="tonal"
          density="comfortable"
          class="mt-3"
        >
          <div class="d-flex align-center" style="gap: 8px">
            <v-checkbox
              v-model="otherDraft.isTaxExempt"
              label="Already taxed at entity level — won't add to my personal tax"
              density="compact"
              hide-details
              class="flex-shrink-0"
            />
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            <v-icon icon="mdi-information-outline" size="x-small" class="mr-1" />
            Enter only the amount that reached your personal bank account in this FY — not the entity's gross.
          </div>
        </v-alert>
      </v-expand-transition>
    </v-card>

    <!-- ────────────────────────────────────────────────────────────
         SEARCH + FILTER + SORT toolbar (web-research pattern)
         Rendered only when there are entries.
         ──────────────────────────────────────────────────────────── -->
    <div v-if="totalCount > 0" class="list-toolbar mb-3">
      <v-text-field
        v-model="searchQuery"
        density="compact"
        variant="outlined"
        placeholder="Search by label, source, or owner"
        prepend-inner-icon="mdi-magnify"
        hide-details
        clearable
        class="list-toolbar__search"
      />
      <v-select
        v-model="sortKey"
        :items="SORT_OPTIONS"
        item-title="label"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        prepend-inner-icon="mdi-sort-variant"
        class="list-toolbar__sort"
      />
    </div>

    <v-chip-group
      v-if="totalCount > 0"
      v-model="activeTypeFilter"
      mandatory
      class="filter-chips mb-4"
    >
      <v-chip value="all" variant="tonal" filter>
        All
        <span class="filter-chips__count">{{ totalCount }}</span>
      </v-chip>
      <v-chip
        v-for="t in OTHER_TYPES"
        :key="t.value"
        :value="t.value"
        :color="t.color"
        :disabled="typeCounts[t.value] === 0"
        variant="tonal"
        filter
      >
        <v-icon :icon="t.icon" size="small" class="mr-1" />
        {{ t.label }}
        <span class="filter-chips__count">{{ typeCounts[t.value] }}</span>
      </v-chip>
    </v-chip-group>

    <!-- ────────────────────────────────────────────────────────────
         LIST — grouped by type · annual-equivalent as primary metric
         ──────────────────────────────────────────────────────────── -->
    <template v-if="filteredLines.length">
      <div
        v-for="t in typesPresent"
        :key="t.value"
        class="type-section mb-4"
      >
        <div class="type-section__header">
          <v-icon :icon="t.icon" :color="t.color" />
          <span class="type-section__title">{{ t.label }}</span>
          <span class="type-section__count">
            {{ linesByType[t.value].length }}
            {{ linesByType[t.value].length === 1 ? "entry" : "entries" }}
          </span>
        </div>

        <v-card
          v-for="line in linesByType[t.value]"
          :key="line.id"
          variant="flat"
          class="income-row mb-3"
          :class="{ 'income-row--just-added': recentlyAddedId === line.id }"
          :style="{
            '--row-accent': `rgb(var(--v-theme-${t.color}))`,
            '--row-accent-soft': `rgba(var(--v-theme-${t.color}), 0.10)`,
          }"
        >
          <v-card-text class="income-row__body">
            <div
              class="income-row__icon"
              :style="{ '--icon-bg': `rgba(var(--v-theme-${t.color}), 0.14)`, '--icon-fg': `rgb(var(--v-theme-${t.color}))` }"
            >
              <v-icon :icon="t.icon" />
            </div>

            <div class="income-row__main">
              <div class="income-row__title">
                {{ line.label || t.label }}
                <span v-if="recentlyAddedId === line.id" class="income-row__new-badge">
                  <v-icon icon="mdi-creation" size="x-small" class="mr-1" />
                  Just added
                </span>
              </div>
              <div class="income-row__meta">
                <span>
                  <v-icon icon="mdi-bank-transfer" size="x-small" class="mr-1" />
                  {{ entityLabelFor(line.sourceEntityId || line.source) }}
                </span>
                <span class="income-row__meta-sep">·</span>
                <span>
                  <v-icon icon="mdi-account-outline" size="x-small" class="mr-1" />
                  {{ ownerLabelFor(line.ownerId) }}
                </span>
                <v-chip
                  v-if="line.isTaxExempt"
                  size="x-small"
                  variant="tonal"
                  color="success"
                  class="ml-2"
                >
                  Tax-exempt
                </v-chip>
                <v-chip
                  v-else
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  class="ml-2"
                >
                  Slab-taxed
                </v-chip>
              </div>
            </div>

            <!-- Amount: annual is the headline (FIRE math depends on it). -->
            <div class="income-row__amount">
              <div class="income-row__primary">
                {{ formatINRCompact(annualOf(line)) }}
                <span class="income-row__primary-unit">/ yr</span>
              </div>
              <div class="income-row__secondary">
                {{ formatINRCompact(line.amount) }}{{ periodSuffix(line.frequency) }}
                ·
                {{ periodLabel(line.frequency) }}
              </div>
            </div>
            <div class="income-row__actions">
              <v-btn
                icon
                variant="text"
                size="small"
                aria-label="Edit"
                class="income-row__action"
                @click="startEdit(line)"
              >
                <v-icon icon="mdi-pencil" size="small" />
              </v-btn>
              <v-btn
                icon
                variant="text"
                size="small"
                aria-label="Delete"
                color="error"
                class="income-row__action"
                @click="household.removeOtherIncome(line.id)"
              >
                <v-icon icon="mdi-delete-outline" size="small" />
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </template>

    <!-- "Filtered no-results" empty state — distinct from the
         "no income at all" empty state below. -->
    <v-card
      v-else-if="totalCount > 0 && filteredLines.length === 0"
      variant="outlined"
      class="filter-empty pa-6 text-center"
    >
      <v-icon icon="mdi-filter-remove-outline" size="x-large" color="medium-emphasis" />
      <div class="text-h6 mt-3 mb-1">No matches</div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        No income lines match your current search or filter.
      </div>
      <v-btn variant="outlined" color="primary" @click="clearFilters">
        <v-icon icon="mdi-restore" class="mr-1" />
        Clear filters
      </v-btn>
    </v-card>

    <EmptyState
      v-else
      icon="mdi-cash-multiple"
      title="No other income tracked yet"
      copy="Rental income, interest, dividends, business distributions — capture them above so they flow into your savings rate and FIRE timeline."
    />

    <!-- ────────────────────────────────────────────────────────────
         EDIT DIALOG
         ──────────────────────────────────────────────────────────── -->
    <v-dialog v-model="showEdit" max-width="800" persistent>
      <v-card v-if="editing">
        <v-card-title class="d-flex align-center" style="gap: 8px">
          <v-icon :icon="metaFor(editing.type).icon" :color="metaFor(editing.type).color" />
          Edit income source
        </v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <v-row dense>
            <v-col cols="6" md="3">
              <v-select v-model="editing.type" :items="OTHER_TYPES" item-title="label" item-value="value" label="Type" variant="outlined" density="comfortable" />
            </v-col>
            <v-col cols="6" md="5">
              <v-select v-model="editing.source" :items="sourceOptions" item-title="label" item-value="value" label="Source" variant="outlined" density="comfortable" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="editing.label" label="Label" variant="outlined" density="comfortable" />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="editing.amount" type="number" label="Amount *" prefix="₹" variant="outlined" density="comfortable" :rules="positiveRules" />
            </v-col>
            <v-col cols="6" md="3">
              <v-select
                v-model="editing.frequency"
                :items="[{ value: 'M', label: 'Monthly' }, { value: 'Q', label: 'Quarterly' }, { value: 'A', label: 'Annual' }]"
                item-title="label"
                item-value="value"
                label="Frequency"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="6" md="3">
              <v-select v-model="editing.ownerId" :items="memberOptions" item-title="label" item-value="value" label="Owner" variant="outlined" density="comfortable" />
            </v-col>
            <v-col cols="6" md="3">
              <v-checkbox v-model="editing.isTaxExempt" label="Tax exempt" density="comfortable" hide-details />
            </v-col>
            <!-- §24(b) interest + municipal taxes — let-out rental only (annual). #32 -->
            <template v-if="editing.type === 'Rental'">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model.number="editing.homeLoanInterest"
                  type="number"
                  label="Home-loan interest (optional)"
                  prefix="₹"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-percent-outline"
                  hint="Annual §24(b) interest — fully deductible for a let-out property"
                  persistent-hint
                  suffix="/yr"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model.number="editing.municipalTaxes"
                  type="number"
                  label="Municipal taxes paid (optional)"
                  prefix="₹"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-city-variant-outline"
                  hint="Annual municipal / property tax you paid"
                  persistent-hint
                  suffix="/yr"
                />
              </v-col>
            </template>
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

<style scoped>
.add-card {
  background: rgb(var(--v-theme-surface));
  border-color: rgba(var(--v-theme-on-surface), 0.08) !important;
  border-radius: 18px !important;
  position: relative;
  overflow: hidden;
  padding-left: 24px !important;
}
.add-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-info)) 100%);
}

/* ---- type-picker chip group ---- */
.type-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 999px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 150ms ease;
}
.type-chip:hover {
  border-color: var(--chip-color);
  color: var(--chip-color);
  background: var(--chip-bg);
}
.type-chip--active {
  border-color: var(--chip-color);
  color: var(--chip-color);
  background: var(--chip-bg);
  box-shadow: 0 0 0 3px var(--chip-bg);
}
.type-chip__label {
  white-space: nowrap;
}

/* ---- list toolbar (search + sort) ---- */
.list-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}
.list-toolbar__search {
  flex: 1 1 auto;
  min-width: 0;
}
.list-toolbar__sort {
  flex: 0 0 220px;
  max-width: 220px;
}
@media (max-width: 600px) {
  .list-toolbar {
    flex-direction: column;
  }
  .list-toolbar__sort {
    flex: 1 1 auto;
    max-width: 100%;
    width: 100%;
  }
}

/* ---- filter-chips ---- */
.filter-chips :deep(.v-chip) {
  border-radius: 999px;
}
.filter-chips__count {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  font-size: 0.7rem;
  font-weight: 600;
  min-width: 18px;
  text-align: center;
}

/* ---- per-type section — editorial eyebrow style ---- */
.type-section { margin-top: 28px; }
.type-section:first-child { margin-top: 8px; }
.type-section__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px 12px;
  margin-bottom: 4px;
}
.type-section__title {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.85);
}
.type-section__count {
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
  margin-left: auto;
  font-weight: 600;
}

/* ---- income row card — left color strip + big mono amount ---- */
.income-row {
  position: relative;
  overflow: hidden;
  border-radius: 16px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06) !important;
  background: rgb(var(--v-theme-surface)) !important;
  transition: box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease;
}
.income-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--row-accent);
}
.income-row:hover {
  border-color: var(--row-accent) !important;
  box-shadow: 0 10px 28px -10px rgba(15, 23, 42, 0.18);
  transform: translateY(-2px);
}
.income-row--just-added {
  border-color: rgba(var(--v-theme-success), 0.55) !important;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-success), 0.12);
  animation: just-added-pulse 1.2s ease;
}
@keyframes just-added-pulse {
  0%   { box-shadow: 0 0 0 0   rgba(var(--v-theme-success), 0.45); }
  100% { box-shadow: 0 0 0 14px rgba(var(--v-theme-success), 0);   }
}
.income-row__body {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 22px 24px 22px 30px;
}
.income-row__icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--icon-bg);
  color: var(--icon-fg);
}
.income-row__icon :deep(.v-icon) {
  color: var(--icon-fg);
}
.income-row__main {
  flex: 1 1 auto;
  min-width: 0;
}
.income-row__title {
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: rgba(var(--v-theme-on-surface), 0.95);
}
.income-row__new-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.income-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.income-row__meta-sep {
  color: rgba(var(--v-theme-on-surface), 0.25);
}
.income-row__amount {
  text-align: right;
  flex-shrink: 0;
  min-width: 140px;
}
.income-row__primary {
  font-family: "JetBrains Mono", "Roboto Mono", monospace;
  font-weight: 800;
  font-size: 1.85rem;
  letter-spacing: -0.025em;
  font-variant-numeric: tabular-nums;
  color: var(--row-accent);
  line-height: 1;
}
.income-row__primary-unit {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-left: 4px;
  text-transform: uppercase;
}
.income-row__secondary {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-family: "JetBrains Mono", "Roboto Mono", monospace;
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}

/* ---- row actions: faded by default, visible on hover (desktop) ---- */
.income-row__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0.35;
  transition: opacity 150ms ease;
}
.income-row:hover .income-row__actions,
.income-row:focus-within .income-row__actions {
  opacity: 1;
}
@media (hover: none) {
  /* Touch devices: actions always visible (no hover state). */
  .income-row__actions { opacity: 1; }
}

.filter-empty {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

@media (max-width: 600px) {
  .income-row__body {
    flex-wrap: wrap;
  }
  .income-row__amount {
    flex: 1 1 auto;
    text-align: left;
  }
}
</style>

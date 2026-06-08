<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import { toAnnual } from "@/lib/cashflow";
import { buildDonutSegments } from "@/lib/donut";
import type { OtherIncomeType, OtherIncomeLine, Period, BusinessLegalKind } from "@/types/household";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import StatDashboard, { type KpiTile } from "@/components/income-layout/StatDashboard.vue";
import CashflowStrip, { type CashflowMonth } from "@/components/income-layout/CashflowStrip.vue";
import FeaturedRail from "@/components/income-layout/FeaturedRail.vue";
import AddTypeChips, { type AddTypeChip } from "@/components/income-layout/AddTypeChips.vue";
import EntryDialog from "@/components/income-layout/EntryDialog.vue";

const household = useHouseholdStore();

interface TypeMeta {
  label: string;
  icon: string;
  color: string;
  hint: string;
}

const TYPE_META: Record<OtherIncomeType, TypeMeta> = {
  Rental: { label: "Rental", icon: "mdi-home-city-outline", color: "primary", hint: "Rent from property" },
  Dividend: { label: "Dividend", icon: "mdi-chart-line-variant", color: "success", hint: "Equity / MF / business dividends" },
  Interest: { label: "Interest", icon: "mdi-bank-outline", color: "info", hint: "Savings, FD, bond interest" },
  CapitalGains: { label: "Capital Gains", icon: "mdi-trending-up", color: "warning", hint: "Realized gains from sales" },
  Other: { label: "Other", icon: "mdi-cash-plus", color: "secondary", hint: "Anything else passive" },
};

const TYPE_LIST = (Object.keys(TYPE_META) as OtherIncomeType[]).map((t) => ({ value: t, meta: TYPE_META[t] }));
const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// ───── derived data ─────

function lineAnnual(line: OtherIncomeLine): number {
  return toAnnual({ amount: line.amount, period: line.frequency });
}
function entityLabelFor(id: string | undefined): string {
  if (!id || id === "Direct") return "Direct";
  return household.data.businesses.find((b) => b.id === id)?.name ?? "—";
}
function ownerLabelFor(id: string): string {
  return household.members.find((m) => m.id === id)?.name || id || "—";
}
function periodFullLabel(p: Period): string {
  return p === "M" ? "monthly" : p === "Q" ? "quarterly" : "annually";
}
function businessDefaultExempt(kind: BusinessLegalKind): boolean {
  return kind === "HUF" || kind === "LLP" || kind === "Partnership";
}

const totalAnnual = computed(() =>
  household.data.otherIncome.reduce((s, o) => s + lineAnnual(o), 0),
);
const taxableAnnual = computed(() =>
  household.data.otherIncome.filter((o) => !o.isTaxExempt).reduce((s, o) => s + lineAnnual(o), 0),
);
const exemptAnnual = computed(() => totalAnnual.value - taxableAnnual.value);

const byType = computed(() => {
  const out = { Rental: 0, Dividend: 0, Interest: 0, CapitalGains: 0, Other: 0 } as Record<OtherIncomeType, number>;
  for (const o of household.data.otherIncome) out[o.type] += lineAnnual(o);
  return out;
});
const typesWithMoney = computed(() =>
  (Object.keys(byType.value) as OtherIncomeType[]).filter((t) => byType.value[t] > 0),
);

interface TypeShare { type: OtherIncomeType; amount: number; share: number; meta: TypeMeta; }
const typeShares = computed<TypeShare[]>(() => {
  const total = totalAnnual.value;
  return typesWithMoney.value
    .map((t) => ({ type: t, amount: byType.value[t], share: total > 0 ? (byType.value[t] / total) * 100 : 0, meta: TYPE_META[t] }))
    .sort((a, b) => b.amount - a.amount);
});
const largestSource = computed(() => typeShares.value[0] ?? null);
const taxableShare = computed(() => (totalAnnual.value > 0 ? (taxableAnnual.value / totalAnnual.value) * 100 : 0));
const exemptShare = computed(() => (totalAnnual.value > 0 ? (exemptAnnual.value / totalAnnual.value) * 100 : 0));

// dashboard inputs
const kpis = computed<KpiTile[]>(() => {
  const tiles: KpiTile[] = [
    { eyebrow: "Total · per year", value: formatINRCompact(totalAnnual.value), accent: true },
    { eyebrow: "Taxable", value: formatINRCompact(taxableAnnual.value), meta: `${taxableShare.value.toFixed(0)}%` },
    { eyebrow: "Exempt", value: formatINRCompact(exemptAnnual.value), meta: `${exemptShare.value.toFixed(0)}%` },
  ];
  if (largestSource.value) {
    tiles.push({
      eyebrow: "Largest",
      icon: largestSource.value.meta.icon,
      iconColor: largestSource.value.meta.color,
      text: largestSource.value.meta.label,
      meta: `${largestSource.value.share.toFixed(0)}%`,
    });
  }
  return tiles;
});

const donutSegments = computed(() =>
  buildDonutSegments(
    typeShares.value.map((s) => ({ key: s.type, value: s.amount, color: s.meta.color })),
    totalAnnual.value,
  ),
);

const cashflowMonths = computed<CashflowMonth[]>(() => {
  const buckets = FY_MONTHS.map((label) => ({
    label,
    total: 0,
    segments: typesWithMoney.value.map((t) => ({ key: t, value: 0, color: TYPE_META[t].color })),
  }));
  for (const line of household.data.otherIncome) {
    const slots = line.frequency === "M" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      : line.frequency === "Q" ? [2, 5, 8, 11] : [11];
    for (const i of slots) {
      buckets[i].total += line.amount;
      const seg = buckets[i].segments.find((s) => s.key === line.type);
      if (seg) seg.value += line.amount;
    }
  }
  return buckets;
});
const cashflowMax = computed(() => Math.max(1, ...cashflowMonths.value.map((b) => b.total)));

interface RailColumn { type: OtherIncomeType; meta: TypeMeta; total: number; entries: OtherIncomeLine[]; }
const typeColumns = computed<RailColumn[]>(() =>
  typesWithMoney.value.map((t) => ({
    type: t,
    meta: TYPE_META[t],
    total: byType.value[t],
    entries: household.data.otherIncome
      .filter((l) => l.type === t)
      .sort((a, b) => lineAnnual(b) - lineAnnual(a)),
  })),
);

const unusedTypeChips = computed<AddTypeChip[]>(() =>
  TYPE_LIST.filter((t) => !typesWithMoney.value.includes(t.value)).map((t) => ({
    value: t.value, label: t.meta.label, icon: t.meta.icon, color: t.meta.color,
  })),
);
const allTypeChips = computed<AddTypeChip[]>(() =>
  TYPE_LIST.map((t) => ({ value: t.value, label: t.meta.label, icon: t.meta.icon, color: t.meta.color })),
);

// ───── form state ─────

function blankDraft(type: OtherIncomeType): Partial<OtherIncomeLine> {
  const sameType = household.data.otherIncome.filter((l) => l.type === type);
  const recent = sameType[sameType.length - 1];
  return {
    type,
    source: recent?.source ?? "Direct",
    sourceEntityId: recent?.sourceEntityId,
    label: "",
    amount: undefined,
    frequency: recent?.frequency ?? "M",
    ownerId: recent?.ownerId ?? household.adults[0]?.id ?? household.members[0]?.id ?? "you",
    isTaxExempt: recent?.isTaxExempt ?? false,
  };
}

const sourceOptions = computed(() => [
  { value: "Direct", label: "Direct (to my account)" },
  ...household.data.businesses.map((b) => ({
    value: b.id,
    label: `${b.name} (${b.legalKind})${b.isOperated === false ? " — passive" : ""}`,
  })),
]);
const memberOptions = computed(() => household.members.map((m) => ({ value: m.id, label: m.name || "Earner" })));
const positiveRules = [(v: number | null | undefined) => (v !== null && v !== undefined && v > 0) || "Amount must be > 0"];
const frequencyItems = [{ value: "M", label: "Monthly" }, { value: "Q", label: "Quarterly" }, { value: "A", label: "Annual" }];

// Add dialog
const showAddDialog = ref(false);
const addDraft = ref<Partial<OtherIncomeLine>>(blankDraft("Rental"));
const amountInputRef = ref<{ focus: () => void } | null>(null);
const addDraftMeta = computed(() => (addDraft.value.type ? TYPE_META[addDraft.value.type as OtherIncomeType] : null));
const isAddValid = computed(
  () => !!addDraft.value.type && !!addDraft.value.ownerId &&
    addDraft.value.amount != null && Number(addDraft.value.amount) > 0,
);
function openAddDialog(type: string) {
  addDraft.value = blankDraft(type as OtherIncomeType);
  showAddDialog.value = true;
  nextTick(() => setTimeout(() => amountInputRef.value?.focus(), 80));
}
function onAddSourceChange(newSrc: string) {
  addDraft.value.source = newSrc;
  if (newSrc === "Direct") {
    addDraft.value.sourceEntityId = undefined;
    addDraft.value.isTaxExempt = false;
    return;
  }
  addDraft.value.sourceEntityId = newSrc;
  const biz = household.data.businesses.find((b) => b.id === newSrc);
  if (biz) addDraft.value.isTaxExempt = businessDefaultExempt(biz.legalKind);
}
function submitAdd() {
  if (!isAddValid.value) return;
  const isEntity = addDraft.value.source !== "Direct";
  household.addOtherIncome({
    type: addDraft.value.type as OtherIncomeType,
    source: isEntity ? (addDraft.value.source as string) : "Direct",
    sourceEntityId: isEntity ? (addDraft.value.source as string) : undefined,
    label: addDraft.value.label,
    amount: Number(addDraft.value.amount),
    frequency: addDraft.value.frequency as Period,
    ownerId: addDraft.value.ownerId as string,
    isTaxExempt: !!addDraft.value.isTaxExempt,
  });
  showAddDialog.value = false;
}
function onAmountKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && isAddValid.value) { e.preventDefault(); submitAdd(); }
}

// Edit dialog
const editing = ref<OtherIncomeLine | null>(null);
const showEdit = computed({ get: () => !!editing.value, set: (v) => { if (!v) editing.value = null; } });
const editMeta = computed(() => (editing.value ? TYPE_META[editing.value.type] : null));
const isEditValid = computed(
  () => !!editing.value && !!editing.value.type && !!editing.value.ownerId && Number(editing.value.amount) > 0,
);
function startEdit(row: OtherIncomeLine) { editing.value = { ...row }; }
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
  });
  editing.value = null;
}
function deleteEditing() {
  if (!editing.value) return;
  household.removeOtherIncome(editing.value.id);
  editing.value = null;
}
</script>

<template>
  <v-container fluid class="py-6 leaf-page">
    <LeafPageHeader
      eyebrow="Income · Passive sources"
      title="Other sources of income"
      description="Rental, dividends, interest, capital gains, business distributions. Tax treatment defaults from entity kind (HUF / LLP / Partnership exempt; Pvt Ltd / Other taxed at slab). Enter only the amount that reached your personal bank account."
    />

    <template v-if="household.data.otherIncome.length">
      <StatDashboard
        :kpis="kpis"
        :donut-segments="donutSegments"
        donut-eyebrow="Composition"
        donut-center-eyebrow="Total / yr"
        :donut-center-value="formatINRCompact(totalAnnual)"
        viz-eyebrow="Monthly cashflow"
      >
        <template #viz>
          <CashflowStrip :months="cashflowMonths" :max="cashflowMax" />
        </template>
      </StatDashboard>

      <div class="section-eyebrow">Browse by type</div>
      <div class="rails-wrap mb-6">
        <FeaturedRail
          v-for="col in typeColumns"
          :key="col.type"
          :title="col.meta.label"
          :icon="col.meta.icon"
          :accent-color="col.meta.color"
          :total="formatINRCompact(col.total)"
          :count-label="`${col.entries.length} ${col.entries.length === 1 ? 'entry' : 'entries'}`"
          :entries="col.entries"
          :add-sub-label="col.meta.label.toLowerCase()"
          @edit="startEdit"
          @add="openAddDialog(col.type)"
        >
          <template #amount="{ entry }">
            {{ formatINRCompact(lineAnnual(entry)) }} <span>/yr</span>
          </template>
          <template #title="{ entry }">{{ entry.label || col.meta.label }}</template>
          <template #meta="{ entry, variant }">
            <template v-if="variant === 'featured'">
              {{ entityLabelFor(entry.sourceEntityId || entry.source) }}
              · {{ ownerLabelFor(entry.ownerId) }}
              · {{ periodFullLabel(entry.frequency) }}
            </template>
            <template v-else>
              {{ entityLabelFor(entry.sourceEntityId || entry.source) }}
            </template>
          </template>
        </FeaturedRail>

        <AddTypeChips
          v-if="unusedTypeChips.length"
          :chips="unusedTypeChips"
          heading="Track a new type of income"
          @select="openAddDialog"
        />
      </div>
    </template>

    <!-- First-time empty state -->
    <v-card v-else variant="outlined" class="empty-state pa-8 text-center mb-6">
      <v-icon icon="mdi-cash-multiple" size="64" color="grey-lighten-1" />
      <h3 class="text-h6 mt-4">No passive income tracked yet</h3>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-5" style="max-width: 540px; margin-inline: auto;">
        Start by adding your first source — rental, dividends, interest, business distributions,
        or anything else that lands in your personal account.
      </p>
      <AddTypeChips :chips="allTypeChips" variant="bare" @select="openAddDialog" />
    </v-card>

    <!-- Add dialog -->
    <EntryDialog
      v-if="addDraftMeta"
      v-model="showAddDialog"
      :icon="addDraftMeta.icon"
      :color="addDraftMeta.color"
      :eyebrow="`Add new · ${addDraftMeta.label.toUpperCase()}`"
      :title="addDraftMeta.hint"
      :submit-label="`Add ${addDraftMeta.label.toLowerCase()}`"
      :submit-disabled="!isAddValid"
      @submit="submitAdd"
    >
      <v-row dense>
        <v-col cols="12" md="8">
          <v-text-field v-model="addDraft.label" label="Label (optional)" :placeholder="`e.g. 1BHK ${addDraftMeta.label.toLowerCase()}`" variant="outlined" density="comfortable" prepend-inner-icon="mdi-tag-outline" />
        </v-col>
        <v-col cols="6" md="4">
          <v-text-field ref="amountInputRef" v-model.number="addDraft.amount" type="number" label="Amount *" prefix="₹" variant="outlined" density="comfortable" :rules="positiveRules" autofocus @keydown="onAmountKeydown" />
        </v-col>
        <v-col cols="6" md="4">
          <v-select v-model="addDraft.frequency" :items="frequencyItems" item-title="label" item-value="value" label="Frequency" variant="outlined" density="comfortable" prepend-inner-icon="mdi-calendar-clock-outline" />
        </v-col>
        <v-col cols="12" md="8">
          <v-select :model-value="addDraft.source" :items="sourceOptions" item-title="label" item-value="value" label="Source" variant="outlined" density="comfortable" prepend-inner-icon="mdi-bank-transfer" @update:model-value="onAddSourceChange" />
        </v-col>
        <v-col cols="6">
          <v-select v-model="addDraft.ownerId" :items="memberOptions" item-title="label" item-value="value" label="Owner" variant="outlined" density="comfortable" prepend-inner-icon="mdi-account-outline" />
        </v-col>
        <v-col cols="6">
          <v-checkbox v-model="addDraft.isTaxExempt" label="Tax-exempt (entity-taxed)" density="comfortable" hide-details :disabled="addDraft.source === 'Direct'" />
        </v-col>
      </v-row>
      <template #hint>
        Press <kbd>Enter</kbd> on the amount to add quickly. Defaults carried from your most recent
        {{ addDraftMeta.label.toLowerCase() }} entry.
      </template>
    </EntryDialog>

    <!-- Edit dialog -->
    <EntryDialog
      v-if="editing && editMeta"
      v-model="showEdit"
      :icon="editMeta.icon"
      :color="editMeta.color"
      eyebrow="Edit"
      title="Edit income source"
      submit-label="Save changes"
      :submit-disabled="!isEditValid"
      show-delete
      @submit="saveEdit"
      @delete="deleteEditing"
    >
      <v-row dense>
        <v-col cols="6" md="3">
          <v-select v-model="editing.type" :items="TYPE_LIST" item-title="meta.label" item-value="value" label="Type" variant="outlined" density="comfortable" />
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
          <v-select v-model="editing.frequency" :items="frequencyItems" item-title="label" item-value="value" label="Frequency" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select v-model="editing.ownerId" :items="memberOptions" item-title="label" item-value="value" label="Owner" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="3">
          <v-checkbox v-model="editing.isTaxExempt" label="Tax exempt" density="comfortable" hide-details />
        </v-col>
      </v-row>
    </EntryDialog>
  </v-container>
</template>

<style scoped>
.leaf-page { max-width: 1280px; }
/* .section-eyebrow is now a global utility in tokens.css (Screen Standard §5) */
.rails-wrap { display: flex; flex-direction: column; gap: 22px; }
.empty-state { border-radius: 18px !important; }
</style>

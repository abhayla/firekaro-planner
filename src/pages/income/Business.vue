<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import { toAnnual } from "@/lib/cashflow";
import { buildDonutSegments } from "@/lib/donut";
import type { Business, BusinessLegalKind, Period } from "@/types/household";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import StatDashboard, { type KpiTile } from "@/components/income-layout/StatDashboard.vue";
import RankedBars, { type RankedBar } from "@/components/income-layout/RankedBars.vue";
import FeaturedRail from "@/components/income-layout/FeaturedRail.vue";
import AddTypeChips, { type AddTypeChip } from "@/components/income-layout/AddTypeChips.vue";
import EntryDialog from "@/components/income-layout/EntryDialog.vue";

const household = useHouseholdStore();

interface KindMeta {
  label: string;
  short: string;
  icon: string;
  color: string;
  hint: string;
}

const KIND_META: Record<BusinessLegalKind, KindMeta> = {
  SoleProp: { label: "Sole Proprietorship", short: "Sole Prop", icon: "mdi-account-tie", color: "primary", hint: "You + the business are the same legal person" },
  FreelanceProf: { label: "Freelance / Professional", short: "Freelance", icon: "mdi-laptop-account", color: "info", hint: "44ADA presumptive profession" },
  Partnership: { label: "Partnership firm", short: "Partnership", icon: "mdi-handshake-outline", color: "warning", hint: "Shared firm — log only your profit share" },
  LLP: { label: "LLP", short: "LLP", icon: "mdi-domain", color: "success", hint: "Limited liability partnership" },
  PvtLtd: { label: "Private Limited", short: "Pvt Ltd", icon: "mdi-office-building-outline", color: "secondary", hint: "Company — log the slice that reached you" },
  HUF: { label: "HUF (business)", short: "HUF", icon: "mdi-home-group", color: "fire-orange", hint: "Hindu Undivided Family running a business" },
  Other: { label: "Other", short: "Other", icon: "mdi-shape-outline", color: "fire-gold", hint: "Anything else" },
};

const KIND_LIST = (Object.keys(KIND_META) as BusinessLegalKind[]).map((k) => ({ value: k, meta: KIND_META[k] }));

// ───── derived data ─────

function personalShare(b: Business): number {
  return toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100);
}
function ownerLabelFor(id: string): string {
  return household.members.find((m) => m.id === id)?.name || id || "—";
}
function periodSuffix(p: Period): string {
  return p === "M" ? "/mo" : p === "Q" ? "/qtr" : "/yr";
}

const activeBusinesses = computed(() => household.data.businesses.filter((b) => b.isOperated !== false));
const passiveBusinesses = computed(() => household.data.businesses.filter((b) => b.isOperated === false));
const totalShare = computed(() => activeBusinesses.value.reduce((s, b) => s + personalShare(b), 0));

const byKind = computed(() => {
  const out = {} as Record<BusinessLegalKind, number>;
  for (const k of Object.keys(KIND_META) as BusinessLegalKind[]) out[k] = 0;
  for (const b of activeBusinesses.value) out[b.legalKind] += personalShare(b);
  return out;
});
const kindsWithMoney = computed(() =>
  (Object.keys(byKind.value) as BusinessLegalKind[]).filter((k) => byKind.value[k] > 0),
);

interface KindShare { kind: BusinessLegalKind; amount: number; share: number; meta: KindMeta; }
const kindShares = computed<KindShare[]>(() => {
  const total = totalShare.value;
  return kindsWithMoney.value
    .map((k) => ({ kind: k, amount: byKind.value[k], share: total > 0 ? (byKind.value[k] / total) * 100 : 0, meta: KIND_META[k] }))
    .sort((a, b) => b.amount - a.amount);
});
const largestBusiness = computed(() =>
  activeBusinesses.value.length
    ? [...activeBusinesses.value].sort((a, b) => personalShare(b) - personalShare(a))[0]
    : null,
);

const kpis = computed<KpiTile[]>(() => {
  const tiles: KpiTile[] = [
    { eyebrow: "Your share · per year", value: formatINRCompact(totalShare.value), accent: true },
    { eyebrow: "Active", value: String(activeBusinesses.value.length), meta: `${kindsWithMoney.value.length} ${kindsWithMoney.value.length === 1 ? "kind" : "kinds"}` },
    { eyebrow: "Passive entities", value: String(passiveBusinesses.value.length), meta: "label-only" },
  ];
  if (largestBusiness.value) {
    tiles.push({
      eyebrow: "Largest",
      icon: KIND_META[largestBusiness.value.legalKind].icon,
      iconColor: KIND_META[largestBusiness.value.legalKind].color,
      text: largestBusiness.value.name,
      meta: `${formatINRCompact(personalShare(largestBusiness.value))}/yr`,
    });
  }
  return tiles;
});

const donutSegments = computed(() =>
  buildDonutSegments(
    kindShares.value.map((s) => ({ key: s.kind, value: s.amount, color: s.meta.color })),
    totalShare.value,
  ),
);

const rankedBars = computed<RankedBar[]>(() =>
  kindShares.value.map((s) => ({
    key: s.kind, label: s.meta.short, amount: formatINRCompact(s.amount), share: s.share, color: s.meta.color, icon: s.meta.icon,
  })),
);

interface KindColumn { kind: BusinessLegalKind; meta: KindMeta; total: number; entries: Business[]; }
const kindColumns = computed<KindColumn[]>(() =>
  kindsWithMoney.value.map((k) => ({
    kind: k,
    meta: KIND_META[k],
    total: byKind.value[k],
    entries: activeBusinesses.value.filter((b) => b.legalKind === k).sort((a, b) => personalShare(b) - personalShare(a)),
  })),
);

const unusedKindChips = computed<AddTypeChip[]>(() =>
  KIND_LIST.filter((k) => !kindsWithMoney.value.includes(k.value)).map((k) => ({
    value: k.value, label: k.meta.short, icon: k.meta.icon, color: k.meta.color,
  })),
);
const allKindChips = computed<AddTypeChip[]>(() =>
  KIND_LIST.map((k) => ({ value: k.value, label: k.meta.short, icon: k.meta.icon, color: k.meta.color })),
);

// ───── form state ─────

function blankDraft(kind: BusinessLegalKind, operated = true): Partial<Business> {
  const sameKind = household.data.businesses.filter((b) => b.legalKind === kind);
  const recent = sameKind[sameKind.length - 1];
  return {
    name: "",
    legalKind: kind,
    annualProfit: undefined,
    frequency: recent?.frequency ?? "A",
    sharePercent: recent?.sharePercent ?? 100,
    ownerId: recent?.ownerId ?? household.adults[0]?.id ?? household.members[0]?.id ?? "you",
    isOperated: operated,
  };
}

const earnerOptions = computed(() => household.adults.map((m) => ({ value: m.id, label: m.name || "Earner" })));
const nameRules = [(v: string) => (!!v && v.trim().length > 0) || "Name required"];
const profitRules = [(v: number | null | undefined) => (v !== null && v !== undefined && v >= 0) || "Profit must be >= 0"];
const sharePercentRules = [(v: number | null | undefined) => (v !== null && v !== undefined && v >= 1 && v <= 100) || "1-100"];
const frequencyItems = [{ value: "M", label: "Monthly" }, { value: "Q", label: "Quarterly" }, { value: "A", label: "Annual" }];

// Add dialog
const showAddDialog = ref(false);
const addDraft = ref<Partial<Business>>(blankDraft("SoleProp"));
const profitInputRef = ref<{ focus: () => void } | null>(null);
const addDraftMeta = computed(() => (addDraft.value.legalKind ? KIND_META[addDraft.value.legalKind as BusinessLegalKind] : null));
const isAddValid = computed(
  () => !!addDraft.value.name?.trim() && !!addDraft.value.ownerId &&
    addDraft.value.annualProfit != null && Number(addDraft.value.annualProfit) >= 0 &&
    Number(addDraft.value.sharePercent) >= 1 && Number(addDraft.value.sharePercent) <= 100,
);
function openAddDialog(kind: string) {
  addDraft.value = blankDraft(kind as BusinessLegalKind);
  showAddDialog.value = true;
  nextTick(() => setTimeout(() => profitInputRef.value?.focus(), 80));
}
function submitAdd() {
  if (!isAddValid.value) return;
  household.addBusiness({
    name: addDraft.value.name as string,
    legalKind: addDraft.value.legalKind as BusinessLegalKind,
    annualProfit: Number(addDraft.value.annualProfit),
    frequency: addDraft.value.frequency as Period,
    sharePercent: Number(addDraft.value.sharePercent),
    ownerId: addDraft.value.ownerId as string,
    isOperated: addDraft.value.isOperated ?? true,
  });
  showAddDialog.value = false;
}
function onProfitKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && isAddValid.value) { e.preventDefault(); submitAdd(); }
}

// Edit dialog
const editing = ref<Business | null>(null);
const showEdit = computed({ get: () => !!editing.value, set: (v) => { if (!v) editing.value = null; } });
const editMeta = computed(() => (editing.value ? KIND_META[editing.value.legalKind] : null));
const isEditValid = computed(
  () => !!editing.value && !!editing.value.name?.trim() && !!editing.value.ownerId &&
    Number(editing.value.annualProfit) >= 0 &&
    Number(editing.value.sharePercent) >= 1 && Number(editing.value.sharePercent) <= 100,
);
function startEdit(row: Business) { editing.value = { ...row }; }
function saveEdit() {
  if (!editing.value) return;
  household.updateBusiness(editing.value.id, {
    name: editing.value.name,
    legalKind: editing.value.legalKind,
    annualProfit: Number(editing.value.annualProfit),
    frequency: editing.value.frequency,
    sharePercent: Number(editing.value.sharePercent),
    ownerId: editing.value.ownerId,
    isOperated: editing.value.isOperated,
  });
  editing.value = null;
}
function deleteEditing() {
  if (!editing.value) return;
  household.removeBusiness(editing.value.id);
  editing.value = null;
}
</script>

<template>
  <v-container fluid class="py-6 leaf-page">
    <LeafPageHeader
      eyebrow="Income · Business"
      title="Business income"
      description="Businesses you operate (sole prop, freelance, LLP, Pvt Ltd, HUF, partnership). Tax treatment is auto-resolved by legal kind. Log only your profit share — the slice that reaches your personal account."
    />

    <template v-if="activeBusinesses.length">
      <StatDashboard
        :kpis="kpis"
        :donut-segments="donutSegments"
        donut-eyebrow="By legal kind"
        donut-center-eyebrow="Share / yr"
        :donut-center-value="formatINRCompact(totalShare)"
        viz-eyebrow="Composition · ranked"
      >
        <template #viz>
          <RankedBars :bars="rankedBars" />
        </template>
      </StatDashboard>

      <div class="section-eyebrow">Browse by legal kind</div>
      <div class="rails-wrap mb-6">
        <FeaturedRail
          v-for="col in kindColumns"
          :key="col.kind"
          :title="col.meta.label"
          :icon="col.meta.icon"
          :accent-color="col.meta.color"
          :total="formatINRCompact(col.total)"
          :count-label="`${col.entries.length} ${col.entries.length === 1 ? 'business' : 'businesses'}`"
          :entries="col.entries"
          :add-sub-label="col.meta.short.toLowerCase()"
          @edit="startEdit"
          @add="openAddDialog(col.kind)"
        >
          <template #amount="{ entry }">
            {{ formatINRCompact(personalShare(entry)) }} <span>/yr</span>
          </template>
          <template #title="{ entry }">{{ entry.name }}</template>
          <template #meta="{ entry, variant }">
            <template v-if="variant === 'featured'">
              {{ entry.sharePercent }}% share
              · {{ formatINRCompact(entry.annualProfit) }}{{ periodSuffix(entry.frequency) }} profit
              · {{ ownerLabelFor(entry.ownerId) }}
            </template>
            <template v-else>
              {{ entry.sharePercent }}% · {{ ownerLabelFor(entry.ownerId) }}
            </template>
          </template>
        </FeaturedRail>

        <AddTypeChips
          v-if="unusedKindChips.length"
          :chips="unusedKindChips"
          heading="Add a business of a different legal kind"
          @select="openAddDialog"
        />
      </div>

      <!-- Passive legal entities (label-only) -->
      <template v-if="passiveBusinesses.length">
        <div class="section-eyebrow">Passive legal entities</div>
        <div class="passive-grid mb-6">
          <button
            v-for="biz in passiveBusinesses"
            :key="biz.id"
            type="button"
            class="passive-card"
            :style="{ '--card-accent': `rgb(var(--v-theme-${KIND_META[biz.legalKind].color}))` }"
            @click="startEdit(biz)"
          >
            <v-icon :icon="KIND_META[biz.legalKind].icon" />
            <div class="passive-card__body">
              <div class="passive-card__name">{{ biz.name }}</div>
              <div class="passive-card__kind">{{ KIND_META[biz.legalKind].short }} · label-only</div>
            </div>
            <v-icon icon="mdi-pencil" size="small" class="passive-card__edit" />
          </button>
        </div>
      </template>
    </template>

    <!-- First-time empty state -->
    <v-card v-else variant="outlined" class="empty-state pa-8 text-center mb-6">
      <v-icon icon="mdi-briefcase-outline" size="64" color="grey-lighten-1" />
      <h3 class="text-h6 mt-4">No businesses tracked yet</h3>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-5" style="max-width: 540px; margin-inline: auto;">
        Capture your own businesses so profit shares feed income totals. Tax treatment is
        auto-resolved by legal kind — pick one to start.
      </p>
      <AddTypeChips :chips="allKindChips" variant="bare" @select="openAddDialog" />
    </v-card>

    <!-- Add dialog -->
    <EntryDialog
      v-if="addDraftMeta"
      v-model="showAddDialog"
      :icon="addDraftMeta.icon"
      :color="addDraftMeta.color"
      :eyebrow="`Add new · ${addDraftMeta.short.toUpperCase()}`"
      :title="addDraftMeta.hint"
      submit-label="Add business"
      :submit-disabled="!isAddValid"
      @submit="submitAdd"
    >
      <v-row dense>
        <v-col cols="12" md="7">
          <v-text-field v-model="addDraft.name" label="Business name *" :rules="nameRules" variant="outlined" density="comfortable" prepend-inner-icon="mdi-tag-outline" />
        </v-col>
        <v-col cols="12" md="5">
          <v-select v-model="addDraft.legalKind" :items="KIND_LIST" item-title="meta.label" item-value="value" label="Legal kind" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="4">
          <v-text-field ref="profitInputRef" v-model.number="addDraft.annualProfit" type="number" label="Profit *" prefix="₹" :rules="profitRules" variant="outlined" density="comfortable" autofocus @keydown="onProfitKeydown" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select v-model="addDraft.frequency" :items="frequencyItems" item-title="label" item-value="value" label="Per" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="addDraft.sharePercent" type="number" label="Share % *" :rules="sharePercentRules" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select v-model="addDraft.ownerId" :items="earnerOptions" item-title="label" item-value="value" label="Owner" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="12">
          <v-checkbox v-model="addDraft.isOperated" label="Active business (operated for profit) — uncheck for a passive label-only legal entity" density="comfortable" hide-details />
        </v-col>
      </v-row>
      <template #hint>
        Press <kbd>Enter</kbd> on profit to add quickly. Defaults carried from your most recent
        {{ addDraftMeta.short.toLowerCase() }} entry.
      </template>
    </EntryDialog>

    <!-- Edit dialog -->
    <EntryDialog
      v-if="editing && editMeta"
      v-model="showEdit"
      :icon="editMeta.icon"
      :color="editMeta.color"
      eyebrow="Edit"
      title="Edit business"
      submit-label="Save changes"
      :submit-disabled="!isEditValid"
      show-delete
      @submit="saveEdit"
      @delete="deleteEditing"
    >
      <v-row dense>
        <v-col cols="12" md="7">
          <v-text-field v-model="editing.name" label="Business name *" :rules="nameRules" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="12" md="5">
          <v-select v-model="editing.legalKind" :items="KIND_LIST" item-title="meta.label" item-value="value" label="Legal kind" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="4">
          <v-text-field v-model.number="editing.annualProfit" type="number" label="Profit *" prefix="₹" :rules="profitRules" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select v-model="editing.frequency" :items="frequencyItems" item-title="label" item-value="value" label="Per" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="editing.sharePercent" type="number" label="Share % *" :rules="sharePercentRules" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="6" md="3">
          <v-select v-model="editing.ownerId" :items="earnerOptions" item-title="label" item-value="value" label="Owner" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="12">
          <v-checkbox v-model="editing.isOperated" label="Active business (operated for profit)" density="comfortable" hide-details />
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

.passive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.passive-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-left: 4px solid var(--card-accent);
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  cursor: pointer;
  text-align: left;
  transition: all 150ms ease;
}
.passive-card:hover { background: rgb(var(--v-theme-surface)); box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.18); }
.passive-card :deep(.v-icon) { color: var(--card-accent) !important; }
.passive-card__body { flex: 1 1 auto; min-width: 0; }
.passive-card__name { font-weight: 700; font-size: 0.92rem; color: rgba(var(--v-theme-on-surface), 0.9); }
.passive-card__kind { font-size: 0.72rem; color: rgba(var(--v-theme-on-surface), 0.55); }
.passive-card__edit { opacity: 0.4; }
</style>

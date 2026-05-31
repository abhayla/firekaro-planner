<script setup lang="ts">
import { computed, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import type { Business, BusinessLegalKind, Period } from "@/types/household";
import EmptyState from "@/components/shared/EmptyState.vue";
import { BUSINESS_LEGAL_KINDS as LEGAL_KINDS, labelForLegalKind } from "@/lib/business-legal-kinds";

const household = useHouseholdStore();

const earnerOptions = computed(() =>
  household.earners.map((m) => ({ value: m.id, label: m.name || "Earner" })),
);

const bizDraft = ref<Partial<Business>>({
  name: "",
  legalKind: "SoleProp",
  annualProfit: undefined,
  frequency: "A",
  sharePercent: 100,
  ownerId: household.earners[0]?.id ?? household.members[0]?.id ?? "you",
  isOperated: true,
});

// Q5 (v3) — reactive validation. Passive businesses (isOperated=false) accept 0 profit.
const nameRules = [(v: string) => (!!v && v.trim().length > 0) || "Name required"];
const profitRules = [
  (v: number | null | undefined) =>
    (v !== null && v !== undefined && v >= 0) || "Profit must be >= 0",
];
const sharePercentRules = [
  (v: number | null | undefined) => (v !== null && v !== undefined && v >= 1 && v <= 100) || "1-100",
];
const isAddValid = computed(() =>
  !!bizDraft.value.name?.trim() &&
  !!bizDraft.value.ownerId &&
  bizDraft.value.annualProfit !== undefined && Number(bizDraft.value.annualProfit) >= 0 &&
  Number(bizDraft.value.sharePercent) >= 1 && Number(bizDraft.value.sharePercent) <= 100,
);
const isEditValid = computed(() =>
  !!editing.value && !!editing.value.name?.trim() &&
  !!editing.value.ownerId &&
  Number(editing.value.annualProfit) >= 0 &&
  Number(editing.value.sharePercent) >= 1 && Number(editing.value.sharePercent) <= 100,
);

function addBusiness() {
  if (!isAddValid.value) return;
  household.addBusiness({
    name: bizDraft.value.name as string,
    legalKind: bizDraft.value.legalKind as BusinessLegalKind,
    annualProfit: Number(bizDraft.value.annualProfit),
    frequency: bizDraft.value.frequency as Period,
    sharePercent: Number(bizDraft.value.sharePercent),
    ownerId: bizDraft.value.ownerId as string,
    isOperated: bizDraft.value.isOperated ?? true,
  });
  bizDraft.value = {
    name: "",
    legalKind: "SoleProp",
    annualProfit: undefined,
    frequency: "A",
    sharePercent: 100,
    ownerId: bizDraft.value.ownerId,
    isOperated: true,
  };
}

// Q3 (v3): group businesses for the list view — Active (isOperated: true, generating profit)
// vs Passive (isOperated: false, legal entities kept as source labels for other income).
const activeBusinesses = computed(() =>
  household.data.businesses.filter((b) => b.isOperated !== false),
);
const passiveBusinesses = computed(() =>
  household.data.businesses.filter((b) => b.isOperated === false),
);

// Q4 (v3) — pencil-edit dialog pattern.
const editing = ref<Business | null>(null);
const showEdit = computed({
  get: () => !!editing.value,
  set: (v) => { if (!v) editing.value = null; },
});
function startEdit(row: Business) {
  editing.value = { ...row };
}
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
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-2">
      Active businesses you operate (Pvt Ltd, LLP, sole prop, freelance, HUF, partnership).
      Tax treatment is auto-resolved by legal kind — invisible to you. Uncheck "Active business"
      to register a passive entity (HUF/family-LLP) used only as a label for other income.
    </div>
    <v-card variant="outlined" class="pa-3 mb-2">
      <v-row dense align="center">
        <v-col cols="12" md="3">
          <v-text-field v-model="bizDraft.name" label="Business name *" density="compact" :rules="nameRules" />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="bizDraft.legalKind"
            :items="LEGAL_KINDS"
            item-title="label"
            item-value="value"
            label="Legal kind"
            density="compact"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model.number="bizDraft.annualProfit" type="number" label="Profit *" prefix="₹" density="compact" :rules="profitRules" />
        </v-col>
        <v-col cols="3" md="1">
          <v-select
            v-model="bizDraft.frequency"
            :items="[{ value: 'M', label: '/mo' }, { value: 'Q', label: '/qtr' }, { value: 'A', label: '/yr' }]"
            item-title="label"
            item-value="value"
            label="Per"
            density="compact"
          />
        </v-col>
        <v-col cols="3" md="1">
          <v-text-field v-model.number="bizDraft.sharePercent" type="number" label="Share % *" density="compact" :rules="sharePercentRules" />
        </v-col>
        <v-col cols="6" md="2" class="text-right">
          <v-select
            v-model="bizDraft.ownerId"
            :items="earnerOptions"
            item-title="label"
            item-value="value"
            label="Owner"
            density="compact"
            class="mr-1"
            style="display: inline-block; width: 60%"
          />
          <v-btn size="small" variant="flat" color="primary" :disabled="!isAddValid" @click="addBusiness">
            <v-icon icon="mdi-plus" />
          </v-btn>
        </v-col>
      </v-row>
      <v-row dense>
        <v-col cols="12">
          <v-checkbox
            v-model="bizDraft.isOperated"
            label="Active business (operated for profit) — uncheck for a passive legal entity used only as an income source"
            density="compact"
            hide-details
          />
        </v-col>
      </v-row>
    </v-card>

    <div v-if="activeBusinesses.length" class="mt-3">
      <div class="text-caption text-medium-emphasis font-weight-bold mb-1">Active</div>
      <v-list density="compact" class="bg-transparent">
        <v-list-item v-for="biz in activeBusinesses" :key="biz.id">
          <v-list-item-title>
            {{ biz.name }} ({{ labelForLegalKind(biz.legalKind) }})
          </v-list-item-title>
          <v-list-item-subtitle>
            Profit {{ formatINRCompact(biz.annualProfit) }}{{ biz.frequency === "M" ? "/mo" : biz.frequency === "Q" ? "/qtr" : "/yr" }} • Your share {{ biz.sharePercent }}%
            • Owner: {{ household.members.find((m) => m.id === biz.ownerId)?.name }}
          </v-list-item-subtitle>
          <template #append>
            <v-btn icon variant="text" size="x-small" aria-label="Edit" @click="startEdit(biz)">
              <v-icon icon="mdi-pencil" />
            </v-btn>
            <v-btn icon variant="text" size="x-small" aria-label="Delete" @click="household.removeBusiness(biz.id)">
              <v-icon icon="mdi-delete" />
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
    </div>

    <div v-if="passiveBusinesses.length" class="mt-3">
      <div class="text-caption text-medium-emphasis font-weight-bold mb-1">Passive entities (no operating profit)</div>
      <v-list density="compact" class="bg-transparent">
        <v-list-item v-for="biz in passiveBusinesses" :key="biz.id">
          <v-list-item-title>
            {{ biz.name }} ({{ labelForLegalKind(biz.legalKind) }})
          </v-list-item-title>
          <v-list-item-subtitle>
            Used only as an Other Income source — no operating profit recorded.
          </v-list-item-subtitle>
          <template #append>
            <v-btn icon variant="text" size="x-small" aria-label="Edit" @click="startEdit(biz)">
              <v-icon icon="mdi-pencil" />
            </v-btn>
            <v-btn icon variant="text" size="x-small" aria-label="Delete" @click="household.removeBusiness(biz.id)">
              <v-icon icon="mdi-delete" />
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
    </div>

    <EmptyState
      v-if="!activeBusinesses.length && !passiveBusinesses.length"
      icon="mdi-briefcase-outline"
      title="No businesses tracked yet"
      copy="Capture your own businesses (sole prop, LLP, Pvt Ltd, freelance practice) so profit shares feed income totals and book-keeping decisions stay legible."
    />

    <v-dialog v-model="showEdit" max-width="900" persistent>
      <v-card v-if="editing">
        <v-card-title>Edit business</v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field v-model="editing.name" label="Business name *" density="comfortable" :rules="nameRules" />
            </v-col>
            <v-col cols="12" md="6">
              <v-select v-model="editing.legalKind" :items="LEGAL_KINDS" item-title="label" item-value="value" label="Legal kind" density="comfortable" />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="editing.annualProfit" type="number" label="Profit *" prefix="₹" density="comfortable" :rules="profitRules" />
            </v-col>
            <v-col cols="6" md="3">
              <v-select
                v-model="editing.frequency"
                :items="[{ value: 'M', label: '/mo' }, { value: 'Q', label: '/qtr' }, { value: 'A', label: '/yr' }]"
                item-title="label"
                item-value="value"
                label="Per"
                density="comfortable"
              />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="editing.sharePercent" type="number" label="Share % *" density="comfortable" :rules="sharePercentRules" />
            </v-col>
            <v-col cols="6" md="3">
              <v-select v-model="editing.ownerId" :items="earnerOptions" item-title="label" item-value="value" label="Owner" density="comfortable" />
            </v-col>
            <v-col cols="12">
              <v-checkbox v-model="editing.isOperated" label="Active business (operated for profit)" density="comfortable" hide-details />
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

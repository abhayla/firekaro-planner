<script setup lang="ts">
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import LimitMeter from "@/components/shared/LimitMeter.vue";
import MemberLensBadge from "@/components/shared/MemberLensBadge.vue";

// #81 Phase 3: months-covered = liquid ÷ monthly burn — member-LENSED via the SAME-SCOPE resolver:
// a member's OWN liquid ÷ a member's OWN burn (× the same 6-month target). Never member-liquid ÷
// household-burn (the #23 trap). On the default lens both are the household figures (byte-identical).
const fire = useFireDerive();
const fh = computed(() => fire.memberFinancials.value);
const monthlyBurn = computed(() => Math.round(fh.value.annualExpenses / 12));
const liquidAssets = computed(() => fh.value.liquid);

const monthsCovered = computed(() =>
  monthlyBurn.value > 0 ? liquidAssets.value / monthlyBurn.value : 0,
);

const targetMonths = 6;
const targetCorpus = computed(() => Math.round(monthlyBurn.value * targetMonths));
const gap = computed(() => Math.max(0, targetCorpus.value - liquidAssets.value));

const status = computed<"adequate" | "approaching" | "under">(() => {
  if (monthsCovered.value >= targetMonths) return "adequate";
  if (monthsCovered.value >= targetMonths * 0.5) return "approaching";
  return "under";
});
const statusColor = computed(() =>
  status.value === "adequate" ? "success" : status.value === "approaching" ? "warning" : "error",
);
</script>

<template>
  <v-container fluid class="py-6 ef-page">
    <LeafPageHeader
      eyebrow="Financial Health · Emergency Fund"
      title="Emergency Fund"
      description="Standard advisor benchmark is 6 months of monthly burn parked in liquid assets you can reach in a week."
    >
      <template #actions>
        <MemberLensBadge />
      </template>
    </LeafPageHeader>

    <v-row dense>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-6 text-center ef-hero">
          <div class="ef-hero__label">Coverage</div>
          <div :class="['ef-hero__value', 'text-currency', `text-${statusColor}`]">
            {{ monthsCovered.toFixed(1) }}
          </div>
          <div class="text-caption text-medium-emphasis font-mono">months of burn</div>
          <v-chip :color="statusColor" variant="tonal" class="mt-3" size="small">{{ status }}</v-chip>
        </v-card>
      </v-col>
      <v-col cols="12" md="8">
        <PanelCard title="The math" icon="mdi-calculator-variant-outline" icon-color="primary" class="h-100">
          <LimitMeter
            class="mb-4"
            :label="`Liquid assets vs ${targetMonths}-month target`"
            :used="liquidAssets"
            :limit="targetCorpus"
            :color="statusColor"
            :format-value="formatINRCompact"
          />
          <div class="d-flex justify-space-between mb-2">
            <span class="text-medium-emphasis">Liquid assets (FD + Cash)</span>
            <span class="font-weight-medium text-currency">{{ formatINRCompact(liquidAssets) }}</span>
          </div>
          <div class="d-flex justify-space-between mb-2">
            <span class="text-medium-emphasis">Monthly burn (avg + recurring)</span>
            <span class="font-weight-medium text-currency">{{ formatINRCompact(monthlyBurn) }}</span>
          </div>
          <v-divider class="my-2" />
          <div class="d-flex justify-space-between">
            <span class="text-medium-emphasis">Target corpus ({{ targetMonths }} months)</span>
            <span class="font-weight-medium text-currency">{{ formatINRCompact(targetCorpus) }}</span>
          </div>
          <v-alert v-if="gap > 0" type="warning" density="compact" variant="tonal" class="mt-3">
            Add <strong class="text-currency">{{ formatINRCompact(gap) }}</strong> in liquid assets to reach the {{ targetMonths }}-month benchmark.
          </v-alert>
          <v-alert v-else type="success" density="compact" variant="tonal" class="mt-3">
            Emergency fund is adequate.
          </v-alert>
        </PanelCard>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.ef-page {
  max-width: 1280px;
}
.ef-hero__value {
  font-size: var(--type-3xl);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin-top: 4px;
}
.ef-hero__label {
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  font-weight: var(--weight-semibold);
}
</style>

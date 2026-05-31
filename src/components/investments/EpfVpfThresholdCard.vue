<script setup lang="ts">
/**
 * EPF / VPF threshold breakdown — surfaces the ₹2.5L tax-free threshold
 * + after-tax effective yield for high-basic earners whose VPF top-up
 * exceeds the limit.
 *
 * Phase 4 Stage K per docs/goals/build-firekaro-mvp-v5.md §7.
 * Audit Entry #15 A15.4-5 — consumer of lib/epf-vpf.
 *
 * Feature-gated on investments.epf.
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFeaturesStore } from "@/stores/features";
import { calculateEpfVpfYear, EPF_VPF_TAX_FREE_THRESHOLD } from "@/lib/epf-vpf";
import { formatINRCompact, formatPercent } from "@/lib/formatters";

const household = useHouseholdStore();
const features = useFeaturesStore();

const epfHoldings = computed(() =>
  household.data.investments.filter((i) => i.type === "EPF_VPF"),
);

const annualContribution = computed(() =>
  epfHoldings.value.reduce((s, i) => s + (i.monthlyContribution ?? 0) * 12, 0),
);

const breakdown = computed(() =>
  calculateEpfVpfYear({
    annualContribution: annualContribution.value,
    // Conservative marginal slab; Stage J derives the real one.
    marginalSlabRate: 0.30,
  }),
);

const showCard = computed(
  () => features.isEnabled("investments.epf") && annualContribution.value > 0,
);

const aboveThreshold = computed(
  () => annualContribution.value > EPF_VPF_TAX_FREE_THRESHOLD,
);
</script>

<template>
  <v-card
    v-if="showCard"
    variant="outlined"
    class="epf-vpf-card mb-3"
    data-testid="epf-vpf-threshold-card"
  >
    <v-card-title class="d-flex align-center" style="gap: 8px">
      <v-icon icon="mdi-shield-account" color="warning" />
      <span>EPF / VPF threshold</span>
      <v-chip size="x-small" variant="tonal" color="warning" class="ml-auto">
        ₹2.5L limit
      </v-chip>
    </v-card-title>
    <v-card-text>
      <div class="text-body-2 text-medium-emphasis mb-3">
        EPF contributions up to ₹2.5L/yr are tax-free; interest on the
        EXCESS is taxed at slab annually (audit Entry #15).
      </div>
      <div class="epf-grid">
        <div>
          <div class="epf-label">Annual contribution</div>
          <div class="epf-value">{{ formatINRCompact(annualContribution) }}</div>
        </div>
        <div>
          <div class="epf-label">Tax-free portion</div>
          <div class="epf-value">{{ formatINRCompact(breakdown.taxFreeContribution) }}</div>
        </div>
        <div v-if="aboveThreshold">
          <div class="epf-label">Excess (taxable)</div>
          <div class="epf-value text-warning">{{ formatINRCompact(breakdown.taxableContribution) }}</div>
        </div>
        <div>
          <div class="epf-label">Effective yield (post-tax)</div>
          <!-- formatPercent expects whole-number percent (7.3, not 0.073) -->
          <div class="epf-value">{{ formatPercent(breakdown.effectiveYield * 100) }}</div>
          <div v-if="aboveThreshold" class="epf-detail">below 8.25% notional</div>
        </div>
      </div>
      <v-alert
        v-if="aboveThreshold"
        type="info"
        variant="tonal"
        density="compact"
        class="mt-3"
      >
        At a 30% slab, the excess ₹{{ Math.round(breakdown.taxableContribution / 1000) }}k earns
        ~{{ formatPercent(breakdown.taxableInterest / breakdown.taxableContribution * (1 - 0.30) * 100) }}
        post-tax — lower than equity alternatives. Consider redirecting
        new VPF top-ups to ELSS or equity MF.
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.epf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
.epf-label { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.6); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
.epf-value { font-size: 1.25rem; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
.epf-detail { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.55); margin-top: 2px; }
</style>

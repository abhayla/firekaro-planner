<script setup lang="ts">
/**
 * NPS planning card — projects current NPS corpus + monthly SIP to
 * retirement and renders PFRDA 2025 60/20/20 split + cap-suggestion.
 *
 * Phase 4 Stage K per docs/goals/build-firekaro-mvp-v5.md §7.
 * Audit Entry #14 A14.3 — consumer of lib/nps-withdrawal.
 *
 * Feature-gated on investments.nps.
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFeaturesStore } from "@/stores/features";
import { useFireDerive } from "@/lib/useFireDerive";
import { calculateNpsWithdrawal, suggestNpsCap } from "@/lib/nps-withdrawal";
import { formatINRCompact } from "@/lib/formatters";

const household = useHouseholdStore();
const features = useFeaturesStore();
const fire = useFireDerive();

const npsHoldings = computed(() =>
  household.data.investments.filter((i) => i.type === "NPS"),
);

const currentNps = computed(() =>
  npsHoldings.value.reduce((s, i) => s + i.value, 0),
);

const annualNpsContribution = computed(() =>
  npsHoldings.value.reduce((s, i) => s + (i.monthlyContribution ?? 0) * 12, 0),
);

const yearsToRetirement = computed(() => {
  const earner = household.earners[0];
  const retire = earner?.targetRetirementAge ?? 60;
  return Math.max(0, retire - (fire.anchorAge.value || 35));
});

const projectedCorpus = computed(() => {
  // FV: current + annuity (annual contribution at NPS return for years).
  const r = 0.09; // research-grounded NPS return default
  const yrs = yearsToRetirement.value;
  if (yrs <= 0) return currentNps.value;
  const fvCurrent = currentNps.value * Math.pow(1 + r, yrs);
  const annual = annualNpsContribution.value;
  const fvAnnuity =
    annual > 0 && r > 0
      ? annual * ((Math.pow(1 + r, yrs) - 1) / r)
      : annual * yrs;
  return fvCurrent + fvAnnuity;
});

const split = computed(() =>
  calculateNpsWithdrawal({ totalCorpus: projectedCorpus.value }),
);

const cap = computed(() =>
  suggestNpsCap(projectedCorpus.value, fire.annualExpensesToday.value),
);

const showCard = computed(
  () => features.isEnabled("investments.nps") && (currentNps.value > 0 || annualNpsContribution.value > 0),
);
</script>

<template>
  <v-card
    v-if="showCard"
    variant="outlined"
    class="nps-planning-card mb-3"
    data-testid="nps-planning-card"
  >
    <v-card-title class="d-flex align-center" style="gap: 8px">
      <v-icon icon="mdi-piggy-bank" color="info" />
      <span>NPS withdrawal planning</span>
      <v-chip size="x-small" variant="tonal" color="info" class="ml-auto">
        PFRDA 2025
      </v-chip>
    </v-card-title>
    <v-card-text>
      <div class="text-body-2 text-medium-emphasis mb-3">
        Projected NPS corpus at retirement and the 60/20/20 lump-sum
        + annuity split per PFRDA 2025 (audit Entry #14).
      </div>
      <div class="nps-grid mb-3">
        <div>
          <div class="nps-label">Projected corpus</div>
          <div class="nps-value">{{ formatINRCompact(projectedCorpus) }}</div>
          <div class="nps-detail">at {{ yearsToRetirement }} yrs out, 9% return</div>
        </div>
        <div>
          <div class="nps-label">Lump sum (tax-free)</div>
          <div class="nps-value">{{ formatINRCompact(split.lumpSum) }}</div>
          <div class="nps-detail">
            <span v-if="split.isBelowThreshold">100% — corpus ≤ ₹5L</span>
            <span v-else>60%</span>
          </div>
        </div>
        <div v-if="!split.isBelowThreshold">
          <div class="nps-label">Annuity corpus</div>
          <div class="nps-value">{{ formatINRCompact(split.annuityCorpus) }}</div>
          <div class="nps-detail">40% mandatory · ~6% annuity</div>
        </div>
        <div v-if="!split.isBelowThreshold">
          <div class="nps-label">Annuity income / yr</div>
          <div class="nps-value">{{ formatINRCompact(split.annuityIncomeAnnual) }}</div>
          <div class="nps-detail">before tax — taxed at slab</div>
        </div>
      </div>
      <v-alert
        v-if="cap.suggestCap"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-2"
      >
        {{ cap.reason }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.nps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
.nps-label { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.6); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
.nps-value { font-size: 1.25rem; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
.nps-detail { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.55); margin-top: 2px; }
</style>

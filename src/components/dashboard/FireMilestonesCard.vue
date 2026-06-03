<script setup lang="ts">
/**
 * FireMilestonesCard — Coast FIRE + Barista FIRE callouts +
 * audit-mandated 3-variant chips (Lean / Regular / Fat).
 *
 * Phase 4 Stage I per docs/goals/build-firekaro-mvp-v5.md §7.
 * Audit Entry #2 A2.1 (multiplier model) + A2.3 (Coast) + A2.5 (Barista).
 *
 * Feature-gating:
 *  - Coast section: fire.coast
 *  - Barista section: fire.barista
 *  - Variant chips always shown (core FIRE concept).
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useFireDerive } from "@/lib/useFireDerive";
import { useFeaturesStore } from "@/stores/features";
import { calculateCoastFire, calculateBaristaFire, realReturnForCoast } from "@/lib/coast-fire";
import { formatINRCompact } from "@/lib/formatters";
import CoastTrajectoryChart from "@/components/charts/CoastTrajectoryChart.vue";

const household = useHouseholdStore();
const assumptions = useAssumptionsStore();
const features = useFeaturesStore();
const fire = useFireDerive();

// Variant bands, reconciled to the headline FIRE target (audit Entry #2 A2.1).
// Family-layer obligations + the healthcare reservation are FIXED costs that
// don't shrink if you live leaner — only your lifestyle (base) expenses scale.
// So Regular === the headline FIRE number; Lean/Fat scale only the base by the
// user-editable multipliers (A2.4, /preferences §Variants) and keep the fixed
// buffers constant.
const leanMult = computed(() => assumptions.values.leanMultiplier);
const fatMult = computed(() => assumptions.values.fatMultiplier);
const variants = computed(() => {
  const base = fire.baseFireNumber.value;
  const fixed = fire.familyLayerCorpus.value + fire.healthcareReservation.value;
  return {
    lean: base * leanMult.value + fixed,
    regular: base + fixed, // === fire.fireNumber (the headline target)
    fat: base * fatMult.value + fixed,
  };
});
const leanPctLabel = computed(() => `${Math.round(leanMult.value * 100)}% lifestyle + buffers`);
const fatPctLabel = computed(() => `${Math.round(fatMult.value * 100)}% lifestyle + buffers`);

const startYear = new Date().getFullYear();
const anchorAge = computed(() => fire.anchorAge.value);
const yearsToRetirement = computed(() => {
  const retireAge = household.earners[0]?.targetRetirementAge ?? 55;
  return Math.max(0, retireAge - (anchorAge.value || 35));
});

const realReturn = computed(() => {
  // real = nominal - household blended inflation (4-bucket, audit Entry #3).
  // A1 (gh-issue #9 L2): NO positive clamp — a negative real return must flow
  // through so coast-fire returns coastCorpus = fireNumber (you cannot coast).
  return realReturnForCoast(fire.blendedReturn.value, assumptions.householdInflation());
});

const coast = computed(() =>
  calculateCoastFire({
    fireNumber: fire.fireNumber.value,
    yearsToRetirement: yearsToRetirement.value,
    realReturn: realReturn.value,
  }),
);

const baristaIncome = computed(() => {
  // Assume half of current household income as barista income — a useful
  // illustrative default. The user can override on /preferences §Variants
  // once the editable barista field lands.
  return fire.annualIncome.value.total * 0.5;
});

const barista = computed(() =>
  calculateBaristaFire({
    annualExpenses: fire.annualExpensesToday.value,
    baristaIncome: baristaIncome.value,
    swr: fire.effectiveSWR.value,
  }),
);

const currentCorpus = computed(() => fire.totalCorpus.value);

const coastProgress = computed(() => {
  if (coast.value.coastCorpus <= 0) return 0;
  return Math.min(100, (currentCorpus.value / coast.value.coastCorpus) * 100);
});

const baristaProgress = computed(() => {
  if (barista.value.baristaCorpus <= 0) return 100;
  return Math.min(100, (currentCorpus.value / barista.value.baristaCorpus) * 100);
});
</script>

<template>
  <v-card variant="outlined" class="fire-milestones-card mb-4" data-testid="fire-milestones-card">
    <v-card-title>FIRE milestones</v-card-title>
    <v-card-text>
      <!-- Variant chips -->
      <div class="variant-grid mb-4">
        <div class="variant-chip">
          <div class="variant-label">Lean FIRE</div>
          <div class="variant-value">{{ formatINRCompact(variants.lean) }}</div>
          <div class="variant-detail">{{ leanPctLabel }}</div>
        </div>
        <div class="variant-chip variant-primary">
          <div class="variant-label">Regular FIRE</div>
          <div class="variant-value">{{ formatINRCompact(variants.regular) }}</div>
          <div class="variant-detail">your full FIRE target</div>
        </div>
        <div class="variant-chip">
          <div class="variant-label">Fat FIRE</div>
          <div class="variant-value">{{ formatINRCompact(variants.fat) }}</div>
          <div class="variant-detail">{{ fatPctLabel }}</div>
        </div>
      </div>

      <!-- Coast FIRE callout -->
      <div v-if="features.isEnabled('fire.coast')" class="milestone-block">
        <div class="d-flex align-center justify-space-between mb-1">
          <strong>Coast FIRE</strong>
          <v-chip
            v-if="coast.hasReachedCoast(currentCorpus)"
            color="success"
            size="small"
            variant="tonal"
          >
            <v-icon icon="mdi-check-circle" size="small" class="mr-1" />
            Reached
          </v-chip>
          <v-chip
            v-else
            color="info"
            size="small"
            variant="tonal"
          >
            {{ coastProgress.toFixed(0) }}% of way there
          </v-chip>
        </div>
        <div class="text-body-2 text-medium-emphasis">
          Stop-saving point — at {{ formatINRCompact(coast.coastCorpus) }}, your
          existing corpus alone compounds to your full FIRE number by
          retirement (no additional contributions needed).
        </div>
        <v-progress-linear
          :model-value="coastProgress"
          color="primary"
          height="8"
          rounded
          class="mt-2"
        />
        <!-- A21.1 — corpus-vs-Coast trajectory chart -->
        <CoastTrajectoryChart
          :current-corpus="currentCorpus"
          :fire-number="fire.fireNumber.value"
          :years-to-retirement="yearsToRetirement"
          :real-return="realReturn"
          :start-year="startYear"
        />
      </div>

      <!-- Barista FIRE callout -->
      <div v-if="features.isEnabled('fire.barista')" class="milestone-block">
        <div class="d-flex align-center justify-space-between mb-1">
          <strong>Barista FIRE</strong>
          <v-chip
            v-if="barista.hasReachedBarista(currentCorpus)"
            color="success"
            size="small"
            variant="tonal"
          >
            <v-icon icon="mdi-check-circle" size="small" class="mr-1" />
            Reached
          </v-chip>
          <v-chip v-else color="info" size="small" variant="tonal">
            {{ baristaProgress.toFixed(0) }}% of way there
          </v-chip>
        </div>
        <div class="text-body-2 text-medium-emphasis">
          Part-time alternative — at {{ formatINRCompact(barista.baristaCorpus) }},
          your corpus + half-time income covers expenses. You stop the
          full-time grind but keep light income.
        </div>
        <v-progress-linear
          :model-value="baristaProgress"
          color="primary"
          height="8"
          rounded
          class="mt-2"
        />
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.variant-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
@media (max-width: 600px) {
  .variant-grid { grid-template-columns: 1fr; }
}
.variant-chip {
  padding: 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  text-align: center;
}
.variant-chip.variant-primary {
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
}
.variant-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(var(--v-theme-on-surface), 0.65);
}
.variant-value {
  font-size: 1.25rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  margin: 4px 0;
}
.variant-detail {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.milestone-block {
  padding: 12px 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.milestone-block:last-child { border-bottom: none; }
</style>

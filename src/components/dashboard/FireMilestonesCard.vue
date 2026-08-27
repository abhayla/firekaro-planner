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
import { calculateCoastFire, calculateBaristaFire } from "@/lib/coast-fire";
import { formatINRCompact } from "@/lib/formatters";
import { coastFireBlurb, baristaFireBlurb } from "@/lib/fire-milestone-copy";
import CoastTrajectoryChart from "@/components/charts/CoastTrajectoryChart.vue";
import MilestoneLadder, { type LadderMilestone } from "@/components/dashboard/viz/MilestoneLadder.vue";

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
  // ADR-0006 / gh #180 — the ONE real return, read straight off the kernel.
  //
  // This used to be `realReturnForCoast(blendedReturn, householdInflation())`, i.e. the nominal
  // return deflated at the household EXPENSE BASKET, while the hero six inches above deflated at
  // GENERAL CPI. Two real returns for one household on one dashboard — the live two-rate
  // contradiction #180 was filed for. `realBlendedReturn` is the kernel's `(1+r)/(1+CPI) − 1`,
  // the same figure the headline solver, the Monte Carlo band and the projection chart use.
  //
  // A1 (gh-issue #9 L2): NO positive clamp — a negative real return must flow through so
  // coast-fire returns coastCorpus = fireNumber (you cannot coast).
  return fire.realBlendedReturn.value;
});

const coast = computed(() =>
  calculateCoastFire({
    fireNumber: fire.fireNumber.value,
    yearsToRetirement: yearsToRetirement.value,
    realReturn: realReturn.value,
    // ADR-0006 Phase 1b — the FIRE number this card discounts is NOT constant in today's rupees:
    // it rises at `realTargetDriftRate` because the household's spending basket outruns the CPI
    // the return above is deflated by. Discounting a flat target under-stated the coast corpus
    // and told the user they could stop saving earlier than they can.
    targetDriftRate: fire.realTargetDriftRate.value,
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

// gh #39: with no FIRE target (zero expenses) coast/barista corpora are 0, so
// hasReachedCoast/Barista(0) is trivially true and baristaProgress would read 100% —
// a brand-new zero-data user is falsely shown "Reached". Gate on a real target.
const hasFireTarget = computed(() => fire.fireNumber.value > 0);

// Option-D ladder (contract §3.6): Lean / Regular / Fat pins with amounts + ages on one rail.
// Ages come from the projection crossovers (Lean/Fat — relocated here from the old hero chips)
// and the CANONICAL kernel-owned householdFireAge (Regular — never a re-derived copy; the
// #33/#65 cross-screen-coherence class). null age → the pin renders without one.
const regularAge = computed(() => fire.householdFireAge.value ?? null);
const ladderMilestones = computed<LadderMilestone[]>(() => [
  // Lean's pin green mirrors the chart palette's debt-green (chartColors), Regular = success,
  // Fat = primary — the mockup's pin colors.
  { label: "Lean", amount: variants.value.lean, age: fire.crossovers.value.lean.age ?? null, color: "#7cb342" },
  { label: "Regular", amount: variants.value.regular, age: regularAge.value, color: "rgb(var(--v-theme-success))" },
  { label: "Fat", amount: variants.value.fat, age: fire.crossovers.value.fat.age ?? null, color: "rgb(var(--v-theme-primary))" },
]);

const coastProgress = computed(() => {
  if (!hasFireTarget.value) return 0;
  if (coast.value.coastCorpus <= 0) return 0;
  return Math.min(100, (currentCorpus.value / coast.value.coastCorpus) * 100);
});

const baristaProgress = computed(() => {
  if (!hasFireTarget.value) return 0;
  if (barista.value.baristaCorpus <= 0) return 100;
  return Math.min(100, (currentCorpus.value / barista.value.baristaCorpus) * 100);
});
</script>

<template>
  <v-card variant="outlined" class="fire-milestones-card" data-testid="fire-milestones-card">
    <v-card-title>FIRE milestones</v-card-title>
    <v-card-text>
      <!-- Option-D ladder: where the current corpus sits vs Lean / Regular / Fat (amounts +
           ages on the rail). Only meaningful with a real FIRE target — the zero-data state
           keeps the honest ₹0 variant chips below instead (gh #39 class). -->
      <template v-if="hasFireTarget">
        <MilestoneLadder
          :corpus-now="currentCorpus"
          :milestones="ladderMilestones"
          class="mb-1"
          data-testid="milestone-ladder"
        />
        <div class="text-caption text-medium-emphasis mb-4">
          Lean = {{ leanPctLabel }} · Regular = your full FIRE target · Fat = {{ fatPctLabel }}
        </div>
      </template>
      <!-- Variant chips (zero-data fallback — the ladder carries these figures once a target exists) -->
      <div v-else class="variant-grid mb-4">
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
            v-if="hasFireTarget && coast.hasReachedCoast(currentCorpus)"
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
        <!-- gh #39 (new-user path): the descriptive prose + trajectory chart are only
             meaningful with a real FIRE target. Without one (zero-data user) they'd assert
             "at ₹0 your corpus compounds to your full FIRE number (no contributions needed)" —
             an absurd false positive. Gate on hasFireTarget; show an honest prompt otherwise. -->
        <div class="text-body-2 text-medium-emphasis">
          {{ coastFireBlurb(hasFireTarget, formatINRCompact(coast.coastCorpus)) }}
        </div>
        <v-progress-linear
          :model-value="coastProgress"
          color="primary"
          height="8"
          rounded
          class="mt-2"
        />
        <!-- A21.1 — corpus-vs-Coast trajectory chart (only with a real FIRE target — gh #39) -->
        <CoastTrajectoryChart
          v-if="hasFireTarget"
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
            v-if="hasFireTarget && barista.hasReachedBarista(currentCorpus)"
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
          {{ baristaFireBlurb(hasFireTarget, formatINRCompact(barista.baristaCorpus)) }}
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

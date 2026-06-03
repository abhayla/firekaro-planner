<script setup lang="ts">
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact, formatYearsMonths } from "@/lib/formatters";
import InfoTip from "@/components/shared/InfoTip.vue";

const fire = useFireDerive();

const fireYear = computed(() => new Date().getFullYear() + Math.ceil(fire.yearsToRegular.value || 0));
const fireAge = computed(() => {
  if (!Number.isFinite(fire.anchorAge.value)) return null;
  return fire.anchorAge.value + Math.ceil(fire.yearsToRegular.value || 0);
});

const headline = computed(() => {
  if (!Number.isFinite(fire.yearsToRegular.value)) {
    return "Increase income or savings to project a FIRE date.";
  }
  if (fire.yearsToRegular.value <= 0) {
    return "You're already at Regular FIRE — congratulations!";
  }
  return `You'll hit FIRE at age ${fireAge.value} (in ${formatYearsMonths(fire.yearsToRegular.value)}, by ${fireYear.value})`;
});

// #15 bridge: when the liquid-runway bridge pushes the headline FIRE age later
// than the corpus-only adequacy age, surface BOTH so the honest headline doesn't
// hide that the corpus was technically "ready" earlier.
const bridgeSubline = computed(() => {
  const bc = fire.bridgeCoverage.value;
  if (!bc || bc.covered) return null;
  // Use the engine's own corpus-only age (the exact age the bridge was tested at)
  // so the copy never disagrees with the math by a rounding year.
  return `Corpus target is reached at age ${bc.corpusOnlyFireAge} — but locked savings (PPF / NPS / pre-tax) keep your money from being fully spendable then, so sustainable FIRE is age ${bc.effectiveFireAge}.`;
});

const leanLabel = computed(() => {
  const y = fire.crossovers.value.lean;
  if (!y.year) return "Lean FIRE: not within horizon";
  return `Lean FIRE: age ${y.age} (${y.year})`;
});
const fatLabel = computed(() => {
  const y = fire.crossovers.value.fat;
  if (!y.year) return "Fat FIRE: not within horizon";
  return `Fat FIRE: age ${y.age} (${y.year})`;
});
</script>

<template>
  <v-card variant="outlined" class="fire-hero pa-5 mb-4">
    <div class="d-flex align-center mb-2">
      <v-icon icon="mdi-fire" color="fire-orange" size="32" class="mr-2" />
      <h2 class="fire-hero__headline flex-grow-1">{{ headline }}</h2>
    </div>

    <p v-if="bridgeSubline" class="fire-hero__subline" data-testid="fire-hero-bridge-subline">
      <v-icon icon="mdi-lock-clock" size="16" color="warning" class="mr-1" />
      {{ bridgeSubline }}
    </p>

    <div class="progress-wrap my-3">
      <v-progress-linear
        :model-value="fire.progressPercent.value"
        height="14"
        rounded
        color="fire-orange"
        bg-color="surface-variant"
        :aria-label="`FIRE progress: ${fire.progressPercent.value}% of target corpus reached`"
      />
      <div class="d-flex justify-space-between mt-1 text-caption">
        <span class="text-medium-emphasis text-currency">{{ formatINRCompact(fire.totalCorpus.value) }} now</span>
        <span class="font-weight-bold text-currency">{{ fire.progressPercent.value }}% of FIRE</span>
        <span class="text-medium-emphasis text-currency">
          {{ formatINRCompact(fire.fireNumber.value) }} <InfoTip term="fire-number">target</InfoTip>
        </span>
      </div>
    </div>

    <v-row dense class="mt-2">
      <v-col cols="6" md="3">
        <div class="stat-block">
          <div class="text-caption stat-block__label">
            <InfoTip term="savings-rate">Savings rate</InfoTip>
          </div>
          <div class="stat-block__value text-currency">{{ fire.savingsRate.value }}%</div>
        </div>
      </v-col>
      <v-col cols="6" md="3">
        <div class="stat-block">
          <div class="text-caption stat-block__label">Annual savings</div>
          <div class="stat-block__value text-currency">{{ formatINRCompact(fire.annualSavings.value) }}</div>
        </div>
      </v-col>
      <v-col cols="6" md="3">
        <div class="stat-block">
          <div class="text-caption stat-block__label">Monthly take-home</div>
          <div class="stat-block__value text-currency">{{ formatINRCompact(fire.monthlyTakeHome.value) }}</div>
        </div>
      </v-col>
      <v-col cols="6" md="3">
        <div class="stat-block">
          <div class="text-caption stat-block__label">Blended return (assumed)</div>
          <div class="stat-block__value text-currency">{{ (fire.blendedReturn.value * 100).toFixed(1) }}%</div>
        </div>
      </v-col>
    </v-row>

    <div class="variants d-flex flex-wrap ga-2 mt-3">
      <v-chip size="small" color="info" variant="tonal">
        <v-icon icon="mdi-flag" class="mr-1" size="x-small" />
        {{ leanLabel }}
      </v-chip>
      <v-chip size="small" color="warning" variant="tonal">
        <v-icon icon="mdi-flag-checkered" class="mr-1" size="x-small" />
        {{ fatLabel }}
      </v-chip>
      <v-chip size="small" color="primary" variant="outlined">
        <InfoTip term="swr">SWR</InfoTip> {{ (fire.effectiveSWR.value * 100).toFixed(2) }}%
      </v-chip>
    </div>
  </v-card>
</template>

<style scoped>
.fire-hero {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.06), rgba(24, 103, 192, 0.04));
  border-color: rgba(249, 115, 22, 0.3) !important;
}

.fire-hero__headline {
  font-family: var(--font-display);
  font-size: var(--type-xl);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--text-primary);
}

.fire-hero__subline {
  font-size: var(--type-sm);
  line-height: var(--leading-snug);
  color: var(--text-secondary);
  margin: var(--space-1) 0 var(--space-2);
}

.stat-block {
  padding: var(--space-1) 0;
}

.stat-block__label {
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-size: 11px;
  font-weight: var(--weight-medium);
}

.stat-block__value {
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  margin-top: var(--space-1);
}
</style>

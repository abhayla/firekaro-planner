<script setup lang="ts">
import Sparkline from "@/components/shared/Sparkline.vue";
import DeltaChip from "@/components/shared/DeltaChip.vue";

/**
 * Canonical KPI/metric tile for the screen standard (mvp/SCREEN-STANDARD.md §4a).
 * Label + big mono value (+ optional unit), an optional delta row, an optional
 * trailing sparkline, and a #footer slot for chips/extra content. Presentational
 * (composes Sparkline + DeltaChip) — no extractable logic, so verified visually.
 */
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    /** Optional leading MDI icon next to the label. */
    icon?: string;
    iconColor?: string;
    /** Small unit suffix after the value, e.g. "/mo". */
    unit?: string;
    /** Vuetify color name → colors the value (e.g. DTI status). */
    valueColor?: string;
    /** When provided, renders a DeltaChip. */
    delta?: number;
    deltaFormat?: "percent" | "currency" | "raw";
    /** Invert good/bad coloring — for metrics where DOWN is good (debt, spend). */
    deltaInvert?: boolean;
    /** Small text beside the delta chip. */
    deltaMeta?: string;
    /** Trailing sparkline data; hidden when absent/empty. */
    sparkline?: number[];
    /** CSS color for the sparkline, e.g. "var(--color-error)". */
    sparklineColor?: string;
    /** Caption under the value (shown when there's no delta row). */
    footnote?: string;
    minHeight?: string;
  }>(),
  {
    deltaFormat: "percent",
    deltaInvert: false,
    sparklineColor: "var(--color-primary)",
    minHeight: "156px",
  },
);
</script>

<template>
  <v-card variant="outlined" class="metric-card pa-4" :style="{ minHeight }">
    <div class="metric-card__head">
      <v-icon v-if="icon" :icon="icon" :color="iconColor" size="small" />
      <span class="metric-card__label">{{ label }}</span>
    </div>
    <div class="metric-card__value text-currency" :class="valueColor ? `text-${valueColor}` : undefined">
      {{ value }}<span v-if="unit" class="metric-card__unit"> {{ unit }}</span>
    </div>

    <div v-if="delta !== undefined" class="metric-card__row">
      <DeltaChip :value="delta" :format="deltaFormat" size="x-small" :invert-colors="deltaInvert" />
      <span v-if="deltaMeta" class="text-caption text-medium-emphasis font-mono">{{ deltaMeta }}</span>
    </div>
    <div v-if="footnote" class="text-caption text-medium-emphasis metric-card__footnote">{{ footnote }}</div>

    <slot name="footer" />

    <div v-if="sparkline && sparkline.length" class="metric-card__spark">
      <Sparkline
        :data="sparkline"
        :width="220"
        :height="32"
        :color="sparklineColor"
        :fill="true"
        :aria-label="`${label} trend`"
      />
    </div>
    <div v-else class="metric-card__filler" />
  </v-card>
</template>

<style scoped>
.metric-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
}
.metric-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.metric-card__label {
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  font-weight: var(--weight-semibold);
}
.metric-card__value {
  font-size: var(--type-xl);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  margin-top: 4px;
  line-height: var(--leading-tight);
}
.metric-card__unit {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  font-weight: var(--weight-regular);
}
.metric-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.metric-card__footnote {
  margin-top: 8px;
}
.metric-card__spark {
  margin-top: auto;
  padding-top: 8px;
}
.metric-card__filler {
  margin-top: auto;
}
</style>

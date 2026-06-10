<script setup lang="ts">
/**
 * RunwayGauge — Option-D viz primitive: a semicircular gauge for the layoff/full-burn runway.
 * Track + zone-colored filled arc; the months figure (JetBrains Mono) + label in the center.
 *
 * Pure presentational: typed props in, SVG out. Zone MAPPING (≥12mo ok / 6–12 warn / <6 bad)
 * is the CARD's decision — this component just renders the zone it is given.
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** Headline full-burn runway, in months. */
    months: number;
    /** Stable-assets-only runway, in months (carried for the accessible name). */
    conservativeMonths: number;
    zone: "ok" | "warn" | "bad";
    label?: string;
  }>(),
  { label: "full-burn runway" },
);

/** Months at which the gauge reads full (5 years — beyond that more arc adds no meaning). */
const GAUGE_FULL_MONTHS = 60;

const CX = 90;
const CY = 100;
const R = 75;

const zoneColor = computed(() =>
  props.zone === "ok"
    ? "rgb(var(--v-theme-success))"
    : props.zone === "warn"
      ? "rgb(var(--v-theme-warning))"
      : "rgb(var(--v-theme-error))",
);

const fraction = computed(() => {
  const m = Number.isFinite(props.months) ? Math.max(0, props.months) : 0;
  return Math.min(1, m / GAUGE_FULL_MONTHS);
});

// Arc endpoint on the upper semicircle, θ ∈ [0, π] from the left end.
const filledPath = computed(() => {
  const theta = Math.PI * fraction.value;
  const x = CX - R * Math.cos(theta);
  const y = CY - R * Math.sin(theta);
  return `M${CX - R},${CY} A${R},${R} 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}`;
});

function fmtMonths(m: number): string {
  const months = Math.max(0, Math.round(Number.isFinite(m) ? m : 0));
  if (months < 12) return `${months}m`;
  const y = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${y}y` : `${y}y ${rem}m`;
}

const centerText = computed(() => fmtMonths(props.months));
const ariaLabel = computed(
  () =>
    `Full-burn runway gauge: ${fmtMonths(props.months)} with zero income; ` +
    `${fmtMonths(props.conservativeMonths)} on stable assets only`,
);
</script>

<template>
  <svg viewBox="0 0 180 110" width="190" role="img" :aria-label="ariaLabel" class="runway-gauge">
    <path
      :d="`M${CX - R},${CY} A${R},${R} 0 0 1 ${CX + R},${CY}`"
      fill="none"
      class="runway-gauge__track"
      stroke-width="18"
      stroke-linecap="round"
    />
    <path
      v-if="fraction > 0"
      :d="filledPath"
      fill="none"
      :style="{ stroke: zoneColor }"
      stroke-width="18"
      stroke-linecap="round"
      data-testid="runway-gauge-fill"
    />
    <text x="90" y="78" text-anchor="middle" class="runway-gauge__months">{{ centerText }}</text>
    <text x="90" y="96" text-anchor="middle" class="runway-gauge__label">{{ label }}</text>
  </svg>
</template>

<style scoped>
.runway-gauge__track {
  stroke: rgba(var(--v-theme-on-surface), 0.07);
}
.runway-gauge__months {
  font-family: "JetBrains Mono", monospace;
  font-size: 22px;
  font-weight: 800;
  fill: var(--text-primary, #1e293b);
}
.runway-gauge__label {
  font-family: var(--font-display, Inter, sans-serif);
  font-size: 10px;
  fill: var(--text-muted, #64748b);
}
</style>

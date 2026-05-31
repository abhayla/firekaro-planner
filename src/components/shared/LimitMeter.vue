<script setup lang="ts">
import { computed } from "vue";

/**
 * Canonical "used / limit" meter for the screen standard (§5a).
 * Label + used/limit (mono) + a progress bar showing how much of a cap is
 * consumed. Use for deduction limits, budget-vs-cap, any headroom display.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    used: number;
    limit: number;
    /** Vuetify color name for the bar. */
    color?: string;
    /** Formats used/limit; defaults to the raw number. */
    formatValue?: (n: number) => string;
  }>(),
  { color: "primary" },
);

const pct = computed(() => (props.limit > 0 ? Math.min(100, (props.used / props.limit) * 100) : 0));
const maxed = computed(() => props.limit > 0 && props.used >= props.limit);
const fmt = (n: number) => (props.formatValue ? props.formatValue(n) : String(n));
</script>

<template>
  <div class="limit-meter">
    <div class="limit-meter__head">
      <span class="limit-meter__label">{{ label }}</span>
      <span class="limit-meter__val font-mono">
        {{ fmt(used) }}<span class="limit-meter__limit"> / {{ fmt(limit) }}</span>
        <v-icon v-if="maxed" icon="mdi-check-circle" size="12" color="success" class="ml-1" />
      </span>
    </div>
    <v-progress-linear :model-value="pct" :color="color" height="6" rounded />
  </div>
</template>

<style scoped>
.limit-meter__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.limit-meter__label {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.limit-meter__val {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.limit-meter__limit {
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-weight: 500;
}
</style>

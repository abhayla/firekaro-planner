<script setup lang="ts">
import { computed } from "vue";

/**
 * Canonical stacked proportion bar for the screen standard (§5a).
 * A single horizontal bar split into colored segments + an optional legend.
 * Use for any "where it goes" composition (tax breakdown, take-home split, …).
 */
export interface ProportionSegment {
  key: string;
  label: string;
  value: number;
  /** Vuetify theme color name (primary/success/error/warning/info). */
  color: string;
}

const props = withDefaults(
  defineProps<{
    segments: ProportionSegment[];
    legend?: boolean;
    height?: number;
    /** Formats the per-segment legend value; defaults to a percentage. */
    formatValue?: (n: number) => string;
  }>(),
  { legend: true, height: 10 },
);

const total = computed(() => props.segments.reduce((s, x) => s + Math.max(0, x.value), 0));
// Accept either a Vuetify theme color name (success/error/…) or a raw CSS color
// (#hex, var(--…), rgb(…)) so the bar reuses across data with arbitrary palettes.
function resolveColor(c: string): string {
  return /[#(]/.test(c) ? c : `rgb(var(--v-theme-${c}))`;
}
const rows = computed(() =>
  props.segments.map((s) => ({
    ...s,
    css: resolveColor(s.color),
    pct: total.value > 0 ? (Math.max(0, s.value) / total.value) * 100 : 0,
  })),
);
</script>

<template>
  <div class="proportion-bar">
    <div class="pbar-track" :style="{ height: `${height}px` }">
      <div
        v-for="s in rows"
        :key="s.key"
        class="pbar-seg"
        :style="{ width: `${s.pct}%`, background: s.css }"
        :title="`${s.label}: ${s.pct.toFixed(0)}%`"
      />
    </div>
    <div v-if="legend" class="pbar-legend">
      <span v-for="s in rows" :key="s.key" class="pbar-legend__item">
        <span class="pbar-dot" :style="{ background: s.css }" />
        <span class="pbar-legend__label">{{ s.label }}</span>
        <span class="pbar-legend__val font-mono">{{ formatValue ? formatValue(s.value) : `${Math.round(s.pct)}%` }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.pbar-track {
  display: flex;
  width: 100%;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.pbar-seg {
  height: 100%;
  transition: width 200ms ease;
}
.pbar-seg + .pbar-seg {
  box-shadow: inset 1px 0 0 rgb(var(--v-theme-surface));
}
.pbar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-top: 10px;
}
.pbar-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}
.pbar-dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex: 0 0 auto;
}
.pbar-legend__label {
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.pbar-legend__val {
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
</style>

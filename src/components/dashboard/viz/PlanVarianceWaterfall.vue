<script setup lang="ts">
/**
 * PlanVarianceWaterfall — Option-D viz primitive: what moved your FIRE date vs the locked
 * plan, as four columns (corpus growth / expense changes / assumptions / net). Mirrors the
 * CashflowWaterfall idiom (columns + signed labels) in hand-built SVG.
 *
 * HONESTY (contract §3.4): when the attribution drivers are ALL zero this renders NOTHING —
 * the sign-mismatch guard in plan-variance.ts zeroes the drivers exactly when the
 * first-order model broke down, and fabricating bars there would misattribute the move
 * (Tier-0 class). The card then shows the exact headline + the goalpost alert only.
 * Progress/reality columns are colored by SIGN (a corpus that shrank is never green);
 * the goalpost column stays neutral grey (a re-definition, not good/bad).
 */
import { computed } from "vue";

const props = defineProps<{
  /** Months sooner (+) / later (−) attributed to corpus growth. */
  progressMonths: number;
  /** Months attributed to actual expense/household changes. */
  realityMonths: number;
  /** Months attributed to assumption changes (the goalpost). */
  goalpostMonths: number;
  /** The exact observed headline delta (+ = earlier than plan). */
  netMonths: number;
}>();

const W = 480;
const H = 150;
const BASE_Y = 112;
const MAX_BAR = 84;
const COL_W = 52;

const r = (x: number) => Math.round(Number.isFinite(x) ? x : 0);

const hasBars = computed(() => r(props.progressMonths) !== 0 || r(props.realityMonths) !== 0 || r(props.goalpostMonths) !== 0);

const signLabel = (m: number) => (m === 0 ? "0 mo" : `${m > 0 ? "+" : "−"}${Math.abs(m)} mo`);

const columns = computed(() => {
  const p = r(props.progressMonths);
  const re = r(props.realityMonths);
  const g = r(props.goalpostMonths);
  const n = r(props.netMonths);
  // Zero is NEUTRAL — a zero driver is neither a gain nor a loss, never green.
  const NEUTRAL = "rgba(var(--v-theme-on-surface), 0.32)";
  const signColor = (m: number) =>
    m === 0 ? NEUTRAL : m > 0 ? "rgb(var(--v-theme-success))" : "rgb(var(--v-theme-error))";
  const defs = [
    { months: p, name: "corpus growth", color: signColor(p) },
    { months: re, name: "expense changes", color: signColor(re) },
    { months: g, name: "assumptions", color: "rgba(var(--v-theme-on-surface), 0.32)" },
    {
      months: n,
      name: "net vs plan",
      color: "rgb(var(--v-theme-fire-orange))",
      netLabel: n === 0 ? "= on plan" : `= ${Math.abs(n)} mo ${n > 0 ? "earlier" : "later"}`,
    },
  ];
  const maxAbs = Math.max(1, ...defs.map((d) => Math.abs(d.months)));
  const slot = W / defs.length;
  return defs.map((d, i) => ({
    ...d,
    x: slot * i + (slot - COL_W) / 2,
    h: d.months === 0 ? 4 : Math.max(8, (Math.abs(d.months) / maxAbs) * MAX_BAR),
    label: "netLabel" in d && d.netLabel ? d.netLabel : signLabel(d.months),
    cx: slot * i + slot / 2,
  }));
});

const ariaLabel = computed(() => {
  const n = r(props.netMonths);
  const netPhrase = n === 0 ? "net on plan" : `net ${Math.abs(n)} months ${n > 0 ? "earlier" : "later"} than the locked plan`;
  return (
    `Plan variance waterfall: ${signLabel(r(props.progressMonths))} corpus growth, ` +
    `${signLabel(r(props.realityMonths))} expense changes, ${signLabel(r(props.goalpostMonths))} assumptions, ${netPhrase}`
  );
});
</script>

<template>
  <svg v-if="hasBars" :viewBox="`0 0 ${W} ${H}`" width="100%" role="img" :aria-label="ariaLabel" class="pv-wf">
    <template v-for="c in columns" :key="c.name">
      <rect
        :x="c.x"
        :y="BASE_Y - c.h"
        :width="COL_W"
        :height="c.h"
        rx="6"
        :style="{ fill: c.color }"
        data-testid="wf-bar"
      />
      <text :x="c.cx" :y="BASE_Y - c.h - 8" text-anchor="middle" class="pv-wf__value">{{ c.label }}</text>
      <text :x="c.cx" :y="BASE_Y + 18" text-anchor="middle" class="pv-wf__name">{{ c.name }}</text>
    </template>
    <line x1="0" :y1="BASE_Y" :x2="W" :y2="BASE_Y" class="pv-wf__base" />
  </svg>
</template>

<style scoped>
.pv-wf__value {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  font-weight: 700;
  fill: var(--text-primary, #1e293b);
}
.pv-wf__name {
  font-family: var(--font-display, Inter, sans-serif);
  font-size: 11px;
  fill: var(--text-muted, #64748b);
}
.pv-wf__base {
  stroke: rgba(var(--v-theme-on-surface), 0.12);
  stroke-width: 1;
}
</style>

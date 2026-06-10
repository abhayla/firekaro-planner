<script setup lang="ts">
/**
 * BridgeUnlockTimeline — Option-D viz primitive: a horizontal segmented bar showing how the
 * retirement corpus splits into spendable-at-FIRE vs locked-till-unlock money, plus the
 * bridge-income stream, with an age axis beneath (mockup §"Accessible-money bridge").
 *
 * Pure presentational: typed props in, SVG out — no store access (chart-theme-system.md
 * custom-chart path). Segment WIDTHS are clamped to a readable minimum; the ₹ labels carry
 * the exact amounts (the truth lives in the labels, the bar is the gestalt).
 */
import { computed } from "vue";
import { formatINRCompact } from "@/lib/formatters";

const props = withDefaults(
  defineProps<{
    /** ₹ spendable (post-tax reachable) at the FIRE age. */
    spendable: number;
    /** ₹ locked / illiquid until the unlock age. */
    locked: number;
    /** ₹/yr bridge income (rental + EPS + NPS pension); 0 hides the segment. */
    bridgeIncomePerYear: number;
    /** Headline FIRE age for the axis start (null → generic "FIRE"). */
    fireAge: number | null;
    /** Dominant unlock age for the locked label + axis (EPF/PPF/NPS → 60 in India). */
    lockedUntilAge?: number;
  }>(),
  { lockedUntilAge: 60 },
);

const W = 600;
const BAR_Y = 18;
const BAR_H = 24;
const MIN_FRAC = 0.14; // readability clamp — labels carry the exact amounts

const segments = computed(() => {
  const hasBridge = props.bridgeIncomePerYear > 0;
  const bridgeFrac = hasBridge ? 0.22 : 0;
  const stockTotal = Math.max(0, props.spendable) + Math.max(0, props.locked);
  let spendFrac = stockTotal > 0 ? (props.spendable / stockTotal) * (1 - bridgeFrac) : 0;
  let lockFrac = stockTotal > 0 ? (props.locked / stockTotal) * (1 - bridgeFrac) : 0;
  // Clamp tiny-but-nonzero segments to a readable floor, re-normalising the larger one.
  if (props.locked > 0 && lockFrac < MIN_FRAC) {
    lockFrac = MIN_FRAC;
    spendFrac = 1 - bridgeFrac - MIN_FRAC;
  } else if (props.spendable > 0 && spendFrac < MIN_FRAC) {
    spendFrac = MIN_FRAC;
    lockFrac = 1 - bridgeFrac - MIN_FRAC;
  }
  const out: Array<{ x: number; w: number; color: string; label: string }> = [];
  let x = 0;
  if (props.spendable > 0 || stockTotal === 0) {
    out.push({
      x,
      w: spendFrac * W,
      color: "rgb(var(--v-theme-success))",
      label: `Spendable at FIRE · ${formatINRCompact(props.spendable)}`,
    });
    x += spendFrac * W;
  }
  if (props.locked > 0) {
    out.push({
      x,
      w: lockFrac * W,
      color: "rgb(var(--v-theme-warning))",
      label: `Locked till ${props.lockedUntilAge} · ${formatINRCompact(props.locked)}`,
    });
    x += lockFrac * W;
  }
  if (hasBridge) {
    out.push({
      x,
      w: bridgeFrac * W,
      color: "rgb(var(--v-theme-primary))",
      label: `Bridge income ${formatINRCompact(props.bridgeIncomePerYear)}/yr`,
    });
  }
  return out;
});

const axis = computed(() => {
  const start = props.fireAge != null ? `FIRE @${props.fireAge}` : "FIRE";
  const endAge = Math.max(65, props.lockedUntilAge + 5, (props.fireAge ?? 0) + 5);
  const ticks = [{ x: 0, anchor: "start", text: start }];
  // The unlock tick only makes sense when it lies AFTER the FIRE age (a schematic axis,
  // but never a self-contradicting one — e.g. fireAge 62 with "60 unlock" mid-axis).
  if (props.fireAge == null || props.fireAge < props.lockedUntilAge) {
    ticks.push({ x: W * 0.55, anchor: "middle", text: `${props.lockedUntilAge} (EPF/PPF/NPS unlock)` });
  }
  ticks.push({ x: W, anchor: "end", text: String(endAge) });
  return ticks;
});

const ariaLabel = computed(
  () =>
    `Accessible-money bridge timeline: ${formatINRCompact(props.spendable)} spendable at FIRE, ` +
    `${formatINRCompact(props.locked)} locked till ${props.lockedUntilAge}` +
    (props.bridgeIncomePerYear > 0 ? `, bridge income ${formatINRCompact(props.bridgeIncomePerYear)} per year` : ""),
);
</script>

<template>
  <svg :viewBox="`0 0 ${W} 72`" width="100%" role="img" :aria-label="ariaLabel" class="bridge-tl">
    <rect
      v-for="(s, i) in segments"
      :key="i"
      :x="s.x"
      :y="BAR_Y"
      :width="Math.max(0, s.w - 2)"
      :height="BAR_H"
      rx="6"
      :style="{ fill: s.color }"
      data-testid="bridge-tl-segment"
    />
    <text
      v-for="(s, i) in segments"
      :key="`l${i}`"
      :x="s.x + 8"
      :y="BAR_Y + BAR_H / 2 + 4"
      class="bridge-tl__seg-label"
    >
      {{ s.label }}
    </text>
    <text
      v-for="(a, i) in axis"
      :key="`a${i}`"
      :x="a.x"
      y="62"
      :text-anchor="a.anchor"
      class="bridge-tl__axis"
      data-testid="bridge-tl-axis"
    >
      {{ a.text }}
    </text>
  </svg>
</template>

<style scoped>
.bridge-tl__seg-label {
  font-family: var(--font-display, Inter, sans-serif);
  font-size: 11px;
  font-weight: 600;
  fill: #fff;
}
.bridge-tl__axis {
  font-family: var(--font-display, Inter, sans-serif);
  font-size: 10px;
  fill: var(--text-muted, #64748b);
}
</style>

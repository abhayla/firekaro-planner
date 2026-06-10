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
  <div role="img" :aria-label="ariaLabel" class="bridge-tl">
    <!-- Labels live in the legend BELOW the bar, never inside the segments — in-bar text
         overlaps its neighbours whenever a clamped segment is narrower than its label
         (rule-33 blind-verifier catch, 2026-06-10). The bar keeps the gestalt; the legend
         carries the truth. -->
    <svg :viewBox="`0 0 ${W} 48`" width="100%" aria-hidden="true">
      <rect
        v-for="(s, i) in segments"
        :key="i"
        :x="s.x"
        :y="2"
        :width="Math.max(0, s.w - 2)"
        :height="BAR_H"
        rx="6"
        :style="{ fill: s.color }"
        data-testid="bridge-tl-segment"
      />
      <text
        v-for="(a, i) in axis"
        :key="`a${i}`"
        :x="a.x"
        y="42"
        :text-anchor="a.anchor"
        class="bridge-tl__axis"
        data-testid="bridge-tl-axis"
      >
        {{ a.text }}
      </text>
    </svg>
    <div class="bridge-tl__legend">
      <span v-for="(s, i) in segments" :key="`k${i}`" class="bridge-tl__key">
        <span class="bridge-tl__swatch" :style="{ background: s.color }" aria-hidden="true" />
        {{ s.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.bridge-tl__axis {
  font-family: var(--font-display, Inter, sans-serif);
  font-size: 10px;
  fill: var(--text-muted, #64748b);
}
.bridge-tl__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-secondary, #475569);
}
.bridge-tl__key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.bridge-tl__swatch {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}
</style>

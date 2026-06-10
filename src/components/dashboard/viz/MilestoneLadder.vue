<script setup lang="ts">
/**
 * MilestoneLadder — Option-D viz primitive: a horizontal rail with the corpus-progress fill
 * and a pin per FIRE milestone (Lean / Regular / Fat) plus the "You · ₹now" pin, each
 * labeled with amount (Mono) above and name · age below (mockup §"FIRE milestones").
 *
 * Pure presentational: typed props in, SVG out — the card computes the amounts/ages.
 */
import { computed } from "vue";
import { formatINRCompact } from "@/lib/formatters";

export interface LadderMilestone {
  label: string;
  amount: number;
  age?: number | null;
  /** Pin fill — a resolved CSS color (the card maps semantic colors). */
  color: string;
}

const props = defineProps<{
  corpusNow: number;
  milestones: LadderMilestone[];
}>();

const W = 640;
const RAIL_Y = 56;
const RAIL_H = 8;

const safe = (x: number) => (Number.isFinite(x) ? Math.max(0, x) : 0);

const maxAmount = computed(() =>
  Math.max(1, safe(props.corpusNow), ...props.milestones.map((m) => safe(m.amount))) * 1.06,
);

// Clamp PIN centers away from the edges so the centered labels stay inside the viewBox.
// (Labels/pins only — the progress fill uses the UNCLAMPED fraction below: clamping it
// would fabricate ≥6% progress for a zero-corpus user, the empty-as-progress class.)
const xFor = (amount: number) => {
  const frac = safe(amount) / maxAmount.value;
  return Math.min(0.94, Math.max(0.06, frac)) * W;
};

// Label x is clamped further inboard than the pin so wide centered text (e.g. "You · ₹1.10 Cr"
// near the left edge) never clips out of the viewBox (rule-33 blind-verifier catch).
const labelXFor = (pinX: number) => Math.min(Math.max(pinX, 78), W - 78);

const pins = computed(() => [
  {
    x: xFor(props.corpusNow),
    labelX: labelXFor(xFor(props.corpusNow)),
    color: "rgb(var(--v-theme-fire-orange))",
    amountText: `You · ${formatINRCompact(props.corpusNow)}`,
    subText: "today",
  },
  ...props.milestones.map((m) => ({
    x: xFor(m.amount),
    labelX: labelXFor(xFor(m.amount)),
    color: m.color,
    amountText: formatINRCompact(m.amount),
    subText: m.age != null ? `${m.label} · ${m.age}` : m.label,
  })),
]);

// Honest fill: exact proportional width, NO clamp floor (zero corpus = zero fill).
const fillW = computed(() => Math.min(1, safe(props.corpusNow) / maxAmount.value) * W);

const ariaLabel = computed(
  () =>
    `FIRE milestone ladder: you are at ${formatINRCompact(props.corpusNow)}; ` +
    props.milestones.map((m) => `${m.label} ${formatINRCompact(m.amount)}${m.age != null ? ` at age ${m.age}` : ""}`).join(", "),
);
</script>

<template>
  <!-- max-width caps the proportional SVG growth on full-width hosts. -->
  <svg :viewBox="`0 0 ${W} 96`" width="100%" style="max-width: 920px" role="img" :aria-label="ariaLabel" class="ladder">
    <rect x="0" :y="RAIL_Y" :width="W" :height="RAIL_H" rx="5" class="ladder__rail" />
    <rect x="0" :y="RAIL_Y" :width="fillW" :height="RAIL_H" rx="5" class="ladder__fill" data-testid="ladder-fill" />
    <template v-for="(p, i) in pins" :key="i">
      <text :x="p.labelX" :y="RAIL_Y - 26" text-anchor="middle" class="ladder__amount">{{ p.amountText }}</text>
      <circle :cx="p.x" :cy="RAIL_Y + RAIL_H / 2" r="7" :style="{ fill: p.color }" class="ladder__pin" data-testid="ladder-pin" />
      <text :x="p.labelX" :y="RAIL_Y + 32" text-anchor="middle" class="ladder__sub">{{ p.subText }}</text>
    </template>
  </svg>
</template>

<style scoped>
.ladder__rail {
  fill: rgba(var(--v-theme-on-surface), 0.06);
}
.ladder__fill {
  fill: rgb(var(--v-theme-fire-orange));
}
.ladder__pin {
  stroke: #fff;
  stroke-width: 3;
}
.ladder__amount {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  font-weight: 700;
  fill: var(--text-primary, #1e293b);
}
.ladder__sub {
  font-family: var(--font-display, Inter, sans-serif);
  font-size: 11px;
  fill: var(--text-muted, #64748b);
}
</style>

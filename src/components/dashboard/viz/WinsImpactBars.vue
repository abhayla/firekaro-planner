<script lang="ts">
// Module-scoped instance counter → unique SVG <pattern> id per mounted instance (SSR-safe,
// deterministic — no Math.random/Date).
let winsBarsInstanceCounter = 0;
</script>

<script setup lang="ts">
/**
 * WinsImpactBars — Option-D viz primitive: ranked accelerators as horizontal impact bars
 * from a COMMON zero axis. Deterministic-gain levers render a solid success bar; the
 * market-dependent lever renders a striped amber bar spanning its FULL [worst, best]
 * range with BOTH bounds labeled — the range is the honesty device, never only the
 * upside (contract §3.5).
 */
import { computed } from "vue";

/** Discriminated union — a market win WITHOUT a range is unrepresentable (it must never
 *  render as a deterministic gain; that would invert the §3.5 honesty contract). */
export type WinBar =
  | { label: string; note?: string; kind: "sure"; deltaYears: number }
  | { label: string; note?: string; kind: "market"; range: [number, number] };

const props = defineProps<{ wins: WinBar[] }>();

// Corrupt numeric input never renders: a bar with NaN geometry is a lie, not a chart.
const validWins = computed(() =>
  props.wins.filter((w) =>
    w.kind === "market"
      ? Array.isArray(w.range) && w.range.length === 2 && w.range.every((v) => Number.isFinite(v))
      : Number.isFinite(w.deltaYears),
  ),
);

const patternId = `win-stripes-${++winsBarsInstanceCounter}`;

function fmtYears(y: number): string {
  const a = Math.abs(y);
  const s = a < 1 ? `${Math.round(a * 12)} mo` : `${a.toFixed(1)}y`;
  return `${y < 0 ? "−" : "+"}${s}`;
}

const scale = computed(() => {
  let min = 0;
  let max = 0;
  for (const w of validWins.value) {
    if (w.kind === "market") {
      min = Math.min(min, w.range[0]);
      max = Math.max(max, w.range[1]);
    } else {
      min = Math.min(min, w.deltaYears);
      max = Math.max(max, w.deltaYears);
    }
  }
  if (max === min) max = min + 1;
  const span = max - min;
  return { min, max, span, zeroPct: ((0 - min) / span) * 100 };
});

const rows = computed(() =>
  validWins.value.map((w) => {
    const { min, span } = scale.value;
    const toPct = (v: number) => ((v - min) / span) * 100;
    if (w.kind === "market") {
      const [lo, hi] = w.range;
      return {
        label: w.label,
        note: w.note,
        kind: "market" as const,
        left: toPct(Math.min(lo, hi)),
        width: Math.max(2, Math.abs(toPct(hi) - toPct(lo))),
        valueText: `${fmtYears(lo)} … ${fmtYears(hi)}`,
      };
    }
    const d = w.deltaYears;
    return {
      label: w.label,
      note: w.note,
      kind: "sure" as const,
      left: toPct(Math.min(0, d)),
      width: Math.max(2, Math.abs(toPct(d) - toPct(0))),
      valueText: `${fmtYears(d)}${d > 0 ? " sooner" : ""}`,
    };
  }),
);
</script>

<template>
  <!-- NO role="img" here: ARIA img makes descendants presentational, which would hide the
       lever names + the honesty range (both bounds) from assistive tech. The real text
       nodes ARE the accessible content; the decorative track SVGs are aria-hidden. -->
  <div v-if="rows.length" class="wins-bars">
    <div v-for="(rw, i) in rows" :key="i" class="wins-bars__row" data-testid="win-row">
      <span class="wins-bars__label">
        {{ rw.label }}
        <span v-if="rw.note" class="wins-bars__note">{{ rw.note }}</span>
      </span>
      <svg viewBox="0 0 100 16" preserveAspectRatio="none" class="wins-bars__track" aria-hidden="true">
        <defs v-if="i === 0">
          <pattern :id="patternId" width="6" height="16" patternUnits="userSpaceOnUse">
            <rect width="6" height="16" fill="#fde68a" />
            <rect width="3" height="16" fill="#fbbf24" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="100" height="16" rx="4" class="wins-bars__bg" />
        <line :x1="scale.zeroPct" y1="0" :x2="scale.zeroPct" y2="16" class="wins-bars__zero" />
        <rect
          v-if="rw.kind === 'sure'"
          :x="rw.left"
          y="2"
          :width="rw.width"
          height="12"
          rx="3"
          class="wins-bars__fill-sure"
          data-testid="win-bar-sure"
        />
        <rect
          v-else
          :x="rw.left"
          y="2"
          :width="rw.width"
          height="12"
          rx="3"
          :fill="`url(#${patternId})`"
          data-testid="win-bar-market"
        />
      </svg>
      <span class="wins-bars__value" :class="rw.kind === 'market' ? 'text-warning' : 'text-success'">
        {{ rw.valueText }}
      </span>
    </div>
    <div class="wins-bars__legend">Bar = impact from a common zero axis; striped = market-dependent range (not guaranteed).</div>
  </div>
</template>

<style scoped>
.wins-bars__row {
  display: grid;
  grid-template-columns: minmax(120px, 170px) 1fr minmax(96px, auto);
  gap: 10px;
  align-items: center;
  font-size: 13px;
  margin-bottom: 12px;
}
.wins-bars__label {
  color: var(--text-primary, #1e293b);
}
.wins-bars__note {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #64748b);
}
.wins-bars__track {
  width: 100%;
  height: 16px;
  display: block;
}
.wins-bars__bg {
  fill: rgba(var(--v-theme-on-surface), 0.06);
}
.wins-bars__zero {
  stroke: rgba(var(--v-theme-on-surface), 0.25);
  stroke-width: 0.6;
}
.wins-bars__fill-sure {
  fill: rgb(var(--v-theme-success));
}
.wins-bars__value {
  font-family: "JetBrains Mono", monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}
.wins-bars__legend {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}
</style>

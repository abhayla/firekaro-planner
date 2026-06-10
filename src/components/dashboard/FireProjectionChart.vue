<script setup lang="ts">
import { computed, ref } from "vue";
import { Line } from "vue-chartjs";
import { useFireDerive } from "@/lib/useFireDerive";
import { registerChartJSOnce, CHART_COLORS } from "@/lib/chart-setup";
import { formatINRCompact } from "@/lib/formatters";
import { fireProjectionTaxNote } from "@/lib/tax";
import type { Plugin } from "chart.js";

registerChartJSOnce();

const fire = useFireDerive();

// #139 — real (today's-₹) vs nominal (future-₹) toggle. Chart-LOCAL state (not a persisted
// ui-store preference for v1). OFF = the projection byte-identical; ON = every plotted ₹
// deflated to today's purchasing power at general CPI. The frame is surfaced on the value-axis
// title AND every tooltip row (a scale change with no label change is a Tier-0 honesty violation).
const showRealTerms = ref(false);
const frameLabel = computed(() => (showRealTerms.value ? "Today's ₹" : "Future ₹"));
const deflated = computed(() => fire.deflateProjection(showRealTerms.value));

const labels = computed(() => fire.projection.value.map((p) => p.year.toString()));

// Plugin that draws vertical reference lines at Lean / Regular / Fat crossover years.
const crossoverMarkersPlugin: Plugin<"line"> = {
  id: "crossoverMarkers",
  afterDatasetsDraw(chart) {
    const c = fire.crossovers.value;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;
    const ctx = chart.ctx;
    const top = yScale.top;
    const bottom = yScale.bottom;

    function drawAt(year: number | null, color: string, label: string) {
      if (!year) return;
      const idx = labels.value.indexOf(year.toString());
      if (idx < 0) return;
      const x = xScale.getPixelForValue(idx);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label near top of line
      ctx.fillStyle = color;
      ctx.font = "600 10px Inter, sans-serif";
      ctx.globalAlpha = 1;
      ctx.fillText(label, x + 4, top + 12);
      ctx.restore();
    }

    drawAt(c.lean.year, CHART_COLORS.lean, "Lean");
    drawAt(c.regular.year, CHART_COLORS.regular, "Regular");
    drawAt(c.fat.year, CHART_COLORS.fat, "Fat");
  },
};

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    {
      label: "Projected corpus",
      data: deflated.value.map((p) => p.corpus),
      borderColor: CHART_COLORS.corpus,
      backgroundColor: "rgba(24, 103, 192, 0.12)",
      fill: true,
      tension: 0.25,
      pointRadius: 0,
      borderWidth: 2,
    },
    {
      label: "Lean FIRE target",
      data: deflated.value.map((p) => p.targetForLean),
      borderColor: CHART_COLORS.lean,
      borderDash: [4, 4],
      borderWidth: 1.5,
      fill: false,
      pointRadius: 0,
    },
    {
      label: "Regular FIRE target",
      data: deflated.value.map((p) => p.targetForRegular),
      borderColor: CHART_COLORS.regular,
      borderDash: [4, 4],
      borderWidth: 1.5,
      fill: false,
      pointRadius: 0,
    },
    {
      label: "Fat FIRE target",
      data: deflated.value.map((p) => p.targetForFat),
      borderColor: CHART_COLORS.fat,
      borderDash: [4, 4],
      borderWidth: 1.5,
      fill: false,
      pointRadius: 0,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { boxWidth: 12, usePointStyle: true, font: { size: 11 } },
    },
    tooltip: {
      callbacks: {
        // Every tooltip row names the frame so a real/nominal switch is never silent.
        label: (ctx: any) => `${ctx.dataset.label}: ${formatINRCompact(ctx.parsed.y)} (${frameLabel.value})`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      // Value-axis title flips with the toggle — the honesty guard against a silent rescale.
      title: { display: true, text: `Corpus — ${frameLabel.value}`, font: { size: 11, weight: "bold" as const } },
      ticks: {
        callback: (val: any) => formatINRCompact(Number(val)),
        font: { size: 10 },
      },
      grid: { color: "rgba(148, 163, 184, 0.18)" },
    },
    x: {
      ticks: { font: { size: 10 } },
      grid: { display: false },
    },
  },
}));

// #19 (Tier-0 honesty): a multi-decade projection runs past the newest configured
// tax FY — disclose that those years assume today's slabs, never hide it.
const taxStalenessNote = computed(() => {
  const proj = fire.projection.value;
  return proj.length ? fireProjectionTaxNote(proj[proj.length - 1].year) : null;
});

const crossoverChips = computed(() => {
  const xs: { label: string; year: number; color: string }[] = [];
  const c = fire.crossovers.value;
  if (c.lean.year) xs.push({ label: "Lean", year: c.lean.year, color: CHART_COLORS.lean });
  if (c.regular.year) xs.push({ label: "Regular", year: c.regular.year, color: CHART_COLORS.regular });
  if (c.fat.year) xs.push({ label: "Fat", year: c.fat.year, color: CHART_COLORS.fat });
  return xs;
});
</script>

<template>
  <v-card variant="outlined" class="pa-4 h-100">
    <div class="d-flex align-center justify-space-between mb-2 flex-wrap ga-2">
      <h3 class="text-subtitle-1 font-weight-bold">Your path to FIRE</h3>
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-btn-toggle
          v-model="showRealTerms"
          density="compact"
          variant="outlined"
          divided
          mandatory
          data-testid="fire-projection-frame-toggle"
          aria-label="Show the projection in today's rupees or future rupees"
        >
          <v-btn :value="true" size="x-small">Today's ₹</v-btn>
          <v-btn :value="false" size="x-small">Future ₹</v-btn>
        </v-btn-toggle>
        <div class="d-flex ga-1">
          <v-chip
            v-for="x in crossoverChips"
            :key="x.label"
            size="x-small"
            variant="tonal"
          >
            {{ x.label }}: {{ x.year }}
          </v-chip>
        </div>
      </div>
    </div>
    <p class="frame-note" data-testid="fire-projection-frame-note">
      <v-icon icon="mdi-cash-clock" size="14" class="mr-1" />Showing <strong>{{ frameLabel }}</strong>
      <template v-if="showRealTerms"> — corpus &amp; targets deflated to today's purchasing power (general inflation).</template>
      <template v-else> — nominal future rupees; ₹1 in {{ labels[labels.length - 1] }} buys far less than today.</template>
    </p>
    <div class="chart-wrap" role="img" aria-label="FIRE corpus projection chart showing your path to financial independence">
      <Line :data="chartData" :options="chartOptions" :plugins="[crossoverMarkersPlugin]" :aria-label="'FIRE corpus projection over time'" />
    </div>
    <p v-if="taxStalenessNote" class="tax-note" data-testid="fire-projection-tax-staleness">
      <v-icon icon="mdi-information-outline" size="14" class="mr-1" />{{ taxStalenessNote }}
    </p>
  </v-card>
</template>

<style scoped>
.chart-wrap {
  position: relative;
  height: 340px;
}

.tax-note,
.frame-note {
  margin-top: var(--space-2);
  font-size: var(--type-xs, 0.75rem);
  line-height: var(--leading-snug, 1.35);
  color: var(--text-muted);
  display: flex;
  align-items: flex-start;
}

.frame-note {
  margin-top: var(--space-1, 0.25rem);
  margin-bottom: var(--space-1, 0.25rem);
}
</style>

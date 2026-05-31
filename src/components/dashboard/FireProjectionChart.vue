<script setup lang="ts">
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { useFireDerive } from "@/lib/useFireDerive";
import { registerChartJSOnce, CHART_COLORS } from "@/lib/chart-setup";
import { formatINRCompact } from "@/lib/formatters";
import type { Plugin } from "chart.js";

registerChartJSOnce();

const fire = useFireDerive();

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
      data: fire.projection.value.map((p) => p.corpus),
      borderColor: CHART_COLORS.corpus,
      backgroundColor: "rgba(24, 103, 192, 0.12)",
      fill: true,
      tension: 0.25,
      pointRadius: 0,
      borderWidth: 2,
    },
    {
      label: "Lean FIRE target",
      data: fire.projection.value.map((p) => p.targetForLean),
      borderColor: CHART_COLORS.lean,
      borderDash: [4, 4],
      borderWidth: 1.5,
      fill: false,
      pointRadius: 0,
    },
    {
      label: "Regular FIRE target",
      data: fire.projection.value.map((p) => p.targetForRegular),
      borderColor: CHART_COLORS.regular,
      borderDash: [4, 4],
      borderWidth: 1.5,
      fill: false,
      pointRadius: 0,
    },
    {
      label: "Fat FIRE target",
      data: fire.projection.value.map((p) => p.targetForFat),
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
        label: (ctx: any) => `${ctx.dataset.label}: ${formatINRCompact(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
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
    <div class="d-flex align-center justify-space-between mb-2">
      <h3 class="text-subtitle-1 font-weight-bold">Your path to FIRE</h3>
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
    <div class="chart-wrap" role="img" aria-label="FIRE corpus projection chart showing your path to financial independence">
      <Line :data="chartData" :options="chartOptions" :plugins="[crossoverMarkersPlugin]" :aria-label="'FIRE corpus projection over time'" />
    </div>
  </v-card>
</template>

<style scoped>
.chart-wrap {
  position: relative;
  height: 340px;
}
</style>

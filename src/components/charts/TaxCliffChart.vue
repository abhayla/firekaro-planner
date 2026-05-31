<script setup lang="ts">
/**
 * Tax-cliff chart (audit Entry #13 A13.3). Plots total tax against gross income
 * under the NEW regime, with an optional OLD-regime overlay, and shades the
 * ₹12L–₹12.75L marginal-relief band where the 87A rebate phases out.
 */
import { computed, ref } from "vue";
import { Line } from "vue-chartjs";
import type { Plugin, ChartData } from "chart.js";
import { registerChartJSOnce } from "@/lib/chart-setup";
import { taxCliffSeries, REBATE_CLIFF_BAND } from "@/lib/tax-cliff";
import { formatINRCompact } from "@/lib/formatters";

registerChartJSOnce();

const props = withDefaults(
  defineProps<{
    fy: string;
    /** Deductions assumed for the OLD-regime overlay curve. */
    oldDeductions?: number;
    maxIncome?: number;
  }>(),
  { oldDeductions: 0, maxIncome: 3_000_000 },
);

const showOld = ref(false);

const series = computed(() =>
  taxCliffSeries({
    fy: props.fy,
    minIncome: 0,
    maxIncome: props.maxIncome,
    step: 50_000,
    oldDeductions: props.oldDeductions,
  }),
);

const chartData = computed((): ChartData<"line"> => {
  const datasets: ChartData<"line">["datasets"] = [
    {
      label: "New regime",
      data: series.value.map((p) => ({ x: p.income, y: p.newTax })),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37, 99, 235, 0.08)",
      fill: true,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.1,
    },
  ];
  if (showOld.value) {
    datasets.push({
      label: "Old regime",
      data: series.value.map((p) => ({ x: p.income, y: p.oldTax })),
      borderColor: "#f97316",
      backgroundColor: "transparent",
      fill: false,
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.1,
    });
  }
  return { datasets };
});

// Inline plugin (no new dependency) — shade the rebate-cliff band.
const bandPlugin: Plugin<"line"> = {
  id: "rebateBand",
  beforeDatasetsDraw(chart) {
    const x = chart.scales.x;
    const area = chart.chartArea;
    if (!x || !area) return;
    const xLo = x.getPixelForValue(REBATE_CLIFF_BAND.lo);
    const xHi = x.getPixelForValue(REBATE_CLIFF_BAND.hi);
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
    ctx.fillRect(xLo, area.top, Math.max(2, xHi - xLo), area.bottom - area.top);
    ctx.restore();
  },
};

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: { display: true, labels: { font: { family: "Inter", size: 11 } } },
    tooltip: {
      backgroundColor: "#18181b",
      padding: 12,
      cornerRadius: 8,
      titleFont: { family: "Inter", size: 12, weight: 600 as const },
      bodyFont: { family: "JetBrains Mono", size: 12 },
      callbacks: {
        title: (items: { parsed: { x: number | null } }[]) =>
          `Income ${formatINRCompact(items[0]?.parsed.x ?? 0)}`,
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label}: ${formatINRCompact(ctx.parsed.y ?? 0)}`,
      },
    },
  },
  scales: {
    x: {
      type: "linear" as const,
      min: 0,
      max: props.maxIncome,
      grid: { display: false },
      ticks: {
        font: { family: "JetBrains Mono", size: 11 },
        color: "#71717a",
        maxTicksLimit: 8,
        callback: (val: number | string) => formatINRCompact(Number(val)),
      },
    },
    y: {
      grid: { color: "rgba(0,0,0,0.04)" },
      ticks: {
        font: { family: "JetBrains Mono", size: 11 },
        color: "#71717a",
        callback: (val: number | string) => formatINRCompact(Number(val)),
      },
    },
  },
}));
</script>

<template>
  <v-card variant="outlined" class="pa-4" data-testid="tax-cliff-chart">
    <div class="d-flex align-center justify-space-between mb-2 flex-wrap ga-2">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Tax cliff — income vs tax</h3>
        <div class="text-caption text-medium-emphasis">
          The shaded band (₹12L–₹12.75L) is where the new-regime 87A rebate phases out —
          a small raise here triggers a sharp tax jump (softened by marginal relief).
        </div>
      </div>
      <v-switch
        v-model="showOld"
        label="Overlay old regime"
        density="compact"
        color="fire-orange"
        hide-details
        data-testid="tax-cliff-old-toggle"
      />
    </div>
    <div class="cliff-chart-wrap" aria-label="Income versus tax line chart with rebate-cliff band">
      <Line :data="chartData" :options="chartOptions" :plugins="[bandPlugin]" />
    </div>
  </v-card>
</template>

<style scoped>
.cliff-chart-wrap {
  height: 280px;
  position: relative;
}
</style>

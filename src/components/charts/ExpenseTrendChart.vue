<script setup lang="ts">
/**
 * Year-on-year expense chart (audit A29.3, P3). Plots the REAL captured
 * annual-expense snapshots against the trajectory those expenses WOULD follow
 * if they grew exactly at the household's blended inflation from the first
 * captured point. Actual rising above the inflation line = lifestyle inflation
 * (feeds the A29.2 nudge). No synthetic series — with ≤1 point it renders an
 * honest empty-state.
 */
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { registerChartJSOnce } from "@/lib/chart-setup";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadAllSnapshots, periodLabel, monthsBetween } from "@/lib/expense-history";
import { formatINRCompact } from "@/lib/formatters";

registerChartJSOnce();

const household = useHouseholdStore();
const assumptions = useAssumptionsStore();

const points = computed(() => {
  void household.snapshotVersion;
  return loadAllSnapshots();
});

const isEmpty = computed(() => points.value.length <= 1);

// Names the rate on screen (ADR-0006): "your spending basket", never the bare word "inflation" —
// the app also shows a general-CPI figure and the two must never read as the same thing.
const basketLabel = computed(
  () => `At your spending basket (${(assumptions.householdInflation() * 100).toFixed(1)}%)`,
);

// Inflation trajectory: anchor on the first snapshot's total and compound the
// household blended inflation per elapsed month.
const inflationLine = computed(() => {
  const snaps = points.value;
  if (snaps.length === 0) return [];
  const base = snaps[0];
  // ADR-0006: the household spending BASKET (4-bucket blend, ~6.2% on defaults) — the same rate
  // the kernel grows the FIRE target at. Correct here (this line is about EXPENSES), and now
  // labelled as such: the general-CPI figure is a different number and is never used on this chart.
  const annual = assumptions.householdInflation();
  const monthly = Math.pow(1 + annual, 1 / 12) - 1;
  return snaps.map((s) => {
    const months = monthsBetween(base.period, s.period);
    return Math.round(base.totalAnnual * Math.pow(1 + monthly, months));
  });
});

const chartData = computed(() => ({
  labels: points.value.map((s) => periodLabel(s.period)),
  datasets: [
    {
      label: "Actual annual spend",
      data: points.value.map((s) => s.totalAnnual),
      borderColor: "#dc2626",
      backgroundColor: "rgba(220, 38, 38, 0.10)",
      fill: true,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.25,
    },
    {
      label: basketLabel.value,
      data: inflationLine.value,
      borderColor: "#71717a",
      borderDash: [5, 4],
      backgroundColor: "transparent",
      fill: false,
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0.25,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: "bottom" as const,
      labels: { font: { family: "Inter", size: 11 }, color: "#71717a", usePointStyle: true, boxWidth: 6 },
    },
    tooltip: {
      backgroundColor: "#18181b",
      padding: 12,
      cornerRadius: 8,
      titleFont: { family: "Inter", size: 12, weight: 600 as const },
      bodyFont: { family: "JetBrains Mono", size: 12 },
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label}: ${formatINRCompact(ctx.parsed.y ?? 0)}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { family: "Inter", size: 11 }, color: "#71717a", maxTicksLimit: 8 } },
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
  <v-card variant="outlined" class="pa-4 expense-trend-card">
    <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
      <div>
        <h3 class="expense-trend-card__title">Expenses over time</h3>
        <div class="expense-trend-card__sub">Actual annual spend vs. blended-inflation trajectory</div>
      </div>
      <v-chip size="x-small" variant="tonal" color="error">{{ points.length }} pts</v-chip>
    </div>

    <div v-if="isEmpty" class="expense-trend-card__empty">
      <v-icon icon="mdi-chart-line" size="48" color="grey" />
      <div class="expense-trend-card__empty-title">Your year-on-year trend builds as you track</div>
      <div class="expense-trend-card__empty-copy">
        We snapshot your total spend once a month. Check back next month to see whether your
        lifestyle is inflating faster than prices.
      </div>
    </div>
    <div v-else class="expense-trend-card__chart-wrap" aria-label="Expenses over time line chart">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </v-card>
</template>

<style scoped>
.expense-trend-card__title {
  font-family: var(--font-display);
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}
.expense-trend-card__sub {
  font-size: var(--type-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
.expense-trend-card__chart-wrap {
  height: 260px;
  position: relative;
}
.expense-trend-card__empty {
  height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: var(--surface-muted);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-subtle);
}
.expense-trend-card__empty-title {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.expense-trend-card__empty-copy {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  max-width: 320px;
  text-align: center;
}
</style>

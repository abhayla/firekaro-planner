<script setup lang="ts">
/**
 * FIRE-trajectory chart (audit A30.3, P3). Plots the headline FIRE-number
 * snapshot series over time so the user can see their target move as inputs
 * change (feeds the goal-post-shift insight). REAL data only — no synthetic
 * series. With ≤1 captured point it renders an honest empty-state rather than
 * a fabricated flat line; the series accrues one real point per month.
 */
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { registerChartJSOnce } from "@/lib/chart-setup";
import { useHouseholdStore } from "@/stores/household";
import { loadAllSnapshots, periodLabel } from "@/lib/expense-history";
import { formatINRCompact } from "@/lib/formatters";

registerChartJSOnce();

const household = useHouseholdStore();

// Depend on snapshotVersion so we re-read the (non-reactive) localStorage
// whenever a snapshot is captured/enriched.
const points = computed(() => {
  void household.snapshotVersion;
  return loadAllSnapshots().filter((s) => typeof s.fireNumber === "number");
});

const isEmpty = computed(() => points.value.length <= 1);

const chartData = computed(() => ({
  labels: points.value.map((s) => periodLabel(s.period)),
  datasets: [
    {
      label: "FIRE target",
      data: points.value.map((s) => s.fireNumber as number),
      borderColor: "#f97316",
      backgroundColor: "rgba(249, 115, 22, 0.10)",
      fill: true,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.25,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#18181b",
      padding: 12,
      cornerRadius: 8,
      titleFont: { family: "Inter", size: 12, weight: 600 as const },
      bodyFont: { family: "JetBrains Mono", size: 12 },
      callbacks: {
        label: (ctx: { parsed: { y: number | null } }) => formatINRCompact(ctx.parsed.y ?? 0),
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
  <v-card variant="outlined" class="pa-4 trajectory-card">
    <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
      <div>
        <h3 class="trajectory-card__title">FIRE target over time</h3>
        <div class="trajectory-card__sub">Your headline FIRE number, captured monthly</div>
      </div>
      <v-chip size="x-small" variant="tonal" color="fire-orange">{{ points.length }} pts</v-chip>
    </div>

    <div v-if="isEmpty" class="trajectory-card__empty">
      <v-icon icon="mdi-chart-timeline-variant" size="48" color="grey" />
      <div class="trajectory-card__empty-title">Your trajectory builds over time</div>
      <div class="trajectory-card__empty-copy">
        We capture your FIRE number once a month. Check back next month to see your target move as
        your plan evolves.
      </div>
    </div>
    <div v-else class="trajectory-card__chart-wrap" aria-label="FIRE target over time line chart">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </v-card>
</template>

<style scoped>
.trajectory-card__title {
  font-family: var(--font-display);
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}
.trajectory-card__sub {
  font-size: var(--type-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
.trajectory-card__chart-wrap {
  height: 260px;
  position: relative;
}
.trajectory-card__empty {
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
.trajectory-card__empty-title {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.trajectory-card__empty-copy {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  max-width: 320px;
  text-align: center;
}
</style>

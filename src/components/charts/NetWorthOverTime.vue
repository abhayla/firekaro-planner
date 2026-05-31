<script setup lang="ts">
/**
 * Net-worth-over-time chart. REAL data only (Rule 20 / honesty) — reads the
 * monthly net-worth snapshot series captured on the Dashboard, NOT a synthesised
 * back-projection from current corpus. With ≤1 captured point it renders an
 * honest empty-state rather than a fabricated history; the series accrues one
 * real point per month. Mirrors FireTrajectoryChart (A30.3).
 */
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { registerChartJSOnce } from "@/lib/chart-setup";
import { useHouseholdStore } from "@/stores/household";
import { loadAllSnapshots, periodLabel } from "@/lib/expense-history";
import { formatINRCompact } from "@/lib/formatters";

registerChartJSOnce();

const household = useHouseholdStore();

// Depend on snapshotVersion so we re-read (non-reactive) localStorage whenever a
// snapshot is captured/enriched.
const points = computed(() => {
  void household.snapshotVersion;
  return loadAllSnapshots().filter((s) => typeof s.netWorth === "number");
});

const isEmpty = computed(() => points.value.length <= 1);

const chartData = computed(() => ({
  labels: points.value.map((s) => periodLabel(s.period)),
  datasets: [
    {
      label: "Net worth",
      data: points.value.map((s) => s.netWorth as number),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37, 99, 235, 0.10)",
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
  <v-card variant="outlined" class="pa-4 networth-card">
    <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
      <div>
        <h3 class="networth-card__title">Net Worth over time</h3>
        <div class="networth-card__sub">Your net worth (corpus − liabilities), captured monthly</div>
      </div>
      <v-chip size="x-small" variant="tonal" color="primary">{{ points.length }} pts</v-chip>
    </div>
    <div v-if="isEmpty" class="networth-card__empty">
      <v-icon icon="mdi-chart-line-variant" size="48" color="grey" />
      <div class="networth-card__empty-title">Your net-worth trend builds over time</div>
      <div class="networth-card__empty-copy">
        We capture your net worth once a month. Check back next month to see it move as your
        corpus grows and liabilities shrink.
      </div>
    </div>
    <div v-else class="networth-card__chart-wrap" aria-label="Net worth over time line chart">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </v-card>
</template>

<style scoped>
.networth-card__title {
  font-family: var(--font-display);
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

.networth-card__sub {
  font-size: var(--type-xs);
  color: var(--text-muted);
  margin-top: 2px;
}

.networth-card__chart-wrap {
  height: 280px;
  position: relative;
}

.networth-card__empty {
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

.networth-card__empty-title {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.networth-card__empty-copy {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  max-width: 320px;
  text-align: center;
}
</style>

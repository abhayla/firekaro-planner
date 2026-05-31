<script setup lang="ts">
import { computed } from "vue";
import { Doughnut } from "vue-chartjs";
import { useFireDerive } from "@/lib/useFireDerive";
import { allocationByAge } from "@/lib/adequacy";
import { registerChartJSOnce, CHART_COLORS } from "@/lib/chart-setup";
import { formatINRCompact } from "@/lib/formatters";
import { assetClass } from "@/lib/investment-traits";

registerChartJSOnce();

const fire = useFireDerive();

// Donut rolls up the 5 asset classes returned by investment-traits.assetClass()
// into the 5-bucket display. "alternative" (REIT + Crypto + ESOP) lands in
// "cash" for the v4-faithful 5-bucket donut; the new /investments/buckets route
// (Phase 5 Stage N) renders the full 4-bucket time-horizon breakdown.
const buckets = computed(() => {
  const out = { equity: 0, debt: 0, realEstate: 0, gold: 0, cash: 0 };
  for (const i of fire.lensedInvestments.value) {
    switch (assetClass(i)) {
      case "equity":
        out.equity += i.value;
        break;
      case "debt":
        out.debt += i.value;
        break;
      case "realEstate":
        out.realEstate += i.value;
        break;
      case "gold":
        out.gold += i.value;
        break;
      case "alternative":
        // REIT + Crypto + (ESOP routes to equity via assetClass, so unreached)
        out.cash += i.value;
        break;
    }
  }
  return out;
});

const total = computed(() =>
  buckets.value.equity + buckets.value.debt + buckets.value.realEstate + buckets.value.gold + buckets.value.cash,
);

const chartData = computed(() => ({
  labels: ["Equity", "Debt", "Real Estate", "Gold", "Cash & Other"],
  datasets: [
    {
      data: [
        buckets.value.equity,
        buckets.value.debt,
        buckets.value.realEstate,
        buckets.value.gold,
        buckets.value.cash,
      ],
      backgroundColor: [
        CHART_COLORS.equity,
        CHART_COLORS.debt,
        CHART_COLORS.realEstate,
        CHART_COLORS.gold,
        CHART_COLORS.cash,
      ],
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.6)",
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: "62%",
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const v = ctx.parsed;
          const pct = total.value > 0 ? ((v / total.value) * 100).toFixed(1) : "0";
          return `${ctx.label}: ${formatINRCompact(v)} (${pct}%)`;
        },
      },
    },
  },
}));

const allocation = computed(() => allocationByAge(fire.anchorAge.value, buckets.value.equity, total.value));

function pctOf(bucket: number): string {
  if (total.value === 0) return "0%";
  return `${Math.round((bucket / total.value) * 100)}%`;
}
</script>

<template>
  <v-card variant="outlined" class="pa-4 h-100">
    <h3 class="text-subtitle-1 font-weight-bold mb-2">How your corpus is invested</h3>
    <div v-if="total === 0" class="text-caption text-medium-emphasis my-6 text-center">
      Add investments to see allocation.
    </div>
    <div v-else class="donut-wrap d-flex flex-column align-center">
      <div class="chart-wrap" role="img" :aria-label="`Asset allocation donut chart showing ${allocation.equityPercent}% equity exposure`">
        <Doughnut :data="chartData" :options="chartOptions" aria-label="Asset allocation breakdown" />
      </div>
      <div class="text-h6 font-weight-bold mt-2">{{ formatINRCompact(total) }}</div>
      <div class="text-caption text-medium-emphasis mb-2">
        Your portfolio is {{ allocation.equityPercent }}% equity
      </div>
      <v-chip
        size="small"
        :color="allocation.status === 'adequate' ? 'success' : 'warning'"
        variant="tonal"
      >
        <v-icon
          :icon="allocation.status === 'adequate' ? 'mdi-check-circle' : 'mdi-alert'"
          size="x-small"
          class="mr-1"
        />
        {{ allocation.message }}
      </v-chip>

      <div class="segment-legend mt-3 d-flex flex-wrap justify-center ga-2">
        <span class="legend-row" :style="`--swatch:${CHART_COLORS.equity}`">Equity {{ pctOf(buckets.equity) }}</span>
        <span class="legend-row" :style="`--swatch:${CHART_COLORS.debt}`">Debt {{ pctOf(buckets.debt) }}</span>
        <span class="legend-row" :style="`--swatch:${CHART_COLORS.realEstate}`">RE {{ pctOf(buckets.realEstate) }}</span>
        <span class="legend-row" :style="`--swatch:${CHART_COLORS.gold}`">Gold {{ pctOf(buckets.gold) }}</span>
        <span class="legend-row" :style="`--swatch:${CHART_COLORS.cash}`">Other {{ pctOf(buckets.cash) }}</span>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.chart-wrap {
  position: relative;
  height: 200px;
  width: 200px;
}
.legend-row {
  font-size: 11px;
  display: inline-flex;
  align-items: center;
}
.legend-row::before {
  content: "";
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 6px;
  background: var(--swatch, currentColor);
}
</style>

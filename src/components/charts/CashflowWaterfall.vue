<script setup lang="ts">
import { computed } from "vue";
import { Bar } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const fire = useFireDerive();

// 8c — Monthly cashflow waterfall: Income → -Expenses → -Investments → Net Saved
// Implemented as a stacked-floating-bar trick: the "transparent" base series
// positions each bar at the cumulative running total; the "value" series renders the bar.
const chartData = computed(() => {
  // #23 follow-up: cashflow mixes income with HOUSEHOLD expenses/savings, so income MUST be the
  // whole-household figure — a lensed (one-member) income over a household expense base renders a
  // spurious negative surplus. householdAnnualIncome === annualIncome.total on the default lens.
  const monthlyIncome = (fire.householdAnnualIncome.value ?? 0) / 12;
  const monthlyExpenses = fire.annualExpensesToday.value / 12;
  const monthlySavings = (fire.annualSavings.value || 0) / 12;
  const monthlyInvestments = Math.max(0, monthlyIncome - monthlyExpenses - monthlySavings);
  const monthlyNet = monthlyIncome - monthlyExpenses - monthlyInvestments;

  // Each step's [base, value] for floating bar effect
  // Income starts at 0 going up; Expenses descend from income; Investments descend further;
  // Net is the leftover (positive) shown as a separate bar from 0
  const steps = [
    { label: "Income", base: 0, value: monthlyIncome, color: "#10b981" },
    { label: "Expenses", base: monthlyIncome - monthlyExpenses, value: monthlyExpenses, color: "#ef4444" },
    {
      label: "Investments",
      base: monthlyIncome - monthlyExpenses - monthlyInvestments,
      value: monthlyInvestments,
      color: "#6366f1",
    },
    { label: "Net Saved", base: 0, value: Math.max(0, monthlyNet), color: "#2563eb" },
  ];

  return {
    labels: steps.map((s) => s.label),
    datasets: [
      {
        label: "base",
        data: steps.map((s) => s.base),
        backgroundColor: "rgba(0,0,0,0)",
        borderWidth: 0,
        stack: "waterfall",
      },
      {
        label: "amount",
        data: steps.map((s) => s.value),
        backgroundColor: steps.map((s) => s.color),
        borderRadius: 4,
        stack: "waterfall",
        barPercentage: 0.5,
      },
    ],
  };
});

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
      filter: (ctx: { datasetIndex: number }) => ctx.datasetIndex === 1,
      callbacks: {
        label: (ctx: { parsed: { y: number | null }; label: string }) =>
          `${ctx.label}: ${formatINRCompact(ctx.parsed.y ?? 0)}`,
      },
    },
  },
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
      ticks: { font: { family: "Inter", size: 12, weight: 500 as const }, color: "#52525b" },
    },
    y: {
      stacked: true,
      grid: { color: "rgba(0,0,0,0.04)" },
      ticks: {
        font: { family: "JetBrains Mono", size: 11 },
        color: "#71717a",
        callback: (val: number | string) => formatINRCompact(Number(val)),
      },
    },
  },
}));

const isEmpty = computed(
  () => (fire.householdAnnualIncome.value ?? 0) === 0 && fire.annualExpensesToday.value === 0,
);
</script>

<template>
  <v-card variant="outlined" class="pa-4 cashflow-card">
    <div class="cashflow-card__header">
      <h3 class="cashflow-card__title">Monthly Cashflow</h3>
      <div class="cashflow-card__sub">
        Where your money goes each month · Income → Expenses → Investments → Net Saved
      </div>
    </div>
    <div v-if="isEmpty" class="cashflow-card__empty">
      <v-icon icon="mdi-cash-flow" size="48" color="grey" />
      <div class="cashflow-card__empty-title">No cashflow yet</div>
      <div class="cashflow-card__empty-copy">
        Add income and expenses to visualise where your money goes.
      </div>
    </div>
    <div v-else class="cashflow-card__chart-wrap" aria-label="Monthly cashflow waterfall chart">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </v-card>
</template>

<style scoped>
.cashflow-card__header {
  margin-bottom: var(--space-3);
}

.cashflow-card__title {
  font-family: var(--font-display);
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

.cashflow-card__sub {
  font-size: var(--type-xs);
  color: var(--text-muted);
  margin-top: 2px;
}

.cashflow-card__chart-wrap {
  height: 280px;
  position: relative;
}

.cashflow-card__empty {
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

.cashflow-card__empty-title {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.cashflow-card__empty-copy {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  max-width: 300px;
  text-align: center;
}
</style>

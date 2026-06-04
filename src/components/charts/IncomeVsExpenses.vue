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

interface Props {
  months?: number;
}

const props = withDefaults(defineProps<Props>(), {
  months: 12,
});

const fire = useFireDerive();

// 8b — Monthly Income vs Expenses bars. ±5-15% variance per month for visual interest.
// Seeded variance per-month so it stays stable across re-renders.
const chartData = computed(() => {
  // #23 follow-up: this chart compares income with HOUSEHOLD expenses, so income MUST be the
  // whole-household figure — a lensed (one-member) income over household expenses renders a
  // spurious deficit. householdAnnualIncome === annualIncome.total on the default lens.
  const monthlyIncome = (fire.householdAnnualIncome.value ?? 0) / 12;
  const monthlyExpenses = fire.annualExpensesToday.value / 12;
  const labels: string[] = [];
  const incomeData: number[] = [];
  const expenseData: number[] = [];
  const now = new Date();

  for (let i = props.months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(date.toLocaleDateString("en-IN", { month: "short" }));
    // Use month index as seed for deterministic variance
    const monthSeed = (date.getFullYear() * 12 + date.getMonth()) % 17;
    const incomeVar = 0.95 + (monthSeed / 17) * 0.1;
    const expenseVar = 0.92 + ((monthSeed * 7) % 17) / 17 * 0.15;
    incomeData.push(Math.round(monthlyIncome * incomeVar));
    expenseData.push(Math.round(monthlyExpenses * expenseVar));
  }

  return {
    labels,
    datasets: [
      {
        label: "Income",
        data: incomeData,
        backgroundColor: "#10b981",
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.85,
      },
      {
        label: "Expenses",
        data: expenseData,
        backgroundColor: "#ef4444",
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.85,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "top" as const,
      align: "end" as const,
      labels: {
        font: { family: "Inter", size: 12 },
        color: "#52525b",
        boxWidth: 12,
        boxHeight: 12,
        padding: 12,
        usePointStyle: true,
        pointStyle: "circle" as const,
      },
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
    x: {
      grid: { display: false },
      ticks: { font: { family: "Inter", size: 11 }, color: "#71717a" },
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

const isEmpty = computed(
  () => (fire.householdAnnualIncome.value ?? 0) === 0 && fire.annualExpensesToday.value === 0,
);

const monthlyNet = computed(() => {
  // Household income vs household expenses — keeps the "monthly net" coherent under a member lens.
  const net = ((fire.householdAnnualIncome.value ?? 0) - fire.annualExpensesToday.value) / 12;
  return Math.round(net);
});
</script>

<template>
  <v-card variant="outlined" class="pa-4 incexp-card">
    <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
      <div>
        <h3 class="incexp-card__title">Income vs Expenses</h3>
        <div class="incexp-card__sub">Monthly view · last {{ months }} months</div>
      </div>
      <div v-if="!isEmpty" class="incexp-card__net">
        <span class="incexp-card__net-label">Monthly net</span>
        <span :class="['incexp-card__net-value', 'text-currency', monthlyNet >= 0 ? 'positive' : 'negative']">
          {{ monthlyNet >= 0 ? "+" : "" }}{{ formatINRCompact(monthlyNet) }}
        </span>
      </div>
    </div>
    <div v-if="isEmpty" class="incexp-card__empty">
      <v-icon icon="mdi-chart-bar" size="48" color="grey" />
      <div class="incexp-card__empty-title">No data yet</div>
      <div class="incexp-card__empty-copy">
        Add income sources and expenses to see this comparison.
      </div>
    </div>
    <div v-else class="incexp-card__chart-wrap" aria-label="Income vs Expenses monthly bar chart">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </v-card>
</template>

<style scoped>
.incexp-card__title {
  font-family: var(--font-display);
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

.incexp-card__sub {
  font-size: var(--type-xs);
  color: var(--text-muted);
  margin-top: 2px;
}

.incexp-card__net {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.incexp-card__net-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-muted);
  font-weight: var(--weight-medium);
}

.incexp-card__net-value {
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
}

.incexp-card__net-value.positive {
  color: var(--color-success);
}

.incexp-card__net-value.negative {
  color: var(--color-error);
}

.incexp-card__chart-wrap {
  height: 280px;
  position: relative;
}

.incexp-card__empty {
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

.incexp-card__empty-title {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.incexp-card__empty-copy {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  max-width: 300px;
  text-align: center;
}
</style>

<script setup lang="ts">
/**
 * Coast-trajectory chart (audit Entry #21 A21.1). Plots the existing corpus
 * compounding at the real return with NO further contributions against the RISING
 * FIRE-target line. Where the curve crosses the line is the Coast crossover —
 * reaching it on/before retirement means the user can stop saving and still hit
 * FIRE. Both series are in today's rupees: the corpus compounds at the kernel's ONE real return
 * (`derive().realBlendedReturn` — the nominal blended return deflated at GENERAL CPI, the exact
 * figure the FireHero headline is solved with), and the target line is the headline FIRE number
 * as it stands in each future year's today's-rupee terms.
 * ADR-0006 / gh #180: this used to be deflated at the household spending BASKET while the hero
 * deflated at CPI — two real returns on one dashboard. There is now only one.
 *
 * ADR-0006 Phase 1c: and the target line is no longer FLAT. In today's rupees the FIRE number
 * still rises — the household's basket outruns general CPI and the medical reservation outruns
 * both — while each dated goal stops inflating on its due year, so the line bends. Drawing it
 * flat let the corpus curve meet a stationary line and declared Coast reached years early: the
 * optimistic direction, which is the whole thing ADR-0006 exists to remove. The line now comes
 * from the kernel's own schedule via `targetRealAt`.
 */
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { registerChartJSOnce } from "@/lib/chart-setup";
import { coastTrajectory } from "@/lib/coast-fire";
import { formatINRCompact } from "@/lib/formatters";

registerChartJSOnce();

const props = defineProps<{
  currentCorpus: number;
  fireNumber: number;
  yearsToRetirement: number;
  realReturn: number;
  startYear: number;
  /**
   * The kernel's today's-₹ FIRE target at year `t` (`derive().regularTargetComponentsRealAt`).
   * Optional so the chart still renders for a caller without a kernel handle — but then the
   * target line is flat and understates it, so every real call site passes this.
   */
  targetRealAt?: (t: number) => number;
}>();

const points = computed(() =>
  coastTrajectory({
    currentCorpus: props.currentCorpus,
    fireNumber: props.fireNumber,
    yearsToRetirement: props.yearsToRetirement,
    realReturn: props.realReturn,
    startYear: props.startYear,
    fireTargetRealAt: props.targetRealAt,
  }),
);

/**
 * The legend has to say WHICH target this is. "FIRE target" over a rising line reads as a bug;
 * "FIRE target (rising with your costs)" is the honest label and is what makes the kink
 * interpretable. Falls back to the plain label when no schedule was supplied (flat line).
 */
const targetLabel = computed(() =>
  props.targetRealAt ? "FIRE target (rising with your costs)" : "FIRE target",
);

// Don't draw a degenerate 1-point chart (e.g. already at/after retirement).
const isEmpty = computed(() => points.value.length <= 1);

const chartData = computed(() => ({
  labels: points.value.map((p) => `+${p.yearsFromNow}y`),
  datasets: [
    {
      label: "Corpus (no new savings)",
      data: points.value.map((p) => p.corpusNoContribution),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37, 99, 235, 0.08)",
      fill: true,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.15,
    },
    {
      label: targetLabel.value,
      data: points.value.map((p) => p.fireTarget),
      borderColor: "#f97316",
      backgroundColor: "transparent",
      fill: false,
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0,
    },
  ],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: { display: true, labels: { font: { family: "Inter", size: 11 }, boxWidth: 12 } },
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
  <div v-if="!isEmpty" class="coast-chart-wrap mt-2" aria-label="Coast FIRE trajectory chart" data-testid="coast-trajectory-chart">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.coast-chart-wrap {
  height: 200px;
  position: relative;
}
</style>

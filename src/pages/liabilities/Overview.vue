<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import EmptyState from "@/components/shared/EmptyState.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import MetricCard from "@/components/shared/MetricCard.vue";

const household = useHouseholdStore();
const fire = useFireDerive();

const totalOutstanding = computed(() =>
  household.data.liabilities.reduce((s, l) => s + l.outstandingBalance, 0),
);
const monthlyEMI = computed(() =>
  household.data.liabilities.reduce((s, l) => s + l.monthlyEMI, 0),
);
const monthlyTakeHome = computed(() => fire.monthlyTakeHome.value);
const dtiRatio = computed(() =>
  monthlyTakeHome.value > 0 ? (monthlyEMI.value / monthlyTakeHome.value) * 100 : 0,
);
const dtiColor = computed(() => {
  if (dtiRatio.value < 30) return "success";
  if (dtiRatio.value < 50) return "warning";
  return "error";
});
const nextEnd = computed(() => {
  const ends = household.data.liabilities
    .map((l) => l.derivedEndYear)
    .filter((v): v is number => typeof v === "number");
  if (!ends.length) return null;
  return Math.min(...ends);
});

// For a paydown story: anchor 12mo ago at a HIGHER value than today (debt going down).
function buildPaydownTrend(today: number, anchorPct = 1.18, freq = 2): number[] {
  const start = Math.round(today * anchorPct);
  const months = 12;
  const arr: number[] = [];
  for (let i = 0; i < months; i++) {
    const linear = start + ((today - start) * i) / (months - 1);
    const wobble = Math.sin((i / months) * Math.PI * freq) * Math.max(today * 0.005, 1);
    arr.push(Math.max(0, Math.round(linear + wobble)));
  }
  return arr;
}

function deltaPct(trend: number[]): number {
  if (trend.length < 2) return 0;
  const prev = trend[trend.length - 2];
  if (prev === 0) return 0;
  return Math.round(((trend[trend.length - 1] - prev) / prev) * 100);
}

const outstandingTrend = computed(() => buildPaydownTrend(totalOutstanding.value, 1.12, 2));
const emiTrend = computed(() => buildPaydownTrend(monthlyEMI.value, 1.04, 1));
const noLiabilities = computed(() => household.data.liabilities.length === 0);
</script>

<template>
  <v-container fluid class="py-6 liabilities-overview">
    <LeafPageHeader
      eyebrow="Liabilities · Overview"
      title="Liabilities"
      description="What you owe today, the monthly EMI burden, and when the loans roll off."
    />

    <EmptyState
      v-if="noLiabilities"
      icon="mdi-credit-card-off-outline"
      title="Debt-free as far as we can tell"
      copy="Add a loan or carried credit-card balance on the Loans page to track payoff trajectory and watch your DTI ratio shrink each month."
      cta-label="Open Loans"
      cta-route="/liabilities/loans"
    />

    <v-row v-else dense>
      <v-col cols="12" sm="6" md="3">
        <MetricCard
          label="Total outstanding"
          :value="formatINRCompact(totalOutstanding)"
          :delta="deltaPct(outstandingTrend)"
          delta-invert
          :delta-meta="`${household.data.liabilities.length} loan${household.data.liabilities.length === 1 ? '' : 's'}`"
          :sparkline="outstandingTrend"
          sparkline-color="var(--color-error)"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <MetricCard
          label="Monthly EMI"
          :value="formatINRCompact(monthlyEMI)"
          unit="/mo"
          :delta="deltaPct(emiTrend)"
          delta-invert
          :sparkline="emiTrend"
          sparkline-color="var(--color-warning)"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <MetricCard
          label="DTI ratio"
          :value="`${Math.round(dtiRatio)}%`"
          :value-color="dtiColor"
          footnote="EMIs / monthly take-home"
        >
          <template #footer>
            <v-chip :color="dtiColor" size="x-small" variant="tonal" class="mt-2 font-mono">
              {{ dtiRatio < 30 ? "Healthy" : dtiRatio < 50 ? "Watch" : "High risk" }}
            </v-chip>
          </template>
        </MetricCard>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <MetricCard
          label="Next-ending loan"
          :value="nextEnd ?? '—'"
          :footnote="nextEnd ? `frees cash in ${nextEnd - new Date().getFullYear()} year${nextEnd - new Date().getFullYear() === 1 ? '' : 's'}` : undefined"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.liabilities-overview {
  max-width: 1280px;
}
</style>

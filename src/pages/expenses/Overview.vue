<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { formatINRCompact } from "@/lib/formatters";
import { toMonthly } from "@/lib/cashflow";
import AvgMonthlyBurnField from "@/components/forms/AvgMonthlyBurnField.vue";
import IncomeVsExpenses from "@/components/charts/IncomeVsExpenses.vue";
import ExpenseTrendChart from "@/components/charts/ExpenseTrendChart.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import MetricCard from "@/components/shared/MetricCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";

const household = useHouseholdStore();
const assumptions = useAssumptionsStore();

const recurringMonthly = computed(() =>
  household.data.expenses.recurring.reduce(
    (sum, r) => sum + toMonthly({ amount: r.amount, period: r.frequency }),
    0,
  ),
);
const totalMonthlyBurn = computed(() => household.data.expenses.avgMonthly + recurringMonthly.value);
const annualBurn = computed(() => totalMonthlyBurn.value * 12);
const recurringCount = computed(() => household.data.expenses.recurring.length);
const plannedCount = computed(() => household.data.expenses.plannedFuture.length);

function inflatedAt(amount: number, year: number): number {
  const yrs = Math.max(0, year - new Date().getFullYear());
  return Math.round(amount * Math.pow(1 + assumptions.values.inflation, yrs));
}
</script>

<template>
  <v-container fluid class="py-6 expenses-overview">
    <LeafPageHeader
      eyebrow="Expenses · Overview"
      title="Expenses"
      description="Three buckets: average monthly burn · recurring commitments · planned future. Drill into each child page to manage entries."
    />

    <v-row dense class="mb-4">
      <v-col cols="12" md="6">
        <IncomeVsExpenses :months="12" />
      </v-col>
      <!-- P3 Stage (A29.3) — real YoY expense trend from monthly snapshots. -->
      <v-col cols="12" md="6">
        <ExpenseTrendChart />
      </v-col>
    </v-row>

    <PanelCard
      eyebrow="Bucket 1"
      title="Average monthly household spend"
      icon="mdi-cart-outline"
      icon-color="error"
      class="mb-4"
    >
      <div class="text-caption text-medium-emphasis mb-3">
        Day-to-day burn (groceries · fuel · utilities · eating out · household help · transport).
        Exclude rent, EMIs, insurance, and SIPs.
      </div>
      <AvgMonthlyBurnField />
    </PanelCard>

    <v-row dense>
      <v-col cols="12" sm="6" md="3">
        <MetricCard
          label="Total monthly burn"
          :value="formatINRCompact(totalMonthlyBurn)"
          unit="/mo"
          footnote="incl. recurring"
          min-height="160px"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <MetricCard
          label="Annual burn"
          :value="formatINRCompact(annualBurn)"
          unit="/yr"
          min-height="160px"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <MetricCard
          label="Recurring lines"
          :value="recurringCount"
          :footnote="`${formatINRCompact(recurringMonthly)}/mo`"
          min-height="160px"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <MetricCard
          label="Planned future"
          :value="plannedCount"
          footnote="life-event goals"
          min-height="160px"
        />
      </v-col>
    </v-row>

    <div class="section-eyebrow">Planned future timeline</div>
    <PanelCard
      :empty="!household.data.expenses.plannedFuture.length"
      empty-icon="mdi-calendar-arrow-right"
      empty-title="No planned future expenses"
      empty-copy="Add weddings, college, big trips, or a sabbatical year so they roll into your FIRE corpus target."
      empty-cta-label="Add a planned expense"
      empty-cta-route="/expenses/planned"
    >
      <EntityRow
        v-for="p in household.data.expenses.plannedFuture"
        :key="p.id"
        :title="p.label"
        :value="formatINRCompact(p.todayAmount)"
        accent="primary"
      >
        <template #leading>
          <v-icon icon="mdi-calendar-star-outline" color="primary" />
        </template>
        <template #meta>
          {{ p.isMultiYear ? `${p.durationYears} yrs from ${p.targetYear}` : `One-time in ${p.targetYear}` }}
          · inflates to ~{{ formatINRCompact(inflatedAt(p.todayAmount, p.targetYear)) }}
        </template>
      </EntityRow>
    </PanelCard>
  </v-container>
</template>

<style scoped>
.expenses-overview {
  max-width: 1280px;
}
</style>

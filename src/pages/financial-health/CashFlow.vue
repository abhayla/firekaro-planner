<script setup lang="ts">
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import CashflowWaterfall from "@/components/charts/CashflowWaterfall.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import MetricCard from "@/components/shared/MetricCard.vue";

const fire = useFireDerive();

const annualIncome = computed(() => fire.annualIncome.value.total);
const annualExpenses = computed(() => fire.annualExpensesToday.value);
const annualTax = computed(() => fire.annualTax.value);
const annualSurplus = computed(() =>
  Math.max(0, annualIncome.value - annualExpenses.value - annualTax.value),
);
const monthlyIncome = computed(() => Math.round(annualIncome.value / 12));
const monthlyExpenses = computed(() => Math.round(annualExpenses.value / 12));
const monthlyTax = computed(() => Math.round(annualTax.value / 12));
const monthlySurplus = computed(() => Math.round(annualSurplus.value / 12));

const savingsRate = computed(() =>
  annualIncome.value > 0 ? Math.round((annualSurplus.value / annualIncome.value) * 100) : 0,
);
</script>

<template>
  <v-container fluid class="py-6 cashflow-page">
    <LeafPageHeader
      eyebrow="Financial Health · Cash Flow"
      title="Cash Flow"
      description="Annual income vs tax vs expenses vs surplus. The waterfall below shows exactly where each rupee lands."
    />

    <v-row dense class="mb-2">
      <v-col cols="12">
        <CashflowWaterfall />
      </v-col>
    </v-row>

    <v-row dense>
      <v-col cols="12" md="3">
        <MetricCard label="Annual income" :value="formatINRCompact(annualIncome)" value-color="success" min-height="124px" :footnote="`${formatINRCompact(monthlyIncome)} /mo`" />
      </v-col>
      <v-col cols="12" md="3">
        <MetricCard label="Annual tax" :value="formatINRCompact(annualTax)" value-color="warning" min-height="124px" :footnote="`${formatINRCompact(monthlyTax)} /mo`" />
      </v-col>
      <v-col cols="12" md="3">
        <MetricCard label="Annual expenses" :value="formatINRCompact(annualExpenses)" value-color="error" min-height="124px" :footnote="`${formatINRCompact(monthlyExpenses)} /mo`" />
      </v-col>
      <v-col cols="12" md="3">
        <MetricCard label="Annual surplus" :value="formatINRCompact(annualSurplus)" value-color="primary" min-height="124px">
          <template #footer>
            <div class="d-flex align-center justify-space-between mt-1">
              <span class="text-caption text-medium-emphasis font-mono">{{ formatINRCompact(monthlySurplus) }} /mo</span>
              <v-chip size="x-small" color="primary" variant="tonal" class="font-mono">{{ savingsRate }}% rate</v-chip>
            </div>
          </template>
        </MetricCard>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.cashflow-page {
  max-width: 1280px;
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import CashflowWaterfall from "@/components/charts/CashflowWaterfall.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import MetricCard from "@/components/shared/MetricCard.vue";
import MemberLensBadge from "@/components/shared/MemberLensBadge.vue";

const fire = useFireDerive();

// #81 Phase 3: cash flow = income − tax − expenses, member-LENSED via the SAME-SCOPE resolver.
// When an adult is selected all three are THAT member's own slice (income/tax + ring-1 + their
// split of ring-2 expenses — supersedes the #23 household-only workaround, which existed only
// because expenses had no owner before Phase 1). On the default lens all three are the household
// figures, so the page is byte-identical. Same-scope guarantees no spurious member÷household surplus.
const fh = computed(() => fire.memberFinancials.value);
const annualIncome = computed(() => fh.value.annualIncome);
const annualExpenses = computed(() => fh.value.annualExpenses);
const annualTax = computed(() => fh.value.annualTax);
const annualSurplus = computed(() => fh.value.surplus);
const monthlyIncome = computed(() => Math.round(annualIncome.value / 12));
const monthlyExpenses = computed(() => Math.round(annualExpenses.value / 12));
const monthlyTax = computed(() => Math.round(annualTax.value / 12));
const monthlySurplus = computed(() => fh.value.monthlySurplus);

// Savings rate reads the CANONICAL (take-home-denominator) figure from the resolver, so it matches
// the FireHero headline + Health Score + Reports app-wide — not a screen-local gross-income variant
// (FinTech #81 Phase-3 MED-1).
const savingsRate = computed(() => fh.value.savingsRatePercent);
</script>

<template>
  <v-container fluid class="py-6 cashflow-page">
    <LeafPageHeader
      eyebrow="Financial Health · Cash Flow"
      title="Cash Flow"
      description="Annual income vs tax vs expenses vs surplus. The waterfall below shows exactly where each rupee lands."
    >
      <template #actions>
        <MemberLensBadge />
      </template>
    </LeafPageHeader>

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

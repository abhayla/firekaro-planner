<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact, formatPercent } from "@/lib/formatters";
import PanelCard from "@/components/shared/PanelCard.vue";

const household = useHouseholdStore();
const fire = useFireDerive();

const today = computed(() => new Date().toLocaleDateString("en-IN", { dateStyle: "long" }));

function printReport() {
  window.print();
}
</script>

<template>
  <v-container fluid class="py-6 report-page">
    <div class="d-flex justify-space-between align-start mb-6 no-print-flex">
      <div>
        <div class="page-eyebrow">Financial Health · Report</div>
        <h1 class="page-title-xl font-display">Health Report</h1>
        <div class="text-caption text-medium-emphasis font-mono mt-1">{{ today }}</div>
      </div>
      <v-btn variant="outlined" prepend-icon="mdi-printer" @click="printReport">Print</v-btn>
    </div>

    <PanelCard title="Household" icon="mdi-account-group" icon-color="primary" class="mb-4">
      {{ household.data.name || "Your household" }} — {{ household.members.length }} members ({{ household.earners.length }} earners)
    </PanelCard>

    <PanelCard title="FIRE picture" icon="mdi-fire" icon-color="warning" class="mb-4">
      <div class="report-row"><span>FIRE number</span><span class="text-currency">{{ formatINRCompact(fire.fireNumber.value) }}</span></div>
      <div class="report-row"><span>Current corpus</span><span class="text-currency">{{ formatINRCompact(fire.totalCorpus.value) }}</span></div>
      <div class="report-row"><span>Progress</span><span class="font-mono">{{ fire.progressPercent.value }}%</span></div>
      <div class="report-row"><span>Years to FIRE</span><span class="font-mono">{{ Number.isFinite(fire.yearsToRegular.value) ? fire.yearsToRegular.value.toFixed(1) : "—" }}</span></div>
    </PanelCard>

    <PanelCard title="Income &amp; Expenses" icon="mdi-swap-vertical" icon-color="success" class="mb-4">
      <div class="report-row"><span>Annual income (taxable)</span><span class="text-currency">{{ formatINRCompact(fire.annualIncome.value.salaryIncome + fire.annualIncome.value.businessShare + fire.annualIncome.value.otherTaxable) }}</span></div>
      <div class="report-row"><span>Annual tax</span><span><span class="text-currency">{{ formatINRCompact(fire.annualTax.value) }}</span> <span class="font-mono text-medium-emphasis">({{ formatPercent(fire.fyTax.value.effectiveRate, 1) }})</span></span></div>
      <div class="report-row"><span>Annual expenses</span><span class="text-currency">{{ formatINRCompact(fire.annualExpensesToday.value) }}</span></div>
      <div class="report-row"><span>Savings rate</span><span class="font-mono">{{ Math.round(fire.savingsRate.value) }}%</span></div>
    </PanelCard>

    <PanelCard title="Investments &amp; Liabilities" icon="mdi-scale-balance" icon-color="info" class="mb-4">
      <div class="report-row"><span>Total corpus</span><span class="text-currency">{{ formatINRCompact(fire.totalCorpus.value) }}</span></div>
      <div class="report-row"><span>Total liabilities</span><span class="text-currency">{{ formatINRCompact(fire.totalLiabilitiesValue.value) }}</span></div>
      <div class="report-row"><span>Net worth</span><span class="text-currency text-primary font-weight-bold">{{ formatINRCompact(fire.totalCorpus.value - fire.totalLiabilitiesValue.value) }}</span></div>
    </PanelCard>

    <v-alert type="info" variant="tonal" density="compact" class="mt-4 no-print">
      Simplified one-page summary. No PDF export — use browser print (Ctrl+P / Cmd+P) for a paper copy.
    </v-alert>
  </v-container>
</template>

<style scoped>
.report-page {
  max-width: 960px;
}
.page-eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-weight: 700;
  margin-bottom: 6px;
}
.page-title-xl {
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.05;
}
.report-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-weight: var(--weight-medium);
}
</style>

<style>
@media print {
  .v-app-bar, .v-navigation-drawer, .demo-chip, .v-btn, .no-print, .no-print-flex .v-btn {
    display: none !important;
  }
}
</style>

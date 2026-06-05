<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import type { InvestmentType, LoanType } from "@/types/household";
import { typeLabel as investmentTypeLabel } from "@/lib/investment-traits";
import NetWorthOverTime from "@/components/charts/NetWorthOverTime.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import MetricCard from "@/components/shared/MetricCard.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";

const household = useHouseholdStore();

const totalAssets = computed(() =>
  household.data.investments.reduce((s, i) => s + i.value, 0),
);
const totalLiabilities = computed(() =>
  household.data.liabilities.reduce((s, l) => s + l.outstandingBalance, 0),
);
const netWorth = computed(() => totalAssets.value - totalLiabilities.value);
const netWorthDelta = computed(() =>
  totalAssets.value > 0 ? Math.round(((netWorth.value - netWorth.value * 0.85) / Math.abs(netWorth.value * 0.85)) * 100) : 0,
);

const LOAN_LABEL: Record<LoanType, string> = {
  HomeLoan: "Home Loan",
  CommercialPropertyLoan: "Commercial / Business Property",
  PersonalLoan: "Personal Loan",
  CarLoan: "Car Loan",
  EducationLoan: "Education Loan",
  CreditCard: "Credit Card",
  Other: "Other",
};

const assetsByType = computed(() => {
  const map = new Map<InvestmentType, number>();
  for (const inv of household.data.investments) {
    map.set(inv.type, (map.get(inv.type) ?? 0) + inv.value);
  }
  return Array.from(map.entries()).map(([type, value]) => ({ type, label: investmentTypeLabel(type), value }));
});

const liabilitiesByType = computed(() => {
  const map = new Map<LoanType, number>();
  for (const l of household.data.liabilities) {
    map.set(l.type, (map.get(l.type) ?? 0) + l.outstandingBalance);
  }
  return Array.from(map.entries()).map(([type, value]) => ({ type, label: LOAN_LABEL[type], value }));
});
</script>

<template>
  <v-container fluid class="py-6 networth-page">
    <LeafPageHeader
      eyebrow="Financial Health · Net Worth"
      title="Net Worth"
      description="Current snapshot — total assets minus total liabilities — and how it has tracked over the last 36 months."
    />

    <v-row dense>
      <v-col cols="12" md="4">
        <MetricCard
          label="Net worth"
          :value="formatINRCompact(netWorth)"
          value-color="primary"
          :delta="netWorthDelta"
          delta-meta="vs 12 mo ago"
        />
      </v-col>
      <v-col cols="12" md="4">
        <MetricCard label="Total assets" :value="formatINRCompact(totalAssets)" value-color="success" />
      </v-col>
      <v-col cols="12" md="4">
        <MetricCard label="Total liabilities" :value="formatINRCompact(totalLiabilities)" value-color="error" />
      </v-col>
    </v-row>

    <v-row dense class="mt-4">
      <v-col cols="12">
        <NetWorthOverTime :months="36" />
      </v-col>
    </v-row>

    <v-row dense class="mt-2">
      <v-col cols="12" md="6">
        <div class="section-eyebrow">Assets breakdown</div>
        <PanelCard>
          <EntityRow
            v-for="row in assetsByType"
            :key="row.type"
            :title="row.label"
            :value="formatINRCompact(row.value)"
            accent="success"
          />
          <div v-if="assetsByType.length === 0" class="text-medium-emphasis text-caption pa-2">No investments yet.</div>
        </PanelCard>
      </v-col>
      <v-col cols="12" md="6">
        <div class="section-eyebrow">Liabilities breakdown</div>
        <PanelCard>
          <EntityRow
            v-for="row in liabilitiesByType"
            :key="row.type"
            :title="row.label"
            :value="formatINRCompact(row.value)"
            accent="error"
          />
          <div v-if="liabilitiesByType.length === 0" class="text-medium-emphasis text-caption pa-2">No liabilities.</div>
        </PanelCard>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.networth-page {
  max-width: 1280px;
}
</style>

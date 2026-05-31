<script setup lang="ts">
import { computed, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import InvestmentForm from "@/components/forms/InvestmentForm.vue";
import EmptyState from "@/components/shared/EmptyState.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";

const household = useHouseholdStore();
const showForm = ref(false);
const hasHoldings = computed(
  () => household.data.investments.length > 0 || showForm.value,
);
</script>

<template>
  <v-container fluid class="py-6 leaf-page">
    <LeafPageHeader
      eyebrow="Investments · Holdings"
      title="Holdings"
      description="All investments in one unified form. EPF/VPF is derived from salary; for everything else, enter current value plus a monthly contribution."
    />
    <EmptyState
      v-if="!hasHoldings"
      icon="mdi-chart-line-variant"
      title="No investments yet"
      copy="Add your first investment — equity, mutual funds, PPF, NPS, real estate, gold, FDs, or crypto. Salary-driven EPF/VPF will appear automatically once income is set."
      cta-label="Add your first investment"
      cta-icon="mdi-plus"
      @cta="showForm = true"
    />
    <InvestmentForm v-else />
  </v-container>
</template>

<style scoped>
.leaf-page {
  max-width: 1280px;
}
</style>

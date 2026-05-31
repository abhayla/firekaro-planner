<script setup lang="ts">
import LoanForm from "@/components/forms/LoanForm.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
</script>

<template>
  <v-container fluid class="py-6 leaf-page">
    <LeafPageHeader
      eyebrow="Liabilities · Loans"
      title="Loans"
      description="Outstanding loans — payoff year is derived from outstanding balance, EMI, and interest rate. Carried credit-card balance counts as a loan here (36% default rate)."
    />
    <LoanForm />
  </v-container>
</template>

<style scoped>
.leaf-page {
  max-width: 1280px;
}
</style>

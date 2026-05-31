<script setup lang="ts">
import InsurancePolicyForm from "@/components/forms/InsurancePolicyForm.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
</script>

<template>
  <v-container fluid class="py-6 leaf-page">
    <LeafPageHeader
      eyebrow="Insurance · Policies"
      title="Policies"
      description="Life, Health, Vehicle covers. Adequacy bars show whether each policy meets the advisor benchmarks — Life ≥ 10× income, Health ≥ ₹5L metro floor."
    />
    <InsurancePolicyForm />
  </v-container>
</template>

<style scoped>
.leaf-page {
  max-width: 1280px;
}
</style>

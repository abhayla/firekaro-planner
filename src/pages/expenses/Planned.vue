<script setup lang="ts">
import PlannedFutureForm from "@/components/forms/PlannedFutureForm.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
</script>

<template>
  <v-container fluid class="py-6 leaf-page">
    <LeafPageHeader
      eyebrow="Expenses · Planned"
      title="Planned Future Expenses"
      description="College, weddings, big trips, sabbaticals. Enter amounts in today's ₹ — we inflate to the target year. Items added here also appear on the Life-event Goals roadmap."
    />
    <PlannedFutureForm />
  </v-container>
</template>

<style scoped>
.leaf-page {
  max-width: 1280px;
}
</style>

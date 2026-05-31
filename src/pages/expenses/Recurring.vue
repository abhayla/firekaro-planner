<script setup lang="ts">
import { computed, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import RecurringExpenseForm from "@/components/forms/RecurringExpenseForm.vue";
import EmptyState from "@/components/shared/EmptyState.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";

const household = useHouseholdStore();
const showForm = ref(false);
const hasRecurring = computed(
  () => household.data.expenses.recurring.length > 0 || showForm.value,
);
</script>

<template>
  <v-container fluid class="py-6 leaf-page">
    <LeafPageHeader
      eyebrow="Expenses · Recurring"
      title="Recurring Commitments"
      description="Fixed cash commitments — rent, society maintenance, property tax. End year is optional (use it for rent that ends when you buy a house). Insurance premiums and loan EMIs flow in automatically."
    />
    <EmptyState
      v-if="!hasRecurring"
      icon="mdi-repeat"
      title="No recurring commitments yet"
      copy="Add fixed cash commitments like rent, society maintenance, and property tax. They flow into your monthly burn and FIRE projections."
      cta-label="Add your first commitment"
      cta-icon="mdi-plus"
      @cta="showForm = true"
    />
    <RecurringExpenseForm v-else />
  </v-container>
</template>

<style scoped>
.leaf-page {
  max-width: 1280px;
}
</style>

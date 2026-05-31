<script setup lang="ts">
import { useHouseholdStore } from "@/stores/household";
import EarnerSalaryForm from "@/components/forms/EarnerSalaryForm.vue";
import BusinessForm from "@/components/forms/BusinessForm.vue";
import OtherIncomeForm from "@/components/forms/OtherIncomeForm.vue";

const household = useHouseholdStore();
</script>

<template>
  <div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Capture annual income at the household level. We project forward using the hike % per earner.
    </p>

    <h3 class="text-subtitle-1 font-weight-bold mb-2">Salary</h3>
    <div v-if="household.earners.length === 0" class="text-caption text-medium-emphasis mb-3">
      No earners in Profile. Go back to add one.
    </div>
    <EarnerSalaryForm
      v-for="earner in household.earners"
      :key="earner.id"
      :earner="earner"
    />

    <v-divider class="my-4" />

    <h3 class="text-subtitle-1 font-weight-bold mb-2">Other income sources</h3>
    <OtherIncomeForm />

    <v-divider class="my-4" />

    <h3 class="text-subtitle-1 font-weight-bold mb-2">Business income</h3>
    <BusinessForm />
  </div>
</template>

<script setup lang="ts">
import AvgMonthlyBurnField from "@/components/forms/AvgMonthlyBurnField.vue";
import RecurringExpenseForm from "@/components/forms/RecurringExpenseForm.vue";
import PlannedFutureForm from "@/components/forms/PlannedFutureForm.vue";
</script>

<template>
  <div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Three buckets. Don't double-count — SIPs go to Investments, EMIs to Liabilities, premiums to Insurance.
    </p>

    <h3 class="text-subtitle-1 font-weight-bold mb-2">1. Average monthly household spend</h3>
    <div class="text-caption text-medium-emphasis mb-2">
      Day-to-day burn: groceries, fuel, utilities, eating out, kids' current school fees, household help, transport.
      Exclude rent, EMIs, insurance, and SIPs — captured separately.
    </div>
    <AvgMonthlyBurnField />

    <v-divider class="my-4" />

    <h3 class="text-subtitle-1 font-weight-bold mb-2">2. Recurring commitments</h3>
    <div class="text-caption text-medium-emphasis mb-2">
      Things like rent, society maintenance, property tax. End year is optional (use it for rent that ends when you buy a house).
    </div>
    <RecurringExpenseForm />

    <v-divider class="my-4" />

    <h3 class="text-subtitle-1 font-weight-bold mb-2">3. Planned future expenses</h3>
    <div class="text-caption text-medium-emphasis mb-2">
      College, weddings, big trips. Enter in today's ₹ — we inflate to the target year.
    </div>
    <PlannedFutureForm />
  </div>
</template>

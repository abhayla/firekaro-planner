<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";

const household = useHouseholdStore();

const avgMonthly = computed({
  get: () => household.data.expenses.avgMonthly,
  set: (v: number) => household.setAvgMonthly(Number(v) || 0),
});
</script>

<template>
  <v-row dense>
    <v-col cols="12" md="4">
      <v-text-field v-model.number="avgMonthly" type="number" label="Average / month" prefix="₹" density="comfortable" />
    </v-col>
  </v-row>
</template>

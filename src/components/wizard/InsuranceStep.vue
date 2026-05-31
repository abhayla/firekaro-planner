<script setup lang="ts">
import InsurancePolicyForm from "@/components/forms/InsurancePolicyForm.vue";
</script>

<template>
  <div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Three policy types: Life, Health, Vehicle. Multiple policies per type are allowed
      (e.g., family floater + individual top-up + term + endowment).
    </p>
    <InsurancePolicyForm />
  </div>
</template>

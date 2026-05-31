<script setup lang="ts">
import LoanForm from "@/components/forms/LoanForm.vue";
</script>

<template>
  <div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Outstanding loans — we derive the end year from balance / EMI / interest rate. Interest rate is required (defaults by loan type).
    </p>
    <LoanForm />
  </div>
</template>

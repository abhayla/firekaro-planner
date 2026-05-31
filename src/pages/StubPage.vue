<script setup lang="ts">
defineProps<{ title: string; note?: string }>();
</script>

<template>
  <v-container fluid class="py-6">
    <h1 class="text-h5 font-weight-bold mb-4">{{ title }}</h1>
    <v-alert type="info" variant="tonal" density="comfortable">
      <div class="font-weight-medium mb-1">Placeholder</div>
      <div v-if="note" class="text-body-2">{{ note }}</div>
      <div v-else class="text-body-2">
        This page is a placeholder. The per-section pages are reshaped through Phase 4 of
        <code>docs/goals/build-firekaro-mvp-v5.md</code>.
      </div>
    </v-alert>
  </v-container>
</template>

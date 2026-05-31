<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="page-header mb-6">
    <div class="page-header__row">
      <div class="page-header__text">
        <div class="page-eyebrow">{{ eyebrow }}</div>
        <h1 class="page-title-xl font-display mb-2">{{ title }}</h1>
        <p v-if="description" class="text-body-2 text-medium-emphasis mb-0" style="max-width: 760px">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-header__text {
  min-width: 0;
}
.page-header__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-weight: 700;
  margin-bottom: 6px;
}
.page-title-xl {
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.05;
  color: rgba(var(--v-theme-on-surface), 0.96);
}
@media (max-width: 600px) {
  .page-title-xl { font-size: 1.9rem; }
}
</style>

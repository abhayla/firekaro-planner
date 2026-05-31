<script setup lang="ts">
interface Props {
  title?: string;
  message?: string;
  retryLabel?: string;
}

withDefaults(defineProps<Props>(), {
  title: "Something went wrong",
  message: "Try the action again. If it keeps failing, refresh the page.",
  retryLabel: "Try again",
});

defineEmits<{
  (e: "retry"): void;
}>();
</script>

<template>
  <div class="error-retry">
    <v-icon icon="mdi-alert-circle-outline" size="48" class="error-retry__icon" />
    <div class="error-retry__title">{{ title }}</div>
    <div class="error-retry__message">{{ message }}</div>
    <v-btn
      color="primary"
      variant="outlined"
      class="error-retry__cta"
      prepend-icon="mdi-refresh"
      @click="$emit('retry')"
    >
      {{ retryLabel }}
    </v-btn>
  </div>
</template>

<style scoped>
.error-retry {
  background: var(--color-error-bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-error);
  padding: var(--space-6) var(--space-5);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.error-retry__icon {
  color: var(--color-error);
}

.error-retry__title {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  color: var(--color-error-fg);
}

.error-retry__message {
  font-size: var(--type-sm);
  color: var(--color-error-fg);
  max-width: 360px;
  line-height: var(--leading-normal);
  opacity: 0.85;
}

.error-retry__cta {
  margin-top: var(--space-3);
}
</style>

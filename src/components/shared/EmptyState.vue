<script setup lang="ts">
interface Props {
  icon?: string;
  title?: string;
  copy?: string;
  ctaLabel?: string;
  ctaIcon?: string;
  ctaRoute?: string;
}

withDefaults(defineProps<Props>(), {
  icon: "mdi-inbox-outline",
  title: "Nothing here yet",
  copy: "",
  ctaLabel: "",
  ctaIcon: "mdi-plus",
  ctaRoute: "",
});

defineEmits<{
  (e: "cta"): void;
}>();
</script>

<template>
  <div class="empty-state">
    <v-icon :icon="icon" size="64" class="empty-state__icon" />
    <div class="empty-state__title">{{ title }}</div>
    <div v-if="copy" class="empty-state__copy">{{ copy }}</div>
    <v-btn
      v-if="ctaLabel && ctaRoute"
      :to="ctaRoute"
      color="primary"
      variant="flat"
      class="empty-state__cta"
      :prepend-icon="ctaIcon"
    >
      {{ ctaLabel }}
    </v-btn>
    <v-btn
      v-else-if="ctaLabel"
      color="primary"
      variant="flat"
      class="empty-state__cta"
      :prepend-icon="ctaIcon"
      @click="$emit('cta')"
    >
      {{ ctaLabel }}
    </v-btn>
  </div>
</template>

<style scoped>
.empty-state {
  background: var(--surface-muted);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-subtle);
  padding: var(--space-7) var(--space-5);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.empty-state__icon {
  color: var(--text-muted);
  margin-bottom: var(--space-2);
}

.empty-state__title {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.empty-state__copy {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  max-width: 320px;
  line-height: var(--leading-normal);
}

.empty-state__cta {
  margin-top: var(--space-3);
}
</style>

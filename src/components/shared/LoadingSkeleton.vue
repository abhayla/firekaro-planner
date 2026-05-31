<script setup lang="ts">
interface Props {
  variant?: "card" | "list" | "chart" | "table" | "text" | "hero";
  rows?: number;
  height?: string;
}

withDefaults(defineProps<Props>(), {
  variant: "card",
  rows: 3,
  height: "120px",
});
</script>

<template>
  <div class="skeleton-wrapper" aria-busy="true" aria-label="Loading content">
    <div v-if="variant === 'card'" class="skeleton skeleton-card" :style="{ height }" />

    <template v-else-if="variant === 'list'">
      <div v-for="i in rows" :key="i" class="skeleton skeleton-row" />
    </template>

    <div v-else-if="variant === 'chart'" class="skeleton skeleton-chart" />

    <template v-else-if="variant === 'table'">
      <div class="skeleton skeleton-header" />
      <div v-for="i in rows" :key="i" class="skeleton skeleton-row" />
    </template>

    <template v-else-if="variant === 'hero'">
      <div class="skeleton skeleton-hero-title" />
      <div class="skeleton skeleton-hero-subtitle" />
      <div class="skeleton skeleton-hero-block" :style="{ height }" />
    </template>

    <template v-else>
      <div v-for="i in rows" :key="i" class="skeleton skeleton-text" />
    </template>
  </div>
</template>

<style scoped>
.skeleton-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-gray-100) 0%,
    var(--color-gray-200) 50%,
    var(--color-gray-100) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
}

.skeleton-card {
  width: 100%;
}

.skeleton-row {
  height: 48px;
}

.skeleton-header {
  height: 32px;
  margin-bottom: var(--space-3);
}

.skeleton-text {
  height: 14px;
  border-radius: var(--radius-xs);
}

.skeleton-text:nth-child(odd) {
  width: 92%;
}

.skeleton-text:nth-child(even) {
  width: 78%;
}

.skeleton-chart {
  height: 240px;
}

.skeleton-hero-title {
  height: 40px;
  width: 60%;
  border-radius: var(--radius-sm);
}

.skeleton-hero-subtitle {
  height: 20px;
  width: 40%;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-3);
}

.skeleton-hero-block {
  width: 100%;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: var(--color-gray-100);
  }
}
</style>

<script setup lang="ts">
/**
 * Canonical list row for entity lists (holdings, policies, loans, …) — standard §5b.
 * leading icon/chip + bold title + meta line + prominent mono value + trailing
 * chips/actions, with a divider between rows and hover. Replaces cramped
 * single-line v-list-item titles.
 */
const props = defineProps<{
  title: string;
  /** Pre-formatted primary value (mono, right-aligned). */
  value?: string;
  /** Left accent stripe colour-coding the row by category. Theme name or raw CSS color. */
  accent?: string;
}>();

const accentCss = props.accent
  ? /[#(]/.test(props.accent)
    ? props.accent
    : `rgb(var(--v-theme-${props.accent}))`
  : undefined;
</script>

<template>
  <div class="entity-row">
    <span v-if="accentCss" class="entity-row__accent" :style="{ background: accentCss }" />
    <div v-if="$slots.leading" class="entity-row__leading"><slot name="leading" /></div>
    <div class="entity-row__main">
      <div class="entity-row__title">{{ title }}</div>
      <div v-if="$slots.meta" class="entity-row__meta"><slot name="meta" /></div>
    </div>
    <div v-if="value" class="entity-row__value text-currency">{{ value }}</div>
    <div v-if="$slots.trailing" class="entity-row__trailing"><slot name="trailing" /></div>
  </div>
</template>

<style scoped>
.entity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  transition: background 120ms ease;
}
.entity-row:last-child {
  border-bottom: none;
}
.entity-row:hover {
  background: rgba(var(--v-theme-primary), 0.03);
}
.entity-row__accent {
  align-self: stretch;
  width: 3px;
  border-radius: 3px;
  flex: 0 0 auto;
}
.entity-row__leading {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}
.entity-row__main {
  flex: 1 1 auto;
  min-width: 0;
}
.entity-row__title {
  font-weight: 600;
  font-size: 0.9rem;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.entity-row__meta {
  font-size: 0.76rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-top: 2px;
}
.entity-row__value {
  font-weight: 700;
  font-size: 0.95rem;
  flex: 0 0 auto;
  white-space: nowrap;
}
.entity-row__trailing {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
@media (max-width: 600px) {
  .entity-row {
    flex-wrap: wrap;
  }
  .entity-row__value {
    margin-left: auto;
  }
}
</style>

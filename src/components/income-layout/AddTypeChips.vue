<script setup lang="ts">
export interface AddTypeChip {
  value: string;
  label: string;
  icon: string;
  color: string; // theme color name
}

withDefaults(
  defineProps<{
    chips: AddTypeChip[];
    heading?: string;
    /** "card" = dashed container with heading; "bare" = centered chips only (empty state). */
    variant?: "card" | "bare";
  }>(),
  { variant: "card" },
);

defineEmits<{ (e: "select", value: string): void }>();
</script>

<template>
  <div :class="variant === 'card' ? 'chips-card' : 'chips-bare'">
    <div v-if="variant === 'card' && heading" class="chips-card__head">
      <v-icon icon="mdi-plus-circle-outline" />
      <span>{{ heading }}</span>
    </div>
    <div :class="variant === 'card' ? 'chips-card__row' : 'chips-bare__row'">
      <button
        v-for="c in chips"
        :key="c.value"
        type="button"
        class="type-chip"
        :class="{ 'type-chip--lg': variant === 'bare' }"
        :style="{
          '--chip-color': `rgb(var(--v-theme-${c.color}))`,
          '--chip-bg': `rgba(var(--v-theme-${c.color}), 0.08)`,
          '--chip-bg-hover': `rgba(var(--v-theme-${c.color}), 0.16)`,
        }"
        @click="$emit('select', c.value)"
      >
        <v-icon :icon="c.icon" size="small" />
        <span class="type-chip__label">{{ c.label }}</span>
        <v-icon icon="mdi-plus" size="x-small" class="type-chip__plus" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chips-card {
  margin-top: 12px;
  padding: 16px 18px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 14px;
}
.chips-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 12px;
}
.chips-card__head :deep(.v-icon) { color: rgba(var(--v-theme-on-surface), 0.6) !important; }
.chips-card__row { display: flex; flex-wrap: wrap; gap: 10px; }
.chips-bare__row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }

.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: 1.5px solid transparent;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-color);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease;
}
.type-chip--lg { font-size: 0.95rem; padding: 12px 20px; }
.type-chip :deep(.v-icon) { color: var(--chip-color) !important; }
.type-chip:hover { background: var(--chip-bg-hover); border-color: var(--chip-color); transform: translateY(-1px); }
.type-chip__plus {
  margin-left: 4px;
  background: var(--chip-color);
  border-radius: 50%;
  width: 18px; height: 18px;
  display: inline-flex; align-items: center; justify-content: center;
}
.type-chip__plus :deep(.v-icon) { color: white !important; }
</style>

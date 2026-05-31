<script setup lang="ts">
import type { SetupMode } from "@/types/household";

const setupMode = defineModel<SetupMode>("setupMode", { required: true });
const householdName = defineModel<string>("householdName", { default: "" });

// variant "select" (default) preserves the original dropdown used by the wizard.
// variant "cards" renders selectable icon-cards — used on the Profile screen.
withDefaults(defineProps<{ variant?: "select" | "cards" }>(), { variant: "select" });

const MODES: SetupMode[] = ["Solo", "Couple", "Couple+Children", "Custom"];

interface ModeMeta {
  icon: string;
  label: string;
  hint: string;
}
const MODE_META: Record<SetupMode, ModeMeta> = {
  Solo: { icon: "mdi-account", label: "Solo", hint: "Just me" },
  Couple: { icon: "mdi-account-multiple", label: "Couple", hint: "Two earners" },
  "Couple+Children": { icon: "mdi-account-group", label: "Couple + kids", hint: "With dependents" },
  Custom: { icon: "mdi-tune-variant", label: "Custom", hint: "Mixed household" },
};
</script>

<template>
  <div>
    <!-- Cards variant — selectable segmented icon-cards -->
    <template v-if="variant === 'cards'">
      <div class="mode-grid mb-4">
        <button
          v-for="mode in MODES"
          :key="mode"
          type="button"
          class="mode-card"
          :class="{ 'mode-card--active': setupMode === mode }"
          :aria-pressed="setupMode === mode"
          @click="setupMode = mode"
        >
          <v-icon :icon="MODE_META[mode].icon" size="24" class="mode-card__icon" />
          <span class="mode-card__label">{{ MODE_META[mode].label }}</span>
          <span class="mode-card__hint">{{ MODE_META[mode].hint }}</span>
          <v-icon v-if="setupMode === mode" icon="mdi-check-circle" size="18" class="mode-card__check" />
        </button>
      </div>
      <v-text-field
        v-model="householdName"
        label="Household name (optional)"
        placeholder="e.g., The Sharma Family"
        prepend-inner-icon="mdi-home-account"
        variant="outlined"
        density="comfortable"
        hide-details
      />
    </template>

    <!-- Select variant — original dropdown (wizard) -->
    <v-row v-else>
      <v-col cols="12" md="6">
        <v-select
          v-model="setupMode"
          label="Setup mode"
          :items="MODES"
          prepend-inner-icon="mdi-account-group"
          density="comfortable"
        />
      </v-col>
      <v-col cols="12" md="6">
        <v-text-field
          v-model="householdName"
          label="Household name (optional)"
          placeholder="e.g., The Sharma Family"
          prepend-inner-icon="mdi-home-account"
          density="comfortable"
        />
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
.mode-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 760px) {
  .mode-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.mode-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 14px 16px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  text-align: left;
  transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;
}
.mode-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
  transform: translateY(-2px);
}
.mode-card--active {
  border-color: rgb(var(--v-theme-primary));
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.1), rgba(var(--v-theme-primary), 0.02) 70%);
}
.mode-card__icon { color: rgba(var(--v-theme-on-surface), 0.55); margin-bottom: 4px; }
.mode-card--active .mode-card__icon { color: rgb(var(--v-theme-primary)); }
.mode-card__label {
  font-weight: 700;
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.mode-card__hint {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.mode-card__check {
  position: absolute;
  top: 10px;
  right: 10px;
  color: rgb(var(--v-theme-primary));
}
@media (prefers-reduced-motion: reduce) {
  .mode-card { transition: none; }
  .mode-card:hover { transform: none; }
}
</style>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    icon: string;
    color: string; // theme color name
    eyebrow: string;
    title: string;
    submitLabel: string;
    submitDisabled?: boolean;
    /** Show a destructive Delete action on the left (edit mode). */
    showDelete?: boolean;
    maxWidth?: number | string;
  }>(),
  { submitDisabled: false, showDelete: false, maxWidth: 760 },
);

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "submit"): void;
  (e: "delete"): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});
</script>

<template>
  <v-dialog v-model="open" :max-width="maxWidth" persistent>
    <v-card class="entry-dialog">
      <div
        class="entry-dialog__header"
        :style="{
          '--dialog-accent': `rgb(var(--v-theme-${color}))`,
          '--dialog-accent-2': `rgba(var(--v-theme-${color}), 0.65)`,
        }"
      >
        <div class="entry-dialog__icon"><v-icon :icon="icon" size="28" /></div>
        <div class="entry-dialog__title-block">
          <div class="entry-dialog__eyebrow">{{ eyebrow }}</div>
          <div class="entry-dialog__title">{{ title }}</div>
        </div>
        <button type="button" class="entry-dialog__close" aria-label="Close" @click="open = false">
          <v-icon icon="mdi-close" />
        </button>
      </div>

      <v-card-text class="entry-dialog__body" style="max-height: 70vh; overflow-y: auto">
        <slot />
        <div v-if="$slots.hint" class="entry-dialog__hint">
          <v-icon icon="mdi-lightbulb-outline" size="x-small" />
          <slot name="hint" />
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <v-btn v-if="showDelete" variant="text" color="error" @click="$emit('delete')">
          <v-icon icon="mdi-delete-outline" class="mr-1" />Delete
        </v-btn>
        <v-spacer />
        <v-btn variant="outlined" @click="open = false">Cancel</v-btn>
        <v-btn :color="color" variant="flat" :disabled="submitDisabled" @click="$emit('submit')">
          <v-icon icon="mdi-content-save" class="mr-1" />{{ submitLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.entry-dialog { border-radius: 18px; overflow: hidden; }
.entry-dialog__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 22px;
  background: linear-gradient(135deg, var(--dialog-accent), var(--dialog-accent-2));
  color: white;
}
.entry-dialog__icon {
  width: 48px; height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.22);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.entry-dialog__icon :deep(.v-icon) { color: white !important; }
.entry-dialog__title-block { flex: 1 1 auto; min-width: 0; }
.entry-dialog__eyebrow { font-size: 0.7rem; font-weight: 800; letter-spacing: 0.2em; opacity: 0.85; }
.entry-dialog__title { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; margin-top: 2px; }
.entry-dialog__close {
  background: rgba(255, 255, 255, 0.18);
  border: none;
  border-radius: 50%;
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 150ms ease;
}
.entry-dialog__close:hover { background: rgba(255, 255, 255, 0.32); }
.entry-dialog__close :deep(.v-icon) { color: white !important; }
.entry-dialog__body { padding: 20px 22px !important; }
.entry-dialog__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 10px 12px;
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.65);
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-radius: 8px;
}
.entry-dialog__hint :deep(kbd) {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.7rem;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-bottom-width: 2px;
  padding: 1px 6px;
  border-radius: 4px;
  margin: 0 2px;
}
</style>

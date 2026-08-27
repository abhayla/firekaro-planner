<script setup lang="ts">
/**
 * T-378 (QN-1) — the money input of the express path. The user types in LAKH (the unit Indians
 * actually speak in) and sees the exact rupee figure underneath, so "2.8" can never be mistaken
 * for ₹2.8 and "aggressive rounding" (video lesson E1) stays comfortable.
 *
 * `modelValue` is always RUPEES — the lakh conversion never leaks past this component.
 */
import { computed } from "vue";
import { formatINRCompact } from "@/lib/formatters";

const LAKH = 100_000;

const props = withDefaults(
  defineProps<{
    modelValue: number;
    label?: string;
    testid?: string;
    autofocus?: boolean;
  }>(),
  { label: "", testid: "quick-lakh-input", autofocus: false },
);

const emit = defineEmits<{ (e: "update:modelValue", value: number): void }>();

const lakhValue = computed<number | null>(() =>
  props.modelValue > 0 ? Math.round((props.modelValue / LAKH) * 100) / 100 : null,
);

function onInput(raw: unknown) {
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  emit("update:modelValue", Number.isFinite(parsed) && parsed > 0 ? parsed * LAKH : 0);
}
</script>

<template>
  <div class="lakh-input">
    <v-text-field
      :model-value="lakhValue"
      :label="label || undefined"
      :autofocus="autofocus"
      type="number"
      step="0.5"
      min="0"
      suffix="lakh"
      variant="outlined"
      density="comfortable"
      hide-details
      :data-testid="testid"
      @update:model-value="onInput"
    />
    <div class="lakh-input__preview text-caption" :data-testid="`${testid}-preview`">
      {{ modelValue > 0 ? formatINRCompact(modelValue) : "—" }}
    </div>
  </div>
</template>

<style scoped>
.lakh-input__preview {
  margin-top: 4px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
</style>

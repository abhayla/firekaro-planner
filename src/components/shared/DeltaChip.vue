<script setup lang="ts">
import { computed } from "vue";

interface Props {
  value: number;
  format?: "currency" | "percent" | "raw";
  size?: "small" | "x-small";
  invertColors?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  format: "raw",
  size: "x-small",
  invertColors: false,
});

const isPositive = computed(() => props.value > 0);
const isNeutral = computed(() => props.value === 0);

const icon = computed(() => {
  if (isNeutral.value) return "mdi-minus";
  return isPositive.value ? "mdi-trending-up" : "mdi-trending-down";
});

// Color: by default positive=green / negative=red. For metrics like
// debt/expenses where lower is better, pass invertColors=true.
const color = computed(() => {
  if (isNeutral.value) return "grey";
  const goodIsUp = !props.invertColors;
  return isPositive.value === goodIsUp ? "success" : "error";
});

const formattedValue = computed(() => {
  const absV = Math.abs(props.value);
  let str: string;
  if (props.format === "currency") {
    str = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(absV);
  } else if (props.format === "percent") {
    str = `${absV.toFixed(1)}%`;
  } else {
    str = absV.toLocaleString("en-IN");
  }
  if (isNeutral.value) return str;
  return `${isPositive.value ? "+" : "−"}${str}`;
});
</script>

<template>
  <v-chip :size="size" variant="tonal" :color="color" class="delta-chip">
    <v-icon :icon="icon" size="14" class="delta-chip__icon" />
    <span class="delta-chip__value">{{ formattedValue }}</span>
  </v-chip>
</template>

<style scoped>
.delta-chip {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: var(--weight-medium);
}

.delta-chip :deep(.v-chip__content) {
  display: flex;
  align-items: center;
  gap: 2px;
}

.delta-chip__icon {
  flex-shrink: 0;
}

.delta-chip__value {
  letter-spacing: -0.01em;
}
</style>

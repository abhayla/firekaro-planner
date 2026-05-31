<script setup lang="ts">
import { computed } from "vue";

interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  fill?: boolean;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  width: 80,
  height: 28,
  color: "var(--color-primary)",
  strokeWidth: 1.5,
  fill: false,
  ariaLabel: "",
});

const points = computed(() => {
  if (!props.data.length) return [] as Array<[number, number]>;
  const min = Math.min(...props.data);
  const max = Math.max(...props.data);
  const range = max - min || 1;
  const stepX = props.data.length > 1 ? props.width / (props.data.length - 1) : 0;
  const padY = 2;
  const usableH = props.height - padY * 2;
  return props.data.map((v, i) => {
    const x = i * stepX;
    const y = props.height - padY - ((v - min) / range) * usableH;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as [number, number];
  });
});

const linePath = computed(() => {
  const pts = points.value;
  if (!pts.length) return "";
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x},${y}`).join(" ");
});

const fillPath = computed(() => {
  const pts = points.value;
  if (!pts.length) return "";
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x},${y}`).join(" ");
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last[0]},${props.height} L ${first[0]},${props.height} Z`;
});
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="sparkline"
    role="img"
    :aria-label="ariaLabel || 'trend sparkline'"
  >
    <path v-if="fill" :d="fillPath" :fill="color" opacity="0.15" />
    <path
      :d="linePath"
      fill="none"
      :stroke="color"
      :stroke-width="strokeWidth"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped>
.sparkline {
  display: inline-block;
  vertical-align: middle;
}
</style>

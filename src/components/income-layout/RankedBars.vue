<script setup lang="ts">
export interface RankedBar {
  key: string;
  label: string;
  amount: string; // pre-formatted
  share: number; // 0-100
  color: string; // theme color name
  icon?: string;
}

defineProps<{ bars: RankedBar[] }>();
</script>

<template>
  <div class="comp-bars">
    <div v-for="b in bars" :key="b.key" class="comp-bar">
      <div class="comp-bar__head">
        <v-icon v-if="b.icon" :icon="b.icon" :color="b.color" size="small" />
        <span class="comp-bar__label">{{ b.label }}</span>
        <span class="comp-bar__amt">{{ b.amount }}</span>
        <span class="comp-bar__share">{{ b.share.toFixed(0) }}%</span>
      </div>
      <div class="comp-bar__track">
        <div class="comp-bar__fill" :style="{ width: b.share + '%', background: `rgb(var(--v-theme-${b.color}))` }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.comp-bar { margin-bottom: 14px; }
.comp-bar:last-child { margin-bottom: 0; }
.comp-bar__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  font-size: 0.85rem;
}
.comp-bar__label { font-weight: 600; color: rgba(var(--v-theme-on-surface), 0.85); }
.comp-bar__amt {
  margin-left: auto;
  font-family: "JetBrains Mono", monospace;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-variant-numeric: tabular-nums;
}
.comp-bar__share {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
  min-width: 36px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.comp-bar__track {
  height: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 999px;
  overflow: hidden;
}
.comp-bar__fill { height: 100%; border-radius: 999px; transition: width 400ms ease; }
</style>

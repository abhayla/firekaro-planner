<script setup lang="ts">
export interface CashflowMonth {
  label: string;
  total: number;
  /** Stacked segments, ordered bottom→top. */
  segments: { key: string; value: number; color: string }[];
}

defineProps<{
  months: CashflowMonth[];
  max: number;
}>();
</script>

<template>
  <div class="cashflow-chart">
    <div v-for="(m, i) in months" :key="i" class="cashflow-col">
      <div class="cashflow-bar-wrap">
        <div class="cashflow-bar" :style="{ height: (m.total / max) * 100 + '%' }">
          <div
            v-for="seg in m.segments"
            :key="seg.key"
            class="cashflow-seg"
            :style="{ flex: seg.value, background: `rgb(var(--v-theme-${seg.color}))` }"
          />
        </div>
      </div>
      <div class="cashflow-mlabel">{{ m.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.cashflow-chart {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 6px;
  align-items: end;
  height: 180px;
}
.cashflow-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;
}
.cashflow-bar-wrap {
  width: 100%;
  flex: 1 1 auto;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.cashflow-bar {
  width: 70%;
  max-width: 36px;
  min-height: 2px;
  display: flex;
  flex-direction: column-reverse;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.03);
}
.cashflow-seg { width: 100%; min-height: 0; }
.cashflow-seg + .cashflow-seg { border-top: 1px solid rgb(var(--v-theme-surface)); }
.cashflow-mlabel {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 8px;
}
</style>

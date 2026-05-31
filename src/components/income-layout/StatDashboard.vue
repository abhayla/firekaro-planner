<script setup lang="ts">
import type { DonutSegment } from "@/lib/donut";

export interface KpiTile {
  eyebrow: string;
  /** Plain mono value (used when `icon` is absent). */
  value?: string;
  /** Icon + text value (e.g. "Largest: <icon> Rental"). */
  icon?: string;
  iconColor?: string;
  text?: string;
  meta?: string;
  /** Highlights this tile as the primary metric (gradient + accent border). */
  accent?: boolean;
}

defineProps<{
  kpis: KpiTile[];
  donutSegments: DonutSegment[];
  donutEyebrow: string;
  donutCenterEyebrow: string;
  donutCenterValue: string;
  /** Eyebrow above the right-hand viz slot. */
  vizEyebrow: string;
}>();
</script>

<template>
  <v-card variant="outlined" class="dash-card mb-3">
    <v-card-text class="dash-body">
      <!-- KPI strip -->
      <div class="dash-kpi">
        <div
          v-for="(k, i) in kpis"
          :key="i"
          class="dash-kpi__tile"
          :class="{ 'dash-kpi__tile--accent': k.accent }"
        >
          <div class="kpi-eyebrow">{{ k.eyebrow }}</div>
          <div v-if="k.icon" class="kpi-value-row">
            <v-icon :icon="k.icon" :color="k.iconColor" size="small" />
            <span class="kpi-trunc">{{ k.text }}</span>
          </div>
          <div v-else class="kpi-value">{{ k.value }}</div>
          <div v-if="k.meta" class="kpi-meta">{{ k.meta }}</div>
        </div>
      </div>

      <!-- donut (left) + viz slot (right) -->
      <div class="dash-viz">
        <div class="dash-viz__left">
          <div class="dash-section-eyebrow">{{ donutEyebrow }}</div>
          <div class="dash-donut">
            <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="donutEyebrow">
              <g v-if="donutSegments.length">
                <path
                  v-for="seg in donutSegments"
                  :key="seg.key"
                  :d="seg.path"
                  :fill="`rgb(var(--v-theme-${seg.color}))`"
                  stroke="rgb(var(--v-theme-surface))"
                  stroke-width="2"
                />
              </g>
              <text x="100" y="92" text-anchor="middle" class="donut-eyebrow">{{ donutCenterEyebrow }}</text>
              <text x="100" y="115" text-anchor="middle" class="donut-total">{{ donutCenterValue }}</text>
            </svg>
          </div>
        </div>
        <div class="dash-viz__right">
          <div class="dash-section-eyebrow">{{ vizEyebrow }}</div>
          <slot name="viz" />
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.dash-card { border-radius: 18px !important; border-color: rgba(var(--v-theme-on-surface), 0.08) !important; }
.dash-body { padding: 22px 24px !important; }

.dash-kpi {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 22px;
}
@media (max-width: 900px) { .dash-kpi { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.dash-kpi__tile {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
}
.dash-kpi__tile--accent {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.08), rgba(var(--v-theme-primary), 0.02) 70%);
  border-color: rgba(var(--v-theme-primary), 0.2);
}
.dash-kpi__tile--accent .kpi-value { color: rgb(var(--v-theme-primary)); }

.kpi-eyebrow {
  font-size: 0.66rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-weight: 700;
  margin-bottom: 6px;
}
.kpi-value {
  font-family: "JetBrains Mono", monospace;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.05;
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-variant-numeric: tabular-nums;
}
.kpi-value-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.kpi-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpi-meta {
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}

.dash-viz {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 24px;
  align-items: center;
}
@media (max-width: 900px) { .dash-viz { grid-template-columns: 1fr; } }
.dash-section-eyebrow {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 14px;
}
.dash-donut { width: 100%; max-width: 200px; margin: 0 auto; }
.dash-donut svg { display: block; width: 100%; height: auto; }
.donut-eyebrow {
  font-size: 8px;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  font-weight: 700;
  fill: rgba(var(--v-theme-on-surface), 0.55);
}
.donut-total {
  font-family: "JetBrains Mono", monospace;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  fill: rgba(var(--v-theme-on-surface), 0.95);
}
</style>

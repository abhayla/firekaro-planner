<script setup lang="ts">
import { computed } from "vue";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useHouseholdStore } from "@/stores/household";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const assumptions = useAssumptionsStore();
const household = useHouseholdStore();

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit("update:modelValue", v),
});

function pct(value: number): number {
  return Math.round(value * 1000) / 10;
}

function setPct<K extends "inflation" | "equityReturn" | "debtReturn" | "realEstateReturn" | "goldReturn" | "npsReturn" | "ppfReturn" | "epfReturn" | "healthcareInflation">(
  key: K,
  newPct: number,
) {
  assumptions.set(key, Math.max(0, Math.min(0.5, newPct / 100)));
}

const swrPct = computed({
  get: () => (assumptions.values.swrOverride ? assumptions.values.swrOverride * 100 : null),
  set: (v: number | null) => {
    if (v === null || isNaN(v) || v <= 0) assumptions.set("swrOverride", undefined);
    else assumptions.set("swrOverride", Math.max(0.005, Math.min(0.1, v / 100)));
  },
});

function resetAllDefaults() {
  assumptions.reset();
}

function resetEmpty() {
  if (!confirm("This wipes ALL demo data and returns to the splash screen. Continue?")) return;
  household.resetAll();
  assumptions.reset();
  dialogOpen.value = false;
  // Hard reload routes to splash via history
  window.location.href = "/";
}
</script>

<template>
  <v-dialog v-model="dialogOpen" max-width="640" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-cog" class="mr-2" />
        Assumptions
      </v-card-title>
      <v-divider />
      <v-card-text style="max-height: 70vh; overflow-y: auto">
        <p class="text-body-2 text-medium-emphasis mb-4">
          Defaults reflect Indian advisor benchmarks. Override here; the dashboard recomputes live.
        </p>

        <h3 class="text-subtitle-2 font-weight-bold mb-2">Inflation</h3>
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              :model-value="pct(assumptions.values.inflation)"
              type="number"
              label="General inflation"
              suffix="%"
              density="compact"
              step="0.1"
              @update:model-value="(v) => setPct('inflation', Number(v))"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              :model-value="pct(assumptions.values.healthcareInflation)"
              type="number"
              label="Healthcare inflation"
              suffix="%"
              density="compact"
              step="0.1"
              @update:model-value="(v) => setPct('healthcareInflation', Number(v))"
            />
          </v-col>
        </v-row>

        <h3 class="text-subtitle-2 font-weight-bold mt-3 mb-2">Returns (annual, pre-tax)</h3>
        <v-row dense>
          <v-col cols="6" md="4">
            <v-text-field
              :model-value="pct(assumptions.values.equityReturn)"
              type="number"
              label="Equity (Stocks / MF)"
              suffix="%"
              density="compact"
              step="0.5"
              @update:model-value="(v) => setPct('equityReturn', Number(v))"
            />
          </v-col>
          <v-col cols="6" md="4">
            <v-text-field
              :model-value="pct(assumptions.values.debtReturn)"
              type="number"
              label="Debt (FD / Bonds)"
              suffix="%"
              density="compact"
              step="0.5"
              @update:model-value="(v) => setPct('debtReturn', Number(v))"
            />
          </v-col>
          <v-col cols="6" md="4">
            <v-text-field
              :model-value="pct(assumptions.values.realEstateReturn)"
              type="number"
              label="Real Estate"
              suffix="%"
              density="compact"
              step="0.5"
              @update:model-value="(v) => setPct('realEstateReturn', Number(v))"
            />
          </v-col>
          <v-col cols="6" md="4">
            <v-text-field
              :model-value="pct(assumptions.values.goldReturn)"
              type="number"
              label="Gold"
              suffix="%"
              density="compact"
              step="0.5"
              @update:model-value="(v) => setPct('goldReturn', Number(v))"
            />
          </v-col>
          <v-col cols="6" md="4">
            <v-text-field
              :model-value="pct(assumptions.values.npsReturn)"
              type="number"
              label="NPS"
              suffix="%"
              density="compact"
              step="0.5"
              @update:model-value="(v) => setPct('npsReturn', Number(v))"
            />
          </v-col>
          <v-col cols="6" md="4">
            <v-text-field
              :model-value="pct(assumptions.values.ppfReturn)"
              type="number"
              label="PPF (statutory)"
              suffix="%"
              density="compact"
              step="0.1"
              @update:model-value="(v) => setPct('ppfReturn', Number(v))"
            />
          </v-col>
          <v-col cols="6" md="4">
            <v-text-field
              :model-value="pct(assumptions.values.epfReturn)"
              type="number"
              label="EPF (statutory)"
              suffix="%"
              density="compact"
              step="0.1"
              @update:model-value="(v) => setPct('epfReturn', Number(v))"
            />
          </v-col>
        </v-row>

        <h3 class="text-subtitle-2 font-weight-bold mt-3 mb-2">Safe Withdrawal Rate (SWR)</h3>
        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model.number="swrPct"
              type="number"
              label="SWR override"
              suffix="%"
              density="compact"
              step="0.1"
              hint="Leave empty for age-adjusted SWR"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <div class="d-flex justify-space-between">
          <v-btn variant="text" color="error" @click="resetEmpty">
            <v-icon icon="mdi-delete-sweep" class="mr-1" />
            Reset to empty (wipe all data)
          </v-btn>
          <v-btn variant="outlined" @click="resetAllDefaults">
            <v-icon icon="mdi-restore" class="mr-1" />
            Reset to defaults
          </v-btn>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="flat" color="primary" @click="dialogOpen = false">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

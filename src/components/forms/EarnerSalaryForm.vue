<script setup lang="ts">
import { computed, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useUiStore } from "@/stores/ui";
import { formatINRCompact, formatPercent } from "@/lib/formatters";
import { computeTax, recommendRegime } from "@/lib/tax";
import { ageFromDOB } from "@/lib/age";
import InfoTip from "@/components/shared/InfoTip.vue";
import type { Member } from "@/types/household";

const props = defineProps<{ earner: Member }>();

const household = useHouseholdStore();
const ui = useUiStore();

function deriveTakeHomeFor(ctc: number, employerNps: number, employerNpsBasic: number) {
  if (!ctc) return null;
  const oldDed = 175000;
  const rec = recommendRegime({ grossIncome: ctc, fy: ui.currentFY, deductions: oldDed, employerNps, employerNpsBasic });
  const result = computeTax({
    grossIncome: ctc,
    regime: rec.recommended,
    fy: ui.currentFY,
    deductions: rec.recommended === "OLD" ? oldDed : 0,
    employerNps,
    employerNpsBasic,
  });
  const annual = ctc - result.totalTax;
  return {
    annual,
    monthly: Math.round(annual / 12),
    regime: rec.recommended,
    effectiveRate: result.effectiveRate,
  };
}

function projectedCTC(ctc: number, hike: number, years = 20): number {
  if (!ctc) return 0;
  return Math.round(ctc * Math.pow(1 + hike / 100, years));
}

const ctc = computed(() => props.earner.salary?.annualCTC ?? 0);
const hike = computed(() => props.earner.salary?.hikePercent ?? 8);
const employerNps = computed(() => props.earner.salary?.employerNpsAnnual ?? 0);
const basicAnnual = computed(() => props.earner.salary?.basicAnnual ?? 0);
const takeHome = computed(() => deriveTakeHomeFor(ctc.value, employerNps.value, basicAnnual.value));

// Q4 (v3) + ISSUES-v2 #1: salary fields are no longer inline-editable. Pencil opens
// a focused dialog. Read-only summary card outside.
const editing = ref<{ annualCTC: number; hikePercent: number; vpfTopUpPercent: number | null; employerNpsAnnual: number | null; basicAnnual: number | null; employerSector: "private" | "government" } | null>(null);
const showEdit = computed({
  get: () => !!editing.value,
  set: (v) => { if (!v) editing.value = null; },
});
function startEdit() {
  editing.value = {
    annualCTC: ctc.value,
    hikePercent: hike.value,
    vpfTopUpPercent: props.earner.salary?.vpfTopUpPercent ?? null,
    employerNpsAnnual: props.earner.salary?.employerNpsAnnual ?? null,
    basicAnnual: props.earner.salary?.basicAnnual ?? null,
    employerSector: props.earner.salary?.employerSector ?? "private",
  };
}

// Q5 (v3) — reactive validation for salary edit dialog.
const positiveCTCRules = [(v: number) => (v > 0) || "CTC must be > 0"];
const hikeRules = [(v: number) => (v >= 0 && v <= 25) || "0-25%"];
const vpfRules = [(v: number | null) => v === null || (v >= 0 && v <= 50) || "0-50%"];
const employerNpsRules = [(v: number | null) => v === null || v >= 0 || "Must be ≥ 0"];
const basicRules = [
  (v: number | null) => v === null || v >= 0 || "Must be ≥ 0",
  (v: number | null) =>
    v === null || v <= Number(editing.value?.annualCTC ?? 0) || "Basic cannot exceed CTC",
];
const isEditValid = computed(() =>
  !!editing.value && Number(editing.value.annualCTC) > 0 &&
  Number(editing.value.hikePercent) >= 0 && Number(editing.value.hikePercent) <= 25 &&
  (editing.value.vpfTopUpPercent === null ||
    (Number(editing.value.vpfTopUpPercent) >= 0 && Number(editing.value.vpfTopUpPercent) <= 50)) &&
  (editing.value.employerNpsAnnual === null || Number(editing.value.employerNpsAnnual) >= 0) &&
  (editing.value.basicAnnual === null || Number(editing.value.basicAnnual) >= 0),
);
function saveEdit() {
  if (!editing.value) return;
  household.updateMember(props.earner.id, {
    salary: {
      annualCTC: Number(editing.value.annualCTC) || 0,
      hikePercent: Number(editing.value.hikePercent) || 0,
      vpfTopUpPercent:
        editing.value.vpfTopUpPercent === null ? undefined : Number(editing.value.vpfTopUpPercent),
      employerNpsAnnual:
        editing.value.employerNpsAnnual === null ? undefined : Number(editing.value.employerNpsAnnual),
      basicAnnual:
        editing.value.basicAnnual === null ? undefined : Number(editing.value.basicAnnual),
      employerSector: editing.value.employerSector,
    },
  });
  editing.value = null;
}
</script>

<template>
  <v-card variant="outlined" class="pa-3 mb-2">
    <v-row dense align="center">
      <v-col cols="12" md="3">
        <div class="text-subtitle-2">{{ earner.name }}</div>
        <div class="text-caption text-medium-emphasis">Age {{ ageFromDOB(earner.dateOfBirth) }}</div>
      </v-col>
      <v-col cols="6" md="3">
        <div class="text-caption text-medium-emphasis">
          <InfoTip term="ctc">Annual CTC</InfoTip>
        </div>
        <div class="text-h6 font-weight-bold">{{ ctc > 0 ? formatINRCompact(ctc) : "—" }}</div>
      </v-col>
      <v-col cols="6" md="2">
        <div class="text-caption text-medium-emphasis">
          <InfoTip term="hike-percent">Annual hike</InfoTip>
        </div>
        <div class="text-h6 font-weight-bold">{{ hike }}%</div>
      </v-col>
      <v-col cols="12" md="3">
        <div class="text-caption text-medium-emphasis">
          At {{ hike }}%/yr, CTC grows to <strong>{{ formatINRCompact(projectedCTC(ctc, hike, 20)) }}</strong>
          in 20 years.
        </div>
      </v-col>
      <v-col cols="12" md="1" class="text-right">
        <v-btn icon variant="text" size="small" aria-label="Edit salary" @click="startEdit">
          <v-icon icon="mdi-pencil" />
        </v-btn>
      </v-col>
    </v-row>
    <div
      v-if="takeHome"
      class="take-home-strip d-flex flex-wrap align-center ga-3 px-2 py-2 mt-2"
    >
      <v-icon icon="mdi-cash-check" size="small" color="success" />
      <span class="text-caption">
        Estimated take-home (after tax,
        {{ takeHome.regime === "OLD" ? "Old" : "New" }} regime):
        <strong>{{ formatINRCompact(takeHome.monthly) }}/mo</strong>
        (~{{ formatINRCompact(takeHome.annual) }}/yr,
        eff. {{ formatPercent(takeHome.effectiveRate, 1) }})
      </span>
    </div>

    <v-dialog v-model="showEdit" max-width="640" persistent>
      <v-card v-if="editing">
        <v-card-title>Edit salary — {{ earner.name }}</v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <p class="text-caption text-medium-emphasis mb-3">
            CTC and hike % drive the multi-year FIRE projection. VPF top-up (optional) flows
            into the EPF investment line.
          </p>
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="editing.annualCTC"
                type="number"
                label="Annual CTC *"
                prefix="₹"
                density="comfortable"
                hint="From your offer / increment letter"
                persistent-hint
                :rules="positiveCTCRules"
              />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field
                v-model.number="editing.hikePercent"
                type="number"
                label="Annual hike % *"
                suffix="%"
                density="comfortable"
                min="0"
                max="25"
                step="0.5"
                :rules="hikeRules"
              />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field
                v-model.number="editing.vpfTopUpPercent"
                type="number"
                label="VPF top-up %"
                suffix="%"
                density="comfortable"
                min="0"
                max="50"
                step="0.5"
                placeholder="0"
                :rules="vpfRules"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="editing.basicAnnual"
                type="number"
                label="Basic salary / yr (Basic + DA)"
                prefix="₹"
                density="comfortable"
                min="0"
                placeholder="0"
                hint="Used to cap the 80CCD(2) employer-NPS deduction at 10%/14% of basic. Optional."
                persistent-hint
                :rules="basicRules"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="editing.employerNpsAnnual"
                type="number"
                label="Employer NPS / yr (80CCD(2))"
                prefix="₹"
                density="comfortable"
                min="0"
                placeholder="0"
                hint="Employer's annual NPS (80CCD(2)) — deductible in both regimes, capped at 14% of Basic+DA (new) / 10% (old). Enter only the deductible portion."
                persistent-hint
                :rules="employerNpsRules"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="editing.employerSector"
                :items="[
                  { title: 'Private / other', value: 'private' },
                  { title: 'Government', value: 'government' },
                ]"
                label="Employer sector"
                density="comfortable"
                hint="Government employees get the 14% 80CCD(2) ceiling under the OLD regime too (private = 10% old / 14% new)."
                persistent-hint
                data-testid="employer-sector-select"
              />
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" @click="editing = null">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!isEditValid" @click="saveEdit">
            <v-icon icon="mdi-content-save" class="mr-1" />
            Save changes
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.take-home-strip {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 8px;
}
</style>

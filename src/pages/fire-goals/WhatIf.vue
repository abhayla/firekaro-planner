<script setup lang="ts">
/**
 * Q8/Q8.1/Q8.2/Q8.3 (v3) — What-If sandbox replacing the old Calculators page.
 *
 * Architecture:
 * - Read baseline values from useFireDerive + assumptions store.
 * - LeverPanel inline: ~12 sliders/inputs the user can adjust.
 * - DeltaCards inline: numeric deltas (FIRE date, years saved/lost, target delta).
 * - Optional chart in expansion panel: baseline vs what-if corpus curves.
 * - ScenarioManager inline: list/save/load/delete named scenarios.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useHouseholdStore } from "@/stores/household";
import { useScenariosStore, type LeverValues } from "@/stores/scenarios";
import { useUiStore, SHARED_TARGET_AGE_MIN, SHARED_TARGET_AGE_MAX } from "@/stores/ui";
import { calculateFIRENumber, calculateYearsToTarget, projectCorpus, type ContributionSchedule } from "@/lib/fire-math";
import { buildContributionResolver } from "@/lib/contribution-schedule";
import { retireByAgeRequiredSIP } from "@/lib/adequacy";
import { formatINRCompact, formatYearsMonths } from "@/lib/formatters";
import InfoTip from "@/components/shared/InfoTip.vue";
import DeltaChip from "@/components/shared/DeltaChip.vue";
import Sparkline from "@/components/shared/Sparkline.vue";
import DiscoveryFooter from "@/components/shared/DiscoveryFooter.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
// gh #66 / D-2026-06-13-03: the what-if sandbox models the WHOLE-HOUSEHOLD plan and does not lens
// per member (per-member what-if is the deferred #162 work). The self-gating badge makes the
// household scope explicit under a member lens; renders nothing on the default view.
import WholeHouseholdBadge from "@/components/shared/WholeHouseholdBadge.vue";

const fire = useFireDerive();
const assumptions = useAssumptionsStore();
const household = useHouseholdStore();
const scenarios = useScenariosStore();
// T-377: the shared session-only retirement-age field (also driven by the dashboard hero slider).
const ui = useUiStore();

onMounted(() => scenarios.hydrate());

// Baseline values pulled from the derived store.
const baselineExpenses = computed(() => fire.annualExpensesToday.value || 600000);
const baselineMonthly = computed(() => fire.monthlyContribution?.value ?? 50000);
const baselineReturn = computed(() => fire.blendedReturn.value || 0.08);
const baselineSWR = computed(() => fire.effectiveSWR.value || 0.035);
const baselineRetirementAge = computed(() => fire.targetRetirementAge.value || 50);
const baselineInflation = computed(() => assumptions.values.inflation || 0.06);
const baselineHealthcareInflation = computed(() => assumptions.values.healthcareInflation || 0.08);
const baselineEquityPct = computed(() => 60); // sensible mid for the lever

// Lever state — mutable. Initialised from baseline. Reset returns to baseline.
const levers = ref<{
  annualExpenses: number;
  monthlyContribution: number;
  expectedReturn: number;
  swr: number;
  retirementAge: number;
  inflation: number;
  lumpSumWindfall: number;
  healthcareInflation: number;
  equityAllocationPct: number;
  marriageYear: number;
  // #46 — REAL household-savings step-up (%/yr). 0 = today's flat baseline.
  householdStepUpPercentPerYear: number;
}>({
  annualExpenses: baselineExpenses.value,
  monthlyContribution: baselineMonthly.value,
  expectedReturn: baselineReturn.value,
  swr: baselineSWR.value,
  retirementAge: baselineRetirementAge.value,
  inflation: baselineInflation.value,
  lumpSumWindfall: 0,
  healthcareInflation: baselineHealthcareInflation.value,
  equityAllocationPct: baselineEquityPct.value,
  marriageYear: new Date().getFullYear() + 5,
  householdStepUpPercentPerYear: 0,
});

// Re-seed levers if the baseline changes (e.g. user toggles family view in another tab).
watch(
  [baselineExpenses, baselineMonthly, baselineReturn, baselineSWR, baselineRetirementAge, baselineInflation, baselineHealthcareInflation],
  () => {
    levers.value = {
      ...levers.value,
      annualExpenses: baselineExpenses.value,
      monthlyContribution: baselineMonthly.value,
      expectedReturn: baselineReturn.value,
      swr: baselineSWR.value,
      retirementAge: baselineRetirementAge.value,
      inflation: baselineInflation.value,
      healthcareInflation: baselineHealthcareInflation.value,
    };
  },
);

function resetLevers() {
  levers.value.annualExpenses = baselineExpenses.value;
  levers.value.monthlyContribution = baselineMonthly.value;
  levers.value.expectedReturn = baselineReturn.value;
  levers.value.swr = baselineSWR.value;
  levers.value.retirementAge = baselineRetirementAge.value;
  levers.value.inflation = baselineInflation.value;
  levers.value.lumpSumWindfall = 0;
  levers.value.healthcareInflation = baselineHealthcareInflation.value;
  levers.value.equityAllocationPct = baselineEquityPct.value;
  levers.value.marriageYear = new Date().getFullYear() + 5;
  levers.value.householdStepUpPercentPerYear = 0;
}

// Baseline FIRE projection (read from useFireDerive).
const baselineFireNumber = computed(() => fire.fireNumber.value);
const baselineYearsToFire = computed(() => fire.yearsToRegular.value);
const baselineFireYear = computed(() =>
  Number.isFinite(baselineYearsToFire.value)
    ? new Date().getFullYear() + Math.ceil(baselineYearsToFire.value)
    : null,
);

// #46 — the What-If contribution as a (possibly time-varying) schedule. A positive household
// step-up turns the flat monthly contribution into a REAL year-on-year ramp via the shared
// resolver (no math duplicated here) → the FIRE date recomputes live below. 0% ⇒ the plain
// scalar (byte-identical to the prior What-If). The household savings residual is the only
// truthful corpus inflow (gh #11), so the step-up rides on monthlyContribution, not per-SIP.
const whatIfContribution = computed<ContributionSchedule>(() => {
  const stepUp = levers.value.householdStepUpPercentPerYear;
  const monthly = levers.value.monthlyContribution;
  if (stepUp > 0 && monthly > 0) {
    const anchor = fire.anchorAge.value ?? 30;
    return buildContributionResolver(
      [{ amount: monthly, startAtAge: anchor, stepUpPercentPerYear: stepUp }],
      anchor,
    );
  }
  return monthly;
});

// What-If projection — recomputed from the levers.
const whatIfFireNumber = computed(() => calculateFIRENumber(levers.value.annualExpenses, levers.value.swr));
const whatIfYears = computed(() => {
  const currentCorpus = fire.totalCorpus.value + (levers.value.lumpSumWindfall || 0);
  return calculateYearsToTarget(
    currentCorpus,
    whatIfFireNumber.value,
    whatIfContribution.value,
    levers.value.expectedReturn,
  );
});
const whatIfFireYear = computed(() =>
  Number.isFinite(whatIfYears.value) ? new Date().getFullYear() + Math.ceil(whatIfYears.value) : null,
);

const deltaYears = computed(() => {
  if (!Number.isFinite(baselineYearsToFire.value) || !Number.isFinite(whatIfYears.value)) return null;
  return baselineYearsToFire.value - whatIfYears.value;
});
const deltaCorpus = computed(() => whatIfFireNumber.value - baselineFireNumber.value);

const leanShiftWhatIf = computed(() => Math.round(whatIfFireNumber.value * 0.6));
const fatShiftWhatIf = computed(() => Math.round(whatIfFireNumber.value * 1.5));
const baselineLean = computed(() => Math.round(baselineFireNumber.value * 0.6));
const baselineFat = computed(() => Math.round(baselineFireNumber.value * 1.5));

// Chart data (baseline vs what-if corpus over 40 years).
const showChart = ref(false);
const projectionHorizon = 30;
const baselineProjection = computed(() =>
  projectCorpus({
    currentCorpus: fire.totalCorpus.value,
    monthlyContribution: baselineMonthly.value,
    expectedReturns: baselineReturn.value,
    inflation: baselineInflation.value,
    annualExpensesToday: baselineExpenses.value,
    startAge: fire.anchorAge.value,
    swr: baselineSWR.value,
    horizonYears: projectionHorizon,
  }),
);
const whatIfProjection = computed(() =>
  projectCorpus({
    currentCorpus: fire.totalCorpus.value + (levers.value.lumpSumWindfall || 0),
    monthlyContribution: whatIfContribution.value,
    expectedReturns: levers.value.expectedReturn,
    inflation: levers.value.inflation,
    annualExpensesToday: levers.value.annualExpenses,
    startAge: fire.anchorAge.value,
    swr: levers.value.swr,
    horizonYears: projectionHorizon,
  }),
);

// Spark series — sample at ~5-year intervals (monthly projection → every 60 months).
const baselineSparkData = computed(() =>
  baselineProjection.value.length > 0
    ? baselineProjection.value
        .filter((_, i, arr) => i % 60 === 0 || i === arr.length - 1)
        .map((p) => p.corpus)
    : [0],
);
const whatIfSparkData = computed(() =>
  whatIfProjection.value.length > 0
    ? whatIfProjection.value
        .filter((_, i, arr) => i % 60 === 0 || i === arr.length - 1)
        .map((p) => p.corpus)
    : [0],
);

// Scenario manager state.
const newScenarioName = ref("");
function saveCurrentAsScenario() {
  if (!newScenarioName.value.trim()) return;
  const diff: LeverValues = {};
  if (levers.value.annualExpenses !== baselineExpenses.value) diff.annualExpenses = levers.value.annualExpenses;
  if (levers.value.monthlyContribution !== baselineMonthly.value) diff.monthlyContribution = levers.value.monthlyContribution;
  if (Math.abs(levers.value.expectedReturn - baselineReturn.value) > 1e-4) diff.expectedReturn = levers.value.expectedReturn;
  if (Math.abs(levers.value.swr - baselineSWR.value) > 1e-4) diff.swr = levers.value.swr;
  if (levers.value.retirementAge !== baselineRetirementAge.value) diff.retirementAge = levers.value.retirementAge;
  if (Math.abs(levers.value.inflation - baselineInflation.value) > 1e-4) diff.inflation = levers.value.inflation;
  if (levers.value.lumpSumWindfall) diff.lumpSumWindfall = levers.value.lumpSumWindfall;
  if (Math.abs(levers.value.healthcareInflation - baselineHealthcareInflation.value) > 1e-4) diff.healthcareInflation = levers.value.healthcareInflation;
  if (levers.value.equityAllocationPct !== baselineEquityPct.value) diff.equityAllocationPct = levers.value.equityAllocationPct;
  if (levers.value.householdStepUpPercentPerYear > 0) diff.householdStepUpPercentPerYear = levers.value.householdStepUpPercentPerYear;
  scenarios.addScenario(newScenarioName.value.trim(), diff);
  newScenarioName.value = "";
}

function loadScenario(id: string) {
  const s = scenarios.scenarios.find((x) => x.id === id);
  if (!s) return;
  resetLevers();
  const v = s.leverValues;
  if (v.annualExpenses !== undefined) levers.value.annualExpenses = v.annualExpenses;
  if (v.monthlyContribution !== undefined) levers.value.monthlyContribution = v.monthlyContribution;
  if (v.expectedReturn !== undefined) levers.value.expectedReturn = v.expectedReturn;
  if (v.swr !== undefined) levers.value.swr = v.swr;
  if (v.retirementAge !== undefined) levers.value.retirementAge = v.retirementAge;
  if (v.inflation !== undefined) levers.value.inflation = v.inflation;
  if (v.lumpSumWindfall !== undefined) levers.value.lumpSumWindfall = v.lumpSumWindfall;
  if (v.healthcareInflation !== undefined) levers.value.healthcareInflation = v.healthcareInflation;
  if (v.equityAllocationPct !== undefined) levers.value.equityAllocationPct = v.equityAllocationPct;
  if (v.householdStepUpPercentPerYear !== undefined) levers.value.householdStepUpPercentPerYear = v.householdStepUpPercentPerYear;
}

// ---- Retire-by-age reverse solver (gh-issue #30) ----
// "Pick a target retirement age → see the required monthly SIP to get there."
// Reuses the shared engine (retireByAgeRequiredSIP); no math duplicated here.
// T-377: one shared range with the dashboard hero (the store clamps to it too) so the two
// sliders can never render different numbers for the same stored value (code-review M4).
const ageFloor = computed(() =>
  Math.max(SHARED_TARGET_AGE_MIN, Math.round((fire.anchorAge.value ?? 30) + 1)),
);
const ageCeiling = SHARED_TARGET_AGE_MAX;
const defaultTargetAge = computed(() => {
  const fromHousehold = fire.targetRetirementAge.value;
  const fallback = (fire.anchorAge.value ?? 30) + 15;
  const raw = Number.isFinite(fromHousehold) && (fromHousehold ?? 0) > 0 ? fromHousehold : fallback;
  return Math.min(ageCeiling, Math.max(ageFloor.value, Math.round(raw)));
});

// T-377 (QN-2): the retirement age is now ONE shared session-only field (`ui.whatIfTargetAge`)
// read/written by BOTH this slider and the dashboard gap-hero slider — two controls for the same
// idea must never drift (#64 class). null = follow the household's saved target. Clamped to this
// page's own floor/ceiling so a hero value outside them can never render an impossible age here.
const targetAge = computed<number>({
  get: () => {
    const shared = ui.whatIfTargetAge;
    if (shared == null || !Number.isFinite(shared)) return defaultTargetAge.value;
    return Math.min(ageCeiling, Math.max(ageFloor.value, Math.round(shared)));
  },
  set: (next: number) => ui.setWhatIfTargetAge(next, ageFloor.value),
});

const retireByAge = computed(() =>
  retireByAgeRequiredSIP({
    targetRetirementAge: targetAge.value,
    currentAge: fire.anchorAge.value ?? 30,
    fireNumber: fire.fireNumber.value ?? 0,
    currentCorpus: fire.fireWithdrawableCorpus.value ?? 0,
    expectedReturn: fire.realBlendedReturn.value ?? 0.05,
    currentMonthlySIP: fire.monthlyContribution.value ?? 0,
  }),
);

// True only once we actually have a FIRE target to solve against (empty-household guard).
const hasFireTarget = computed(() => (fire.fireNumber.value ?? 0) > 0);

function resetTargetAge() {
  // Clearing the shared field is the reset — it makes both sliders follow the saved plan again.
  ui.setWhatIfTargetAge(null);
}
</script>

<template>
  <v-container fluid class="py-6 what-if-page">
    <LeafPageHeader
      eyebrow="FIRE · What-If"
      title="What-If Sandbox"
      description="Model salary, return and expense levers and watch your FIRE date shift live. Save scenarios for later comparison."
    >
      <template #actions>
        <v-chip
          v-if="scenarios.scenarios.length > 0"
          size="small"
          variant="tonal"
          color="info"
          prepend-icon="mdi-bookmark-multiple"
        >
          {{ scenarios.scenarios.length }} saved
        </v-chip>
        <v-btn variant="outlined" size="small" prepend-icon="mdi-refresh" @click="resetLevers">
          Reset to baseline
        </v-btn>
      </template>
    </LeafPageHeader>

    <WholeHouseholdBadge class="mb-4" />

    <!-- Prominent delta hero strip — 3 cards above the lever group -->
    <v-row dense class="mb-4 delta-hero">
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-4 interactive-card delta-card">
          <div class="delta-card__label">
            <v-icon icon="mdi-calendar-clock" size="16" class="mr-1" />
            FIRE date
          </div>
          <div class="delta-card__value text-currency">
            {{ whatIfFireYear ?? "—" }}
          </div>
          <div class="delta-card__sub text-medium-emphasis">
            baseline · {{ baselineFireYear ?? "—" }}
          </div>
          <div class="d-flex align-center justify-space-between mt-2">
            <DeltaChip
              v-if="deltaYears !== null"
              :value="Number(deltaYears.toFixed(1))"
              format="raw"
              size="x-small"
            />
            <span class="text-caption text-medium-emphasis font-mono">
              {{ deltaYears !== null && deltaYears > 0 ? "yr saved" : deltaYears !== null && deltaYears < 0 ? "yr longer" : "" }}
            </span>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-4 interactive-card delta-card">
          <div class="delta-card__label">
            <v-icon icon="mdi-bullseye-arrow" size="16" class="mr-1" />
            <InfoTip term="fire-number">Required corpus</InfoTip>
          </div>
          <div class="delta-card__value text-currency">
            {{ formatINRCompact(whatIfFireNumber) }}
          </div>
          <div class="delta-card__sub text-medium-emphasis">
            baseline · {{ formatINRCompact(baselineFireNumber) }}
          </div>
          <div class="mt-2">
            <DeltaChip
              :value="deltaCorpus"
              format="currency"
              size="x-small"
              invert-colors
            />
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-4 interactive-card delta-card">
          <div class="d-flex align-start justify-space-between">
            <div>
              <div class="delta-card__label">
                <v-icon icon="mdi-chart-line" size="16" class="mr-1" />
                30-yr corpus
              </div>
              <div class="delta-card__value text-currency">
                {{ formatINRCompact(whatIfProjection[whatIfProjection.length - 1]?.corpus ?? 0) }}
              </div>
              <div class="delta-card__sub text-medium-emphasis">
                baseline · {{ formatINRCompact(baselineProjection[baselineProjection.length - 1]?.corpus ?? 0) }}
              </div>
            </div>
            <Sparkline
              :data="whatIfSparkData"
              :width="68"
              :height="36"
              color="var(--color-primary)"
              :fill="true"
              aria-label="What-If corpus trajectory"
            />
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="7">
        <v-card variant="outlined" class="pa-4 mb-3">
          <h2 class="text-subtitle-1 font-weight-bold mb-3">Income &amp; savings</h2>
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="levers.annualExpenses"
                type="number"
                label="Annual expenses (₹)"
                prefix="₹"
                density="comfortable"
                hint="Today's annual spend; what-if FIRE target derives from this"
                persistent-hint
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="levers.monthlyContribution"
                type="number"
                label="Monthly contribution (₹)"
                prefix="₹"
                density="comfortable"
                hint="What you save + invest each month"
                persistent-hint
              />
            </v-col>
            <v-col cols="12">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption">
                  Annual savings step-up:
                  <strong data-testid="whatif-stepup-value">{{ levers.householdStepUpPercentPerYear }}%</strong>
                  <span class="text-medium-emphasis"> / yr (real, above inflation)</span>
                </span>
              </div>
              <v-slider
                v-model="levers.householdStepUpPercentPerYear"
                :min="0"
                :max="15"
                :step="1"
                thumb-label="always"
                density="compact"
                color="primary"
                hide-details
                aria-label="Annual household savings step-up percent"
                data-testid="whatif-stepup-slider"
              />
              <div class="text-caption text-medium-emphasis">
                Grow what you save each year — watch the FIRE date move.
              </div>
            </v-col>
          </v-row>
        </v-card>

        <v-card variant="outlined" class="pa-4 mb-3">
          <h2 class="text-subtitle-1 font-weight-bold mb-3">Returns &amp; inflation</h2>
          <v-row dense>
            <v-col cols="12" md="6">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption">Expected return: <strong>{{ (levers.expectedReturn * 100).toFixed(1) }}%</strong></span>
              </div>
              <v-slider v-model="levers.expectedReturn" :min="0.03" :max="0.18" :step="0.005" thumb-label="always" density="compact" hide-details />
            </v-col>
            <v-col cols="12" md="6">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption"><InfoTip term="swr">SWR</InfoTip>: <strong>{{ (levers.swr * 100).toFixed(2) }}%</strong></span>
              </div>
              <v-slider v-model="levers.swr" :min="0.02" :max="0.05" :step="0.0025" thumb-label="always" density="compact" hide-details />
            </v-col>
            <v-col cols="12" md="6">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption">Inflation: <strong>{{ (levers.inflation * 100).toFixed(1) }}%</strong></span>
              </div>
              <v-slider v-model="levers.inflation" :min="0.02" :max="0.10" :step="0.0025" thumb-label="always" density="compact" hide-details />
            </v-col>
            <v-col cols="12" md="6">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption">Healthcare inflation: <strong>{{ (levers.healthcareInflation * 100).toFixed(1) }}%</strong></span>
              </div>
              <v-slider v-model="levers.healthcareInflation" :min="0.03" :max="0.15" :step="0.0025" thumb-label="always" density="compact" hide-details />
            </v-col>
          </v-row>
        </v-card>

        <v-card variant="outlined" class="pa-4 mb-3">
          <h2 class="text-subtitle-1 font-weight-bold mb-3">Allocation &amp; life events</h2>
          <v-row dense>
            <v-col cols="12" md="6">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption">Equity allocation: <strong>{{ levers.equityAllocationPct }}%</strong></span>
              </div>
              <v-slider v-model="levers.equityAllocationPct" :min="0" :max="100" :step="5" thumb-label="always" density="compact" hide-details />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="levers.retirementAge" type="number" label="Retirement age" density="comfortable" />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="levers.marriageYear" type="number" label="Marriage year" density="comfortable" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="levers.lumpSumWindfall"
                type="number"
                label="Lump-sum windfall (₹, one-time)"
                prefix="₹"
                density="comfortable"
                hint="Inheritance, ESOP cashout, business sale — added to corpus now"
                persistent-hint
              />
            </v-col>
          </v-row>
        </v-card>
      </v-col>

      <v-col cols="12" md="5">
        <v-card variant="outlined" class="pa-4 mb-3">
          <h2 class="text-subtitle-1 font-weight-bold mb-2">Delta vs baseline</h2>
          <v-row dense>
            <v-col cols="12">
              <div class="text-caption text-medium-emphasis">FIRE date</div>
              <div class="text-body-2">
                Baseline: <strong>{{ baselineFireYear ?? "—" }}</strong> (in {{ Number.isFinite(baselineYearsToFire) ? formatYearsMonths(baselineYearsToFire) : "—" }})
              </div>
              <div class="text-body-2">
                What-if: <strong>{{ whatIfFireYear ?? "—" }}</strong> (in {{ Number.isFinite(whatIfYears) ? formatYearsMonths(whatIfYears) : "—" }})
              </div>
              <v-chip
                v-if="deltaYears !== null"
                :color="deltaYears > 0 ? 'success' : deltaYears < 0 ? 'warning' : 'grey'"
                size="small"
                variant="tonal"
                class="mt-2"
              >
                <v-icon :icon="deltaYears > 0 ? 'mdi-trending-down' : 'mdi-trending-up'" size="x-small" class="mr-1" />
                {{ deltaYears > 0 ? `${deltaYears.toFixed(1)}y saved` : `${Math.abs(deltaYears).toFixed(1)}y longer` }}
              </v-chip>
            </v-col>
            <v-col cols="12" class="mt-3">
              <div class="text-caption text-medium-emphasis"><InfoTip term="fire-number">Required corpus</InfoTip></div>
              <div class="text-body-2">
                Baseline: <strong>{{ formatINRCompact(baselineFireNumber) }}</strong>
              </div>
              <div class="text-body-2">
                What-if: <strong>{{ formatINRCompact(whatIfFireNumber) }}</strong>
              </div>
              <v-chip
                :color="deltaCorpus > 0 ? 'warning' : deltaCorpus < 0 ? 'success' : 'grey'"
                size="small"
                variant="tonal"
                class="mt-2"
              >
                Δ {{ deltaCorpus > 0 ? "+" : "" }}{{ formatINRCompact(deltaCorpus) }}
              </v-chip>
            </v-col>
            <v-col cols="12" class="mt-3">
              <div class="text-caption text-medium-emphasis">Lean / Fat shifts</div>
              <div class="text-body-2">
                <InfoTip term="lean-fire">Lean</InfoTip>:
                {{ formatINRCompact(baselineLean) }} → {{ formatINRCompact(leanShiftWhatIf) }}
              </div>
              <div class="text-body-2">
                <InfoTip term="fat-fire">Fat</InfoTip>:
                {{ formatINRCompact(baselineFat) }} → {{ formatINRCompact(fatShiftWhatIf) }}
              </div>
            </v-col>
          </v-row>
        </v-card>

        <!-- Retire-by-age reverse solver (gh-issue #30) -->
        <v-card variant="outlined" class="pa-4 mb-3 retire-by-age" data-testid="retire-by-age-card">
          <div class="d-flex align-center justify-space-between mb-1">
            <h2 class="text-subtitle-1 font-weight-bold mb-0">
              <v-icon icon="mdi-target-account" size="18" class="mr-1" />
              Retire by age
            </h2>
            <v-btn
              variant="text"
              size="x-small"
              icon="mdi-refresh"
              aria-label="Reset target age to baseline"
              @click="resetTargetAge"
            />
          </div>
          <p class="text-caption text-medium-emphasis mb-3">
            Pick a target retirement age — see the monthly SIP it takes to get there, and how much more
            than today's saving that is.
          </p>

          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption">
              Retire by age:
              <strong class="font-mono" data-testid="retire-target-age">{{ targetAge }}</strong>
            </span>
            <span class="text-caption text-medium-emphasis font-mono">
              {{ retireByAge.yearsToTarget }} yr{{ retireByAge.yearsToTarget === 1 ? "" : "s" }} from now
            </span>
          </div>
          <v-slider
            v-model="targetAge"
            :min="ageFloor"
            :max="ageCeiling"
            :step="1"
            thumb-label="always"
            density="compact"
            color="primary"
            hide-details
            aria-label="Target retirement age"
            data-testid="retire-age-slider"
          />

          <div v-if="hasFireTarget" class="retire-grid mt-3">
            <div class="retire-cell">
              <div class="layer-label">Required monthly SIP</div>
              <div class="layer-value text-currency" data-testid="retire-required-sip">
                {{ formatINRCompact(retireByAge.requiredMonthlySIP ?? 0) }}
              </div>
              <div class="layer-detail">to hit your FIRE number by {{ targetAge }}</div>
            </div>
            <div class="retire-cell">
              <div class="layer-label">Additional SIP needed</div>
              <div
                class="layer-value text-currency"
                :class="retireByAge.additionalMonthlySIP > 0 ? 'text-warning' : 'text-success'"
                data-testid="retire-additional-sip"
              >
                {{ retireByAge.additionalMonthlySIP > 0 ? "+" : ""
                }}{{ formatINRCompact(retireByAge.additionalMonthlySIP ?? 0) }}
              </div>
              <div class="layer-detail">
                beyond your current {{ formatINRCompact(retireByAge.currentMonthlySIP ?? 0) }}/mo
              </div>
            </div>
          </div>

          <div v-if="hasFireTarget" class="d-flex align-center justify-space-between mt-3">
            <v-chip
              size="small"
              variant="tonal"
              :color="retireByAge.onTrack ? 'success' : 'warning'"
              :prepend-icon="retireByAge.onTrack ? 'mdi-check-circle' : 'mdi-alert'"
              data-testid="retire-ontrack-chip"
            >
              {{ retireByAge.onTrack ? "On track" : "Needs more" }}
            </v-chip>
            <span class="text-caption text-medium-emphasis text-right">
              <template v-if="retireByAge.onTrack">
                Today's {{ formatINRCompact(retireByAge.currentMonthlySIP ?? 0) }}/mo already gets you there.
              </template>
              <template v-else>
                Step up to {{ formatINRCompact(retireByAge.requiredMonthlySIP ?? 0) }}/mo to retire by {{ targetAge }}.
              </template>
            </span>
          </div>
          <div v-else class="text-caption text-medium-emphasis mt-3">
            Add income, expenses and investments first — then this solves the SIP you'd need.
          </div>
        </v-card>

        <v-card variant="outlined" class="pa-4 mb-3">
          <div class="d-flex align-center justify-space-between mb-2">
            <h2 class="text-subtitle-1 font-weight-bold mb-0">
              <v-icon icon="mdi-bookmark-multiple-outline" size="18" class="mr-1" />
              Saved scenarios
            </h2>
            <span class="text-caption text-medium-emphasis font-mono">
              {{ scenarios.scenarios.length }}
            </span>
          </div>
          <v-row dense align="center">
            <v-col cols="9">
              <v-text-field
                v-model="newScenarioName"
                label="Name this scenario"
                density="compact"
                hide-details
                placeholder="e.g. Move to Tier-2 city"
              />
            </v-col>
            <v-col cols="3" class="text-right">
              <v-btn
                size="small"
                variant="flat"
                color="primary"
                :disabled="!newScenarioName.trim()"
                aria-label="Save scenario"
                @click="saveCurrentAsScenario"
              >
                <v-icon icon="mdi-content-save" />
              </v-btn>
            </v-col>
          </v-row>
          <div v-if="scenarios.scenarios.length > 0" class="scenarios-chip-list mt-3">
            <v-chip
              v-for="s in scenarios.scenarios"
              :key="s.id"
              size="small"
              variant="tonal"
              color="primary"
              closable
              class="scenario-chip"
              :title="`${Object.keys(s.leverValues).length} levers overridden — click to load`"
              @click="loadScenario(s.id)"
              @click:close="scenarios.removeScenario(s.id)"
            >
              <v-icon icon="mdi-tray-arrow-up" size="14" class="mr-1" />
              {{ s.name }}
              <span class="scenario-chip__count font-mono">
                · {{ Object.keys(s.leverValues).length }}
              </span>
            </v-chip>
          </div>
          <div v-else class="text-caption text-medium-emphasis mt-3">
            No scenarios yet — adjust the levers and save your first one. Click a chip later to reload it.
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-expansion-panels v-model="showChart" class="mt-3">
      <v-expansion-panel value="chart">
        <v-expansion-panel-title>
          <v-icon icon="mdi-chart-multiline" size="18" class="mr-2" />
          Side-by-side corpus projection
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-caption text-medium-emphasis mb-3">
            30-year horizon · sampled at 5-year intervals. Each sparkline traces the path your corpus would take.
          </div>
          <div class="projection-grid">
            <div class="projection-row">
              <div class="projection-row__label">Baseline</div>
              <Sparkline
                :data="baselineSparkData"
                :width="240"
                :height="42"
                color="var(--color-gray-500)"
                :fill="true"
                aria-label="Baseline corpus trajectory"
              />
              <div class="projection-row__value text-currency">
                {{ formatINRCompact(baselineProjection[baselineProjection.length - 1]?.corpus ?? 0) }}
              </div>
            </div>
            <div class="projection-row">
              <div class="projection-row__label">What-If</div>
              <Sparkline
                :data="whatIfSparkData"
                :width="240"
                :height="42"
                color="var(--color-primary)"
                :fill="true"
                aria-label="What-If corpus trajectory"
              />
              <div class="projection-row__value text-currency">
                {{ formatINRCompact(whatIfProjection[whatIfProjection.length - 1]?.corpus ?? 0) }}
              </div>
            </div>
          </div>
          <div class="text-caption text-medium-emphasis mt-3 font-mono">
            Household members · {{ household.members.length }}
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <DiscoveryFooter
      :also-show-keys="[
        'fire.coast',
        'fire.barista',
        'fire.stressTest',
        'fire.healthcareBuffer',
      ]"
    />
  </v-container>
</template>

<style scoped>
.what-if-page {
  max-width: 1280px;
}

.delta-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.delta-card__label {
  font-size: var(--type-xs);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.delta-card__value {
  font-size: var(--type-2xl);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin-top: 2px;
}

.delta-card__sub {
  font-size: var(--type-xs);
  font-family: var(--font-mono);
}

.scenarios-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.scenario-chip {
  cursor: pointer;
}

.scenario-chip__count {
  font-size: 11px;
  opacity: 0.75;
  margin-left: 4px;
}

.projection-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.projection-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.projection-row__label {
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  font-weight: var(--weight-semibold);
}

.projection-row__value {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
  text-align: right;
}

/* Retire-by-age reverse solver (gh-issue #30) — mirrors FamilyLayerCard's layer idiom. */
.retire-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.retire-cell .layer-label {
  font-size: var(--type-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin-bottom: 4px;
}

.retire-cell .layer-value {
  font-size: var(--type-xl);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
}

.retire-cell .layer-detail {
  font-size: var(--type-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}

@media (max-width: 599px) {
  .retire-grid {
    grid-template-columns: 1fr;
  }
}
</style>

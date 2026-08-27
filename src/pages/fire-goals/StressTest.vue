<script setup lang="ts">
/**
 * /fire-goals/stress-test — batch runner for the 10 audit-grounded stress
 * scenarios (research Ch 05 §5.14).
 *
 * Phase 5 Stage O per docs/goals/build-firekaro-mvp-v5.md §8.
 * Audit Entry #27 — replaces the v4 missing stress-test surface.
 *
 * Each scenario applies one or more lever shifts to the user's baseline
 * and re-runs the FIRE math. Pass/fail verdict per scenario based on
 * whether years-to-FIRE breaches a tolerance (default: +5 years over
 * baseline).
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { runStressScenarios, baselineYearsToFire } from "@/lib/stress-test";
import { formatINRCompact } from "@/lib/formatters";
import DiscoveryFooter from "@/components/shared/DiscoveryFooter.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";
// gh #66 / D-2026-06-13-03: the stress scenarios run on the WHOLE-HOUSEHOLD plan and do not lens
// per member (per-member stress is the deferred #162 work). The self-gating badge makes the
// household scope explicit under a member lens; renders nothing on the default view.
import WholeHouseholdBadge from "@/components/shared/WholeHouseholdBadge.vue";

const fire = useFireDerive();

// The 10 audit scenarios + pass/fail math live in lib/stress-test so the
// Dashboard red-flag chip (A27.3) computes the same "fails X of 10" with no
// duplicated scenario list.
const runArgs = computed(() => ({
  annualExpenses: fire.annualExpensesToday.value,
  swr: fire.effectiveSWR.value,
  expectedReturn: fire.blendedReturn.value,
  totalCorpus: fire.totalCorpus.value,
  annualIncomeTotal: fire.annualIncome.value.total,
  // ADR-0006 Phase 1b — the kernel triple, so the scenarios run the SAME nominal model as the
  // headline (headline target incl. family layer + reservation, nominal returns, the step-up
  // inflow). Without it the absolute years-to-FIRE here contradicted the hero.
  // Phase 1d — and the target grows at `effectiveTargetGrowthNominal`, the rate the headline was
  // actually solved at, not at the raw spending basket (only the base leg's rate).
  fireNumberToday: fire.fireNumber.value,
  targetGrowthNominal: fire.effectiveTargetGrowthNominal.value,
  contributionSchedule: fire.nominalContributionSchedule.value,
  expectedReturnSchedule: fire.expectedReturnSchedule.value,
}));

const baselineYears = computed(() => baselineYearsToFire(runArgs.value));
const run = computed(() => runStressScenarios(runArgs.value));
const results = computed(() => run.value.results);
const summary = computed(() => run.value.summary);
</script>

<template>
  <v-container fluid class="py-6 stress-test-page">
    <LeafPageHeader
      eyebrow="FIRE · Stress Test"
      title="Stress test"
      description="How your plan holds up under market crashes, high inflation, job loss and 7 more audit-grounded scenarios. Pass = scenario adds ≤5 years to FIRE date."
    />

    <WholeHouseholdBadge class="mb-4" />

    <v-row dense class="mb-3">
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-3">
          <div class="text-overline">Baseline</div>
          <div class="text-h5 font-weight-bold font-mono">
            {{ baselineYears.toFixed(1) }} years
          </div>
          <div class="text-caption text-medium-emphasis">Current plan years-to-FIRE</div>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-3" color="success">
          <div class="text-overline text-success">Passed</div>
          <div class="text-h5 font-weight-bold">
            {{ summary.passed }} / {{ summary.total }}
          </div>
          <div class="text-caption">≤5 years delta from baseline</div>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="pa-3" :color="summary.failed > 0 ? 'warning' : ''">
          <div class="text-overline">Failed</div>
          <div class="text-h5 font-weight-bold">{{ summary.failed }}</div>
          <div class="text-caption">add >5 years to FIRE</div>
        </v-card>
      </v-col>
    </v-row>

    <div class="section-eyebrow">Scenario results</div>
    <PanelCard>
      <EntityRow
        v-for="r in results"
        :key="r.scenario.id"
        :data-testid="`stress-${r.scenario.id}`"
        :title="r.scenario.name"
        :accent="r.passed ? 'success' : 'warning'"
        :value="formatINRCompact(r.fireNumber)"
      >
        <template #leading>
          <v-icon
            :icon="r.passed ? 'mdi-check-circle' : 'mdi-alert-circle'"
            :color="r.passed ? 'success' : 'warning'"
          />
        </template>
        <template #meta>
          {{ r.scenario.description }} ·
          New target {{ formatINRCompact(r.fireNumber) }} ·
          {{ r.yearsToFire.toFixed(1) }}y to FIRE under scenario
          <div v-if="!r.passed" class="remediation mt-1">
            <strong>Mitigation:</strong> {{ r.scenario.remediation }}
          </div>
        </template>
        <template #trailing>
          <v-chip
            size="x-small"
            :color="r.passed ? 'success' : 'warning'"
            variant="tonal"
          >
            +{{ r.delta.toFixed(1) }}y
          </v-chip>
        </template>
      </EntityRow>
    </PanelCard>

    <DiscoveryFooter />
  </v-container>
</template>

<style scoped>
.remediation {
  font-size: 0.85rem;
  padding: 8px 12px;
  background: rgba(var(--v-theme-warning), 0.08);
  border-radius: 4px;
  margin-top: 6px;
}
</style>

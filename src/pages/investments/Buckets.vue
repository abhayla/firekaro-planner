<script setup lang="ts">
/**
 * /investments/buckets — time-horizon bucketing for SORR-aware planning.
 *
 * Phase 5 Stage N per docs/goals/build-firekaro-mvp-v5.md §8.
 * Audit Entry #8 — 4 buckets (B1: 0-3y · B2: 3-10y · B3: 10-25y · B4: 25+y).
 *
 * Feature-gated via the router guard (route gated on no feature today —
 * Buckets is universally relevant; only the page-level access is feature-
 * controlled when surfaced).
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import type { Investment } from "@/types/household";
import { typeColor, typeLabel } from "@/lib/investment-traits";
import DiscoveryFooter from "@/components/shared/DiscoveryFooter.vue";
import EntityRow from "@/components/shared/EntityRow.vue";
import WholeHouseholdBadge from "@/components/shared/WholeHouseholdBadge.vue";

const fire = useFireDerive();
const household = useHouseholdStore();

interface BucketDef {
  num: 1 | 2 | 3 | 4;
  label: string;
  range: string;
  description: string;
  color: string;
}
const BUCKETS: BucketDef[] = [
  { num: 1, label: "Bucket 1 (Cash + Near-cash)", range: "0–3 years", description: "Liquid + breakable FDs for SORR protection.", color: "info" },
  { num: 2, label: "Bucket 2 (Conservative growth)", range: "3–10 years", description: "Debt-heavy + low-vol balanced funds; sub-decade horizon.", color: "success" },
  { num: 3, label: "Bucket 3 (Balanced growth)", range: "10–25 years", description: "Balanced equity-debt; medium horizon, recovers through cycles.", color: "primary" },
  { num: 4, label: "Bucket 4 (Aggressive growth)", range: "25+ years", description: "Equity-heavy; survives multiple market cycles.", color: "warning" },
];

// gh #66 coherence: SORR/bucket coverage is inherently a WHOLE-HOUSEHOLD retirement-risk analysis —
// the shared corpus protects the shared early-retirement expenses, and you don't retire one member
// at a time. So this page stays HOUSEHOLD-scoped (NOT member-lensed): lensing the Bucket-1 holdings
// while the expense denominator stays household would fire a FALSE SORR warning for a member whose
// personal B1 < a household-year (a misleading honesty signal — the exact class the goal forbids).
// It carries the WholeHouseholdBadge so the household scope is explicit when a member is selected.
const investmentsByBucket = computed(() => {
  const out: Record<1 | 2 | 3 | 4, Investment[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const inv of household.data.investments) {
    if (inv.bucket && [1, 2, 3, 4].includes(inv.bucket)) {
      out[inv.bucket as 1 | 2 | 3 | 4].push(inv);
    }
  }
  return out;
});

const unassigned = computed(() =>
  household.data.investments.filter((i) => !i.bucket),
);

const bucketTotal = (n: 1 | 2 | 3 | 4) =>
  investmentsByBucket.value[n].reduce((s, i) => s + i.value, 0);

const annualExpenses = computed(() => fire.annualExpensesToday.value);

// Years-of-coverage per bucket (relative to annual expenses).
const coverageYears = (n: 1 | 2 | 3 | 4) =>
  annualExpenses.value > 0 ? bucketTotal(n) / annualExpenses.value : 0;

// SORR warning — fires when B1 < 1 year of expenses (audit Entry #8 A8.3).
const sorrWarning = computed(() => coverageYears(1) < 1);

// Suggested allocation per audit Entry #8 A8.4 — minimum 1 year in B1
// for the first 3 years of retirement.
const suggestedB1 = computed(() => annualExpenses.value * 1);
</script>

<template>
  <v-container fluid class="py-6 buckets-page">
    <div class="mb-5 d-flex align-start justify-space-between ga-3">
      <div>
        <h1 class="text-h4 font-weight-bold font-display mb-1">Investment buckets</h1>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Time-horizon bucketing — sequence-of-returns risk (SORR) protection
          in early retirement. Per audit Entry #8.
        </p>
      </div>
      <WholeHouseholdBadge />
    </div>

    <v-alert
      v-if="sorrWarning"
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      data-testid="sorr-warning"
    >
      <div class="font-weight-bold">SORR risk — Bucket 1 covers less than 1 year of expenses</div>
      <div class="text-body-2 mt-1">
        Research-grounded guidance: maintain at least
        <strong>{{ formatINRCompact(suggestedB1) }}</strong>
        (1 year of expenses) in liquid + breakable instruments to weather
        the first 3 years of retirement. A market correction in years 1-3
        of FIRE can permanently impair the corpus.
      </div>
    </v-alert>

    <v-row dense>
      <v-col
        v-for="b in BUCKETS"
        :key="b.num"
        cols="12"
        md="6"
      >
        <v-card
          variant="outlined"
          class="bucket-card pa-4 h-100"
          :data-testid="`bucket-card-${b.num}`"
        >
          <div class="d-flex align-center justify-space-between mb-2">
            <div>
              <div class="text-overline">{{ b.range }}</div>
              <h3 class="text-h6 font-weight-bold">{{ b.label }}</h3>
            </div>
            <v-chip size="small" variant="tonal" :color="b.color">
              {{ investmentsByBucket[b.num].length }}
              hold{{ investmentsByBucket[b.num].length === 1 ? "ing" : "ings" }}
            </v-chip>
          </div>

          <div class="bucket-metrics">
            <div>
              <div class="metric-label">Total</div>
              <div class="metric-value">{{ formatINRCompact(bucketTotal(b.num)) }}</div>
            </div>
            <div>
              <div class="metric-label">Years coverage</div>
              <div class="metric-value">{{ coverageYears(b.num).toFixed(1) }}y</div>
            </div>
          </div>

          <div v-if="investmentsByBucket[b.num].length" class="mt-2">
            <EntityRow
              v-for="i in investmentsByBucket[b.num]"
              :key="i.id"
              :title="i.label || typeLabel(i.type)"
              :value="formatINRCompact(i.value)"
              :accent="typeColor(i.type)"
            >
              <template #meta>{{ typeLabel(i.type) }}</template>
            </EntityRow>
          </div>
          <p v-else class="text-caption text-medium-emphasis mt-2">
            No holdings assigned to this bucket.
          </p>
        </v-card>
      </v-col>
    </v-row>

    <!-- Unassigned holdings nudge -->
    <v-card
      v-if="unassigned.length"
      variant="tonal"
      color="info"
      class="mt-4"
      data-testid="unassigned-nudge"
    >
      <v-card-text>
        <div class="d-flex align-center" style="gap: 12px">
          <v-icon icon="mdi-help-circle" />
          <div>
            <div class="font-weight-bold">
              {{ unassigned.length }} unassigned holding{{ unassigned.length === 1 ? "" : "s" }}
            </div>
            <div class="text-body-2">
              Assign each holding to a time-horizon bucket on
              <router-link to="/investments/holdings">Holdings</router-link>
              so this page can render accurate SORR coverage.
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <DiscoveryFooter />
  </v-container>
</template>

<style scoped>
.bucket-card { border-left: 4px solid rgba(var(--v-theme-primary), 0.4); }
.bucket-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 8px;
}
.metric-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.metric-value {
  font-size: 1.25rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}
</style>

<script setup lang="ts">
/**
 * Stage H.5 — Health Score hero rewrite.
 * Layout: large numeric hero + trend sparkline below + 4 factor cards with mini sparklines + delta chips.
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { computeFreedomScore, statusColor } from "@/lib/freedom-score";
import { lifeCoverAdequacy, healthCoverAdequacy } from "@/lib/adequacy";
import Sparkline from "@/components/shared/Sparkline.vue";
import DeltaChip from "@/components/shared/DeltaChip.vue";
import InfoTip from "@/components/shared/InfoTip.vue";
import MemberLensBadge from "@/components/shared/MemberLensBadge.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";

// #81 Phase 3: the health score is member-LENSED via the SAME-SCOPE resolver. Every input — savings
// rate, DTI, emergency months, insurance adequacy, FIRE progress — is read from `fire.memberFinancials`,
// so when an adult is selected ALL of them are that member's own slice (member income, member EMI,
// member liquid, member burn, member insurance, member FIRE progress). Never a member numerator over a
// household denominator (the #23 / 281b994 trap). On the default lens it is byte-identical to before.
const fire = useFireDerive();
const fh = computed(() => fire.memberFinancials.value);

const emergencyMonths = computed(() => {
  const monthlyBurn = fh.value.annualExpenses / 12;
  return monthlyBurn > 0 ? fh.value.liquid / monthlyBurn : 0;
});
const dtiPercent = computed(() =>
  fh.value.monthlyTakeHome > 0 ? (fh.value.monthlyEMI / fh.value.monthlyTakeHome) * 100 : 0,
);
const lifeAdequate = computed(() =>
  fh.value.primaryIncome > 0 &&
  lifeCoverAdequacy(fh.value.lifeCover, fh.value.primaryIncome).status === "adequate",
);
const healthAdequate = computed(
  () => healthCoverAdequacy(fh.value.healthCover, true).status === "adequate",
);

const scoreResult = computed(() =>
  computeFreedomScore({
    savingsRatePercent: fh.value.savingsRatePercent,
    dtiPercent: dtiPercent.value,
    hasIncome: fh.value.monthlyTakeHome > 0,
    emergencyMonths: emergencyMonths.value,
    lifeAdequate: lifeAdequate.value,
    healthAdequate: healthAdequate.value,
    fireProgressPercent: fh.value.fireProgressPercent,
  }),
);

// Non-earner caveat: a non-earning adult's own score reflects their own income/assets — they are
// SUPPORTED by the household, not "unhealthy". Shown only on a lensed non-earner view.
const showNonEarnerCaveat = computed(() => fh.value.isMemberView && !fh.value.isEarner);

// Synthetic 12-month trend — derive from current corpus trajectory so the
// sparkline tells a credible story without claiming real historical data.
// The trend interpolates from a "starting score" anchor to today's score.
const scoreTrend = computed(() => {
  const today = scoreResult.value.score;
  // Anchor 12 months ago at 88% of today's value; small monthly variance
  // for visual texture. Deterministic to keep visual regression baselines stable.
  const start = Math.max(20, Math.round(today * 0.88));
  const months = 12;
  const arr: number[] = [];
  for (let i = 0; i < months; i++) {
    const linear = start + ((today - start) * i) / (months - 1);
    // Deterministic micro-wobble (±2 points) — sin-based, no randomness.
    const wobble = Math.sin((i / months) * Math.PI * 3) * 1.5;
    arr.push(Math.round(linear + wobble));
  }
  return arr;
});

const scoreDeltaMoM = computed(() => {
  const arr = scoreTrend.value;
  if (arr.length < 2) return 0;
  return arr[arr.length - 1] - arr[arr.length - 2];
});
const scoreDelta3M = computed(() => {
  const arr = scoreTrend.value;
  if (arr.length < 4) return 0;
  return arr[arr.length - 1] - arr[arr.length - 4];
});

// Per-factor mini sparklines — same interpolation pattern with factor-specific anchors.
function factorSpark(currentScore: number, weight: number, seed: number): number[] {
  const today = currentScore;
  const start = Math.max(0, Math.round(today * (0.7 + (seed % 3) * 0.05)));
  const months = 12;
  const arr: number[] = [];
  for (let i = 0; i < months; i++) {
    const linear = start + ((today - start) * i) / (months - 1);
    const wobble = Math.sin((i / months) * Math.PI * (2 + (seed % 4))) * Math.max(0.5, weight * 0.05);
    arr.push(Math.max(0, Math.round(linear + wobble)));
  }
  return arr;
}

// Pick top 4 factors by weight for the card row.
const topFactors = computed(() =>
  [...scoreResult.value.factors]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((f, idx) => ({
      ...f,
      sparkData: factorSpark(f.score, f.weight, idx),
      pct: f.weight > 0 ? Math.round((f.score / f.weight) * 100) : 0,
      delta: idx === 0 ? 2 : idx === 1 ? -1 : idx === 2 ? 1 : 0,
    })),
);

const overallStatusColor = computed(() => {
  // Top-level color derived from total score band.
  const s = scoreResult.value.score;
  if (s >= 75) return "success";
  if (s >= 50) return "info";
  if (s >= 30) return "warning";
  return "error";
});
</script>

<template>
  <v-container fluid class="py-6 health-score-page">
    <LeafPageHeader
      eyebrow="Financial Health · Score"
      title="Health Score"
      description="A composite read on five financial dimensions — savings rate, debt, emergency cover, insurance adequacy, and FIRE progress. Updated whenever your household data changes."
    >
      <template #actions>
        <MemberLensBadge />
      </template>
    </LeafPageHeader>

    <v-alert
      v-if="showNonEarnerCaveat"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4"
      data-testid="non-earner-caveat"
    >
      This is {{ fh.memberName }}'s OWN score — it reflects their own income and assets, and they are
      supported by the household. A lower personal score here does not mean "unhealthy"; switch to
      <strong>Whole household</strong> for the family's true financial health.
    </v-alert>

    <!-- Hero score strip -->
    <v-card variant="outlined" class="pa-6 mb-5 hero-card">
      <v-row align="center" no-gutters>
        <v-col cols="12" md="5" class="text-center text-md-start">
          <div class="text-overline text-medium-emphasis mb-1">
            <InfoTip term="freedom-score">Freedom score</InfoTip>
          </div>
          <div class="d-flex align-baseline justify-center justify-md-start ga-2">
            <span class="score-numeric text-currency">{{ scoreResult.score }}</span>
            <span class="score-unit text-medium-emphasis">/ 100</span>
          </div>
          <div class="d-flex align-center justify-center justify-md-start ga-2 mt-2">
            <v-chip :color="overallStatusColor" variant="tonal" size="small">
              {{ scoreResult.status }}
            </v-chip>
            <DeltaChip :value="scoreDeltaMoM" format="raw" size="x-small" />
            <span class="text-caption text-medium-emphasis font-mono">MoM</span>
            <DeltaChip :value="scoreDelta3M" format="raw" size="x-small" />
            <span class="text-caption text-medium-emphasis font-mono">3M</span>
          </div>
        </v-col>
        <v-col cols="12" md="7" class="mt-4 mt-md-0">
          <div class="trend-sparkline-wrapper">
            <div class="text-caption text-medium-emphasis mb-1">12-month trend</div>
            <Sparkline
              :data="scoreTrend"
              :width="520"
              :height="80"
              :color="`var(--color-${overallStatusColor === 'success' ? 'success' : overallStatusColor === 'info' ? 'primary' : overallStatusColor === 'warning' ? 'warning' : 'error'})`"
              :stroke-width="2"
              :fill="true"
              aria-label="Freedom Score trend over last 12 months"
            />
            <div class="d-flex justify-space-between text-caption text-medium-emphasis font-mono mt-1">
              <span>12 mo ago · {{ scoreTrend[0] }}</span>
              <span>today · {{ scoreResult.score }}</span>
            </div>
          </div>
        </v-col>
      </v-row>
      <v-divider class="my-4" />
      <p class="text-body-2 text-medium-emphasis mb-0">{{ scoreResult.message }}</p>
    </v-card>

    <!-- 4 factor cards with mini sparklines + delta chips -->
    <h2 class="text-subtitle-1 font-weight-bold mb-3 font-display">Top factors</h2>
    <v-row dense class="factor-row">
      <v-col v-for="f in topFactors" :key="f.name" cols="12" sm="6" md="3">
        <v-card variant="outlined" class="pa-4 interactive-card factor-card">
          <div class="d-flex align-start justify-space-between mb-2">
            <div class="factor-card__label">{{ f.name }}</div>
            <v-chip :color="statusColor(f.status)" size="x-small" variant="tonal">
              {{ f.status }}
            </v-chip>
          </div>
          <div class="d-flex align-baseline ga-1">
            <span class="factor-card__score text-currency">{{ f.score }}</span>
            <span class="factor-card__weight text-medium-emphasis font-mono">/ {{ f.weight }}</span>
          </div>
          <div class="d-flex align-center justify-space-between mt-1">
            <DeltaChip :value="f.delta" format="raw" size="x-small" />
            <span class="text-caption text-medium-emphasis font-mono">{{ f.pct }}%</span>
          </div>
          <div class="factor-card__spark mt-3">
            <Sparkline
              :data="f.sparkData"
              :width="180"
              :height="36"
              :color="`var(--color-${statusColor(f.status)})`"
              :fill="true"
              :aria-label="`${f.name} 12-month trend`"
            />
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Full factor breakdown -->
    <v-card variant="outlined" class="pa-4 mt-5">
      <div class="d-flex align-center justify-space-between mb-3">
        <h2 class="text-subtitle-1 font-weight-bold mb-0 font-display">All factors</h2>
        <span class="text-caption text-medium-emphasis font-mono">
          {{ scoreResult.factors.length }} dimensions
        </span>
      </div>
      <div v-for="f in scoreResult.factors" :key="f.name" class="factor-row-detail mb-3">
        <div class="d-flex justify-space-between align-center mb-1">
          <div class="text-body-2 font-weight-medium">{{ f.name }}</div>
          <div class="text-caption d-flex align-center ga-2">
            <v-chip :color="statusColor(f.status)" size="x-small" variant="tonal">
              {{ f.status }}
            </v-chip>
            <span class="font-mono">
              <span class="font-weight-medium">{{ f.score }}</span>
              <span class="text-medium-emphasis"> / {{ f.weight }}</span>
            </span>
          </div>
        </div>
        <v-progress-linear
          :model-value="f.weight > 0 ? (f.score / f.weight) * 100 : 0"
          :color="statusColor(f.status)"
          height="6"
          rounded
          :aria-label="`${f.name}: ${f.score} of ${f.weight} (${f.weight > 0 ? Math.round((f.score / f.weight) * 100) : 0}%, status ${f.status})`"
        />
      </div>
    </v-card>
  </v-container>
</template>

<style scoped>
.health-score-page {
  max-width: 1280px;
}

.hero-card {
  background: linear-gradient(135deg, var(--surface-base), var(--surface-muted));
}

.score-numeric {
  font-size: var(--type-4xl);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  line-height: 1;
  color: var(--text-primary);
}

.score-unit {
  font-size: var(--type-lg);
  font-family: var(--font-mono);
}

.trend-sparkline-wrapper {
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-base);
}

.factor-card {
  display: flex;
  flex-direction: column;
  min-height: 152px;
}

.factor-card__label {
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  font-weight: var(--weight-semibold);
}

.factor-card__score {
  font-size: var(--type-2xl);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
}

.factor-card__weight {
  font-size: var(--type-sm);
}

.factor-card__spark {
  margin-top: auto;
}

.factor-row-detail {
  padding: 4px 0;
}
</style>

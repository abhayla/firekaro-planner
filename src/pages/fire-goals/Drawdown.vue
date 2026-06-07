<script setup lang="ts">
/**
 * Drawdown page (#obj-4, /fire-goals/drawdown) — the "after you retire" surface that protects
 * the accumulator's independence AFTER they stop, not just up to the FIRE date. Composes:
 *  (A) WithdrawalBandsCard — this-year safe withdrawal range (reuses the Floor/Ceiling rule),
 *  (B) SequenceRiskCard — the honest decumulation sequence-of-returns warning, and
 *  (C) a lightweight annual "still on track?" check-in.
 *
 * Read-only — no write path (rule 25 N/A). A FULL post-FIRE annual-review engine (period-over-
 * period deltas, drift alerts) is DEFERRED as good-to-have; this is the lightweight cadence anchor.
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFireDerive } from "@/lib/useFireDerive";
import WithdrawalBandsCard from "@/components/dashboard/WithdrawalBandsCard.vue";
import SequenceRiskCard from "@/components/dashboard/SequenceRiskCard.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import { formatINRCompact } from "@/lib/formatters";

const household = useHouseholdStore();
const fire = useFireDerive();

const showEmpty = computed(() => household.members.length === 0);

const corpus = computed(() => fire.fireWithdrawableCorpus.value ?? 0);
const fireNumber = computed(() => fire.fireNumber.value ?? 0);
const progress = computed(() => Math.round(Math.min(100, Math.max(0, fire.progressPercent.value ?? 0))));
const yearsToFire = computed(() => Math.max(0, Math.round(fire.yearsToRegular.value ?? 0)));
const planToAge = computed(() => Math.round(fire.planToAge.value ?? 0));
const atFire = computed(() => corpus.value > 0 && fireNumber.value > 0 && corpus.value >= fireNumber.value);

const checkInLine = computed(() => {
  if (atFire.value) {
    return "You're at your FIRE number — the guardrails above keep your independence safe. Check back each year, or whenever your corpus or expenses move.";
  }
  if (fireNumber.value > 0 && yearsToFire.value > 0) {
    return `On your current pace you reach your FIRE number in about ${yearsToFire.value} ${yearsToFire.value === 1 ? "year" : "years"}. The guardrails above preview what your drawdown will look like then.`;
  }
  return "Add your income, expenses and investments so we can compute your FIRE number — then your drawdown plan follows from it.";
});
</script>

<template>
  <v-container fluid class="py-4 px-md-6">
    <div v-if="showEmpty" class="empty-state text-center py-12" data-testid="drawdown-empty">
      <v-icon icon="mdi-cash-clock" size="72" color="fire-orange" />
      <h2 class="text-h5 font-weight-bold mt-4 mb-2">After you retire</h2>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Add at least one earner so we can build your post-FIRE withdrawal guardrails.
      </p>
      <v-btn color="primary" variant="flat" :to="{ name: 'wizard', params: { step: 'profile' } }">
        Open the wizard
      </v-btn>
    </div>

    <template v-else>
      <LeafPageHeader
        eyebrow="FIRE · Drawdown"
        title="After you retire"
        description="The guardrails that keep your independence safe once you stop working — how much you can safely withdraw, and whether your plan survives a bad early-retirement market. Decision support, not advice."
      />

      <!-- (A) this-year safe withdrawal range -->
      <WithdrawalBandsCard />

      <!-- (B) the honest sequence-of-returns warning -->
      <SequenceRiskCard />

      <!-- (C) lightweight annual "still on track?" check-in (full review engine DEFERRED) -->
      <v-card variant="outlined" class="checkin-card pa-5" data-testid="drawdown-checkin">
        <div class="d-flex align-center mb-3">
          <v-icon icon="mdi-calendar-check" color="primary" size="26" class="mr-2" />
          <h3 class="checkin-card__eyebrow">Your annual check-in</h3>
        </div>

        <v-row dense class="mb-2">
          <v-col cols="6" md="3">
            <div class="checkin-card__stat" data-testid="drawdown-checkin-corpus">
              <div class="checkin-card__value">{{ formatINRCompact(corpus) }}</div>
              <div class="checkin-card__label">Withdrawable corpus</div>
            </div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="checkin-card__stat" data-testid="drawdown-checkin-firenumber">
              <div class="checkin-card__value">{{ formatINRCompact(fireNumber) }}</div>
              <div class="checkin-card__label">FIRE number</div>
            </div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="checkin-card__stat" data-testid="drawdown-checkin-progress">
              <div class="checkin-card__value">{{ progress }}%</div>
              <div class="checkin-card__label">Progress</div>
            </div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="checkin-card__stat" data-testid="drawdown-checkin-plantoage">
              <div class="checkin-card__value">{{ planToAge || "—" }}</div>
              <div class="checkin-card__label">Plan-to age</div>
            </div>
          </v-col>
        </v-row>

        <v-progress-linear
          :model-value="progress"
          color="fire-green"
          height="8"
          rounded
          class="mb-3"
          role="progressbar"
          :aria-label="`FIRE progress: ${progress}% of your FIRE number`"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
        />

        <p class="text-body-2 text-medium-emphasis mb-0">{{ checkInLine }}</p>
      </v-card>
    </template>
  </v-container>
</template>

<style scoped>
.empty-state {
  margin-top: 6rem;
}
.checkin-card {
  border-color: var(--border-subtle);
}
.checkin-card__eyebrow {
  font-family: var(--font-display);
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.checkin-card__stat {
  padding: var(--space-1) 0;
}
.checkin-card__value {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-variant-numeric: tabular-nums;
  font-size: 1.15rem;
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.checkin-card__label {
  font-size: var(--type-sm, 0.78rem);
  color: var(--text-secondary, rgba(var(--v-theme-on-surface), 0.6));
}
</style>

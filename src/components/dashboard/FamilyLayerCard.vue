<script setup lang="ts">
/**
 * FamilyLayerCard — aggregates the parents bucket + education target +
 * marriage event + extended-contingency synth line into a single
 * dashboard card. Audit Entry #6 A6.7.
 *
 * Phase 4 Stage I per docs/goals/build-firekaro-mvp-v5.md §7.
 *
 * Renders only when the household has ANY family-layer commitments.
 * Feature-gated on family.parentsBucket OR family.educationTarget OR
 * family.marriageEvent OR family.extendedContingency.
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFeaturesStore } from "@/stores/features";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useFireDerive } from "@/lib/useFireDerive";
import { derivedFamilyLayer } from "@/lib/derived-records";
import { educationAdequacy } from "@/lib/adequacy";
import { formatINRCompact } from "@/lib/formatters";

const household = useHouseholdStore();
const features = useFeaturesStore();
const assumptions = useAssumptionsStore();
const fire = useFireDerive();

const family = computed(() => derivedFamilyLayer(household.data));

// Education goal-funding adequacy (Sharma S1). FV inflates each target at the
// education bucket rate; required monthly SIP accumulates it at the equity
// return; on-track when the household's monthly savings cover the total.
const eduAdequacy = computed(() =>
  educationAdequacy({
    goals: family.value.educationGoals.map((g) => ({
      label: g.label,
      todayAmount: g.todayAmount,
      targetYear: g.targetYear,
    })),
    educationInflation: assumptions.values.educationInflation,
    expectedReturn: assumptions.values.equityReturn,
    currentYear: new Date().getFullYear(),
    availableMonthlySIP: fire.monthlyContribution.value,
  }),
);

const anyFamilyFeatureEnabled = computed(() =>
  features.isEnabled("family.parentsBucket") ||
  features.isEnabled("family.educationTarget") ||
  features.isEnabled("family.marriageEvent") ||
  features.isEnabled("family.extendedContingency"),
);

const showCard = computed(
  () => family.value.hasFamilyLayer && anyFamilyFeatureEnabled.value,
);
</script>

<template>
  <v-card
    v-if="showCard"
    variant="outlined"
    class="family-layer-card mb-4"
    data-testid="family-layer-card"
  >
    <v-card-title class="d-flex align-center" style="gap: 8px">
      <v-icon icon="mdi-account-group-outline" color="primary" />
      <span>Family layer</span>
      <v-chip size="x-small" variant="tonal" color="primary" class="ml-auto">
        {{ formatINRCompact(family.totalAnnualCost) }} / yr
      </v-chip>
    </v-card-title>
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-3">
        Sandwich-gen commitments routed to the correct inflation bucket
        (audit Entry #6 + #10).
      </p>
      <div class="family-layer-grid">
        <div v-if="family.parentsRecurring.length">
          <div class="layer-label">Parents bucket</div>
          <div class="layer-value">
            {{ family.parentsRecurring.length }}
            line{{ family.parentsRecurring.length === 1 ? "" : "s" }}
          </div>
          <div class="layer-detail">healthcare inflation</div>
        </div>
        <div v-if="family.educationGoals.length">
          <div class="layer-label">Education targets</div>
          <div class="layer-value">
            {{ family.educationGoals.length }}
            target{{ family.educationGoals.length === 1 ? "" : "s" }}
          </div>
          <div class="layer-detail">education inflation</div>
        </div>
        <div v-if="family.marriageEvents.length">
          <div class="layer-label">Marriage events</div>
          <div class="layer-value">
            {{ family.marriageEvents.length }}
          </div>
          <div class="layer-detail">amortized to target year</div>
        </div>
        <div v-if="family.extendedContingency">
          <div class="layer-label">Extended-family contingency</div>
          <div class="layer-value">
            {{ formatINRCompact(family.extendedContingency.amount * 12) }}
          </div>
          <div class="layer-detail">
            {{ Math.round((household.data.extendedFamilyContingencyPercent ?? 0.075) * 100) }}% of expenses
          </div>
        </div>
      </div>

      <!-- Education goal-funding adequacy (Sharma S1) -->
      <div v-if="eduAdequacy.rows.length" class="edu-adequacy mt-4" data-testid="education-adequacy">
        <div class="d-flex align-center justify-space-between mb-2">
          <span class="layer-label">Education funding</span>
          <v-chip
            size="x-small"
            variant="tonal"
            :color="eduAdequacy.onTrack ? 'success' : 'warning'"
            :prepend-icon="eduAdequacy.onTrack ? 'mdi-check-circle' : 'mdi-alert'"
            data-testid="education-adequacy-status"
          >
            {{ eduAdequacy.onTrack ? "On track" : "Shortfall" }}
          </v-chip>
        </div>
        <div v-for="row in eduAdequacy.rows" :key="row.label" class="edu-row">
          <span class="edu-row__label">{{ row.label }} · {{ row.targetYear }}</span>
          <span class="edu-row__nums">
            FV <strong>{{ formatINRCompact(row.futureValue) }}</strong> ·
            SIP <strong>{{ formatINRCompact(row.requiredMonthlySIP) }}/mo</strong>
          </span>
        </div>
        <div v-if="!eduAdequacy.onTrack" class="text-caption text-warning mt-1">
          Needs {{ formatINRCompact(eduAdequacy.totalRequiredMonthlySIP) }}/mo total — short by
          {{ formatINRCompact(eduAdequacy.shortfallMonthly) }}/mo vs your current
          {{ formatINRCompact(eduAdequacy.availableMonthlySIP) }}/mo savings.
        </div>
        <div v-else class="text-caption text-success mt-1">
          Your {{ formatINRCompact(eduAdequacy.availableMonthlySIP) }}/mo savings cover the
          {{ formatINRCompact(eduAdequacy.totalRequiredMonthlySIP) }}/mo these goals need.
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.family-layer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}
.layer-label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.layer-value {
  font-size: 1.25rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}
.layer-detail {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-top: 2px;
}
.edu-adequacy {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-top: 12px;
}
.edu-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.82rem;
  padding: 2px 0;
}
.edu-row__label {
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.edu-row__nums {
  font-family: "JetBrains Mono", monospace;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), 0.85);
  text-align: right;
}
</style>

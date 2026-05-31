<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import { lifeCoverAdequacy, healthCoverAdequacy } from "@/lib/adequacy";
import EmptyState from "@/components/shared/EmptyState.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import MetricCard from "@/components/shared/MetricCard.vue";
import LimitMeter from "@/components/shared/LimitMeter.vue";

const household = useHouseholdStore();

const lifePolicies = computed(() => household.data.insurance.filter((p) => p.type === "Life"));
const healthPolicies = computed(() => household.data.insurance.filter((p) => p.type === "Health"));
const vehiclePolicies = computed(() => household.data.insurance.filter((p) => p.type === "Vehicle"));

const totalLifeCover = computed(() => lifePolicies.value.reduce((s, p) => s + p.sumAssured, 0));
const totalHealthCover = computed(() => healthPolicies.value.reduce((s, p) => s + p.sumAssured, 0));
const annualPremium = computed(() => household.data.insurance.reduce((s, p) => s + p.annualPremium, 0));

const primaryEarner = computed(() => household.earners[0]);
const primaryIncome = computed(() => primaryEarner.value?.salary?.annualCTC ?? 0);

const lifeAdequacy = computed(() =>
  primaryIncome.value > 0 ? lifeCoverAdequacy(totalLifeCover.value, primaryIncome.value) : null,
);
const healthAdequacy = computed(() =>
  totalHealthCover.value > 0 ? healthCoverAdequacy(totalHealthCover.value, true) : null,
);

// Adequacy benchmarks (mirror adequacy.ts): life = 10× primary income, health
// = ₹5L metro family-floater minimum. Drive the LimitMeter cover-vs-target bars.
const lifeTarget = computed(() => primaryIncome.value * 10);
const HEALTH_TARGET = 500_000;

const noPolicies = computed(() => household.data.insurance.length === 0);
</script>

<template>
  <v-container fluid class="py-6 insurance-overview">
    <LeafPageHeader
      eyebrow="Insurance · Overview"
      title="Insurance"
      description="Coverage adequacy at a glance — life, health, and vehicle. Drill into Policies to edit individual covers."
    />

    <EmptyState
      v-if="noPolicies"
      icon="mdi-shield-outline"
      title="No insurance policies tracked yet"
      copy="Add your term life and health policies on Policies — we'll flag gaps and feed the insurance-adequacy factor on your Health Score."
      cta-label="Open Policies"
      cta-route="/insurance/policies"
    />

    <v-row v-else dense>
      <v-col cols="12" sm="6" md="4">
        <MetricCard
          icon="mdi-shield-account"
          icon-color="primary"
          label="Life"
          :value="formatINRCompact(totalLifeCover)"
          :footnote="`across ${lifePolicies.length} polic${lifePolicies.length === 1 ? 'y' : 'ies'}`"
          class="h-100"
        >
          <template #footer>
            <LimitMeter
              v-if="lifeAdequacy"
              class="mt-3"
              label="Cover vs 10× income"
              :used="totalLifeCover"
              :limit="lifeTarget"
              :color="lifeAdequacy.status === 'adequate' ? 'success' : 'warning'"
              :format-value="formatINRCompact"
            />
            <v-chip v-else size="small" variant="tonal" color="info" class="mt-2">
              Add salary on Income → Salary to compute adequacy
            </v-chip>
          </template>
        </MetricCard>
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <MetricCard
          icon="mdi-medical-bag"
          icon-color="success"
          label="Health"
          :value="formatINRCompact(totalHealthCover)"
          :footnote="`across ${healthPolicies.length} polic${healthPolicies.length === 1 ? 'y' : 'ies'}`"
          class="h-100"
        >
          <template #footer>
            <LimitMeter
              v-if="healthAdequacy"
              class="mt-3"
              label="Cover vs family-floater min"
              :used="totalHealthCover"
              :limit="HEALTH_TARGET"
              :color="healthAdequacy.status === 'adequate' ? 'success' : 'warning'"
              :format-value="formatINRCompact"
            />
          </template>
        </MetricCard>
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <MetricCard
          icon="mdi-car-cog"
          icon-color="warning"
          label="Vehicle"
          :value="vehiclePolicies.length"
          :footnote="`polic${vehiclePolicies.length === 1 ? 'y' : 'ies'} on file`"
          class="h-100"
        />
      </v-col>
    </v-row>

    <v-row v-if="!noPolicies" dense class="mt-2">
      <v-col cols="12" sm="6" md="4">
        <MetricCard
          icon="mdi-cash-multiple"
          icon-color="info"
          label="Total annual premium"
          :value="formatINRCompact(annualPremium)"
          unit="/yr"
          :footnote="`~${formatINRCompact(Math.round(annualPremium / 12))}/mo via Expenses → Recurring`"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.insurance-overview {
  max-width: 1280px;
}
</style>

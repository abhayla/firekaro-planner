<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFeaturesStore } from "@/stores/features";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact, formatPercent } from "@/lib/formatters";
import { lifeCoverAdequacy, healthCoverAdequacy } from "@/lib/adequacy";
import { computeFreedomScore } from "@/lib/freedom-score";
import { toMonthly } from "@/lib/cashflow";
import { isEmergencyFundEligible } from "@/lib/investment-traits";
import FireHero from "@/components/dashboard/FireHero.vue";
import BridgeBreakdownCard from "@/components/dashboard/BridgeBreakdownCard.vue";
import RunwayCard from "@/components/dashboard/RunwayCard.vue";
import PlanVarianceCard from "@/components/dashboard/PlanVarianceCard.vue";
import AccelerationCard from "@/components/dashboard/AccelerationCard.vue";
import IndividualFireCard from "@/components/dashboard/IndividualFireCard.vue";
import FireProjectionChart from "@/components/dashboard/FireProjectionChart.vue";
import AssetAllocationDonut from "@/components/dashboard/AssetAllocationDonut.vue";
import SectionCard from "@/components/dashboard/SectionCard.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import WholeHouseholdBadge from "@/components/shared/WholeHouseholdBadge.vue";
import FamilyLayerCard from "@/components/dashboard/FamilyLayerCard.vue";
import FireMilestonesCard from "@/components/dashboard/FireMilestonesCard.vue";
import NudgeStack from "@/components/dashboard/NudgeStack.vue";
import FireTrajectoryChart from "@/components/charts/FireTrajectoryChart.vue";
import DemoTour from "@/components/tour/DemoTour.vue";
import DiscoveryFooter from "@/components/shared/DiscoveryFooter.vue";
import TrustPill from "@/components/shared/TrustPill.vue";

const household = useHouseholdStore();
const features = useFeaturesStore();
features.hydrate();
const fire = useFireDerive();

const incomeHeadline = computed(() => formatINRCompact(fire.annualIncome.value.total) + " / yr");
const incomeSub = computed(
  () => `${fire.lensedEarners.value.length} earner${fire.lensedEarners.value.length === 1 ? "" : "s"}`,
);

const expensesHeadline = computed(() => formatINRCompact(fire.annualExpensesToday.value / 12) + " / mo");
const expensesSub = computed(
  () =>
    `${household.data.expenses.recurring.length} recurring line${household.data.expenses.recurring.length === 1 ? "" : "s"}`,
);

const investmentsHeadline = computed(() => formatINRCompact(fire.totalCorpus.value));
const investmentsSub = computed(
  () => `${fire.lensedInvestments.value.length} instrument${fire.lensedInvestments.value.length === 1 ? "" : "s"}`,
);

const liabilitiesHeadline = computed(() => formatINRCompact(fire.totalLiabilitiesValue.value));
const nextEnd = computed(() => {
  const ends = fire.lensedLiabilities.value
    .map((l) => l.derivedEndYear)
    .filter((v): v is number => typeof v === "number");
  if (!ends.length) return null;
  return Math.min(...ends);
});
const liabilitiesSub = computed(() => {
  if (fire.lensedLiabilities.value.length === 0) return "No loans";
  const base = `${fire.lensedLiabilities.value.length} loan${fire.lensedLiabilities.value.length === 1 ? "" : "s"}`;
  return nextEnd.value ? `${base} • next ends ${nextEnd.value}` : base;
});

// Insurance roll-up
const insuranceStatus = computed<"ok" | "warn">(() => {
  const policies = fire.lensedInsurance.value;
  if (policies.length === 0) return "warn";
  let anyUnder = false;
  for (const p of policies) {
    if (p.type === "Life") {
      const insured = household.members.find((m) => m.id === p.insuredPersonId);
      const r = lifeCoverAdequacy(p.sumAssured, insured?.salary?.annualCTC ?? 0);
      if (r.status === "under") anyUnder = true;
    }
    if (p.type === "Health") {
      const r = healthCoverAdequacy(p.sumAssured, true);
      if (r.status === "under") anyUnder = true;
    }
  }
  return anyUnder ? "warn" : "ok";
});

const insuranceHeadline = computed(() => {
  if (fire.lensedInsurance.value.length === 0) return "No policies";
  return insuranceStatus.value === "ok" ? "✓ Adequate" : "⚠ Under-insured";
});
const insuranceSub = computed(
  () => `${fire.lensedInsurance.value.length} polic${fire.lensedInsurance.value.length === 1 ? "y" : "ies"}`,
);

const taxRec = computed(() => fire.householdTaxRecommendation.value);
const taxHeadline = computed(() => `${formatPercent(fire.fyTax.value.effectiveRate, 1)}`);
const taxSub = computed(() => `Recommended: ${taxRec.value.recommended === "OLD" ? "Old" : "New"} regime`);

// Financial Health card (Q21B 7th card)
const monthlyBurn = computed(() => {
  const recurring = household.data.expenses.recurring.reduce(
    (s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }),
    0,
  );
  return household.data.expenses.avgMonthly + recurring;
});
const liquidAssets = computed(() =>
  household.data.investments
    .filter(isEmergencyFundEligible)
    .reduce((s, i) => s + i.value, 0),
);
const emergencyMonths = computed(() =>
  monthlyBurn.value > 0 ? liquidAssets.value / monthlyBurn.value : 0,
);
const monthlyEMI = computed(() =>
  household.data.liabilities.reduce((s, l) => s + l.monthlyEMI, 0),
);
const dtiPercent = computed(() =>
  fire.monthlyTakeHome.value > 0 ? (monthlyEMI.value / fire.monthlyTakeHome.value) * 100 : 0,
);
const primaryIncome = computed(() => household.earners[0]?.salary?.annualCTC ?? 0);
const totalLifeCover = computed(() =>
  household.data.insurance.filter((p) => p.type === "Life").reduce((s, p) => s + p.sumAssured, 0),
);
const totalHealthCover = computed(() =>
  household.data.insurance.filter((p) => p.type === "Health").reduce((s, p) => s + p.sumAssured, 0),
);
const freedomScore = computed(() =>
  computeFreedomScore({
    savingsRatePercent: fire.savingsRate.value,
    dtiPercent: dtiPercent.value,
    hasIncome: fire.monthlyTakeHome.value > 0,
    emergencyMonths: emergencyMonths.value,
    lifeAdequate:
      primaryIncome.value > 0 && lifeCoverAdequacy(totalLifeCover.value, primaryIncome.value).status === "adequate",
    healthAdequate: healthCoverAdequacy(totalHealthCover.value, true).status === "adequate",
    fireProgressPercent: fire.progressPercent.value,
  }),
);
const healthHeadline = computed(() => `${freedomScore.value.score} / 100`);
const healthSub = computed(() => freedomScore.value.status);

const showEmpty = computed(() => household.members.length === 0);

// A5.x — household planning horizon (plan-to age − retirement age), shown
// read-only beside the hero. Drives the horizon-based SWR.
const planningHorizonYears = computed(() =>
  Math.max(0, fire.planToAge.value - fire.targetRetirementAge.value),
);

// A36 estate-readiness + A27.3 stress-test red-flags moved OUT of the header chips into
// the severity-coded suggestions (NudgeStack synthetic entries — Option-D decision 8).

// P3 (A30.1/A30.3): enrich the current month's snapshot with the live FIRE
// number + target year so the trajectory chart has a real point. Idempotent
// per period — replaces, never duplicates. The target year is today + the
// years-to-regular-FIRE estimate (used by the goal-post-shift detector).
onMounted(() => {
  if (household.members.length === 0) return;
  const years = fire.yearsToRegular.value;
  const targetYear = Number.isFinite(years)
    ? new Date().getFullYear() + Math.ceil(years)
    : undefined;
  // Net worth = FIRE corpus − liabilities (A29.x real net-worth trend series).
  const netWorth = fire.totalCorpus.value - fire.totalLiabilitiesValue.value;
  household.recordFireSnapshot(fire.fireNumber.value, targetYear, netWorth);
});
</script>

<template>
  <v-container fluid class="py-4 px-md-6">
    <div v-if="showEmpty" class="empty-state text-center py-12">
      <v-icon icon="mdi-fire" size="72" color="fire-orange" />
      <h2 class="text-h5 font-weight-bold mt-4 mb-2">Start your FIRE plan</h2>
      <p class="text-body-2 text-medium-emphasis mb-4">Add at least one earner to see your dashboard.</p>
      <v-btn color="primary" variant="flat" :to="{ name: 'wizard', params: { step: 'profile' } }">
        Open the wizard
      </v-btn>
    </div>

    <template v-else>
      <LeafPageHeader
        eyebrow="FIRE · Dashboard"
        title="FIRE Dashboard"
        description="Your whole FIRE picture at a glance — income, corpus, projection and every section in one view."
      >
        <template #actions>
          <v-btn
            variant="outlined"
            size="small"
            prepend-icon="mdi-pencil"
            :to="{ name: 'wizard', params: { step: 'profile' } }"
          >
            Edit profile
          </v-btn>
        </template>
      </LeafPageHeader>

      <!-- P5 (A5.x / A36) — horizon + estate-readiness chips beside the hero. -->
      <div class="d-flex flex-wrap ga-2 mb-2">
        <!-- gh #66: the FIRE headline is a whole-household figure (the #22/#23 honesty guardrail) —
             the badge makes explicit it does NOT change when viewing a single member. -->
        <WholeHouseholdBadge />
        <v-chip size="small" variant="tonal" color="primary" prepend-icon="mdi-timer-sand">
          Planning horizon: {{ planningHorizonYears }} yrs
          (retire @{{ fire.targetRetirementAge.value }} → plan-to {{ fire.planToAge.value }})
        </v-chip>
      </div>

      <!-- Option-D verdict hero: big age + confidence range + since-you-were-away delta
           (LifecycleDigestCard's diff, folded into the hero subline — the card is no longer
           mounted here; the hero carries the ?digest=open deep-link anchor) + the 3-slot
           KPI strip (vs-plan / corpus progress / biggest win). -->
      <FireHero />

      <!-- Honesty pair: is my money actually reachable when I need it? -->
      <v-row dense>
        <!-- #15 — accessible-money bridge (compact, #74/#76): honest verdict + the unlock
             timeline; links to Readiness for the full per-holding detail. Self-hides for a
             fully-liquid household. -->
        <v-col cols="12" md="6">
          <BridgeBreakdownCard variant="compact" class="h-100" />
        </v-col>
        <!-- #140 — layoff runway gauge: months of FULL obligations covered from post-tax
             liquid savings with zero income. -->
        <v-col cols="12" md="6">
          <RunwayCard class="h-100" />
        </v-col>
      </v-row>

      <!-- Accountability pair: am I tracking my plan, and what's my biggest move? -->
      <v-row dense>
        <!-- #138 — plan-vs-actual variance waterfall (progress / reality / goalpost). -->
        <v-col cols="12" md="6">
          <PlanVarianceCard class="h-100" />
        </v-col>
        <!-- #48 obj-2 — ranked accelerator impact bars + the save-more what-if. -->
        <v-col cols="12" md="6">
          <AccelerationCard class="h-100" />
        </v-col>
      </v-row>

      <!-- Milestone ladder: where the corpus sits vs Lean / Regular / Fat (+ Coast/Barista). -->
      <v-row dense>
        <v-col cols="12">
          <FireMilestonesCard />
        </v-col>
      </v-row>

      <v-row dense>
        <!-- #81 Phase 2 — household (primary) vs each adult's personal FIRE + the gap. -->
        <v-col cols="12" md="6">
          <IndividualFireCard class="h-100" />
        </v-col>
        <v-col cols="12" md="6">
          <AssetAllocationDonut class="h-100" />
        </v-col>
      </v-row>

      <!-- Family layer (sandwich-gen commitments) — self-hides without commitments; kept
           full-width (the Iyers tour anchors .family-layer-card). -->
      <v-row dense>
        <v-col cols="12">
          <FamilyLayerCard />
        </v-col>
      </v-row>

      <v-row dense>
        <v-col cols="12" md="8">
          <FireProjectionChart />
        </v-col>
        <!-- Severity-coded suggestions (incl. the relocated estate + stress entries). -->
        <v-col cols="12" md="4">
          <NudgeStack />
        </v-col>
      </v-row>

      <!-- P3 Stage (A30.3) — real FIRE-number trajectory from monthly snapshots. -->
      <v-row dense>
        <v-col cols="12">
          <FireTrajectoryChart />
        </v-col>
      </v-row>

      <div class="section-eyebrow">Sections at a glance</div>
      <v-row dense>
        <v-col cols="12" sm="6" md="4" lg="3">
          <SectionCard
            title="Income"
            icon="mdi-cash-multiple"
            color="success"
            :headline="incomeHeadline"
            :sub-line="incomeSub"
            route="/income/overview"
          />
        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3">
          <SectionCard
            title="Expenses"
            icon="mdi-cart-arrow-down"
            color="error"
            :headline="expensesHeadline"
            :sub-line="expensesSub"
            route="/expenses/overview"
          />
        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3">
          <SectionCard
            title="Investments"
            icon="mdi-trending-up"
            color="primary"
            :headline="investmentsHeadline"
            :sub-line="investmentsSub"
            route="/investments/overview"
          />
        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3">
          <SectionCard
            title="Liabilities"
            icon="mdi-bank"
            color="warning"
            :headline="liabilitiesHeadline"
            :sub-line="liabilitiesSub"
            route="/liabilities/overview"
          />
        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3">
          <SectionCard
            title="Insurance"
            icon="mdi-shield-check"
            :color="insuranceStatus === 'ok' ? 'success' : 'warning'"
            :headline="insuranceHeadline"
            :sub-line="insuranceSub"
            :status="insuranceStatus === 'ok' ? 'ok' : 'warn'"
            route="/insurance/overview"
          />
        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3">
          <SectionCard
            title="Tax"
            icon="mdi-calculator-variant"
            color="info"
            :headline="taxHeadline"
            :sub-line="taxSub"
            route="/tax-planning"
          />
        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3">
          <SectionCard
            title="Health"
            icon="mdi-heart-pulse"
            color="fire-orange"
            :headline="healthHeadline"
            :sub-line="healthSub"
            route="/financial-health"
          />
        </v-col>
      </v-row>

      <!-- Phase 7 Stage U — extended 4-claim trust pill. -->
      <TrustPill variant="footer" />
    </template>

    <!-- Phase 3 Stage H — Discovery footer: lists disabled features
         gating this route + a CTA to /preferences#features. The Dashboard
         route is not directly feature-gated, but the alsoShowKeys prop
         lets the footer surface dashboard-relevant features the user
         turned off (Coast/Barista/stress-test/estate). -->
    <DiscoveryFooter
      :also-show-keys="[
        'fire.coast',
        'fire.barista',
        'fire.stressTest',
        'estate.planning',
        'fire.healthcareBuffer',
        'family.parentsBucket',
        'family.educationTarget',
        'family.marriageEvent',
        'family.extendedContingency',
        'tax.sandwichGenNudges',
        'investments.international',
        'investments.reit',
        'investments.esop',
      ]"
    />

    <DemoTour />
  </v-container>
</template>

<style scoped>
.empty-state {
  margin-top: 6rem;
}
.trust-pill {
  background: var(--surface-muted);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
}
</style>

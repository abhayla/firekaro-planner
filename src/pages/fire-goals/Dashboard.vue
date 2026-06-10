<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFeaturesStore } from "@/stores/features";
import { useFireDerive } from "@/lib/useFireDerive";
import { runStressScenarios } from "@/lib/stress-test";
import { formatINRCompact, formatPercent } from "@/lib/formatters";
import { lifeCoverAdequacy, healthCoverAdequacy } from "@/lib/adequacy";
import { computeFreedomScore } from "@/lib/freedom-score";
import { toMonthly } from "@/lib/cashflow";
import { isEmergencyFundEligible } from "@/lib/investment-traits";
import FireHero from "@/components/dashboard/FireHero.vue";
import LifecycleDigestCard from "@/components/dashboard/LifecycleDigestCard.vue";
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

// A36.1/A36.2 — estate-readiness chip + red-flag. A high-asset household with a
// barely-started estate checklist is the highest-severity gap. Estate exposure
// is TOTAL assets (the home you bequeath counts), not the FIRE corpus which
// excludes the primary residence.
const ESTATE_TOTAL = 7;
const totalEstateAssets = computed(() =>
  household.data.investments.reduce((s, i) => s + i.value, 0),
);
const estateComplete = computed(
  () => (household.data.estateChecklist ?? []).filter((e) => e.completed).length,
);
const estateRedFlag = computed(
  () => totalEstateAssets.value > 10_000_000 && estateComplete.value < 4,
);

// A27.3 — stress-test red-flag chip: "Plan fails X of 10" → /fire-goals/stress-test.
// Shown only when the stress-test feature is enabled (else the route redirects).
const stressEnabled = computed(() => features.isEnabled("fire.stressTest"));
// gh #39 sibling: with no FIRE target (zero expenses) the stress test is meaningless —
// runStressScenarios on ₹0 reports scenarios as "survivable" (0 ≥ 0), so a brand-new
// zero-data user falsely sees "plan survives 9 of 10". Gate the chip on a real plan.
const hasFireTarget = computed(() => fire.fireNumber.value > 0);
const stressSummary = computed(() =>
  runStressScenarios({
    annualExpenses: fire.annualExpensesToday.value,
    swr: fire.effectiveSWR.value,
    expectedReturn: fire.blendedReturn.value,
    totalCorpus: fire.totalCorpus.value,
    annualIncomeTotal: fire.annualIncome.value.total,
  }).summary,
);

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
        <v-chip
          size="small"
          variant="tonal"
          :color="estateRedFlag ? 'error' : estateComplete === ESTATE_TOTAL ? 'success' : 'warning'"
          :prepend-icon="estateRedFlag ? 'mdi-alert' : 'mdi-file-document-check-outline'"
          :to="'/estate-planning'"
          data-testid="estate-chip"
        >
          Estate: {{ estateComplete }} of {{ ESTATE_TOTAL }} complete
          <template v-if="estateRedFlag">&nbsp;· corpus &gt; ₹1 Cr needs a will</template>
        </v-chip>
        <v-chip
          v-if="stressEnabled && hasFireTarget"
          size="small"
          variant="tonal"
          :color="stressSummary.failed === 0 ? 'success' : stressSummary.failed >= 4 ? 'error' : 'warning'"
          :prepend-icon="stressSummary.failed === 0 ? 'mdi-shield-check' : 'mdi-shield-alert'"
          :to="'/fire-goals/stress-test'"
          data-testid="stress-chip"
        >
          <template v-if="stressSummary.failed === 0">
            Stress test: plan survives all {{ stressSummary.total }}
          </template>
          <template v-else>
            Plan fails {{ stressSummary.failed }} of {{ stressSummary.total }} stress scenarios
          </template>
        </v-chip>
      </div>

      <!-- Tier-1 stickiness: "Since you were away" lifecycle digest — diffs the
           live derive() headline against the persisted baseline and surfaces the
           meaningful change FIRE-date-first. Self-hides when nothing meaningful
           changed (or no baseline yet). Deep-link target for the WhatsApp nudge. -->
      <LifecycleDigestCard />

      <FireHero />

      <!-- #81 Phase 2 — household (primary) vs each adult's standalone personal FIRE + the gap,
           with the honesty caveat. Placed right under the headline so the household number is
           never confused with a rosier individual figure. -->
      <IndividualFireCard class="mt-4" />

      <!-- #15 — accessible-money bridge (compact on the dashboard, #74/#76): keeps the honest
           verdict + spendable/locked bar + bridge-income, and links to Readiness for the full
           unlock-timeline + "what we assumed" detail. Self-hides for a fully-liquid household. -->
      <BridgeBreakdownCard variant="compact" />

      <!-- #140 — job-loss / layoff runway: months the household could survive with ZERO income
           from POST-TAX liquid savings against the FULL obligation burn (living + EMI + premiums).
           Optionality/safety framing, placed right after the bridge (early-FIRE liquidity) since
           both answer "is my money actually reachable when I need it?" -->
      <RunwayCard />

      <!-- #138 — plan-vs-actual variance: lock a baseline, then see the HONEST delta since,
           decomposed into progress (corpus) / reality (expenses) / goalpost (assumption changes).
           Placed after the runway so the "am I tracking my plan?" accountability sits with the
           other honesty surfaces, before the accelerators. -->
      <PlanVarianceCard />

      <!-- #48 obj-2 — "your biggest achievable wins": ranked accelerators (years sooner) for THIS
           household, the risk-notch with a confidence range, + a live save-more what-if. The
           get-there-faster surface, placed number → honesty(bridge) → how-to-accelerate → nudges. -->
      <AccelerationCard />

      <!-- Phase 4 Stage I — audit-mandated dashboard additions -->
      <NudgeStack />
      <FireMilestonesCard />
      <FamilyLayerCard />

      <v-row dense>
        <v-col cols="12" md="8">
          <FireProjectionChart />
        </v-col>
        <v-col cols="12" md="4">
          <AssetAllocationDonut />
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

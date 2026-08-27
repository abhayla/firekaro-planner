<script setup lang="ts">
/**
 * T-378 (QN-1 result + QN-4) — what the express path shows once the ten cards are answered.
 *
 * The headline, the need / have / gap / do-this tiles, the retirement-age slider and the gut-feel
 * line are NOT re-implemented here: this screen renders the very same `<FireHero />` the dashboard
 * shows (T-377). That is what makes "the quick result and the dashboard agree" true by construction
 * rather than by a test (rule 26) — there is exactly one hero in the product.
 *
 * The lever card ("how to get there — pick your moves") is stage QN-5 and lands in this slot next.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import FireHero from "@/components/dashboard/FireHero.vue";
import QuickExplainer from "@/components/quick/QuickExplainer.vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { requiredMonthlyContributionFor } from "@/lib/required-contribution";
import {
  FULL_PLANNER_ADDS,
  PLAN_HONESTY_LINE,
  QUICK_PORTFOLIO_CAVEAT,
} from "@/lib/quick-number-copy";
import { formatINRCompact } from "@/lib/formatters";
import type { QuickAnswers } from "@/types/quick-number";

const props = defineProps<{ answers: QuickAnswers }>();
defineEmits<{ (e: "edit"): void }>();

const fire = useFireDerive();
const h = useHouseholdStore();
const a = useAssumptionsStore();
const ui = useUiStore();

const req = computed(() => fire.requiredContribution.value);

/**
 * "What you'll have vs what you'll need · today's money" — six sampled retirement ages, each a full
 * solver run through `derive()`. Six (not one per year) is deliberate: each point costs a kernel
 * bisection, and the shape of the two curves is the message, not the resolution.
 */
const CHART_POINTS = 6;
const chart = computed(() => {
  const anchor = req.value.anchorAgeUsed;
  const target = fire.heroTargetAge.value;
  const from = Math.max(anchor + 1, Math.min(target - 6, 70));
  const to = Math.max(from + 5, target + 6);
  const lens = {
    isFamilyView: ui.isFamilyView,
    viewingMemberId: ui.viewingMemberId,
    currentFY: ui.currentFY,
  };
  const step = (to - from) / (CHART_POINTS - 1);
  const points = Array.from({ length: CHART_POINTS }, (_, i) => {
    const age = Math.round(from + i * step);
    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens,
      targetAge: age,
    });
    return { age, need: Math.max(0, r.needReal), have: Math.max(0, r.haveAtTargetReal) };
  });
  const max = Math.max(1, ...points.map((p) => Math.max(p.need, p.have)));
  const W = 600;
  const H = 170;
  const P = 24;
  const x = (i: number) => P + (i / (CHART_POINTS - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (k: "need" | "have") =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const targetIndex = points.reduce(
    (best, p, i) => (Math.abs(p.age - target) < Math.abs(points[best].age - target) ? i : best),
    0,
  );
  return {
    points,
    need: line("need"),
    have: line("have"),
    targetX: x(targetIndex),
    first: points[0].age,
    last: points[points.length - 1].age,
    W,
    H,
    P,
  };
});

const showChart = computed(() => req.value.hasTarget && req.value.needReal > 0);

const answerRows = computed(() => {
  const q = props.answers;
  const money = (v: number | undefined) => (v && v > 0 ? formatINRCompact(v) : "—");
  return [
    ["Gut feel", money(q.guess)],
    ["Age → retire at", `${q.age} → ${q.targetAge}`],
    ["Spend / month (excl. EMI)", money(q.spend)],
    ["Take-home / month", money(q.income)],
    ["All investments", money(q.corpus)],
    ["Spouse investments", q.includeSpouse ? money(q.spouseCorpus) : "—"],
    ["Investing / month", money(q.sip)],
    ["Kids", q.kids ? `${q.kids} · age ${q.kidsAge ?? 0}` : "—"],
    [
      "Education · post-grad · weddings",
      `${money(q.education)} · ${money(q.postgrad)} · ${money(q.wedding)}`,
    ],
    ["Big purchase", q.includeHouse ? money(q.house) : "—"],
    [
      "Home loan",
      q.hasLoan && q.emi
        ? `${money(q.emi)}/mo @ ${((q.loanRate ?? 0) * 100).toFixed(1)}%, ${q.loanYearsLeft ?? 0} yrs`
        : "—",
    ],
  ] as const;
});
</script>

<template>
  <div class="quick-result" data-testid="quick-result">
    <FireHero />

    <p class="text-caption text-medium-emphasis mt-3 mb-4" data-testid="quick-honesty-line">
      {{ PLAN_HONESTY_LINE }}
    </p>

    <!-- The express path collapses every holding into one equity line to stay at ten cards. That
         makes the projection optimistic for anyone holding PF/PPF/FD money, so it is stated on the
         screen rather than buried (FinTech review HIGH 3/4). -->
    <v-alert
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      data-testid="quick-portfolio-caveat"
    >
      {{ QUICK_PORTFOLIO_CAVEAT }}
    </v-alert>

    <QuickExplainer />

    <v-card v-if="showChart" variant="outlined" class="pa-6 mt-4" data-testid="quick-chart-card">
      <h3 class="text-subtitle-1 font-weight-bold font-display mb-3">
        What you'll have vs what you'll need · today's money
      </h3>
      <svg
        class="quick-chart"
        :viewBox="`0 0 ${chart.W} ${chart.H}`"
        preserveAspectRatio="none"
        role="img"
        aria-label="Projected corpus against the FIRE number, by retirement age"
      >
        <polyline :points="chart.need" fill="none" stroke="#b45309" stroke-width="2.5" />
        <polyline :points="chart.have" fill="none" stroke="#2F5BFF" stroke-width="2.5" />
        <line
          :x1="chart.targetX"
          :x2="chart.targetX"
          :y1="chart.P"
          :y2="chart.H - chart.P"
          stroke="#94a3b8"
          stroke-dasharray="4 4"
        />
      </svg>
      <div class="text-caption text-medium-emphasis d-flex justify-space-between">
        <span>age {{ chart.first }}</span>
        <span>
          <span style="color: #2f5bff">■</span> have ·
          <span style="color: #b45309">■</span> need · dashed = your target
        </span>
        <span>age {{ chart.last }}</span>
      </div>
    </v-card>

    <v-card variant="outlined" class="pa-6 mt-4">
      <h3 class="text-subtitle-1 font-weight-bold font-display mb-3">What the full planner adds</h3>
      <ul class="quick-result__list">
        <li v-for="(line, i) in FULL_PLANNER_ADDS" :key="i" class="text-body-2 mb-2">{{ line }}</li>
      </ul>
    </v-card>

    <v-card variant="outlined" class="pa-4 mt-4">
      <v-expansion-panels variant="accordion" flat>
        <v-expansion-panel data-testid="quick-answers-panel">
          <v-expansion-panel-title>Your answers — tap to change</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="quick-result__rows">
              <template v-for="[k, v] in answerRows" :key="k">
                <span class="text-body-2 text-medium-emphasis">{{ k }}</span>
                <b class="text-body-2 text-currency">{{ v }}</b>
              </template>
            </div>
            <v-btn
              variant="outlined"
              class="mt-4"
              data-testid="quick-edit-answers"
              @click="$emit('edit')"
            >
              Edit answers
            </v-btn>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card>

    <v-card variant="outlined" class="pa-6 mt-4 quick-result__cta">
      <div>
        <b>Happy with the shape?</b>
        <div class="text-caption text-medium-emphasis">
          Refine income, investments, insurance and taxes in the full planner. Your answers carry over.
        </div>
      </div>
      <v-btn
        color="primary"
        variant="flat"
        :to="{ name: 'fire-dashboard' }"
        data-testid="quick-open-planner"
      >
        Open full planner
        <v-icon icon="mdi-arrow-right" class="ml-1" />
      </v-btn>
    </v-card>

    <div class="text-center mt-4">
      <RouterLink class="text-caption" :to="{ name: 'wizard', params: { step: 'profile' } }">
        Refine your plan in the seven-step wizard
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.quick-chart {
  width: 100%;
  height: 170px;
}
.quick-result__list {
  padding-left: 1.1rem;
}
.quick-result__rows {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 14px;
}
.quick-result__cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
</style>

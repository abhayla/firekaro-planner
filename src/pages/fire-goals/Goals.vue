<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import EmptyState from "@/components/shared/EmptyState.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import PanelCard from "@/components/shared/PanelCard.vue";

const household = useHouseholdStore();
const assumptions = useAssumptionsStore();
const fire = useFireDerive();

interface GoalCard {
  id: string;
  label: string;
  targetYear: number;
  todayAmount: number;
  inflatedAmount: number;
  progressPercent: number; // 0-100; for life-event goals it's "years elapsed of total runway"
  category: "retirement" | "life-event";
  icon: string;
  color: string;
  note?: string;
}

function inflatedAt(amount: number, year: number): number {
  const yrs = Math.max(0, year - new Date().getFullYear());
  return Math.round(amount * Math.pow(1 + assumptions.values.inflation, yrs));
}

const retirementCard = computed<GoalCard>(() => {
  const targetYear = new Date().getFullYear() + (Number.isFinite(fire.yearsToRegular.value) ? Math.ceil(fire.yearsToRegular.value) : 30);
  return {
    id: "retirement",
    label: `Retirement at age ${fire.targetRetirementAge.value}`,
    targetYear,
    todayAmount: fire.fireNumber.value,
    inflatedAmount: fire.fireNumber.value, // FIRE number is already in today's ₹; the projection handles inflation separately
    progressPercent: fire.progressPercent.value,
    category: "retirement",
    icon: "mdi-beach",
    color: "fire-orange",
    note: `${fire.progressPercent.value}% there · current corpus ${formatINRCompact(fire.totalCorpus.value)}`,
  };
});

const lifeEventCards = computed<GoalCard[]>(() => {
  const currentYear = new Date().getFullYear();
  return household.data.expenses.plannedFuture.map((p) => {
    const totalYears = Math.max(1, p.targetYear - currentYear);
    const yearsElapsed = Math.max(0, currentYear - (currentYear - 0)); // 0 — fresh start
    const progress = Math.round((yearsElapsed / totalYears) * 100);
    return {
      id: p.id,
      label: p.label,
      targetYear: p.targetYear,
      todayAmount: p.todayAmount,
      inflatedAmount: inflatedAt(p.todayAmount, p.targetYear),
      progressPercent: progress,
      category: "life-event",
      icon: "mdi-target",
      color: "primary",
      note: p.isMultiYear ? `Spans ${p.durationYears} years from ${p.targetYear}` : undefined,
    };
  });
});

const allGoals = computed<GoalCard[]>(() => [retirementCard.value, ...lifeEventCards.value].sort((a, b) => a.targetYear - b.targetYear));
</script>

<template>
  <v-container fluid class="py-6 goals-page">
    <LeafPageHeader
      eyebrow="FIRE · Goals"
      title="Life-event Goals"
    />
    <p class="text-body-2 text-medium-emphasis mb-6" style="max-width: 760px; margin-top: -16px">
      Roadmap of every major financial event. Retirement is auto-included from your FIRE math.
      Other goals come from <router-link to="/expenses/planned">Expenses → Planned</router-link> — same data, two views.
    </p>

    <v-row dense>
      <v-col v-for="g in allGoals" :key="g.id" cols="12" sm="6" md="4">
        <PanelCard :title="g.label" :icon="g.icon" :icon-color="g.color" class="h-100">
          <div class="text-caption text-medium-emphasis mb-3 font-mono">Target · {{ g.targetYear }}</div>
          <div class="d-flex justify-space-between mb-1">
            <span class="text-caption text-medium-emphasis">Today's ₹</span>
            <span class="font-weight-medium text-currency">{{ formatINRCompact(g.todayAmount) }}</span>
          </div>
          <div class="d-flex justify-space-between mb-3">
            <span class="text-caption text-medium-emphasis">Inflated to target</span>
            <span class="font-weight-medium text-currency">{{ formatINRCompact(g.inflatedAmount) }}</span>
          </div>
          <v-progress-linear
            :model-value="g.progressPercent"
            :color="g.color"
            height="8"
            rounded
          />
          <div class="d-flex justify-space-between align-center mt-2">
            <span class="text-caption text-medium-emphasis" v-if="g.note">{{ g.note }}</span>
            <span class="text-caption font-mono font-weight-bold" :class="`text-${g.color}`">
              {{ g.progressPercent }}%
            </span>
          </div>
        </PanelCard>
      </v-col>
    </v-row>

    <EmptyState
      v-if="lifeEventCards.length === 0"
      class="mt-5"
      icon="mdi-flag-checkered"
      title="Only the auto-Retirement card is showing"
      copy="Add weddings, college, sabbaticals, big trips, or anything else that needs corpus — they'll all roll into this roadmap and your FIRE math automatically."
      cta-label="Add a planned expense"
      cta-route="/expenses/planned"
    />
  </v-container>
</template>

<style scoped>
.goals-page {
  max-width: 1280px;
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import { buildDonutSegments } from "@/lib/donut";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import StatDashboard, { type KpiTile } from "@/components/income-layout/StatDashboard.vue";
import RankedBars, { type RankedBar } from "@/components/income-layout/RankedBars.vue";
import IncomeVsExpenses from "@/components/charts/IncomeVsExpenses.vue";
import EmptyState from "@/components/shared/EmptyState.vue";

const household = useHouseholdStore();

// Whole-household income buckets — un-lensed so this roll-up agrees with the
// Salary / Business / Other Sources screens and the store aggregate (Rule 26).
// The viewing lens is a FIRE-dashboard concern, not an income roll-up one.
const income = computed(() => household.totalAnnualIncome);
const salaryTotal = computed(() => income.value.salaryIncome);
const businessTotal = computed(() => income.value.businessShare);
const otherTotal = computed(() => income.value.otherTaxable + income.value.otherExempt);
const otherExempt = computed(() => income.value.otherExempt);
const grandTotal = computed(() => income.value.total);

interface SourceBucket {
  key: string;
  label: string;
  amount: number;
  color: string;
  icon: string;
}
// Ranked, zero buckets skipped.
const sourceBuckets = computed<SourceBucket[]>(() =>
  [
    { key: "salary", label: "Salary", amount: salaryTotal.value, color: "success", icon: "mdi-account-tie" },
    { key: "business", label: "Business", amount: businessTotal.value, color: "warning", icon: "mdi-briefcase-outline" },
    { key: "other", label: "Other sources", amount: otherTotal.value, color: "info", icon: "mdi-cash-multiple" },
  ]
    .filter((b) => b.amount > 0)
    .sort((a, b) => b.amount - a.amount),
);

const kpis = computed<KpiTile[]>(() => {
  const tiles: KpiTile[] = [
    {
      eyebrow: "Total household · per year",
      value: formatINRCompact(grandTotal.value),
      accent: true,
      meta: `${household.earners.length} ${household.earners.length === 1 ? "earner" : "earners"}`,
    },
    { eyebrow: "Salary", value: formatINRCompact(salaryTotal.value) },
    { eyebrow: "Business", value: formatINRCompact(businessTotal.value) },
    {
      eyebrow: "Other sources",
      value: formatINRCompact(otherTotal.value),
      meta: otherExempt.value > 0 ? `${formatINRCompact(otherExempt.value)} tax-exempt` : undefined,
    },
  ];
  return tiles;
});

const donutSegments = computed(() =>
  buildDonutSegments(
    sourceBuckets.value.map((b) => ({ key: b.key, value: b.amount, color: b.color })),
    grandTotal.value,
  ),
);

const rankedBars = computed<RankedBar[]>(() =>
  sourceBuckets.value.map((b) => ({
    key: b.key,
    label: b.label,
    amount: formatINRCompact(b.amount),
    share: grandTotal.value > 0 ? (b.amount / grandTotal.value) * 100 : 0,
    color: b.color,
    icon: b.icon,
  })),
);
</script>

<template>
  <v-container fluid class="py-6 income-overview">
    <LeafPageHeader
      eyebrow="Income · Overview"
      title="Income overview"
      description="Household income at a glance. Drill into Salary, Business, or Other Sources to edit individual lines."
    />

    <StatDashboard
      :kpis="kpis"
      :donut-segments="donutSegments"
      donut-eyebrow="By source"
      donut-center-eyebrow="Total / yr"
      :donut-center-value="formatINRCompact(grandTotal)"
      viz-eyebrow="By source · ranked"
    >
      <template #viz>
        <RankedBars :bars="rankedBars" />
      </template>
    </StatDashboard>

    <div class="section-eyebrow">Income vs expenses</div>
    <IncomeVsExpenses :months="12" class="mb-6" />

    <div class="section-eyebrow">Per-earner breakdown</div>
    <v-card variant="outlined">
      <v-table v-if="household.earners.length > 0" density="compact">
        <thead>
          <tr>
            <th>Earner</th>
            <th class="text-right">Annual CTC</th>
            <th class="text-right">Hike %</th>
            <th>Target retirement</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in household.earners" :key="m.id">
            <td>{{ m.name }}</td>
            <td class="text-right text-currency">{{ formatINRCompact(m.salary?.annualCTC ?? 0) }}</td>
            <td class="text-right font-mono">{{ m.salary?.hikePercent ?? 8 }}%</td>
            <td class="font-mono">age {{ m.targetRetirementAge ?? "—" }}</td>
          </tr>
        </tbody>
      </v-table>
      <EmptyState
        v-else
        icon="mdi-account-tie-outline"
        title="No earners on file"
        copy="Add at least one earner in Profile to populate salary, employer details, and your savings rate. Without earners, Tax + FIRE projections won't compute."
      />
    </v-card>
  </v-container>
</template>

<style scoped>
.income-overview { max-width: 1280px; }
/* .section-eyebrow is now a global utility in tokens.css (Screen Standard §5) */
</style>

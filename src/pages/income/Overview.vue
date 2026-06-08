<script setup lang="ts">
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { toAnnual } from "@/lib/cashflow";
import { formatINRCompact } from "@/lib/formatters";
import { buildDonutSegments } from "@/lib/donut";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import StatDashboard, { type KpiTile } from "@/components/income-layout/StatDashboard.vue";
import RankedBars, { type RankedBar } from "@/components/income-layout/RankedBars.vue";
import IncomeVsExpenses from "@/components/charts/IncomeVsExpenses.vue";
import EmptyState from "@/components/shared/EmptyState.vue";

const fire = useFireDerive();

// gh #66: income roll-up buckets are member-lensed so this overview agrees with the (now also
// lensed) Salary / Business / Other Sources screens under a viewing lens. On the default
// "Whole household" view the lensed collections equal the full set, so this is byte-identical to
// the un-lensed roll-up. Salary is summed from the lensed earner roster; business/other from the
// lensed collections — keeping all income screens coherent for the selected member.
const salaryTotal = computed(() =>
  fire.lensedEarners.value.reduce((s, m) => s + (m.salary?.annualCTC ?? 0), 0),
);
// gh #66 coherence: count ALL businesses' profit (no isOperated filter) — matching the kernel's
// businessShare (derive.ts) so this Overview grand-total equals householdAnnualIncome / the cashflow
// + financial-health income on the default lens. A passive entity's distributed profit IS income.
const businessTotal = computed(() =>
  fire.lensedBusinesses.value.reduce(
    (s, b) => s + toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100),
    0,
  ),
);
const otherExempt = computed(() =>
  fire.lensedOtherIncome.value
    .filter((o) => o.isTaxExempt)
    .reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0),
);
const otherTotal = computed(() =>
  fire.lensedOtherIncome.value.reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0),
);
const grandTotal = computed(() => salaryTotal.value + businessTotal.value + otherTotal.value);

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
      meta: `${fire.lensedEarners.value.length} ${fire.lensedEarners.value.length === 1 ? "earner" : "earners"}`,
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
      <v-table v-if="fire.lensedEarners.value.length > 0" density="compact">
        <thead>
          <tr>
            <th>Earner</th>
            <th class="text-right">Annual CTC</th>
            <th class="text-right">Hike %</th>
            <th>Target retirement</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in fire.lensedEarners.value" :key="m.id">
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

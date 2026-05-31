<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import { allocationByAge } from "@/lib/adequacy";
import { assetClass } from "@/lib/investment-traits";
import AssetAllocationDonut from "@/components/dashboard/AssetAllocationDonut.vue";
import EmptyState from "@/components/shared/EmptyState.vue";
import NpsPlanningCard from "@/components/investments/NpsPlanningCard.vue";
import EpfVpfThresholdCard from "@/components/investments/EpfVpfThresholdCard.vue";
import DiscoveryFooter from "@/components/shared/DiscoveryFooter.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import MetricCard from "@/components/shared/MetricCard.vue";
import ProportionBar, { type ProportionSegment } from "@/components/shared/ProportionBar.vue";

const household = useHouseholdStore();
const fire = useFireDerive();

interface ClassRollup {
  label: string;
  value: number;
  cssColor: string;
}

const rollup = computed<ClassRollup[]>(() => {
  const buckets = {
    equity: 0,
    debt: 0,
    realEstate: 0,
    gold: 0,
    cashOther: 0,
  };
  for (const inv of household.data.investments) {
    switch (assetClass(inv)) {
      case "equity":
        buckets.equity += inv.value;
        break;
      case "debt":
        buckets.debt += inv.value;
        break;
      case "realEstate":
        buckets.realEstate += inv.value;
        break;
      case "gold":
        buckets.gold += inv.value;
        break;
      case "alternative":
        // REIT + Crypto + (ESOP routes to equity via assetClass) — bucket
        // under Cash & Other for v4-faithful 5-bin display.
        buckets.cashOther += inv.value;
        break;
    }
  }
  return [
    { label: "Equity", value: buckets.equity, cssColor: "var(--color-primary)" },
    { label: "Debt", value: buckets.debt, cssColor: "var(--color-info)" },
    { label: "Real Estate", value: buckets.realEstate, cssColor: "var(--color-warning)" },
    { label: "Gold", value: buckets.gold, cssColor: "#d97706" },
    { label: "Cash & Other", value: buckets.cashOther, cssColor: "var(--color-gray-500)" },
  ];
});

const totalCorpus = computed(() => fire.totalCorpus.value);
const equityValue = computed(() => rollup.value.find((r) => r.label === "Equity")?.value ?? 0);
const allocStatus = computed(() => allocationByAge(fire.anchorAge.value, equityValue.value, totalCorpus.value));

const noHoldings = computed(() => household.data.investments.length === 0);

const allocationSegments = computed<ProportionSegment[]>(() =>
  rollup.value
    .filter((r) => r.value > 0)
    .map((r) => ({ key: r.label, label: r.label, value: r.value, color: r.cssColor })),
);
</script>

<template>
  <v-container fluid class="py-6 investments-overview">
    <LeafPageHeader
      eyebrow="Investments · Overview"
      title="Investments"
      description="Portfolio at a glance. Use Holdings to add or edit individual instruments."
    />

    <EmptyState
      v-if="noHoldings"
      icon="mdi-chart-arc"
      title="No investments tracked yet"
      copy="Add equity, mutual funds, EPF/PPF/NPS, real estate, gold, or crypto on Holdings to see your full corpus, asset allocation, and FIRE projection."
      cta-label="Open Holdings"
      cta-route="/investments/holdings"
    />

    <v-row v-else dense>
      <v-col cols="12" md="8">
        <v-card variant="outlined" class="pa-4 mb-3 hero-corpus interactive-card">
          <div class="d-flex align-start justify-space-between">
            <div>
              <div class="hero-corpus__label">Total corpus</div>
              <div class="hero-corpus__value text-currency">{{ formatINRCompact(totalCorpus) }}</div>
              <v-chip
                :color="allocStatus.status === 'adequate' ? 'success' : 'warning'"
                size="small"
                variant="tonal"
                class="mt-2"
              >
                {{ allocStatus.message }}
              </v-chip>
            </div>
          </div>
          <div class="section-eyebrow" style="margin: 18px 0 8px">Allocation</div>
          <ProportionBar :segments="allocationSegments" :format-value="formatINRCompact" :height="12" />
        </v-card>

        <v-row dense>
          <v-col cols="12" sm="6" md="6" lg="4" v-for="r in rollup" :key="r.label">
            <MetricCard
              :label="r.label"
              :value="formatINRCompact(r.value)"
              :footnote="totalCorpus > 0 ? `${Math.round((r.value / totalCorpus) * 100)}% of portfolio` : undefined"
              min-height="142px"
            />
          </v-col>
        </v-row>
      </v-col>
      <v-col cols="12" md="4">
        <AssetAllocationDonut />
      </v-col>
    </v-row>

    <!-- Phase 4 Stage K — instrument-specific audit-grounded cards. -->
    <NpsPlanningCard />
    <EpfVpfThresholdCard />

    <DiscoveryFooter
      :also-show-keys="[
        'investments.international',
        'investments.reit',
        'investments.esop',
        'investments.scss',
        'investments.sukanya',
      ]"
    />
  </v-container>
</template>

<style scoped>
.investments-overview {
  max-width: 1280px;
}

.hero-corpus__value {
  font-size: var(--type-3xl);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin-top: 4px;
}

.hero-corpus__label {
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  font-weight: var(--weight-semibold);
}
</style>

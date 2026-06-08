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
  // gh #66/#27: the rollup AND the corpus hero below BOTH read the lensed investment set, so under a
  // member lens the portfolio hero, the allocation bars, and the home-exclusion footnote all describe
  // the SAME (member-scoped) holdings. On the default "Whole household" lens lensedInvestments === the
  // full set, so this is byte-identical to the household corpus. (Previously the hero used the
  // household-invariant fire.totalCorpus while the bars lensed — a hero-vs-bars scope mismatch.)
  for (const inv of fire.lensedInvestments.value) {
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

// gh #66 coherence: the investments-Overview "FIRE corpus" hero is the LENSED portfolio (primary
// residence excluded — it can't fund early retirement), so it matches the lensed allocation bars
// under a member lens. On the default lens this equals fire.totalCorpus (householdScope, also
// primary-residence-excluded), so the whole-household display is byte-identical.
const totalCorpus = computed(() =>
  fire.lensedInvestments.value
    .filter((i) => !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence"))
    .reduce((s, i) => s + i.value, 0),
);
// All-holdings total (incl. the primary residence that the FIRE corpus excludes). The per-class
// footnote % MUST divide by THIS (what the rollup shows), not totalCorpus — else the numerator
// (incl. home) and denominator (excl. home) disagree and the percentages exceed 100%. gh-issue #27.
const rollupTotal = computed(() => rollup.value.reduce((s, r) => s + r.value, 0));
const homeExcludedFromCorpus = computed(() => Math.max(0, rollupTotal.value - totalCorpus.value));
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
              <div class="hero-corpus__label">FIRE corpus</div>
              <div class="hero-corpus__value text-currency">{{ formatINRCompact(totalCorpus) }}</div>
              <div v-if="homeExcludedFromCorpus > 0" class="hero-corpus__sublabel">
                Excludes your home ({{ formatINRCompact(homeExcludedFromCorpus) }}) — it can't fund
                early retirement. All holdings below total {{ formatINRCompact(rollupTotal) }}.
              </div>
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
          <div class="section-eyebrow" style="margin: 18px 0 8px">Allocation — all holdings</div>
          <ProportionBar :segments="allocationSegments" :format-value="formatINRCompact" :height="12" />
        </v-card>

        <v-row dense>
          <v-col cols="12" sm="6" md="6" lg="4" v-for="r in rollup" :key="r.label">
            <MetricCard
              :label="r.label"
              :value="formatINRCompact(r.value)"
              :footnote="rollupTotal > 0 ? `${Math.round((r.value / rollupTotal) * 100)}% of holdings` : undefined"
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

.hero-corpus__sublabel {
  font-size: var(--type-xs);
  color: var(--text-secondary);
  line-height: var(--leading-snug);
  margin-top: 6px;
  max-width: 52ch;
}
</style>

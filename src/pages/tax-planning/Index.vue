<script setup lang="ts">
import { computed, ref } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useUiStore } from "@/stores/ui";
import { computeTax } from "@/lib/tax";
import { toAnnual } from "@/lib/cashflow";
import { formatINRCompact, formatPercent, formatINR } from "@/lib/formatters";
import {
  deriveDeductions,
  isInMarginalReliefBand,
  marginalReliefMitigations,
  LIMIT_80C,
  LIMIT_80CCD_1B,
  LIMIT_80D_SELF,
  LIMIT_80D_PARENTS,
  LIMIT_SECTION_24,
} from "@/lib/tax-deductions";
import { buildDonutSegments } from "@/lib/donut";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import StatDashboard, { type KpiTile } from "@/components/income-layout/StatDashboard.vue";
import RankedBars, { type RankedBar } from "@/components/income-layout/RankedBars.vue";
import DiscoveryFooter from "@/components/shared/DiscoveryFooter.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import ProportionBar, { type ProportionSegment } from "@/components/shared/ProportionBar.vue";
import LimitMeter from "@/components/shared/LimitMeter.vue";
import TaxCliffChart from "@/components/charts/TaxCliffChart.vue";

const household = useHouseholdStore();
const ui = useUiStore();

type RegimeMode = "AUTO" | "OLD" | "NEW";
const mode = ref<RegimeMode>("AUTO");

// Recommend the regime that is actually cheaper under THIS screen's
// audit-grounded deductions (deriveDeductions: 80C + 80CCD(1B) + 80D + Sec 24).
// Defined below `oldResult`/`newResult`; referenced lazily so the order is safe.
const effectiveRegime = computed<"OLD" | "NEW">(() => {
  if (mode.value === "AUTO") return pageRecommended.value;
  return mode.value;
});

// Income consolidation
type IncomeRow = { label: string; amount: number; isTaxable: boolean; icon: string; color: string };
const OTHER_INCOME_VIS: Record<string, { icon: string; color: string }> = {
  Rental: { icon: "mdi-home-city-outline", color: "warning" },
  Dividend: { icon: "mdi-chart-line", color: "info" },
  Interest: { icon: "mdi-bank-outline", color: "info" },
};
const incomeRows = computed<IncomeRow[]>(() => {
  const rows: IncomeRow[] = [];
  for (const m of household.earners) {
    if (m.salary?.annualCTC) {
      rows.push({
        label: `Salary — ${m.name || "Earner"}`,
        amount: m.salary.annualCTC,
        isTaxable: true,
        icon: "mdi-cash-multiple",
        color: "success",
      });
    }
  }
  for (const b of household.data.businesses) {
    const annual = toAnnual({ amount: b.annualProfit, period: b.frequency });
    const share = annual * (b.sharePercent / 100);
    const exemptKinds: string[] = ["LLP", "Partnership", "HUF"];
    rows.push({
      label: `Business — ${b.name} (${b.legalKind})`,
      amount: share,
      isTaxable: !exemptKinds.includes(b.legalKind),
      icon: "mdi-domain",
      color: "primary",
    });
  }
  for (const o of household.data.otherIncome) {
    const annual = toAnnual({ amount: o.amount, period: o.frequency });
    const vis = OTHER_INCOME_VIS[o.type] ?? { icon: "mdi-cash", color: "info" };
    rows.push({
      label: `${o.type} — ${o.label || (o.sourceEntityId ? household.data.businesses.find((b) => b.id === o.sourceEntityId)?.name : "Direct")}`,
      amount: annual,
      isTaxable: !o.isTaxExempt,
      icon: vis.icon,
      color: vis.color,
    });
  }
  return rows;
});

// Phase 4 Stage J — replace v4's hardcoded `150000 + 25000` dummy with the
// audit-grounded auto-deductions derivation (audit Entry #12 A12.2).
const derivedDeductions = computed(() => deriveDeductions(household.data));

const totalTaxable = computed(() =>
  incomeRows.value.filter((r) => r.isTaxable).reduce((s, r) => s + r.amount, 0),
);

// Phase 4 Stage J — marginal-relief band detection (audit Entry #13 A13.2-4).
const marginalReliefActive = computed(() => {
  const taxableIncome =
    totalTaxable.value - derivedDeductions.value.totalDeductions - derivedDeductions.value.section80CCD2;
  return isInMarginalReliefBand(taxableIncome, ui.currentFY);
});
const marginalReliefSuggestions = computed(() => {
  const taxableIncome =
    totalTaxable.value - derivedDeductions.value.totalDeductions - derivedDeductions.value.section80CCD2;
  return marginalReliefMitigations(taxableIncome, ui.currentFY);
});

// Decision rule-of-thumb (audit Entry #12 A12.5), corrected to the research rule:
//   deductions ≥ ₹5L  → OLD regime usually wins (deduction value beats the
//                        lower new-regime slabs)
//   income     > ₹50L  → NEW regime usually wins (its surcharge is capped lower,
//                        and the deductions rarely close the gap at that income)
//   otherwise          → compute-and-compare (neither rule-of-thumb dominates;
//                        the recommendation comes from the actual totals below)
// The headline recommendation always comes from the computed comparison; this is
// only the plain-language heuristic shown alongside it.
const decisionRuleMessage = computed(() => {
  const ded = derivedDeductions.value.totalDeductions;
  const income = totalTaxable.value;
  const k = (n: number) => Math.round(n / 100_000);
  if (ded >= 500_000) {
    return `Your ₹${k(ded)}L of deductions clears the ₹5L mark — at this level the OLD regime almost always wins, as the deduction value exceeds the NEW regime's lower-slab advantage. (Confirm against the computed comparison below.)`;
  }
  if (income > 5_000_000) {
    return `Income above ₹50L usually favours the NEW regime — its surcharge is capped lower and ₹${k(ded)}L of deductions rarely closes the gap at this income. (Confirm against the computed comparison below.)`;
  }
  return `Income ₹${k(income)}L with ₹${k(ded)}L deductions sits in the compute-and-compare zone — neither rule-of-thumb dominates, so the recommendation below comes from the actual computed totals.`;
});
const totalExempt = computed(() =>
  incomeRows.value.filter((r) => !r.isTaxable).reduce((s, r) => s + r.amount, 0),
);

const oldResult = computed(() =>
  computeTax({
    grossIncome: totalTaxable.value,
    regime: "OLD",
    fy: ui.currentFY,
    deductions: derivedDeductions.value.totalDeductions,
    employerNps: derivedDeductions.value.section80CCD2,
  }),
);
const newResult = computed(() =>
  computeTax({
    grossIncome: totalTaxable.value,
    regime: "NEW",
    fy: ui.currentFY,
    employerNps: derivedDeductions.value.section80CCD2,
  }),
);
const activeResult = computed(() => (effectiveRegime.value === "OLD" ? oldResult.value : newResult.value));
const savings = computed(() => Math.abs(oldResult.value.totalTax - newResult.value.totalTax));

// The cheaper regime per the displayed Old/New comparison. This supersedes
// useFireDerive's taxRec on this screen — taxRec used an incomplete deduction
// estimate (omitting 80CCD(1B) + Section 24) and could disagree with the
// numbers shown here. See mvp/SCREEN-STANDARD.md changelog (v0.2).
const pageRecommended = computed<"OLD" | "NEW">(() =>
  oldResult.value.totalTax <= newResult.value.totalTax ? "OLD" : "NEW",
);

const monthlyTakeHome = computed(() => {
  const annualSavingsContrib = household.data.investments.reduce(
    (s, i) => s + (i.monthlyContribution ?? 0) * 12,
    0,
  );
  const annualTake = totalTaxable.value - activeResult.value.totalTax;
  return {
    annualGross: totalTaxable.value,
    annualTax: activeResult.value.totalTax,
    annualSavingsContrib,
    annualTake,
    monthlyTake: Math.round(annualTake / 12),
    monthlyPostSavings: Math.round((annualTake - annualSavingsContrib) / 12),
  };
});

const perEarner = computed(() => {
  return household.earners.map((m) => {
    const gross = m.salary?.annualCTC ?? 0;
    const earnerNps = m.salary?.employerNpsAnnual ?? 0;
    const earnerOld = computeTax({ grossIncome: gross, regime: "OLD", fy: ui.currentFY, deductions: derivedDeductions.value.totalDeductions, employerNps: earnerNps });
    const earnerNew = computeTax({ grossIncome: gross, regime: "NEW", fy: ui.currentFY, employerNps: earnerNps });
    const rec = earnerOld.totalTax <= earnerNew.totalTax ? "OLD" : "NEW";
    const active = effectiveRegime.value === "OLD" ? earnerOld : earnerNew;
    return {
      name: m.name || "Earner",
      gross,
      tax: active.totalTax,
      takeHome: gross - active.totalTax,
      effRate: gross > 0 ? (active.totalTax / gross) * 100 : 0,
      rec,
    };
  });
});

// Per-earner avatar visuals (mirror the Profile per-member colour language).
const EARNER_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#6366f1", "#ef4444"];
function earnerColor(i: number): string {
  return EARNER_COLORS[i % EARNER_COLORS.length];
}
function earnerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Standard hero (StatDashboard) ────────────────────────────────────────────
const kpis = computed<KpiTile[]>(() => {
  const r = activeResult.value;
  const mt = monthlyTakeHome.value;
  return [
    {
      eyebrow: "Effective rate",
      value: formatPercent(r.effectiveRate, 1),
      accent: true,
      meta: `${effectiveRegime.value === "OLD" ? "Old" : "New"} regime · FY ${ui.currentFY}`,
    },
    {
      eyebrow: "Total tax · per year",
      value: formatINRCompact(r.totalTax),
      meta: `${formatINRCompact(Math.round(r.totalTax / 12))} / mo`,
    },
    {
      eyebrow: "Take-home · per year",
      value: formatINRCompact(mt.annualTake),
      meta: `${formatINRCompact(mt.monthlyTake)} / mo`,
    },
    {
      eyebrow: "Better regime",
      icon: "mdi-scale-balance",
      iconColor: "primary",
      text: pageRecommended.value === "OLD" ? "Old regime" : "New regime",
      meta: savings.value > 0 ? `Saves ${formatINRCompact(savings.value)}` : "Regimes tie",
    },
  ];
});

const donutSegments = computed(() =>
  buildDonutSegments(
    [
      { key: "take", value: monthlyTakeHome.value.annualTake, color: "success" },
      { key: "tax", value: activeResult.value.totalTax, color: "error" },
    ],
    totalTaxable.value,
  ),
);
const takeHomePctLabel = computed(() =>
  formatPercent(Math.max(0, 100 - activeResult.value.effectiveRate), 0),
);

const regimeBars = computed<RankedBar[]>(() => {
  const oldTax = oldResult.value.totalTax;
  const newTax = newResult.value.totalTax;
  const max = Math.max(oldTax, newTax, 1);
  return [
    {
      key: "old",
      label: "Old regime",
      amount: formatINRCompact(oldTax),
      share: (oldTax / max) * 100,
      color: oldTax <= newTax ? "success" : "warning",
      icon: effectiveRegime.value === "OLD" ? "mdi-check-circle" : "mdi-circle-outline",
    },
    {
      key: "new",
      label: "New regime",
      amount: formatINRCompact(newTax),
      share: (newTax / max) * 100,
      color: newTax <= oldTax ? "success" : "warning",
      icon: effectiveRegime.value === "NEW" ? "mdi-check-circle" : "mdi-circle-outline",
    },
  ];
});

// Income consolidation as ranked share bars (taxable sources).
const incomeBars = computed<RankedBar[]>(() => {
  const taxable = incomeRows.value.filter((r) => r.isTaxable);
  const max = Math.max(...taxable.map((r) => r.amount), 1);
  return taxable.map((r, i) => ({
    key: String(i),
    label: r.label,
    amount: formatINRCompact(r.amount),
    share: (r.amount / max) * 100,
    color: r.color,
    icon: r.icon,
  }));
});

// Tax breakdown as a stacked proportion bar (segments sum to total tax).
const taxBreakdownSegments = computed<ProportionSegment[]>(() => {
  const r = activeResult.value;
  return [
    { key: "slab", label: "Slab tax", value: Math.max(0, r.slabTax - r.rebate), color: "primary" },
    { key: "surcharge", label: "Surcharge", value: r.surcharge, color: "warning" },
    { key: "cess", label: "Cess", value: r.cess, color: "info" },
  ].filter((s) => s.value > 0);
});

// Take-home split of gross: in-hand vs auto-invested vs tax.
const takeHomeSegments = computed<ProportionSegment[]>(() => {
  const mt = monthlyTakeHome.value;
  const inHand = Math.max(0, mt.annualTake - mt.annualSavingsContrib);
  return [
    { key: "inhand", label: "In hand", value: inHand, color: "success" },
    { key: "invested", label: "Auto-invested", value: mt.annualSavingsContrib, color: "info" },
    { key: "tax", label: "Tax", value: mt.annualTax, color: "error" },
  ].filter((s) => s.value > 0);
});
</script>

<template>
  <v-container fluid class="py-6 taxes-page">
    <LeafPageHeader
      :eyebrow="`Tax Planning · FY ${ui.currentFY}`"
      title="Taxes"
      description="High-level only. For filing, use your CA or Cleartax — this surface is for planning, not submission."
    />

    <!-- Marginal-relief cliff warning (audit Entry #13 A13.2). -->
    <v-alert
      v-if="marginalReliefActive"
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      data-testid="marginal-relief-warning"
    >
      <div class="font-weight-bold mb-1">Marginal-relief band — rebate cliff</div>
      <ul class="mb-0">
        <li v-for="(s, idx) in marginalReliefSuggestions" :key="idx">{{ s }}</li>
      </ul>
    </v-alert>

    <!-- Hero: effective rate / tax / take-home + income split donut + regime comparison -->
    <StatDashboard
      :kpis="kpis"
      :donut-segments="donutSegments"
      donut-eyebrow="Income split"
      donut-center-eyebrow="Take-home"
      :donut-center-value="takeHomePctLabel"
      viz-eyebrow="Regime comparison"
    >
      <template #viz>
        <RankedBars :bars="regimeBars" />
        <div class="regime-controls">
          <v-btn-toggle v-model="mode" mandatory density="compact" color="primary">
            <v-btn value="AUTO" size="small">Auto ({{ pageRecommended === "OLD" ? "Old" : "New" }})</v-btn>
            <v-btn value="OLD" size="small">Old</v-btn>
            <v-btn value="NEW" size="small">New</v-btn>
          </v-btn-toggle>
          <span v-if="savings > 0" class="regime-save text-success">
            <v-icon icon="mdi-arrow-down-bold" size="x-small" />
            Save {{ formatINRCompact(savings) }} on the {{ pageRecommended === "OLD" ? "Old" : "New" }} regime
          </span>
        </div>
      </template>
    </StatDashboard>

    <!-- ───── Income & deductions ───── -->
    <div class="section-eyebrow">Income &amp; deductions</div>
    <v-row dense>
      <v-col cols="12" md="6">
        <PanelCard title="Income consolidation" icon="mdi-cash-multiple" icon-color="success" class="h-100">
          <RankedBars :bars="incomeBars" />
          <v-divider class="my-3" />
          <div class="row-line">
            <span class="font-weight-bold">Total taxable</span>
            <span class="text-currency font-weight-bold">{{ formatINRCompact(totalTaxable) }}</span>
          </div>
          <div v-if="totalExempt > 0" class="row-line text-caption text-medium-emphasis mt-1">
            <span>Total exempt (informational)</span>
            <span class="text-currency">{{ formatINRCompact(totalExempt) }}</span>
          </div>
        </PanelCard>
      </v-col>

      <v-col cols="12" md="6">
        <PanelCard title="Deductions &amp; regime tip" icon="mdi-tag-multiple-outline" icon-color="info" class="h-100">
          <p class="text-body-2 mb-3">{{ decisionRuleMessage }}</p>
          <div class="meters">
            <LimitMeter label="80C" :used="derivedDeductions.section80C" :limit="LIMIT_80C" color="primary" :format-value="formatINRCompact" />
            <LimitMeter label="80CCD(1B) · NPS" :used="derivedDeductions.section80CCD1B" :limit="LIMIT_80CCD_1B" color="info" :format-value="formatINRCompact" />
            <LimitMeter label="80D · Health" :used="derivedDeductions.section80D" :limit="LIMIT_80D_SELF + LIMIT_80D_PARENTS" color="success" :format-value="formatINRCompact" />
            <LimitMeter label="Sec 24 · Home-loan interest" :used="derivedDeductions.section24" :limit="LIMIT_SECTION_24" color="warning" :format-value="formatINRCompact" />
          </div>
          <v-divider class="my-3" />
          <div class="row-line">
            <span class="font-weight-bold">Total deductions</span>
            <span class="text-currency font-weight-bold">{{ formatINRCompact(derivedDeductions.totalDeductions) }}</span>
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            See <router-link to="/preferences#pref-section-statutory">Statutory reference</router-link> for limits.
          </div>
        </PanelCard>
      </v-col>
    </v-row>

    <!-- ───── Your tax ───── -->
    <div class="section-eyebrow">Your tax</div>
    <v-row dense>
      <v-col cols="12" md="6">
        <PanelCard
          :title="`Tax breakdown · ${effectiveRegime === 'OLD' ? 'Old' : 'New'} regime`"
          icon="mdi-calculator-variant-outline"
          icon-color="primary"
          class="h-100"
        >
          <ProportionBar :segments="taxBreakdownSegments" :format-value="formatINRCompact" class="mb-3" />
          <v-list density="compact" class="bg-transparent">
            <v-list-item class="px-0">
              <v-list-item-title>Slab tax</v-list-item-title>
              <template #append><span class="text-currency">{{ formatINR(activeResult.slabTax) }}</span></template>
            </v-list-item>
            <v-list-item v-if="activeResult.rebate > 0" class="px-0">
              <v-list-item-title>Rebate u/s 87A</v-list-item-title>
              <template #append><span class="text-currency text-success">−{{ formatINR(activeResult.rebate) }}</span></template>
            </v-list-item>
            <v-list-item v-if="activeResult.surcharge > 0" class="px-0">
              <v-list-item-title>Surcharge</v-list-item-title>
              <template #append><span class="text-currency">{{ formatINR(activeResult.surcharge) }}</span></template>
            </v-list-item>
            <v-list-item class="px-0">
              <v-list-item-title>Cess (4%)</v-list-item-title>
              <template #append><span class="text-currency">{{ formatINR(activeResult.cess) }}</span></template>
            </v-list-item>
          </v-list>
          <v-divider class="my-2" />
          <div class="row-line">
            <span class="font-weight-bold">Total tax</span>
            <span class="text-currency font-weight-bold">{{ formatINR(activeResult.totalTax) }}</span>
          </div>
        </PanelCard>
      </v-col>

      <v-col cols="12" md="6">
        <PanelCard title="Take-home" icon="mdi-wallet-outline" icon-color="success" class="h-100">
          <ProportionBar :segments="takeHomeSegments" :format-value="formatINRCompact" class="mb-3" />
          <div class="row-line mb-1">
            <span>Annual (post-tax)</span>
            <span class="text-currency font-weight-bold">{{ formatINRCompact(monthlyTakeHome.annualTake) }}</span>
          </div>
          <div class="row-line">
            <span>Monthly</span>
            <span class="text-currency font-weight-bold">{{ formatINRCompact(monthlyTakeHome.monthlyTake) }}</span>
          </div>
          <v-divider class="my-3" />
          <div class="row-line text-caption text-medium-emphasis">
            <span>Less investing ({{ formatINRCompact(monthlyTakeHome.annualSavingsContrib) }}/yr)</span>
            <span class="text-currency">{{ formatINRCompact(monthlyTakeHome.monthlyPostSavings) }} / mo</span>
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            Cash in hand each month after your automatic investment contributions.
          </div>
        </PanelCard>
      </v-col>
    </v-row>

    <!-- ───── Tax cliff (A13.3) ───── -->
    <div class="section-eyebrow">Tax cliff</div>
    <v-row dense>
      <v-col cols="12">
        <TaxCliffChart :fy="ui.currentFY" :old-deductions="derivedDeductions.totalDeductions" />
      </v-col>
    </v-row>

    <!-- ───── Per earner ───── -->
    <template v-if="household.earners.length >= 2">
      <div class="section-eyebrow">Per earner</div>
      <PanelCard>
        <v-table density="comfortable" class="bg-transparent earner-table">
          <thead>
            <tr>
              <th>Earner</th>
              <th class="text-right">Gross</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Eff. rate</th>
              <th class="text-right">Take-home</th>
              <th class="text-center">Better regime</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in perEarner" :key="row.name">
              <td>
                <div class="earner-cell">
                  <span class="earner-avatar" :style="{ background: earnerColor(i) }">{{ earnerInitials(row.name) }}</span>
                  <span class="font-weight-medium">{{ row.name }}</span>
                </div>
              </td>
              <td class="text-right text-currency">{{ formatINRCompact(row.gross) }}</td>
              <td class="text-right text-currency text-error">{{ formatINRCompact(row.tax) }}</td>
              <td class="text-right text-currency text-medium-emphasis">{{ formatPercent(row.effRate, 1) }}</td>
              <td class="text-right text-currency font-weight-bold text-success">{{ formatINRCompact(row.takeHome) }}</td>
              <td class="text-center">
                <v-chip size="x-small" variant="tonal" :color="row.rec === 'OLD' ? 'info' : 'primary'">{{ row.rec }}</v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
        <div class="text-caption text-medium-emphasis mt-3">
          Each earner files their own ITR in India. Demo treats the whole-household regime uniformly;
          production would allow a per-earner override.
        </div>
      </PanelCard>
    </template>

    <v-alert type="info" variant="tonal" density="compact" class="mt-5">
      This is an estimate — for filing, use your CA / Cleartax. Standard deduction, 80C (EPF + PPF + ELSS + life premium),
      80D (health premium), and Section 24 (home-loan interest) are auto-applied.
    </v-alert>

    <DiscoveryFooter
      :also-show-keys="[
        'tax.sandwichGenNudges',
        'family.parentsBucket',
        'investments.international',
        'investments.esop',
      ]"
    />
  </v-container>
</template>

<style scoped>
.row-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.meters {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.earner-table :deep(tbody tr) {
  transition: background 120ms ease;
}
.earner-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
.earner-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.earner-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  flex: 0 0 auto;
}
.regime-controls {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.regime-save {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}
</style>

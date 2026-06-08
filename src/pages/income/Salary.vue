<script setup lang="ts">
import { ref, computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { dobFromAge } from "@/lib/age";
import { formatINRCompact } from "@/lib/formatters";
import { buildDonutSegments } from "@/lib/donut";
import type { Member, MemberDraft } from "@/types/household";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import StatDashboard, { type KpiTile } from "@/components/income-layout/StatDashboard.vue";
import RankedBars, { type RankedBar } from "@/components/income-layout/RankedBars.vue";
import FeaturedRail from "@/components/income-layout/FeaturedRail.vue";
import EntryDialog from "@/components/income-layout/EntryDialog.vue";
import EarnerSalaryForm from "@/components/forms/EarnerSalaryForm.vue";
import MembersForm from "@/components/forms/MembersForm.vue";
import EmptyState from "@/components/shared/EmptyState.vue";

const household = useHouseholdStore();

// Earner-axis palette — cycled by index for donut + ranked bars.
const PALETTE = ["primary", "success", "info", "warning", "secondary", "fire-orange"];
function colorFor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

function ctcOf(m: Member): number {
  return m.salary?.annualCTC ?? 0;
}

// gh #67: the Salary screen manages every ADULT (the editing roster — a non-earning adult appears
// with ₹0 so you can give them income, which then derives them as an earner). Sorted by CTC desc.
const rankedEarners = computed(() => [...household.adults].sort((a, b) => ctcOf(b) - ctcOf(a)));

// Whole-household salary total. Sourced from the un-lensed store aggregate so the
// Salary screen, the Income Overview KPI and household.totalAnnualIncome all agree
// (Rule 26 cross-page consistency). useFireDerive().annualIncome.salaryIncome is the
// SAME computation behind a viewing-lens and is intentionally not used here — the
// Salary screen manages every earner, not just the lens member.
const totalCTC = computed(() => household.totalAnnualIncome.salaryIncome);
const employedCount = computed(
  () => household.earners.filter((m) => m.employmentStatus === "Employed").length,
);
const avgHike = computed(() => {
  const list = household.earners; // hike averaged over actual earners only
  if (!list.length) return 0;
  return list.reduce((s, m) => s + (m.salary?.hikePercent ?? 0), 0) / list.length;
});
const topEarner = computed(() => rankedEarners.value[0] ?? null);

const kpis = computed<KpiTile[]>(() => {
  const tiles: KpiTile[] = [
    { eyebrow: "Total CTC · per year", value: formatINRCompact(totalCTC.value), accent: true },
    {
      eyebrow: "Earners",
      value: String(household.earners.length),
      meta: `${employedCount.value} at work`,
    },
    { eyebrow: "Avg hike", value: `${avgHike.value.toFixed(1)}%`, meta: "expected / yr" },
  ];
  if (topEarner.value) {
    tiles.push({
      eyebrow: "Top earner",
      icon: "mdi-account-tie",
      iconColor: "primary",
      text: topEarner.value.name,
      meta: `${formatINRCompact(ctcOf(topEarner.value))}/yr`,
    });
  }
  return tiles;
});

const donutSegments = computed(() =>
  buildDonutSegments(
    rankedEarners.value.map((m, i) => ({ key: m.id, value: ctcOf(m), color: colorFor(i) })),
    totalCTC.value,
  ),
);

const rankedBars = computed<RankedBar[]>(() =>
  rankedEarners.value.map((m, i) => ({
    key: m.id,
    label: m.name,
    amount: formatINRCompact(ctcOf(m)),
    share: totalCTC.value > 0 ? (ctcOf(m) / totalCTC.value) * 100 : 0,
    color: colorFor(i),
    icon: "mdi-account",
  })),
);

// ───── edit earner (rich EarnerSalaryForm mounted in a dialog) ─────
// EarnerSalaryForm does NOT autosave — it owns its own pencil → edit-dialog → explicit
// Save path. So the wrapping EntryDialog footer is just "Done" (close); persistence
// happens through the form's own save path. (Contract §2.4 fallback, verified by reading
// EarnerSalaryForm.vue.)
const editingEarner = ref<Member | null>(null);
const showEditEarner = computed({
  get: () => !!editingEarner.value,
  set: (v) => {
    if (!v) editingEarner.value = null;
  },
});
function startEditEarner(earner: Member) {
  editingEarner.value = earner;
}

// ───── add earner (preserves the existing MembersForm dialog flow verbatim) ─────
const showAddEarner = ref(false);
const draftNewEarner = ref<MemberDraft[]>([]);

function openAddEarner() {
  draftNewEarner.value = [
    {
      id: crypto.randomUUID().slice(0, 8),
      name: "Adult",
      dateOfBirth: dobFromAge(30),
      role: "ADULT",
      // gh #67: non-earning until salary is set via the pencil → EarnerSalaryForm below.
      isEarning: false,
      targetRetirementAge: null,
      planToAge: 90,
      relation: "",
      city: "Metro",
      health: "Healthy",
      educationStage: null,
      riskAppetite: "Moderate",
      marital: "Married",
      employmentStatus: null,
    },
  ];
  showAddEarner.value = true;
}

function commitAddEarner() {
  const draft = draftNewEarner.value[0];
  if (!draft || !/^\d{4}-\d{2}-\d{2}$/.test(draft.dateOfBirth)) return;
  // gh #67: add an ADULT; they become an earner once their salary is entered (derived from income).
  household.addMember({
    id: draft.id,
    name: draft.name || "Adult",
    dateOfBirth: draft.dateOfBirth,
    role: "ADULT",
    planToAge: draft.planToAge ?? 90,
    relation: draft.relation || undefined,
    city: draft.city,
    health: draft.health,
    riskAppetite: draft.riskAppetite,
    marital: draft.marital,
  });
  household.autoFlowSalaryToEPF();
  showAddEarner.value = false;
}
</script>

<template>
  <v-container fluid class="py-6 leaf-page">
    <LeafPageHeader
      eyebrow="Income · Salary"
      title="Salary"
      description="Annual CTC per earner. Expected hike % drives the multi-year FIRE projection. Click a card to edit the full salary structure."
    />

    <template v-if="household.adults.length">
      <StatDashboard
        :kpis="kpis"
        :donut-segments="donutSegments"
        donut-eyebrow="By earner"
        donut-center-eyebrow="Total CTC"
        :donut-center-value="formatINRCompact(totalCTC)"
        viz-eyebrow="By earner · ranked"
      >
        <template #viz>
          <RankedBars :bars="rankedBars" />
        </template>
      </StatDashboard>

      <div class="section-eyebrow">Browse by earner</div>
      <div class="rails-wrap mb-6">
        <FeaturedRail
          title="Adults"
          icon="mdi-account-group"
          accent-color="primary"
          :total="formatINRCompact(totalCTC)"
          :count-label="`${household.adults.length} ${household.adults.length === 1 ? 'adult' : 'adults'}`"
          :entries="rankedEarners"
          add-sub-label="adult"
          @edit="startEditEarner"
          @add="openAddEarner"
        >
          <template #amount="{ entry }">
            {{ formatINRCompact(ctcOf(entry)) }} <span>/yr</span>
          </template>
          <template #title="{ entry }">{{ entry.name }}</template>
          <template #meta="{ entry, variant }">
            <template v-if="variant === 'featured'">
              {{ entry.salary?.hikePercent ?? 0 }}% hike
              · retires at age {{ entry.targetRetirementAge ?? "—" }}
              · Salaried
            </template>
            <template v-else>
              {{ entry.salary?.hikePercent ?? 0 }}% hike · age {{ entry.targetRetirementAge ?? "—" }}
            </template>
          </template>
        </FeaturedRail>
      </div>
    </template>

    <!-- First-time empty state -->
    <EmptyState
      v-else
      icon="mdi-account-tie-outline"
      title="No adults on file"
      copy="Add an adult, then set their salary to populate employer details and your savings rate — they become an earner once income is added. Or manage the full household on Profile."
      cta-label="Add an adult"
      cta-icon="mdi-account-plus"
      @cta="openAddEarner"
    />

    <!-- Edit earner — rich EarnerSalaryForm reused inside the shared dialog chrome -->
    <EntryDialog
      v-if="editingEarner"
      v-model="showEditEarner"
      icon="mdi-account-tie"
      color="primary"
      eyebrow="Edit"
      title="Edit earner salary"
      submit-label="Done"
      @submit="showEditEarner = false"
    >
      <EarnerSalaryForm :earner="editingEarner" />
      <template #hint>
        Click the <strong>pencil</strong> on the card above to edit CTC, hike % and VPF top-up.
        Changes save to your household immediately.
      </template>
    </EntryDialog>

    <!-- Add earner — existing MembersForm quick-add flow, preserved -->
    <v-dialog v-model="showAddEarner" max-width="900" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-account-plus" class="mr-2" />
          Add earner
        </v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <p class="text-caption text-medium-emphasis mb-3">
            Quick-add an earner — Date of birth and target retirement age drive every projection.
            Full household management lives on the Profile screen.
          </p>
          <MembersForm v-model:members="draftNewEarner" />
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" @click="showAddEarner = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" @click="commitAddEarner">
            <v-icon icon="mdi-content-save" class="mr-1" />
            Save earner
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.leaf-page { max-width: 1280px; }
/* .section-eyebrow is now a global utility in tokens.css (Screen Standard §5) */
.rails-wrap { display: flex; flex-direction: column; gap: 22px; }
</style>

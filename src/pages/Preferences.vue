<script setup lang="ts">
/**
 * /preferences — the canonical home for every editable planning
 * assumption (R1.2 + R1.3) plus feature-flag toggles + statutory facts.
 *
 * Phase 3 Stage G per docs/goals/build-firekaro-mvp-v5.md §6 Stage G.
 *
 * Layout: sticky LEFT nav (desktop) / TOP nav (mobile) with 10 sections.
 * Each section has a reset-to-default affordance; the page has a global
 * "Reset ALL to research defaults" button. Statutory Reference section
 * is rendered with a muted background + "official source" badge and is
 * NEVER editable (R1.4 invariant).
 *
 * Assumption wiring: edits write to the flat household-scope `Assumptions`
 * store (via storage-adapter, ADR-0001 scoped by userId). The Dashboard +
 * downstream surfaces read it directly via `a.values.*`. The canonical R1
 * model is the flat `types/assumptions.ts` store — the layered resolver was
 * retired in Stage-T0b (see docs/adr/0002-retire-layered-assumption-resolver.md).
 */
import { computed, ref, watch } from "vue";
import { useFeaturesStore } from "@/stores/features";
import { featureRegistry } from "@/lib/features";
import { useAssumptionsStore } from "@/stores/assumptions";
import {
  useHouseholdStore,
  DEFAULT_EXTENDED_FAMILY_CONTINGENCY_PERCENT,
  DEFAULT_HEALTHCARE_CORPUS_RESERVATION_PERCENT,
} from "@/stores/household";
import { useDismissedNudges } from "@/composables/useDismissedNudges";
import { useCommsConsent } from "@/composables/useCommsConsent";
import { useFireDerive } from "@/lib/useFireDerive";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";

interface PrefSection {
  id: string;
  label: string;
  badge?: string;
}

const SECTIONS: PrefSection[] = [
  { id: "core", label: "Core FIRE" },
  { id: "inflation", label: "Inflation (4-bucket)" },
  { id: "returns", label: "Expected returns" },
  { id: "variants", label: "FIRE variants" },
  { id: "family", label: "Family layer" },
  { id: "glide", label: "Glide path" },
  { id: "withdrawal", label: "Withdrawal strategy" },
  { id: "tax", label: "Tax preferences" },
  { id: "statutory", label: "Statutory reference", badge: "Read-only" },
  { id: "estate", label: "Estate planning" },
  { id: "features", label: "Feature toggles" },
  { id: "notifications", label: "Notifications", badge: "New" },
];

const assumptions = useAssumptionsStore();
const household = useHouseholdStore();
const features = useFeaturesStore();
const dismissed = useDismissedNudges();
assumptions.hydrate();
household.hydrate();
features.hydrate();

// Comms/notification consent (DPDP) — backed by /api/comms/consent.
const {
  whatsappEnabled: waEnabled,
  marketingOptIn: waMarketing,
  whatsappNumber: waNumber,
  saving: waSaving,
  load: loadComms,
  save: saveComms,
  onWhatsappToggle: onWaToggle,
} = useCommsConsent();
loadComms();

// Basic shape check: 10–15 digits once stripped (country code + number). Empty is
// allowed (the field is optional until the user opts in).
const waNumberRules = [
  (v: string) => {
    const digits = (v ?? "").replace(/\D/g, "");
    return digits.length === 0 || (digits.length >= 10 && digits.length <= 15) || "Enter a valid number with country code (e.g. 91XXXXXXXXXX)";
  },
];

function resetComms() {
  waEnabled.value = false;
  waMarketing.value = false;
  waNumber.value = "";
  void saveComms();
}

// Edits read/write the flat household-scope `Assumptions` store directly —
// this is the canonical persistence target (the layered resolver was retired,
// ADR-0002). Resets restore DEFAULT_ASSUMPTIONS (flat store) and the household
// defaults below.
const v = computed(() => assumptions.values);
const fire = useFireDerive();

// A3.2 / ADR-0006 — the live household SPENDING BASKET (4-bucket weighted). This is the rate the
// FIRE target grows at; general CPI (`v.inflation`) is only the display deflator. The two are
// deliberately shown as different numbers here — collapsing them is gh #167.
const blendedInflationPct = computed(() => (assumptions.householdInflation() * 100).toFixed(2));
const generalInflationPct = computed(() => (v.value.inflation * 100).toFixed(2));

// A3.2 — editable 4-bucket inflation WEIGHTS (default 60/20/10/10). Stored as
// percentages; blendedInflation() normalizes by their sum, but the UI validates
// to exactly 100 so the displayed weighting reads cleanly.
type InflationBucketKey = "general" | "healthcare" | "education" | "housing";
function setInflationWeight(bucket: InflationBucketKey, val: string) {
  const n = Number(val);
  if (!Number.isFinite(n)) return;
  assumptions.set("inflationWeights", { ...v.value.inflationWeights, [bucket]: n });
}
const weightSum = computed(() => {
  const w = v.value.inflationWeights;
  return w.general + w.healthcare + w.education + w.housing;
});
const weightsValid = computed(() => Math.round(weightSum.value) === 100);

// A4.2/A4.9 + ADR-0006 — weighted nominal and the TWO real returns, kept distinct.
//
// The plan's real return is the kernel's ONE `realBlendedReturn` = (1+nominal)/(1+general CPI) − 1
// (gh #180): the same figure the headline solver, the Coast card, the Monte Carlo band and the
// projection chart use. This readout used to show `nominal − basket` and flag it red — a warning
// on a number the product does not plan with, which could fire while the actual plan was healthy.
// The basket-relative figure is still worth seeing (it answers "does my portfolio out-earn my own
// spending?"), so it is shown as INFORMATION beside the plan figure, and only the plan figure
// drives the warning.
const weightedNominalPct = computed(() => (fire.blendedReturn.value * 100).toFixed(2));
const realVsCpi = computed(() => fire.realBlendedReturn.value);
const realVsBasket = computed(
  () => (1 + fire.blendedReturn.value) / (1 + assumptions.householdInflation()) - 1,
);
const weightedRealPct = computed(() => (realVsCpi.value * 100).toFixed(2));
const weightedRealVsBasketPct = computed(() => (realVsBasket.value * 100).toFixed(2));
const realReturnNegative = computed(() => realVsCpi.value < 0);
const realBelowBasket = computed(() => realVsBasket.value < 0 && realVsCpi.value >= 0);

// Per-section reset handlers.
function resetSection(id: string) {
  if (id === "core") {
    assumptions.set("equityReturn", DEFAULT_ASSUMPTIONS.equityReturn);
    assumptions.set(
      "householdSavingsStepUpPercent",
      DEFAULT_ASSUMPTIONS.householdSavingsStepUpPercent,
    );
  } else if (id === "inflation") {
    assumptions.set("inflation", DEFAULT_ASSUMPTIONS.inflation);
    assumptions.set("healthcareInflation", DEFAULT_ASSUMPTIONS.healthcareInflation);
    assumptions.set("educationInflation", DEFAULT_ASSUMPTIONS.educationInflation);
    assumptions.set("housingInflation", DEFAULT_ASSUMPTIONS.housingInflation);
    assumptions.set("inflationWeights", { ...DEFAULT_ASSUMPTIONS.inflationWeights });
  } else if (id === "returns") {
    assumptions.set("equityReturn", DEFAULT_ASSUMPTIONS.equityReturn);
    assumptions.set("debtReturn", DEFAULT_ASSUMPTIONS.debtReturn);
    assumptions.set("realEstateReturn", DEFAULT_ASSUMPTIONS.realEstateReturn);
    assumptions.set("goldReturn", DEFAULT_ASSUMPTIONS.goldReturn);
    assumptions.set("npsReturn", DEFAULT_ASSUMPTIONS.npsReturn);
    assumptions.set("ppfReturn", DEFAULT_ASSUMPTIONS.ppfReturn);
    assumptions.set("epfReturn", DEFAULT_ASSUMPTIONS.epfReturn);
  } else if (id === "variants") {
    assumptions.set("leanMultiplier", DEFAULT_ASSUMPTIONS.leanMultiplier);
    assumptions.set("fatMultiplier", DEFAULT_ASSUMPTIONS.fatMultiplier);
  } else if (id === "family") {
    if (household.data) {
      household.data.extendedFamilyContingencyPercent =
        DEFAULT_EXTENDED_FAMILY_CONTINGENCY_PERCENT;
      household.data.healthcareCorpusReservationPercent =
        DEFAULT_HEALTHCARE_CORPUS_RESERVATION_PERCENT;
    }
  } else if (id === "glide") {
    if (household.data) {
      household.data.glidePath = {
        enabled: false,
        startEquityPercent: 75,
        endEquityPercent: 40,
        taperWindowYears: 10,
      };
    }
  } else if (id === "features") {
    features.resetToDefaults();
  }
}

function resetAll() {
  if (!confirm("Reset ALL assumptions and feature toggles to research defaults? Your household data is NOT affected.")) {
    return;
  }
  assumptions.reset();
  if (household.data) {
    household.data.extendedFamilyContingencyPercent =
      DEFAULT_EXTENDED_FAMILY_CONTINGENCY_PERCENT;
    household.data.healthcareCorpusReservationPercent =
      DEFAULT_HEALTHCARE_CORPUS_RESERVATION_PERCENT;
    household.data.glidePath = {
      enabled: false,
      startEquityPercent: 75,
      endEquityPercent: 40,
      taperWindowYears: 10,
    };
  }
  features.resetToDefaults();
}

// Glide path two-way binding helpers.
const glide = computed({
  get: () => household.data?.glidePath ?? {
    enabled: false,
    startEquityPercent: 75,
    endEquityPercent: 40,
    taperWindowYears: 10,
  },
  set: (v) => {
    if (household.data) household.data.glidePath = v;
  },
});

// Sticky-nav active section tracking via IntersectionObserver.
const activeSection = ref("core");
function scrollTo(id: string) {
  activeSection.value = id;
  const el = document.getElementById(`pref-section-${id}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Features grouping for the §Features section.
const featuresBySection = computed(() => {
  const out: Record<string, typeof featureRegistry> = {};
  for (const f of featureRegistry) {
    const k = `Section ${f.questionnaireSection}`;
    out[k] = out[k] ?? [];
    out[k].push(f);
  }
  return out;
});
</script>

<template>
  <v-container fluid class="preferences-page py-6">
    <v-row>
      <!-- Sticky LEFT nav (desktop) -->
      <v-col cols="12" md="3" lg="2" class="d-none d-md-block">
        <div class="sticky-nav">
          <h2 class="text-h6 font-weight-bold mb-3">Preferences</h2>
          <v-list density="compact" nav>
            <v-list-item
              v-for="s in SECTIONS"
              :key="s.id"
              :active="activeSection === s.id"
              @click="scrollTo(s.id)"
            >
              <v-list-item-title>{{ s.label }}</v-list-item-title>
              <template v-if="s.badge" #append>
                <v-chip size="x-small" variant="tonal">{{ s.badge }}</v-chip>
              </template>
            </v-list-item>
          </v-list>
          <v-divider class="my-3" />
          <v-btn
            color="error"
            variant="outlined"
            size="small"
            block
            data-testid="pref-reset-all"
            @click="resetAll"
          >
            <v-icon icon="mdi-restore" class="mr-1" />
            Reset ALL
          </v-btn>
        </div>
      </v-col>

      <!-- TOP nav (mobile) -->
      <v-col cols="12" class="d-md-none">
        <v-chip-group v-model="activeSection" mandatory class="mobile-nav">
          <v-chip
            v-for="s in SECTIONS"
            :key="s.id"
            :value="s.id"
            variant="outlined"
            size="small"
            @click="scrollTo(s.id)"
          >
            {{ s.label }}
          </v-chip>
        </v-chip-group>
      </v-col>

      <!-- Main scrollable content -->
      <v-col cols="12" md="9" lg="10">
        <!-- §Core FIRE -->
        <section id="pref-section-core" class="pref-section">
          <SectionHeader title="Core FIRE assumptions" :on-reset="() => resetSection('core')" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Safe Withdrawal Rate (SWR), Plan-to age and how fast your savings grow.
            Research-grounded defaults per Ch 04 §4.3. Per-member Plan-to age lives on
            <router-link to="/profile">Profile</router-link>.
          </p>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                label="SWR override (%)"
                type="number"
                :model-value="((v.swrOverride ?? 0) * 100).toFixed(2)"
                hint="Default: 3.5% (resolved per anchor age). Leave empty to use the age table."
                persistent-hint
                variant="outlined"
                density="comfortable"
                @update:model-value="(val: string) => assumptions.set('swrOverride', val ? Number(val) / 100 : undefined as never)"
              />
            </v-col>
            <!-- ADR-0006 — the savings step-up became a defaulted assumption (0 -> 2% real), so it
                 needs a home where a user can see it and deliberately set it back to 0. -->
            <v-col cols="12" md="6">
              <v-text-field
                label="Savings step-up (% real per year)"
                type="number"
                :model-value="v.householdSavingsStepUpPercent"
                hint="Default: 2% a year above inflation, tapering to 0 by age 50. Set 0 if you expect your savings to just keep pace with inflation."
                persistent-hint
                variant="outlined"
                density="comfortable"
                data-testid="pref-savings-stepup"
                @update:model-value="(val: string) => assumptions.set('householdSavingsStepUpPercent', Math.min(15, Math.max(0, Number(val) || 0)))"
              />
            </v-col>
          </v-row>
          <v-alert type="info" variant="tonal" density="compact" class="mt-2">
            <strong>Why 2%, and why it stops at 50.</strong> The plan used to assume your savings only
            ever kept pace with inflation — zero real growth for 25 to 40 years — while your expenses
            grew at your spending basket. For a salaried accumulator that is not caution, it is a
            mismatch: Indian salary growth has run roughly 3–4% above inflation. We use a deliberately
            conservative 2% real, and taper it to nothing by age 50, because promotions and job moves
            slow down late-career and a step-up that ran to retirement would flatter the number.
          </v-alert>
        </section>

        <!-- §Inflation (4-bucket) -->
        <section id="pref-section-inflation" class="pref-section">
          <SectionHeader title="Inflation (4-bucket model)" :on-reset="() => resetSection('inflation')" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Four rates, one blend. Recurring expense lines route to a bucket via the
            <code>inflationBucket</code> field, and the weighted blend below is
            <strong>the rate your FIRE target grows at</strong> — the single most important
            assumption on this page after your returns. Defaults (ADR-0006):
            general CPI <strong>6%</strong> · healthcare <strong>9%</strong> ·
            education <strong>9%</strong> · housing <strong>6%</strong>.
          </p>
          <v-alert type="info" variant="tonal" density="compact" class="mb-3">
            <div class="mb-1">
              <strong>Why 9% healthcare, not 14%?</strong> India's CPI-Health runs about 4–7%. We add
              3–4 points for private-hospital tariffs and the older, heavier-using mix a retiree
              actually has. The 13–14% figure you see quoted is the <em>insurers' claims-cost trend</em>
              — it belongs to your <strong>premium</strong>, and your premium is already a line in your
              expenses, so counting it twice would inflate the target for no reason.
            </div>
            <div>
              <strong>Why education carries 0% weight here.</strong> Education spending ends; a
              retirement basket is perpetual. Your children's fees, post-grad and weddings are costed
              as dated goals in the family layer, where the 9% rate above still applies to them. Giving
              education a permanent slice of the retirement basket charged you for it forever.
            </div>
          </v-alert>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                label="General CPI (%)"
                type="number"
                :model-value="(v.inflation * 100).toFixed(1)"
                variant="outlined"
                density="comfortable"
                data-testid="pref-inflation-general"
                @update:model-value="(val: string) => assumptions.set('inflation', Number(val) / 100)"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                label="Healthcare (%)"
                type="number"
                :model-value="(v.healthcareInflation * 100).toFixed(1)"
                variant="outlined"
                density="comfortable"
                data-testid="pref-inflation-healthcare"
                @update:model-value="(val: string) => assumptions.set('healthcareInflation', Number(val) / 100)"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                label="Education (%)"
                type="number"
                :model-value="(v.educationInflation * 100).toFixed(1)"
                variant="outlined"
                density="comfortable"
                data-testid="pref-inflation-education"
                @update:model-value="(val: string) => assumptions.set('educationInflation', Number(val) / 100)"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                label="Housing (%)"
                type="number"
                :model-value="(v.housingInflation * 100).toFixed(1)"
                variant="outlined"
                density="comfortable"
                data-testid="pref-inflation-housing"
                @update:model-value="(val: string) => assumptions.set('housingInflation', Number(val) / 100)"
              />
            </v-col>
          </v-row>
          <!-- A3.2 — editable per-bucket WEIGHTS (sum-to-100 validated). -->
          <p class="text-body-2 text-medium-emphasis mt-4 mb-2">
            <strong>Bucket weights (%)</strong> — how much each bucket counts toward your household
            blend. Default is <strong>74 / 8 / 0 / 18</strong> (general / healthcare / education /
            housing): disjoint shares of an urban household's spending. They used to be 60/20/10/10,
            which double-counted — "general CPI" is the <em>all-items</em> index and already contains
            health, education and housing, so giving those their own slices on top pushed the blend
            to 7.9% and quietly made your target grow faster than the model could justify. A
            healthcare-heavy or renting household can still re-weight here.
          </p>
          <v-row>
            <v-col cols="6" md="3">
              <v-text-field
                label="General (%)"
                type="number"
                :model-value="v.inflationWeights.general"
                variant="outlined"
                density="comfortable"
                data-testid="pref-inflation-weight-general"
                @update:model-value="(val: string) => setInflationWeight('general', val)"
              />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field
                label="Healthcare (%)"
                type="number"
                :model-value="v.inflationWeights.healthcare"
                variant="outlined"
                density="comfortable"
                data-testid="pref-inflation-weight-healthcare"
                @update:model-value="(val: string) => setInflationWeight('healthcare', val)"
              />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field
                label="Education (%)"
                type="number"
                :model-value="v.inflationWeights.education"
                variant="outlined"
                density="comfortable"
                data-testid="pref-inflation-weight-education"
                @update:model-value="(val: string) => setInflationWeight('education', val)"
              />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field
                label="Housing (%)"
                type="number"
                :model-value="v.inflationWeights.housing"
                variant="outlined"
                density="comfortable"
                data-testid="pref-inflation-weight-housing"
                @update:model-value="(val: string) => setInflationWeight('housing', val)"
              />
            </v-col>
          </v-row>
          <v-alert
            v-if="!weightsValid"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-1 mb-2"
            data-testid="pref-inflation-weight-warning"
          >
            Weights sum to <strong>{{ Math.round(weightSum) }}%</strong> — adjust to
            total 100% so the blend reads cleanly. (The blend still normalizes by the
            sum, so the rate below is always valid.)
          </v-alert>
          <v-alert type="info" variant="tonal" density="compact" class="mt-2">
            Your <strong>spending basket</strong>
            ({{ v.inflationWeights.general }}/{{ v.inflationWeights.healthcare }}/{{ v.inflationWeights.education }}/{{ v.inflationWeights.housing }}
            weighting):
            <strong data-testid="pref-inflation-blend">{{ blendedInflationPct }}%</strong>
            a year — the rate your expenses, and therefore your FIRE target, grow at.
            General CPI ({{ generalInflationPct }}%) is a different number: it is only what we deflate
            by to show you figures in today's rupees. Because your basket runs a little above it, the
            target creeps up even in today's money.
          </v-alert>
        </section>

        <!-- §Returns -->
        <section id="pref-section-returns" class="pref-section">
          <SectionHeader title="Expected returns (per investment type)" :on-reset="() => resetSection('returns')" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Annual nominal expected return per investment type per audit Entry #4.
            PPF and EPF are statutory rates (set by the Government) — see
            §Statutory reference; they are not editable here (R1.4).
          </p>
          <v-row>
            <v-col cols="12" md="6">
              <ReturnField label="Equity" :pct="v.equityReturn" @update="assumptions.set('equityReturn', $event)" />
            </v-col>
            <v-col cols="12" md="6">
              <ReturnField label="Debt" :pct="v.debtReturn" @update="assumptions.set('debtReturn', $event)" />
            </v-col>
            <v-col cols="12" md="6">
              <ReturnField label="Real Estate" :pct="v.realEstateReturn" @update="assumptions.set('realEstateReturn', $event)" />
            </v-col>
            <v-col cols="12" md="6">
              <ReturnField label="Gold" :pct="v.goldReturn" @update="assumptions.set('goldReturn', $event)" />
            </v-col>
            <v-col cols="12" md="6">
              <ReturnField label="NPS" :pct="v.npsReturn" @update="assumptions.set('npsReturn', $event)" />
            </v-col>
          </v-row>
          <!-- A4.2/A4.9 — weighted nominal + real return on the household's actual mix. -->
          <v-alert
            :type="realReturnNegative ? 'warning' : 'success'"
            variant="tonal"
            density="compact"
            class="mt-2"
          >
            Portfolio-weighted return on your current mix:
            <strong data-testid="pref-return-nominal">{{ weightedNominalPct }}% nominal</strong>
            ·
            <strong data-testid="pref-return-real">{{ weightedRealPct }}% real</strong>
            after {{ generalInflationPct }}% general inflation — <em>this is the real return your
            plan is solved with</em>, and the same one the Coast card and the projection chart use.
            <br />
            For information: against your own {{ blendedInflationPct }}% spending basket it is
            <strong data-testid="pref-return-real-basket">{{ weightedRealVsBasketPct }}%</strong>.
            <template v-if="realReturnNegative">
              Your real return is negative — inflation is currently eroding this mix.
            </template>
            <template v-else-if="realBelowBasket">
              Your portfolio out-earns general inflation but not your own spending basket, so the
              target rises faster than that gap closes on its own — the plan leans on your monthly
              contributions rather than on returns.
            </template>
          </v-alert>
        </section>

        <!-- §Variants -->
        <section id="pref-section-variants" class="pref-section">
          <SectionHeader title="FIRE variants" :on-reset="() => resetSection('variants')" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Lean / Fat FIRE as a multiple of your Regular target (audit Entry #2
            A2.4). Regular is always 1.0× (the headline number); Lean trims the
            lifestyle, Fat pads it. These feed the milestone chips on the Dashboard.
          </p>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                label="Lean FIRE multiplier (×)"
                type="number"
                step="0.05"
                :model-value="v.leanMultiplier"
                hint="Default 0.6 — a leaner lifestyle than your baseline."
                persistent-hint
                variant="outlined"
                density="comfortable"
                data-testid="pref-lean-multiplier"
                @update:model-value="(val: string) => assumptions.set('leanMultiplier', Number(val))"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                label="Fat FIRE multiplier (×)"
                type="number"
                step="0.05"
                :model-value="v.fatMultiplier"
                hint="Default 1.5 — a padded, more comfortable lifestyle."
                persistent-hint
                variant="outlined"
                density="comfortable"
                data-testid="pref-fat-multiplier"
                @update:model-value="(val: string) => assumptions.set('fatMultiplier', Number(val))"
              />
            </v-col>
          </v-row>
        </section>

        <!-- §Family layer -->
        <section id="pref-section-family" class="pref-section">
          <SectionHeader title="Family layer" :on-reset="() => resetSection('family')" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Extended-family contingency buffer + healthcare corpus
            reservation. Audit Entry #6 + #10.
          </p>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                label="Extended-family contingency (%)"
                type="number"
                :model-value="((household.data?.extendedFamilyContingencyPercent ?? 0.075) * 100).toFixed(1)"
                hint="Default: 7.5% of annual expenses"
                persistent-hint
                variant="outlined"
                density="comfortable"
                @update:model-value="(val: string) => { if (household.data) household.data.extendedFamilyContingencyPercent = Number(val) / 100 }"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                label="Healthcare corpus reservation (%)"
                type="number"
                :model-value="((household.data?.healthcareCorpusReservationPercent ?? 0.2) * 100).toFixed(1)"
                hint="Default: 20% of FIRE corpus"
                persistent-hint
                variant="outlined"
                density="comfortable"
                @update:model-value="(val: string) => { if (household.data) household.data.healthcareCorpusReservationPercent = Number(val) / 100 }"
              />
            </v-col>
            <!-- #81 Phase 2 — the household split % for the per-adult INDIVIDUAL FIRE view. -->
            <v-col cols="12" md="6">
              <v-text-field
                label="Household split per adult (%)"
                type="number"
                :model-value="v.householdSplitPercent"
                hint="Each adult's share of shared costs/assets in the individual-FIRE view. Default 50 (two-adult 50/50). Does NOT affect the household FIRE number."
                persistent-hint
                variant="outlined"
                density="comfortable"
                data-testid="pref-household-split"
                @update:model-value="(val: string) => assumptions.set('householdSplitPercent', Number(val))"
              />
            </v-col>
          </v-row>

          <!-- Phase 6 Stage R — re-enable dismissed nudges affordance. -->
          <v-divider class="my-4" />
          <div class="d-flex align-center justify-space-between" style="gap: 12px">
            <div>
              <div class="font-weight-medium">Dismissed nudges</div>
              <div class="text-caption text-medium-emphasis">
                {{ dismissed.dismissedCount.value }}
                nudge{{ dismissed.dismissedCount.value === 1 ? "" : "s" }}
                hidden from Dashboard surfaces.
              </div>
            </div>
            <v-btn
              variant="outlined"
              size="small"
              :disabled="dismissed.dismissedCount.value === 0"
              data-testid="reenable-dismissed-nudges"
              @click="dismissed.reEnableAll()"
            >
              <v-icon icon="mdi-restore-alert" class="mr-1" />
              Re-enable dismissed nudges
            </v-btn>
          </div>
        </section>

        <!-- §Glide path -->
        <section id="pref-section-glide" class="pref-section">
          <SectionHeader title="Glide path" :on-reset="() => resetSection('glide')" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Pfau-Kitces rising-equity glide path per audit Entry #7. When enabled, your equity
            allocation tapers from the start % to the end % over the taper window. The FIRE
            projection starts from your blended return today and de-risks it over the taper —
            each percentage point of equity you shed lowers the projected return by the
            equity-vs-debt gap — so a glide produces a more conservative corpus and a later (never
            earlier) FIRE date (gh-issue #9).
          </p>
          <v-switch
            :model-value="glide.enabled"
            label="Enable glide-path de-risking"
            color="primary"
            hide-details
            class="mb-3"
            @update:model-value="(v: boolean | null) => { glide = { ...glide, enabled: !!v } }"
          />
          <v-row v-if="glide.enabled">
            <v-col cols="12" md="4">
              <v-text-field
                label="Start equity (%)"
                type="number"
                :model-value="glide.startEquityPercent"
                variant="outlined"
                density="comfortable"
                @update:model-value="(val: string) => { glide = { ...glide, startEquityPercent: Number(val) } }"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                label="End equity (%)"
                type="number"
                :model-value="glide.endEquityPercent"
                variant="outlined"
                density="comfortable"
                @update:model-value="(val: string) => { glide = { ...glide, endEquityPercent: Number(val) } }"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                label="Taper window (years)"
                type="number"
                :model-value="glide.taperWindowYears"
                variant="outlined"
                density="comfortable"
                @update:model-value="(val: string) => { glide = { ...glide, taperWindowYears: Number(val) } }"
              />
            </v-col>
          </v-row>
        </section>

        <!-- §Withdrawal -->
        <section id="pref-section-withdrawal" class="pref-section">
          <SectionHeader title="Withdrawal strategy" :on-reset="() => assumptions.set('withdrawalRule', DEFAULT_ASSUMPTIONS.withdrawalRule)" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            How your corpus is drawn down in retirement (audit Entry #9 A9.2).
            This shapes the post-retirement portion of your projection chart.
          </p>
          <v-radio-group
            :model-value="v.withdrawalRule"
            hide-details
            data-testid="pref-withdrawal-rule"
            @update:model-value="(val) => assumptions.set('withdrawalRule', (val as 'Constant' | 'FloorCeiling'))"
          >
            <v-radio value="Constant" data-testid="pref-withdrawal-constant">
              <template #label>
                <div>
                  <div class="font-weight-medium">Constant (default)</div>
                  <div class="text-caption text-medium-emphasis">
                    Draw a fixed inflation-adjusted amount. The projection stays a
                    pure accumulation curve (v4-faithful).
                  </div>
                </div>
              </template>
            </v-radio>
            <v-radio value="FloorCeiling" data-testid="pref-withdrawal-floor-ceiling">
              <template #label>
                <div>
                  <div class="font-weight-medium">Floor / Ceiling</div>
                  <div class="text-caption text-medium-emphasis">
                    Cut spending 10% when the corpus drops below 80% of its
                    retirement value; hold flat above 120% (no ratchet). The
                    projection adds a post-retirement decumulation phase.
                  </div>
                </div>
              </template>
            </v-radio>
          </v-radio-group>
        </section>

        <!-- §Tax preferences -->
        <section id="pref-section-tax" class="pref-section">
          <SectionHeader title="Tax preferences" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Regime selection + deduction surfacing happens on
            <router-link to="/tax-planning">Tax Planning</router-link>.
            This section is reserved for advanced tax knobs.
          </p>
        </section>

        <!-- §Statutory Reference (READ-ONLY per R1.4) -->
        <section id="pref-section-statutory" class="pref-section statutory">
          <div class="d-flex align-center mb-2" style="gap: 8px">
            <h3 class="text-h6 font-weight-bold">Statutory reference</h3>
            <v-chip size="x-small" variant="tonal" color="info">Official source · read-only</v-chip>
          </div>
          <p class="text-body-2 text-medium-emphasis mb-3">
            These values are set by the Government of India and are NEVER
            user-editable (R1.4). Updates ship via app updates when budgets
            land.
          </p>
          <v-card variant="outlined" class="pa-3" color="surface-variant">
            <div class="statutory-row">
              <span class="statutory-label">Sec 80C limit</span>
              <span class="statutory-value">₹1,50,000</span>
              <span class="statutory-source">IT Act §80C · FY 2025-26</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">Sec 80CCD(1B) NPS limit</span>
              <span class="statutory-value">₹50,000</span>
              <span class="statutory-source">IT Act §80CCD(1B)</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">Sec 80D self (non-senior)</span>
              <span class="statutory-value">₹25,000</span>
              <span class="statutory-source">IT Act §80D</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">Sec 80D self (senior)</span>
              <span class="statutory-value">₹50,000</span>
              <span class="statutory-source">IT Act §80D</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">Sec 24 home loan interest</span>
              <span class="statutory-value">₹2,00,000</span>
              <span class="statutory-source">IT Act §24(b) · per borrower</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">PPF interest rate</span>
              <span class="statutory-value" data-testid="statutory-ppf-rate">7.10%</span>
              <span class="statutory-source">Ministry of Finance · notified quarterly</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">EPF interest rate</span>
              <span class="statutory-value" data-testid="statutory-epf-rate">8.25%</span>
              <span class="statutory-source">EPFO · notified annually</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">EPF tax-free threshold</span>
              <span class="statutory-value">₹2,50,000/yr</span>
              <span class="statutory-source">Budget 2021 + CBDT notification</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">NPS lump-sum threshold</span>
              <span class="statutory-value">₹5,00,000</span>
              <span class="statutory-source">PFRDA Master Direction 2025</span>
            </div>
            <div class="statutory-row">
              <span class="statutory-label">LTCG listed exemption (post FY24-25)</span>
              <span class="statutory-value">₹1,25,000</span>
              <span class="statutory-source">IT Act §112A · FY 2024-25</span>
            </div>
          </v-card>
        </section>

        <!-- §Estate -->
        <section id="pref-section-estate" class="pref-section">
          <SectionHeader title="Estate planning" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            The 7-step estate checklist lives at
            <router-link to="/estate-planning">/estate-planning</router-link>.
            Toggle the feature in §Features below to surface the route.
          </p>
        </section>

        <!-- §Features -->
        <section id="pref-section-features" class="pref-section">
          <SectionHeader title="Feature toggles" :on-reset="() => resetSection('features')" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Each feature gates content on its host page + adds itself to
            the "Looking for X?" Discovery footer when disabled.
          </p>
          <div v-for="(group, secLabel) in featuresBySection" :key="secLabel" class="mb-4">
            <h4 class="text-subtitle-2 font-weight-bold mb-2">{{ secLabel }}</h4>
            <v-card variant="outlined">
              <v-list density="comfortable">
                <v-list-item v-for="f in group" :key="f.key">
                  <v-list-item-title>{{ f.label }}</v-list-item-title>
                  <v-list-item-subtitle class="text-wrap">{{ f.description }}</v-list-item-subtitle>
                  <template #append>
                    <v-switch
                      :model-value="features.isEnabled(f.key)"
                      color="primary"
                      hide-details
                      density="compact"
                      inset
                      :data-testid="`pref-feature-${f.key}`"
                      @update:model-value="(v: boolean | null) => features.setEnabled(f.key, !!v)"
                    />
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </div>
        </section>

        <section id="pref-section-notifications" class="pref-section">
          <SectionHeader title="Notifications & WhatsApp" :on-reset="resetComms" />
          <p class="text-body-2 text-medium-emphasis mb-3">
            Choose what FireKaro sends you on WhatsApp. Account &amp; plan alerts keep you informed
            about <em>your</em> plan; marketing insights are optional and off by default (DPDP — opt
            out anytime).
          </p>
          <v-row>
            <v-col cols="12" md="8">
              <v-switch
                v-model="waEnabled"
                color="primary"
                density="comfortable"
                :loading="waSaving"
                hide-details
                data-testid="pref-comms-whatsapp"
                label="Receive WhatsApp updates about my plan (welcome, milestones, alerts)"
                @update:model-value="onWaToggle"
              />
              <v-switch
                v-model="waMarketing"
                color="primary"
                density="comfortable"
                :disabled="!waEnabled"
                :loading="waSaving"
                hide-details
                data-testid="pref-comms-marketing"
                label="Also send monthly insights & tips (marketing — optional)"
                @update:model-value="saveComms"
              />
              <v-expand-transition>
                <v-text-field
                  v-if="waEnabled"
                  v-model="waNumber"
                  class="mt-3"
                  variant="outlined"
                  density="comfortable"
                  prefix="+"
                  type="tel"
                  inputmode="numeric"
                  :rules="waNumberRules"
                  :loading="waSaving"
                  data-testid="pref-comms-whatsapp-number"
                  label="WhatsApp number (with country code)"
                  hint="We send to this number only. Include the country code, e.g. 91XXXXXXXXXX."
                  persistent-hint
                  @blur="saveComms"
                />
              </v-expand-transition>
            </v-col>
          </v-row>
        </section>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
import { defineComponent, h } from "vue";

// SectionHeader — title + optional per-section "Reset" button.
const SectionHeader = defineComponent({
  name: "SectionHeader",
  props: {
    title: { type: String, required: true },
    onReset: { type: Function, default: null },
  },
  setup(props) {
    return () =>
      h("div", { class: "d-flex align-center justify-space-between mb-2", style: "gap: 8px" }, [
        h("h3", { class: "text-h6 font-weight-bold" }, props.title),
        props.onReset
          ? h(
              "button",
              {
                class: "v-btn v-btn--variant-outlined v-btn--size-x-small text-caption",
                style: "padding: 4px 10px; border: 1px solid rgba(var(--v-theme-on-surface), 0.2); border-radius: 6px; background: transparent; cursor: pointer",
                "data-testid": "pref-section-reset",
                onClick: () => props.onReset && props.onReset(),
              },
              "Reset section",
            )
          : null,
      ]);
  },
});

// ReturnField — labelled percentage input.
const ReturnField = defineComponent({
  name: "ReturnField",
  props: {
    label: { type: String, required: true },
    pct: { type: Number, required: true },
  },
  emits: ["update"],
  setup(props, { emit }) {
    return () =>
      h("input", {
        class: "v-field__input",
        style: "width:100%; padding: 12px; border: 1px solid rgba(var(--v-theme-on-surface), 0.22); border-radius: 6px;",
        type: "number",
        step: "0.1",
        value: (props.pct * 100).toFixed(1),
        "aria-label": `${props.label} expected return percent`,
        onInput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (!Number.isNaN(v)) emit("update", v / 100);
        },
      });
  },
});

export default {
  components: { SectionHeader, ReturnField },
};
</script>

<style scoped>
.preferences-page {
  max-width: 1400px;
  margin: 0 auto;
}
.sticky-nav {
  position: sticky;
  top: 16px;
}
.mobile-nav {
  overflow-x: auto;
  flex-wrap: nowrap;
}
.pref-section {
  scroll-margin-top: 24px;
  padding: 24px 0 32px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.pref-section.statutory {
  background: rgba(var(--v-theme-info), 0.04);
  padding: 24px;
  border-radius: 8px;
  border-bottom: none;
  margin-bottom: 24px;
}
.statutory-row {
  display: grid;
  grid-template-columns: 2fr 1fr 2fr;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.statutory-row:last-child { border-bottom: none; }
.statutory-label { font-weight: 500; }
.statutory-value { font-family: 'JetBrains Mono', monospace; text-align: right; }
.statutory-source {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.875rem;
}
</style>

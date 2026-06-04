<script setup lang="ts">
/**
 * LifecycleDigestCard — the in-app "Since you were away" digest.
 *
 * On each visit it diffs the LIVE derive() headline (read via useFireDerive — never
 * a re-call of the math) against the persisted baseline snapshot in the ui store,
 * and surfaces the meaningful change FIRE-date-delta-first. It is the in-app
 * destination the outbound WhatsApp lifecycle nudge deep-links to (?digest=open).
 *
 * Re-baseline is STATE-delta-driven (honest): dismiss/acknowledge captures the live
 * snapshot so only NET-NEW change shows next visit; the very first visit (no
 * baseline) captures silently and renders nothing. No wall-clock "time away" gate.
 */
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { useFireDerive } from "@/lib/useFireDerive";
import { evaluateNudges } from "@/lib/nudge-engine";
import { derivedFamilyLayer } from "@/lib/derived-records";
import { analyzeLifestyleInflation, detectGoalPostShift } from "@/lib/expense-history";
import {
  captureSnapshot,
  computeLifecycleDigest,
  type SnapshotInputs,
  type LifecycleSnapshot,
} from "@/lib/lifecycle-digest";
import { formatINRCompact } from "@/lib/formatters";

const route = useRoute();
const household = useHouseholdStore();
const assumptions = useAssumptionsStore();
const ui = useUiStore();
const fire = useFireDerive();

// `now` fixed at setup so the displayed digest doesn't churn; dismiss/first-load
// re-capture with a fresh timestamp via buildLive(new Date()).
const setupNow = new Date();

// Snapshot inputs assembled from the useFireDerive computeds (derive() output via
// the wrapper — NOT a second derive() call).
const inputs = computed<SnapshotInputs>(() => ({
  anchorAge: fire.anchorAge.value,
  yearsToRegular: fire.yearsToRegular.value,
  fireWithdrawableCorpus: fire.fireWithdrawableCorpus.value,
  fireNumber: fire.fireNumber.value,
  savingsRate: fire.savingsRate.value,
  realBlendedReturn: fire.realBlendedReturn.value,
  realReturnSchedule: fire.realReturnSchedule.value,
  portfolioVolatility: fire.portfolioVolatility.value,
  monthlyContribution: fire.monthlyContribution.value,
}));

// Full firing-nudge id set (NOT route/dismiss-filtered) — the digest's "new nudges"
// is the set-diff of these vs the baseline (contract decision 4).
const activeNudgeIds = computed<string[]>(() => {
  const recommended = fire.householdTaxRecommendation.value?.recommended;
  const taxableIncome =
    recommended === "OLD"
      ? fire.annualIncome.value.total - fire.estimatedDeductionsForOld()
      : fire.annualIncome.value.total;
  void household.snapshotVersion;
  return evaluateNudges({
    household: household.data,
    family: derivedFamilyLayer(household.data),
    annualExpenses: fire.annualExpensesToday.value,
    taxableIncome,
    fy: ui.currentFY ?? "2025-26",
    marginalSlabRate: fire.householdMarginalRate.value,
    currentMonth: setupNow.getMonth(),
    lifestyleInflation: analyzeLifestyleInflation(assumptions.householdInflation()),
    goalPostShift: detectGoalPostShift(),
    // Default lens is whole-household (#22), so fire.annualSavings is the household surplus.
    monthlySurplus: Math.round(fire.annualSavings.value / 12),
  }).map((n) => n.id);
});

// Persisted capture (dismiss / silent first-load) — full snapshot incl. the MC p50.
function buildLive(now: Date): LifecycleSnapshot {
  return captureSnapshot(inputs.value, activeNudgeIds.value, now);
}

const baseline = computed(() => ui.lifecycleSnapshot);
// Display digest reads only the diff fields — skip the MC sim (FireHero already
// pays for one; the digest's MC field is never diffed) to avoid a redundant run.
const digest = computed(() =>
  computeLifecycleDigest(
    captureSnapshot(inputs.value, activeNudgeIds.value, setupNow, { skipMonteCarlo: true }),
    baseline.value,
  ),
);

const hasHousehold = computed(() => household.members.length > 0);
const show = computed(() => hasHousehold.value && digest.value.hasMeaningfulChange);

// ---- Display helpers ----

const nowFireAge = computed(() => {
  const age = inputs.value.anchorAge + inputs.value.yearsToRegular;
  return Number.isFinite(age) && age > 0 ? Math.ceil(age) : null;
});

function formatDelta(years: number): string {
  const months = Math.round(Math.abs(years) * 12);
  if (months >= 12) {
    const y = Math.round((months / 12) * 10) / 10;
    return `${y} year${y === 1 ? "" : "s"}`;
  }
  return `${months} month${months === 1 ? "" : "s"}`;
}

const fireLine = computed(() => {
  const d = digest.value;
  if (d.fireDirection === "same") {
    return nowFireAge.value != null
      ? `Your plan moved, but your FIRE date held steady at age ${nowFireAge.value}.`
      : "Your plan moved since you were away.";
  }
  const dir = d.fireDirection === "earlier" ? "earlier" : "later";
  const agePart = nowFireAge.value != null ? ` — now age ${nowFireAge.value}` : "";
  return `Your FIRE date moved ${formatDelta(d.fireAgeDeltaYears)} ${dir}${agePart}.`;
});

// Direction-aware accent (rules/vuetify-conventions.md trend rule): a LOWER FIRE
// age (earlier) is good → success; later → warning; steady-but-changed → primary.
const accentColor = computed(() =>
  digest.value.fireDirection === "earlier"
    ? "success"
    : digest.value.fireDirection === "later"
      ? "warning"
      : "primary",
);
const accentIcon = computed(() =>
  digest.value.fireDirection === "earlier"
    ? "mdi-trending-down"
    : digest.value.fireDirection === "later"
      ? "mdi-trending-up"
      : "mdi-calendar-clock",
);

const corpusLine = computed(() => {
  const delta = digest.value.corpusDelta;
  if (delta === 0) return null;
  const sign = delta > 0 ? "+" : "−";
  return `Corpus ${sign}${formatINRCompact(Math.abs(delta))} since then`;
});

const savingsLine = computed(() => {
  const delta = digest.value.savingsRateDeltaPct;
  if (Math.abs(delta) < 0.5) return null;
  const sign = delta > 0 ? "+" : "−";
  return `Savings rate ${sign}${Math.abs(Math.round(delta))} pts`;
});

const nudgeLine = computed(() => {
  const n = digest.value.newNudgeIds.length;
  if (n === 0) return null;
  return `${n} new suggestion${n === 1 ? "" : "s"} for you`;
});

const milestoneLine = computed(() => {
  const m = digest.value.milestoneCrossed;
  return m != null && m > 0 ? `You crossed the ${m}% milestone 🎉` : null;
});

const sinceLabel = computed(() => relativeSince(digest.value.sinceCapturedAt, setupNow));

function relativeSince(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const ms = now.getTime() - then.getTime();
  if (ms < 0) return "just now";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "just now";
}

const cardRef = ref<HTMLElement | null>(null);

function acknowledge() {
  // Re-baseline to the live state → only NET-NEW change shows next visit.
  ui.captureLifecycleSnapshot(buildLive(new Date()));
}

onMounted(() => {
  if (!hasHousehold.value) return;
  // First-ever load (no baseline): silently capture so the next change has a diff base.
  if (baseline.value == null) {
    ui.captureLifecycleSnapshot(buildLive(new Date()));
    return;
  }
  // Deep-link (?digest=open) — scroll the open card into view for the WhatsApp nudge landing.
  if (route.query.digest === "open" && show.value) {
    cardRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});
</script>

<template>
  <v-card
    v-if="show"
    id="lifecycle-digest"
    ref="cardRef"
    variant="tonal"
    :color="accentColor"
    class="lifecycle-digest mb-4"
    data-testid="lifecycle-digest-card"
  >
    <v-card-text>
      <div class="d-flex align-start" style="gap: 12px">
        <v-icon :icon="accentIcon" :color="accentColor" size="28" />
        <div class="flex-grow-1">
          <div class="text-overline d-flex align-center" style="gap: 6px">
            Since you were away
            <span v-if="sinceLabel" class="text-medium-emphasis text-caption">· {{ sinceLabel }}</span>
          </div>
          <div class="text-subtitle-1 font-weight-bold mt-1" data-testid="lifecycle-digest-fire-line">
            {{ fireLine }}
          </div>
          <div class="d-flex flex-wrap ga-2 mt-2">
            <v-chip v-if="milestoneLine" size="small" color="success" variant="flat" data-testid="lifecycle-digest-milestone">
              <v-icon icon="mdi-flag-checkered" size="x-small" class="mr-1" />
              {{ milestoneLine }}
            </v-chip>
            <v-chip v-if="corpusLine" size="small" variant="tonal" data-testid="lifecycle-digest-corpus">
              <v-icon icon="mdi-cash" size="x-small" class="mr-1" />
              {{ corpusLine }}
            </v-chip>
            <v-chip v-if="savingsLine" size="small" variant="tonal" data-testid="lifecycle-digest-savings">
              <v-icon icon="mdi-percent" size="x-small" class="mr-1" />
              {{ savingsLine }}
            </v-chip>
            <!-- Informational only — the matching suggestions render in the
                 NudgeStack just below on this same dashboard. -->
            <v-chip
              v-if="nudgeLine"
              size="small"
              variant="tonal"
              color="info"
              data-testid="lifecycle-digest-nudges"
            >
              <v-icon icon="mdi-lightbulb-on" size="x-small" class="mr-1" />
              {{ nudgeLine }}
            </v-chip>
          </div>
        </div>
        <v-btn
          icon
          variant="text"
          size="small"
          data-testid="lifecycle-digest-dismiss"
          aria-label="Dismiss the since-you-were-away digest"
          @click="acknowledge"
        >
          <v-icon icon="mdi-close" size="small" />
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.lifecycle-digest {
  border-radius: var(--radius-lg, 16px);
}
.lifecycle-digest .text-overline {
  letter-spacing: var(--tracking-wide);
  font-weight: var(--weight-semibold);
}
</style>

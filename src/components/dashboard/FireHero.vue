<script setup lang="ts">
/**
 * FireHero — the Option-D verdict hero (design SSOT:
 * docs/design/2026-06-10-fire-dashboard-redesign/option-d-merged.html).
 *
 * Anatomy: eyebrow → big FIRE age → subline (years/date · honest confidence range ·
 * conditional "since you were away" delta) → 3-slot KPI strip (Vs your plan / Corpus
 * progress / Biggest win) → compact stats line. Tint follows the plan-variance verdict
 * tone (resolveHeroTone): ahead/on-track = success, behind = warning, no-baseline =
 * the neutral fire-orange gradient. Red is never a hero state.
 *
 * Honesty invariants kept from the pre-Option-D hero (relocation, zero data loss):
 * confidence band (#18) non-removable; bridge-gated headline subline (#15); the
 * household-primary headline (#22/#66) — same useFireDerive fields as before.
 */
import { computed, onMounted } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { usePlanBaseline } from "@/composables/usePlanBaseline";
import { computePlanVariance } from "@/lib/plan-variance";
import { useAcceleration } from "@/composables/useAcceleration";
import { useLifecycleDigest } from "@/composables/useLifecycleDigest";
import { resolveHeroTone } from "@/lib/dashboard-verdict";
import { describeFireConfidenceBand } from "@/lib/fire-confidence-band";
import { MAX_PROJECTION_YEARS } from "@/lib/monte-carlo";
import { formatINRCompact, formatYearsMonths } from "@/lib/formatters";
import InfoTip from "@/components/shared/InfoTip.vue";

const fire = useFireDerive();
const h = useHouseholdStore();
const a = useAssumptionsStore();
const ui = useUiStore();

// ---- Headline (age + when) ----

const finiteYears = computed(() => Number.isFinite(fire.yearsToRegular.value));
const achieved = computed(() => finiteYears.value && fire.yearsToRegular.value <= 0);
const fireYear = computed(() => new Date().getFullYear() + Math.ceil(fire.yearsToRegular.value || 0));
const fireAge = computed(() => {
  if (!Number.isFinite(fire.anchorAge.value)) return null;
  return fire.anchorAge.value + Math.ceil(fire.yearsToRegular.value || 0);
});

// ---- #18 Monte Carlo confidence band (NON-REMOVABLE honesty surface) ----
// Compact range in the subline (mockup: "most likely 48–62 allowing for markets");
// the full history-informed disclosure stays one hover away in the tooltip. The
// never-reached sentinel is never rendered as a literal age (fire-confidence-band rule).
const band = computed<{ offChart: boolean; text: string } | null>(() => {
  if (!finiteYears.value || fire.yearsToRegular.value <= 0) return null;
  const mc = fire.monteCarlo.value;
  if (!mc || !Number.isFinite(mc.p10Years) || !Number.isFinite(mc.p90Years)) return null;
  const p10 = Math.ceil(mc.p10Years);
  const p90 = Math.ceil(mc.p90Years);
  const anchor = fire.anchorAge.value;
  const hasAge = Number.isFinite(anchor);
  if (p90 >= MAX_PROJECTION_YEARS) {
    return {
      offChart: true,
      text:
        p10 >= MAX_PROJECTION_YEARS
          ? "markets swing — most scenarios don't reach FIRE within a working lifetime at your current savings"
          : `markets swing — lucky markets could bring FIRE in ~${p10} yrs, unlucky ones beyond your horizon`,
    };
  }
  return {
    offChart: false,
    text: hasAge ? `${anchor + p10}–${anchor + p90}` : `${p10}–${p90} yrs out`,
  };
});
const fullBandCopy = computed(() =>
  describeFireConfidenceBand(fire.monteCarlo.value, fire.yearsToRegular.value, fire.anchorAge.value),
);

// #15 bridge: when the liquid-runway bridge pushes the headline FIRE age later than the
// corpus-only adequacy age, surface BOTH so the honest headline doesn't hide it.
const bridgeSubline = computed(() => {
  const bc = fire.bridgeCoverage.value;
  if (!bc || bc.covered) return null;
  return `Corpus target is reached at age ${bc.corpusOnlyFireAge} — but locked savings (PPF / NPS / pre-tax) keep your money from being fully spendable then, so sustainable FIRE is age ${bc.effectiveFireAge}.`;
});

// ---- "Since you were away" delta (folded in from LifecycleDigestCard, same logic) ----
const digest = useLifecycleDigest();
onMounted(() => digest.ensureBaseline());
const deltaClass = computed(() => (digest.accentColor.value === "success" ? "text-success" : "text-warning"));

// ---- KPI slot 1: Vs your plan (plan-variance #138) ----
const { baseline, lockBaseline } = usePlanBaseline();
// A baseline whose stored yearsToFire is not a finite number can't support ANY verdict: an
// Infinity captured pre-guard JSON-round-trips to null, and (null − current)×12 coerces to a
// finite-but-FABRICATED "behind" claim (code-review H1, 2026-06-10). Validate at the seam.
const baselineUsable = computed(() => !!baseline.value && Number.isFinite(baseline.value.yearsToFire));
const variance = computed(() => {
  if (!baseline.value || !baselineUsable.value) return null;
  return computePlanVariance({
    baseline: baseline.value,
    household: h.data,
    currentAssumptions: a.values,
    lens: { isFamilyView: ui.isFamilyView, viewingMemberId: ui.viewingMemberId, currentFY: ui.currentFY },
    nowMs: Date.now(),
  });
});
// Non-finite delta (e.g. the plan became unprojectable) → null → the no-claim tone; never
// render a sentinel as a literal number (the fire-confidence-band rule, applied here too).
const heroTone = computed(() => {
  const d = variance.value?.fireDateDeltaMonths;
  return resolveHeroTone({
    hasBaseline: !!baseline.value,
    fireDateDeltaMonths: d != null && Number.isFinite(d) ? d : null,
  });
});
// Tint class — neutral whenever there is no finite date to make a verdict about.
const toneClass = computed(() => (finiteYears.value ? `fire-hero--${heroTone.value}` : "fire-hero--no-baseline"));

const lockedOn = computed(() =>
  baseline.value
    ? new Date(baseline.value.capturedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "",
);
const planSlot = computed(() => {
  if (!baseline.value) return null;
  const d = variance.value?.fireDateDeltaMonths;
  // Guarded for display: heroTone already falls back to "no-baseline" (the "—" branch below)
  // whenever d is non-finite, so m is only ever rendered for a real, finite claim.
  const m = d != null && Number.isFinite(d) ? Math.abs(Math.round(d)) : 0;
  switch (heroTone.value) {
    case "ahead":
      return { cls: "text-success", value: `▲ ${m} mo ahead`, sub: `vs the plan you locked ${lockedOn.value}` };
    case "behind":
      return { cls: "text-warning", value: `▼ ${m} mo behind`, sub: `vs the plan you locked ${lockedOn.value}` };
    case "on-track":
      return { cls: "text-success", value: "✓ On track", sub: `right on the plan you locked ${lockedOn.value}` };
    default:
      // Baseline exists but the delta is indeterminate — make no claim (rule 20/31).
      return { cls: "", value: "—", sub: `plan locked ${lockedOn.value}` };
  }
});

// ---- KPI slot 3: Biggest win available (#48 — reuses the card's ranking, never re-ranks) ----
const accel = useAcceleration();
const reachableWins = computed(() => accel.rankedLevers.value.filter((l) => l.reachable && l.deltaYears > 0));
const topWin = computed(() => reachableWins.value[0] ?? null);
const moreWinsCount = computed(() => Math.max(0, reachableWins.value.length - 1));
// When the accessible-money bridge sets the date, per-lever scalar deltas overstate the real
// saving (rule 31) — the slot then points at the binding constraint instead of a number.
const bridgeBinding = computed(() => accel.bridgeBinding.value);
const showWinSlot = computed(() => bridgeBinding.value || topWin.value !== null);

function yearsLabel(years: number): string {
  const abs = Math.abs(years);
  if (abs < 1) return `${Math.round(abs * 12)} mo`;
  return `${abs.toFixed(1)} yr${abs >= 2 ? "s" : ""}`;
}
</script>

<template>
  <v-card variant="outlined" class="fire-hero pa-5 mb-4" :class="toneClass" data-testid="fire-hero">
    <!-- Verdict block -->
    <div class="text-center">
      <template v-if="achieved">
        <div class="fire-hero__eyebrow">Your FIRE status</div>
        <div class="fire-hero__age fire-hero__age--text" data-testid="fire-hero-age">
          You're already at Regular FIRE — congratulations!
        </div>
      </template>
      <template v-else-if="!finiteYears">
        <div class="fire-hero__eyebrow">You'll FIRE at age</div>
        <div class="fire-hero__age fire-hero__age--text" data-testid="fire-hero-age">—</div>
        <div class="fire-hero__when">Increase income or savings to project a FIRE date.</div>
      </template>
      <template v-else>
        <div class="fire-hero__eyebrow">{{ fireAge != null ? "You'll FIRE at age" : "You'll FIRE in" }}</div>
        <div class="fire-hero__age" data-testid="fire-hero-age">
          {{ fireAge ?? formatYearsMonths(fire.yearsToRegular.value) }}
        </div>
        <div class="fire-hero__when">
          in <b>{{ formatYearsMonths(fire.yearsToRegular.value) }}</b> ({{ fireYear }})
          <template v-if="band">
            <span class="fire-hero__sep">·</span>
            <span data-testid="fire-hero-confidence-subline">
              <template v-if="band.offChart">{{ band.text }}</template>
              <template v-else>most likely <b>{{ band.text }}</b> allowing for markets</template>
              <v-tooltip location="bottom" max-width="380" aria-label="How the confidence range is modelled">
                <template #activator="{ props: tipProps }">
                  <button type="button" v-bind="tipProps" class="fire-hero__band-info" aria-label="How the confidence range is modelled">
                    <v-icon icon="mdi-chart-bell-curve" size="14" aria-hidden="true" />
                  </button>
                </template>
                <div class="text-body-2">{{ fullBandCopy }}</div>
              </v-tooltip>
            </span>
          </template>
          <template v-if="digest.heroDeltaText.value">
            <span class="fire-hero__sep">·</span>
            <span :class="deltaClass" data-testid="hero-digest-delta">{{ digest.heroDeltaText.value }}</span>
            <button
              type="button"
              class="fire-hero__delta-dismiss"
              data-testid="hero-digest-dismiss"
              aria-label="Dismiss the since-you-were-away delta"
              @click="digest.acknowledge()"
            >
              <v-icon icon="mdi-close" size="12" aria-hidden="true" />
            </button>
          </template>
        </div>
      </template>

      <p v-if="bridgeSubline" class="fire-hero__subline" data-testid="fire-hero-bridge-subline">
        <v-icon icon="mdi-lock-clock" size="16" color="warning" class="mr-1" />
        {{ bridgeSubline }}
      </p>
    </div>

    <!-- KPI strip (3 slots, hairline-separated; stacks < md) -->
    <div class="kpi-strip mt-4" data-testid="hero-kpi-strip">
      <div class="kpi">
        <div class="kpi__label">Vs your plan</div>
        <template v-if="planSlot">
          <div class="kpi__value" :class="planSlot.cls" data-testid="hero-kpi-plan">{{ planSlot.value }}</div>
          <div class="kpi__sub">{{ planSlot.sub }}</div>
        </template>
        <!-- Lock only when there is a projectable plan to lock — capturing an Infinity
             yearsToFire seeds the fabricated-claim class (code-review M4/H1). -->
        <template v-else-if="finiteYears">
          <v-btn
            size="small"
            color="primary"
            variant="flat"
            prepend-icon="mdi-lock-check"
            class="mt-1"
            data-testid="plan-variance-lock"
            @click="lockBaseline"
          >
            Lock this as my plan
          </v-btn>
          <div class="kpi__sub mt-1">then see — honestly — how you track against it</div>
        </template>
        <template v-else>
          <div class="kpi__value">—</div>
          <div class="kpi__sub">add income or savings first — there's no projectable plan to lock yet</div>
        </template>
      </div>

      <div class="kpi">
        <div class="kpi__label">Corpus progress</div>
        <div class="kpi__value text-currency" data-testid="hero-kpi-corpus">
          {{ formatINRCompact(fire.totalCorpus.value) }}
          <span class="kpi__target">/ {{ formatINRCompact(fire.fireNumber.value) }}
            <InfoTip term="fire-number"><span class="d-sr-only">target</span></InfoTip>
          </span>
        </div>
        <div class="progress-wrap my-1">
          <v-progress-linear
            :model-value="fire.progressPercent.value"
            height="9"
            rounded
            color="fire-orange"
            bg-color="surface-variant"
            :aria-label="`FIRE progress: ${fire.progressPercent.value}% of target corpus reached`"
          />
        </div>
        <div class="kpi__sub">
          {{ fire.progressPercent.value }}% of target ·
          <InfoTip term="savings-rate">saving</InfoTip>&nbsp;{{ fire.savingsRate.value }}% ·
          <InfoTip term="swr">SWR</InfoTip>&nbsp;{{ (fire.effectiveSWR.value * 100).toFixed(2) }}%
        </div>
      </div>

      <div v-if="showWinSlot" class="kpi">
        <div class="kpi__label">Biggest win available</div>
        <template v-if="bridgeBinding">
          <div class="kpi__value" data-testid="hero-kpi-win">Close your bridge gap first</div>
          <div class="kpi__sub">your date is liquidity-limited — see the bridge card below</div>
        </template>
        <template v-else-if="topWin">
          <div class="kpi__value" data-testid="hero-kpi-win">
            {{ topWin.label }} <span class="text-success">→ {{ yearsLabel(topWin.deltaYears) }} sooner</span>
          </div>
          <div class="kpi__sub">
            <template v-if="moreWinsCount > 0">{{ moreWinsCount }} more win{{ moreWinsCount === 1 ? "" : "s" }} ranked below ↓</template>
            <template v-else>ranked from your own numbers — details below ↓</template>
          </div>
        </template>
      </div>
    </div>

    <!-- Compact stats line (relocated from the old stat blocks — zero data loss; the
         demo tour targets .fire-hero .stat-block). -->
    <div class="fire-hero__stats d-flex flex-wrap justify-center ga-6 mt-3">
      <div class="stat-block">
        <span class="stat-block__label">Annual savings</span>
        <span class="stat-block__value text-currency">{{ formatINRCompact(fire.annualSavings.value) }}</span>
      </div>
      <div class="stat-block">
        <span class="stat-block__label">Monthly take-home</span>
        <span class="stat-block__value text-currency">{{ formatINRCompact(fire.monthlyTakeHome.value) }}</span>
      </div>
      <div class="stat-block">
        <span class="stat-block__label">Blended return (assumed)</span>
        <span class="stat-block__value text-currency">{{ (fire.blendedReturn.value * 100).toFixed(1) }}%</span>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
/* Neutral (no-baseline / no projectable date) — the pre-Option-D fire-orange gradient. */
.fire-hero,
.fire-hero--no-baseline {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.06), rgba(24, 103, 192, 0.04));
  border-color: rgba(249, 115, 22, 0.3) !important;
}
/* Verdict tints (contract §2.3): ahead/on-track → success; behind → warning; never red. */
.fire-hero--ahead,
.fire-hero--on-track {
  background: linear-gradient(135deg, rgba(var(--v-theme-success), 0.08), rgba(var(--v-theme-success), 0.01));
  border-color: rgba(var(--v-theme-success), 0.4) !important;
}
.fire-hero--behind {
  background: linear-gradient(135deg, rgba(var(--v-theme-warning), 0.09), rgba(var(--v-theme-warning), 0.01));
  border-color: rgba(var(--v-theme-warning), 0.45) !important;
}

.fire-hero__eyebrow {
  font-size: 12px;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  font-weight: var(--weight-semibold);
  color: var(--text-muted);
}
.fire-hero__age {
  font-family: var(--font-display);
  font-size: clamp(44px, 7vw, 62px);
  font-weight: 800;
  line-height: 1.05;
  color: var(--text-primary);
}
.fire-hero__age--text {
  font-size: var(--type-xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  padding: var(--space-2) 0;
}
.fire-hero__when {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  margin-top: 2px;
}
.fire-hero__when b {
  color: var(--text-primary);
}
.fire-hero__sep {
  margin: 0 4px;
  color: var(--text-muted);
}
.fire-hero__band-info,
.fire-hero__delta-dismiss {
  background: transparent;
  border: none;
  /* ≥20px hit target for the inline icon buttons (a11y — code-review L5). */
  padding: 4px 4px 4px 6px;
  margin: -4px 0;
  cursor: pointer;
  color: var(--text-muted);
  vertical-align: middle;
}
.fire-hero__subline {
  font-size: var(--type-sm);
  line-height: var(--leading-snug);
  color: var(--text-secondary);
  margin: var(--space-2) auto 0;
  max-width: 760px;
}

/* KPI strip — 3 hairline-separated slots; stacks below md with horizontal hairlines. */
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-3);
  text-align: left;
}
.kpi {
  padding: 0 var(--space-4);
  border-left: 1px solid var(--border-subtle);
  min-width: 0;
}
.kpi:first-child {
  border-left: none;
  padding-left: var(--space-1);
}
@media (max-width: 959px) {
  .kpi-strip {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
  .kpi {
    border-left: none;
    border-top: 1px solid var(--border-subtle);
    padding: var(--space-2) var(--space-1) 0;
  }
  .kpi:first-child {
    border-top: none;
    padding-top: 0;
  }
}
.kpi__label {
  font-size: 11px;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: var(--weight-bold);
}
.kpi__value {
  font-size: var(--type-lg);
  font-weight: 800;
  margin-top: 3px;
  color: var(--text-primary);
}
.kpi__target {
  color: var(--text-muted);
  font-weight: var(--weight-medium);
  font-size: var(--type-sm);
}
.kpi__sub {
  font-size: var(--type-xs);
  color: var(--text-muted);
  margin-top: 2px;
}

.fire-hero__stats {
  border-top: 1px dashed var(--border-subtle);
  padding-top: var(--space-2);
}
.stat-block {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.stat-block__label {
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-size: 10px;
  font-weight: var(--weight-medium);
}
.stat-block__value {
  font-size: var(--type-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
</style>

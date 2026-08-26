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
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useFireDerive } from "@/lib/useFireDerive";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { usePlanBaseline } from "@/composables/usePlanBaseline";
import { computePlanVariance } from "@/lib/plan-variance";
import { useAcceleration } from "@/composables/useAcceleration";
import { useLifecycleDigest } from "@/composables/useLifecycleDigest";
import { resolveHeroTone, resolveGapTone } from "@/lib/dashboard-verdict";
import { describeFireConfidenceBand } from "@/lib/fire-confidence-band";
import { MAX_PROJECTION_YEARS } from "@/lib/monte-carlo";
import { formatINRCompact, formatYearsMonths } from "@/lib/formatters";
import InfoTip from "@/components/shared/InfoTip.vue";

const fire = useFireDerive();
const h = useHouseholdStore();
const a = useAssumptionsStore();
const ui = useUiStore();

// ---- Headline (age + when) ----
// D-2026-06-13-02: the headline reads the ONE member-lensed selector. On the default
// "Whole household" view hh carries exactly today's household fields (byte-identical);
// under "Viewing as <member>" it carries that adult's honest individual FIRE (option B —
// the household-only sub-parts below are hidden and the member caveat renders instead).
const hh = computed(() => fire.heroHeadline.value);

const finiteYears = computed(() => Number.isFinite(hh.value.yearsToFire));
// "Achieved" is a household-plan verdict — under a member lens the headline renders the
// member's age (their current age when already covered), not the household congratulation.
const achieved = computed(() => !hh.value.isMember && finiteYears.value && hh.value.yearsToFire <= 0);
// Member year uses ROUND so it stays coherent with individualFireAge (= round(anchor + raw),
// integer anchor) — pairing a ceil'd year with a rounded age drifts by 1 for fractional years
// (the #33 round-vs-ceil class). Household keeps ceil (byte-identical with householdFireAge).
const fireYear = computed(() =>
  hh.value.isMember
    ? new Date().getFullYear() + Math.round(hh.value.yearsToFire || 0)
    : new Date().getFullYear() + Math.ceil(hh.value.yearsToFire || 0),
);
const fireAge = computed(() => hh.value.fireAge);
// Member savings rate for the corpus-KPI sub — same-scope with the member headline
// (the household savingsRate beside an individual target would mix scopes).
const savingsRateDisplay = computed(() =>
  hh.value.isMember ? fire.memberFinancials.value.savingsRatePercent : fire.savingsRate.value,
);

// ---- #18 Monte Carlo confidence band (NON-REMOVABLE honesty surface) ----
// Compact range in the subline (mockup: "most likely 48–62 allowing for markets");
// the full history-informed disclosure stays one hover away in the tooltip. The
// never-reached sentinel is never rendered as a literal age (fire-confidence-band rule).
const band = computed<{ offChart: boolean; text: string } | null>(() => {
  // The MC band models the HOUSEHOLD plan — hidden under a member lens (option B). The
  // early return also keeps the lazy Monte Carlo from running while lensed.
  if (hh.value.isMember) return null;
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
  // Household-only (the bridge models the household's locked money) — hidden under a member lens.
  if (hh.value.isMember) return null;
  const bc = fire.bridgeCoverage.value;
  if (!bc || bc.covered) return null;
  return `Corpus target is reached at age ${bc.corpusOnlyFireAge} — but locked savings (PPF / NPS / pre-tax) keep your money from being fully spendable then, so sustainable FIRE is age ${bc.effectiveFireAge}.`;
});

// ---- "Since you were away" delta (folded in from LifecycleDigestCard, same logic) ----
// The hero is also the WhatsApp lifecycle nudge's deep-link landing (?digest=open +
// the #lifecycle-digest anchor) now that the standalone card is off this page.
const route = useRoute();
// v-card template ref resolves to the component instance — unwrap $el for the DOM node.
const heroEl = ref<{ $el?: HTMLElement } | null>(null);
const digest = useLifecycleDigest();
onMounted(() => {
  digest.ensureBaseline();
  if (route.query.digest === "open") {
    heroEl.value?.$el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});
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
// Tint class — neutral whenever there is no finite date to make a verdict about, AND under a
// member lens (the verdict tones depend on the household plan-variance, hidden while lensed).
const toneClass = computed(() => {
  if (hh.value.isMember) return "fire-hero--no-baseline";
  return finiteYears.value ? `fire-hero--${heroTone.value}` : "fire-hero--no-baseline";
});

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

// ================= T-377 (QN-2): the gap hero =================
// Design SSOT: docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html.
// The headline is now the age the user WANTS ("To retire at 50 you'll need ₹X"); the
// current-pace age is demoted to the honest annotation below the slider. EVERY number here
// comes from `useFireDerive().requiredContribution` (which solves through derive()) — this
// component computes no money of its own (contract §10: no parallel math).
const HERO_AGE_MIN = 40;
const HERO_AGE_MAX = 70;

const req = computed(() => fire.requiredContribution.value);
const reqPlus3 = computed(() => fire.requiredContributionAtTargetPlus3.value);

/** The shared slider age — reads/writes `ui.whatIfTargetAge`, the SAME field /what-if uses. */
const targetAge = computed<number>({
  get: () => fire.heroTargetAge.value,
  set: (v: number) => ui.setWhatIfTargetAge(v),
});
/** True once the user has dragged away from their saved plan (enables "Set as my target"). */
const sliderMoved = computed(
  () => ui.whatIfTargetAge != null && ui.whatIfTargetAge !== fire.targetRetirementAge.value,
);

const requiredFinite = computed(() => Number.isFinite(req.value.requiredMonthlyReal));
/** The action question: does the user have to put MORE in every month than they do today? */
const mustInvestMore = computed(
  () => !requiredFinite.value || req.value.requiredMonthlyReal > req.value.currentMonthlyReal,
);
const gapTone = computed(() => resolveGapTone(req.value.gapReal));
const needYear = computed(() => {
  const anchor = fire.anchorAge.value;
  const yrs = Number.isFinite(anchor) ? Math.max(0, targetAge.value - anchor) : 0;
  return new Date().getFullYear() + Math.round(yrs);
});

/** "+3 years → ₹X/month" — the mockup's "Drag to feel it" hint. */
const plus3Hint = computed(() => {
  const r = reqPlus3.value.requiredMonthlyReal;
  if (!Number.isFinite(r)) {
    return `Three more years (to ${targetAge.value + 3}) still wouldn't be enough at any realistic monthly amount.`;
  }
  return `Three more years (to ${targetAge.value + 3}) → ${formatINRCompact(r)}/month. Drag to feel it.`;
});

/** Gut-feel comparison — only when the /quick path actually recorded a guess (QN-1 writes it). */
const guessLine = computed(() => {
  const guess = ui.quick?.guess;
  if (!guess || !Number.isFinite(guess) || guess <= 0 || req.value.needReal <= 0) return null;
  const ratio = req.value.needReal / guess;
  const verdict =
    ratio > 1.15
      ? `— ${ratio.toFixed(1)}× more, and that's normal`
      : ratio < 0.85
        ? "— you were on the cautious side"
        : "— good instinct";
  return `Your gut said ${formatINRCompact(guess)} · the math says ${formatINRCompact(req.value.needReal)} ${verdict}.`;
});

/** The DEMOTED current-pace annotation (what the headline used to claim). */
const paceLine = computed(() => {
  const pace = req.value.paceFireAge;
  if (pace == null) {
    return `At today's pace you would <b>not</b> reach this number within your plan horizon — the "do this" amount is what closes it.`;
  }
  if (pace <= targetAge.value) {
    const early = targetAge.value - pace;
    return early === 0
      ? `At today's pace you'd get there right on time, at <b>${pace}</b>.`
      : `At today's pace you'd get there at <b>${pace}</b> — ${early} year${early === 1 ? "" : "s"} early.`;
  }
  const late = pace - targetAge.value;
  return `At today's pace you'd get there at <b>${pace}</b> — <b>${late} year${late === 1 ? "" : "s"} later</b> than you'd like. The "do this" amount closes that gap.`;
});

/** Persist the dragged age as the real plan (the only write the slider can make). */
function setAsMyTarget() {
  const age = targetAge.value;
  for (const m of h.earners) h.updateMember(m.id, { targetRetirementAge: age });
  ui.setWhatIfTargetAge(null); // follow the plan again now that the plan IS this age
}
function resetTargetAge() {
  ui.setWhatIfTargetAge(null);
}

function yearsLabel(years: number): string {
  const abs = Math.abs(years);
  if (abs < 1) return `${Math.round(abs * 12)} mo`;
  return `${abs.toFixed(1)} yr${abs >= 2 ? "s" : ""}`;
}
</script>

<template>
  <v-card
    id="lifecycle-digest"
    ref="heroEl"
    variant="outlined"
    class="fire-hero pa-5 mb-4"
    :class="toneClass"
    data-testid="fire-hero"
  >
    <!-- ===== T-377 (QN-2) gap hero: ONE headline = the age you WANT ===== -->
    <div class="text-center">
      <div class="fire-hero__eyebrow">
        {{ hh.isMember ? `${hh.memberName}'s individual plan — to retire at` : "To retire at" }}
      </div>
      <div class="fire-hero__age" data-testid="fire-hero-age">{{ targetAge }}</div>
      <div class="fire-hero__when" data-testid="fire-hero-need">
        you'll need <b class="text-currency">{{ formatINRCompact(req.needReal) }}</b> in today's money
        <span class="fire-hero__sep">·</span> that's
        <b class="text-currency">{{ formatINRCompact(req.needNominal) }}</b> in {{ needYear }}
      </div>

      <!-- Gut-feel comparison (only when the /quick path recorded a guess). -->
      <p v-if="guessLine" class="fire-hero__guess" data-testid="fire-hero-guess">{{ guessLine }}</p>

      <!-- The four numbers: need (above) · have by target · gap · do this. -->
      <div class="gap-tiles mt-3" data-testid="hero-gap-tiles">
        <div class="gap-tile">
          <div class="gap-tile__k">You'll have by {{ targetAge }}</div>
          <div class="gap-tile__v text-currency" data-testid="hero-have">
            {{ formatINRCompact(req.haveAtTargetReal) }}
          </div>
          <div class="gap-tile__s">
            at {{ formatINRCompact(req.currentMonthlyReal) }}/month, today's money
          </div>
        </div>
        <div class="gap-tile">
          <div class="gap-tile__k">Gap</div>
          <div
            class="gap-tile__v text-currency"
            :class="gapTone === 'short' ? 'text-warning' : gapTone === 'surplus' ? 'text-success' : ''"
            data-testid="hero-gap"
          >
            <template v-if="gapTone === 'unknown'">—</template>
            <template v-else>{{ gapTone === "short" ? "−" : "+" }}{{ formatINRCompact(Math.abs(req.gapReal)) }}</template>
          </div>
          <div class="gap-tile__s">
            {{ gapTone === "short" ? "short" : gapTone === "surplus" ? "surplus" : "not enough data to say" }}
          </div>
        </div>
        <div class="gap-tile gap-tile--act">
          <div class="gap-tile__k">Do this</div>
          <div class="gap-tile__v text-currency" data-testid="hero-required-monthly">
            <template v-if="!requiredFinite">Move the age</template>
            <template v-else-if="!mustInvestMore">You're already there</template>
            <template v-else>{{ formatINRCompact(req.requiredMonthlyReal) }} / month</template>
          </div>
          <div class="gap-tile__s">
            <template v-if="!requiredFinite">
              retiring at {{ targetAge }} is beyond any realistic monthly amount — drag the age later
            </template>
            <template v-else-if="!mustInvestMore">
              your current {{ formatINRCompact(req.currentMonthlyReal) }}/month is enough for {{ targetAge }}
            </template>
            <template v-else>
              invest this every month (you do {{ formatINRCompact(req.currentMonthlyReal) }} now) to retire at
              {{ targetAge }}
            </template>
          </div>
        </div>
      </div>

      <!-- Live what-if on the retirement age — the SAME field /fire-goals/what-if writes. -->
      <div class="hero-slider mt-4">
        <div class="hero-slider__row">
          <span>Drag your retirement age</span>
          <b class="font-mono" data-testid="hero-target-age">{{ targetAge }}</b>
        </div>
        <v-slider
          v-model="targetAge"
          :min="HERO_AGE_MIN"
          :max="HERO_AGE_MAX"
          :step="1"
          density="compact"
          color="primary"
          hide-details
          aria-label="Target retirement age"
          data-testid="hero-age-slider"
        />
        <div class="hero-slider__hint" data-testid="hero-slider-hint">{{ plus3Hint }}</div>
        <div v-if="sliderMoved" class="mt-2">
          <v-btn
            size="small"
            color="primary"
            variant="flat"
            prepend-icon="mdi-target"
            data-testid="hero-set-target"
            @click="setAsMyTarget"
          >
            Set {{ targetAge }} as my target
          </v-btn>
          <v-btn size="small" variant="outlined" class="ml-2" data-testid="hero-reset-target" @click="resetTargetAge">
            Reset
          </v-btn>
          <div class="fire-hero__when mt-1">
            dragging is a what-if — nothing is saved until you set it as your target
          </div>
        </div>
      </div>

      <!-- DEMOTED: the current-pace FIRE age (what the headline used to claim) + the
           NON-REMOVABLE #18 confidence band + the "since you were away" delta. -->
      <p class="fire-hero__pace" data-testid="fire-hero-pace">
        <span v-html="paceLine"></span>
        <template v-if="band">
          <span class="fire-hero__sep">·</span>
          <span data-testid="fire-hero-confidence-subline">
            <template v-if="band.offChart">{{ band.text }}</template>
            <template v-else>most likely <b>{{ band.text }}</b> allowing for markets</template>
            <v-tooltip location="bottom" max-width="380" aria-label="How the confidence range is modelled">
              <template #activator="{ props: tipProps }">
                <button
                  type="button"
                  v-bind="tipProps"
                  class="fire-hero__band-info"
                  aria-label="How the confidence range is modelled"
                >
                  <v-icon icon="mdi-chart-bell-curve" size="14" aria-hidden="true" />
                </button>
              </template>
              <div class="text-body-2">{{ fullBandCopy }}</div>
            </v-tooltip>
          </span>
        </template>
        <template v-if="achieved">
          <span class="fire-hero__sep">·</span>
          <span class="text-success" data-testid="fire-hero-achieved">you're already at Regular FIRE</span>
        </template>
        <template v-if="!hh.isMember && digest.heroDeltaText.value">
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
      </p>

      <p v-if="bridgeSubline" class="fire-hero__subline" data-testid="fire-hero-bridge-subline">
        <v-icon icon="mdi-lock-clock" size="16" color="warning" class="mr-1" />
        {{ bridgeSubline }}
      </p>

      <!-- D-2026-06-13-02 member caveat — the honesty anchor under the lens: names what the
           individual view excludes (children + shared split, AND the healthcare reserve +
           locked-money bridge check the household plan carries — FinTech Q7) and keeps the
           household figure one glance away. -->
      <p v-if="hh.isMember" class="fire-hero__subline" data-testid="fire-hero-member-caveat">
        This is <b>{{ hh.memberName }}'s individual</b> FIRE — it funds only their own lifestyle
        (excludes the children + their split of shared costs) and skips the healthcare reserve and
        locked-money bridge check the household plan includes.
        <template v-if="fire.householdFireAge.value != null">
          The <b>whole household</b> can stop at <b>age {{ fire.householdFireAge.value }}</b>
          ({{ formatINRCompact(fire.fireNumber.value) }}).
        </template>
        <template v-else>
          The <b>whole household</b> target is {{ formatINRCompact(fire.fireNumber.value) }}.
        </template>
        Switch to <b>Whole household</b> above for your full plan.
      </p>
    </div>

    <!-- KPI strip (3 slots, hairline-separated; stacks < md). Under a member lens the
         household-only "Vs your plan" + "Biggest win" slots are hidden (option B) — only the
         lensed corpus-progress slot remains. -->
    <div class="kpi-strip mt-4" :class="{ 'kpi-strip--single': hh.isMember }" data-testid="hero-kpi-strip">
      <div v-if="!hh.isMember" class="kpi">
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
          {{ formatINRCompact(hh.corpusForProgress) }}
          <span class="kpi__target">/ {{ formatINRCompact(hh.fireTargetForProgress) }}
            <InfoTip term="fire-number"><span class="d-sr-only">target</span></InfoTip>
          </span>
        </div>
        <div class="progress-wrap my-1">
          <v-progress-linear
            :model-value="hh.progressPercent"
            height="9"
            rounded
            color="fire-orange"
            bg-color="surface-variant"
            :aria-label="`FIRE progress: ${hh.progressPercent}% of target corpus reached`"
          />
        </div>
        <div class="kpi__sub">
          {{ hh.progressPercent }}% of target ·
          <InfoTip term="savings-rate">saving</InfoTip>&nbsp;{{ savingsRateDisplay }}%<template v-if="!hh.isMember"> ·
          <InfoTip term="swr">SWR</InfoTip>&nbsp;{{ (fire.effectiveSWR.value * 100).toFixed(2) }}%</template>
        </div>
      </div>

      <div v-if="!hh.isMember && showWinSlot" class="kpi">
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
        <span class="stat-block__value text-currency">{{ formatINRCompact(hh.annualSavings) }}</span>
      </div>
      <div class="stat-block">
        <span class="stat-block__label">Monthly take-home</span>
        <span class="stat-block__value text-currency">{{ formatINRCompact(hh.monthlyTakeHome) }}</span>
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
/* ===== T-377 (QN-2) gap hero ===== */
.fire-hero__guess {
  font-size: var(--type-sm);
  color: var(--text-secondary);
  margin: var(--space-2) auto 0;
  max-width: 640px;
}
/* The DEMOTED current-pace annotation — deliberately smaller than the headline it replaced. */
.fire-hero__pace {
  font-size: var(--type-sm);
  line-height: var(--leading-snug);
  color: var(--text-secondary);
  margin: var(--space-3) auto 0;
  max-width: 760px;
}
.fire-hero__pace b {
  color: var(--text-primary);
}
.gap-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  text-align: left;
}
.gap-tile {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-3);
  background: rgba(var(--v-theme-surface), 0.55);
}
/* "Do this" is the single action — full width, tinted, visually the loudest tile. */
.gap-tile--act {
  grid-column: 1 / -1;
  border-color: rgba(var(--v-theme-primary), 0.35);
  background: rgba(var(--v-theme-primary), 0.06);
}
.gap-tile__k {
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.gap-tile__v {
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  margin-top: 2px;
}
.gap-tile__s {
  font-size: var(--type-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}
.hero-slider__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--type-sm);
  color: var(--text-secondary);
}
.hero-slider__hint {
  font-size: var(--type-xs);
  color: var(--text-muted);
}
@media (max-width: 600px) {
  .gap-tiles {
    grid-template-columns: 1fr;
  }
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
/* Member lens: only the corpus-progress slot remains (option B) — let it span full width. */
.kpi-strip--single {
  grid-template-columns: 1fr;
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

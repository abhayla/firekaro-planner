/**
 * useLifecycleDigest — the "Since you were away" delta logic, extracted from
 * LifecycleDigestCard so the Option-D FireHero can render the FIRE-date delta in its
 * subline from the SAME single source (no duplicated diff logic). Behaviour is identical
 * to the card's original script: diff the LIVE derive() headline (via useFireDerive)
 * against the persisted baseline in the ui store; re-baseline is STATE-delta-driven
 * (acknowledge captures the live snapshot); the first-ever load captures silently.
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useUiStore } from "@/stores/ui";
import { useFireDerive } from "@/lib/useFireDerive";
import { evaluateNudges } from "@/lib/nudge-engine";
import { derivedFamilyLayer } from "@/lib/derived-records";
import { analyzeLifestyleInflation, detectGoalPostShift } from "@/lib/expense-history";
import {
  captureSnapshot,
  computeLifecycleDigest,
  isSnapshotFrameCurrent,
  type SnapshotInputs,
  type LifecycleSnapshot,
} from "@/lib/lifecycle-digest";
import { formatINRCompact } from "@/lib/formatters";

export function useLifecycleDigest() {
  const household = useHouseholdStore();
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
    realTargetDriftRate: fire.realTargetDriftRate.value,
    householdContributionSchedule: fire.householdContributionSchedule.value,
    bandContributionSchedule: fire.bandContributionSchedule.value,
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
      // ADR-0006: the kernel's ONE spending basket (`derive().householdInflation`), not a second
      // store-side resolution of the same blend — actual spend growth is compared against the
      // basket the plan itself assumes.
      lifestyleInflation: analyzeLifestyleInflation(fire.householdInflation.value),
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

  // Compact hero-subline form: "moved 1.5 years earlier since you were away" (mockup shape).
  // Null when the date held steady — the hero shows the delta segment only for a real move.
  const heroDeltaText = computed(() => {
    const d = digest.value;
    if (!show.value || d.fireDirection === "same") return null;
    const dir = d.fireDirection === "earlier" ? "earlier" : "later";
    return `moved ${formatDelta(d.fireAgeDeltaYears)} ${dir} since you were away`;
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

  /** Re-baseline to the live state → only NET-NEW change shows next visit. */
  function acknowledge() {
    ui.captureLifecycleSnapshot(buildLive(new Date()));
  }

  /**
   * First-ever load (no baseline): silently capture so the next change has a diff base.
   *
   * ADR-0006 also re-captures when the stored snapshot predates the current modelling frame. The
   * digest would otherwise open with "your FIRE date moved N years later" for every existing user on
   * their first visit after deploy — a change the model made, dressed as something they did. Silent
   * re-capture is right HERE (this baseline was always captured silently and is an internal marker);
   * the plan baseline, which the user consciously locked, is never re-locked without being asked.
   */
  function ensureBaseline() {
    if (!hasHousehold.value) return;
    if (baseline.value == null || !isSnapshotFrameCurrent(baseline.value)) {
      ui.captureLifecycleSnapshot(buildLive(new Date()));
    }
  }

  return {
    show,
    digest,
    baseline,
    hasHousehold,
    fireLine,
    heroDeltaText,
    accentColor,
    accentIcon,
    corpusLine,
    savingsLine,
    nudgeLine,
    milestoneLine,
    sinceLabel,
    acknowledge,
    ensureBaseline,
  };
}

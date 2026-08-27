/**
 * lifecycle-digest — the pure "Since you were away" delta engine.
 *
 * It captures a BASELINE snapshot of the FIRE headline state (built ENTIRELY from
 * the `derive()` kernel output — never an independent recompute, rule 31) and
 * diffs the live state against it, surfacing only the MEANINGFUL changes the
 * urban-salaried accumulator cares about: a FIRE-date move first, then its driver
 * (corpus / savings-rate), then newly-firing nudges and milestone-band crossings.
 *
 * It is the in-app destination the already-built WhatsApp lifecycle nudge
 * (`server/src/lib/lifecycle-evaluator.ts`) deep-links to once A6 is flipped — so
 * the in-app milestone bands MIRROR that evaluator's thresholds (25/50/75/100),
 * extended with a 0 floor.
 *
 * PURE: no store / DOM / IO (`rules/calculation-modules.md`). Monetary outputs are
 * `Math.round`-ed; every denominator is guarded `> 0` (`rules/defensive-coding.md`).
 * Outputs are JSON-safe (no Infinity / NaN) so the snapshot round-trips through the
 * `ui` storage blob unchanged.
 */
import type { DerivedFinancials } from "@/lib/derive";
import { runMonteCarloFire, headlineBandInputs, MAX_PROJECTION_YEARS } from "@/lib/monte-carlo";

/**
 * Milestone bands, ascending. Mirrors `lifecycle-evaluator.ts` MILESTONE_BANDS
 * (25/50/75/100) so the in-app digest and the outbound WhatsApp nudge agree on
 * what counts as a milestone crossing — with a 0 floor so a sub-25% corpus has a
 * defined band. `milestoneBand` = the largest band ≤ (corpus / fireNumber) × 100.
 */
export const MILESTONE_BANDS = [0, 25, 50, 75, 100] as const;
export type MilestoneBand = (typeof MILESTONE_BANDS)[number];

/**
 * Sentinel for an UNREACHABLE FIRE age/year (yearsToRegular not finite). A plain
 * number so it survives JSON; the diff treats any non-sane age (< 0 or absurd) as
 * non-comparable → direction 'same', no fire-date delta.
 */
export const UNREACHABLE_FIRE_AGE = -1;

/**
 * ADR-0006 — the modelling frame a stored snapshot was captured under.
 *
 * Bump this ONLY when a kernel change moves every user's headline for reasons unrelated to their
 * own behaviour. "Since you were away" is a claim about what the USER did; diffing across a frame
 * change would attribute the model's move to them ("your FIRE date moved 2 years later") on every
 * existing user's first visit after deploy. Unlike the plan baseline — which the user consciously
 * locked and must therefore be asked before replacing — the digest baseline is an internal marker
 * captured silently in the first place, so silently re-capturing it is the honest behaviour, not a
 * loss: the next visit then reports only genuine, post-change movement.
 */
export const FRAME_VERSION = "adr-0006";

/**
 * The exact `derive()` fields the snapshot is built from. Typed as a Pick so the
 * dashboard can pass an object assembled from `useFireDerive()` computeds (reading
 * derive() output via the wrapper — NOT re-calling the math), while the full
 * `derive()` return object remains assignable for the unit specs.
 */
export type SnapshotInputs = Pick<
  DerivedFinancials,
  | "anchorAge"
  | "yearsToRegular"
  | "fireWithdrawableCorpus"
  | "fireNumber"
  | "savingsRate"
  | "realBlendedReturn"
  | "realReturnSchedule"
  | "realTargetDriftRate"
  // ADR-0006 Phase 1d: the band's drift is the EFFECTIVE (whole-target) rate, never the base
  // leg's `realTargetDriftRate` — see `headlineBandInputs`. `realTargetDriftRate` stays in the
  // Pick because other snapshot consumers still read it.
  | "effectiveTargetDriftRate"
  | "householdContributionSchedule"
  | "bandContributionSchedule"
  | "portfolioVolatility"
  | "monthlyContribution"
>;

export interface LifecycleSnapshot {
  /** ISO timestamp this baseline was captured (drives the "since <when>" caption). */
  capturedAt: string;
  /**
   * PRECISE (fractional) FIRE age = anchorAge + yearsToRegular, so a sub-year move
   * is detectable. Rendered with `Math.ceil` for display — and because anchorAge is
   * an integer, `ceil(fireAge)` equals FireHero's `anchorAge + ceil(yearsToRegular)`
   * exactly (Rule 26 headline parity). `UNREACHABLE_FIRE_AGE` when not reachable.
   */
  fireAge: number;
  /** Calendar year of FIRE (now.getFullYear() + ceil(yearsToRegular)), or sentinel. */
  fireYear: number;
  /** Withdrawable corpus today (derive().fireWithdrawableCorpus), rounded. */
  currentCorpus: number;
  /** Headline FIRE target (derive().fireNumber), rounded. */
  fireNumber: number;
  /** Savings rate as a percentage 0–100 (derive().savingsRate). */
  savingsRatePct: number;
  /** Largest milestone band ≤ (currentCorpus / fireNumber) × 100. */
  milestoneBand: MilestoneBand;
  /** Active nudge ids at capture (sorted, unique) — set-diffed for "new nudges". */
  activeNudgeIds: string[];
  /** Monte-Carlo median FIRE age (anchorAge + p50 years), or null when off the chart. */
  monteCarloP50Age: number | null;
  /**
   * The modelling frame this snapshot was captured under. ABSENT on every snapshot written before
   * ADR-0006 — which is how a pre-frame-change baseline is recognised.
   */
  frameVersion?: string;
}

/** True when a stored snapshot can honestly be differenced against a live one. */
export function isSnapshotFrameCurrent(snapshot: LifecycleSnapshot | null | undefined): boolean {
  return !!snapshot && snapshot.frameVersion === FRAME_VERSION;
}

export interface LifecycleDigest {
  /** True when ANY surfaced change clears its noise threshold. */
  hasMeaningfulChange: boolean;
  /** baseline.fireAge − current.fireAge (fractional years; POSITIVE = earlier/better). */
  fireAgeDeltaYears: number;
  fireDirection: "earlier" | "later" | "same";
  /** current.currentCorpus − baseline.currentCorpus (rupees). */
  corpusDelta: number;
  /** current.savingsRatePct − baseline.savingsRatePct (percentage points). */
  savingsRateDeltaPct: number;
  /** Nudge ids present now but absent in the baseline. */
  newNudgeIds: string[];
  /** The band just crossed UPWARD (current > baseline), else null. */
  milestoneCrossed: MilestoneBand | null;
  /** baseline.capturedAt, or null when there is no baseline. */
  sinceCapturedAt: string | null;
}

/** Noise thresholds — below these a change is not worth surfacing. */
const MIN_FIRE_AGE_DELTA_YEARS = 1 / 12; // ~1 month
const MIN_CORPUS_DELTA_FRACTION = 0.02; // 2% of the baseline corpus

/** A FIRE age is comparable only when finite and a sane human age. */
function isSaneAge(age: number): boolean {
  return Number.isFinite(age) && age > 0 && age < 150;
}

/** Largest band ≤ (corpus / fireNumber) × 100. Guards fireNumber > 0. */
export function milestoneBandFor(corpus: number, fireNumber: number): MilestoneBand {
  if (!(fireNumber > 0)) return 0;
  const ratioPct = (corpus / fireNumber) * 100;
  let band: MilestoneBand = 0;
  for (const b of MILESTONE_BANDS) {
    if (ratioPct >= b) band = b;
  }
  return band;
}

/**
 * Build the snapshot purely from the derive() kernel output (+ the already-computed
 * active nudge ids and an injected `now`). The Monte-Carlo p50 is run on the SAME
 * inputs `useFireDerive` feeds the headline band — deterministic (seeded), no
 * parallel math.
 */
export interface CaptureOptions {
  /**
   * Skip the Monte-Carlo p50 simulation (sets `monteCarloP50Age: null`). Used for
   * the throwaway display-digest snapshot, whose diff never reads the MC field —
   * so running the simulation there is pure waste. The PERSISTED baseline
   * (dismiss / silent first-load) omits this flag so it carries the real p50.
   */
  skipMonteCarlo?: boolean;
}

export function captureSnapshot(
  derived: SnapshotInputs,
  activeNudgeIds: string[],
  now: Date,
  opts: CaptureOptions = {},
): LifecycleSnapshot {
  const reachable = Number.isFinite(derived.yearsToRegular) && derived.yearsToRegular >= 0;
  const ceilYears = reachable ? Math.ceil(derived.yearsToRegular) : 0;

  const fireAge = reachable ? derived.anchorAge + derived.yearsToRegular : UNREACHABLE_FIRE_AGE;
  const fireYear = reachable ? now.getFullYear() + ceilYears : UNREACHABLE_FIRE_AGE;

  const currentCorpus = Math.round(derived.fireWithdrawableCorpus);
  const fireNumber = Math.round(derived.fireNumber);

  // Monte-Carlo median age — same inputs (and real-return frame) as useFireDerive's
  // lazy band. p50 of MAX+ (never-reached sentinel) ⇒ off the chart ⇒ null (honest,
  // no fake age). Skipped for the display-digest snapshot (the field isn't diffed).
  const monteCarloP50Age = computeMonteCarloP50Age(derived, opts.skipMonteCarlo === true);

  return {
    capturedAt: now.toISOString(),
    frameVersion: FRAME_VERSION,
    fireAge,
    fireYear,
    currentCorpus,
    fireNumber,
    savingsRatePct: derived.savingsRate,
    milestoneBand: milestoneBandFor(currentCorpus, fireNumber),
    activeNudgeIds: [...new Set(activeNudgeIds)].sort(),
    monteCarloP50Age,
  };
}

/** MC median FIRE age (anchorAge + p50 years), or null when off the chart / skipped. */
function computeMonteCarloP50Age(derived: SnapshotInputs, skip: boolean): number | null {
  if (skip) return null;
  // ADR-0006 Phase 1d: the digest's MC age and the FireHero band are now the SAME call, built by
  // the SAME function (`headlineBandInputs`) — they cannot diverge again. They had: this site was
  // still passing `realTargetDriftRate` (the base leg alone, so the 9% medical reservation and the
  // goal due-year caps were invisible to it), which under-stated the target the band chases and
  // put the digest's FIRE age ahead of the dashboard's for the same household.
  const mc = runMonteCarloFire(headlineBandInputs(derived));
  return Number.isFinite(mc.p50Years) && mc.p50Years < MAX_PROJECTION_YEARS
    ? Math.round(derived.anchorAge + mc.p50Years)
    : null;
}

/**
 * Diff the live snapshot against the persisted baseline. A null baseline (first
 * ever visit) yields a quiet digest (`hasMeaningfulChange: false`) — the dashboard
 * captures a silent baseline so the NEXT real change has something to diff against.
 */
export function computeLifecycleDigest(
  current: LifecycleSnapshot,
  baseline: LifecycleSnapshot | null,
): LifecycleDigest {
  // ADR-0006: a baseline from an older modelling frame is treated exactly like NO baseline — the
  // delta across a frame change is the model's, not the user's, and reporting it as "since you were
  // away" would be a fabricated claim about their behaviour. `useLifecycleDigest.ensureBaseline()`
  // then re-captures silently, so the NEXT visit diffs genuine movement.
  if (!baseline || !isSnapshotFrameCurrent(baseline)) {
    return {
      hasMeaningfulChange: false,
      fireAgeDeltaYears: 0,
      fireDirection: "same",
      corpusDelta: 0,
      savingsRateDeltaPct: 0,
      newNudgeIds: [],
      milestoneCrossed: null,
      sinceCapturedAt: null,
    };
  }

  // FIRE-age delta — only when BOTH ages are sane (sentinel/absurd ⇒ non-comparable).
  const agesComparable = isSaneAge(current.fireAge) && isSaneAge(baseline.fireAge);
  const fireAgeDeltaYears = agesComparable ? baseline.fireAge - current.fireAge : 0;
  const fireDirection: LifecycleDigest["fireDirection"] =
    fireAgeDeltaYears >= MIN_FIRE_AGE_DELTA_YEARS
      ? "earlier"
      : fireAgeDeltaYears <= -MIN_FIRE_AGE_DELTA_YEARS
        ? "later"
        : "same";

  const corpusDelta = current.currentCorpus - baseline.currentCorpus;
  const savingsRateDeltaPct = current.savingsRatePct - baseline.savingsRatePct;

  const baselineNudges = new Set(baseline.activeNudgeIds);
  const newNudgeIds = current.activeNudgeIds.filter((id) => !baselineNudges.has(id));

  const milestoneCrossed: MilestoneBand | null =
    current.milestoneBand > baseline.milestoneBand ? current.milestoneBand : null;

  const corpusFraction = Math.abs(corpusDelta) / Math.max(baseline.currentCorpus, 1);
  const hasMeaningfulChange =
    fireDirection !== "same" ||
    corpusFraction >= MIN_CORPUS_DELTA_FRACTION ||
    newNudgeIds.length > 0 ||
    milestoneCrossed !== null;

  return {
    hasMeaningfulChange,
    fireAgeDeltaYears,
    fireDirection,
    corpusDelta,
    savingsRateDeltaPct,
    newNudgeIds,
    milestoneCrossed,
    sinceCapturedAt: baseline.capturedAt,
  };
}

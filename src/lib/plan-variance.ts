/**
 * #138 — Plan-vs-actual variance. Stores a "plan baseline" (the FIRE picture the day the user
 * locked their plan) and honestly DECOMPOSES the change since: never selling an assumption tweak
 * as "progress". A 15-25yr FIRE journey needs "am I tracking vs MY plan?", not just "what's my new
 * projected date?".
 *
 * Pure module (no store/DOM). The wall clock is INJECTED (`nowMs`) so the CPI-rebase is testable.
 * Decomposition method (stated for honesty): the FIRE-target change is split by a counterfactual
 * `derive()` on the CURRENT household under the BASELINE assumptions — that isolates the assumption
 * (goalpost) effect from the expense (reality) effect — and net-worth growth is the progress signal
 * (net worth is assumption-invariant, so an assumption-only change leaves progress exactly zero).
 * Rupee deltas are CPI-rebased to today before differencing.
 */
import { derive } from "@/lib/derive";
import type { Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";

/**
 * ADR-0006 — the modelling frame a stored document was captured under.
 *
 * Bump this ONLY when a kernel change moves every user's headline for reasons that have nothing to
 * do with their own behaviour. A baseline locked under an older frame cannot be differenced against
 * today's plan: the delta would be almost entirely the model change, rendered as if the user had
 * fallen behind. The honest answer is to say so and offer a re-lock — never to fabricate a number,
 * and never to silently re-lock (that would erase the user's chosen starting point without asking).
 */
export const FRAME_VERSION = "adr-0006";

/** The locked plan snapshot — a dedicated entity (NOT an extension of ExpenseSnapshot; SRP). */
export interface PlanBaseline {
  capturedAt: string; // ISO timestamp the plan was locked
  fireNumber: number;
  fireAge: number;
  yearsToFire: number;
  netWorth: number;
  monthlyContribution: number;
  annualExpenses: number;
  /** A copy of the assumptions in force at lock time — required to isolate the goalpost effect. */
  assumptions: Assumptions;
  /**
   * The modelling frame this baseline was captured under. ABSENT on every baseline written before
   * ADR-0006 — which is exactly how a pre-frame-change document is recognised.
   */
  frameVersion?: string;
}

/**
 * True when a stored baseline was captured under the CURRENT modelling frame, i.e. when differencing
 * it against today's plan measures the user rather than the model. A missing tag means "written
 * before frames were tracked", which is necessarily an older frame.
 */
export function isBaselineFrameCurrent(baseline: PlanBaseline | null | undefined): boolean {
  return !!baseline && baseline.frameVersion === FRAME_VERSION;
}

export interface PlanVarianceAttribution {
  /** Months SOONER from corpus / net-worth growth (≥ 0 when you've genuinely saved/grown). */
  progress: number;
  /** Months sooner (− = later) from your ACTUAL expenses changing — a real-world move, not slippage. */
  reality: number;
  /** Months sooner (− = later) from an ASSUMPTION change — a re-definition of the goal, not progress. */
  goalpost: number;
}

export interface PlanVarianceResult {
  /** + = you're EARLIER than the locked plan, − = later (the exact observed headline). */
  fireDateDeltaMonths: number;
  attribution: PlanVarianceAttribution;
  /** Net-worth change CPI-rebased to today's ₹ (baseline grown by inflation, then differenced). */
  netWorthDeltaReal: number;
  /** FIRE-number change CPI-rebased to today's ₹. */
  fireNumberDeltaReal: number;
  assumptionsChanged: boolean;
  changedAssumptionKeys: string[];
  elapsedMonths: number;
}

type Lens = { isFamilyView: boolean; viewingMemberId: string | null; currentFY: string };

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

// The assumption fields whose change re-defines the goal (the "goalpost"). Net-worth-irrelevant
// presentation fields are excluded; this is the set surfaced as `changedAssumptionKeys`.
const DECOMP_KEYS: (keyof Assumptions)[] = [
  "inflation",
  "equityReturn",
  "debtReturn",
  "realEstateReturn",
  "goldReturn",
  "npsReturn",
  "ppfReturn",
  "epfReturn",
  "internationalReturn",
  "reitReturn",
  "cryptoReturn",
  "healthcareInflation",
  "educationInflation",
  "housingInflation",
  "swrOverride",
  "leanMultiplier",
  "fatMultiplier",
  "withdrawalRule",
];

function netWorthOf(d: ReturnType<typeof derive>): number {
  return d.totalCorpus - d.totalLiabilitiesValue;
}

/**
 * Build a PlanBaseline from a household + the assumptions in force (the "Lock my baseline" action).
 * `overrides` lets tests/callers pin specific fields; production passes only `capturedAt`.
 */
export function captureBaselineFrom(
  household: Household,
  assumptions: Assumptions,
  lens: Lens,
  capturedAt: string,
  overrides: Partial<PlanBaseline> = {},
  /** ADR-0006 Phase 1d — the calendar year dated goals are measured from; the kernel never reads
   *  the wall clock itself. Omitted ⇒ the kernel falls back to `lens.currentFY`'s start year. */
  currentYear?: number,
): PlanBaseline {
  const d = derive(household, assumptions, lens, currentYear != null ? { currentYear } : undefined);
  return {
    capturedAt,
    frameVersion: FRAME_VERSION,
    fireNumber: d.fireNumber,
    fireAge: d.householdFireAge ?? d.anchorAge + Math.ceil(d.yearsToRegular),
    yearsToFire: d.yearsToRegular,
    netWorth: netWorthOf(d),
    monthlyContribution: d.monthlyContribution,
    annualExpenses: d.annualExpensesToday,
    assumptions: { ...assumptions },
    ...overrides,
  };
}

export function computePlanVariance(args: {
  baseline: PlanBaseline;
  household: Household;
  currentAssumptions: Assumptions;
  lens: Lens;
  nowMs: number;
  /** ADR-0006 Phase 1d — see `captureBaselineFrom`. Both runs below MUST share it, else the
   *  counterfactual and the live run would disagree about a goal's due date. */
  currentYear?: number;
}): PlanVarianceResult {
  const { baseline, household, currentAssumptions, lens, nowMs } = args;
  const yearOverride = args.currentYear != null ? { currentYear: args.currentYear } : undefined;

  const current = derive(household, currentAssumptions, lens, yearOverride);
  // Counterfactual: the CURRENT household under the BASELINE assumptions. The gap between this and
  // `current` is the pure ASSUMPTION (goalpost) effect on the target; the gap between this and the
  // stored baseline is the pure EXPENSE/household (reality) effect.
  const underBaselineAssumptions = derive(household, baseline.assumptions, lens, yearOverride);

  const inf = Number.isFinite(currentAssumptions.inflation)
    ? currentAssumptions.inflation
    : DEFAULT_ASSUMPTIONS.inflation;
  // Guard a corrupted/hand-edited capturedAt — Date.parse("garbage") is NaN, which would poison
  // cpiFactor → NaN rupee deltas reaching the card (code-reviewer M1).
  const capturedMs = Date.parse(baseline.capturedAt);
  const elapsedYears = Number.isFinite(capturedMs) ? Math.max(0, (nowMs - capturedMs) / MS_PER_YEAR) : 0;
  const cpiFactor = Math.pow(1 + inf, elapsedYears);

  // Convert a ₹ target change to an approximate FIRE-date month shift via the contribution rate
  // (first-order: how many months of saving the change represents). Labeled as an estimate in the UI.
  const mc =
    baseline.monthlyContribution > 0
      ? baseline.monthlyContribution
      : current.monthlyContribution > 0
        ? current.monthlyContribution
        : 0;
  const targetToMonths = (rupees: number): number => (mc > 0 ? rupees / mc : 0);
  // Normalize -0 → 0 so a no-op driver reads as a clean zero (UI + Object.is equality in tests).
  const nz = (x: number): number => (x === 0 ? 0 : x);

  // Target (FIRE-number) decomposition (₹).
  const targetReality = underBaselineAssumptions.fireNumber - baseline.fireNumber; // expenses/household
  const targetGoalpost = current.fireNumber - underBaselineAssumptions.fireNumber; // assumptions
  const currentNetWorth = netWorthOf(current);

  // Exact observed headline: you are this many months earlier(+)/later(−) than the locked plan.
  const fireDateDeltaMonths = (baseline.yearsToFire - current.yearsToRegular) * 12;

  // First-order RAW driver weights (months): corpus growth (+ = ahead), expense change and
  // assumption change (a higher target → date LATER → negative). These are estimates via the
  // contribution rate (returns-blind), so they don't equal the exact date math on their own.
  const rawProgress = targetToMonths(currentNetWorth - baseline.netWorth);
  const rawReality = -targetToMonths(targetReality);
  const rawGoalpost = -targetToMonths(targetGoalpost);
  const rawSum = rawProgress + rawReality + rawGoalpost;

  // Re-base the drivers so they SUM to the exact observed headline — each force gets its share of
  // the real date move (the parts add up to the whole the user sees; no confusing headline-vs-driver
  // gap). The raw drivers are returns-BLIND (₹ ÷ contribution) while the headline is the returns-AWARE
  // compound solver, so near non-linearities they can disagree in SIGN. A negative scale would FLIP
  // every driver's sign — rendering genuine corpus growth as a force pushing FIRE *later* (a Tier-0
  // honesty misrepresentation; code-reviewer H1 + FinTech Q3). So normalize ONLY when rawSum and the
  // headline agree in sign; otherwise the first-order model has broken down → leave drivers at 0 and
  // let the exact headline stand un-attributed (the same honest path as the net-to-zero case).
  const signsAgree = rawSum !== 0 && fireDateDeltaMonths !== 0 && Math.sign(rawSum) === Math.sign(fireDateDeltaMonths);
  const scale = Math.abs(rawSum) > 1e-9 && signsAgree ? fireDateDeltaMonths / rawSum : 0;

  const changedAssumptionKeys = DECOMP_KEYS.filter(
    (k) => baseline.assumptions[k] !== currentAssumptions[k],
  ) as string[];

  return {
    fireDateDeltaMonths,
    attribution: {
      // Corpus growth share — exactly 0 when net worth is unchanged, so an assumption-only change
      // can never masquerade as progress.
      progress: nz(rawProgress * scale),
      reality: nz(rawReality * scale),
      goalpost: nz(rawGoalpost * scale),
    },
    netWorthDeltaReal: Math.round(currentNetWorth - baseline.netWorth * cpiFactor),
    fireNumberDeltaReal: Math.round(current.fireNumber - baseline.fireNumber * cpiFactor),
    assumptionsChanged: changedAssumptionKeys.length > 0,
    changedAssumptionKeys,
    elapsedMonths: Math.round(elapsedYears * 12),
  };
}

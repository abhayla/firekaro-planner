/**
 * Lever catalog (objective 2, gh-issue #48) — builds the concrete acceleration LEVERS the
 * `lever-impact` engine ranks. Implements the agreed comparability policy (PROJECT-LOG /
 * issue #48): **realistic max-effort per lever**, each carrying a transparent BOUND note, so a
 * lever's rank reflects its biggest *achievable* win for THIS household — not an arbitrary increment.
 * A lever with no headroom (no surplus, already at the equity ceiling, nothing to trim) is OMITTED
 * (shown locked by the UI), never emitted with a fake impact.
 *
 * This is the first, cleanly-modelable slice — the three levers that perturb the FIRE baseline
 * directly. The INDIA-SPECIFIC tax/financial levers (old↔new regime arbitrage, 80CCD(1B) top-up,
 * employer-NPS ask, prepay-loan-vs-invest) need a tax/interest recomputation to turn "₹ freed" into
 * an extra investable contribution; they are the next increment and attach as more entries here once
 * their modelling is validated. Keep this module pure (`.claude/rules/calculation-modules.md`).
 */
import type { FireBaseline, Lever } from "./lever-impact";
import { formatINRCompact } from "@/lib/formatters";
import { LIMIT_80CCD_1B } from "./tax-deductions";
import type { Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import type { ContributionSegments } from "./contribution-schedule";
import type { DeriveLens } from "./derive";
import { requiredMonthlyContributionFor } from "./required-contribution";

/** Household-resolved inputs needed to bound each lever to a realistic max effort. */
export interface AccelerationContext {
  baseline: FireBaseline;
  /** Current monthly expenses (real ₹/mo) — basis for the expense-trim lever. */
  monthlyExpenses: number;
  /** Realistic achievable expense trim as a fraction (e.g. 0.10 = a 10% cut). Transparent + adjustable. */
  realisticExpenseTrimPct: number;
  /** Effective SWR used for the FIRE number — translates a recurring expense cut into a target-corpus reduction. */
  swr: number;
  /** Current equity allocation % (0..100). */
  currentEquityPct: number;
  /** The household's realistic equity ceiling (0..100). At/above ⇒ the risk-notch lever is locked. */
  maxEquityPct: number;
  /** Expected REAL-return delta per +1 percentage-point of equity (the equity−debt real-return spread ÷ 100). */
  realReturnPerEquityPoint: number;
  /** ₹/yr already claimed under the ₹50k 80CCD(1B) NPS sub-limit. Headroom = cap − this. */
  currentNps80ccd1bUsed: number;
  /** Household top marginal tax rate (0..1, incl. cess in the real wiring) — the rate the 80CCD headroom saves. */
  marginalTaxRate: number;
  /**
   * The household's effective tax regime (`derive()`'s auto-optimized `householdTaxRecommendation.recommended`).
   * 80CCD(1B) is an OLD-regime-only Chapter VI-A deduction — under the NEW regime it saves ₹0, so the
   * lever MUST be locked for new-regime filers (the persona majority post-Budget-2025) to avoid showing
   * a phantom "years sooner" for a tax benefit they legally cannot claim (FinTech HIGH, 2026-06-06; rule 31).
   */
  regime: "OLD" | "NEW";
}

/** One realistic re-allocation step = +10pp equity. Exported so the band wiring can compute the
 *  perturbed portfolio volatility for the SAME notch the lever applies (single source of the notch). */
export const EQUITY_NOTCH_POINTS = 10;

/**
 * The save-more sensitivity is a USER-PARAMETERISED lever, not a fixed-bound catalog entry — its
 * magnitude is set live in the UI ("invest ₹X more/month"), so it is exported as a pure factory the
 * card calls on demand. It adds `extraMonthly` to monthly savings; the target is unchanged. This is
 * the GENUINE "save more" path that replaces the moot invest-surplus lever (D-2026-06-06-11): the
 * existing surplus is already invested by derive(), so only money the user does not yet invest counts.
 * Callers MUST omit it for `extraMonthly <= 0` (a non-positive amount is a no-op, not an accelerator).
 */
export function makeSaveMoreLever(extraMonthly: number): Lever {
  return {
    key: "save-more",
    label: `Invest ${formatINRCompact(extraMonthly)} more/month`,
    note: `Invest ${formatINRCompact(extraMonthly)} more every month`,
    apply: (b) => ({ ...b, monthlySavings: b.monthlySavings + extraMonthly }),
  };
}

/**
 * Build the realistic-max-effort acceleration levers that have headroom for this household.
 * Order is incidental — the engine ranks by years saved.
 */
export function buildAccelerationLevers(ctx: AccelerationContext): Lever[] {
  const levers: Lever[] = [];

  // NOTE: there is deliberately NO "invest your surplus" lever — `derive()` already computes
  // `annualSavings = income − tax − expenses` AS the monthly contribution, so the surplus is
  // already invested; an invest-surplus lever would double-count (D-2026-06-06-11). The genuine
  // "save more" path is a user-set sensitivity in the UI, not a fixed-bound catalog lever.

  // 1) Trim a realistic slice of recurring expenses — lowers the FIRE target (via SWR) AND adds the
  //    saved amount to monthly savings; both pull FIRE earlier.
  if (ctx.monthlyExpenses > 0 && ctx.realisticExpenseTrimPct > 0 && ctx.swr > 0) {
    const monthlyCut = Math.round(ctx.realisticExpenseTrimPct * ctx.monthlyExpenses);
    const freedTarget = (monthlyCut * 12) / ctx.swr;
    const pct = Math.round(ctx.realisticExpenseTrimPct * 100);
    levers.push({
      key: "trim-expenses",
      label: `Trim spending ${pct}%`,
      note: `Cut ${formatINRCompact(monthlyCut)}/mo (${pct}% of spending) — lowers your target and adds to savings`,
      apply: (b) => ({
        ...b,
        // Clamp ≥ 0 — a large cut against a tiny target must never produce a negative FIRE number
        // (which the engine would read as "already FIRE"). Not realistic for the accumulator, but
        // defensively correct (FinTech review).
        targetCorpus: Math.max(0, b.targetCorpus - freedTarget),
        monthlySavings: b.monthlySavings + monthlyCut,
      }),
    });
  }

  // 2) Shift one realistic risk notch toward equity (bounded by the household's ceiling).
  const equityNotch = Math.min(EQUITY_NOTCH_POINTS, ctx.maxEquityPct - ctx.currentEquityPct);
  if (equityNotch > 0) {
    const returnDelta = equityNotch * ctx.realReturnPerEquityPoint;
    levers.push({
      key: "risk-notch",
      label: "Shift one risk notch to equity",
      // HONESTY CAVEAT (FinTech review, 2026-06-06): the engine measures impact on a DETERMINISTIC
      // years-to-FIRE delta, so a return-raising lever would otherwise read as a free lunch next to
      // the risk-neutral surplus/trim levers. The years-saved here is the EXPECTED case only; the
      // added volatility/sequence risk (a wider range of FIRE dates, worse left tail) is real and is
      // disclosed in the note until per-lever confidence bands land (gh-48 follow-on).
      note: `Raise equity ${ctx.currentEquityPct}% → ${ctx.currentEquityPct + equityNotch}% (+${(returnDelta * 100).toFixed(1)}% expected real return) — adds market risk: a wider range of outcomes, not a guaranteed gain`,
      apply: (b) => ({ ...b, expectedReturn: b.expectedReturn + returnDelta }),
    });
  }

  // 3) Fill the 80CCD(1B) NPS headroom — a near-deterministic cashflow lever. HONEST MODEL
  //    (D-2026-06-06-11): the ₹50k sub-limit contribution itself comes from the surplus that
  //    derive() ALREADY invests, so adding it to savings would double-count. The genuinely NEW
  //    investable cashflow is only the marginal TAX SAVED on filling the headroom, redirected to
  //    investing. (Conservative assumption: the ₹50k is funded FROM the already-invested surplus —
  //    if instead funded from consumption the full ₹50k would be new money, so this UNDER-states,
  //    the honest direction for the accumulator.) `marginalTaxRate` is the single top-slab rate incl.
  //    cess (a single-slab approximation — the accumulator's marginal ₹50k sits within one slab).
  //    Locked (omitted) when: no headroom, no tax to save, OR the household files the NEW regime
  //    (80CCD(1B) is OLD-regime-only → ₹0 saving under new; FinTech HIGH 2026-06-06, rule 31).
  const npsHeadroom = Math.max(0, LIMIT_80CCD_1B - ctx.currentNps80ccd1bUsed);
  if (ctx.regime === "OLD" && npsHeadroom > 0 && ctx.marginalTaxRate > 0) {
    const annualTaxSaved = Math.round(npsHeadroom * ctx.marginalTaxRate);
    // Round the MONTHLY contribution to whole rupees (integer-money rule, `calculation-modules.md`),
    // matching the trim lever's monthly rounding — avoids a fractional-rupee monthlySavings.
    const monthlyTaxSaved = Math.round(annualTaxSaved / 12);
    levers.push({
      key: "nps-80ccd1b",
      label: "Fill your 80CCD(1B) NPS headroom",
      note: `Invest ${formatINRCompact(npsHeadroom)}/yr in NPS under 80CCD(1B) → save ${formatINRCompact(annualTaxSaved)}/yr tax, redirected to investing`,
      apply: (b) => ({ ...b, monthlySavings: b.monthlySavings + monthlyTaxSaved }),
    });
  }

  return levers;
}

// ============================================================================================
// QN-5 (T-379) — the "How to get there — pick your moves" PLAN levers.
//
// These are NOT FireBaseline perturbations like the ranked levers above: each is a pure
// transform of the SOLVER's inputs (household snapshot + assumptions + target age + extra
// contribution segments), and its effect is measured by re-solving through the ONE solver
// `requiredMonthlyContributionFor` (which itself runs `derive()`). The effect metric everywhere
// is "less to find" = Δ(required monthly − current monthly). Stacking = apply every switched-on
// lever to the inputs, then re-solve ONCE — never a sum of individual effects (spec §6).
//
// Nothing here is assumed by default: a lever that does not apply to this household is
// AVAILABLE=false with a plain-words reason, never silently dropped and never faked.
// ============================================================================================

/** Everything the solver is given. A plan lever maps one of these to another (pure). */
export interface PlanInputs {
  snapshot: Household;
  assumptions: Assumptions;
  targetAge: number;
  /** ADR-0004 segments summed onto the household savings residual (derive-overrides.ts). */
  extraSegments: ContributionSegments;
}

export interface PlanLeverContext {
  /** Age the projection starts from (the lensed adult's / primary earner's — `derive().anchorAge`). */
  anchorAge: number;
  /** `ui.quick.directPlans` — true ONLY when the user said their mutual funds are direct plans. */
  directPlans: boolean | null | undefined;
  /** True under "Viewing as <member>": household-level moves cannot be read off the individual number. */
  memberLens: boolean;
  /** The wall-clock year, for the loan's years-left. */
  currentYear: number;
}

export type PlanLeverKey =
  | "step-up-10"
  | "delay-3"
  | "trim-expenses"
  | "direct-plans"
  | "no-prepay-roll-emi";

export interface PlanLever {
  key: PlanLeverKey;
  label: string;
  /** One line, plain words — what the move IS, in the user's own numbers. */
  note: string;
  available: boolean;
  /** Shown greyed-out in place of the effect when `available` is false. */
  unavailableReason?: string;
  /** Pure: returns NEW inputs, never mutates. Identity when unavailable. */
  apply: (p: PlanInputs) => PlanInputs;
}

/** The spec's fixed magnitudes — one place, so the copy and the math cannot drift. */
export const PLAN_STEP_UP_PERCENT = 10;
export const PLAN_DELAY_YEARS = 3;
export const PLAN_TRIM_FRACTION = 0.1;
/** Direct vs regular mutual-fund TER gap, as a return uplift on the MF-bearing buckets. */
export const PLAN_DIRECT_PLAN_UPLIFT = 0.008;

/** Copies only the branch a lever touches (the rest is shared, read-only). */
function withAssumptions(p: PlanInputs, patch: Partial<Assumptions>): PlanInputs {
  return { ...p, assumptions: { ...p.assumptions, ...patch } };
}

export function buildPlanLevers(
  snapshot: Household,
  assumptions: Assumptions,
  ctx: PlanLeverContext,
): PlanLever[] {
  const identity = (p: PlanInputs) => p;
  const memberLensReason = "a household-level move — switch to Whole household to see its effect";

  // 1) Step-up: raise the REAL household savings 10%/yr (ADR-0004; the kernel already honours it).
  //    Under a member lens the individual path has no step-up, so the lever cannot be read there.
  const currentStepUp = assumptions.householdSavingsStepUpPercent ?? 0;
  const stepUpAvailable = !ctx.memberLens && currentStepUp < PLAN_STEP_UP_PERCENT;
  const stepUp: PlanLever = {
    key: "step-up-10",
    label: `Raise investing ${PLAN_STEP_UP_PERCENT}% every year`,
    note: "salary hikes → SIP hikes; above inflation, every year — usually the single biggest lever",
    available: stepUpAvailable,
    unavailableReason: ctx.memberLens
      ? memberLensReason
      : `you already step up ${currentStepUp}%/yr — at or above this move`,
    apply: stepUpAvailable
      ? (p) =>
          withAssumptions(p, {
            householdSavingsStepUpPercent: Math.max(
              p.assumptions.householdSavingsStepUpPercent ?? 0,
              PLAN_STEP_UP_PERCENT,
            ),
          })
      : identity,
  };

  // 2) Delay: retire 3 years later — 3 more years of investing, 3 fewer to fund.
  const delay: PlanLever = {
    key: "delay-3",
    label: `Retire ${PLAN_DELAY_YEARS} years later`,
    note: `${PLAN_DELAY_YEARS} more years of investing, ${PLAN_DELAY_YEARS} fewer to fund`,
    available: true,
    apply: (p) => ({ ...p, targetAge: p.targetAge + PLAN_DELAY_YEARS }),
  };

  // 3) Trim: 10% off the discretionary spending (the avgMonthly lump + manual recurring lines) —
  //    never the contractual EMI / premium auto-flow lines (a solver has no business assuming a
  //    loan default). Lower spending lowers the FIRE number AND raises the savings residual that
  //    derive() invests — both genuine, no double count (the residual is income − tax − expenses,
  //    recomputed by the kernel).
  const trimmable =
    snapshot.expenses.avgMonthly +
    snapshot.expenses.recurring.filter((r) => r.source === "manual").reduce((s, r) => s + r.amount, 0);
  const trimAvailable = trimmable > 0;
  const trim: PlanLever = {
    key: "trim-expenses",
    label: `Trim spending ${Math.round(PLAN_TRIM_FRACTION * 100)}%`,
    note: "lower spend lowers the target AND frees cash to invest — EMIs and premiums are left alone",
    available: trimAvailable,
    unavailableReason: "no spending entered yet",
    apply: trimAvailable
      ? (p) => ({
          ...p,
          snapshot: {
            ...p.snapshot,
            expenses: {
              ...p.snapshot.expenses,
              avgMonthly: Math.round(p.snapshot.expenses.avgMonthly * (1 - PLAN_TRIM_FRACTION)),
              recurring: p.snapshot.expenses.recurring.map((r) =>
                r.source === "manual" ? { ...r, amount: Math.round(r.amount * (1 - PLAN_TRIM_FRACTION)) } : r,
              ),
            },
          },
        })
      : identity,
  };

  // 4) Direct plans: ~0.8% lower fees ≈ +0.8% expected return on the MF-bearing buckets
  //    (domestic + international equity). A What-If on the return assumption — no new persisted
  //    field; "Make this my plan" maps it onto the existing equityReturn override (spec §6).
  const directAvailable = ctx.directPlans !== true;
  const upliftPct = (PLAN_DIRECT_PLAN_UPLIFT * 100).toFixed(1);
  const direct: PlanLever = {
    key: "direct-plans",
    label: "Move to direct mutual funds",
    note: `~${upliftPct}% lower fees ≈ +${upliftPct}% return, for free${
      ctx.directPlans == null ? " (if you're already on direct plans, ignore this)" : ""
    }`,
    available: directAvailable,
    unavailableReason: "you are already on direct plans",
    apply: directAvailable
      ? (p) =>
          withAssumptions(p, {
            equityReturn: p.assumptions.equityReturn + PLAN_DIRECT_PLAN_UPLIFT,
            internationalReturn: (p.assumptions.internationalReturn ?? 0) + PLAN_DIRECT_PLAN_UPLIFT,
          })
      : identity,
  };

  // 5) Don't prepay the loan — roll the EMI into investing when it ends. Available only when a
  //    loan exists whose rate is BELOW the expected equity return (else the honest line is the
  //    opposite: prepay it). Effect = an ADR-0004 segment adding the EMI from the loan's end age.
  //    The EMI is a fixed NOMINAL rupee amount while a segment amount is REAL, so it is deflated
  //    at the geometric midpoint of the investing window (loan end → target): the real value of a
  //    fixed rupee falls ~6%/yr, and deflating only to the end year would overstate the later years.
  const loans = snapshot.liabilities.filter((l) => l.monthlyEMI > 0);
  const inflation = Number.isFinite(assumptions.inflation) ? assumptions.inflation : 0.06;
  const qualifying = loans.filter(
    (l) =>
      l.interestRate / 100 < assumptions.equityReturn &&
      l.derivedEndYear != null &&
      l.derivedEndYear > ctx.currentYear,
  );
  let noPrepayReason: string | undefined;
  if (ctx.memberLens) noPrepayReason = memberLensReason;
  else if (loans.length === 0) noPrepayReason = "no home loan";
  else if (loans.every((l) => l.interestRate / 100 >= assumptions.equityReturn))
    noPrepayReason = "your loan costs more than investing earns — prepay it";
  else if (qualifying.length === 0) noPrepayReason = "add the loan's end year to see this move";
  const noPrepayAvailable = noPrepayReason == null;
  const emiTotal = qualifying.reduce((s, l) => s + l.monthlyEMI, 0);
  const noPrepay: PlanLever = {
    key: "no-prepay-roll-emi",
    label: "Don't prepay the home loan — roll the EMI into investing when it ends",
    note:
      qualifying.length > 0
        ? `your loan rate is below what investing earns; keep it, and the day the ${formatINRCompact(emiTotal)}/month EMI stops, invest it`
        : "your loan rate is below what investing earns; keep it, and the day the EMI stops, invest it",
    available: noPrepayAvailable,
    unavailableReason: noPrepayReason,
    apply: noPrepayAvailable
      ? (p) => {
          const segments: ContributionSegments = qualifying.map((l) => {
            const yearsLeft = Math.max(1, (l.derivedEndYear as number) - ctx.currentYear);
            const startAtAge = ctx.anchorAge + yearsLeft;
            const investingYears = Math.max(0, p.targetAge - startAtAge);
            const deflateYears = yearsLeft + investingYears / 2;
            return {
              amount: Math.round(l.monthlyEMI / Math.pow(1 + inflation, deflateYears)),
              startAtAge,
            };
          });
          return { ...p, extraSegments: [...p.extraSegments, ...segments] };
        }
      : identity,
  };

  return [stepUp, delay, trim, direct, noPrepay];
}

/** Stack the switched-on levers onto the inputs (pure; order = catalog order). */
export function applyPlanLevers(
  base: PlanInputs,
  levers: readonly PlanLever[],
  on: ReadonlySet<string>,
): PlanInputs {
  return levers.filter((l) => l.available && on.has(l.key)).reduce((acc, l) => l.apply(acc), base);
}

export interface PlanToFind {
  /** required − current, floored at 0. Infinity when the target is beyond any realistic amount. */
  toFind: number;
  requiredMonthlyReal: number;
  currentMonthlyReal: number;
  hasTarget: boolean;
}

/** The "extra to find" for a plan — ONE full solve through `derive()`. */
export function planToFind(base: PlanInputs, lens: DeriveLens): PlanToFind {
  const r = requiredMonthlyContributionFor({
    snapshot: base.snapshot,
    assumptions: base.assumptions,
    lens,
    targetAge: base.targetAge,
    extraContributionSegments: base.extraSegments,
  });
  const gap = r.requiredMonthlyReal - r.currentMonthlyReal;
  return {
    toFind: Number.isFinite(gap) ? Math.max(0, gap) : Number.POSITIVE_INFINITY,
    requiredMonthlyReal: r.requiredMonthlyReal,
    currentMonthlyReal: r.currentMonthlyReal,
    hasTarget: r.hasTarget,
  };
}

export interface PlanLeverEffect {
  key: PlanLeverKey;
  /** ₹/month LESS the user has to find with ONLY this lever on (vs. today's plan). ≥ 0, finite. */
  lessToFind: number;
  /** This lever alone turns an unreachable target into a reachable one. */
  rescues: boolean;
  /** Even with this lever the target is beyond any realistic monthly amount. */
  stillUnreachable: boolean;
}

/**
 * Evaluate every lever ALONE against today's plan (each a full re-solve). Unavailable levers get
 * a zero effect (the UI shows the reason instead of a number). Pure; the caller memoises.
 */
export function evaluatePlanLevers(
  base: PlanInputs,
  lens: DeriveLens,
  levers: readonly PlanLever[],
): { baseline: PlanToFind; effects: PlanLeverEffect[] } {
  const baseline = planToFind(base, lens);
  const effects = levers.map((l): PlanLeverEffect => {
    if (!l.available) return { key: l.key, lessToFind: 0, rescues: false, stillUnreachable: false };
    const one = planToFind(l.apply(base), lens);
    const rescues = !Number.isFinite(baseline.toFind) && Number.isFinite(one.toFind);
    const stillUnreachable = !Number.isFinite(one.toFind);
    const delta =
      Number.isFinite(baseline.toFind) && Number.isFinite(one.toFind) ? baseline.toFind - one.toFind : 0;
    return { key: l.key, lessToFind: Math.max(0, Math.round(delta)), rescues, stillUnreachable };
  });
  return { baseline, effects };
}

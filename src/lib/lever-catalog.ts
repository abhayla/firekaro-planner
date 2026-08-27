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

// ---------------------------------------------------------------------------------------------
// T-379 (QN-5) — PLAN levers: "How to get there — pick your moves"
// ---------------------------------------------------------------------------------------------
/**
 * A SECOND lever shape, additive to the scalar-baseline `Lever` above. The distinction is real and
 * load-bearing, not cosmetic:
 *
 *   - `Lever`     perturbs a resolved scalar `FireBaseline` and is measured in YEARS SAVED via
 *                 `calculateYearsToTarget`. That is the "biggest achievable win" ranking (#48).
 *   - `PlanLever` perturbs the PLAN INPUTS (`snapshot` / `assumptions` / `targetAge`) and is
 *                 measured in "LESS TO FIND" rupees/month by RE-SOLVING through
 *                 `required-contribution.ts` -> `derive()`. That is the Option-C card.
 *
 * Both are kept because they answer different questions ("when can I stop?" vs "what must I find
 * every month?") and because the years-saved ranking carries the bridge/volatility honesty work
 * (#22, lever-bands) that the rupee view has no equivalent of.
 *
 * Every plan lever is measured by a full kernel re-solve, so stacking COMPOUNDS - there is no
 * additive shortcut anywhere in this file, by design (a sum would over-state every combination).
 */
import type { Household, Liability } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import type { DeriveLens } from "@/lib/derive";
import {
  requiredMonthlyContributionFor,
  type RequiredContributionResult,
} from "@/lib/required-contribution";

/** The plan a lever perturbs - exactly the solver's inputs, nothing else. */
export interface PlanInputs {
  snapshot: Household;
  assumptions: Assumptions;
  lens: DeriveLens;
  targetAge: number;
  /**
   * Set by `no-prepay-roll-emi` only: the EMI (rupees/mo, today's money) that starts flowing into
   * the corpus from `rolledEmiFromYear`. Carried on the plan (not folded into the snapshot) because
   * the kernel owns the household contribution schedule - see `solvePlan` for how it is applied.
   */
  rolledEmiMonthly?: number;
  /** Calendar year the rolled EMI starts (the loan's end year). */
  rolledEmiFromYear?: number;
}

/** What the catalog needs to decide availability. */
export interface PlanLeverContext {
  plan: PlanInputs;
  /**
   * `ui.quick.directPlans` - true ONLY when the user affirmatively said "Direct".
   * `false` (Regular) and `null`/`undefined` (Not sure / never asked) both leave the lever
   * available, with the note telling an already-direct user to ignore it.
   */
  directPlans?: boolean | null;
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
  /** The one-line "why this works" the card shows under the label. */
  note: string;
  /** False => rendered greyed out and NOT applicable; `apply` is never called. */
  available: boolean;
  /** Shown in place of the rupee figure when `available` is false. Honest, specific reason. */
  unavailableNote?: string;
  /** Pure: returns a NEW plan, never mutates. Only called when `available`. */
  apply: (p: PlanInputs) => PlanInputs;
}

/** Card order = the mockup's order (`option-c-merged.html`). */
export const PLAN_LEVER_KEYS: PlanLeverKey[] = [
  "step-up-10",
  "delay-3",
  "trim-expenses",
  "direct-plans",
  "no-prepay-roll-emi",
];

/** The step-up this lever commits to (%/yr, REAL - ADR-0004, `derive.ts` reads it directly). */
export const STEP_UP_LEVER_PERCENT = 10;
/** "Retire 3 years later". */
export const DELAY_LEVER_YEARS = 3;
/**
 * Direct-vs-regular mutual-fund TER saving, as a return uplift. +0.8pp is the gap the reference
 * video cites and SEBI's direct-plan disclosures bear out (regular plans carry the distributor
 * trail inside the TER). Applied to the EQUITY class only - it is a fund fee, not a gilt yield -
 * and only as a What-If lever value; no persisted assumption field is created.
 */
export const DIRECT_PLAN_RETURN_UPLIFT = 0.008;
/** The realistic spending trim this lever commits to (matches the scalar catalog's default). */
export const TRIM_LEVER_PCT = 0.1;

/**
 * The cheapest honest estimate of when a loan ends. Prefers the stored `derivedEndYear`; otherwise
 * computes the interest-inclusive months-to-clear, capped at a 30-year tenure (a home loan's outer
 * edge) and rounded UP - starting the rolled EMI LATER is the conservative direction for a lever
 * whose whole claim is "money arrives eventually".
 */
export function loanEndYear(loan: Liability, now = new Date()): number {
  const thisYear = now.getFullYear();
  if (Number.isFinite(loan.derivedEndYear) && (loan.derivedEndYear ?? 0) > thisYear) {
    return loan.derivedEndYear as number;
  }
  if (!(loan.monthlyEMI > 0) || !(loan.outstandingBalance > 0)) return thisYear + 1;
  const r = Math.max(0, loan.interestRate / 100) / 12;
  const ratio = 1 - (loan.outstandingBalance * r) / loan.monthlyEMI;
  const months =
    r > 0 && ratio > 0
      ? Math.log(1 / ratio) / Math.log(1 + r)
      : loan.outstandingBalance / loan.monthlyEMI;
  return thisYear + Math.min(30, Math.max(1, Math.ceil(months / 12)));
}

/**
 * The loans this household is better off KEEPING: rate strictly below the expected equity return.
 * Strict `<` is deliberate - a loan at exactly the expected return is a coin-flip dressed up as a
 * strategy, and the honest answer for an equal-rate loan is "prepay it" (a guaranteed return beats
 * an expected one). `interestRate` is stored in PERCENT, the assumption as a FRACTION.
 */
export function cheapLoans(snapshot: Household, assumptions: Assumptions): Liability[] {
  const equity = assumptions.equityReturn;
  return snapshot.liabilities.filter(
    (l) => l.monthlyEMI > 0 && Number.isFinite(l.interestRate) && l.interestRate / 100 < equity,
  );
}

/** Build the plan-lever catalog for this household, each already resolved for availability. */
export function buildPlanLevers(ctx: PlanLeverContext): PlanLever[] {
  const { plan } = ctx;
  const loans = plan.snapshot.liabilities.filter((l) => l.monthlyEMI > 0);
  const rollable = cheapLoans(plan.snapshot, plan.assumptions)[0];
  const monthlyExpenses = plan.snapshot.expenses.avgMonthly ?? 0;
  const currentStepUp = plan.assumptions.householdSavingsStepUpPercent ?? 0;

  const byKey: Record<PlanLeverKey, PlanLever> = {
    "step-up-10": {
      key: "step-up-10",
      label: `Raise investing ${STEP_UP_LEVER_PERCENT}% every year`,
      note: "salary hikes to SIP hikes; the single biggest lever",
      available: currentStepUp < STEP_UP_LEVER_PERCENT,
      unavailableNote: `you already plan to raise investing ${currentStepUp}%/yr`,
      apply: (p) => ({
        ...p,
        assumptions: {
          ...p.assumptions,
          // max, never overwrite - a household already stepping up 12% must not be talked DOWN.
          householdSavingsStepUpPercent: Math.max(
            p.assumptions.householdSavingsStepUpPercent ?? 0,
            STEP_UP_LEVER_PERCENT,
          ),
        },
      }),
    },
    "delay-3": {
      key: "delay-3",
      label: `Retire ${DELAY_LEVER_YEARS} years later`,
      note: `${DELAY_LEVER_YEARS} more years of investing, ${DELAY_LEVER_YEARS} fewer to fund`,
      available: true,
      apply: (p) => ({ ...p, targetAge: p.targetAge + DELAY_LEVER_YEARS }),
    },
    "trim-expenses": {
      key: "trim-expenses",
      label: `Trim spending ${Math.round(TRIM_LEVER_PCT * 100)}%`,
      note: "lower spend lowers the target AND frees cash to invest",
      available: monthlyExpenses > 0,
      unavailableNote: "no spending entered yet",
      apply: (p) => ({
        ...p,
        snapshot: {
          ...p.snapshot,
          expenses: {
            ...p.snapshot.expenses,
            // Lowering avgMonthly does BOTH jobs through the kernel: it shrinks the FIRE number
            // (via SWR) and raises the savings residual (income - tax - expenses). No double-count.
            avgMonthly: Math.round((p.snapshot.expenses.avgMonthly ?? 0) * (1 - TRIM_LEVER_PCT)),
          },
        },
      }),
    },
    "direct-plans": {
      key: "direct-plans",
      label: "Move to direct mutual funds",
      note: "~0.8% lower fees means +0.8% return, for free (if you are already on direct plans, ignore this)",
      // Only an affirmative "Direct" closes this lever. Regular / Not sure / never asked => available.
      available: ctx.directPlans !== true,
      unavailableNote: "you are already on direct plans",
      apply: (p) => ({
        ...p,
        assumptions: {
          ...p.assumptions,
          // Equity class ONLY - the TER saving is a mutual-fund fee, not a debt or gold yield.
          // A What-If lever VALUE: this object is never persisted (no new assumption field).
          equityReturn: p.assumptions.equityReturn + DIRECT_PLAN_RETURN_UPLIFT,
        },
      }),
    },
    "no-prepay-roll-emi": {
      key: "no-prepay-roll-emi",
      label: "Don't prepay the home loan - roll the EMI into investing when it ends",
      note: "your loan rate is below what investing earns; keep it, and the day the EMI stops, invest it",
      available: rollable != null,
      unavailableNote:
        loans.length === 0
          ? "no home loan"
          : "your loan costs more than investing earns - prepay it",
      apply: (p) => {
        const loan = cheapLoans(p.snapshot, p.assumptions)[0];
        if (!loan) return p;
        return {
          ...p,
          rolledEmiMonthly: loan.monthlyEMI,
          rolledEmiFromYear: loanEndYear(loan),
        };
      },
    },
  };

  return PLAN_LEVER_KEYS.map((k) => byKey[k]);
}

/**
 * Apply a selection of levers to a plan, in catalog order so the result is deterministic regardless
 * of the order the user ticked the boxes. Unavailable levers are SKIPPED - selecting one can never
 * change the answer (locked by spec), which is what makes a greyed-out row honest.
 */
export function applyPlanLevers(
  plan: PlanInputs,
  levers: PlanLever[],
  selected: readonly PlanLeverKey[],
): PlanInputs {
  const on = new Set(selected);
  return levers
    .filter((l) => l.available && on.has(l.key))
    .reduce<PlanInputs>((acc, l) => l.apply(acc), plan);
}

/**
 * Solve a (possibly perturbed) plan through the ONE solver -> `derive()`.
 *
 * The rolled EMI is applied HERE rather than inside `apply` because the kernel owns the household
 * contribution schedule (`derive.ts` builds it from `householdSavingsStepUpPercent`; per-investment
 * `contributionSchedule` is deliberately NOT read - the gh #11 double-count lock). Expressing the
 * roll as a segment therefore means crediting the EMI only for the share of the accumulation
 * horizon AFTER the loan ends: a loan ending late adds almost nothing, one ending next year adds
 * nearly all of it - never the full EMI from day one, which would be the optimistic lie.
 */
export function solvePlan(plan: PlanInputs): RequiredContributionResult {
  const solved = requiredMonthlyContributionFor({
    snapshot: plan.snapshot,
    assumptions: plan.assumptions,
    lens: plan.lens,
    targetAge: plan.targetAge,
  });
  const emi = plan.rolledEmiMonthly ?? 0;
  if (!(emi > 0) || !Number.isFinite(solved.requiredMonthlyReal)) return solved;

  const yearsToTarget = solved.yearsToTarget;
  if (yearsToTarget <= 0) return solved;
  const yearsUntilLoanEnds = Math.max(
    0,
    (plan.rolledEmiFromYear ?? new Date().getFullYear()) - new Date().getFullYear(),
  );
  const yearsRolling = Math.max(0, yearsToTarget - yearsUntilLoanEnds);
  if (yearsRolling <= 0) return solved;

  // Time-weighted average of the extra inflow over the accumulation horizon (ADR-0004 in spirit:
  // a segment starting at the loan's end year). Under-states the true compounding benefit of a
  // late, large inflow - the honest direction (rule 31): promise less rather than more.
  const effectiveExtra = Math.round((emi * yearsRolling) / yearsToTarget);
  if (!(effectiveExtra > 0)) return solved;

  // The rolled EMI is money the household will invest ANYWAY once the loan clears, so it reduces
  // what must be found from today's cashflow one-for-one, floored at zero.
  return {
    ...solved,
    requiredMonthlyReal: Math.max(0, solved.requiredMonthlyReal - effectiveExtra),
  };
}

/**
 * "Less to find" for a lever selection = how much SMALLER the monthly shortfall becomes.
 *
 *   toFind(plan) = max(0, required - current)   // never negative: a surplus is not a debt
 *   lessToFind   = toFind(baseline) - toFind(with the levers on)
 *
 * Clamped at 0 so a lever is never advertised as a setback, and finite-guarded so an unreachable
 * baseline yields 0 rather than an `Infinity - Infinity` NaN reaching a user (rule 31).
 */
export function toFindMonthly(r: RequiredContributionResult): number {
  if (!Number.isFinite(r.requiredMonthlyReal)) return Number.POSITIVE_INFINITY;
  return Math.max(0, r.requiredMonthlyReal - r.currentMonthlyReal);
}

export function lessToFindFor(
  plan: PlanInputs,
  levers: PlanLever[],
  selected: readonly PlanLeverKey[],
): number {
  if (selected.length === 0) return 0;
  const baseFind = toFindMonthly(solvePlan(plan));
  const withFind = toFindMonthly(solvePlan(applyPlanLevers(plan, levers, selected)));
  // Either side unreachable => no honest saving to claim.
  if (!Number.isFinite(baseFind) || !Number.isFinite(withFind)) return 0;
  return Math.max(0, Math.round(baseFind - withFind));
}

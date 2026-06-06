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

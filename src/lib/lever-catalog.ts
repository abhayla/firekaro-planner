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

/** Household-resolved inputs needed to bound each lever to a realistic max effort. */
export interface AccelerationContext {
  baseline: FireBaseline;
  /**
   * Investable monthly surplus today, real ₹/mo. ≤0 ⇒ the surplus lever is locked.
   * CALLER CONTRACT (double-count guard, FinTech review): MUST be net of money already invested —
   * `income − expenses − existing monthly contributions`. Passing a non-net `income − expenses`
   * double-counts the existing SIP (it's already inside `baseline.monthlySavings`), over-ranking
   * this lever. The caller's spec MUST assert this; no in-module test can catch it.
   */
  monthlySurplus: number;
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
}

const EQUITY_NOTCH_POINTS = 10; // one realistic re-allocation step = +10pp equity

/**
 * Build the realistic-max-effort acceleration levers that have headroom for this household.
 * Order is incidental — the engine ranks by years saved.
 */
export function buildAccelerationLevers(ctx: AccelerationContext): Lever[] {
  const levers: Lever[] = [];

  // 1) Invest the actual monthly surplus.
  if (ctx.monthlySurplus > 0) {
    const surplus = ctx.monthlySurplus;
    levers.push({
      key: "invest-surplus",
      label: "Invest your monthly surplus",
      note: `Invest your spare ${formatINRCompact(surplus)}/mo`,
      apply: (b) => ({ ...b, monthlySavings: b.monthlySavings + surplus }),
    });
  }

  // 2) Trim a realistic slice of recurring expenses — lowers the FIRE target (via SWR) AND adds the
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

  // 3) Shift one realistic risk notch toward equity (bounded by the household's ceiling).
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

  return levers;
}

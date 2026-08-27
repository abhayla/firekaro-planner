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
 * Every plan lever is measured by a full kernel re-solve, so stacking COMPOUNDS - a sum would
 * over-state every combination. The ONE modelled exception is the rolled EMI in `solvePlan`, which
 * is credited as an annuity-equivalent adjustment OUTSIDE the kernel because `derive()` owns the
 * household contribution schedule; its derivation and error direction are documented there.
 */
import type { Household, Liability } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import type { DeriveLens } from "@/lib/derive";
import {
  requiredMonthlyContributionFor,
  type RequiredContributionResult,
} from "@/lib/required-contribution";
import { STEP_UP_MAX_PERCENT } from "@/lib/contribution-schedule";

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

/**
 * The step-up this lever commits to, as the user understands it: "raise my SIP 10% a year".
 *
 * This is a NOMINAL figure - it is what every Indian SIP calculator, AMC top-up-SIP facility and
 * the reference video mean, and it is what the design mock uses (`fk-mock.js` runs entirely in the
 * nominal frame). It MUST NOT be written into `householdSavingsStepUpPercent` directly: that field
 * is REAL (ADR-0004 section 3, `derive.ts` "The step-up is REAL - no inflation added"), so a raw 10
 * there asserts a 1.10 x 1.06 - 1 = 16.6% NOMINAL escalation every year.
 *
 * Measured on the reference persona that error is not academic: a 10% REAL step-up puts Amit's
 * final-year contribution at Rs10.28 L/month in TODAY's money - 206% of his entire take-home - while
 * the card advertised the starting amount as "1.41x current, clearly doable". Exactly the
 * optimistically-early FIRE date ADR-0004 section 3 exists to prevent. Convert at the boundary with
 * `realStepUpPercentFor()`.
 */
export const STEP_UP_LEVER_NOMINAL_PERCENT = 10;

/**
 * The nominal step-up above, expressed in the REAL frame the kernel consumes:
 * `(1 + nominal) / (1 + inflation) - 1`. At the 6% default this is ~3.77%/yr real, which is also
 * the honest reading of Indian salary data (nominal increments ~9-9.5%/yr against ~6% CPI leave
 * ~3% real). Clamped to the ADR-0004 ceiling and floored at 0 - a nominal step-up BELOW inflation
 * is not an accelerator, it is a real-terms cut, and must never be sold as a move.
 */
export function realStepUpPercentFor(inflation: number, nominalPercent = STEP_UP_LEVER_NOMINAL_PERCENT): number {
  const infl = Number.isFinite(inflation) ? inflation : 0.06;
  const real = ((1 + nominalPercent / 100) / (1 + infl) - 1) * 100;
  return Math.min(STEP_UP_MAX_PERCENT, Math.max(0, real));
}
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
/** A home loan's outer edge in India; also the cap on any stored end year we will trust. */
export const MAX_LOAN_TENURE_YEARS = 30;

export function loanEndYear(loan: Liability, now = new Date()): number {
  const thisYear = now.getFullYear();
  if (Number.isFinite(loan.derivedEndYear) && (loan.derivedEndYear ?? 0) > thisYear) {
    // Cap the STORED value exactly like the computed branch below. Without this a corrupt or
    // mis-migrated `derivedEndYear` (say 3500) makes `yearsRolling` zero, so the lever silently
    // reports nothing while staying checked and available - a dead tickbox with no explanation
    // (code-review HIGH).
    return Math.min(thisYear + MAX_LOAN_TENURE_YEARS, loan.derivedEndYear as number);
  }
  if (!(loan.monthlyEMI > 0) || !(loan.outstandingBalance > 0)) return thisYear + 1;
  const r = Math.max(0, loan.interestRate / 100) / 12;
  const ratio = 1 - (loan.outstandingBalance * r) / loan.monthlyEMI;
  const months =
    r > 0 && ratio > 0
      ? Math.log(1 / ratio) / Math.log(1 + r)
      : loan.outstandingBalance / loan.monthlyEMI;
  return thisYear + Math.min(MAX_LOAN_TENURE_YEARS, Math.max(1, Math.ceil(months / 12)));
}

/**
 * The margin by which expected equity must beat a loan rate before "don't prepay" is honest advice.
 *
 * Prepaying is a GUARANTEED, zero-volatility, tax-free return. Equity's 12% is an EXPECTED return
 * carrying ~15-18% annualised volatility and real sequence risk. Comparing the two on raw rates is
 * the classic risk-blind arbitrage argument, and it is the same asymmetry the scalar risk-notch
 * lever is already forbidden from asserting (see its "adds market risk - not a guaranteed gain"
 * caveat above). 2pp is the buffer: at the 12% default the lever gates at loan rates below 10%, so
 * a 7.2% home loan still qualifies comfortably (keeping it IS sound), while an 11% loan-against-
 * property or a 10.5% education loan no longer reads as free money.
 */
export const LOAN_RISK_PREMIUM = 0.02;

/**
 * The loans this household is better off KEEPING: rate below the expected equity return BY THE RISK
 * PREMIUM. A bare `rate < return` would recommend keeping an 11% loan against a 12% expectation - a
 * coin-flip sold as a strategy. `interestRate` is stored in PERCENT, the assumption as a FRACTION.
 *
 * NOTE on Section 24: a self-occupied home loan's interest deduction (up to Rs2L) cuts the EFFECTIVE
 * rate and would make this test EASIER to pass - but it is an OLD-regime-only benefit
 * (`derive.ts` uses it solely inside `estimatedDeductionsForOld`), and the post-Budget-2025 salaried
 * default is the NEW regime, where it is worth nothing. Modelling it would need a regime gate like
 * the scalar `nps-80ccd1b` lever's; we deliberately do NOT credit it, which under-states the case
 * for keeping the loan - the honest direction.
 */
export function cheapLoans(snapshot: Household, assumptions: Assumptions): Liability[] {
  const threshold = assumptions.equityReturn - LOAN_RISK_PREMIUM;
  return snapshot.liabilities
    .filter(
      (l) => l.monthlyEMI > 0 && Number.isFinite(l.interestRate) && l.interestRate / 100 < threshold,
    )
    // DETERMINISTIC order - the lever rolls `[0]`, and picking by data-entry order would roll a
    // car loan under a label that says "the home loan" (code-review). Earliest-ending first (its
    // EMI starts flowing soonest, so it is the biggest real contribution), then largest EMI.
    .sort((a, b) => loanEndYear(a) - loanEndYear(b) || b.monthlyEMI - a.monthlyEMI);
}

/** Build the plan-lever catalog for this household, each already resolved for availability. */
export function buildPlanLevers(ctx: PlanLeverContext): PlanLever[] {
  const { plan } = ctx;
  const loans = plan.snapshot.liabilities.filter((l) => l.monthlyEMI > 0);
  const rollable = cheapLoans(plan.snapshot, plan.assumptions)[0];
  const monthlyExpenses = plan.snapshot.expenses.avgMonthly ?? 0;
  const currentStepUp = plan.assumptions.householdSavingsStepUpPercent ?? 0;
  // The REAL step-up this lever would set, converted from the nominal figure the user sees.
  const leverRealStepUp = realStepUpPercentFor(plan.assumptions.inflation);

  const byKey: Record<PlanLeverKey, PlanLever> = {
    "step-up-10": {
      key: "step-up-10",
      label: `Raise investing ${STEP_UP_LEVER_NOMINAL_PERCENT}% every year`,
      // The parenthetical is the honesty half: the headline is the nominal number the user acts on,
      // the bracket is what it is worth once inflation is taken out - which is what the plan uses.
      note: `salary hikes to SIP hikes (about ${leverRealStepUp.toFixed(1)}% a year after inflation) - the single biggest lever`,
      available: currentStepUp < leverRealStepUp,
      // Populated ONLY when genuinely unavailable - a note that contradicts itself ("you already
      // plan to raise investing 0%/yr") is a trap for any future surface that renders it without
      // checking `available` (code-review).
      ...(currentStepUp < leverRealStepUp
        ? {}
        : { unavailableNote: `you already raise investing ${currentStepUp.toFixed(1)}%/yr after inflation` }),
      apply: (p) => ({
        ...p,
        assumptions: {
          ...p.assumptions,
          // max, never overwrite - a household already stepping up more must not be talked DOWN.
          householdSavingsStepUpPercent: Math.max(
            p.assumptions.householdSavingsStepUpPercent ?? 0,
            realStepUpPercentFor(p.assumptions.inflation),
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
      ...(monthlyExpenses > 0 ? {} : { unavailableNote: "no spending entered yet" }),
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
      ...(ctx.directPlans === true ? { unavailableNote: "you are already on direct plans" } : {}),
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
      ...(rollable != null
        ? {}
        : {
            unavailableNote:
              loans.length === 0
                ? "no home loan"
                : "your loan costs more than investing earns - prepay it",
          }),
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

  // ANNUITY-EQUIVALENT of the rolled EMI, not a linear time-weight.
  //
  // The obvious `emi * yearsRolling / yearsToTarget` is WRONG in the optimistic direction: it
  // spreads a LATE inflow evenly from day one, handing it compounding time it never gets. Measured
  // at a 6% real return over a 20-year horizon that over-credits by 3.5% for a loan ending next
  // year and by 79% for one ending in year 18 - and the error grows precisely as the loan gets
  // later, i.e. worst for the long home loans this lever exists to serve (code-review BLOCKER).
  // An over-stated saving makes the user UNDER-save, the failure mode the honesty mandate names.
  //
  // So: take the future value of the EMI annuity over the years it ACTUALLY flows, then express
  // that same future value as the level monthly amount payable across the WHOLE horizon. Equal
  // future value, honest present framing. `realMonthlyRate` comes from the plan's own assumptions
  // (the kernel's real frame), so this is not a parallel return model.
  const realAnnual = (1 + plan.assumptions.equityReturn) / (1 + plan.assumptions.inflation) - 1;
  const r = Math.pow(1 + Math.max(0, realAnnual), 1 / 12) - 1;
  const nRolling = Math.round(yearsRolling * 12);
  const nTotal = Math.round(yearsToTarget * 12);
  const effectiveExtra =
    r > 0
      ? Math.round(
          ((emi * (Math.pow(1 + r, nRolling) - 1)) / r) * (r / (Math.pow(1 + r, nTotal) - 1)),
        )
      : // Zero real return degenerates to the linear case, which is then exact.
        Math.round((emi * nRolling) / nTotal);
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
  return leverEffectFor(plan, levers, selected).lessToFind;
}

/**
 * What a lever selection actually does, in the three states that are honestly distinguishable.
 *
 * The rupee metric alone is not enough, and the gap is not academic: on the reference persona
 * (Amit, retire at 50) the BASELINE is unreachable - the solver returns Infinity because no
 * feasible monthly amount gets him there. Switching on step-up + delay + direct makes the target
 * reachable at a real number. Reporting that as "0 less to find" (Infinity minus a finite amount
 * is not a claimable saving) would UNDER-sell the single most valuable thing the card can tell a
 * user: your plan just went from impossible to possible. So a rescue is its own state, with its
 * own copy, rather than a rupee figure that cannot exist.
 */
export type LeverEffectKind =
  /** Baseline was unreachable and the moves make the target reachable. */
  | "rescue"
  /** Both reachable: the moves cut the monthly shortfall by `lessToFind`. */
  | "saving"
  /**
   * Baseline is unreachable and these moves do not fix it on their own.
   * Distinct from "none" because "-Rs0/mo less to find" would be a LIE BY FRAMING: the move does
   * help (it is one of a set that together rescue the plan), it just cannot carry the plan alone.
   * On the reference persona EVERY lever taken singly falls here, so collapsing this into "none"
   * renders a card of five "-Rs0/mo" rows - reading as "nothing you do matters", the exact
   * message this feature exists to disprove (rule 31, caught in the T-379 screenshot review).
   */
  | "not-enough-alone"
  /** Nothing selected, or both sides reachable with no measurable change. */
  | "none";

export interface LeverEffect {
  kind: LeverEffectKind;
  /** Rupees/month less to find. Always finite and >= 0; 0 for "rescue" and "none". */
  lessToFind: number;
  /** The monthly amount the perturbed plan needs — finite only when the target is reachable. */
  requiredWith: number;
}

export function leverEffectFor(
  plan: PlanInputs,
  levers: PlanLever[],
  selected: readonly PlanLeverKey[],
): LeverEffect {
  if (selected.length === 0) return { kind: "none", lessToFind: 0, requiredWith: Number.NaN };
  const baseSolved = solvePlan(plan);
  const withSolved = solvePlan(applyPlanLevers(plan, levers, selected));
  const baseFind = toFindMonthly(baseSolved);
  const withFind = toFindMonthly(withSolved);
  const requiredWith = withSolved.requiredMonthlyReal;

  // Still out of reach even with the moves. If the BASELINE was reachable this is genuinely
  // nothing; if it was not, the move is a real contributor that simply cannot do it alone.
  if (!Number.isFinite(withFind)) {
    return {
      kind: Number.isFinite(baseFind) ? "none" : "not-enough-alone",
      lessToFind: 0,
      requiredWith,
    };
  }
  // Was out of reach, now is not: the honest headline is the rescue, not a rupee delta.
  if (!Number.isFinite(baseFind)) return { kind: "rescue", lessToFind: 0, requiredWith };

  const lessToFind = Math.max(0, Math.round(baseFind - withFind));
  return { kind: lessToFind > 0 ? "saving" : "none", lessToFind, requiredWith };
}

/**
 * What ONE lever adds on top of a set already switched on — its MARGINAL contribution.
 *
 * The card's default reading ("what would this move save me?") measures each lever ALONE against
 * the baseline. That is the right question when the baseline is reachable. When it is NOT (the
 * reference persona: no feasible monthly amount reaches age 50), every lever taken singly also
 * fails to reach it, so every row reports the same non-answer and the card ranks nothing.
 *
 * The marginal view fixes that without ever over-claiming: it asks "given what is already ticked,
 * what does adding THIS one change?" — which is exactly the decision the user is making at that
 * checkbox. `others` is the currently-selected set; the lever itself is ignored if already in it.
 */
export function marginalEffectFor(
  plan: PlanInputs,
  levers: PlanLever[],
  lever: PlanLeverKey,
  others: readonly PlanLeverKey[],
): LeverEffect {
  const rest = others.filter((k) => k !== lever);
  const withLever = [...rest, lever];
  const withoutSolved = rest.length === 0 ? solvePlan(plan) : solvePlan(applyPlanLevers(plan, levers, rest));
  const withSolved = solvePlan(applyPlanLevers(plan, levers, withLever));
  const withoutFind = toFindMonthly(withoutSolved);
  const withFind = toFindMonthly(withSolved);
  const requiredWith = withSolved.requiredMonthlyReal;

  if (!Number.isFinite(withFind)) {
    return {
      kind: Number.isFinite(withoutFind) ? "none" : "not-enough-alone",
      lessToFind: 0,
      requiredWith,
    };
  }
  // Adding this lever is what tips the plan from impossible to possible.
  if (!Number.isFinite(withoutFind)) return { kind: "rescue", lessToFind: 0, requiredWith };

  const lessToFind = Math.max(0, Math.round(withoutFind - withFind));
  return { kind: lessToFind > 0 ? "saving" : "none", lessToFind, requiredWith };
}

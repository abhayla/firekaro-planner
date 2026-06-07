/**
 * Post-FIRE decumulation guardrails (objective-4 — "keep them free after they stop").
 *
 * Two pure, real-frame accessors that turn the existing decumulation math into honest
 * user-facing signals for the /fire-goals/drawdown surface:
 *
 *  - {@link safeWithdrawalBands} — THIS year's safe withdrawal range. REUSES the existing
 *    Floor/Ceiling rule (`floorCeilingWithdrawal` + `DEFAULT_FLOOR_CEILING`) — no withdrawal
 *    math is duplicated here.
 *  - {@link sequenceRiskWarning} — the decumulation sequence-of-returns warning. Sequence
 *    risk (a bad market in the FIRST retirement years) is the #1 way a retiree goes broke,
 *    and a smooth-average projection can NEVER show it. So this runs a deterministic
 *    bad-early-sequence depletion stress (rule 31 honesty — never an optimistic average).
 *
 * EVERYTHING IS REAL-FRAME (#20/#47): the corpus, withdrawal, return, and ages are all in
 * the SAME real-terms frame the headline uses. Callers pass the headline's own
 * `fireWithdrawableCorpus`, real SWR, and real blended return — never a parallel
 * computation (the 526e100 coherence lesson). Pure: no store/DOM access (`calculation-modules.md`).
 *
 * DEFERRED (good-to-have, noted in the run's DEFERRED file): a Monte-Carlo decumulation
 * depletion PROBABILITY. `monte-carlo.ts` simulates ACCUMULATION (years-to-target), not a
 * drawdown phase, so a probabilistic depletion engine is net-new and out of must-have scope;
 * the deterministic bad-sequence stress below is the shipped must-have.
 */
import {
  DEFAULT_FLOOR_CEILING,
  floorCeilingWithdrawal,
  type FloorCeilingWithdrawalConfig,
} from "@/lib/withdrawal-strategy";

// ---------------------------------------------------------------------------
// Stage A — this-year safe-withdrawal bands
// ---------------------------------------------------------------------------

export interface SafeWithdrawalBandsInput {
  /** Current (withdrawable) corpus, real ₹. */
  corpus: number;
  /** Real safe withdrawal rate (decimal, e.g. 0.035). */
  swr: number;
  /** Inflation for the Floor/Ceiling rule. In the real frame pass 0. */
  inflation: number;
  /** Years since retirement started (0 = first year). */
  yearsIntoRetirement?: number;
  /** Last year's actual withdrawal (real ₹) — lets the Floor/Ceiling guardrail fire. */
  priorYearWithdrawal?: number;
}

export interface SafeWithdrawalBands {
  /** Lower guide — the reduced spend in a down year (real ₹). */
  floor: number;
  /** Upper guide — the headroom when the corpus runs healthy (real ₹). */
  ceiling: number;
  /** The rule's recommended draw this year (real ₹). */
  suggested: number;
  /** Which guardrail (if any) has fired this year. */
  triggered: "floor" | "ceiling" | "none";
}

/**
 * This year's safe withdrawal range, real ₹. Wraps the EXISTING Floor/Ceiling rule:
 *  - `suggested` is the rule's recommended draw (= corpus·SWR at the at-FIRE snapshot, or
 *    the guardrail-adjusted draw once a prior year + corpus movement are supplied).
 *  - the band BRACKETS `suggested` with the SAME DEFAULT_FLOOR_CEILING multipliers
 *    (floorMultiplier 0.8 / ceilingMultiplier 1.2), so `floor ≤ suggested ≤ ceiling` holds in
 *    EVERY path (baseline / floor-triggered / ceiling-capped) — one reference frame, no
 *    self-contradictory range in a down year.
 *  - `triggered` is the Floor/Ceiling rule's own verdict (`floor` / `ceiling` / `none`).
 *
 * The bands are shown as a guide EVEN when the user's configured rule is "Constant" — it is a
 * "here's the safe range" guardrail, not a setting. Non-positive corpus/SWR → honest zeros.
 *
 * NOTE on the snapshot model: with no `priorYearWithdrawal`, the current corpus IS the
 * retirement-start anchor (year-0 snapshot → suggested = corpus·SWR, triggered "none"). When a
 * prior draw + corpus movement ARE supplied, the anchor is reconstructed as `priorYearWithdrawal /
 * swr` — exact when the prior draw was itself an SWR draw on the start corpus (the typical year-1
 * case), and an approximation in later years once guardrail/inflation adjustments have moved the
 * draw away from start·SWR. In the real frame `inflation` is passed as 0, so the only drift source
 * is prior guardrail adjustments; the `triggered` verdict stays directionally correct.
 */
export function safeWithdrawalBands(input: SafeWithdrawalBandsInput): SafeWithdrawalBands {
  const { corpus, swr, inflation, yearsIntoRetirement = 0, priorYearWithdrawal } = input;

  if (!(corpus > 0) || !(swr > 0)) {
    return { floor: 0, ceiling: 0, suggested: 0, triggered: "none" };
  }

  const config: FloorCeilingWithdrawalConfig = {
    ...DEFAULT_FLOOR_CEILING,
    swr,
    inflation,
  };

  const startingCorpus = priorYearWithdrawal && priorYearWithdrawal > 0 ? priorYearWithdrawal / swr : corpus;
  const prior = priorYearWithdrawal ?? corpus * swr;

  const ruled = floorCeilingWithdrawal(config, startingCorpus, corpus, yearsIntoRetirement, prior);
  const suggested = Math.round(ruled.withdrawal);

  // Band brackets the suggested draw with the SAME DEFAULT_FLOOR_CEILING multipliers, so
  // floor ≤ suggested ≤ ceiling is guaranteed in every guardrail path (no stock/flow frame split).
  const floor = Math.round(suggested * DEFAULT_FLOOR_CEILING.floorMultiplier);
  const ceiling = Math.round(suggested * DEFAULT_FLOOR_CEILING.ceilingMultiplier);

  const triggered =
    ruled.rule === "floor-triggered" ? "floor" : ruled.rule === "ceiling-capped" ? "ceiling" : "none";

  return { floor, ceiling, suggested, triggered };
}

// ---------------------------------------------------------------------------
// Stage B — decumulation sequence-of-returns warning
// ---------------------------------------------------------------------------

/**
 * Early-retirement shock magnitude + window — the SAME 30% / first-3-years magnitude as the
 * existing accumulation stress convention (`stress-test.ts`, scenario `market-correction-3yr`:
 * "30% market correction in first 3 years"), NOT a newly-invented number. That scenario models
 * the crash for ACCUMULATION as a years-to-FIRE return haircut (−0.04); the decumulation model
 * here re-implements the SAME crash correctly for DRAWDOWN — an actual 30% real corpus hit in
 * year 1, then a flat real recovery through year 3 — which is how an early bad sequence ruins a
 * retiree. The magnitude is mirrored, not imported (kept as local constants to avoid coupling a
 * drawdown engine to an accumulation scenario's `apply`); a shared exported constant is a tracked
 * nice-to-have (see the run's DEFERRED note).
 */
export const DECUMULATION_EARLY_SHOCK = 0.3;
export const DECUMULATION_SHOCK_YEARS = 3;

export interface DrawdownSim {
  /** 0-based year index the corpus first hits ≤ 0, or null if it survives the horizon. */
  depletionYear: number | null;
  /** Balance after the horizon (real ₹), clamped at 0 once depleted. */
  finalBalance: number;
}

/**
 * Year-by-year drawdown simulation, withdraw-then-grow (the conservative ordering — the
 * year's spending leaves before that year's market return). Pure; real-frame in, real-frame out.
 */
export function simulateDrawdown(
  corpus: number,
  annualWithdrawal: number,
  years: number,
  returnForYear: (year: number) => number,
): DrawdownSim {
  let balance = corpus;
  for (let y = 0; y < years; y++) {
    balance -= annualWithdrawal;
    if (balance <= 0) return { depletionYear: y, finalBalance: 0 };
    // Guard a non-finite return (NaN/Infinity would silently poison the balance — a NaN
    // never trips `<= 0`, so it would neither deplete nor clamp). Treat it as 0% real.
    const r = returnForYear(y);
    balance *= 1 + (Number.isFinite(r) ? r : 0);
  }
  return { depletionYear: null, finalBalance: Math.round(balance) };
}

export interface SequenceRiskInput {
  /** Retirement-start corpus, real ₹ (the headline's `fireWithdrawableCorpus`). */
  corpus: number;
  /** Planned annual withdrawal, real ₹ (corpus·SWR — the headline-coherent draw). */
  annualRealWithdrawal: number;
  /** Real expected (blended) return — the headline's real return. */
  expectedRealReturn: number;
  /** Years from retirement start to plan-to age. */
  yearsInRetirement: number;
  /** Retirement-start age — additive; enables the depletion AGE in the output when known. */
  fireAge?: number;
  /** Override the early shock magnitude (defaults to the stress-test-sourced 30%). */
  earlyShock?: number;
  /** Override the shock window (defaults to the stress-test-sourced 3 years). */
  shockYears?: number;
}

export interface SequenceRiskResult {
  /** Corpus runs out before plan-to age even under the SMOOTH expected path (underfunded). */
  depletes: boolean;
  /** Age the corpus hits zero under the BAD early sequence (only when fireAge is supplied). */
  depletionAge?: number;
  /** Corpus survives to plan-to age under the bad early sequence. */
  survivalUnderBadSequence: boolean;
  /** Honest, plain-language summary — decision-support, never advice. */
  note: string;
  /**
   * True when the plan can't meaningfully be stress-tested yet — no corpus / not at FIRE, or no
   * withdrawal/horizon. The UI MUST render a neutral "we can't stress-test yet" state on this —
   * NEVER the red depletion alarm (the gh-#39 empty-data false-positive class, rule 31). Lets the
   * card branch on one lib-owned signal instead of re-deriving "plannable" (which can drift).
   */
  unplannable: boolean;
}

/**
 * Decumulation sequence-of-returns warning. Stresses the plan against a BAD EARLY sequence
 * (a 30% real crash in the first retirement years, then normal real returns, withdrawing the
 * planned amount each year) and reports whether the corpus survives to plan-to age. A smooth
 * average can never deplete, so it would manufacture false confidence — this MUST use the
 * bad-sequence stress (rule 31). Pure; real-frame; all denominators guarded.
 */
export function sequenceRiskWarning(input: SequenceRiskInput): SequenceRiskResult {
  const {
    corpus,
    annualRealWithdrawal,
    expectedRealReturn,
    yearsInRetirement,
    fireAge,
    earlyShock = DECUMULATION_EARLY_SHOCK,
    shockYears = DECUMULATION_SHOCK_YEARS,
  } = input;

  if (!(corpus > 0)) {
    return {
      depletes: true,
      depletionAge: fireAge,
      survivalUnderBadSequence: false,
      note: "You're not at FIRE yet — this matters once you reach your FIRE number. Here's the preview.",
      unplannable: true,
    };
  }
  if (!(annualRealWithdrawal > 0) || !(yearsInRetirement > 0)) {
    return {
      depletes: false,
      survivalUnderBadSequence: true,
      note: "Add your expenses and plan-to age so we can test your plan against a bad early-retirement market.",
      unplannable: true,
    };
  }

  // Guard a non-finite expected return (and shock) before they flow into `1 + return`.
  const realReturn = Number.isFinite(expectedRealReturn) ? expectedRealReturn : 0;
  const shock = Number.isFinite(earlyShock) ? earlyShock : DECUMULATION_EARLY_SHOCK;

  const badReturn = (y: number): number =>
    y === 0 ? -shock : y < shockYears ? 0 : realReturn;
  const smoothReturn = (): number => realReturn;

  const bad = simulateDrawdown(corpus, annualRealWithdrawal, yearsInRetirement, badReturn);
  const smooth = simulateDrawdown(corpus, annualRealWithdrawal, yearsInRetirement, smoothReturn);

  const survivalUnderBadSequence = bad.depletionYear === null;
  const depletes = smooth.depletionYear !== null;
  const depletionAge =
    !survivalUnderBadSequence && fireAge !== undefined ? fireAge + (bad.depletionYear as number) : undefined;

  const shockPct = Math.round(shock * 100);
  const endAge = fireAge !== undefined ? fireAge + yearsInRetirement : undefined;

  let note: string;
  if (survivalUnderBadSequence) {
    note = endAge !== undefined
      ? `Your corpus lasts to age ${endAge} even after a ${shockPct}% crash in your first ${shockYears} retirement years — your withdrawal plan has a healthy margin.`
      : `Your corpus survives a ${shockPct}% crash in your first ${shockYears} retirement years — your withdrawal plan has a healthy margin.`;
  } else if (depletes) {
    // Underfunded even under the SMOOTH path — surface the SMOOTH depletion age here, not the
    // bad-sequence age (mixing the two produced self-contradictory copy).
    const smoothAge =
      fireAge !== undefined && smooth.depletionYear !== null ? fireAge + smooth.depletionYear : undefined;
    const byAge = smoothAge !== undefined ? ` (around age ${smoothAge})` : "";
    note = `Your corpus runs out before your plan-to age even under normal markets${byAge}. Lowering withdrawals or growing the corpus is the lever.`;
  } else {
    const byAge = depletionAge !== undefined ? ` by about age ${depletionAge}` : "";
    note = `Under normal markets your corpus lasts — but a bad market in your first ${shockYears} retirement years could deplete it${byAge}. A cash buffer for the early years or lower initial withdrawals protects against this, the #1 risk for a new retiree.`;
  }

  return { depletes, depletionAge, survivalUnderBadSequence, note, unplannable: false };
}

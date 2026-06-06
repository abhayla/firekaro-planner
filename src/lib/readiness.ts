/**
 * readiness.ts — the objective-3 "can I pull the trigger?" classifier (#obj-3).
 *
 * A PURE decision-support classifier layered ON TOP of the accessible-money
 * bridge ({@link computeBridgeCoverage}). It adds NO new FIRE math — it reads the
 * bridge's already-computed outputs (effective FIRE age, corpus-adequate age,
 * liquidity shortfall) plus the household's current + target ages, and answers
 * one honest question: *can this household stop working now, and if not, at what
 * age and why?*
 *
 * HONESTY CONTRACT (rule 20/31): the verdict is NEVER more optimistic than the
 * headline. `readyAtAge` is the bridge's `effectiveFireAge` verbatim (the same
 * bridge-adjusted age the FireHero headline uses), so the readiness page can
 * never claim an earlier date than the dashboard — the exact divergence class
 * fixed in the #48 AccelerationCard (526e100). It NEVER reports "ready-now" while
 * the bridge has a live early-years liquidity shortfall, and a zero/unreachable
 * plan is "unplannable" (an honest empty state), never a false "ready" (#39).
 *
 * Decision-support, not advice: it states whether the plan supports stopping and
 * what the binding constraint is — it never tells the user to retire. Pure (no
 * store/DOM access) per `.claude/rules/calculation-modules.md`; the component
 * phrases the copy (this returns data, not strings).
 */
import type { BridgeCoverage } from "@/lib/bridge";

/** The five honest, exhaustive readiness states. */
export type ReadinessState =
  | "ready-now" // corpus is there AND the liquid runway covers the early years today
  | "ready-at-age" // not now, but the plan supports stopping by the target age
  | "bridge-limited" // corpus is there now, but locked money sets a later sustainable date
  | "corpus-short" // the corpus itself isn't there yet — still accumulating past target
  | "unplannable"; // no finite, plannable FIRE age (zero / absurd inputs)

/** What is holding the household back from stopping (null when nothing is). */
export type BindingConstraint = "liquidity" | "corpus" | null;

export interface ReadinessVerdict {
  state: ReadinessState;
  /** The bridge-effective sustainable FIRE age (== bridge.effectiveFireAge), or null when unplannable. */
  readyAtAge: number | null;
  /** The binding constraint for the not-ready states; null for ready-now / ready-at-age / unplannable. */
  bindingConstraint: BindingConstraint;
  /** Whole years from the current age to readyAtAge (0 when ready now); null when unplannable. */
  gapYears: number | null;
}

export interface ReadinessInput {
  /** The accessible-money bridge coverage — null when the plan is unreachable / past-horizon (→ unplannable). */
  bridge: BridgeCoverage | null;
  /** The household's current (anchor) age. */
  currentAge: number;
  /** The household's chosen target retirement age. */
  targetRetirementAge: number;
}

const UNPLANNABLE: ReadinessVerdict = {
  state: "unplannable",
  readyAtAge: null,
  bindingConstraint: null,
  gapYears: null,
};

/**
 * Classify a household's readiness to stop working from the existing bridge
 * outputs. Pure: same inputs → same verdict, no side effects.
 */
export function computeReadiness(input: ReadinessInput): ReadinessVerdict {
  const { bridge, currentAge, targetRetirementAge } = input;

  // Unplannable guard — never a false "ready" on zero / absurd data (#39 class).
  // A null bridge means the corpus never reaches the FIRE number at a plannable
  // age (unreachable target or past the plan horizon) → there is no date to give.
  if (
    !bridge ||
    !Number.isFinite(currentAge) ||
    !Number.isFinite(bridge.effectiveFireAge) ||
    bridge.effectiveFireAge <= 0 ||
    bridge.effectiveFireAge > 120
  ) {
    return UNPLANNABLE;
  }

  // readyAtAge is the bridge's effective age VERBATIM (the honesty anchor — it can
  // never be earlier than the headline, which uses the same effectiveFireAge).
  const readyAtAge = bridge.effectiveFireAge;
  const gapYears = Math.max(0, Math.round(readyAtAge - currentAge));

  // A live liquidity shortfall is what pushes effectiveFireAge past the corpus-only
  // age — i.e. the locked money can't cover the early retirement years.
  const hasLiquidityGap = !bridge.covered;
  // Is the corpus already adequate at (or before) the current age?
  const corpusAdequateNow = bridge.corpusOnlyFireAge <= currentAge;

  // 1. Ready now — the sustainable age is today or in the past. Because
  //    effectiveFireAge is the FIRST genuinely-covered age, reaching it by the
  //    current age means the liquid runway already covers the early years; this
  //    can NEVER coincide with a live shortfall at the current age (the #90
  //    optimistic-honesty trap is structurally impossible here).
  if (readyAtAge <= currentAge) {
    return { state: "ready-now", readyAtAge, bindingConstraint: null, gapYears: 0 };
  }

  // 2. Bridge-limited — the corpus is there NOW, but locked money (PPF / NPS
  //    annuity / illiquid assets) sets a later sustainable date. The honest
  //    signal: saving more won't help; freeing or rebalancing locked money will.
  //    Takes precedence over the on-track check below: when the corpus is already
  //    met, the genuinely binding constraint is liquidity even if the sustainable
  //    age still lands on/before the target. (Conservative corner: if the bridge
  //    never finds a coverable age it reports effectiveFireAge = planToAge, so this
  //    can label a never-coverable plan "bridge-limited" — an honest, NON-optimistic
  //    over-conservatism, never a false "ready"; the copy just can't promise the
  //    rebalance fully closes the gap at that horizon.)
  if (corpusAdequateNow && hasLiquidityGap) {
    return { state: "bridge-limited", readyAtAge, bindingConstraint: "liquidity", gapYears };
  }

  // The corpus is NOT adequate now → the household is still accumulating. Split on
  // whether the plan reaches a *finite, chosen* target age:
  const onTrackForTarget =
    Number.isFinite(targetRetirementAge) && readyAtAge <= targetRetirementAge;

  // 3. Corpus-short — not on track for the target (past it, or no meaningful target
  //    set). The binding constraint is accumulation; keep going. A non-finite target
  //    must NOT fall through to the reassuring "ready-at-age" — an accumulating
  //    household with no real target is corpus-short, not "on track".
  if (!onTrackForTarget) {
    return { state: "corpus-short", readyAtAge, bindingConstraint: "corpus", gapYears };
  }

  // 4. Ready-at-age — not now, but the plan supports stopping by the chosen target
  //    age. Reassuring: on track. The lever to pull it earlier is more savings/return.
  return { state: "ready-at-age", readyAtAge, bindingConstraint: null, gapYears };
}

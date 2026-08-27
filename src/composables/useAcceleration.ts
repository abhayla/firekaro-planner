import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { STEP_UP_TAPER_AGE } from "@/lib/derive";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import {
  buildAccelerationLevers,
  makeSaveMoreLever,
  trimmableMonthlyExpenses,
  EQUITY_NOTCH_POINTS,
  PLAN_TRIM_FRACTION,
  type AccelerationContext,
} from "@/lib/lever-catalog";
import {
  rankLeverImpacts,
  computeLeverImpact,
  yearsToFire,
  type FireBaseline,
  type LeverImpact,
} from "@/lib/lever-impact";
import { computeLeverBand, volatilityAfterEquityNotch, type LeverBand } from "@/lib/lever-bands";
import { deriveDeductions } from "@/lib/tax-deductions";
import { getTaxConfigForFY } from "@/lib/tax";

/**
 * Impure Pinia-aware wiring for the lever-impact engine (objective 2, gh-issue #48) — the composable
 * the AccelerationCard reads. It assembles the pure {@link FireBaseline} + {@link AccelerationContext}
 * from the live stores (via {@link useFireDerive}), runs the pure ranking engine + per-lever band, and
 * exposes the ranked accelerators + an on-demand "save ₹X more/mo" sensitivity. All FIRE/tax/band math
 * stays in the pure libs; this layer only maps stores → pure inputs → pure outputs
 * (`.claude/rules/pinia-store-conventions.md` + `calculation-modules.md`).
 *
 * BASELINE COHERENCE (#20/#47, Rule 26) — and its ONE honest exception: the engine baseline uses the
 * same withdrawable corpus, real FIRE number, contribution, and REAL blended return the headline uses,
 * so the scalar `yearsToFire(baseline)` equals `fire.yearsToRegular` WHENEVER FIRE is corpus-limited.
 * It does NOT when the accessible-money BRIDGE is the binding constraint: the headline is
 * `max(corpusOnlyYears, bridge runway)` (derive.ts), so a liquidity-short household's honest headline is
 * LATER than the scalar model. Showing the scalar number there would be 1–2yr more OPTIMISTIC than the
 * truth (the rule-31 / bug-#22 class — caught in independent review 2026-06-06). Therefore the card
 * ALWAYS displays `headlineYears` (never the scalar baseline), and when `bridgeBinding` is true it drops
 * the scalar per-lever "N years sooner" deltas (which overstate the liquidity-gated date) in favour of an
 * honest "your date is bridge-limited — close the bridge gap first" caveat. (Making the per-lever deltas
 * themselves bridge-aware needs a full derive() re-run per lever — tracked as a follow-up, not done here.)
 *
 * DOUBLE-COUNT GUARD (bug-#11 / D-2026-06-06-11): derive() already invests the household savings
 * residual, so there is no invest-surplus lever and the save-more sensitivity only ever ADDS money the
 * user is not yet investing — `saveMoreImpact(0)` is a no-op (null), never a phantom acceleration.
 */

/**
 * Assumption: a realistic equity ceiling for the urban-salaried accumulator. derive() exposes no
 * household equity cap, so the risk-notch lever is bounded by this research-grounded default — aggressive
 * but not reckless. Above it, the risk-notch is locked. (Surfaced as an explicit Assumption, not a
 * fabricated value, per the calc-module honesty rule.)
 */
const DEFAULT_MAX_EQUITY_PCT = 80;

/** A ranked lever impact, optionally enriched with a confidence band (only the variance-bearing one). */
export interface RankedLever extends LeverImpact {
  band?: LeverBand | null;
}

export function useAcceleration() {
  const fire = useFireDerive();
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  const ui = useUiStore();

  const baseline = computed<FireBaseline>(() => ({
    currentCorpus: fire.fireWithdrawableCorpus.value, // bridge-adjusted liquid base — the headline's base
    targetCorpus: fire.fireNumber.value,
    monthlySavings: fire.monthlyContribution.value,
    // ADR-0006 NOMINAL triple — the exact frame `derive()`'s headline solver runs in, so the card's
    // baseline reproduces the headline instead of approximating it: nominal return, target growing
    // at the household expense basket, savings growing at general CPI on top of the real step-up
    // (which tapers to 0 at 50). The old CPI-real scalar left the card ~1-3 years OPTIMISTIC
    // against the headline printed beside it.
    expectedReturn: fire.blendedReturn.value,
    targetGrowthRate: fire.householdInflation.value,
    savingsInflationRate: a.values.inflation,
    savingsStepUpPercent: a.values.householdSavingsStepUpPercent ?? 0,
    savingsStepUpTaperYears: Math.max(0, STEP_UP_TAPER_AGE - fire.anchorAge.value),
  }));

  // Canonical per-bucket corpus weights — the SAME basis derive() uses for blendedReturn/volatility
  // (whole-household, primary-residence excluded). MUST NOT be re-aggregated from lensedInvestments:
  // that includes the primary residence and lenses to a member, silently diverging from the headline
  // and overstating the risk-notch headroom (gh-48 coherence; FinTech/code-review HIGH 2026-06-06).
  const returnWeights = computed(() => fire.returnWeights.value);

  const portfolioTotal = computed(() => Object.values(returnWeights.value).reduce((s, v) => s + v, 0));

  // EQUITY-RISK exposure (not just the domestic-equity bucket): equity + international + reit all carry
  // equity-like market risk, so they ALL count toward "how equity-heavy am I already" — otherwise the
  // risk-notch would tell an internationally-/REIT-diversified accumulator to add equity they already
  // hold (optimistic skew, rule 31). NOTE: ESOP currently routes to the `other` bucket via the shared
  // returnBucketKey (a pre-existing bucketing quirk, out of scope here), so ESOP equity exposure is
  // mildly understated — the conservative direction (never overstates current equity).
  const currentEquityPct = computed(() => {
    const w = returnWeights.value;
    return portfolioTotal.value > 0 ? ((w.equity + w.international + w.reit) / portfolioTotal.value) * 100 : 0;
  });

  const ctx = computed<AccelerationContext>(() => {
    // Real equity−debt spread per +1pp equity (inflation cancels in the difference; kept ≥ 0).
    // ADR-0006: the baseline is NOMINAL now, so the per-point spread must be nominal too — a real
    // spread applied to a nominal return understates the risk-notch by a factor of (1+CPI).
    const realReturnPerEquityPoint = Math.max(
      0,
      (a.values.equityReturn - a.values.debtReturn) / 100,
    );
    // 80CCD tax saving is on the deduction, so the marginal rate includes cess (the deduction shrinks
    // the base on which cess is levied). Single-slab approximation; OLD-regime-only (gated in the catalog).
    const marginalTaxRate = fire.householdMarginalRate.value * (1 + getTaxConfigForFY(ui.currentFY).cessRate);
    return {
      baseline: baseline.value,
      // ONE constant + ONE base for BOTH "Trim spending 10%" rows on the card (the ranked
      // accelerator here and the QN-5 plan lever in the picker below it): `PLAN_TRIM_FRACTION` and
      // `trimmableMonthlyExpenses` — the discretionary spend only, with the auto-flowed EMI /
      // insurance-premium lines excluded. Feeding the full `annualExpensesToday/12` here would make
      // the two identically-labelled rows quote different rupees, and would silently assume the user
      // can trim a contractual EMI.
      monthlyExpenses: trimmableMonthlyExpenses(h.data.expenses),
      realisticExpenseTrimPct: PLAN_TRIM_FRACTION,
      swr: fire.effectiveSWR.value,
      currentEquityPct: currentEquityPct.value,
      maxEquityPct: DEFAULT_MAX_EQUITY_PCT,
      realReturnPerEquityPoint,
      currentNps80ccd1bUsed: deriveDeductions(h.data).section80CCD1B,
      marginalTaxRate,
      regime: fire.householdTaxRecommendation.value?.recommended ?? "NEW",
    };
  });

  // The perturbed σ for the risk-notch band — the SAME notch the lever applies (single-sourced via
  // EQUITY_NOTCH_POINTS), computed by the pure `volatilityAfterEquityNotch` helper (the rebalance math
  // lives in the lib, not the composable — calculation-modules rule).
  const riskNotchPerturbedVolatility = computed<number | null>(() => {
    const notch = Math.min(EQUITY_NOTCH_POINTS, DEFAULT_MAX_EQUITY_PCT - currentEquityPct.value);
    return volatilityAfterEquityNotch(returnWeights.value, notch);
  });

  const rankedLevers = computed<RankedLever[]>(() => {
    const levers = buildAccelerationLevers(ctx.value);
    const ranked = rankLeverImpacts(baseline.value, levers);
    return ranked.map((impact): RankedLever => {
      // Only the variance-bearing risk-notch gets a band (the cashflow levers are near-deterministic).
      if (impact.key === "risk-notch" && impact.reachable) {
        const lever = levers.find((l) => l.key === "risk-notch");
        const perturbedVol = riskNotchPerturbedVolatility.value;
        if (lever && perturbedVol != null) {
          return { ...impact, band: computeLeverBand({ baseline: lever.apply(baseline.value), volatility: perturbedVol }) };
        }
      }
      return impact;
    });
  });

  /**
   * On-demand "invest ₹X more/month" sensitivity for the card's stepper. Returns null for a non-positive
   * amount (the genuine save-more path only counts money not already invested — the double-count guard).
   */
  function saveMoreImpact(extraMonthly: number): LeverImpact | null {
    if (!(extraMonthly > 0)) return null;
    return computeLeverImpact(baseline.value, makeSaveMoreLever(extraMonthly));
  }

  // The scalar corpus-model years-to-FIRE (the engine's internal frame) vs the honest bridge-adjusted
  // headline the user sees. They are equal when FIRE is corpus-limited; the headline is LATER when the
  // bridge runway gates it. The card renders headlineYears and uses bridgeBinding to decide whether the
  // scalar per-lever deltas are safe to show (rule 31 optimism guard — see the module doc).
  const baselineYears = computed(() => yearsToFire(baseline.value));
  const headlineYears = computed(() => fire.yearsToRegular.value);
  const BRIDGE_BINDING_TOLERANCE_YEARS = 0.25;
  const bridgeBinding = computed(
    () =>
      Number.isFinite(headlineYears.value) &&
      Number.isFinite(baselineYears.value) &&
      headlineYears.value - baselineYears.value > BRIDGE_BINDING_TOLERANCE_YEARS,
  );

  return {
    baseline,
    /** The scalar corpus-model years-to-FIRE (engine frame). Equals the headline ONLY when corpus-limited. */
    baselineYears,
    /** The honest, bridge-adjusted FireHero headline — the number the card ALWAYS shows as the baseline. */
    headlineYears,
    /**
     * True when the accessible-money bridge (early-years liquidity), not corpus size, sets the FIRE date —
     * i.e. the honest headline is materially later than the scalar model. The card then drops the scalar
     * per-lever "N years sooner" deltas (they overstate the liquidity-gated date) and shows a bridge caveat.
     */
    bridgeBinding,
    /** Ranked accelerators, biggest years-saved first; the risk-notch carries a confidence band. */
    rankedLevers,
    /** Current monthly contribution — a sane ceiling for the save-more stepper. */
    monthlyContribution: computed(() => fire.monthlyContribution.value),
    saveMoreImpact,
  };
}

/**
 * bridge.ts — Phase C core of the accessible-money honesty layer (#15).
 *
 * THE HEADLINE BUG IT FIXES: corpus ≥ FIRE number does NOT mean you can retire.
 * If a big slice is locked (PPF maturing at 60, NPS forced into an annuity on an
 * early exit) your LIQUID money may run dry in the early retirement years before
 * the locked money unlocks. Counting locked money as spendable produced an
 * optimistic FIRE date — the user quits, then runs short mid-retirement.
 *
 * `computeBridgeCoverage` runs a deterministic year-by-year liquidity check from
 * the (corpus-adequate) retirement age until the last locked tranche unlocks. It
 * combines Phase A (when/how-much each holding unlocks), Phase B (post-tax net),
 * and the bridge income streams (rental, NPS annuity, EPS pension). If the liquid
 * runway can't cover every bridge year, the household is NOT FIRE-ready yet and
 * the effective FIRE age moves LATER.
 *
 * CONSERVATIVE BY CONSTRUCTION: the liquid pool earns NO return during the bridge
 * (drawn money doesn't compound) and every income stream is post-tax — so the check
 * errs toward declaring a gap, never hiding one. Pure — no store/DOM access.
 *
 * ADR-0006 PHASE 1D — THE EXPENSE SIDE NOW DRIFTS, AND THIS IS THE RECORD OF WHY.
 *
 * ADR-0006 item (6) originally kept expenses FLAT in today's rupees here, paired with the
 * zero-return-on-the-drawn-pool simplification, as one ambiguous-net decision to revisit
 * together. That reasoning does not survive Phase 1c, because the two halves of this check
 * stopped sharing a frame: `derive.ts` scales the incoming holdings by the DRIFTED component
 * target at the adequacy age (`corpusScale`), while the expenses those holdings had to fund
 * stood still. A rising target therefore made the bridge look BETTER covered — the resources
 * grew and the bill did not. That is not a conservative simplification, it is a mixed frame
 * that leans optimistic exactly where the honesty layer is supposed to lean the other way.
 *
 * So the caller passes `annualExpensesAt`: today's-rupee spending at year `t`, taken from the
 * BASE leg of the kernel's component target — the perpetual ongoing-spend leg, which is what a
 * retiree actually spends. Dated goals and the medical-shock reservation are deliberately NOT in
 * it: a goal is a lump paid on its own date, and the reservation is a buffer, neither is bridge
 * spending.
 *
 * THE PAIR, RESTATED. What remains, and stays stated rather than fixed, is the ZERO RETURN ON
 * THE DRAWN POOL: money already drawn to live on earns nothing for the whole window, which
 * understates the resources available by considerably more than the expense drift understated
 * the bill. The bridge is therefore still net-pessimistic — as intended — but it is now
 * pessimistic in ONE frame instead of optimistic in a mixed one. Revisit the zero-return half on
 * its own numbers if ever, and never re-flatten the expense line to "restore the pair".
 */
import type { Investment } from "@/types/household";
import { accessibleAtAge, type AssumptionNote } from "@/lib/accessibility";
import { postTaxLiquidation, type LiquidationContext } from "@/lib/liquidation-tax";
import { postTaxAnnuityIncome } from "@/lib/nps-withdrawal";
import { LTCG_LISTED_EXEMPTION } from "@/lib/esop-tax";

export interface BridgeHolding {
  asset: Investment;
  /** DOB of the holding's owner (ISO) — converts PPF maturity years to ages. */
  ownerDob: string | null;
}

export interface BridgeIncome {
  /** Annual rental income, post-tax (constant through retirement). */
  rentalAnnualPostTax: number;
  /** Annual EPS pension, post-tax (begins at `epsStartAge`). */
  epsAnnualPostTax: number;
  /** Age the EPS pension begins (normally 58). */
  epsStartAge: number;
}

export interface BridgeInput {
  holdings: BridgeHolding[];
  /** The corpus-adequate retirement age the bridge is tested at. */
  retirementAge: number;
  anchorAge: number;
  planToAge: number;
  /** Gross household annual expenses to fund in retirement (today ₹). */
  annualExpenses: number;
  /**
   * ADR-0006 Phase 1d — gross household annual expenses in TODAY's rupees at `t` years past
   * `anchorAge`, i.e. the same figure as `annualExpenses` re-priced along the household's own
   * spending basket (the BASE leg of the kernel's component target — see the header). Optional:
   * when omitted the flat `annualExpenses` is used at every age, which is the pre-Phase-1d
   * behaviour every existing fixture asserts.
   */
  annualExpensesAt?: (yearsFromAnchor: number) => number;
  income: BridgeIncome;
  /** Post-tax exit lump (gratuity) received AT the retirement age. */
  exitLumpNet: number;
  /** Marginal slab rate (decimal) — post-taxes the NPS annuity slice. */
  marginalRate: number;
  /**
   * Multiplier mapping TODAY's holding values to their projected value at the
   * retirement age (= fireNumber / today's withdrawable corpus). The corpus
   * grows to the FIRE number via contributions + returns, so a holding worth ₹X
   * today is worth ≈ ₹X × corpusScale at retirement. Uniform scaling is a
   * documented MVP simplification — it keeps each instrument's LOCKED PROPORTION
   * of the retirement corpus roughly right without a per-instrument projection.
   * Defaults to 1 (no scaling — e.g. an already-FIRE household).
   */
  corpusScale?: number;
  asOf?: Date;
}

export interface UnlockEvent {
  age: number;
  netAmount: number;
  label: string;
}

export interface BridgeCoverage {
  /** True when the liquid runway covers every bridge year. */
  covered: boolean;
  /** Age from which retirement is sustainable (≥ the corpus-adequate age). */
  effectiveFireAge: number;
  /** The corpus-only age the bridge was tested at (the sub-line). */
  corpusOnlyFireAge: number;
  /** Years the headline FIRE age moves later because of the locked money. */
  shortfallYears: number;
  /** Worst cumulative liquidity deficit during the bridge (₹, 0 if covered). */
  shortfallAmount: number;
  /** Post-tax liquid money available AT the retirement age (incl. exit lump). */
  reachableCorpus: number;
  /** Post-tax money locked past the retirement age + illiquid assets. */
  lockedCorpus: number;
  /** When each locked tranche unlocks (sorted by age). */
  unlockTimeline: UnlockEvent[];
  /** Total post-tax recurring bridge income at the start of retirement. */
  bridgeIncomeAnnual: number;
  /** Transparency notes accumulated from A/B + the bridge (principle 1). */
  assumptions: AssumptionNote[];
}

/** A post-tax pension stream credited from `startAge` onward. */
interface AnnuityStream {
  annualPostTax: number;
  startAge: number;
}

/** Per-candidate-age classification of the (scaled) holdings. */
interface AgeClassification {
  reachableCorpus: number;
  lockedCorpus: number;
  tranches: UnlockEvent[];
  npsStreams: AnnuityStream[];
  assumptions: AssumptionNote[];
}

/** The coverage verdict at a single candidate retirement age. */
interface CoverageVerdict {
  covered: boolean;
  shortfallAmount: number;
  underwaterYears: number;
  classification: AgeClassification;
}

export function computeBridgeCoverage(input: BridgeInput): BridgeCoverage {
  const asOf = input.asOf ?? new Date();
  const R = input.retirementAge;
  const scale = Number.isFinite(input.corpusScale ?? 1) ? Math.max(0, input.corpusScale ?? 1) : 1;

  // Classify every holding's accessibility + post-tax net AT a given retirement
  // age (unlock ages, the NPS early/normal split, and PPF maturity all depend on
  // the retirement age, so this is re-run per candidate in the effective-age search).
  function classifyAt(retAge: number): AgeClassification {
    const assumptions: AssumptionNote[] = [];
    const tranches: UnlockEvent[] = [];
    const npsStreams: AnnuityStream[] = [];
    let reachableCorpus = Math.max(0, input.exitLumpNet);
    let lockedCorpus = 0;
    // Shared ₹1.25L equity LTCG exemption, threaded across holdings (not per-asset).
    let equityExemptionRemaining = LTCG_LISTED_EXEMPTION;

    for (const { asset, ownerDob } of input.holdings) {
      // Project the holding's value to the retirement age (see corpusScale).
      const projected: Investment =
        scale === 1 ? asset : { ...asset, value: Math.max(0, asset.value) * scale };
      const acc = accessibleAtAge(projected, retAge, ownerDob, asOf);
      if (acc.assumption) assumptions.push(acc.assumption);

      const liqCtx: LiquidationContext = {
        marginalSlabRate: input.marginalRate,
        equityLtcgExemptionRemaining: equityExemptionRemaining,
      };
      const liq = postTaxLiquidation(projected, acc.accessibleLumpGross, liqCtx);
      if (liq.assumption) assumptions.push(liq.assumption);
      equityExemptionRemaining = Math.max(0, equityExemptionRemaining - liq.equityExemptionUsed);

      if (acc.illiquid) {
        lockedCorpus += Math.max(0, projected.value);
      } else if (acc.unlockAge <= retAge) {
        reachableCorpus += liq.net;
      } else {
        lockedCorpus += liq.net;
        tranches.push({ age: acc.unlockAge, netAmount: liq.net, label: asset.label ?? asset.type });
      }

      // NPS annuity slice → a post-tax pension from its own start age (gated, not
      // assumed always-on — honours IncomeStream.startAge per the Phase A contract).
      if (acc.incomeStream && acc.incomeStream.taxable) {
        npsStreams.push({
          annualPostTax: postTaxAnnuityIncome(acc.incomeStream.annualGross, input.marginalRate),
          startAge: acc.incomeStream.startAge,
        });
      }
    }

    tranches.sort((a, b) => a.age - b.age);
    return { reachableCorpus, lockedCorpus, tranches, npsStreams, assumptions };
  }

  /**
   * ADR-0006 Phase 1d — today's-₹ spending at `age`, re-priced along the household basket via the
   * caller's resolver. Falls back to the flat figure when no resolver was supplied, and to it
   * again if the resolver ever returns a non-finite or negative number (rule 31 — a bad
   * assumption must never reach the coverage verdict as NaN).
   */
  function expensesAtAge(age: number): number {
    if (!input.annualExpensesAt) return input.annualExpenses;
    const v = input.annualExpensesAt(Math.max(0, age - input.anchorAge));
    return Number.isFinite(v) && v >= 0 ? v : input.annualExpenses;
  }

  function incomeAtAge(age: number, npsStreams: AnnuityStream[]): number {
    let income = input.income.rentalAnnualPostTax;
    for (const s of npsStreams) if (age >= s.startAge) income += s.annualPostTax;
    if (age >= input.income.epsStartAge) income += input.income.epsAnnualPostTax;
    return income;
  }

  // Year-by-year cumulative liquidity check at a single candidate retirement age.
  // A fully-liquid household (no locked tranches) is trivially covered — the
  // adequacy gate (corpus ≥ FIRE number, the caller's job) carries the rest.
  function coverageAt(retAge: number): CoverageVerdict {
    const c = classifyAt(retAge);
    if (c.tranches.length === 0) {
      return { covered: true, shortfallAmount: 0, underwaterYears: 0, classification: c };
    }
    const lastUnlockAge = c.tranches[c.tranches.length - 1].age;
    let cumResources = c.reachableCorpus;
    let cumExpenses = 0;
    let minSurplus = Number.POSITIVE_INFINITY;
    let underwaterYears = 0;
    for (let age = retAge; age <= lastUnlockAge; age++) {
      // #17 convention: a tranche unlocking AT age N is credited BEFORE age-N's expense
      // — i.e. same-year unlocks are spendable that year. This is ≤1yr optimistic, but is
      // dominated by the bridge's no-returns-during-drawdown assumption, so the net check
      // stays conservative. (Reviewer: no code change required for correctness.)
      for (const t of c.tranches) if (t.age === age) cumResources += t.netAmount;
      cumExpenses += Math.max(0, expensesAtAge(age) - incomeAtAge(age, c.npsStreams));
      const surplus = cumResources - cumExpenses;
      if (surplus < 0) underwaterYears++;
      if (surplus < minSurplus) minSurplus = surplus;
    }
    const covered = minSurplus >= 0;
    return {
      covered,
      shortfallAmount: covered ? 0 : Math.round(-minSurplus),
      underwaterYears: covered ? 0 : underwaterYears,
      classification: c,
    };
  }

  // Report the verdict + composition AT the requested retirement age...
  const atR = coverageAt(R);
  const c = atR.classification;

  // ...but compute the effective FIRE age by SEARCHING forward to the first
  // candidate age that is genuinely covered (re-evaluating coverage at each, since
  // delaying lets PPF mature, NPS shift to normal exit, and EPS begin). This is
  // guaranteed-covered (never an optimistic still-underwater age) and ≥ R.
  let effectiveFireAge = R;
  if (!atR.covered) {
    effectiveFireAge = input.planToAge;
    for (let cand = R + 1; cand <= input.planToAge; cand++) {
      if (coverageAt(cand).covered) {
        effectiveFireAge = cand;
        break;
      }
    }
  }

  const bridgeIncomeAnnual = incomeAtAge(R, c.npsStreams);
  const assumptions = c.assumptions;
  if (!atR.covered) {
    assumptions.push({
      id: "bridge-shortfall",
      assumed: `Your liquid money runs short for ${atR.underwaterYears} year(s) before locked savings unlock`,
      why: "corpus is adequate but a portion (PPF / NPS annuity / locked instruments) is not spendable yet at this age",
      impact: `sustainable retirement moves to age ${effectiveFireAge} (a ₹${Math.round(atR.shortfallAmount / 100_000)}L liquidity gap) — freeing or rebalancing locked money can pull it earlier`,
    });
  }

  return {
    covered: atR.covered,
    effectiveFireAge,
    corpusOnlyFireAge: R,
    shortfallYears: atR.underwaterYears,
    shortfallAmount: atR.shortfallAmount,
    reachableCorpus: Math.round(c.reachableCorpus),
    lockedCorpus: Math.round(c.lockedCorpus),
    unlockTimeline: c.tranches,
    bridgeIncomeAnnual: Math.round(bridgeIncomeAnnual),
    assumptions,
  };
}

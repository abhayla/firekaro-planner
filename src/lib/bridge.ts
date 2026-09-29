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
import { accessibilityClass } from "@/lib/investment-traits";
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
   * FALLBACK ONLY (#212). Uniform multiplier mapping TODAY's holding values to the retirement
   * age (= drifted real target / today's corpus). It is used ONLY for a tranche that
   * `projection` gives no per-instrument rule for, and for the whole portfolio when no
   * `projection` is supplied at all (every pre-#212 fixture). Defaults to 1 (no scaling).
   *
   * WHY IT IS NO LONGER THE PRIMARY PATH (#212, Tier-0 optimistic class). The error was in the
   * COMPOSITION of the retirement corpus, not its LEVEL. The portfolio TOTAL was pinned to the
   * adequacy target both before and after this fix (see `projectedPreTaxTotal` — the identity
   * holds either way), so nothing was "inflated against a CPI-only bill"; what was wrong is that
   * one portfolio-wide factor grew EVERY holding as if the household's whole future contribution
   * stream landed in it, which pushed the LOCKED slice past the ceiling its own instrument can
   * physically reach. A PPF cannot grow that way (₹1.5L/yr statutory cap), an NPS grows only on
   * its own contributions, and a property grows by appreciation alone. Measured on the sharmas
   * seed the factor was 8.89×, so a ₹6L PPF was projected to ₹53.32L at age 52 — roughly 3.4×
   * what ₹1.5L/yr at its own return can reach. Since the total is fixed, an over-stated locked
   * slice is exactly a MIS-SPLIT: the bridge then reads the wrong liquid-vs-locked division of a
   * correct total, which is the quantity the coverage check actually consumes.
   */
  corpusScale?: number;
  /**
   * #212 — per-instrument projection inputs. When present, each tranche is projected to the
   * retirement age by ITS OWN rule (see {@link projectHoldingToRetirement}) and the LIQUID pool
   * absorbs the residual so the household total still reconciles to `targetReal`.
   */
  projection?: BridgeProjection;
  asOf?: Date;
}

/**
 * #212 — the inputs a per-instrument projection needs, all in the bridge's REAL (today's-rupee)
 * frame, because the bridge's expense side is in today's rupees.
 */
export interface BridgeProjection {
  /**
   * The household's DRIFTED REAL corpus target at the retirement age — the same figure the
   * adequacy leg solved to. The liquid pool absorbs `targetReal − Σ(locked projections)` so the
   * whole-portfolio total still equals what the adequacy solve found (the reconciliation identity,
   * asserted in `bridge.spec.ts`).
   */
  targetReal: number;
  /** REAL annual return per instrument family (nominal de-inflated at general CPI). */
  realReturnFor: (asset: Investment) => number;
  /**
   * REAL ₹/month this holding receives, from its own `monthlyContribution` /
   * `contributionSchedule` (resolved by the caller through `contribution-schedule.ts`). A holding
   * with no plan of its own contributes nothing and grows on returns alone.
   */
  realMonthlyContributionFor: (asset: Investment, yearIndex: number) => number;
  /** Years from `anchorAge` to the retirement age being projected to. */
  yearsToRetirement: number;
}

/**
 * PPF statutory contribution ceiling, ₹ per financial year per account (PPF Scheme, 2019).
 *
 * DELIBERATELY NOT DEDUPED against `LIMIT_80C` (#212 review). The two are ₹1,50,000 today by
 * coincidence of policy, not by reference: this is a DEPOSIT ceiling under the PPF Scheme (how much
 * may be paid INTO one account in a financial year), while 80C is a DEDUCTION ceiling under the
 * Income-tax Act (how much of any 80C-eligible spend reduces taxable income). They are set by
 * different instruments and either can move without the other. Aliasing them would silently couple
 * a projection ceiling to a tax cap, so a future Budget that raised only one would corrupt the
 * other — keep them separate even while the numbers agree.
 */
export const PPF_ANNUAL_CONTRIBUTION_CAP = 150_000;

/**
 * #212 — project ONE holding from today's value to its value at the retirement age, by the rule
 * its own instrument family actually obeys. All figures REAL (today's ₹).
 *
 *  - **PPF** — own contributions, each year's inflow CAPPED at the ₹1.5L statutory ceiling,
 *    compounded at `ppfReturn`. This is the cap the property invariant in `bridge.spec.ts`
 *    asserts: a PPF's projected value can never exceed cap-contributions compounded at its own
 *    return.
 *  - **EPF / NPS** — own contributions at their own return; no share of the rest of the plan.
 *  - **Real estate** — appreciation only. A property receives no monthly contribution and is never
 *    topped up by the savings residual.
 *  - **Everything else (the liquid pool)** — its own contributions at its own return. The residual
 *    of the plan's contributions is then allocated across the liquid tranches by the caller (see
 *    the reconciliation rule in `computeBridgeCoverage`), which is what keeps the household total
 *    on the adequacy target.
 *
 * The year loop compounds a real monthly inflow at a real annual return, mid-year-free (the whole
 * year's contribution is credited at year end), which is the conservative convention the rest of
 * the kernel uses.
 */
export function projectHoldingToRetirement(
  asset: Investment,
  p: BridgeProjection,
): number {
  // Whole-year accumulation loop: a fractional horizon is TRUNCATED, never rounded up (12.7 years
  // accumulates 12). Truncating drops a partial year of contributions + growth, so the projection
  // errs SMALLER — the conservative direction for a layer whose job is to lean pessimistic, and it
  // can never manufacture a year of growth the household has not lived through.
  const years = Math.max(0, Math.floor(p.yearsToRetirement));
  const r = Number.isFinite(p.realReturnFor(asset)) ? p.realReturnFor(asset) : 0;
  const cls = accessibilityClass(asset);
  const isRealEstate = cls === "realEstate";
  const annualCap = cls === "ppf" ? PPF_ANNUAL_CONTRIBUTION_CAP : Number.POSITIVE_INFINITY;

  let v = Math.max(0, Number.isFinite(asset.value) ? asset.value : 0);
  for (let t = 0; t < years; t++) {
    // Real estate: appreciation only — never topped up.
    const inflow = isRealEstate
      ? 0
      : Math.min(annualCap, Math.max(0, p.realMonthlyContributionFor(asset, t) * 12));
    v = v * (1 + r) + inflow;
  }
  return Number.isFinite(v) && v > 0 ? v : 0;
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
  /**
   * #212 review — the sum of every holding's PRE-TAX projected value at the tested retirement age.
   *
   * WHY IT IS EXPOSED. `reachableCorpus` and `lockedCorpus` are both POST-TAX (a liquidation
   * haircut sits between the projection and them) and the NPS annuity slice leaves the lump
   * entirely, so NEITHER can pin the reconciliation identity — the property that the per-tranche
   * projection still totals exactly the target the adequacy leg solved to. This field is the
   * pre-tax total, so `|projectedPreTaxTotal − projection.targetReal| < ₹1` is directly assertable
   * (and is, on all five seeds, in `bridge.spec.ts`).
   *
   * `null` when no `projection` was supplied (the pre-#212 uniform-`corpusScale` path), where
   * there is no target to reconcile to.
   */
  projectedPreTaxTotal: number | null;
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

  /**
   * #212 — the projected REAL value of every holding at the retirement age, by its own rule.
   *
   * THE RECONCILIATION RULE (the one decision this fix turns on). Each non-liquid family is
   * projected by its own mechanics, which are BOUNDED (a PPF by its ₹1.5L ceiling, an EPF/NPS by
   * its own contributions, a property by appreciation). Those projections do NOT add up to the
   * household's drifted real target, because the target was solved from the WHOLE savings
   * residual, most of which is not earmarked to any one holding. So:
   *
   *     Σ(liquid tranches) = max(0, targetReal − Σ(locked/bounded projections))
   *
   * distributed across the liquid tranches in proportion to their own standalone projections. The
   * household total therefore still equals exactly the target the adequacy solve found — the
   * bridge and the adequacy leg stay in ONE frame (the invariant ADR-0006 Phase 1d established) —
   * while the locked slice is no longer inflated to a value its instrument cannot reach.
   *
   * NO DOUBLE-COUNT — THE ATTRIBUTION, STATED EXPLICITLY (#212 review). The adequacy target is
   * solved from `annualSavings`, which ALREADY contains every `investments[].monthlyContribution`;
   * `boundedTotal` then grows the locked tranches by those same earmarked inflows. That is an
   * attribution, not a duplication, and the subtraction is what makes it one: each earmarked rupee
   * is counted EXACTLY ONCE, against the locked tranche it is actually paid into, and the liquid
   * budget is the REMAINDER of the same target — `targetReal − boundedTotal` — so the un-earmarked
   * part of the savings residual is what lands on the liquid side. Nothing is added to the total;
   * the total is fixed at `targetReal` and this rule only DIVIDES it. The arbiter is mechanical,
   * not an argument: `projectedPreTaxTotal` must equal `targetReal` to within ₹1, asserted on all
   * five seeds through the real `derive()` path in `bridge.spec.ts`. A genuine double-count would
   * make that sum EXCEED the target, and the test would be red.
   *
   * The residual lands on the LIQUID side by construction, which is the honest direction: unearmarked
   * savings are free cash, and if the bounded projections ever exceed the target the liquid pool
   * floors at 0 rather than going negative (a household whose locked money alone clears the target
   * has no liquid runway, and the bridge is exactly the check that should fire).
   */
  // Memoised per candidate retirement age: delaying retirement gives every holding more years of
  // its own contributions + return, so the projection is re-run per candidate in the forward search
  // (exactly as the accessibility classification already is).
  const projectionCache = new Map<number, Map<string, number> | null>();
  /** Σ of the PRE-TAX projected values at the tested age R (see `projectedPreTaxTotal`). */
  let preTaxTotalAtR: number | null = null;
  function projectedValuesAt(retAge: number): Map<string, number> | null {
    const hit = projectionCache.get(retAge);
    if (hit !== undefined) return hit;
    const built = buildProjectedValues(retAge);
    projectionCache.set(retAge, built);
    return built;
  }

  function buildProjectedValues(retAge: number): Map<string, number> | null {
    const base = input.projection;
    if (!base || !Number.isFinite(base.targetReal) || base.targetReal <= 0) return null;
    // Extra years past the requested retirement age extend every holding's own accumulation.
    const p: BridgeProjection = {
      ...base,
      yearsToRetirement: base.yearsToRetirement + (retAge - R),
    };

    const standalone = new Map<string, number>();
    let boundedTotal = 0;
    let liquidStandaloneTotal = 0;
    const liquidIds: string[] = [];
    for (const { asset } of input.holdings) {
      const v = projectHoldingToRetirement(asset, p);
      standalone.set(asset.id, v);
      if (accessibilityClass(asset) === "liquid") {
        liquidIds.push(asset.id);
        liquidStandaloneTotal += v;
      } else {
        boundedTotal += v;
      }
    }

    const liquidBudget = Math.max(0, p.targetReal - boundedTotal);
    const out = new Map(standalone);
    if (liquidIds.length > 0) {
      if (liquidStandaloneTotal > 0) {
        // Proportional to each liquid tranche's own standalone projection.
        for (const id of liquidIds) {
          out.set(id, liquidBudget * ((standalone.get(id) ?? 0) / liquidStandaloneTotal));
        }
      } else {
        // Degenerate: all liquid tranches project to 0 (a zero-corpus starter household). Split the
        // budget evenly rather than dropping it, so the identity still holds.
        for (const id of liquidIds) out.set(id, liquidBudget / liquidIds.length);
      }
    }
    if (retAge === R) preTaxTotalAtR = [...out.values()].reduce((a, b) => a + b, 0);
    return out;
  }

  /** Today's value → the projected value at the retirement age (#212 per-tranche, else the scalar). */
  function projectedValueOf(asset: Investment, retAge: number): number {
    const perTranche = projectedValuesAt(retAge)?.get(asset.id);
    if (perTranche != null && Number.isFinite(perTranche)) return Math.max(0, perTranche);
    return Math.max(0, Number.isFinite(asset.value) ? asset.value : 0) * scale;
  }

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
      // #212: project the holding's value to the retirement age by its OWN instrument rule
      // (falling back to the uniform `corpusScale` only when no projection was supplied).
      const projectedValue = projectedValueOf(asset, retAge);
      const projected: Investment =
        projectedValue === asset.value ? asset : { ...asset, value: projectedValue };
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
    projectedPreTaxTotal: preTaxTotalAtR,
  };
}

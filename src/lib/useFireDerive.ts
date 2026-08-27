import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { derive } from "@/lib/derive";
import {
  buildPlanLevers,
  applyPlanLevers,
  evaluatePlanLevers,
  type PlanInputs,
} from "@/lib/lever-catalog";
import {
  requiredMonthlyContributionFor,
  type RequiredContributionResult,
} from "@/lib/required-contribution";
import { runMonteCarloFire, INDIA_EQUITY_ANNUAL_RETURNS } from "@/lib/monte-carlo";
import { isEmergencyFundEligible } from "@/lib/investment-traits";
import type { ProjectionPoint } from "@/lib/fire-math";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";

/**
 * #139 — DISPLAY-LAYER deflation of the FIRE projection into today's purchasing power.
 *
 * Pure (no store/DOM), exported so the honest-direction invariants are unit-tested
 * directly. The kernel (`derive.ts` / `fire-math.ts`) is UNTOUCHED — this only
 * re-scales the already-emitted, already-rounded projection points for display.
 *
 * When `real` is false the input is returned byte-identical (the toggle-OFF path can
 * never alter a plotted ₹). When true, EVERY ₹ field (corpus + the three FIRE targets
 * + the inflated-expense line + any withdrawal) is divided by `(1 + inflation)^yearIndex`
 * where `yearIndex = point.year − year0` and `year0` = the projection's first year (the
 * SAME origin the kernel uses).
 *
 * Deflator MUST be GENERAL CPI (`assumptions.inflation` ≈6%), NEVER the 4-bucket
 * `householdInflation` (~7.9%) — re-using the healthcare-weighted basket here re-creates
 * the #20 "FIRE-at-115" bug (FinTech-validated 2026-06-03). Because the kernel already
 * inflated the targets at the same general CPI, dividing both corpus and targets by one
 * shared factor PRESERVES the crossover year — a real-terms view never moves the FIRE date.
 */
export function deflateProjectionPoints(
  points: ProjectionPoint[],
  inflation: number,
  real: boolean,
): ProjectionPoint[] {
  if (!real) return points;
  const inf = Number.isFinite(inflation) ? inflation : DEFAULT_ASSUMPTIONS.inflation;
  const year0 = points.length ? points[0].year : new Date().getFullYear();
  const deflate = (v: number, f: number): number => {
    const r = v / f;
    return Number.isFinite(r) ? Math.round(r) : v;
  };
  return points.map((p) => {
    const f = Math.pow(1 + inf, p.year - year0);
    return {
      ...p,
      corpus: deflate(p.corpus, f),
      targetForRegular: deflate(p.targetForRegular, f),
      targetForLean: deflate(p.targetForLean, f),
      targetForFat: deflate(p.targetForFat, f),
      inflatedAnnualExpenses: deflate(p.inflatedAnnualExpenses, f),
      ...(p.withdrawal !== undefined ? { withdrawal: deflate(p.withdrawal, f) } : {}),
    };
  });
}

/**
 * D-2026-06-13-02 — the normalized shape FireHero's headline consumes (member-lensed
 * individual FIRE when "Viewing as <member>", today's household values otherwise).
 */
export interface HeroHeadline {
  isMember: boolean;
  memberName: string | null;
  /** Rendered big age — null = the honest "—" path (unreachable / no DOB), never a sentinel. */
  fireAge: number | null;
  /** May be Infinity when unreachable — consumers MUST gate rendering on `reachable`. */
  yearsToFire: number;
  fireNumber: number;
  corpusForProgress: number;
  fireTargetForProgress: number;
  progressPercent: number;
  annualSavings: number;
  monthlyTakeHome: number;
  reachable: boolean;
}

/**
 * Single source of truth for all FIRE dashboard math — now a thin Pinia-aware
 * wrapper (Stage-T0 B-1). It reads the household + assumptions stores + the UI
 * lens, calls the pure {@link derive} kernel once, and re-exposes every field
 * as a `computed` so the public surface (and every consumer) is unchanged.
 *
 * All math lives in `lib/derive.ts`; the kernel is unit-tested directly in
 * `derive.spec.ts`, and `useFireDerive.seed.spec.ts` locks the end-to-end
 * behaviour through the real stores.
 */
export function useFireDerive() {
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  const ui = useUiStore();

  // The lens defaults to the whole household (derive() only scopes to a member when
  // one is EXPLICITLY selected — gh-issue #22 root fix), so no per-consumer flag is
  // needed: every consumer gets the coherent household FIRE number by default.
  const d = computed(() =>
    derive(h.data, a.values, {
      isFamilyView: ui.isFamilyView,
      viewingMemberId: ui.viewingMemberId,
      currentFY: ui.currentFY,
    }),
  );

  // #81 Phase 3 — the SAME-SCOPE Financial-Health resolver. When an adult is selected in "Viewing
  // as", every figure is THAT member's own slice; on the default "Whole household" view it is the
  // full household (byte-identical). CRUCIAL: a member's share of "Joint"/shared assets, liquid,
  // liabilities and EMI is taken at the SAME `householdSplitPercent` the income/expense attribution
  // uses (FinTech #81 Phase-3 HIGH-1/2 fix). So EVERY FH ratio — net worth (assets − liab), savings
  // rate, DTI (EMI ÷ take-home), emergency months (liquid ÷ burn), health score — divides figures
  // built on ONE identical Joint convention. Mixing a 100%-Joint numerator with a split denominator
  // (the deeper #23 trap) over-states a member's safety; unifying the split kills it. Member-owned =
  // 100%; "Joint"/shared = × split; dependent-owned excluded. Same-scope enforced ONCE, here.
  const memberFinancials = computed(() => {
    const k = d.value;
    const adult = k.individualFireByMember.find((r) => r.memberId === ui.viewingMemberId) ?? null;
    const split = Math.min(100, Math.max(0, a.values.householdSplitPercent ?? 50)) / 100;
    const memberId = adult?.memberId ?? null;
    // The Joint weight applied to every member-scoped FH figure (1 by default = household view).
    const invWeight = (ownerId: string): number =>
      !adult ? 1 : ownerId === memberId ? 1 : ownerId === "Joint" ? split : 0;
    const liabWeight = (ownerId: string, isSharedWithSpouse: boolean): number =>
      !adult ? 1 : ownerId === memberId ? 1 : ownerId === "Joint" || isSharedWithSpouse ? split : 0;

    // Split-scoped lists — the member's SHARE of each holding/loan (own full, Joint × split). The
    // FH screens read these for both totals AND per-row breakdowns, so every screen uses one convention.
    const scopedInvestments = k.lensedInvestments.map((i) => ({
      ...i,
      value: Math.round(i.value * invWeight(i.ownerId)),
    }));
    const scopedLiabilities = k.lensedLiabilities.map((l) => ({
      ...l,
      outstandingBalance: Math.round(l.outstandingBalance * liabWeight(l.ownerId, l.isSharedWithSpouse)),
      monthlyEMI: Math.round(l.monthlyEMI * liabWeight(l.ownerId, l.isSharedWithSpouse)),
    }));

    const totalAssets = scopedInvestments.reduce((s, i) => s + i.value, 0);
    const totalLiabilities = scopedLiabilities.reduce((s, l) => s + l.outstandingBalance, 0);
    const liquid = scopedInvestments
      .filter((i) => isEmergencyFundEligible(i))
      .reduce((s, i) => s + i.value, 0);
    const monthlyEMI = scopedLiabilities.reduce((s, l) => s + l.monthlyEMI, 0);
    // Insurance is per insured-person (not Joint) — lensedInsurance is already the member's own policies.
    const lifeCover = k.lensedInsurance
      .filter((p) => p.type === "Life")
      .reduce((s, p) => s + p.sumAssured, 0);
    const healthCover = k.lensedInsurance
      .filter((p) => p.type === "Health")
      .reduce((s, p) => s + p.sumAssured, 0);
    // Income/tax/expenses: member attribution when lensed (already split-Joint), household by default.
    const annualIncome = adult ? adult.attributableAnnualIncome : k.householdAnnualIncome ?? 0;
    const annualTax = adult ? adult.attributableAnnualTax : k.householdAnnualTax ?? 0;
    const annualExpenses = adult ? adult.attributableAnnualExpenses : k.annualExpensesToday;
    const annualTakeHome = annualIncome - annualTax;
    const surplus = Math.max(0, annualTakeHome - annualExpenses);
    const adultMember = adult ? h.data.members.find((m) => m.id === adult.memberId) ?? null : null;
    return {
      isMemberView: adult != null,
      memberName: adult?.name ?? null,
      // Is the lensed adult an earner? (drives the non-earner health-score caveat.)
      isEarner: adult ? k.lensedEarners.some((m) => m.id === adult.memberId) : true,
      annualIncome,
      annualTax,
      annualExpenses,
      surplus,
      monthlySurplus: Math.round(surplus / 12),
      // Split-scoped lists for the NetWorth/Banking breakdowns (one convention with the ratios).
      scopedInvestments,
      scopedLiabilities,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      liquid,
      // Health-score inputs — each member-scoped (one Joint convention) when lensed, kernel by default.
      monthlyTakeHome: adult ? Math.round(annualTakeHome / 12) : k.monthlyTakeHome,
      monthlyEMI,
      savingsRatePercent: adult
        ? annualTakeHome > 0
          ? Math.round((surplus / annualTakeHome) * 100)
          : 0
        : k.savingsRate,
      // The ONE member FIRE-progress formula — heroHeadline reads this too (cross-screen
      // coherence: FireHero and Financial-Health must never derive the same % twice).
      fireProgressPercent: adult
        ? adult.individualFireNumber > 0 && Number.isFinite(adult.attributableCorpus)
          ? Math.min(100, Math.max(0, Math.round((adult.attributableCorpus / adult.individualFireNumber) * 100)))
          : 0
        : k.progressPercent,
      lifeCover,
      healthCover,
      primaryIncome: adult ? adultMember?.salary?.annualCTC ?? 0 : h.earners[0]?.salary?.annualCTC ?? 0,
    };
  });

  // D-2026-06-13-02 — the ONE selector behind the FireHero headline (reverses the #81
  // hero-invariance per PROJECT-LOG). PURE SELECTION over already-computed kernel values —
  // no FIRE math here. Branches on the "Viewing as" lens:
  //   - Whole household (viewingMemberId null, or a stale id): EXACTLY today's household
  //     fields, byte-identical — the persona's default view is unchanged (#22/#23 guardrail).
  //   - Member selected: that adult's honest mini-household FIRE from individualFireByMember
  //     (attributed corpus/expenses, per-member SWR, the reachability cap intact). An
  //     unreachable individual FIRE yields fireAge null — the hero renders the honest "—",
  //     never a sentinel/absurd age (rule 31 / fire-confidence-band discipline).
  const heroHeadline = computed<HeroHeadline>(() => {
    const k = d.value;
    const r = k.individualFireByMember.find((m) => m.memberId === ui.viewingMemberId) ?? null;
    if (!r) {
      return {
        isMember: false,
        memberName: null,
        // householdFireAge is null when unreachable; guard the no-DOB NaN edge to null too.
        fireAge: k.householdFireAge != null && Number.isFinite(k.householdFireAge) ? k.householdFireAge : null,
        yearsToFire: k.yearsToRegular,
        fireNumber: k.fireNumber,
        corpusForProgress: k.totalCorpus,
        fireTargetForProgress: k.fireNumber,
        progressPercent: k.progressPercent,
        annualSavings: k.annualSavings,
        monthlyTakeHome: k.monthlyTakeHome,
        reachable: Number.isFinite(k.yearsToRegular),
      };
    }
    const mf = memberFinancials.value;
    const reachable = Number.isFinite(r.yearsToIndividualFire);
    return {
      isMember: true,
      memberName: r.name,
      fireAge: reachable && Number.isFinite(r.individualFireAge) ? r.individualFireAge : null,
      yearsToFire: r.yearsToIndividualFire,
      fireNumber: r.individualFireNumber,
      corpusForProgress: r.attributableCorpus,
      fireTargetForProgress: r.individualFireNumber,
      // The one canonical member progress formula lives in memberFinancials (same lens id).
      progressPercent: mf.fireProgressPercent,
      annualSavings: mf.surplus,
      monthlyTakeHome: mf.monthlyTakeHome,
      reachable,
    };
  });

  // ---- T-377 (QN-2): the gap-hero solver, Pinia-aware ----
  // `heroTargetAge` is the ONE age the hero slider and /fire-goals/what-if share: the
  // session-only `ui.whatIfTargetAge` when the user has dragged it, else the household's own
  // `targetRetirementAge` (the persisted plan). Dragging the slider is a what-if — it never
  // writes the plan; "Set as my target" does that through the household store.
  const sliderTargetAge = computed<number>(() => {
    const slider = ui.whatIfTargetAge;
    if (slider != null && Number.isFinite(slider)) return Math.round(slider);
    // Untouched slider ⇒ follow the SAVED plan of whatever scope is on screen. Under a member
    // lens that is THAT adult's own targetRetirementAge — `derive().targetRetirementAge` is
    // deliberately the household/primary-earner value, so using it would show one spouse the
    // other's target age (code-review M3).
    const lensedMember = d.value.applyMemberLens
      ? h.data.members.find((m) => m.id === ui.viewingMemberId) ?? null
      : null;
    const fromPlan = lensedMember?.targetRetirementAge ?? d.value.targetRetirementAge;
    return Number.isFinite(fromPlan) && (fromPlan ?? 0) > 0 ? Math.round(fromPlan as number) : 50;
  });

  const solverLens = computed(() => ({
    isFamilyView: ui.isFamilyView,
    viewingMemberId: ui.viewingMemberId,
    currentFY: ui.currentFY,
  }));

  // ---- QN-5 (T-379): the "how to get there" plan levers ----
  // The catalog is built from the live household + assumptions; the switched-on set lives in
  // `ui.whatIfLevers` (session-only, like the slider). `planBase` is today's plan at the slider
  // age with NO lever applied — the reference every "less to find" is measured against;
  // `activePlan` is the same inputs with the switched-on levers stacked (re-solved, never summed).
  const planLevers = computed(() =>
    buildPlanLevers(h.data, a.values, {
      anchorAge: d.value.anchorAge,
      directPlans: ui.quick?.directPlans ?? null,
      memberLens: d.value.applyMemberLens,
      currentYear: new Date().getFullYear(),
    }),
  );
  const planBase = computed<PlanInputs>(() => ({
    snapshot: h.data,
    assumptions: a.values,
    targetAge: sliderTargetAge.value,
    extraSegments: [],
  }));
  const activePlan = computed<PlanInputs>(() =>
    applyPlanLevers(planBase.value, planLevers.value, new Set(ui.whatIfLevers)),
  );
  /** Each lever ALONE vs today's plan — one full solve per available lever (memoised by Vue). */
  const planLeverEffects = computed(() =>
    evaluatePlanLevers(planBase.value, solverLens.value, planLevers.value),
  );
  /** The age every money figure on the hero is solved at: the slider age, +3 when "retire later" is on. */
  const heroTargetAge = computed<number>(() => activePlan.value.targetAge);

  // One solver run per (household, assumptions, lens, targetAge, levers). Vue caches it, so the
  // slider recomputes only on change. Every number on the hero comes from here — never from a
  // component-local formula (contract §10: no parallel math).
  const requiredContribution = computed<RequiredContributionResult>(() =>
    requiredMonthlyContributionFor({
      snapshot: activePlan.value.snapshot,
      assumptions: activePlan.value.assumptions,
      lens: solverLens.value,
      targetAge: activePlan.value.targetAge,
      extraContributionSegments: activePlan.value.extraSegments,
    }),
  );

  /** The "+3 years → ₹X" slider hint (mockup: "Three more years … Drag to feel it."). */
  const requiredContributionAtTargetPlus3 = computed<RequiredContributionResult>(() =>
    requiredMonthlyContributionFor({
      snapshot: activePlan.value.snapshot,
      assumptions: activePlan.value.assumptions,
      lens: solverLens.value,
      targetAge: activePlan.value.targetAge + 3,
      extraContributionSegments: activePlan.value.extraSegments,
    }),
  );

  return {
    // T-377 (QN-2) — the gap hero's solver + the shared slider age.
    heroTargetAge,
    sliderTargetAge,
    requiredContribution,
    requiredContributionAtTargetPlus3,
    // QN-5 (T-379) — the plan levers + the lever-applied solver inputs.
    planLevers,
    planBase,
    activePlan,
    planLeverEffects,
    solverLens,
    // #81 Phase 3 — the centralized same-scope Financial-Health resolver (member or household).
    memberFinancials,
    // D-2026-06-13-02 — the member-lensed FireHero headline selector (see above).
    heroHeadline,
    applyMemberLens: computed(() => d.value.applyMemberLens),
    lensedMembers: computed(() => d.value.lensedMembers),
    lensedEarners: computed(() => d.value.lensedEarners),
    lensedInvestments: computed(() => d.value.lensedInvestments),
    lensedLiabilities: computed(() => d.value.lensedLiabilities),
    lensedInsurance: computed(() => d.value.lensedInsurance),
    // #66: member-attributable income collections for the Business / Other-Sources screens.
    lensedBusinesses: computed(() => d.value.lensedBusinesses),
    lensedOtherIncome: computed(() => d.value.lensedOtherIncome),
    // #81 Phase 1 — member-attributable expense display (display-only; FIRE total unchanged).
    lensedRecurringExpenses: computed(() => d.value.lensedRecurringExpenses),
    lensedPlannedExpenses: computed(() => d.value.lensedPlannedExpenses),
    lensedMonthlyExpenses: computed(() => d.value.lensedMonthlyExpenses),
    // #81 Phase 2 — standalone individual FIRE per adult + the household−Σ(adults) gap.
    individualFireByMember: computed(() => d.value.individualFireByMember),
    individualFireExpenseGapAnnual: computed(() => d.value.individualFireExpenseGapAnnual),
    householdFireAge: computed(() => d.value.householdFireAge),
    anchorAge: computed(() => d.value.anchorAge),
    targetRetirementAge: computed(() => d.value.targetRetirementAge),
    annualExpensesToday: computed(() => d.value.annualExpensesToday),
    annualIncome: computed(() => d.value.annualIncome),
    annualTax: computed(() => d.value.annualTax),
    annualSavings: computed(() => d.value.annualSavings),
    monthlyContribution: computed(() => d.value.monthlyContribution),
    monthlyTakeHome: computed(() => d.value.monthlyTakeHome),
    savingsRate: computed(() => d.value.savingsRate),
    effectiveSWR: computed(() => d.value.effectiveSWR),
    planToAge: computed(() => d.value.planToAge),
    fireNumber: computed(() => d.value.fireNumber),
    baseFireNumber: computed(() => d.value.baseFireNumber),
    familyLayer: computed(() => d.value.familyLayer),
    familyLayerCorpus: computed(() => d.value.familyLayerCorpus),
    healthcareReservation: computed(() => d.value.healthcareReservation),
    healthcareReservationPercent: computed(() => d.value.healthcareReservationPercent),
    variants: computed(() => d.value.variants),
    blendedReturn: computed(() => d.value.blendedReturn),
    realBlendedReturn: computed(() => d.value.realBlendedReturn),
    realReturnSchedule: computed(() => d.value.realReturnSchedule),
    // ADR-0006: the REAL drift of the FIRE target ((1+basket)/(1+CPI) − 1).
    realTargetDriftRate: computed(() => d.value.realTargetDriftRate),
    portfolioVolatility: computed(() => d.value.portfolioVolatility),
    // Canonical per-bucket corpus weights (₹) backing blendedReturn/portfolioVolatility — the basis
    // the obj-2 acceleration composable must use for risk-notch equity headroom + perturbed σ (gh-48).
    returnWeights: computed(() => d.value.returnWeights),
    // #18 Monte Carlo headline confidence band — LAZY (Vue computed only runs the
    // simulation when a consumer reads it, e.g. FireHero). Same real frame as the
    // corrected headline so p50 ≈ the deterministic years-to-FIRE. The MC tapers its
    // per-year MEAN along the GLIDE schedule (#24 Part 1) so p50 converges to the headline
    // for glide-ON households; meanReturn stays as the scalar fallback (glide-OFF resolves
    // identically). #24 Part 2: HISTORY-FED block-bootstrap — passing the real Indian-equity
    // series swaps the IID draw for circular-block sampling of standardized historical
    // deviations (location-scaled to this household's mean+vol), so the band now carries the
    // REAL return shape + serial structure (mean-reversion) of Indian equity since 1991 —
    // measured tighter-or-equal to IID, not heavier (the lognormal's fat tail was an
    // artifact); surfaced as the "history-informed" disclosure.
    monteCarlo: computed(() =>
      runMonteCarloFire({
        currentCorpus: d.value.fireWithdrawableCorpus,
        targetCorpus: d.value.fireNumber,
        // ADR-0006: the band stays CPI-real; the today's-₹ target DRIFTS at the household
        // basket's excess over CPI so it shares the deterministic headline's frame.
        targetGrowthRate: d.value.realTargetDriftRate,
        monthlySavings: d.value.monthlyContribution,
        meanReturn: d.value.realBlendedReturn,
        meanReturnSchedule: d.value.realReturnSchedule,
        volatility: d.value.portfolioVolatility,
        historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS,
      }),
    ),
    annualEpfVpfContribution: computed(() => d.value.annualEpfVpfContribution),
    householdMarginalRate: computed(() => d.value.householdMarginalRate),
    epfAfterTaxReturn: computed(() => d.value.epfAfterTaxReturn),
    yearsToRegular: computed(() => d.value.yearsToRegular),
    corpusOnlyYearsToRegular: computed(() => d.value.corpusOnlyYearsToRegular),
    bridgeCoverage: computed(() => d.value.bridgeCoverage),
    yearsToLean: computed(() => d.value.yearsToLean),
    yearsToFat: computed(() => d.value.yearsToFat),
    projection: computed(() => d.value.projection),
    // #139 — chart-owned real/nominal toggle. The chart passes its local `showRealTerms`
    // ref; OFF returns the projection byte-identical, ON returns today's-₹ values. Deflator
    // is live GENERAL CPI (`a.values.inflation`), never householdInflation (#20). Crossover
    // markers still read `crossovers` (unchanged) — deflation provably preserves the year.
    deflateProjection: (real: boolean): ProjectionPoint[] =>
      deflateProjectionPoints(d.value.projection, a.values.inflation, real),
    crossovers: computed(() => d.value.crossovers),
    progressPercent: computed(() => d.value.progressPercent),
    fyTax: computed(() => d.value.fyTax),
    householdTaxRecommendation: computed(() => d.value.householdTaxRecommendation),
    // Preserved as a function for the original call-site API (NudgeStack).
    estimatedDeductionsForOld: () => d.value.estimatedDeductionsForOld,
    totalCorpus: computed(() => d.value.totalCorpus),
    totalLiabilitiesValue: computed(() => d.value.totalLiabilitiesValue),
    // Member-scoped twins for the dashboard section-card headlines — re-scope under "Viewing as
    // <member>" so the displayed VALUE matches the lensed instrument/loan COUNT (default-lens =
    // household value, byte-identical). The FIRE number/hero keeps the household totalCorpus above.
    lensedTotalCorpus: computed(() => d.value.lensedTotalCorpus),
    lensedTotalLiabilitiesValue: computed(() => d.value.lensedTotalLiabilitiesValue),
    npsAnnuityIncome: computed(() => d.value.npsAnnuityIncome),
    fireWithdrawableCorpus: computed(() => d.value.fireWithdrawableCorpus),
    // Whole-household income/tax for the cashflow / financial-health charts — they mix income with
    // HOUSEHOLD expenses/savings/tax, so they MUST read the household income (not the lensed display)
    // to avoid a spurious negative surplus under a member lens (#23 HIGH follow-up).
    householdAnnualIncome: computed(() => d.value.householdAnnualIncome),
    householdAnnualTax: computed(() => d.value.householdAnnualTax),
  };
}

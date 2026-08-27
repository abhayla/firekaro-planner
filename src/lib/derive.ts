/**
 * derive() — the pure FIRE-math kernel (Stage-T0 B-1, DEFERRED-v5 Concern #2).
 *
 * ALL the FIRE-dashboard math lives here as a single pure function of plain
 * inputs (household snapshot + resolved assumptions + UI lens). `useFireDerive`
 * is now a thin Pinia-aware wrapper that reads the stores and calls derive(),
 * re-exposing every field as a `computed`. No output changes vs the prior
 * composable — the Sharmas seed spec (`useFireDerive.seed.spec.ts`) is the
 * behaviour lock.
 *
 * Lens semantics (D6): solo OR family-view ON OR no specific member → aggregate
 * whole household; specific member + family-view OFF → that member's slice +
 * the always-visible joint pool.
 */
import {
  isAdultRole,
  type Household,
  type OtherIncomeLine,
  type PlannedFutureLine,
} from "@/types/household";
import { isEarningMember } from "@/lib/member-earning";
import { expenseOwnerMatches, EXPENSE_OWNER_HOUSEHOLD } from "@/lib/expense-attribution";
import { computeIndividualFire } from "@/lib/individual-fire";
import type { Assumptions } from "@/types/assumptions";
import {
  calculateFIRENumber,
  calculateFIREVariants,
  calculateSavingsRate,
  calculateYearsToTarget,
  projectCorpus,
  findCrossovers,
  calculateFamilyLayerCorpus,
  calculateFireTarget,
  type TargetSchedule,
} from "@/lib/fire-math";
import { derivedFamilyLayer, plannedGoalInflationBucket } from "@/lib/derived-records";
import { computeTax, recommendRegime, marginalSlabRate, getTaxConfigForFY } from "@/lib/tax";
import { epfBucketAfterTaxReturn } from "@/lib/epf-vpf";
import { ageFromDOB } from "@/lib/age";
import { toMonthly, toAnnual } from "@/lib/cashflow";
import { returnBucketKey } from "@/lib/investment-traits";
import {
  deriveDeductions,
  computeHousePropertyTax,
  SEC_24A_DEDUCTION_RATE,
  SEC_71_HP_LOSS_SETOFF_CAP,
} from "@/lib/tax-deductions";
import { DEFAULT_FLOOR_CEILING } from "@/lib/withdrawal-strategy";
import { calculateNpsWithdrawal, postTaxAnnuityIncome } from "@/lib/nps-withdrawal";
import { equityPercentAtYear } from "@/lib/glide-path";
import { computeBridgeCoverage, type BridgeHolding } from "@/lib/bridge";
import { deriveEpsPensionForMember, EPS_NORMAL_START_AGE } from "@/lib/eps-pension";
import { deriveGratuityForMember } from "@/lib/gratuity";
import type { ReturnSchedule, ContributionSchedule } from "@/lib/fire-math";
import { buildContributionResolver } from "@/lib/contribution-schedule";

/**
 * ADR-0006: the age at which the household savings step-up stops compounding. The contribution
 * HOLDS at the level it reached (in real terms) — it never drops. Chosen as a conservative proxy
 * for where salaried real wage growth flattens; a plan must not compound a promotion curve into
 * a household's sixties.
 */
export const STEP_UP_TAPER_AGE = 50;
import {
  resolveHouseholdInflation,
  resolveEffectiveSWRByHorizon,
  blendPortfolioReturn,
  blendPortfolioVolatility,
} from "@/lib/assumption-math";

// §24a / §71 house-property tax constants now live in tax-deductions.ts (the single
// source of truth shared with /tax-planning, gh-issue #65). Re-exported here so existing
// importers (derive.spec) keep working unchanged.
export { SEC_24A_DEDUCTION_RATE, SEC_71_HP_LOSS_SETOFF_CAP };

/**
 * Post-tax annual rental CASH for the accessible-money bridge, computed PER-LINE. A let-out
 * (taxable) rental nets gross − marginalRate·(0.7·gross) = gross·(1 − mr·0.7) (Sec 24a: only 70% of
 * NAV is taxable); a rental the user flagged tax-exempt nets FULL gross (no tax). Extracted so the
 * #29 formula is unit-testable independently of the full bridge scenario. gh-issue #29 / #32.
 *
 * §24b/municipal-tax NOT applied to the BRIDGE (retirement-phase) rental, deliberately: this branch
 * only activates for a corpus-adequate retiree, by which point the home loan is assumed paid off, so
 * §24(b) interest no longer applies; municipal taxes are a minor second-order effect on the bridge
 * runway. The FY (accumulation-phase) tax path DOES model both (rentalTaxDeduction below). gh-issue #32.
 */
export function bridgeRentalPostTaxAnnual(
  otherIncome: OtherIncomeLine[],
  marginalRate: number,
): number {
  return otherIncome
    .filter((o) => o.type === "Rental")
    .reduce((s, o) => {
      const gross = toAnnual({ amount: o.amount, period: o.frequency });
      return s + (o.isTaxExempt ? gross : gross * (1 - marginalRate * (1 - SEC_24A_DEDUCTION_RATE)));
    }, 0);
}

import { usableOverride, financialYearStartYear, type DeriveOverrides } from "@/lib/derive-overrides";
export type { DeriveOverrides } from "@/lib/derive-overrides";

export interface DeriveLens {
  isFamilyView: boolean;
  viewingMemberId: string | null;
  currentFY: string;
}

/**
 * ADR-0006 Phase 1b/1d — the within-year CPI re-index factor.
 *
 * The nominal kernel steps the contribution ONCE a year, so the amount paid in month `j` of year
 * `y` is worth `C_real(y)·(1+CPI)^−(j+1)/12` in today's rupees — strictly less than `C_real(y)` in
 * every month of the year. A CPI-real engine (the Monte Carlo band, `lever-bands`) handed the
 * un-discounted figure is credited with purchasing power the nominal kernel never gives, which put
 * the band's p50 ~0.4 years AHEAD of the headline it exists to bracket.
 *
 * This is the mean of those twelve monthly discounts: exact for the year's contribution TOTAL, and
 * independent of `y`, so it is one scalar. At 6% CPI it is 0.969067.
 */
export function cpiWithinYearReindexFactor(inflation: number): number {
  const cpi = Number.isFinite(inflation) ? inflation : 0;
  let sum = 0;
  for (let k = 1; k <= 12; k++) sum += Math.pow(1 + cpi, -k / 12);
  return sum / 12;
}

export function derive(
  household: Household,
  assumptions: Assumptions,
  lens: DeriveLens,
  overrides?: DeriveOverrides,
) {
  const contributionOverride = usableOverride(overrides?.monthlyContributionReal, 0);
  const targetAgeOverride = usableOverride(overrides?.targetRetirementAge, 1);
  const members = household.members;
  // gh #67: earning is DERIVED from labour income (salary / active business), not a role flag.
  const earners = members.filter((m) => isEarningMember(m, household.businesses));
  const isSolo = members.length <= 1;

  // #22 ROOT FIX: the member lens applies ONLY when a member is EXPLICITLY selected
  // (`viewingMemberId` set). With no explicit selection ("All" / the default view),
  // aggregate the WHOLE household. The old `!isFamilyView` default silently scoped a
  // dual-income household to the PRIMARY EARNER (`?? earners[0]`), so the headline
  // divided a household FIRE target (funds both spouses + kids) by ONE earner's
  // savings → an incoherent FIRE age (Sharmas age 81 vs the true household 62). When
  // not lensed, the entire engine — income, tax, AND FIRE adequacy — runs on the
  // household, so every consumer is coherent by construction.
  //
  // #66: "Viewing as <member>" and "Family view" are ORTHOGONAL — selecting a member
  // lenses the member-attributable DISPLAY surfaces regardless of the family-view toggle
  // (the global app-bar control implies whole-app filtering). The gate no longer keys off
  // `!isFamilyView`. Crucially this is still DISPLAY-ONLY: the lensedScope/householdScope
  // split below routes FIRE/adequacy/expenses through the HOUSEHOLD scope, so the headline
  // stays invariant to member selection (the #22/#23 honesty guardrail — locked by
  // headline-plausibility.spec). The member lens re-scopes only what a single person "owns":
  // their income/tax display + their investments/liabilities/insurance/business slices.
  const applyMemberLens = !isSolo && lens.viewingMemberId != null;
  const effectiveLensMemberId: string | null = applyMemberLens ? lens.viewingMemberId : null;
  const lensedMemberIds: Set<string> = applyMemberLens && effectiveLensMemberId
    ? new Set([effectiveLensMemberId])
    : new Set(members.map((m) => m.id));

  // Match a record's ownerId against the lens. "Joint" always visible.
  function ownerMatches(ownerId: string): boolean {
    if (!applyMemberLens) return true;
    if (ownerId === "Joint") return true;
    return lensedMemberIds.has(ownerId);
  }

  const lensedMembers = members.filter((m) => lensedMemberIds.has(m.id));
  const lensedEarners = lensedMembers.filter((m) => isEarningMember(m, household.businesses));
  const lensedInvestments = household.investments.filter((i) => ownerMatches(i.ownerId));
  const lensedLiabilities = household.liabilities.filter(
    (l) => ownerMatches(l.ownerId) || l.isSharedWithSpouse,
  );
  const lensedInsurance = household.insurance.filter((p) =>
    applyMemberLens ? lensedMemberIds.has(p.insuredPersonId) : true,
  );
  // #66: member-attributable DISPLAY collections for the income Business/Other-Sources screens —
  // owned by the lensed member (+ "Joint" always visible). These are DISPLAY-only, exactly like
  // lensedInvestments/Liabilities/Insurance; the FIRE adequacy leg still reads the HOUSEHOLD scope
  // via computeScope below, so adding these does not move the headline (#23 split preserved).
  const lensedBusinesses = household.businesses.filter((b) => ownerMatches(b.ownerId));
  const lensedOtherIncome = household.otherIncome.filter((o) => ownerMatches(o.ownerId));

  // #81 Phase 1: member-attributable itemised-expense DISPLAY collections (mirror of
  // lensedInvestments). A lensed adult sees their OWN itemised lines + the always-shared
  // "Household" lines (lib/expense-attribution → expenseOwnerMatches, keyed on "Household"
  // not "Joint"); the consolidated (no-lens) view sees everything. The `avgMonthly` lump is
  // un-itemisable → always Household → visible in both. CRUCIAL: this is DISPLAY-only — the
  // FIRE/household total still reads the WHOLE household via `annualExpensesToday`
  // (householdScope) below, so the headline stays invariant to member selection (contract §2
  // decision 7 / the #22/#23 honesty guardrail). On the default lens these equal the full
  // lists + `totalMonthlyExpenses` byte-for-byte.
  const expenseLensMatches = (ownerId: string | undefined): boolean =>
    expenseOwnerMatches(ownerId ?? EXPENSE_OWNER_HOUSEHOLD, applyMemberLens, lensedMemberIds);
  const lensedRecurringExpenses = household.expenses.recurring.filter((r) =>
    expenseLensMatches(r.ownerId),
  );
  const lensedPlannedExpenses = household.expenses.plannedFuture.filter((p) =>
    expenseLensMatches(p.ownerId),
  );
  const lensedMonthlyExpenses =
    household.expenses.avgMonthly +
    lensedRecurringExpenses.reduce(
      (s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }),
      0,
    );

  // #23 ROOT FIX: FIRE adequacy is inherently HOUSEHOLD — the family funds one shared corpus and
  // retires together — so an EXPLICIT member drill-down must NOT move the FIRE number/corpus/savings/
  // age. Only the income/tax DISPLAY (annualIncome, fyTax/annualTax, deductions, the tax recommendation)
  // lenses to the selected member. To honour both, the scope-dependent block below is computed via the
  // `computeScope(memberIds)` helper, run TWICE: once over the LENSED set (→ the 4 DISPLAY fields) and
  // once over the WHOLE HOUSEHOLD (→ everything adequacy reads). When `applyMemberLens` is false the two
  // member-sets are identical, so the household scope IS the lensed scope and the default path stays
  // byte-identical. FinTech-validated "option B" (route adequacy through the unlensed path), gh-issue #23.
  const householdMemberIds: Set<string> = new Set(members.map((m) => m.id));

  // Anchor age — effective-lens member's age if lensed, else primary earner. For the HOUSEHOLD
  // adequacy scope the anchor is always the primary earner (passing applyForScope=false collapses
  // to the no-lens branch), so the household ages match the default path exactly.
  function anchorAgeFor(applyForScope: boolean): number {
    if (applyForScope) {
      const m = members.find((x) => x.id === effectiveLensMemberId);
      if (m) return ageFromDOB(m.dateOfBirth);
    }
    const primary = earners[0];
    return primary ? ageFromDOB(primary.dateOfBirth) : 30;
  }
  function targetRetirementAgeFor(applyForScope: boolean): number {
    // T-377: the hero slider's "what if I retired at N" — applied to EVERY scope so the
    // horizon-dependent layers (SWR, glide path, bridge window) all move with it.
    if (targetAgeOverride != null) return targetAgeOverride;
    if (applyForScope) {
      const m = members.find((x) => x.id === effectiveLensMemberId);
      if (m?.targetRetirementAge) return m.targetRetirementAge;
    }
    return earners[0]?.targetRetirementAge ?? 50;
  }
  function planToAgeFor(applyForScope: boolean): number {
    if (applyForScope) {
      const m = members.find((x) => x.id === effectiveLensMemberId);
      if (m?.planToAge) return m.planToAge;
    }
    // gh #34: the household plan horizon must cover the LONGEST-LIVED adult — including a
    // non-earning (homemaker) spouse, who has no income but whose longevity still has to be
    // funded. Keying off earners[0] alone under-provisioned a surviving non-earning spouse.
    const adultPlanTos = members
      .filter((m) => isAdultRole(m.role))
      .map((m) => m.planToAge)
      .filter((p): p is number => typeof p === "number" && p > 0);
    return adultPlanTos.length ? Math.max(...adultPlanTos) : 90;
  }

  // Household-level monthly expenses (joint pool) — scope-independent base.
  const totalMonthlyExpenses =
    household.expenses.avgMonthly +
    household.expenses.recurring.reduce(
      (s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }),
      0,
    );

  const cfg = getTaxConfigForFY(lens.currentFY);

  /**
   * Compute the income → deductions → tax → marginal-rate → savings → corpus → ages bundle for a
   * given member-set. `scoped` is true ONLY for the lensed-drill-down call (so the anchor/expense
   * scoping that lensing implies fires); the household call passes false and reproduces the no-lens
   * path. Called twice (lensed + household, gh-issue #23) — when no member lens applies the two calls
   * have identical inputs and return identical bundles, keeping the default path byte-identical.
   */
  function computeScope(scopeMemberIds: Set<string>, scoped: boolean) {
    const scopeIsLensed = scoped && applyMemberLens;
    const scopeMembers = members.filter((m) => scopeMemberIds.has(m.id));
    const scopeEarners = scopeMembers.filter((m) => isEarningMember(m, household.businesses));
    const scopeOwnerMatches = (ownerId: string): boolean => {
      if (!scopeIsLensed) return true;
      if (ownerId === "Joint") return true;
      return scopeMemberIds.has(ownerId);
    };
    const scopeInvestments = household.investments.filter((i) => scopeOwnerMatches(i.ownerId));
    const scopeLiabilities = household.liabilities.filter(
      (l) => scopeOwnerMatches(l.ownerId) || l.isSharedWithSpouse,
    );
    const scopeInsurance = household.insurance.filter((p) =>
      scopeIsLensed ? scopeMemberIds.has(p.insuredPersonId) : true,
    );
    const scopeBusinesses = household.businesses.filter((b) => scopeOwnerMatches(b.ownerId));
    const scopeOtherIncome = household.otherIncome.filter((o) => scopeOwnerMatches(o.ownerId));

    const anchorAge = anchorAgeFor(scopeIsLensed);
    const targetRetirementAge = targetRetirementAgeFor(scopeIsLensed);
    const planToAge = planToAgeFor(scopeIsLensed);

    // Annual income totals (scoped).
    const salaryIncome = scopeEarners.reduce((s, m) => s + (m.salary?.annualCTC ?? 0), 0);
    const otherTaxable = scopeOtherIncome
      .filter((o) => !o.isTaxExempt)
      .reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0);
    const otherExempt = scopeOtherIncome
      .filter((o) => o.isTaxExempt)
      .reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0);
    // §24a/§24b/municipal-tax/§71 collapse of let-out rent → taxable house-property income.
    // Reduces TAXABLE income ONLY — the landlord still receives full rent as CASH (and the home-loan
    // EMI is a separate household expense), so rentalTaxDeduction is subtracted from the tax
    // grossIncome below, NEVER from annualIncome.total / annualSavings (gh-issue #29 / #32). The math
    // lives in computeHousePropertyTax — the single source of truth shared with /tax-planning so the
    // FIRE-model tax and the tax-planning screen can never diverge (gh-issue #65).
    const { rentalTaxDeduction } = computeHousePropertyTax(scopeOtherIncome);
    const businessShare = scopeBusinesses.reduce(
      (s, b) => s + toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100),
      0,
    );
    const annualIncome = {
      salaryIncome,
      otherTaxable,
      otherExempt,
      businessShare,
      total: salaryIncome + otherTaxable + otherExempt + businessShare,
    };

    // Expenses: household pool is always whole-household (joint) per D6; auto-flow
    // lines tied to lensed insurance/loans only count when those are visible.
    const annualExpensesToday = (() => {
      if (!scopeIsLensed) {
        return totalMonthlyExpenses * 12;
      }
      const insuranceIds = new Set(scopeInsurance.map((p) => p.id));
      const loanIds = new Set(scopeLiabilities.map((l) => l.id));
      const recurringMonthly = household.expenses.recurring.reduce((s, r) => {
        if (r.source === "auto-insurance" && r.sourceRefId && !insuranceIds.has(r.sourceRefId)) return s;
        if (r.source === "auto-loan" && r.sourceRefId && !loanIds.has(r.sourceRefId)) return s;
        return s + toMonthly({ amount: r.amount, period: r.frequency });
      }, 0);
      return (household.expenses.avgMonthly + recurringMonthly) * 12;
    })();

    // Single source of truth for deductions — audit-grounded deriveDeductions()
    // over the SCOPED subset so the recommendation + fyTax match /tax-planning.
    const scopeDeductions = deriveDeductions({
      ...household,
      // members MUST be scoped too: section80CCD2 sums members' employerNpsAnnual, and
      // grossIncome below is built from scopeEarners only. Passing full household.members
      // here would deduct the whole household's employer NPS from a single lensed earner's
      // income (understating tax / overstating FIRE). Scope it to the scope's earners.
      members: scopeEarners,
      investments: scopeInvestments,
      liabilities: scopeLiabilities,
      insurance: scopeInsurance,
    });
    const estimatedDeductionsForOld = scopeDeductions.totalDeductions;
    // 80CCD(2) employer NPS — applies in both regimes, passed separately (gh-issue #2);
    // employerNpsByMember lets computeTax cap each member at their own basic's ceiling
    // (gh-issue #4), more correct than the aggregate scalars for a multi-earner household.
    const employerNpsByMember = scopeDeductions.employerNpsByMember;

    // taxpayerAge drives the OLD-regime senior (60+/80+) basic-exemption variant (gh-issue #6).
    // anchorAge is the lensed member's age, else the primary earner's — the same anchor the
    // rest of the projection uses, consistent with this engine's single-aggregate-earner model.
    const householdTaxRecommendation = recommendRegime({
      grossIncome:
        annualIncome.salaryIncome +
        annualIncome.businessShare +
        annualIncome.otherTaxable -
        rentalTaxDeduction, // §24a/§24b/municipal-tax/§71 collapse rent to taxable HP — cash stays full (#29/#32)
      fy: lens.currentFY,
      deductions: estimatedDeductionsForOld,
      employerNpsByMember,
      taxpayerAge: anchorAge,
    });

    const fyTax = computeTax({
      grossIncome:
        annualIncome.salaryIncome +
        annualIncome.businessShare +
        annualIncome.otherTaxable -
        rentalTaxDeduction, // §24a/§24b/municipal-tax/§71 collapse rent to taxable HP — cash stays full (#29/#32)
      regime: householdTaxRecommendation.recommended,
      fy: lens.currentFY,
      deductions: estimatedDeductionsForOld,
      employerNpsByMember,
      taxpayerAge: anchorAge,
    });
    const annualTax = fyTax.totalTax;

    // Marginal slab rate — computed here so BOTH the NPS-annuity post-tax offset (A2, #7)
    // and the EPF after-tax yield drag (A15.3) use the SAME scope's rate.
    const slabs =
      householdTaxRecommendation.recommended === "NEW" ? cfg.newRegime.slabs : cfg.oldRegime.slabs;
    const marginalRate = marginalSlabRate(fyTax.taxableIncome, slabs);

    const annualSavings = Math.max(0, annualIncome.total - annualTax - annualExpensesToday);
    // gh-issue #11: the monthly amount flowing to the corpus is the savings residual ALONE. The
    // expense input EXCLUDES SIPs (UI contract: /expenses "Exclude rent, EMIs, insurance, and SIPs"),
    // so investments[].monthlyContribution is ALREADY inside annualSavings — adding it again
    // double-counted every SIP (≈10× over-statement for the Sharmas) and pulled the FIRE date years
    // early. SIPs are a subset of the surplus, never additive to it.
    // T-377: the solver replaces ONLY the corpus inflow — `annualSavings`/`savingsRate` keep
    // describing the household's real cashflow, so no display figure is silently rewritten.
    const monthlyContribution = contributionOverride ?? Math.round(annualSavings / 12);
    const monthlyTakeHome = Math.round((annualIncome.total - annualTax) / 12);
    const savingsRate = calculateSavingsRate(monthlyTakeHome, Math.round(annualSavings / 12));

    // Primary-residence exclusion (A20.2).
    const fireCorpusInvestments = scopeInvestments.filter(
      (i) => !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence"),
    );
    const totalCorpus = fireCorpusInvestments.reduce((s, i) => s + i.value, 0);
    const totalLiabilitiesValue = scopeLiabilities.reduce((s, l) => s + l.outstandingBalance, 0);

    return {
      scopeOtherIncome,
      scopeEarners,
      anchorAge,
      targetRetirementAge,
      planToAge,
      annualIncome,
      annualExpensesToday,
      estimatedDeductionsForOld,
      householdTaxRecommendation,
      fyTax,
      annualTax,
      marginalRate,
      annualSavings,
      monthlyContribution,
      monthlyTakeHome,
      savingsRate,
      fireCorpusInvestments,
      totalCorpus,
      totalLiabilitiesValue,
    };
  }

  // DISPLAY scope (lensed → the selected member's income/tax) vs ADEQUACY scope (whole household).
  // When no member lens is applied both calls share inputs and the two bundles are identical.
  const lensedScope = computeScope(lensedMemberIds, true);
  const householdScope = applyMemberLens ? computeScope(householdMemberIds, false) : lensedScope;

  // The 4 DISPLAY fields lens to the selected member (gh-issue #23 — display drill-down only).
  const annualIncome = lensedScope.annualIncome;
  const fyTax = lensedScope.fyTax;
  const annualTax = lensedScope.annualTax;
  const estimatedDeductionsForOld = lensedScope.estimatedDeductionsForOld;
  const householdTaxRecommendation = lensedScope.householdTaxRecommendation;

  // Everything else (the ADEQUACY leg) reads the HOUSEHOLD scope — the family's one shared corpus.
  const anchorAge = householdScope.anchorAge;
  const targetRetirementAge = householdScope.targetRetirementAge;
  const planToAge = householdScope.planToAge;
  const annualExpensesToday = householdScope.annualExpensesToday;
  const householdMarginalRate = householdScope.marginalRate;
  const annualSavings = householdScope.annualSavings;
  const monthlyContribution = householdScope.monthlyContribution;
  const monthlyTakeHome = householdScope.monthlyTakeHome;
  const savingsRate = householdScope.savingsRate;
  const fireCorpusInvestments = householdScope.fireCorpusInvestments;
  const totalCorpus = householdScope.totalCorpus;
  const totalLiabilitiesValue = householdScope.totalLiabilitiesValue;
  // The bridge layer reads household-scope earners + other-income (adequacy, not display).
  const householdOtherIncome = householdScope.scopeOtherIncome;
  const householdEarners = householdScope.scopeEarners;

  // Horizon-driven SWR (A1.1).
  const effectiveSWR = resolveEffectiveSWRByHorizon(assumptions, targetRetirementAge, planToAge);

  // A14.2 — NPS annuity in retirement. The mandatory 40% annuitised portion
  // (PFRDA 2025, corpus > ₹5L) becomes a pension that offsets the net expenses
  // the corpus must fund, AND is removed from the withdrawable corpus so it is
  // not double-counted. Modelled on the CURRENT NPS corpus (documented
  // simplification — a precise model would project the corpus to NPS-exit age;
  // below the ₹5L threshold the annuity is zero, so most MVP households — incl.
  // the Sharmas at ₹4L — see no change).
  const npsCorpus = fireCorpusInvestments
    .filter((i) => i.type === "NPS")
    .reduce((s, i) => s + i.value, 0);
  const npsSplit = calculateNpsWithdrawal({ totalCorpus: npsCorpus });
  // A2 (#7): the NPS annuity is slab-taxable — offset expenses with the POST-TAX
  // pension, never the gross figure. Offsetting by gross over-credits the annuity
  // and under-states the required FIRE corpus (an optimistic error — the worst
  // class for the accumulator). The household's current marginal rate is a
  // conservative proxy for the retiree's slab (documented simplification:
  // retirement income is usually lower, so this errs on the safe side).
  // Note: householdMarginalRate is the bare slab rate (no 4% cess/surcharge) by
  // design — do NOT "fix" it to the effective rate; the slab-proxy above already
  // over-taxes the annuity, and adding cess would double-stack the conservatism.
  //
  // ADR-0006 Phase 1d — STATED SIMPLIFICATION (the frame). The annuity is credited as a LEVEL
  // NOMINAL income: PFRDA annuities are overwhelmingly level-payout, so this is the product, not
  // an approximation. But `netAnnualExpenses` — the difference it is subtracted from — is a
  // TODAY's-rupee figure that the kernel then grows at the household basket. Netting a level
  // nominal stream against a growing one and then growing the REMAINDER at the basket lets the
  // annuity keep its full purchasing power for the whole horizon, when in reality it decays at
  // CPI. The effect is to slightly UNDERSTATE the gap the corpus must fund, i.e. slightly
  // optimistic, bounded by how large the annuity is relative to expenses (zero for any household
  // below the ₹5 L NPS threshold, which is most of them, and a few percent otherwise).
  //
  // The conservative alternative, named so the next reader does not have to re-derive it: credit
  // the annuity as a DECAYING real stream — `npsAnnuityIncome / (1 + CPI)^t` — inside the target
  // schedule rather than as a one-off subtraction from today's expenses. Not done here because it
  // turns `netAnnualExpenses` from a scalar into a schedule, which touches the variants, the
  // family layer and the bridge's "annuity-once" contract; it belongs in its own change with its
  // own per-persona numbers, not as a rider.
  const npsAnnuityIncome = postTaxAnnuityIncome(npsSplit.annuityIncomeAnnual, householdMarginalRate);
  const npsAnnuityCorpus = npsSplit.annuityCorpus;
  const netAnnualExpenses = Math.max(0, annualExpensesToday - npsAnnuityIncome);
  // Corpus available for withdrawal excludes the locked annuitised portion.
  const fireWithdrawableCorpus = Math.max(0, totalCorpus - npsAnnuityCorpus);

  const baseFireNumber = calculateFIRENumber(netAnnualExpenses, effectiveSWR, anchorAge);

  // Family-layer additive corpus (A6.10). T-376/gh-#165: EVERY plannedFuture line
  // (general/education/marriage/medical/undefined kind) enters the lump — not just
  // education+marriage. A general goal (e.g. a house upgrade) that doesn't move the
  // FIRE number is an optimistic honesty error for the accumulator persona.
  const familyLayer = derivedFamilyLayer(household);
  const plannedGoalsLumpToday = familyLayer.allPlannedGoals.reduce(
    (s, g) => s + (g.todayAmount ?? 0),
    0,
  );
  const extendedContingencyAnnual = familyLayer.extendedContingency
    ? familyLayer.extendedContingency.amount * 12
    : 0;
  const familyLayerCorpus = calculateFamilyLayerCorpus({
    plannedGoalsLumpToday,
    extendedContingencyAnnual,
    swr: effectiveSWR,
  });
  // ADR-0006 Phase 1c — the two HALVES of the family layer drift differently, so they are kept
  // apart here (their sum is `familyLayerCorpus` by construction — same clamps, same order as
  // `calculateFamilyLayerCorpus`). The extended-family contingency is a PERPETUAL expense
  // capitalised at SWR, so it rises with the household basket like the base. The planned goals are
  // DATED lumps, so each one rises at its OWN bucket rate and stops on its due year (below).
  const extendedContingencyCorpusToday = Math.max(
    0,
    effectiveSWR > 0 ? extendedContingencyAnnual / effectiveSWR : 0,
  );

  // Healthcare corpus reservation (A10.5).
  const healthcareReservationPercent = household.healthcareCorpusReservationPercent ?? 0.2;
  // ADR-0006 Phase 1c (FinTech Phase-1b fork 1, DECIDED): the reservation is SIZED off the base
  // today, but it DRIFTS at `healthcareInflation` (9%), not at the household basket.
  //
  // It buffers MEDICAL SHOCKS — a hospitalisation, a surgery, a long-term-care episode — whose
  // price rises at medical inflation, not at the household's all-items basket. The basket's own
  // 8%-weighted healthcare bucket covers RECURRING healthcare SPEND (premiums, consultations,
  // medicines) inside the ongoing-expenses corpus. Different rupees, so no double count.
  //
  // The consequence is the mechanism, not a bug: a buffer that is 20% of the base today grows
  // toward ~44% of it by year 30. That IS "the healthcare weight of a household rises with age"
  // (FinTech ADR review), and it is bounded — the weight can never exceed the buffer's own price
  // path, because both legs are explicit schedules rather than one blended rate.
  const healthcareReservation = baseFireNumber * healthcareReservationPercent;

  // Headline FIRE target = base + family layer + healthcare reservation.
  const fireNumber = calculateFireTarget({
    baseFireNumber,
    familyLayerCorpus,
    healthcareReservationPercent,
  });

  const variants = calculateFIREVariants(annualExpensesToday, effectiveSWR, {
    lean: assumptions.leanMultiplier,
    fat: assumptions.fatMultiplier,
  });

  // EPF/VPF after-tax yield drag (A15.3).
  const annualEpfVpfContribution = fireCorpusInvestments
    .filter((i) => i.type === "EPF_VPF")
    .reduce((s, i) => s + (i.monthlyContribution ?? 0) * 12, 0);
  // cfg / householdMarginalRate are computed earlier (NPS A2 offset); slabs now live in computeScope.
  const epfAfterTaxReturn = epfBucketAfterTaxReturn({
    annualContribution: annualEpfVpfContribution,
    marginalSlabRate: householdMarginalRate,
    epfRate: assumptions.epfReturn,
  });

  const returnWeights = {
    equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
    international: 0, reit: 0, crypto: 0, other: 0,
  };
  for (const inv of fireCorpusInvestments) {
    returnWeights[returnBucketKey(inv)] += inv.value;
  }
  const blendedReturn = blendPortfolioReturn(assumptions, returnWeights, epfAfterTaxReturn);

  // M1 (#9): when the glide path is enabled, the corpus must compound each year
  // at a DE-RISKED return reflecting that year's equity allocation, not one static
  // blended return — else the projection AND the headline "years to FIRE" over-state
  // growth and report an optimistically EARLY FIRE date (Tier-0 for the salaried
  // accumulator).
  //
  // The schedule is ANCHORED to the household's actual `blendedReturn`: as the
  // glide sheds equity (startEquityPercent → endEquityPercent over the taper),
  // the return drops by the shed-equity fraction × the equity risk premium
  // (equityReturn − debtReturn). It is therefore ALWAYS ≤ blendedReturn and equals
  // blendedReturn before the taper begins — so enabling the glide can only push the
  // FIRE date LATER or leave it unchanged, never earlier. (An earlier naive model
  // rebased the whole portfolio to a 75%-equity 2-asset blend, which RAISED the
  // return — and pulled FIRE optimistically earlier — for any household whose real
  // equity weight was below 75%; rules 24/25 caught that on the Sharmas seed.)
  // Non-glide households keep the flat blended return → byte-identical to before.
  const glide = household.glidePath;
  const glideYearsToRetirement = Math.max(0, targetRetirementAge - anchorAge);
  const equityRiskPremium = Math.max(0, assumptions.equityReturn - assumptions.debtReturn);
  const expectedReturnSchedule: ReturnSchedule = glide?.enabled
    ? (yearIndex: number) => {
        const startEquity = glide.startEquityPercent / 100;
        const equityNow = equityPercentAtYear(glide, glideYearsToRetirement, yearIndex) / 100;
        const equityShed = Math.max(0, startEquity - equityNow);
        return blendedReturn - equityShed * equityRiskPremium;
      }
    : blendedReturn;

  // ===== ADR-0006 — ONE FRAME (supersedes the #20 "collapse both sides to CPI" decision) =====
  //
  // The projection runs in NOMINAL rupees end-to-end and is deflated at GENERAL CPI only for
  // DISPLAY (`useFireDerive.deflateProjectionPoints`) and for the today's-₹ figures the hero
  // quotes (`required-contribution.ts`). Concretely, every year:
  //   expenses / target  grow at the household EXPENSE BASKET `householdInflation` (b ≈ 6.24%)
  //   corpus             grows at the NOMINAL `expectedReturnSchedule` (glide-tapered)
  //   contributions      grow at general CPI × the REAL step-up (ADR-0004 semantics preserved)
  //
  // WHY THIS REPLACES #20. #20 fixed a real bug (a NOMINAL return against a FIXED target reaches
  // optimistically early) by collapsing BOTH sides to general CPI. That left the same run asserting
  // two contradictory things about one household: the retiree's spending grows at the 4-bucket
  // basket (the Floor/Ceiling overlay below) while the saver's target grows at CPI. Since the
  // target is expenses ÷ SWR, the REAL target actually drifts up at
  //   g = (1+b)/(1+CPI) − 1
  // and every prescriptive figure — needReal, needNominal, requiredMonthlyReal, householdFireAge —
  // was short by (1+g)^T. That error is OPTIMISTIC, so it makes the salaried accumulator
  // UNDER-SAVE: Tier-0 (gh #167, `goal-anchored-decisions.md`).
  //
  // WHY IT IS SAFE NOW. #20's counter-example (real return crushed to ~0.9%, FIRE at ~115) came
  // from a 7.90% basket built on NON-DISJOINT weights and a 14% healthcare claims-cost trend
  // mis-used as a price index. ADR-0006 re-grounds both (`types/assumptions.ts`): the basket is
  // ≈ 6.24%, so g ≈ 0.23%/yr — a real drift the corpus comfortably out-earns. The frame is now
  // honest AND reachable, and it is honest for the RIGHT reason (the inputs), not because the
  // kernel was bent to print a number.
  //
  // `realReturnSchedule` / `realBlendedReturn` REMAIN exported. They are no longer the headline
  // solver's return, but they are the ONE real return every display surface and the Monte Carlo
  // band must read (ADR-0006 item 5 / gh #180) — deflated at GENERAL CPI, never at the basket.
  const householdInflation = resolveHouseholdInflation(assumptions);
  const generalInflation = assumptions.inflation;
  const toRealReturn = (nominal: number) => (1 + nominal) / (1 + generalInflation) - 1;
  const realReturnSchedule: ReturnSchedule =
    typeof expectedReturnSchedule === "function"
      ? (yearIndex: number) => toRealReturn(expectedReturnSchedule(yearIndex))
      : toRealReturn(expectedReturnSchedule);
  // The REAL drift of the FIRE target: how fast the target rises in TODAY's rupees. 0 exactly
  // when all four buckets equal general CPI (the positive control in
  // `inflation-frame-invariant.spec.ts`), in which case every headline field collapses to the
  // single-rate model. Exported so the Monte Carlo band and the solver share one drift.
  const realTargetDriftRate = (1 + householdInflation) / (1 + generalInflation) - 1;
  /** Nominal-frame growth factor applied to the target/expense line at `yearIndex`. */
  const basketFactor = (yearIndex: number) => Math.pow(1 + householdInflation, yearIndex);
  /** Nominal-frame growth factor applied to a REAL contribution at `yearIndex`. */
  const cpiFactor = (yearIndex: number) => Math.pow(1 + generalInflation, yearIndex);

  // #18 Monte Carlo inputs — the confidence band runs lazily in useFireDerive on
  // the SAME real frame as the corrected headline: a scalar real blended return
  // (the pre-glide anchor; glide-taper inside the band is a tracked v2 limitation)
  // + a value-weighted portfolio volatility. Deterministic + cheap to expose here;
  // the heavy simulation stays out of the kernel (the server nudge loop never pays).
  const realBlendedReturn = toRealReturn(blendedReturn);
  const portfolioVolatility = blendPortfolioVolatility(returnWeights);

  // ----- #46 the SINGLE corpus inflow: the household savings residual, now time-varying -----
  // gh-issue #11 LOCK (non-negotiable): corpus inflow is the household savings RESIDUAL alone
  // (monthlyContribution = annualSavings/12). It becomes time-varying ONLY via a REAL
  // household-level step-up (assumptions.householdSavingsStepUpPercent, default 0 ⇒ scalar ⇒
  // byte-identical headline). Per-investment `investments[].contributionSchedule` is DISPLAY/PLAN
  // metadata ONLY and is DELIBERATELY NOT read here — summing per-investment SIPs into corpus is
  // exactly the ~10× double-count gh #11 fixed (SIPs are already a subset of the surplus residual).
  // The step-up is REAL (no inflation added — derive.ts grows the corpus in the real frame, so a
  // real step-up is net-of-inflation growth on top of the constant-real baseline). The flattening
  // lives in lib/contribution-schedule.ts (single-kernel rule), not inline here.
  const householdSavingsStepUpPct = assumptions.householdSavingsStepUpPercent ?? 0;
  // ADR-0006: the step-up TAPERS TO ZERO at 50. A real step-up is a wage-growth proxy, and
  // Indian salaried real wage growth flattens well before retirement; compounding 2%/yr real
  // from 30 to 65 would inflate the inflow ~2x and pull the FIRE date in optimistically. Two
  // segments do it without ever DROPPING the contribution: the first steps up to age 50, the
  // second starts at 50 from the level the first REACHED and holds it flat (real) thereafter.
  const stepUpApplies = householdSavingsStepUpPct > 0 && monthlyContribution > 0;
  const taperYears = Math.max(0, STEP_UP_TAPER_AGE - anchorAge);
  const baseContributionSchedule: ContributionSchedule = !stepUpApplies
    ? monthlyContribution // scalar ⇒ preserves the `monthlyContribution <= 0 → Infinity`
    : // empty-state guard in calculateYearsToTarget.
      buildContributionResolver(
        taperYears <= 0
          ? // Already at/over the taper age — no step-up left to apply.
            [{ amount: monthlyContribution, startAtAge: anchorAge }]
          : [
              {
                amount: monthlyContribution,
                startAtAge: anchorAge,
                endAtAge: STEP_UP_TAPER_AGE,
                stepUpPercentPerYear: householdSavingsStepUpPct,
              },
              {
                amount:
                  monthlyContribution * Math.pow(1 + householdSavingsStepUpPct / 100, taperYears),
                startAtAge: STEP_UP_TAPER_AGE,
              },
            ],
        anchorAge,
      );
  // QN-5 (T-379): optional EXTRA segments from the override seam (the "roll the EMI into
  // investing when the loan ends" lever) are SUMMED onto the base inflow — each segment gets
  // its own resolver because `buildContributionResolver` picks the latest-starting segment on
  // overlap (replace semantics), and a lever must add to the residual, never replace it. With no
  // segments the base schedule passes through untouched (scalar stays scalar).
  const extraSegments = (overrides?.extraContributionSegments ?? []).filter(
    (s) => Number.isFinite(s.amount) && s.amount > 0 && Number.isFinite(s.startAtAge),
  );
  const householdContributionSchedule: ContributionSchedule =
    extraSegments.length === 0
      ? baseContributionSchedule
      : (() => {
          const extras = extraSegments.map((s) => buildContributionResolver([s], anchorAge));
          return (yearIndex: number) => {
            const base =
              typeof baseContributionSchedule === "function"
                ? baseContributionSchedule(yearIndex)
                : baseContributionSchedule;
            return extras.reduce((sum, r) => sum + r(yearIndex), base);
          };
        })();

  // Headline FIRE dates (FireHero) — the ADEQUACY leg (corpus grows to the FIRE
  // number) in the REAL frame. The bridge layer below can push the HEADLINE later
  // when the adequate corpus is not yet liquid (#15). Lean/Fat stay corpus-only.
  // gh #39: a household with no expenses has fireNumber 0 → calculateYearsToTarget
  // returns 0 (corpus 0 ≥ target 0) → the dashboard falsely claims "already at FIRE"
  // for a brand-new zero-data user. There is no real FIRE target to reach, so the
  // honest value is UNREACHABLE (Infinity) — FireHero then shows "increase income or
  // savings" and the crossovers show "not within horizon". A genuine achiever has
  // fireNumber > 0 (real expenses) and is unaffected.
  const hasFireTarget = fireNumber > 0;

  // ADR-0006 nominal frame. `householdContributionSchedule` is REAL (today's ₹/month, ADR-0004);
  // the nominal inflow is that amount grown at general CPI. A NON-POSITIVE SCALAR is passed
  // through UNCHANGED so `calculateYearsToTarget`'s `monthlySavings <= 0 → Infinity` empty-state
  // sentinel still fires (a function schedule is never eagerly rejected — it may ramp up).
  const toNominalContribution = (real: ContributionSchedule): ContributionSchedule => {
    if (typeof real === "number" && real <= 0) return real;
    return (yearIndex: number) =>
      (typeof real === "function" ? real(yearIndex) : real) * cpiFactor(yearIndex);
  };
  const nominalContributionSchedule = toNominalContribution(householdContributionSchedule);

  // ADR-0006 Phase 1b (MEDIUM-4) — the CPI-RE-INDEXED real inflow, for engines that work in the
  // CPI-real frame (the Monte Carlo band, `lever-bands`) rather than the nominal one the headline
  // solves in. Deflating the nominal path reproduces the real path exactly for RETURNS but NOT for
  // contributions: the nominal inflow steps once a year, so the amount paid in month `j` of year
  // `y` is worth `C_real(y)·(1+CPI)^−(j+1)/12` in today's rupees — strictly less than `C_real(y)`
  // in every month. Handing a real-frame engine the un-discounted `C_real(y)` credits the
  // household with purchasing power the nominal kernel never gives them, which put the band's p50
  // ~0.4 years AHEAD of the headline it exists to bracket. The factor is the mean of those twelve
  // monthly discounts — exact for the year's contribution TOTAL, and independent of `y`, so it is
  // one scalar.
  // ADR-0006 Phase 1d: hoisted to an exported function so a spec fixture can COMPUTE it instead
  // of hard-coding a rounded copy — the first hard-coded copy (0.96766) was simply wrong, and a
  // wrong constant in a test is a lock on the wrong behaviour. At 6% CPI it is 0.969067.
  const CPI_WITHIN_YEAR_REINDEX = cpiWithinYearReindexFactor(generalInflation);
  const bandContributionSchedule: ContributionSchedule =
    typeof householdContributionSchedule === "number" && householdContributionSchedule <= 0
      ? householdContributionSchedule
      : (yearIndex: number) =>
          (typeof householdContributionSchedule === "function"
            ? householdContributionSchedule(yearIndex)
            : householdContributionSchedule) * CPI_WITHIN_YEAR_REINDEX;
  /** Today's-₹ target → the nominal target in year `yearIndex`, growing at the basket. */
  const toNominalTarget = (todayTarget: number) => (yearIndex: number) =>
    todayTarget * basketFactor(yearIndex);

  // ---------------- ADR-0006 Phase 1c: the REGULAR target is a SUM OF COMPONENT SCHEDULES -------
  // Phase 1 grew the WHOLE target at one rate (the household basket). That is right for the
  // perpetual legs and wrong for the dated ones: an education goal must rise at education
  // inflation, and it must STOP rising once it has been paid.
  //
  //   target(t) = (base + contingency)·(1+b)^t
  //             + reservation·(1+healthcareInflation)^t
  //             + Σ goal_i.todayAmount·(1+rate_i)^min(t, dueYears_i)
  //
  // At t = 0 this is EXACTLY `fireNumber`, so the headline SIZE does not move — only its
  // TRAJECTORY. Each goal is held FLAT IN NOMINAL RUPEES after its due year: the money was spent
  // then, so growing it for another twenty years is fiction. Holding it flat rather than removing
  // it is still conservative (the corpus must have carried the full amount to the due date and is
  // never credited back), and it never grows past the due year.
  /**
   * ADR-0006 Phase 1d — the price index for one dated goal.
   *
   * `inflationBucket` is OPTIONAL on a planned line and most real entries never carry one: the
   * goal forms and `derived-records.ts` classify by `kind` ("education", "marriage", "medical",
   * "general"), which is the field the user actually chooses. Routing on the bucket alone and
   * falling straight through to general CPI therefore inflated a ₹50 L college fund at 6% instead
   * of 9% for anyone who had not hand-set a bucket — the target came out too small, which is the
   * optimistic direction and the one this ADR exists to remove.
   *
   * So the bucket wins when it is set (an explicit override stays an override), and otherwise the
   * `kind` decides — via `plannedGoalInflationBucket`, the one shared map, so the kernel, the
   * store's legacy backfill and the goal form cannot answer this differently.
   */
  const goalInflationRate = (goal: PlannedFutureLine): number => {
    const bucket = goal.inflationBucket ?? plannedGoalInflationBucket(goal.kind);
    switch (bucket) {
      case "healthcare":
        return assumptions.healthcareInflation;
      case "education":
        return assumptions.educationInflation;
      case "housing":
        return assumptions.housingInflation;
      // `general`, and a line with neither a bucket nor a price-distinct kind, mean all-items CPI.
      default:
        return generalInflation;
    }
  };
  // ADR-0006 Phase 1d: injected, never read from the wall clock here — `derive()` is a pure
  // kernel and a golden master that shifts on 1 January (goals one year nearer ⇒ one year less
  // inflation ⇒ FIRE optimistically earlier) is not a golden master. See `DeriveOverrides.currentYear`.
  const currentCalendarYear =
    // Last resort (an unparseable FY): year 0, which puts every dated goal beyond the horizon so
    // it inflates throughout — the conservative reading, never a goal treated as already paid.
    usableOverride(overrides?.currentYear, 1900) ?? financialYearStartYear(lens.currentFY) ?? 0;
  /** One dated lump: its today's-₹ size, its own price index, and when it stops rising. */
  const plannedGoalComponents = familyLayer.allPlannedGoals.map((g) => ({
    todayAmount: Math.max(0, g.todayAmount ?? 0),
    rate: goalInflationRate(g),
    // Same origin as `derived-records.ts` / `adequacy.ts` — a calendar targetYear, floored at now.
    dueYears: Math.max(0, g.targetYear - currentCalendarYear),
  }));
  /** The perpetual ONGOING-SPEND legs, which ride the household basket. */
  const perpetualTargetToday = baseFireNumber + extendedContingencyCorpusToday;
  /** Nominal ₹ in the healthcare-shock reservation at `t` — its own medical price path. */
  const healthcareReservationNominalAt = (t: number): number =>
    healthcareReservation * Math.pow(1 + assumptions.healthcareInflation, Math.max(0, t));
  /** Nominal ₹ in the planned-goal leg at fractional year `t`. */
  const plannedGoalsNominalAt = (t: number): number =>
    plannedGoalComponents.reduce(
      (sum, g) => sum + g.todayAmount * Math.pow(1 + g.rate, Math.min(Math.max(0, t), g.dueYears)),
      0,
    );
  /**
   * The headline REGULAR target in NOMINAL rupees at fractional year `t`. This is the schedule the
   * solver, the bridge, the projection and the Monte Carlo band all read — one target, one place.
   */
  const regularTargetSchedule: TargetSchedule = (t: number) =>
    perpetualTargetToday * basketFactor(t) +
    healthcareReservationNominalAt(t) +
    plannedGoalsNominalAt(t);
  /**
   * The same target split into the three components the QN-4 explainer narrates, in TODAY's rupees
   * at year `t` (nominal ÷ CPI^t). They sum to `total` exactly — "the steps add up" is an e2e
   * contract, so the split must never be re-derived from a single scalar drift.
   */
  const regularTargetComponentsRealAt = (t: number) => {
    const deflator = Math.pow(1 + generalInflation, Math.max(0, t));
    const basket = basketFactor(Math.max(0, t)) / deflator;
    const base = baseFireNumber * basket;
    const healthcareReservationReal = healthcareReservationNominalAt(Math.max(0, t)) / deflator;
    const plannedGoals = extendedContingencyCorpusToday * basket + plannedGoalsNominalAt(t) / deflator;
    return {
      base,
      plannedGoals,
      healthcareReservation: healthcareReservationReal,
      total: base + plannedGoals + healthcareReservationReal,
    };
  };

  const corpusOnlyYearsToRegular = hasFireTarget
    ? calculateYearsToTarget(
        fireWithdrawableCorpus,
        regularTargetSchedule,
        nominalContributionSchedule,
        expectedReturnSchedule,
      )
    : Number.POSITIVE_INFINITY;
  const yearsToLean = hasFireTarget
    ? calculateYearsToTarget(
        fireWithdrawableCorpus,
        toNominalTarget(variants.leanFIRE),
        nominalContributionSchedule,
        expectedReturnSchedule,
      )
    : Number.POSITIVE_INFINITY;
  const yearsToFat = hasFireTarget
    ? calculateYearsToTarget(
        fireWithdrawableCorpus,
        toNominalTarget(variants.fatFIRE),
        nominalContributionSchedule,
        expectedReturnSchedule,
      )
    : Number.POSITIVE_INFINITY;

  // ----- #15 accumulation bridge: corpus-adequate ≠ FIRE-ready -----
  // At the age the corpus first meets the FIRE number, check that the LIQUID
  // runway covers every retirement year until locked money (PPF / NPS annuity)
  // unlocks. A short bridge moves the headline FIRE age LATER. A fully-liquid
  // household has no locked window → covered → headline unchanged (byte-identical).
  const bridge = computeBridge();
  // Only a genuine liquidity SHORTFALL moves the headline later — when the bridge
  // is covered (or not evaluated), the headline stays exactly on the adequacy leg
  // (byte-identical; no rounding artifact from the bridge's integer age math).
  const yearsToRegular =
    bridge && !bridge.covered
      ? Math.max(corpusOnlyYearsToRegular, bridge.effectiveFireAge - anchorAge)
      : corpusOnlyYearsToRegular;

  function computeBridge() {
    // Only meaningful when the corpus actually reaches the FIRE number at a
    // plannable age. An unreachable target (Infinity) or one past the plan
    // horizon leaves the headline on the adequacy leg.
    if (!Number.isFinite(corpusOnlyYearsToRegular)) return null;
    const adequacyAge = Math.round(anchorAge + corpusOnlyYearsToRegular);
    if (adequacyAge > planToAge) return null;

    const dobForOwner = (ownerId: string): string | null => {
      const direct = members.find((m) => m.id === ownerId);
      if (direct) return direct.dateOfBirth;
      // "Joint" (or an unmatched owner) anchors to the primary earner — the bridge is the
      // ADEQUACY leg, so it stays household-scoped even under an explicit member lens (#23).
      const anchorMember = earners[0] ?? members[0];
      return anchorMember?.dateOfBirth ?? null;
    };

    const holdings: BridgeHolding[] = fireCorpusInvestments.map((asset) => ({
      asset,
      ownerDob: dobForOwner(asset.ownerId),
    }));

    // Bridge rental cash, post-tax & per-line (Sec 24a let-out → gross·(1−mr·0.7); exempt → full).
    // Extracted to bridgeRentalPostTaxAnnual() so the #29 formula is unit-tested directly. #29
    // Uses HOUSEHOLD-scope other-income (adequacy, not the lensed display) — #23.
    const rentalAnnualPostTax = bridgeRentalPostTaxAnnual(householdOtherIncome, householdMarginalRate);
    const postTax = (gross: number) => gross * (1 - householdMarginalRate);

    // EPS pension + gratuity aggregated over the HOUSEHOLD earners (Phases D, E) — adequacy stays
    // whole-household even under a member lens (#23).
    let epsAnnualGross = 0;
    let gratuityNet = 0;
    for (const m of householdEarners) {
      const eps = deriveEpsPensionForMember(m);
      if (eps) epsAnnualGross += eps.annualPension;
      const grat = deriveGratuityForMember(m, householdMarginalRate);
      if (grat) gratuityNet += grat.net;
    }

    // Map today's holding values to the corpus at the retirement age: it grows
    // toward the FIRE number via contributions + returns. The base MUST match
    // the holdings being scaled — `holdings` is the FULL corpus, so scale on
    // totalCorpus, not the annuity-excluded withdrawable corpus (using the
    // smaller denominator would over-scale NPS and over-credit its annuity income
    // — an optimistic error).
    // ADR-0006: the corpus at the adequacy age equals the NOMINAL target there; the bridge runs
    // in TODAY's rupees, so the scale is that target deflated at general CPI — i.e. the REAL
    // target DRIFTED at g. Using the un-drifted `fireNumber` would under-scale every holding and
    // understate the liquid runway (which happens to be conservative, but it is the wrong frame
    // and it silently disagrees with the adequacy leg the bridge is layered on).
    // ADR-0006 Phase 1c: read the COMPONENT schedule, not a single-rate drift — the goal legs stop
    // rising on their due years, so a scalar (1+g)^t over-scales every holding for a goal-heavy
    // household and over-states the liquid runway (the optimistic direction).
    const driftedTargetReal = regularTargetComponentsRealAt(adequacyAge - anchorAge).total;
    const corpusScale = totalCorpus > 0 ? driftedTargetReal / totalCorpus : 1;

    return computeBridgeCoverage({
      holdings,
      retirementAge: adequacyAge,
      anchorAge,
      planToAge,
      // #17 cross-leg "annuity-once" CONTRACT: this MUST be GROSS annualExpensesToday,
      // NOT netAnnualExpenses. The NPS annuity is credited to the bridge exactly once —
      // via the NPS holding's own income stream inside computeBridgeCoverage. Feeding net
      // (gross − annuity) here would subtract the annuity a SECOND time → optimistic
      // over-coverage (the bridge looks more covered than it is → retire-too-early, a
      // Tier-0 honesty error). The adequacy leg separately uses netAnnualExpenses for the
      // FIRE number — locked by derive.spec's "annuity-once" magnitude test.
      annualExpenses: annualExpensesToday,
      // ADR-0006 Phase 1d: …and the SAME expenses re-priced year by year, so the bridge stops
      // being a mixed frame. `corpusScale` above already scales the holdings by the DRIFTED
      // target; leaving the bill flat meant a rising target made the bridge look BETTER covered,
      // which is optimistic in the one layer whose whole job is to be pessimistic.
      //
      // The drift is the BASE leg's alone — `regularTargetComponentsRealAt(t).base / baseFireNumber`
      // — because the base leg IS the perpetual ongoing-spend the retiree lives on. Dated goals
      // are lumps paid on their own dates and the medical reservation is a shock buffer; neither
      // is bridge spending, and folding either in would inflate the retiree's grocery bill at
      // education or medical inflation.
      annualExpensesAt: (t: number) =>
        annualExpensesToday *
        (baseFireNumber > 0 ? regularTargetComponentsRealAt(t).base / baseFireNumber : 1),
      income: {
        rentalAnnualPostTax: Math.round(rentalAnnualPostTax),
        // EPS pension is fully taxable (no Sec 24a) — postTax() taxes the full gross, correct here.
        epsAnnualPostTax: Math.round(postTax(epsAnnualGross)),
        epsStartAge: EPS_NORMAL_START_AGE,
      },
      exitLumpNet: Math.round(gratuityNet),
      marginalRate: householdMarginalRate,
      corpusScale,
    });
  }

  // ADR-0006 Phase 1c — the component target's EFFECTIVE scalar drift, for the few consumers that
  // genuinely need one number rather than a curve (`lever-impact`'s perturbable baseline, any
  // display of "how fast is my target rising"). It is the constant real rate that reproduces the
  // component schedule at the horizon the headline was actually SOLVED at:
  //     (targetReal(T) / targetReal(0))^(1/T) − 1
  // Anchoring it on the STORED target age instead of the solved horizon put the Monte Carlo p50
  // ~5 years behind the headline (measured, Phase 1b) — the horizon must be the one the number
  // being reproduced was computed over. Falls back to the pure basket drift when no horizon is
  // solvable, where the two coincide anyway.
  const effectiveDriftHorizon = Number.isFinite(yearsToRegular)
    ? yearsToRegular
    : Math.max(0, targetRetirementAge - anchorAge);
  const effectiveTargetDriftRate =
    effectiveDriftHorizon > 0 && fireNumber > 0
      ? Math.pow(
          regularTargetComponentsRealAt(effectiveDriftHorizon).total / fireNumber,
          1 / effectiveDriftHorizon,
        ) - 1
      : realTargetDriftRate;
  /** The same effective drift quoted in the NOMINAL frame, for nominal-triple callers. */
  const effectiveTargetGrowthNominal = (1 + effectiveTargetDriftRate) * (1 + generalInflation) - 1;

  const yfat = Number.isFinite(yearsToFat) ? yearsToFat : 30;
  const projectionHorizonYears = Math.min(60, Math.max(20, Math.ceil(yfat) + 5));

  // A9.1 — Floor/Ceiling decumulation overlay (Constant → undefined → unchanged).
  const decumulation =
    assumptions.withdrawalRule === "FloorCeiling"
      ? {
          retirementAge: targetRetirementAge,
          config: { ...DEFAULT_FLOOR_CEILING, swr: effectiveSWR, inflation: householdInflation },
          retirementIncomeAnnual: npsAnnuityIncome,
        }
      : undefined;

  const projection = projectCorpus({
    currentCorpus: fireWithdrawableCorpus,
    // ADR-0006: the chart runs the SAME nominal frame as the headline — nominal inflow (real ×
    // CPI), nominal returns, and the expense/target line grown at the household BASKET. Before
    // ADR-0006 this line grew at general CPI to make the two frames agree by collapsing both;
    // now they agree because they are the same frame.
    monthlyContribution: nominalContributionSchedule,
    expectedReturns: expectedReturnSchedule,
    inflation: householdInflation,
    // The chart's REGULAR target must be the headline FIRE number (base + family layer +
    // healthcare reservation), not expenses ÷ SWR — otherwise the crossover sits 4–8 years
    // earlier than the headline (measured on all four seeds before ADR-0006).
    regularTargetToday: fireNumber,
    // ADR-0006 Phase 1c: and its per-year COMPONENT curve, so the chart's target line kinks
    // where the goal legs stop rising instead of riding one basket rate forever.
    regularTargetSchedule,
    annualExpensesToday,
    startAge: anchorAge,
    swr: effectiveSWR,
    horizonYears: projectionHorizonYears,
    decumulation,
  });

  // gh #39: with no FIRE target (zero expenses) the projection corpus 0 "crosses"
  // target 0 at year 0, so the Lean/Fat labels falsely show "achieved now". No target
  // → no crossovers (findCrossovers([]) yields all-null years → "not within horizon").
  const crossovers = hasFireTarget ? findCrossovers(projection) : findCrossovers([]);

  const progressPercent =
    fireNumber <= 0 ? 0 : Math.min(100, Math.round((fireWithdrawableCorpus / fireNumber) * 100));

  // #81 Phase 2: the canonical HOUSEHOLD FIRE age (anchor + ceil(years-to-FIRE)) — the SINGLE
  // source every surface displays, so FireHero, the individual-FIRE card, and any future consumer
  // never disagree (the round-vs-ceil 56/57 drift the rule-33 verifier caught). null when FIRE is
  // unreachable within the horizon.
  const householdFireAge = Number.isFinite(yearsToRegular)
    ? anchorAge + Math.ceil(yearsToRegular)
    : null;

  // #81 Phase 2: standalone individual FIRE per ADULT — a clearly-caveated SECONDARY view. The
  // household fireNumber/yearsToRegular above stay the PRIMARY, decision-driving figures and are
  // INVARIANT to member selection (this block only ADDS; it never feeds the household path). The
  // gap = household annual expenses − Σ(adults' attributable expenses) = the dependents' costs
  // (ring 3) + any unsplit remainder — surfaced so the individual numbers are never misread as
  // "the family can stop". computeIndividualFire owns the attribution (single canonical helper).
  const individualFireByMember = members
    .filter((m) => isAdultRole(m.role))
    .map((m) => computeIndividualFire(household, assumptions, m.id, lens.currentFY, overrides))
    .filter((r): r is NonNullable<ReturnType<typeof computeIndividualFire>> => r != null);
  const sumAdultAttributableExpenses = individualFireByMember.reduce(
    (s, r) => s + r.attributableAnnualExpenses,
    0,
  );
  const individualFireExpenseGapAnnual = Math.max(
    0,
    Math.round(householdScope.annualExpensesToday - sumAdultAttributableExpenses),
  );

  return {
    applyMemberLens,
    lensedMembers,
    lensedEarners,
    lensedInvestments,
    lensedLiabilities,
    lensedInsurance,
    lensedBusinesses,
    lensedOtherIncome,
    // #81 Phase 1 — member-attributable expense DISPLAY (display-only; FIRE total unchanged).
    lensedRecurringExpenses,
    lensedPlannedExpenses,
    lensedMonthlyExpenses,
    anchorAge,
    targetRetirementAge,
    annualExpensesToday,
    annualIncome,
    annualTax,
    annualSavings,
    monthlyContribution,
    monthlyTakeHome,
    savingsRate,
    effectiveSWR,
    planToAge,
    fireNumber,
    baseFireNumber,
    familyLayer,
    familyLayerCorpus,
    healthcareReservation,
    healthcareReservationPercent,
    variants,
    blendedReturn,
    // ADR-0006: the glide-tapered NOMINAL per-year return the headline solver + the projection
    // both compound at. Exposed so the QN-2 solver's "what you'll have by N" grows the corpus on
    // the SAME schedule the FIRE age was solved with, in the same frame.
    expectedReturnSchedule,
    realBlendedReturn,
    // The glide-tapered REAL per-year return the deterministic corpusOnlyYearsToRegular
    // uses — exposed so the #18 Monte Carlo band can taper its per-year MEAN identically
    // and the MC p50 converges to the headline for glide-ON households (#24 Part 1).
    realReturnSchedule,
    // T-377: the ACTUAL corpus-inflow schedule the headline was solved with (scalar by default,
    // step-up-resolved when householdSavingsStepUpPercent > 0). Exposed so the solver projects
    // "what you will have" with the SAME inflow the kernel used, never a parallel schedule.
    householdContributionSchedule,
    // ADR-0006: the REAL drift of the FIRE target, (1+basket)/(1+CPI) − 1. Exposed so the Monte
    // Carlo band (which stays in the CPI-real frame) can drift its target at the same rate the
    // headline does, and so the solver quotes a today's-₹ need for the RIGHT year. 0 exactly when
    // all four inflation buckets equal general CPI.
    realTargetDriftRate,
    // ADR-0006 Phase 1c: the REGULAR target as a per-year NOMINAL schedule (perpetual legs at the
    // basket, each dated goal at its own bucket rate, held flat after its due year), the same
    // curve split into today's-₹ components, and the effective scalar drift that reproduces it
    // over the SOLVED horizon. Every consumer of "the target over time" reads one of these —
    // never a re-derived single rate.
    regularTargetSchedule,
    regularTargetComponentsRealAt,
    effectiveTargetDriftRate,
    effectiveTargetGrowthNominal,
    // ADR-0006: the NOMINAL corpus inflow the headline was actually solved with (the real
    // schedule above grown at general CPI). Exposed so no consumer rebuilds it.
    nominalContributionSchedule,
    // ADR-0006 Phase 1b: the same inflow for CPI-REAL-frame engines (the Monte Carlo band), with
    // the within-year CPI step the nominal frame imposes already applied. Never rebuild it.
    bandContributionSchedule,
    portfolioVolatility,
    // The canonical per-bucket corpus weights (₹, from fireCorpusInvestments — whole-household,
    // primary-residence excluded) that back blendedReturn + portfolioVolatility. Exposed so the
    // obj-2 acceleration composable computes the risk-notch's current-equity headroom + perturbed
    // volatility off the SAME basis as the headline (gh-48 coherence; do not re-aggregate from a
    // lensed/residence-inclusive set, which silently diverges).
    returnWeights,
    householdInflation,
    annualEpfVpfContribution,
    householdMarginalRate,
    epfAfterTaxReturn,
    yearsToRegular,
    corpusOnlyYearsToRegular,
    bridgeCoverage: bridge,
    yearsToLean,
    yearsToFat,
    projection,
    crossovers,
    progressPercent,
    fyTax,
    householdTaxRecommendation,
    estimatedDeductionsForOld,
    totalCorpus,
    totalLiabilitiesValue,
    // Member-scoped corpus / liabilities for the DASHBOARD section-card headlines (gh member-lens
    // fix). The household `totalCorpus`/`totalLiabilitiesValue` above stay whole-household for the
    // FIRE-adequacy math (#22/#23 guardrail — the FIRE number must never lens). These lensed twins
    // exist ONLY so the Investments/Liabilities summary cards show a VALUE that matches their
    // already-lensed instrument/loan COUNT (the bug: household value + lensed count = frozen value
    // under "Viewing as <member>"). On the default (no-lens) view lensedScope spans the whole
    // household, so these are byte-identical to the household totals.
    lensedTotalCorpus: lensedScope.totalCorpus,
    lensedTotalLiabilitiesValue: lensedScope.totalLiabilitiesValue,
    npsAnnuityIncome,
    fireWithdrawableCorpus,
    // Whole-household income/tax — the coherent denominator for the cashflow / financial-health
    // charts (#23 HIGH follow-up). The 4 DISPLAY fields (annualIncome/annualTax) lens to the
    // selected member, but cashflow mixes income with HOUSEHOLD expenses/savings/tax — so a lensed
    // income over a household expense base renders a spurious negative surplus ("this member spends
    // more than they earn"). Charts read THESE instead: householdScope.annualIncome.total /
    // .annualTax. On the default lens householdScope === lensedScope, so these EQUAL the lensed
    // annualIncome.total / annualTax and nothing changes.
    householdAnnualIncome: householdScope.annualIncome.total,
    householdAnnualTax: householdScope.annualTax,
    // #81 Phase 2 — standalone individual FIRE per adult + the household−Σ(adults) gap (display-only).
    individualFireByMember,
    individualFireExpenseGapAnnual,
    // Canonical household FIRE age (anchor + ceil(years)); null if unreachable. One source for
    // every surface (FireHero, the individual-FIRE card) so the displayed age never diverges.
    householdFireAge,
  };
}

export type DerivedFinancials = ReturnType<typeof derive>;

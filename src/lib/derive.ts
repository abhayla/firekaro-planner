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
import type { Household, OtherIncomeLine } from "@/types/household";
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
} from "@/lib/fire-math";
import { derivedFamilyLayer } from "@/lib/derived-records";
import { computeTax, recommendRegime, marginalSlabRate, getTaxConfigForFY } from "@/lib/tax";
import { epfBucketAfterTaxReturn } from "@/lib/epf-vpf";
import { ageFromDOB } from "@/lib/age";
import { toMonthly, toAnnual } from "@/lib/cashflow";
import { returnBucketKey } from "@/lib/investment-traits";
import { deriveDeductions } from "@/lib/tax-deductions";
import { DEFAULT_FLOOR_CEILING } from "@/lib/withdrawal-strategy";
import { calculateNpsWithdrawal, postTaxAnnuityIncome } from "@/lib/nps-withdrawal";
import { equityPercentAtYear } from "@/lib/glide-path";
import { computeBridgeCoverage, type BridgeHolding } from "@/lib/bridge";
import { deriveEpsPensionForMember, EPS_NORMAL_START_AGE } from "@/lib/eps-pension";
import { deriveGratuityForMember } from "@/lib/gratuity";
import type { ReturnSchedule } from "@/lib/fire-math";
import {
  resolveHouseholdInflation,
  resolveEffectiveSWRByHorizon,
  blendPortfolioReturn,
  blendPortfolioVolatility,
} from "@/lib/assumption-math";

/** Sec 24(a): flat 30% standard deduction on let-out rental NAV — only 70% of rent is taxable. #29 */
export const SEC_24A_DEDUCTION_RATE = 0.3;

/**
 * §71 cap on setting a house-property LOSS off against other income heads — ₹2,00,000/yr. A let-out
 * property leveraged with a large §24(b) home-loan interest can run a loss; only ₹2L of that loss
 * reduces other taxable income in the year. (The unabsorbed remainder carries forward 8 yrs under
 * §71B — OUT OF SCOPE for this single-year FIRE engine.) gh-issue #32.
 */
export const SEC_71_HP_LOSS_SETOFF_CAP = 200000;

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

export interface DeriveLens {
  isFamilyView: boolean;
  viewingMemberId: string | null;
  currentFY: string;
}

export function derive(household: Household, assumptions: Assumptions, lens: DeriveLens) {
  const members = household.members;
  const earners = members.filter((m) => m.role === "EARNER");
  const isSolo = members.length <= 1;

  // #22 ROOT FIX: the member lens applies ONLY when a member is EXPLICITLY selected
  // (`viewingMemberId` set). With no explicit selection ("All" / the default view),
  // aggregate the WHOLE household. The old `!isFamilyView` default silently scoped a
  // dual-income household to the PRIMARY EARNER (`?? earners[0]`), so the headline
  // divided a household FIRE target (funds both spouses + kids) by ONE earner's
  // savings → an incoherent FIRE age (Sharmas age 81 vs the true household 62). When
  // not lensed, the entire engine — income, tax, AND FIRE adequacy — runs on the
  // household, so every consumer is coherent by construction.
  const applyMemberLens = !isSolo && !lens.isFamilyView && lens.viewingMemberId != null;
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
  const lensedEarners = lensedMembers.filter((m) => m.role === "EARNER");
  const lensedInvestments = household.investments.filter((i) => ownerMatches(i.ownerId));
  const lensedLiabilities = household.liabilities.filter(
    (l) => ownerMatches(l.ownerId) || l.isSharedWithSpouse,
  );
  const lensedInsurance = household.insurance.filter((p) =>
    applyMemberLens ? lensedMemberIds.has(p.insuredPersonId) : true,
  );
  // (businesses + other-income are scoped INSIDE computeScope below, per #23 — no top-level lensed set.)

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
    return earners[0]?.planToAge ?? 90;
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
    const scopeEarners = scopeMembers.filter((m) => m.role === "EARNER");
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
    // House-property tax treatment for let-out rentals (§24a + §24b + municipal taxes, §71 cap).
    // This reduces TAXABLE income ONLY — the landlord still receives full rent as CASH (and the
    // home-loan EMI is already a separate household expense via liabilities→recurring), so it must
    // NOT shrink annualIncome.total / annualSavings. It is subtracted from the tax `grossIncome`
    // below as `rentalTaxDeduction`, never from the cash total. gh-issue #29 / #32.
    //
    // Per let-out (taxable) rental i:
    //   NAV_i              = max(0, grossRent_i − municipalTaxes_i)   (§23/§24: municipal taxes PAID by owner)
    //   houseProperty_i    = NAV_i × (1 − §24a 30%) − homeLoanInterest_i  (§24b interest FULLY deductible —
    //                        the ₹2L cap is SELF-OCCUPIED only; a let-out property has no §24b ceiling)
    // netHP can be NEGATIVE (a leveraged rental running a loss). Aggregate across let-out rentals:
    //   netHP    = Σ houseProperty_i
    //   taxableHP = netHP ≥ 0 ? netHP : −min(|netHP|, 200000)   (§71 caps the house-property LOSS set-off
    //               against other heads at ₹2,00,000/yr; the unabsorbed loss would carry forward 8 yrs —
    //               OUT OF SCOPE for this single-year FIRE engine.)
    // rentalTaxDeduction = (Σ grossRent_i) − taxableHP  ⇒ the amount subtracted from tax grossIncome so the
    //   cash-basis grossIncome (which still includes full rent) collapses to the taxable house-property income.
    const taxableRentals = scopeOtherIncome.filter((o) => o.type === "Rental" && !o.isTaxExempt);
    const grossRentTotal = taxableRentals.reduce(
      (s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }),
      0,
    );
    const netHouseProperty = taxableRentals.reduce((s, o) => {
      const grossRent = toAnnual({ amount: o.amount, period: o.frequency });
      const nav = Math.max(0, grossRent - (o.municipalTaxes ?? 0));
      return s + nav * (1 - SEC_24A_DEDUCTION_RATE) - (o.homeLoanInterest ?? 0);
    }, 0);
    const taxableHouseProperty =
      netHouseProperty >= 0
        ? netHouseProperty
        : -Math.min(Math.abs(netHouseProperty), SEC_71_HP_LOSS_SETOFF_CAP);
    const rentalTaxDeduction = grossRentTotal - taxableHouseProperty;
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
    const monthlyContribution = Math.round(annualSavings / 12);
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
  const npsAnnuityIncome = postTaxAnnuityIncome(npsSplit.annuityIncomeAnnual, householdMarginalRate);
  const npsAnnuityCorpus = npsSplit.annuityCorpus;
  const netAnnualExpenses = Math.max(0, annualExpensesToday - npsAnnuityIncome);
  // Corpus available for withdrawal excludes the locked annuitised portion.
  const fireWithdrawableCorpus = Math.max(0, totalCorpus - npsAnnuityCorpus);

  const baseFireNumber = calculateFIRENumber(netAnnualExpenses, effectiveSWR, anchorAge);

  // Family-layer additive corpus (A6.10).
  const familyLayer = derivedFamilyLayer(household);
  const educationMarriageLumpToday =
    familyLayer.educationGoals.reduce((s, g) => s + (g.todayAmount ?? 0), 0) +
    familyLayer.marriageEvents.reduce((s, g) => s + (g.todayAmount ?? 0), 0);
  const extendedContingencyAnnual = familyLayer.extendedContingency
    ? familyLayer.extendedContingency.amount * 12
    : 0;
  const familyLayerCorpus = calculateFamilyLayerCorpus({
    educationMarriageLumpToday,
    extendedContingencyAnnual,
    swr: effectiveSWR,
  });

  // Healthcare corpus reservation (A10.5).
  const healthcareReservationPercent = household.healthcareCorpusReservationPercent ?? 0.2;
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

  // #20 (Tier-0 honesty): the headline grows TODAY's corpus to a TODAY's-rupee
  // `fireNumber`, so it MUST compound at a REAL return. Growing a NOMINAL return
  // against a non-inflating target reaches optimistically EARLY (#20). The deflator
  // MUST be GENERAL CPI (`assumptions.inflation` ≈6%) — the rate at which a rupee
  // loses economy-wide purchasing power — NOT the 4-bucket household EXPENSE blend
  // (~7.9%, lifted by 14% healthcare). Deflating MARKET RETURNS by the
  // healthcare-weighted expense basket is a modeling error: it crushed the real
  // return to ~0.9% and made FIRE look unreachable (~age 115) for the seed personas
  // (#20, FinTech-validated 2026-06-03). The same general CPI grows the FIRE target
  // in projectCorpus below, so the headline and the chart crossover AGREE. Assumes
  // savings keep pace with general inflation (constant REAL contribution).
  // `householdInflation` (the 4-bucket blend) is retained ONLY for the retiree's
  // decumulation withdrawal-floor growth — an INTENTIONAL asymmetry (a retiree's
  // own spending DOES rise at their personal basket rate; a saver's corpus return
  // deflates at CPI). Do NOT "consistency-fix" these to the same rate.
  const householdInflation = resolveHouseholdInflation(assumptions);
  const generalInflation = assumptions.inflation;
  const toRealReturn = (nominal: number) => (1 + nominal) / (1 + generalInflation) - 1;
  const realReturnSchedule: ReturnSchedule =
    typeof expectedReturnSchedule === "function"
      ? (yearIndex: number) => toRealReturn(expectedReturnSchedule(yearIndex))
      : toRealReturn(expectedReturnSchedule);

  // #18 Monte Carlo inputs — the confidence band runs lazily in useFireDerive on
  // the SAME real frame as the corrected headline: a scalar real blended return
  // (the pre-glide anchor; glide-taper inside the band is a tracked v2 limitation)
  // + a value-weighted portfolio volatility. Deterministic + cheap to expose here;
  // the heavy simulation stays out of the kernel (the server nudge loop never pays).
  const realBlendedReturn = toRealReturn(blendedReturn);
  const portfolioVolatility = blendPortfolioVolatility(returnWeights);

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
  const corpusOnlyYearsToRegular = hasFireTarget
    ? calculateYearsToTarget(fireWithdrawableCorpus, fireNumber, monthlyContribution, realReturnSchedule)
    : Number.POSITIVE_INFINITY;
  const yearsToLean = hasFireTarget
    ? calculateYearsToTarget(fireWithdrawableCorpus, variants.leanFIRE, monthlyContribution, realReturnSchedule)
    : Number.POSITIVE_INFINITY;
  const yearsToFat = hasFireTarget
    ? calculateYearsToTarget(fireWithdrawableCorpus, variants.fatFIRE, monthlyContribution, realReturnSchedule)
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
    const corpusScale = totalCorpus > 0 ? fireNumber / totalCorpus : 1;

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
    monthlyContribution,
    expectedReturns: expectedReturnSchedule,
    // #20: grow the FIRE target at GENERAL CPI (not the healthcare-weighted blend)
    // so the chart crossover and the real-frame headline agree and FIRE is reachable.
    inflation: generalInflation,
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

  return {
    applyMemberLens,
    lensedMembers,
    lensedEarners,
    lensedInvestments,
    lensedLiabilities,
    lensedInsurance,
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
    realBlendedReturn,
    // The glide-tapered REAL per-year return the deterministic corpusOnlyYearsToRegular
    // uses — exposed so the #18 Monte Carlo band can taper its per-year MEAN identically
    // and the MC p50 converges to the headline for glide-ON households (#24 Part 1).
    realReturnSchedule,
    portfolioVolatility,
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
  };
}

export type DerivedFinancials = ReturnType<typeof derive>;

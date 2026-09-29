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
import { netCashSalary, pfFromRows, PROFESSIONAL_TAX_ANNUAL_PER_EARNER } from "@/lib/salary-cash";
import { ageFromDOB } from "@/lib/age";
import { todayIsoLocal } from "@/lib/as-of-date";
import { toMonthly, toAnnual } from "@/lib/cashflow";
import { returnBucketKey, expectedReturn } from "@/lib/investment-traits";
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
import { buildContributionResolver, scalarToSegments } from "@/lib/contribution-schedule";
import {
  expectedRealGrowthPercent,
  generalInflationWithCreep,
  householdRealIncomeAt,
  realIncomeScaleAt,
  type EarnerIncomePath,
} from "@/lib/income-path";

/**
 * ADR-0006: the age at which the household savings step-up stops compounding. The contribution
 * HOLDS at the level it reached (in real terms) — it never drops. Chosen as a conservative proxy
 * for where salaried real wage growth flattens; a plan must not compound a promotion curve into
 * a household's sixties.
 */
export const STEP_UP_TAPER_AGE = 50;
import {
  resolveHouseholdBasket,
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
  /**
   * #176 follow-up (age-reference honesty): the reference date every member's age is computed
   * against (ISO `YYYY-MM-DD`). Optional so every existing caller (dozens of specs) is
   * unaffected — omitting it falls back to 1 April of `currentFY`, the pre-existing convention.
   * The app MUST set this to the real wall-clock date at the composable boundary
   * (`useFireDerive.ts`, mirroring how `DeriveOverrides.currentYear` already enters there) so a
   * member's age matches what their own profile page shows TODAY, not a stale FY-start snapshot
   * that can leave every member up to 12 months younger than they really are — an optimistic
   * error (`goal-anchored-decisions.md`: makes the salaried accumulator under-save). Tests MUST
   * set it explicitly (never rely on the fallback) so a snapshot/invariant never drifts with the
   * real wall clock the way `inflation-frame-invariant.spec.ts`'s iyers case did.
   */
  asOfDate?: string;
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
      if (m) return ageFromDOB(m.dateOfBirth, pinnedAsOf);
    }
    const primary = earners[0];
    return primary ? ageFromDOB(primary.dateOfBirth, pinnedAsOf) : 30;
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

  // ADR-0006 Phase 1d: injected, never read from the wall clock here — `derive()` is a pure
  // kernel and a golden master that shifts on 1 January (goals one year nearer ⇒ one year less
  // inflation ⇒ FIRE optimistically earlier) is not a golden master. See `DeriveOverrides.currentYear`.
  // Declared HERE (ahead of the expense legs) because #176's horizon split reads it too.
  const currentCalendarYear =
    // Last resort (an unparseable FY): year 0, which puts every dated goal beyond the horizon so
    // it inflates throughout — the conservative reading, never a goal treated as already paid.
    usableOverride(overrides?.currentYear, 1900) ?? financialYearStartYear(lens.currentFY) ?? 0;

  // #176 round 3: `anchorAgeFor` used to call `ageFromDOB(dob)` with NO reference date, so it
  // defaulted to the real wall clock — a member's derived age (hence the whole headline) could
  // shift mid-FY as the CALENDAR DATE ticked over, completely independent of `currentCalendarYear`
  // above. Round 3 pinned this to 1 April of the FY start year, which made age deterministic
  // WITHIN an FY — but 1 April is up to 12 months in the PAST for most of the year (today,
  // 2026-09-29, is FY 2026-27, whose 1 April was 6 months ago), so every member came out up to a
  // year YOUNGER than they actually are — an OPTIMISTIC error (younger ⇒ more working years ⇒
  // lower required contribution; caught by `inflation-frame-invariant.spec.ts`'s iyers case
  // moving 183414 -> 163599, -11%, outside the ±8% honesty allowance).
  //
  // #176 follow-up: honour an explicit `lens.asOfDate` (the app sets this to the REAL wall-clock
  // date at the composable boundary, `useFireDerive.ts`) so a member's age matches what their own
  // profile shows today. The 1-April fallback is kept ONLY for the dozens of existing callers
  // that never set `asOfDate` — `derive()` must never throw on a lens that omits it.
  const pinnedAsOf = lens.asOfDate ? new Date(lens.asOfDate) : new Date(currentCalendarYear, 3, 1);

  // Household-level monthly expenses (joint pool) — scope-independent base.
  //
  // #176: this is the ACCUMULATION bill — every recurring line the household is paying TODAY,
  // `endYear` or not. It feeds `annualExpensesToday`, hence the savings residual, hence the corpus
  // inflow, and it is also the figure the UI shows as "what we spend". A line that ends in 2036 is
  // genuinely money leaving the household this month, so it MUST stay here.
  const totalMonthlyExpenses =
    household.expenses.avgMonthly +
    household.expenses.recurring.reduce(
      (s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }),
      0,
    );

  /**
   * #176 — THE HORIZON SPLIT. `RecurringExpenseLine.endYear` is a CALENDAR year and it is
   * INCLUSIVE: the line is paid THROUGH that year (its two producers derive it from the loan
   * amortisation end — `amortization.ts` returns `startYear + floor((endMonth - 1) / 12)` — and
   * from `Liability.derivedEndYear`, the year the last EMI falls in).
   *
   * A line that has ENDED by the time the household retires is not retirement spending: the
   * corpus never has to fund it, so capitalising it at the SWR inflates the FIRE number by
   * `annualAmount / SWR` for money nobody will spend. Before this split, `derive()` never read
   * `endYear` at all and one undifferentiated total fed BOTH legs (gh #176).
   *
   * CONVENTION (stated, not implied): a line is EXCLUDED from the retirement base only when it
   * ends STRICTLY BEFORE the first retirement calendar year — `endYear < retirementCalendarYear`.
   * `endYear === retirementCalendarYear` means the last payment falls INSIDE the first retirement
   * year, so the line is RETAINED. That is the conservative boundary: retaining a line can only
   * ever make the target larger, and for the salaried accumulator an over-stated target is the
   * safe error while an under-stated one is the Tier-0 honesty failure.
   *
   * WHICH YEAR (the non-loop): the retirement year is derived from the `targetRetirementAge` the
   * kernel has ALREADY resolved (member field / hero-slider override / the 50 default), never from
   * the solved FIRE age. The FIRE age depends on the FIRE number which depends on this base, so
   * keying off it would be a fixed point — solved by iteration, non-deterministic under a
   * golden-master gate, and it would make the target move when the user's savings move (an
   * expense base that reacts to returns is not an expense base). The target age is the horizon the
   * user is planning TO, and it is the same age every other horizon-dependent layer already reads
   * (the SWR, the glide path, the bridge window), so the base is now consistent with them.
   *
   * A line with NO `endYear` is perpetual and always counted — every pre-#176 household is
   * therefore byte-identical.
   */
  function recurringEndsBeforeRetirement(
    line: { endYear?: number },
    anchorAgeForScope: number,
    targetRetirementAgeForScope: number,
  ): boolean {
    const endYear = line.endYear;
    if (typeof endYear !== "number" || !Number.isFinite(endYear)) return false;
    const yearsToRetirement = Math.max(0, targetRetirementAgeForScope - anchorAgeForScope);
    const retirementCalendarYear = currentCalendarYear + yearsToRetirement;
    return endYear < retirementCalendarYear;
  }

  /**
   * #176 — the annual ₹ of recurring lines that have ENDED by retirement, i.e. the amount the
   * ACCUMULATION bill carries but the RETIREMENT base must not. Computed over the same line set
   * and with the same `toMonthly` conversion as `totalMonthlyExpenses`, so the two can never drift
   * apart, and returned as a SUBTRACTION rather than a second total for exactly that reason.
   */
  function endedByRetirementAnnual(
    lines: readonly { endYear?: number; amount: number; frequency: Parameters<typeof toMonthly>[0]["period"] }[],
    anchorAgeForScope: number,
    targetRetirementAgeForScope: number,
  ): number {
    return (
      lines.reduce(
        (s, r) =>
          recurringEndsBeforeRetirement(r, anchorAgeForScope, targetRetirementAgeForScope)
            ? s + toMonthly({ amount: r.amount, period: r.frequency })
            : s,
        0,
      ) * 12
    );
  }

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
    // #176: the recurring lines VISIBLE to this scope, extracted as a list so the accumulation
    // total and the retirement-base subtraction below are computed over the SAME set (a second
    // hand-rolled filter is how the two legs would silently diverge again).
    const scopeRecurring = (() => {
      if (!scopeIsLensed) return household.expenses.recurring;
      const insuranceIds = new Set(scopeInsurance.map((p) => p.id));
      const loanIds = new Set(scopeLiabilities.map((l) => l.id));
      return household.expenses.recurring.filter((r) => {
        if (r.source === "auto-insurance" && r.sourceRefId && !insuranceIds.has(r.sourceRefId)) return false;
        if (r.source === "auto-loan" && r.sourceRefId && !loanIds.has(r.sourceRefId)) return false;
        return true;
      });
    })();
    // The ACCUMULATION bill — every visible line, `endYear` or not (#176: this leg must not change).
    const annualExpensesToday = scopeIsLensed
      ? (household.expenses.avgMonthly +
          scopeRecurring.reduce((s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }), 0)) *
        12
      : totalMonthlyExpenses * 12;
    // #176: the slice of that bill which has ENDED by `targetRetirementAge` — subtracted from the
    // RETIREMENT expense base only. Zero for every household whose lines carry no `endYear`.
    const endedByRetirementAnnualExpenses = endedByRetirementAnnual(
      scopeRecurring,
      anchorAge,
      targetRetirementAge,
    );

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
    }, { asOfDate: todayIsoLocal(pinnedAsOf) });
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
    // gh #218 — `monthlyTakeHome` is the CASH figure a user can recognise on a payslip: gross
    // minus the PF that leaves it, income tax and professional tax. It used to be `gross - tax`,
    // which for the salaried-accumulator persona overstated the bank credit by the whole PF
    // block (~12% of CTC). ONE helper owns the formula (`salary-cash.ts`).
    //
    // WHERE THE PF NUMBER COMES FROM: the EPF_VPF rows ALREADY IN SCOPE (`scopeInvestments`) —
    // the exact rupees this same scope's corpus receives. Money leaving the payslip and money
    // entering the corpus are therefore one number read from one place, so no SECOND basic base
    // is introduced and nothing downstream of this figure moves. (Unifying the app's two basic
    // bases is correct but MOVES headlines, so it is PR B: `chore/218b-basic-50pct-unification`.)
    //
    // PF is deliberately NOT removed from `annualSavings`/`monthlyContribution` above: it is
    // funded out of that residual and already reaches the corpus through that same EPF row
    // (gh #11 LOCK). Subtracting it twice would move every EPF household's FIRE date years
    // later for no real change in their finances.
    const scopePf = pfFromRows(scopeInvestments);
    // Professional tax is levied on EMPLOYMENT, so it is counted per SALARIED earner — gated on
    // `salary.annualCTC` exactly as the earner card, the member lens and the salary form do. A
    // business-only earner has no payslip and was previously charged a spurious ₹208/mo.
    const scopeProfessionalTax =
      scopeEarners.filter((m) => (m.salary?.annualCTC ?? 0) > 0).length *
      PROFESSIONAL_TAX_ANNUAL_PER_EARNER;
    const monthlyTakeHome = netCashSalary({
      annualCTC: annualIncome.total,
      annualPf: scopePf,
      annualTax,
      professionalTax: scopeProfessionalTax,
    }).monthly;
    // `savingsRate` keeps its ORIGINAL post-tax-gross base - the savings residual is measured
    // against the same gross it was carved out of, so re-basing it on the smaller cash figure
    // would inflate the percentage without any behaviour changing (gh #218).
    const monthlyGrossPostTax = Math.round((annualIncome.total - annualTax) / 12);
    const savingsRate = calculateSavingsRate(monthlyGrossPostTax, Math.round(annualSavings / 12));

    // ===== ADR-0007 / gh #185 — the per-earner INCOME path (replaces the savings step-up proxy) ==
    //
    // THE FORMULA (all REAL, today's rupees — `derive.ts` re-inflates at the one existing
    // `toNominalContribution` seam):
    //
    //   income(t)   = Σ_earners CTC_e · (1 + g_e)^min(t, taperAge − age_e)          [income-path.ts]
    //   expense(t)  = expenses₀ · (1 + b_creep)^t / (1 + CPI)^t
    //                 where b_creep = blend({general: CPI + creep, healthcare, education, housing})
    //   surplus(t)  = max(0, income(t) + otherIncome₀ − tax(t) − expense(t))
    //   tax(t)      = tax₀ · income(t) / income(0)        (effective rate held at year 0 — see below)
    //
    // WHY THE TAX APPROXIMATION IS SAFE AND WHICH WAY IT ERRS. Re-running `computeTax` per projection
    // year would need the whole deduction bundle re-derived per year (and the slab config for a
    // future FY, which does not exist). Holding the year-0 EFFECTIVE rate and scaling it with income
    // is CONSERVATIVE for the persona this change exists to serve: real bracket creep is a fiction
    // in the real frame (slabs are indexed in practice), and for a household below ₹12L the year-0
    // rate is ZERO under the new regime, so scaling zero stays zero — exactly right. For a
    // high-income household the year-0 effective rate is already near the marginal rate, so the
    // error is second-order. Documented as an accepted simplification, not hidden.
    //
    // WHY INCOME AND NOT SAVINGS (the RCA). A 2% step-up on a ₹50k surplus is ₹1k/yr; the same 2% on
    // a ₹3L income is ₹6k/yr, and nearly every rupee of income growth is surplus because expenses
    // only track prices. Growing the residual instead of the income understated future surplus by
    // roughly income ÷ surplus for the whole lower-middle band.
    const conservativeGrowthPct = assumptions.salaryGrowthRealPercent ?? 0;
    const taperAge = assumptions.salaryGrowthTaperAge ?? 50;
    const generalInflationForPath = assumptions.inflation;
    /** Build this scope's earner income paths at a given real growth rate per earner. */
    const buildEarnerPaths = (growthFor: (m: (typeof scopeEarners)[number]) => number): EarnerIncomePath[] =>
      scopeEarners
        .filter((m) => (m.salary?.annualCTC ?? 0) > 0)
        .map((m) => ({
          annualAmount: m.salary?.annualCTC ?? 0,
          ageAtYear0: ageFromDOB(m.dateOfBirth, pinnedAsOf),
          realGrowthPercent: growthFor(m),
          taperAge,
        }));
    const conservativePaths = buildEarnerPaths(() => conservativeGrowthPct);
    // The EXPECTED band reads the user's OWN typed nominal `salary.hikePercent`, de-inflated to real
    // and clamped to [0, INCOME_GROWTH_MAX_PERCENT] — floored at ZERO, not at the conservative
    // default, so a typed hike BELOW inflation yields a flat real income path rather than silently
    // inheriting the 2% headline assumption (spec §3.2: the hike NEVER moves the headline).
    const expectedPaths = buildEarnerPaths((m) =>
      expectedRealGrowthPercent(m.salary?.hikePercent, generalInflationForPath),
    );
    /**
     * The highest typed nominal hike% among this scope's earners — the number the UI quotes as the
     * BASIS of the second figure ("...if your 12% hikes continue"). It is the raw user input, not a
     * derived rate, because that is what the copy names. Whether the second figure is worth showing
     * at all is decided below from the SOLVED result, never from this number.
     */
    const expectedBasisPercent = scopeEarners.reduce(
      (best, m) => Math.max(best, m.salary?.hikePercent ?? 0),
      0,
    );
    // Creep rides the GENERAL bucket only (ADR-0007 (c)) and it is folded into the ONE household
    // basket (see the `householdInflation` block above), so the surplus's expense line and the FIRE
    // target grow at exactly the same rate — the coherence the FinTech review found missing in the
    // first pass. Recomputed here rather than closed over because `computeScope` runs before that
    // block; the two expressions are identical by construction and the coherence invariant in
    // `kernel-invariants.property.spec.ts` asserts they stay that way.
    const creepPercent = assumptions.expenseGrowthAboveInflationPercent ?? 0;
    const basketWithCreep = resolveHouseholdInflation({
      ...assumptions,
      inflation: generalInflationWithCreep(generalInflationForPath, creepPercent),
    });
    /** REAL expense growth rate: the creep-adjusted basket, deflated at general CPI. */
    const realExpenseDrift = (1 + basketWithCreep) / (1 + generalInflationForPath) - 1;
    const income0 = conservativePaths.reduce((sum, p) => sum + p.annualAmount, 0);
    const nonSalaryIncome0 = Math.max(0, annualIncome.total - income0);
    const effectiveTaxRate0 = income0 > 0 ? annualTax / (income0 + nonSalaryIncome0) : 0;
    /**
     * REAL ₹/month flowing to the corpus at `yearIndex` — the surplus RESIDUAL, now time-varying
     * because INCOME grows and expenses creep, rather than because the residual was stepped up.
     * Floored at 0: a household whose expenses outrun its income does not contribute a negative
     * amount, it contributes nothing (and the FIRE date goes to Infinity via the solver).
     */
    const realMonthlySurplusAt = (yearIndex: number, paths: EarnerIncomePath[]): number => {
      if (!Number.isFinite(yearIndex)) return 0;
      const t = Math.max(0, yearIndex);
      const income = householdRealIncomeAt(paths, t) + nonSalaryIncome0;
      const tax = income * effectiveTaxRate0;
      const expense = annualExpensesToday * Math.pow(1 + realExpenseDrift, t);
      const surplus = income - tax - expense;
      const monthly = surplus / 12;
      return Number.isFinite(monthly) && monthly > 0 ? monthly : 0;
    };
    /**
     * #207 — the REAL income-path SCALE the T-377 solver override rides, so the prescription's
     * probe grows exactly as the organic residual does instead of being a flat scalar the income
     * path never touches. THE formula lives in `income-path.ts` (`realIncomeScaleAt`) because
     * `individual-fire.ts` scales the member-lens prescription by the same one — one formula, two
     * scopes, no second growth model to drift.
     */
    const incomeScaleAt = (yearIndex: number, paths: EarnerIncomePath[]): number =>
      realIncomeScaleAt(paths, yearIndex);

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
      // #176 — the ended-by-retirement slice, so the retirement legs can net it off.
      endedByRetirementAnnualExpenses,
      estimatedDeductionsForOld,
      householdTaxRecommendation,
      fyTax,
      annualTax,
      marginalRate,
      annualSavings,
      monthlyContribution,
      monthlyTakeHome,
      savingsRate,
      realMonthlySurplusAt,
      incomeScaleAt,
      conservativePaths,
      expectedPaths,
      expectedBasisPercent,
      realExpenseDrift,
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
  // #176 — the recurring ₹/yr the household pays TODAY but will NOT be paying in retirement.
  const endedByRetirementAnnualExpenses = householdScope.endedByRetirementAnnualExpenses;
  /**
   * #176 — the RETIREMENT expense base: the ongoing annual spend the CORPUS has to fund, in today's
   * rupees. Identical to `annualExpensesToday` for every household whose recurring lines have no
   * `endYear` (so the golden masters are untouched); lower by the capitalisable EMI / school fee /
   * lease that clears before the target retirement age.
   *
   * Clamped at 0: a household whose entire bill is terminating lines has no perpetual spend, and a
   * negative base would drive a negative FIRE number.
   */
  const retirementAnnualExpensesToday = Math.max(
    0,
    annualExpensesToday - endedByRetirementAnnualExpenses,
  );
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
  // #176: the SWR base is the RETIREMENT bill, not today's — a terminating EMI is accumulation
  // spending, never something the corpus perpetually funds.
  const netAnnualExpenses = Math.max(0, retirementAnnualExpensesToday - npsAnnuityIncome);
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

  // #176 follow-up (deliberately deferred, see gh good-to-have issue): Lean/Fat FIRE variants
  // still use the accumulation total. Left on annualExpensesToday to keep #176's fix narrow.
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
  // gh #194 — the CONTRIBUTION-weighted fallback mix, used by blendPortfolioReturn/Volatility only
  // when `returnWeights` totals zero (every new user + the ₹2.5L-₹10L band, whose only holding is
  // an auto-flowed EPF line at `value: 0`). Built alongside the value weights so a household with
  // no accumulated corpus yet is still blended by what it's actually funding, never all-equity.
  const contributionWeights = {
    equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
    international: 0, reit: 0, crypto: 0, other: 0,
  };
  for (const inv of fireCorpusInvestments) {
    returnWeights[returnBucketKey(inv)] += inv.value;
    contributionWeights[returnBucketKey(inv)] += inv.monthlyContribution ?? 0;
  }
  const blendedReturn = blendPortfolioReturn(
    assumptions,
    returnWeights,
    epfAfterTaxReturn,
    contributionWeights,
  );

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
  // ADR-0007 / gh #185 — CREEP RIDES BOTH LEGS, or neither.
  //
  // FinTech review of this change (2026-09-29) found a CRITICAL coherence bug in the first pass:
  // lifestyle creep was added to the basket used for the SURPLUS's expense line but NOT to the one
  // the FIRE TARGET grows at. That declared Ravi FIRE-ready at 60.5 on a corpus funding ~₹2.73L/yr
  // real while his own projection had him spending ~₹3.57L/yr — a 31% shortfall AT THE MOMENT OF
  // THE VERDICT, in the OPTIMISTIC direction, which is the Tier-0 failure mode for this persona.
  //
  // Creep is a permanent lifestyle RATCHET: a household that creeps its way to ₹3.57L of real
  // spending does not revert to ₹2.73L on retirement day, so the corpus must capitalise the crept
  // level. The fix is therefore structural, not a second creep term: the creep is folded into
  // `householdInflation` ITSELF, so every consumer of the basket — the target schedule, the bridge's
  // expense line, the Floor/Ceiling decumulation overlay, `effectiveTargetDriftRate` and the Monte
  // Carlo band — inherits exactly one rate. ADR-0007 (c) settled which BUCKET creep attaches to and
  // was silent on which LEG consumes it; this is that gap closed.
  // ONE formula, shared with the store's `householdInflation()` (see `resolveHouseholdBasket`) so
  // the rate on the screen and the rate in the plan cannot diverge.
  const householdInflation = resolveHouseholdBasket(assumptions);
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
  const portfolioVolatility = blendPortfolioVolatility(returnWeights, contributionWeights);

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
  // ADR-0007 / gh #185 step 4 — the inflow is now the INCOME-PATH surplus residual, not a stepped-up
  // scalar. `householdSavingsStepUpPercent` is RETIRED from this headline path (the field survives for
  // hydrate/round-trip compatibility and is still read by the explicit "save more each year" lever
  // surfaces — `lever-catalog.ts`, `lever-impact.ts`, `useAcceleration.ts`). The formula and the
  // conservative/expected split live in `computeScope` above (`realMonthlySurplusAt`); the flattening
  // of the per-year values into a resolver stays out of the inline path (single-kernel rule).
  //
  // T-377 contract, AS AMENDED BY #207: when the solver passes a `contributionOverride`, the inflow
  // is that amount as the STARTING real contribution, SCALED along the income path — the override
  // replaces the residual's LEVEL, never its GROWTH. Before #207 it replaced both, so the
  // prescription was solved against a kernel run in which the user's income never grew: pessimistic
  // (over-prescribed), worst for the ₹2.5L-₹10L band. Callers needing a genuinely flat override pass
  // The member-lens prescription rides the SAME primitive (`individual-fire.ts`), so the two scopes
  // cannot drift apart.
  const conservativeSurplusAt = householdScope.realMonthlySurplusAt;
  const conservativeIncomeScaleAt = householdScope.incomeScaleAt;
  // `householdSavingsStepUpPercent` is no longer the WAGE-GROWTH proxy — the income path is. Its
  // DEFAULT therefore moves 2 -> 0 (`types/assumptions.ts`): leaving it at 2 would compound wage
  // growth twice, once through each earner's income and once again through the residual. What the
  // field now means, and the ONLY thing it means, is a DELIBERATE household decision to invest a
  // growing SHARE of its surplus — the "Raise investing 10% every year" plan lever
  // (`lever-catalog.ts`, `PLAN_STEP_UP_PERCENT`) and the What-If slider. That lever must keep
  // moving the solver (its own no-inert-lever guard), so the field stays LIVE in the kernel as a
  // multiplier ON TOP OF the income-path residual, tapering at the same age real wage growth does.
  const deliberateStepUpPct = assumptions.householdSavingsStepUpPercent ?? 0;
  const stepUpTaperAge = assumptions.salaryGrowthTaperAge ?? 50;
  const stepUpFactor = (yearIndex: number): number => {
    if (deliberateStepUpPct <= 0) return 1;
    const years = Math.max(0, Math.min(Math.max(0, yearIndex), stepUpTaperAge - anchorAge));
    const f = Math.pow(1 + deliberateStepUpPct / 100, years);
    return Number.isFinite(f) && f > 0 ? f : 1;
  };
  /**
   * The HEADLINE inflow: the conservative income-path surplus residual, times any DELIBERATE
   * step-up the user (or a lever) set. A non-positive scalar passes through so
   * `calculateYearsToTarget`'s `monthlySavings <= 0 -> Infinity` empty-state sentinel still fires —
   * including for an override of 0 (the T-377 empty-state guarantee, unchanged by #207).
   */
  const baseContributionSchedule: ContributionSchedule =
    monthlyContribution <= 0
      ? monthlyContribution
      : contributionOverride != null
        ? // T-377 as amended by #207: the solver replaces the residual's LEVEL with a fixed real
          // starting amount, and that amount then rides the SAME income path the organic residual
          // does — contribution(t) = override x income(t)/income(0) — so the probe honours the
          // growth the headline already assumes. The DELIBERATE step-up still applies on
          // top (the solver answers "what must I start at, given my plan", and the plan includes
          // stepping up); dropping it made the `step-up-10` lever INERT in
          // `requiredMonthlyContributionFor` (its own no-inert-lever guard caught it).
          (yearIndex: number) =>
            monthlyContribution *
            conservativeIncomeScaleAt(yearIndex, householdScope.conservativePaths) *
            stepUpFactor(yearIndex)
        : (yearIndex: number) =>
            conservativeSurplusAt(yearIndex, householdScope.conservativePaths) * stepUpFactor(yearIndex);
  /**
   * The EXPECTED-band inflow — identical except each earner grows at their own typed
   * `salary.hikePercent` (de-inflated to real, floored at ZERO — see `expectedRealGrowthPercent`;
   * a sub-inflation hike gives a flat real path, it does not fall back to the 2% default). This
   * NEVER feeds the headline (spec §3.2); it feeds `expectedFireAge` alone.
   */
  const expectedContributionSchedule: ContributionSchedule =
    contributionOverride != null || monthlyContribution <= 0
      ? baseContributionSchedule
      : (yearIndex: number) =>
          conservativeSurplusAt(yearIndex, householdScope.expectedPaths) * stepUpFactor(yearIndex);

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
  // ADR-0007 / gh #185 — the SECOND number: "FIRE at 51, or 42 if your 12% hikes continue".
  // Same solver, same target, same return schedule — ONLY the income growth rate differs. It is a
  // separate field and never substituted into the headline: an optimistic headline makes this
  // persona UNDER-SAVE, which is the Tier-0 failure mode (spec §3.2, `goal-anchored-decisions.md`).
  const expectedNominalContributionSchedule = toNominalContribution(expectedContributionSchedule);
  const expectedYearsToRegular = hasFireTarget
    ? calculateYearsToTarget(
        fireWithdrawableCorpus,
        regularTargetSchedule,
        expectedNominalContributionSchedule,
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

    // #212 — PER-TRANCHE PROJECTION. `corpusScale` above is retained ONLY as the fallback for a
    // holding with no instrument rule; the primary path now projects each accessibility family by
    // its own mechanics.
    //
    // WHAT WAS ACTUALLY WRONG (corrected after the #212 FinTech review): the COMPOSITION of the
    // retirement corpus, not its LEVEL. The portfolio TOTAL was pinned to the drifted adequacy
    // target both before and after this change — `bridgeCoverage.projectedPreTaxTotal` equals that
    // target to within ₹1 on every seed, asserted in `bridge.spec.ts` — so nothing was "inflated
    // against a CPI-only bill". The defect is that one portfolio-wide factor grew locked money as
    // if the household's whole savings residual landed in it (measured: sharmas' ₹6L PPF → ₹53.32L
    // at 8.89×, ~3.4× what ₹1.5L/yr at its own return can reach), pushing the LOCKED slice past
    // its instrument's ceiling. With the total fixed, an over-stated locked slice is exactly a
    // MIS-SPLIT of a correct total — and the liquid-vs-locked split is the one quantity the
    // coverage check consumes, so the gate read the wrong division (Tier-0, optimistic).
    //
    // The bridge runs in TODAY's rupees, so the returns handed over are REAL (nominal de-inflated
    // at general CPI) and the contributions are the REAL ₹/month each holding's own plan carries.
    // The liquid pool absorbs `driftedTargetReal − Σ(bounded projections)` so the household total
    // still equals the target the adequacy solve found (the reconciliation identity — see
    // `computeBridgeCoverage`).
    const perAssetContributionResolvers = new Map<string, (yearIndex: number) => number>();
    for (const inv of fireCorpusInvestments) {
      const segments =
        inv.contributionSchedule && inv.contributionSchedule.length > 0
          ? inv.contributionSchedule
          : scalarToSegments(inv.monthlyContribution);
      perAssetContributionResolvers.set(inv.id, buildContributionResolver(segments, anchorAge));
    }

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
      //
      // #176 follow-up (deliberately deferred, see gh good-to-have issue): the bridge runway
      // still uses the accumulation total, unchanged by #176's fix (kept narrow deliberately).
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
      projection: {
        targetReal: driftedTargetReal,
        realReturnFor: (asset) => toRealReturn(expectedReturn(asset, assumptions)),
        realMonthlyContributionFor: (asset, yearIndex) =>
          perAssetContributionResolvers.get(asset.id)?.(yearIndex) ?? 0,
        yearsToRetirement: adequacyAge - anchorAge,
      },
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

  /**
   * ADR-0007 / gh #185 — the INFLOW's effective REAL growth rate over the solved horizon.
   *
   * The income-path inflow is no longer a scalar × a single step-up: income grows and tapers per
   * earner while creep-adjusted expenses eat into the residual, so the real inflow's own growth rate
   * is a curve. The acceleration card / lever bands (`lever-impact.FireBaseline`) take a SCALAR
   * step-up, so they get the constant real rate that REPRODUCES this kernel's inflow at the horizon
   * the headline was actually solved at — the exact same technique, and the exact same reason, as
   * `effectiveTargetDriftRate` above. Handing those surfaces the retired
   * `householdSavingsStepUpPercent` left the card's baseline ~0.7 years OPTIMISTIC against the
   * headline printed beside it (measured on the Sharmas + Mehtas seeds, this change).
   *
   * Clamped at 0 from below: a shrinking real inflow is representable in the kernel (the taper +
   * creep case) but `FireBaseline.savingsStepUpPercent` is a non-negative step-up, and a card that
   * claimed a NEGATIVE step-up would read as advice to save less. 0 is the conservative floor for
   * that surface; the kernel's own headline keeps the true falling curve.
   */
  const inflowAt = (t: number): number =>
    typeof householdContributionSchedule === "function"
      ? householdContributionSchedule(t)
      : householdContributionSchedule;
  const effectiveInflowRealGrowthPercent = (() => {
    const T = effectiveDriftHorizon;
    const c0 = inflowAt(0);
    if (!(T > 0) || !(c0 > 0)) return 0;
    // Match the SUM of the inflow over the horizon, not its endpoint. A CAGR fitted to the
    // endpoint alone (`(c(T)/c(0))^(1/T)`) reproduces the last year's rupees and misses the ones
    // in between: on the Sharmas seed that left the card's baseline 0.83 years from the headline
    // beside it, because the income path is CONCAVE (it tapers) while a constant-rate curve is
    // convex. Fitting the total contributed is the right target — years-to-FIRE is driven by how
    // many rupees arrive, not by the final month's cheque. Solved by bisection on [0, 15]% because
    // the sum is monotone in the rate and there is no closed form once the taper is in play.
    let actualSum = 0;
    const years = Math.ceil(T);
    for (let y = 0; y < years; y++) actualSum += inflowAt(y);
    if (!(actualSum > 0)) return 0;
    const sumAtRate = (ratePct: number): number => {
      let total = 0;
      for (let y = 0; y < years; y++) total += c0 * Math.pow(1 + ratePct / 100, y);
      return total;
    };
    if (sumAtRate(0) >= actualSum) return 0;
    let lo = 0;
    let hi = 15;
    if (sumAtRate(hi) <= actualSum) return hi;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (sumAtRate(mid) < actualSum) lo = mid;
      else hi = mid;
    }
    const rate = (lo + hi) / 2;
    return Number.isFinite(rate) ? Math.max(0, rate) : 0;
  })();

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
    // #176 follow-up (deliberately deferred, see gh good-to-have issue): the chart's Lean/Fat
    // target lines still use the accumulation total, unchanged by #176's fix (kept narrow).
    annualExpensesToday: annualExpensesToday,
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

  // ADR-0007 / gh #185 — the EXPECTED FIRE age (the second number). Same ceil convention as the
  // headline so the two never disagree by a rounding step. `expectedFireAgeBasis` is the highest
  // typed nominal hike% among this household's earners, and is null when nobody typed one that
  // beats the conservative default — in which case `expectedFireAge` equals the headline and the UI
  // must show ONE number, not two identical ones.
  const expectedFireAge = Number.isFinite(expectedYearsToRegular)
    ? anchorAge + Math.ceil(expectedYearsToRegular)
    : null;
  // The basis is non-null ONLY when the expected run is genuinely BETTER than the headline and the
  // user actually typed a hike. Deciding it from the SOLVED result rather than by comparing rates is
  // what lets `expectedRealGrowthPercent` stay honest arithmetic (FinTech H2): a user whose hike is
  // below inflation now gets a truthful `expectedYearsToRegular` that is no better than the
  // headline, and a null basis tells the UI to show ONE number instead of a second, worse one
  // labelled as their own expectation.
  const expectedFireAgeBasis =
    householdScope.expectedBasisPercent > 0 &&
    Number.isFinite(expectedYearsToRegular) &&
    expectedYearsToRegular < corpusOnlyYearsToRegular - 1e-9
      ? householdScope.expectedBasisPercent
      : null;

  // #81 Phase 2: standalone individual FIRE per ADULT — a clearly-caveated SECONDARY view. The
  // household fireNumber/yearsToRegular above stay the PRIMARY, decision-driving figures and are
  // INVARIANT to member selection (this block only ADDS; it never feeds the household path). The
  // gap = household annual expenses − Σ(adults' attributable expenses) = the dependents' costs
  // (ring 3) + any unsplit remainder — surfaced so the individual numbers are never misread as
  // "the family can stop". computeIndividualFire owns the attribution (single canonical helper).
  const individualFireByMember = members
    .filter((m) => isAdultRole(m.role))
    .map((m) => computeIndividualFire(household, assumptions, m.id, lens.currentFY, overrides, pinnedAsOf))
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
    // #176: the retirement expense base (accumulation total minus recurring lines that end
    // before `targetRetirementAge`) — exposed so callers/tests can reconstruct `baseFireNumber`
    // without re-deriving the horizon split themselves.
    retirementAnnualExpensesToday,
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
    effectiveInflowRealGrowthPercent,
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
    //
    // #160: under an EXPLICIT member lens, `lensedScope.totalCorpus`/`totalLiabilitiesValue` counted
    // the member's own holdings/loans + 100% of every "Joint"/shared one — while the tile's SUBLINE
    // count (lensedInvestments.length / lensedLiabilities.length) is the same "which rows are
    // visible" set, so value and count agreed on WHICH ROWS but not on HOW MUCH of a shared row is
    // this member's. That is still a scope mismatch: the value read 100% of Joint, the count implied
    // "this member's slice". Route through the SAME attribution `individual-fire.ts` already uses
    // for this member's own FIRE math (own 100% + Joint/shared × householdSplitPercent) so the tile
    // value is the member's ATTRIBUTABLE slice, never a second attribution rule. On the default
    // (no-lens) view `effectiveLensMemberId` is null → falls through to `lensedScope`, byte-identical
    // to today.
    lensedTotalCorpus:
      individualFireByMember.find((r) => r.memberId === effectiveLensMemberId)?.attributableCorpus ??
      lensedScope.totalCorpus,
    lensedTotalLiabilitiesValue:
      individualFireByMember.find((r) => r.memberId === effectiveLensMemberId)
        ?.attributableLiabilitiesValue ?? lensedScope.totalLiabilitiesValue,
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
    expectedFireAge,
    expectedFireAgeBasis,
    expectedYearsToRegular,
  };
}

export type DerivedFinancials = ReturnType<typeof derive>;

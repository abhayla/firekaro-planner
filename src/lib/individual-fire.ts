/**
 * individual-fire — the ONE canonical helper for a single adult's STANDALONE FIRE (#81 Phase 2).
 *
 * Treats one adult as a "mini-household": their attributable corpus grows (real frame, SWR) to
 * their attributable expenses. Attribution rules (contract §3, grilled 2026-06-08):
 *   - expenses: M's OWN itemised lines (ring 1) at 100% + M's complementary share of the SHARED
 *     "Household" pool (ring 2, incl. avgMonthly) and of a shared loan's EMI. Ring 3 (dependent-owned / "Dependents") is
 *     EXCLUDED — a child's cost is a household obligation, not one adult's personal FIRE.
 *   - corpus / income: member-owned at 100% + M's complementary share of "Joint"; dependent-owned excluded.
 *   - tax: per-individual (India files individually) — computeTax on the adult's attributable
 *     taxable income with the adult's OWN deductions.
 *
 * DELIBERATE SIMPLIFICATIONS (each either CONSERVATIVE — never makes individual FIRE look EARLIER
 * than reality, the safe direction for the accumulator — or a disclosed bound):
 *   - gross attributable expenses (no NPS-annuity offset); no bridge/glide/family-layer overlay —
 *     all conservative (a higher target / no early-money credit). The HEALTHCARE reservation IS
 *     now included (#162 part 1, `calculateFireTarget` shared with the household path) — it is
 *     no longer a simplification, see the residual-drift note below.
 *   - (RETIRED — gh #162 part 2 §4.4, this change) the reservation-leg inflation drift is FIXED:
 *     the member target is now the SAME two legs the household path uses — base at
 *     `resolveHouseholdBasket` and the healthcare reservation at `healthcareInflation` — so a
 *     member's reservation share no longer rises slower than the household's the further out
 *     their FIRE date is. Byte-identical at t = 0; strictly later wherever
 *     healthcareInflation > basket. See `memberTargetNominalAt` below.
 *   - rental income is taxed at FULL gross in the attributable tax (the household path applies the
 *     §24(a) 30% / §24(b) / §71 house-property collapse; the individual path does NOT). This
 *     OVER-taxes the individual → savings lower → individual FIRE LATER → conservative/safe; it only
 *     slightly widens the household-vs-individual gap. (FinTech #81 Phase 2, MED-1.)
 *   - (RETIRED — gh #232) shared rows are no longer given `split` to EACH adult. CONSERVATION LAW:
 *     for every row (asset, contribution, income, expense, loan balance, EMI) the adults' shares sum
 *     to exactly the row — anchor adult `split`, the other `1 − split`, 3+ adults equal, a single
 *     adult 100% (`member-row-share.ts` over `jointShareFor`).
 * The HOUSEHOLD FIRE number (which carries all of the above) stays the primary, decision-driving
 * figure; this is a clearly-caveated secondary view. This helper NEVER feeds the household number
 * (derive only ADDS it alongside).
 */
import { usableOverride, type DeriveOverrides } from "@/lib/derive-overrides";
import { isAdultRole, type Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import { isEarningMember } from "@/lib/member-earning";
import { toMonthly, toAnnual } from "@/lib/cashflow";
import { ageFromDOB } from "@/lib/age";
import {
  realAnnualSurplusAt,
  realIncomeScaleAt,
  type EarnerIncomePath,
  type SurplusPathInput,
} from "@/lib/income-path";
import { todayIsoLocal } from "@/lib/as-of-date";
import { calculateFIRENumber, calculateFireTarget, calculateYearsToTarget } from "@/lib/fire-math";
import { computeTax, recommendRegime, marginalSlabRate, getTaxConfigForFY } from "@/lib/tax";
import { deductionsForMember, jointShareFor } from "@/lib/tax-deductions";
import { ownedRowShare, liabilityShare, expenseRowShare } from "@/lib/member-row-share";
import { epfBucketAfterTaxReturn } from "@/lib/epf-vpf";
import { returnBucketKey } from "@/lib/investment-traits";
import {
  resolveEffectiveSWRByHorizon,
  blendPortfolioReturn,
  resolveHouseholdBasket,
} from "@/lib/assumption-math";

export interface IndividualFireResult {
  memberId: string;
  name: string;
  anchorAge: number;
  /** M's own (ring 1) + M's complementary share of shared (ring 2); ring 3 excluded. ₹/yr today. */
  attributableAnnualExpenses: number;
  /** M-owned + M's complementary share of Joint investments (primary residence excluded). ₹ today. */
  attributableCorpus: number;
  /** #160/#232: M-owned + M's complementary share of shared-with-spouse liabilities. ₹ outstanding today. */
  attributableLiabilitiesValue: number;
  attributableAnnualIncome: number;
  attributableAnnualTax: number;
  attributableAnnualSavings: number;
  /** SWR-based personal FIRE number from attributable expenses. ₹ today. */
  individualFireNumber: number;
  /** The member's OWN real (inflation-adjusted) blended return — the rate their FIRE age was
   *  solved at. Exposed so no consumer grows a member's corpus at the HOUSEHOLD rate (T-377). */
  realReturn: number;
  /** ADR-0006: the NOMINAL blended return this member's FIRE age was solved at. */
  nominalReturn: number;
  yearsToIndividualFire: number;
  /** anchorAge + yearsToIndividualFire (Infinity → anchorAge unchanged sentinel handled by caller). */
  individualFireAge: number;
  /**
   * gh #162 part 2 §4.4 — the NOMINAL two-leg target schedule the solver actually chased, at
   * fractional year `t` from `anchorAge`: base at the household basket + the healthcare reservation
   * at `healthcareInflation`. Exposed so a test can pin THE KERNEL'S OWN schedule against
   * `derive.ts`'s `healthcareReservationNominalAt` rather than rebuilding both legs in test-side
   * arithmetic — a reconstruction cannot see an off-by-one on `t` inside this closure, and a
   * `tt + 1` mutant provably survived every test that only reconstructed it (#210 review).
   * Derived, never persisted.
   */
  targetNominalAt: (t: number) => number;
  /** The two legs at t = 0, so a test can separate them without re-deriving the reservation %. */
  targetBaseToday: number;
  targetReservationToday: number;
}

/** "Joint" asset/debt/income sentinel (distinct from the "Household" expense sentinel). */
const JOINT = "Joint";

/** gh #232 — one adult's year-0 cashflow and the inputs of their surplus projection. */
interface MemberCashflow {
  attributableAnnualExpenses: number;
  attributableAnnualIncome: number;
  attributableAnnualTax: number;
  recommended: ReturnType<typeof recommendRegime>;
  fyTax: ReturnType<typeof computeTax>;
  surplus: SurplusPathInput;
}

/**
 * One adult's attributable income, tax and expenses (own 100%, shared rows by the complementary
 * share, ring 3 excluded) plus the `SurplusPathInput` the household projection formula runs on.
 * Called for EVERY adult so a member's projection can carry the others' shortfalls (#232).
 */
function memberCashflow(
  household: Household,
  assumptions: Assumptions,
  member: Household["members"][number],
  splitPercent: number,
  currentFY: string,
  asOf: Date,
): MemberCashflow {
  const memberId = member.id;
  const jointShare = jointShareFor(household, memberId, splitPercent);
  const anchorAge = ageFromDOB(member.dateOfBirth, asOf);

  // ---- attributable expenses: own ring-1 (100%) + shared ring-2 (× this adult's joint share);
  // a shared loan's EMI follows the loan's split; ring-3 excluded ----
  let attributableMonthly = jointShare * household.expenses.avgMonthly; // avgMonthly is the shared lump (ring 2)
  for (const r of household.expenses.recurring) {
    const share = expenseRowShare(household, memberId, splitPercent, r);
    if (share > 0) attributableMonthly += share * toMonthly({ amount: r.amount, period: r.frequency });
  }
  const attributableAnnualExpenses = Math.round(attributableMonthly * 12);

  // ---- attributable income: own (100%) + Joint (× this adult's complementary share) ----
  const salary = isEarningMember(member, household.businesses)
    ? member.salary?.annualCTC ?? 0
    : 0;
  let ownTaxableOther = 0, ownExemptOther = 0, jointTaxableOther = 0, jointExemptOther = 0;
  for (const o of household.otherIncome) {
    const ann = toAnnual({ amount: o.amount, period: o.frequency });
    if (o.ownerId === memberId) (o.isTaxExempt ? (ownExemptOther += ann) : (ownTaxableOther += ann));
    else if (o.ownerId === JOINT) (o.isTaxExempt ? (jointExemptOther += ann) : (jointTaxableOther += ann));
  }
  let ownBusiness = 0, jointBusiness = 0;
  for (const b of household.businesses) {
    const ann = toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100);
    if (b.ownerId === memberId) ownBusiness += ann;
    else if (b.ownerId === JOINT) jointBusiness += ann;
  }
  const attrTaxableIncome =
    salary + ownTaxableOther + ownBusiness + jointShare * (jointTaxableOther + jointBusiness);
  const attrExemptIncome = ownExemptOther + jointShare * jointExemptOther;
  const attributableAnnualIncome = Math.round(attrTaxableIncome + attrExemptIncome);

  // ---- attributable tax: per-individual, on the adult's OWN + Joint-split deductions (#204) ----
  // #204: own-owned sources at 100% + "Joint"/isSharedWithSpouse sources × the SAME split used for
  // corpus/income/liabilities above — a Joint PPF/ELSS/NPS or a shared home loan is no longer
  // dropped from both earners' 80C/80D/§24. See `deductionsForMember`'s doc comment.
  const deductions = deductionsForMember(household, memberId, assumptions.householdSplitPercent ?? 50, {
    asOfDate: todayIsoLocal(asOf),
  });
  // The ₹50k salaried standard deduction applies ONLY against salary income — a non-earning
  // adult with only split capital income must NOT receive it (else their tax is understated →
  // an optimistically EARLY individual FIRE). isSalaried = this adult actually draws a salary.
  const memberIsSalaried = (member.salary?.annualCTC ?? 0) > 0;
  const recommended = recommendRegime({
    grossIncome: attrTaxableIncome,
    fy: currentFY,
    deductions: deductions.totalDeductions,
    employerNpsByMember: deductions.employerNpsByMember,
    taxpayerAge: anchorAge,
    isSalaried: memberIsSalaried,
  });
  const fyTax = computeTax({
    grossIncome: attrTaxableIncome,
    regime: recommended.recommended,
    fy: currentFY,
    deductions: deductions.totalDeductions,
    employerNpsByMember: deductions.employerNpsByMember,
    taxpayerAge: anchorAge,
    isSalaried: memberIsSalaried,
  });
  const attributableAnnualTax = Math.round(fyTax.totalTax);


  // The SAME conservative path derive.ts builds per earner (growth `?? 0`, taper `?? 50`), on this
  // adult's own salary; a member with no salary has no growing income.
  const paths: EarnerIncomePath[] =
    salary > 0
      ? [
          {
            annualAmount: salary,
            ageAtYear0: anchorAge,
            realGrowthPercent: assumptions.salaryGrowthRealPercent ?? 0,
            taperAge: assumptions.salaryGrowthTaperAge ?? 50,
          },
        ]
      : [];
  const realExpenseDrift = (1 + resolveHouseholdBasket(assumptions)) / (1 + assumptions.inflation) - 1;
  return {
    attributableAnnualExpenses,
    attributableAnnualIncome,
    attributableAnnualTax,
    recommended,
    fyTax,
    surplus: {
      paths,
      nonSalaryIncome0: Math.max(0, attributableAnnualIncome - salary),
      effectiveTaxRate0: attributableAnnualIncome > 0 ? attributableAnnualTax / attributableAnnualIncome : 0,
      annualExpenses0: attributableAnnualExpenses,
      realExpenseDrift,
    },
  };
}

/**
 * gh #232 — split a household surplus `total` across adults so the parts sum to it exactly.
 * Adults with a positive own surplus keep it, less their complementary-share part of the gap
 * between Σ positive surpluses and `total` (a non-earner's shortfall, dependants' costs). An adult
 * pushed below 0 is set to 0 and the gap is re-spread over the rest (water-filling). Nobody positive
 * but a positive total (the household's tax model came out lower) → spread by share over everyone.
 */
function conserveSurplus(
  raws: { id: string; weight: number; raw: number }[],
  total: number,
): Map<string, number> {
  const out = new Map(raws.map((r) => [r.id, 0]));
  if (!(total > 0)) return out;
  let active = raws.filter((r) => r.raw > 0);
  if (active.length === 0) active = raws;
  for (;;) {
    const weightSum = active.reduce((s, r) => s + r.weight, 0);
    const gap = active.reduce((s, r) => s + Math.max(0, r.raw), 0) - total;
    const alloc = active.map((r) => ({
      id: r.id,
      value:
        Math.max(0, r.raw) -
        (weightSum > 0 ? r.weight / weightSum : 1 / active.length) * gap,
    }));
    const negative = alloc.filter((a) => a.value < 0);
    if (negative.length === 0 || negative.length === active.length) {
      for (const a of alloc) out.set(a.id, Math.max(0, a.value));
      return out;
    }
    const dropped = new Set(negative.map((a) => a.id));
    active = active.filter((r) => !dropped.has(r.id));
  }
}

/**
 * Standalone individual FIRE for ONE adult. Returns null for a non-adult or a missing member
 * (dependents have no standalone FIRE — they are funded by the household).
 */
export function computeIndividualFire(
  household: Household,
  assumptions: Assumptions,
  memberId: string,
  currentFY: string,
  /** T-377 (QN-2): the same additive solver seam the household path honours — see derive-overrides.ts. */
  overrides?: DeriveOverrides,
  /**
   * #176 follow-up: this used to call `ageFromDOB(member.dateOfBirth)` with NO reference date,
   * so this member's age (hence their whole individual-FIRE solve) silently drifted with the
   * real wall clock — the exact class #176 fixed in `derive.ts`'s household-scope `anchorAgeFor`,
   * but never pinned here. Callers MUST pass the same reference date the household scope uses
   * (`derive.ts`'s `pinnedAsOf`) so a member's individual and household ages agree and neither
   * moves between two loads of the same data on different days.
   */
  asOf: Date = new Date(),
  /** #232: the household surplus the members' surpluses are conserved to (derive.ts passes it).
   *  Omitted → the adults' own surpluses, a non-earner's shortfall carried by the earner(s). */
  conservation?: { householdRealMonthlySurplusAt?: (yearIndex: number) => number },
): IndividualFireResult | null {
  const member = household.members.find((m) => m.id === memberId);
  if (!member || !isAdultRole(member.role)) return null;

  // #232: every shared row is split COMPLEMENTARILY across the adults (member-row-share.ts) — the
  // members' shares of any row sum to exactly the row, at any split %.
  const splitPercent = assumptions.householdSplitPercent ?? 50;
  const ownedShare = (ownerId: string | undefined) =>
    ownedRowShare(household, memberId, splitPercent, ownerId);
  const anchorAge = ageFromDOB(member.dateOfBirth, asOf);
  const targetRetirementAge =
    usableOverride(overrides?.targetRetirementAge, 1) ?? member.targetRetirementAge ?? 50;
  const planToAge = member.planToAge ?? 90;

  const own = memberCashflow(household, assumptions, member, splitPercent, currentFY, asOf);
  const {
    attributableAnnualExpenses,
    attributableAnnualIncome,
    attributableAnnualTax,
    recommended,
    fyTax,
  } = own;

  // ---- attributable corpus: M-owned (100%) + Joint (complementary share); primary residence excluded ----
  // #211: a non-primary property STILL counts toward this member's attributable target — the fix
  // changed WHEN its rupees become spendable in the household bridge, not whether the property
  // funds retirement. The member path has no bridge gate at all (see the #162 part-2 note below),
  // so there is no unlock timeline here to date a sale into; the caveat on that line is what tells
  // the user this age carries no liquidity check.
  const fireInvestments = household.investments.filter(
    (i) => !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence"),
  );
  let attributableCorpus = 0;
  const returnWeights = {
    equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
    international: 0, reit: 0, crypto: 0, other: 0,
  };
  // gh #194 — the member-lens CONTRIBUTION-weighted fallback mix, mirroring derive.ts's household
  // `contributionWeights` (l.686-693 there). Without this, `blendPortfolioReturn` below fell back to
  // its OWN truly-empty debt default whenever this member's attributed VALUE weights totalled zero —
  // which is every member whose only holding is an auto-flowed EPF line at `value: 0` (Ravi) — instead
  // of using what this member is actually FUNDING, same as the household path does. Attributed by the
  // SAME ownership share as the corpus value weights below (own full / joint complementary).
  const contributionWeights = {
    equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
    international: 0, reit: 0, crypto: 0, other: 0,
  };
  let attributableEpfAnnualContribution = 0;
  for (const inv of fireInvestments) {
    const contribWeight = ownedShare(inv.ownerId);
    if (contribWeight > 0) {
      contributionWeights[returnBucketKey(inv)] += (inv.monthlyContribution ?? 0) * contribWeight;
    }
    const w = contribWeight * inv.value;
    if (w <= 0) continue;
    attributableCorpus += w;
    returnWeights[returnBucketKey(inv)] += w;
    if (inv.type === "EPF_VPF") {
      // EPF contribution is attributed the same way as its corpus weight (own full / joint split).
      attributableEpfAnnualContribution += (inv.monthlyContribution ?? 0) * 12 * contribWeight;
    }
  }
  attributableCorpus = Math.round(attributableCorpus);

  // ---- attributable liabilities: own (100%) + shared-with-spouse (complementary share) ----
  // #160: the dashboard's Liabilities tile reads this. #232: a shared loan used to give its owner
  // 100% AND the spouse `split` (150% of the loan at the default 50); `liabilityShare` splits it.
  let attributableLiabilitiesValue = 0;
  for (const l of household.liabilities) {
    attributableLiabilitiesValue += liabilityShare(household, memberId, splitPercent, l) * l.outstandingBalance;
  }
  attributableLiabilitiesValue = Math.round(attributableLiabilitiesValue);

  /**
   * gh #232 — THE MEMBER'S SURPLUS, projected and conserved.
   *
   * (1) Method: each adult's surplus comes from `realAnnualSurplusAt` — the SAME function the
   * household path uses — so INCOME grows and the leftover is recomputed every year. The old
   * method grew the year-0 leftover by the income scale; with income ≫ savings that put a
   * one-adult household's member age 24 years after its household age (Ravi 89 vs 65).
   * (2) Conservation: a non-earner's negative surplus is a real cost the earner(s) carry, so it is
   * redistributed to the adults whose surplus is positive by their complementary shares, and the
   * members' surpluses sum to the HOUSEHOLD surplus (derive passes it; any remainder — dependants'
   * own costs, the per-assessee tax model's difference — is spread the same way). Flooring the
   * non-earner at 0 while the earner kept their whole surplus made Σ member savings exceed the
   * household's (Mauryas ₹24.85L vs ₹15.11L/yr) and every earner's member age optimistic.
   */
  const adults = household.members.filter((m) => isAdultRole(m.role));
  const flows = adults.map((a) => ({
    id: a.id,
    weight: jointShareFor(household, a.id, splitPercent),
    surplus:
      a.id === memberId
        ? own.surplus
        : memberCashflow(household, assumptions, a, splitPercent, currentFY, asOf).surplus,
  }));
  const householdRealMonthlySurplusAt = conservation?.householdRealMonthlySurplusAt;
  const memberAnnualSurplusAt = (yearIndex: number): number => {
    const raws = flows.map((f) => ({
      id: f.id,
      weight: f.weight,
      raw: realAnnualSurplusAt(f.surplus, yearIndex),
    }));
    const total = householdRealMonthlySurplusAt
      ? householdRealMonthlySurplusAt(yearIndex) * 12
      : Math.max(0, raws.reduce((s, r) => s + r.raw, 0));
    return conserveSurplus(raws, total).get(memberId) ?? 0;
  };

  const attributableAnnualSavings = memberAnnualSurplusAt(0);
  const monthlyContribution =
    usableOverride(overrides?.monthlyContributionReal, 0) ?? Math.round(attributableAnnualSavings / 12);
  const contributionIsOverride = usableOverride(overrides?.monthlyContributionReal, 0) != null;

  const cfg = getTaxConfigForFY(currentFY);
  const slabs = recommended.recommended === "NEW" ? cfg.newRegime.slabs : cfg.oldRegime.slabs;
  const marginalRate = marginalSlabRate(fyTax.taxableIncome, slabs);
  const epfAfterTaxReturn = epfBucketAfterTaxReturn({
    annualContribution: attributableEpfAnnualContribution,
    marginalSlabRate: marginalRate,
    epfRate: assumptions.epfReturn,
  });
  const blendedReturn = blendPortfolioReturn(
    assumptions,
    returnWeights,
    epfAfterTaxReturn,
    contributionWeights,
  );
  const generalInflation = assumptions.inflation;
  // ADR-0006: `realReturn` is still the CPI-deflated return every DISPLAY surface (and the
  // solver's have-by-target projection) reads, but the individual FIRE age itself is now solved
  // in the SAME nominal frame as the household path below. If this site kept the old fixed-target
  // real frame, the same person's household and individual FIRE ages would drift apart — the
  // cross-screen incoherence class `feedback_cross_screen_figure_coherence` names.
  const realReturn = (1 + blendedReturn) / (1 + generalInflation) - 1;
  // The CREEP-INCLUSIVE basket (`resolveHouseholdBasket`), identical to the one `derive()` grows the
  // household target at (ADR-0007 (d)). The creep-free blend here would have grown this member's
  // individual target more slowly than the household target it is a share of — the same
  // cross-screen incoherence the comment above names, with creep > 0 as the trigger.
  const householdBasket = resolveHouseholdBasket(assumptions);

  const effectiveSWR = resolveEffectiveSWRByHorizon(assumptions, targetRetirementAge, planToAge);
  const individualBaseFireNumber = calculateFIRENumber(attributableAnnualExpenses, effectiveSWR, anchorAge);
  // gh #162 part 1 — the individual target must carry the SAME healthcare corpus reservation the
  // household path adds (derive.ts, `healthcareCorpusReservationPercent`, default 20%), through the
  // SAME shared `calculateFireTarget` helper — one formula, not a second one drifting from it.
  // `familyLayerCorpus: 0` is deliberate (ring-3 exclusion, contract §3): planned goals/extended-
  // family contingency are a household obligation, never one adult's personal FIRE target.
  // Part 2 (NOT in this change, tracked on #162): the accessible-money bridge gate needs a
  // per-member accessibility split and is a larger design question — the individual age below
  // still has no bridge check.
  const healthcareReservationPercent = household.healthcareCorpusReservationPercent ?? 0.2;
  const individualFireNumber = Math.round(
    calculateFireTarget({
      baseFireNumber: individualBaseFireNumber,
      familyLayerCorpus: 0,
      healthcareReservationPercent,
    }),
  );
  /**
   * gh #162 part 2 §4.4 — THE TWO LEGS THE TARGET IS MADE OF, kept as components instead of
   * collapsed into one scalar, so each can ride its OWN price index the way the household path
   * already does.
   *
   * RCA of what this closes: `derive.ts` grows its healthcare-reservation leg at
   * `assumptions.healthcareInflation` on its own schedule (`healthcareReservationNominalAt`) while
   * this file grew the member's WHOLE target — reservation included — at
   * `resolveHouseholdBasket(assumptions)`. `healthcareInflation` does reach the basket by WEIGHT,
   * but the basket is a blend, so wherever `healthcareInflation > basket` (the normal case, 9% vs
   * ~6.2% on the default weights) the member's reservation share rose SLOWER than the household's.
   * The member target therefore understated the household-grade reservation, and understated it
   * MORE the further out the member's FIRE date is — small, monotone and OPTIMISTIC, which is the
   * Tier-0 direction for this persona. The file's own docblock disclosed it as a residual bound;
   * this is the fix.
   *
   * At `t = 0` the two legs sum to EXACTLY `individualFireNumber`, so the member's target TODAY is
   * byte-identical — only the TRAJECTORY the solver chases moves, and it moves the age later.
   * `familyLayerCorpus: 0` keeps this at exactly two legs (ring-3 exclusion, contract §3); a
   * member-owned dated goal would make it three, which is why they are summed rather than hard-coded.
   */
  const targetReservationToday = individualBaseFireNumber * healthcareReservationPercent;
  const targetBaseToday = individualFireNumber - targetReservationToday;
  /** NOMINAL ₹ in the member's target at fractional year `t` — base at the basket, reservation at
   *  medical inflation. Mirrors `derive.ts`'s `regularTargetSchedule`, on member quantities. */
  // The rate is snapshotted, NOT read live off `assumptions` inside the closure: the exposed
  // `targetNominalAt` is the schedule THIS solve used, and a caller mutating the assumptions store
  // afterwards must not retroactively change an already-returned result (found while pinning the
  // rupee value — two results computed at 9% and 14% returned the identical schedule because both
  // closures read the same live object).
  const memberHealthcareInflation = assumptions.healthcareInflation;
  const memberTargetNominalAt = (t: number): number => {
    const tt = Math.max(0, t);
    return (
      targetBaseToday * Math.pow(1 + householdBasket, tt) +
      targetReservationToday * Math.pow(1 + memberHealthcareInflation, tt)
    );
  };

  // calculateYearsToTarget caps its loop at 1200 months and returns a FINITE value (up to 100.0)
  // for an unreachable target with positive-but-insufficient savings — NOT Infinity (only the
  // ≤0-savings path returns Infinity). An individual FIRE that lands AFTER the member's own plan
  // horizon (planToAge) is not really FIRE — surface it as "not within horizon", else the card
  // renders a domain-absurd "age 125+" (a rule-31 headline leak the code-review caught).
  const hasTarget = individualFireNumber > 0;
  // Nominal frame: target grows at the household expense basket, corpus at the NOMINAL blended
  // return, the real contribution at general CPI. A non-positive scalar contribution is passed
  // through unchanged so the `<= 0 → Infinity` sentinel still fires.
  // Organic: the conserved income-path surplus (see the #232 block above). Override (T-377/#207,
  // same contract as derive.ts): the solver's starting amount rides this member's income scale.
  const nominalContribution =
    monthlyContribution <= 0
      ? monthlyContribution
      : contributionIsOverride
        ? (yearIndex: number) =>
            monthlyContribution *
            realIncomeScaleAt(own.surplus.paths, yearIndex) *
            Math.pow(1 + generalInflation, yearIndex)
        : (yearIndex: number) =>
            (memberAnnualSurplusAt(yearIndex) / 12) * Math.pow(1 + generalInflation, yearIndex);
  const rawYearsToFire = hasTarget
    ? calculateYearsToTarget(
        attributableCorpus,
        // §4.4: the TWO-LEG schedule, not `individualFireNumber × (1 + basket)^t` — the
        // reservation leg rides medical inflation, so the target the solver chases is steeper.
        memberTargetNominalAt,
        nominalContribution,
        blendedReturn,
      )
    : Number.POSITIVE_INFINITY;
  const reachable = Number.isFinite(rawYearsToFire) && anchorAge + rawYearsToFire <= planToAge;
  const yearsToIndividualFire = reachable ? rawYearsToFire : Number.POSITIVE_INFINITY;
  const individualFireAge = reachable
    ? Math.round(anchorAge + rawYearsToFire)
    : Number.POSITIVE_INFINITY;

  return {
    memberId,
    name: member.name || "Adult",
    anchorAge,
    attributableAnnualExpenses,
    attributableCorpus,
    attributableLiabilitiesValue,
    attributableAnnualIncome,
    attributableAnnualTax,
    attributableAnnualSavings,
    individualFireNumber,
    realReturn,
    /** ADR-0006: the NOMINAL blended return this member's FIRE age was solved at. */
    nominalReturn: blendedReturn,
    yearsToIndividualFire,
    individualFireAge,
    targetNominalAt: memberTargetNominalAt,
    targetBaseToday,
    targetReservationToday,
  };
}

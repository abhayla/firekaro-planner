/**
 * Nudge engine — the cross-cutting recommendation surface.
 *
 * Phase 2 Stage E per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #11 (renamed broader-than-family). Implements ~15 nudge
 * types from the audit nudge table.
 *
 * Architecture: each nudge type is a pure function (household + derived
 * state) -> Nudge | null. The engine collects all firing nudges,
 * filters out dismissed ones (via the dismissal store), and returns
 * the active set. Surfaces (Dashboard, /investments) render the set
 * filtered by route.
 *
 * Q3 design note: nudges are NOT tied to any single section. The same
 * nudge can surface on multiple routes (e.g., marginal-relief warning
 * shows on Dashboard hero AND /tax-planning). The `routes[]` array
 * declares where the nudge is allowed to render.
 */

import type { Household, Investment } from "@/types/household";
import type { DerivedFamilyLayer } from "./derived-records";
import { isInMarginalReliefBand, deriveDeductions, LIMIT_80C, LIMIT_80CCD_1B } from "./tax-deductions";
import { suggestNpsCap } from "./nps-withdrawal";
import { epfVpfOpportunityCostYears } from "./epf-vpf";
import { isEmergencyFundEligible } from "./investment-traits";

export type NudgeSeverity = "info" | "warning" | "alert";

export interface Nudge {
  /** Stable ID for dismissal tracking. */
  id: string;
  /** One-of-N enum identifying the nudge class. */
  kind: NudgeKind;
  severity: NudgeSeverity;
  title: string;
  body: string;
  /** Where this nudge is allowed to render. */
  routes: string[];
  /** Optional CTA link to a specific Preferences anchor or page. */
  ctaTarget?: string;
  ctaLabel?: string;
}

export type NudgeKind =
  | "family-parents-bucket"
  | "sandwich-gen-tax"
  | "ltcg-harvest"
  | "deduction-under-utilization"
  | "international-allocation"
  | "real-estate-overweight"
  | "joint-loan-deduction"
  | "esop-cliff-tax"
  | "foreign-rsu-vesting"
  | "auto-debit-gap"
  | "lifestyle-inflation"
  | "goal-post-shift"
  | "estate-gaps"
  | "healthcare-buffer"
  | "marginal-relief"
  | "glide-path-warning"
  | "nps-cap"
  | "epf-vpf-opportunity-cost"
  | "emergency-fund-shortfall";

export interface NudgeContext {
  household: Household;
  family: DerivedFamilyLayer;
  /** Annual expenses (today's rupees) — used by several nudges. */
  annualExpenses: number;
  /** Pre-deduction taxable income for the current FY. */
  taxableIncome: number;
  /** Current FY (e.g. '2025-26'). */
  fy: string;
  /** Marginal slab rate as decimal for tax-related nudges. */
  marginalSlabRate: number;
  /**
   * Current calendar month (0–11). Passed in (not read from the clock) so the
   * date-gated LTCG-harvest nudge (A16.3) is deterministic + testable.
   */
  currentMonth: number;
  /**
   * Lifestyle-inflation analysis result (A29.2) from `analyzeLifestyleInflation()`.
   * Reads snapshot history (localStorage), so the caller computes it and passes
   * it in to keep this engine pure. Absent/undefined when < 2 snapshots → no fire.
   */
  lifestyleInflation?: { averageYoYGrowth: number; isLifestyleInflating: boolean };
  /**
   * Goal-post-shift analysis result (A30.2) from `detectGoalPostShift()`.
   * Same purity rationale as `lifestyleInflation`.
   */
  goalPostShift?: { shiftCount: number; totalYearsAdded: number };
}

/**
 * Compute all firing nudges for the given context. Returns in priority
 * order (alert > warning > info, then by audit entry number).
 */
export function evaluateNudges(ctx: NudgeContext): Nudge[] {
  const out: Nudge[] = [];

  // 1. Marginal-relief band (audit Entry #13).
  if (isInMarginalReliefBand(ctx.taxableIncome, ctx.fy)) {
    out.push({
      id: "marginal-relief",
      kind: "marginal-relief",
      severity: "warning",
      title: "You're in the rebate-cliff band",
      body: `Your taxable income is in the ₹12L-₹12.75L band where the new-regime rebate is being phased out. A small deduction increase can drop you under ₹12L for a clean tax-free outcome.`,
      routes: ["fire-dashboard", "tax-planning"],
      ctaTarget: "/preferences#tax",
      ctaLabel: "Review deductions",
    });
  }

  // 2. Sandwich-gen tax (audit Entry #11 + Entry #23) — fires when user
  // has dependent parents AND parent-tagged health insurance OR is
  // missing parent-tagged 80D claim.
  const hasParents = ctx.household.members.some((m) =>
    /parent|father|mother/i.test(m.relation ?? "") || /parent|father|mother/i.test(m.name),
  );
  if (hasParents) {
    out.push({
      id: "sandwich-gen-tax",
      kind: "sandwich-gen-tax",
      severity: "info",
      title: "Senior-citizen 80D unlock",
      body: `You have parents in the household — health insurance premium for parents qualifies for an additional ₹25k (₹50k if senior) under 80D, ON TOP of your own ₹25k limit.`,
      routes: ["fire-dashboard", "tax-planning", "insurance"],
      ctaTarget: "/preferences#tax",
    });
  }

  // 3. NPS cap (audit Entry #14) — fires when projected NPS corpus
  // exceeds the sweet spot.
  const npsTotalValue = sumValueByType(ctx.household.investments, "NPS");
  const npsAnnual = sumMonthlyContribution(ctx.household.investments, "NPS") * 12;
  // Project NPS at 9% for 20 years from current corpus + annual SIP.
  const projectedNps = projectCorpus(npsTotalValue, npsAnnual, 0.09, 20);
  const npsCap = suggestNpsCap(projectedNps, ctx.annualExpenses);
  if (npsCap.suggestCap) {
    out.push({
      id: "nps-cap",
      kind: "nps-cap",
      severity: "info",
      title: "Consider capping NPS contributions",
      body: npsCap.reason,
      routes: ["fire-dashboard", "investments-overview", "investments-holdings"],
      ctaTarget: "/preferences#returns",
    });
  }

  // 4. EPF/VPF opportunity cost (audit Entry #15) — fires when high-basic
  // earner's VPF excess yield-loss is small (<3 years to ₹1L gap).
  const epfAnnual = sumMonthlyContribution(ctx.household.investments, "EPF_VPF") * 12;
  if (epfAnnual > 250_000) {
    const excess = epfAnnual - 250_000;
    const years = epfVpfOpportunityCostYears(
      excess,
      ctx.marginalSlabRate,
      0.0825,
      0.12,
    );
    if (years < 5) {
      out.push({
        id: "epf-vpf-opportunity-cost",
        kind: "epf-vpf-opportunity-cost",
        severity: "info",
        title: "VPF excess yield-drag",
        body: `Your VPF contribution exceeds the ₹2.5L tax-free threshold by ₹${Math.round(excess / 1000)}k. After-tax yield gap vs equity sums to ₹1L of foregone returns in about ${years} years. Consider redirecting excess to ELSS or equity MF.`,
        routes: ["fire-dashboard", "investments-overview"],
        ctaTarget: "/preferences#returns",
      });
    }
  }

  // 5. Joint home loan deduction (audit Entry #23) — fires when home
  // loan exists but coBorrowers is empty (potential missed deduction).
  for (const l of ctx.household.liabilities) {
    if (l.type !== "HomeLoan") continue;
    const cobs = l.coBorrowers ?? [];
    if (cobs.length < 2 && ctx.household.members.length > 1) {
      out.push({
        id: `joint-loan-${l.id}`,
        kind: "joint-loan-deduction",
        severity: "info",
        title: "Consider joint home loan deduction",
        body: `Your home loan "${l.name}" has only one borrower on record. If your spouse co-signs, both can independently claim ₹2L Section 24 interest deduction — doubling your tax saving on home loan interest.`,
        routes: ["fire-dashboard", "tax-planning", "liabilities-loans"],
      });
      break; // one nudge per type
    }
  }

  // 6. Estate gaps (audit Entry #35).
  const estate = ctx.household.estateChecklist ?? [];
  const totalEstate = 7; // 7-step checklist
  const completedEstate = estate.filter((e) => e.completed).length;
  if (estate.length > 0 && completedEstate < totalEstate / 2) {
    out.push({
      id: "estate-gaps",
      kind: "estate-gaps",
      severity: "warning",
      title: "Estate planning is under-developed",
      body: `${completedEstate} of ${totalEstate} estate items completed. Will, nominees, and POA are the highest-impact starting points.`,
      routes: ["fire-dashboard"],
      ctaTarget: "/estate-planning",
      ctaLabel: "Complete checklist",
    });
  }

  // 7. International allocation (audit Entry #18) — fires when corpus is
  // significant but no international exposure.
  const totalCorpus = ctx.household.investments.reduce((s, i) => s + i.value, 0);
  const intlValue = sumValueByType(ctx.household.investments, "International");
  if (totalCorpus > 2_000_000 && intlValue === 0) {
    out.push({
      id: "international-allocation",
      kind: "international-allocation",
      severity: "info",
      title: "Add international equity for diversification",
      body: `Your corpus has no international exposure. Research-grounded guidance: 15-25% international allocation reduces correlation with India equity and INR depreciation risk. Routes: FoF (simplest), LRS-Direct, or GIFT City.`,
      routes: ["fire-dashboard", "investments-overview"],
    });
  }

  // 8. Real estate overweight (audit Entry #20) — fires when RE > 60% of corpus.
  const reValue = sumValueByType(ctx.household.investments, "RealEstate");
  if (totalCorpus > 0 && reValue / totalCorpus > 0.6) {
    out.push({
      id: "real-estate-overweight",
      kind: "real-estate-overweight",
      severity: "warning",
      title: "Real estate over-concentrated",
      body: `Real estate is ${Math.round((reValue / totalCorpus) * 100)}% of your corpus. RE is illiquid in FIRE planning — a sale takes months and the price is unpredictable. Consider gradual diversification into equity/REIT for liquidity.`,
      routes: ["fire-dashboard", "investments-overview"],
    });
  }

  // 9. Emergency fund shortfall — < 6 months expenses in liquid.
  const liquid = ctx.household.investments
    .filter(isEmergencyFundEligible)
    .reduce((s, i) => s + i.value, 0);
  const monthsCovered = ctx.annualExpenses > 0 ? (liquid / ctx.annualExpenses) * 12 : Infinity;
  if (ctx.annualExpenses > 0 && monthsCovered < 6) {
    out.push({
      id: "emergency-fund-shortfall",
      kind: "emergency-fund-shortfall",
      severity: "warning",
      title: "Emergency fund below 6 months",
      body: `Liquid emergency fund covers about ${monthsCovered.toFixed(1)} months of expenses. The audit-grounded minimum is 6 months; sandwich-gen households should target 12 months given parents + child obligations.`,
      routes: ["fire-dashboard", "fh-emergency-fund"],
    });
  }

  // 10. Auto-debit gap (audit Entry #28) — fires when any non-automated
  // recurring investment exists.
  const nonAutomated = ctx.household.investments.filter(
    (i) => (i.monthlyContribution ?? 0) > 0 && i.isAutomated === false,
  );
  if (nonAutomated.length > 0) {
    out.push({
      id: "auto-debit-gap",
      kind: "auto-debit-gap",
      severity: "info",
      title: "Automate recurring contributions",
      body: `${nonAutomated.length} of your monthly contributions are not on auto-debit. Behavioral research consistently shows manual SIPs have a 30-40% lower follow-through rate than auto-debited ones.`,
      routes: ["fire-dashboard", "investments-overview"],
    });
  }

  // 11. Healthcare buffer (audit Entry #10) — fires when reservation %
  // is set but no parent-tagged or medical recurring exists yet.
  if (
    (ctx.household.healthcareCorpusReservationPercent ?? 0) > 0 &&
    !ctx.household.expenses.recurring.some((r) => r.inflationBucket === "healthcare")
  ) {
    out.push({
      id: "healthcare-buffer",
      kind: "healthcare-buffer",
      severity: "info",
      title: "Earmark healthcare expenses",
      body: `Your FIRE corpus reserves ${Math.round((ctx.household.healthcareCorpusReservationPercent ?? 0) * 100)}% for healthcare but no recurring expense is tagged with the healthcare inflation bucket. Tag parents' premiums + chronic-care recurring lines so they grow at the 8% healthcare rate, not the 6% general rate.`,
      routes: ["fire-dashboard", "expenses-recurring"],
    });
  }

  // 12. Glide-path warning (audit Entry #7) — fires when glide enabled
  // but current allocation is far from start anchor.
  if (ctx.household.glidePath?.enabled) {
    const equityValue = sumValueByType(ctx.household.investments, "Stocks")
      + sumValueByType(ctx.household.investments, "MutualFunds")
      + sumValueByType(ctx.household.investments, "ESOP")
      + sumValueByType(ctx.household.investments, "International");
    if (totalCorpus > 0) {
      const currentEquityPct = (equityValue / totalCorpus) * 100;
      const expected = ctx.household.glidePath.startEquityPercent;
      if (Math.abs(currentEquityPct - expected) > 15) {
        out.push({
          id: "glide-path-warning",
          kind: "glide-path-warning",
          severity: "warning",
          title: "Allocation drifts from glide path",
          body: `Your current equity allocation is ${currentEquityPct.toFixed(0)}%, but the glide path anchor is ${expected}%. A ${Math.abs(currentEquityPct - expected).toFixed(0)}% drift may trigger sequence-of-returns risk near retirement.`,
          routes: ["fire-dashboard", "investments-overview"],
        });
      }
    }
  }

  // 13. ESOP cliff tax (audit Entry #24) — fires when ESOP value is
  // large enough that a single vest could push user into a higher slab.
  const esopValue = sumValueByType(ctx.household.investments, "ESOP");
  if (esopValue > 1_500_000) {
    out.push({
      id: "esop-cliff-tax",
      kind: "esop-cliff-tax",
      severity: "info",
      title: "ESOP vest creates tax cliff risk",
      body: `Your ESOP holdings (₹${(esopValue / 100000).toFixed(1)}L) are large enough that a single-year vest could spike your effective tax rate. Plan exercises/sales across FYs to smooth slab exposure.`,
      routes: ["fire-dashboard", "investments-holdings"],
    });
  }

  // 14. Family parents-bucket (audit Entry #6) — fires when household has
  // parents but no parent-tagged recurring expense yet.
  if (
    hasParents &&
    !ctx.family.parentsRecurring.length
  ) {
    out.push({
      id: "family-parents-bucket",
      kind: "family-parents-bucket",
      severity: "info",
      title: "Track parent expenses separately",
      body: `Your household has parents but no expense is tagged with kind='parents'. The parents bucket gets healthcare-inflation treatment (8% vs 6% general) — under-counting their cost masks the sandwich-gen reality.`,
      routes: ["fire-dashboard", "expenses-recurring"],
    });
  }

  // 15. Deduction under-utilization (audit Entry #17 A17.2) — fires when 80C
  // and/or 80CCD(1B) headroom is materially unused, for a household with
  // taxable income above the basic exemption (where deductions actually save
  // tax). Body names the specific unused headroom(s). deriveDeductions is pure.
  if (ctx.taxableIncome > 500_000) {
    const ded = deriveDeductions(ctx.household);
    const headroom80C = Math.max(0, LIMIT_80C - ded.section80C);
    const headroom80CCD1B = Math.max(0, LIMIT_80CCD_1B - ded.section80CCD1B);
    const gaps: string[] = [];
    if (headroom80C > 25_000) gaps.push(`₹${Math.round(headroom80C / 1000)}k of your ₹1.5L 80C limit`);
    if (headroom80CCD1B > 10_000)
      gaps.push(`₹${Math.round(headroom80CCD1B / 1000)}k of the ₹50k NPS 80CCD(1B) top-up`);
    // NOTE: 80CCD(2) (employer NPS) is intentionally NOT surfaced here. It is the
    // employer's contribution — not a user-controllable Chapter-VI-A top-up — and we
    // do not yet track it, so keying a nudge off mere personal-NPS holdings would fire
    // an un-actionable suggestion for every NPS holder. Reinstate a precise employer-NPS
    // nudge when the Member.salary employer-NPS field lands (gh-issue #2 findings #1/#2).
    if (gaps.length > 0) {
      out.push({
        id: "deduction-under-utilization",
        kind: "deduction-under-utilization",
        severity: "info",
        title: "You're leaving tax deductions unused",
        body: `Under the old regime these directly cut taxable income — currently unused: ${gaps.join("; ")}. Topping up 80C / NPS before Mar 31 locks in the saving for this FY.`,
        routes: ["fire-dashboard", "tax-planning"],
        ctaTarget: "/preferences#tax",
        ctaLabel: "Review deductions",
      });
    }
  }

  // 16. LTCG harvest (audit Entry #16 A16.3) — date-gated (Jan–Mar, FY Q4)
  // reminder to realise up to ₹1.25L of equity LTCG tax-free before Mar 31,
  // when the household holds a material equity-class position.
  const isFyQ4 = ctx.currentMonth >= 0 && ctx.currentMonth <= 2; // Jan(0)–Mar(2)
  const equityClassValue =
    sumValueByType(ctx.household.investments, "Stocks") +
    sumValueByType(ctx.household.investments, "MutualFunds") +
    sumValueByType(ctx.household.investments, "ESOP") +
    sumValueByType(ctx.household.investments, "International");
  if (isFyQ4 && equityClassValue > 500_000) {
    out.push({
      id: "ltcg-harvest",
      kind: "ltcg-harvest",
      severity: "info",
      title: "Harvest your ₹1.25L LTCG exemption before Mar 31",
      body: `Long-term capital gains on listed equity up to ₹1.25L/yr are tax-free. With the FY closing on Mar 31, consider booking and re-buying eligible holdings to reset your cost base and use the exemption — it does not carry forward.`,
      routes: ["fire-dashboard", "investments-overview", "investments-holdings", "tax-planning"],
      ctaTarget: "/investments/holdings",
      ctaLabel: "Review holdings",
    });
  }

  // 17. Foreign RSU vesting (audit Entry #24 A24.6) — fires when a US-granted
  // ESOP holding exists (grantorCountry captured in P4): Schedule FA disclosure
  // + US estate-tax exposure on US-situs assets over $60k for non-residents.
  const hasForeignEsop = ctx.household.investments.some(
    (i) => i.type === "ESOP" && i.grantorCountry === "US",
  );
  if (hasForeignEsop) {
    out.push({
      id: "foreign-rsu-vesting",
      kind: "foreign-rsu-vesting",
      severity: "warning",
      title: "US RSUs need Schedule FA + estate care",
      body: `You hold US-granted equity. Foreign holdings must be disclosed in Schedule FA of your ITR, and US-situs assets above $60,000 can attract US estate tax for Indian residents. Plan disclosure and estate structuring before they grow.`,
      routes: ["fire-dashboard", "investments-holdings"],
      ctaTarget: "/estate-planning",
      ctaLabel: "Review estate plan",
    });
  }

  // 18. Lifestyle inflation (audit Entry #29 A29.2) — fires when tracked YoY
  // expense growth exceeds blended inflation + 2pp. Driven by real snapshot
  // history passed in via context (skips gracefully when < 2 snapshots).
  if (ctx.lifestyleInflation?.isLifestyleInflating) {
    const pct = Math.round(ctx.lifestyleInflation.averageYoYGrowth * 100);
    out.push({
      id: "lifestyle-inflation",
      kind: "lifestyle-inflation",
      severity: "warning",
      title: "Your spending is outpacing inflation",
      body: `Your tracked expenses are growing about ${pct}%/yr — faster than your blended inflation. Lifestyle creep pushes your FIRE number up every year. Review recurring lines before the gap compounds.`,
      routes: ["fire-dashboard", "expenses-overview"],
      ctaTarget: "/expenses/overview",
      ctaLabel: "Review expenses",
    });
  }

  // 19. Goal-post shift (audit Entry #30 A30.2) — fires when the user has
  // pushed their FIRE target year further out across recent check-ins.
  if (ctx.goalPostShift && ctx.goalPostShift.shiftCount > 0) {
    const yrs = ctx.goalPostShift.totalYearsAdded;
    out.push({
      id: "goal-post-shift",
      kind: "goal-post-shift",
      severity: "warning",
      title: "Your FIRE date keeps moving out",
      body: `You've pushed your FIRE target ${yrs} year${yrs === 1 ? "" : "s"} further out across recent check-ins. Moving the goalpost can quietly mask lifestyle inflation or under-saving — review what changed rather than just resetting the date.`,
      routes: ["fire-dashboard"],
      ctaTarget: "/fire-goals/dashboard",
      ctaLabel: "Review plan",
    });
  }

  // Sort by severity priority: alert > warning > info.
  const severityRank: Record<NudgeSeverity, number> = { alert: 0, warning: 1, info: 2 };
  out.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return out;
}

// ---------- Helpers ----------

function sumValueByType(investments: Investment[], type: Investment["type"]): number {
  return investments.filter((i) => i.type === type).reduce((s, i) => s + i.value, 0);
}

function sumMonthlyContribution(investments: Investment[], type: Investment["type"]): number {
  return investments
    .filter((i) => i.type === type)
    .reduce((s, i) => s + (i.monthlyContribution ?? 0), 0);
}

function projectCorpus(
  startingCorpus: number,
  annualContribution: number,
  rate: number,
  years: number,
): number {
  // FV of starting + FV of an annuity of annualContribution / yr.
  const fvStart = startingCorpus * Math.pow(1 + rate, years);
  const fvAnnuity =
    annualContribution > 0 && rate > 0
      ? annualContribution * ((Math.pow(1 + rate, years) - 1) / rate)
      : annualContribution * years;
  return fvStart + fvAnnuity;
}

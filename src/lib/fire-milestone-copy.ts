// Presentation copy for the Coast/Barista FIRE milestone cards, gated on whether the
// household actually has a FIRE target. Extracted from FireMilestonesCard.vue so the
// gating is unit-testable in the pure-node suite (no DOM).
//
// gh #39 (new-user path): with no FIRE target (zero-data user, fireNumber === 0) the
// real blurbs would assert "at ₹0 your corpus compounds to your full FIRE number — no
// contributions needed", an absurd false positive. When there's no target we must show
// an honest "add your data" prompt instead.

export function coastFireBlurb(hasFireTarget: boolean, coastCorpusFormatted: string): string {
  return hasFireTarget
    ? `Stop-saving point — at ${coastCorpusFormatted}, your existing corpus alone compounds to your full FIRE number by retirement (no additional contributions needed).`
    : "Add your income, expenses and investments to see your Coast FIRE point — the corpus that would coast to your FIRE number with no further saving.";
}

export function baristaFireBlurb(hasFireTarget: boolean, baristaCorpusFormatted: string): string {
  return hasFireTarget
    ? `Part-time alternative — at ${baristaCorpusFormatted}, your corpus + half-time income covers expenses. You stop the full-time grind but keep light income.`
    : "Add your income and expenses to see your Barista FIRE point — the corpus where part-time income would cover the rest.";
}

/**
 * ADR-0007 / gh #185 step 5 — the dashboard hero's SECOND ("expected") headline number.
 *
 * The headline itself always stays the CONSERVATIVE FIRE age (`conservativeFireAge` — the
 * household/pace age already on screen). This helper decides ONLY whether a second, smaller
 * number should be appended, and what it says — never a fresh computation. Both ages come
 * straight from `derive()` via `useFireDerive` (`expectedFireAge`, `expectedFireAgeBasis`);
 * this function performs no math of its own (no re-deriving a hike-adjusted age here).
 *
 * `expectedFireAgeBasis` is ALREADY the kernel's own honesty gate (`derive.ts` — null unless
 * some earner typed a hike% that is genuinely better than the conservative run). So the only
 * extra guard here is `expectedFireAge < conservativeFireAge` — belt-and-braces against ever
 * showing a second number that is not actually earlier (rule 31: a shape lock is not enough).
 *
 * Returns null when no second number should render (extend-only headline, never two identical
 * or two numbers when the kernel didn't earn it).
 */
export function expectedHeadlineCopy(
  conservativeFireAge: number | null,
  expectedFireAge: number | null,
  expectedFireAgeBasis: number | null,
): string | null {
  if (
    conservativeFireAge == null ||
    expectedFireAge == null ||
    expectedFireAgeBasis == null ||
    expectedFireAgeBasis <= 0
  ) {
    return null;
  }
  if (!(expectedFireAge < conservativeFireAge)) return null;
  const hike = Number.isInteger(expectedFireAgeBasis)
    ? String(expectedFireAgeBasis)
    : expectedFireAgeBasis.toFixed(1);
  return `${expectedFireAge} if your ${hike}% hikes continue`;
}

/** The non-removable honesty caveat pinned to the second-number tooltip (#185 step 5). */
export const EXPECTED_HEADLINE_CAVEAT =
  "Headline uses a conservative 2% real growth; the second number uses your own hike %. Assumes continuous employment.";

/**
 * gh #218 round 2 — the hero's feasibility caveat on a prescription above today's pace.
 *
 * Extracted from `FireHero.vue` so the BASIS of the comparison is unit-testable. The defect it
 * fixes: the note compared `requiredMonthlyReal` against `monthlyTakeHome`, and after #218
 * take-home became CASH (PF removed) while the prescription is still solved against a ceiling
 * that ADDS PF BACK (PF is investment, not spending) and is compared with a PF-INCLUSIVE
 * `currentMonthlyReal`. Mixing the two bases made an affordable amount read "that is more than
 * you take home" for anything in the PF-wide band — up to ~₹35,000/month on the Sharmas.
 *
 * The fix is to compare against `feasibleMonthlyCeilingReal`, the solver's OWN `hi`
 * (`required-contribution.ts`), so the prescription and the affordability verdict share one basis.
 * The "left to live on" figure still quotes CASH, because that is what a user actually spends —
 * only the over-the-line TEST uses the ceiling.
 *
 * Both notes stay CONSERVATIVE: the solver holds today's expenses fixed, so cutting spending to
 * fund the amount would also lower the FIRE number, which this figure does not credit.
 */
export function feasibilityNoteCopy(input: {
  /** ₹/month, today's money — the prescription being shown. */
  requiredMonthlyReal: number;
  /** ₹/month — the solver's own investable ceiling (`feasibleMonthlyCeilingReal`). */
  feasibleMonthlyCeilingReal: number;
  /** ₹/month — the CASH take-home, net of PF and professional tax. */
  monthlyTakeHome: number;
  /** True only when the prescription exceeds today's pace; else there is nothing to caveat. */
  mustInvestMore: boolean;
  formatCurrency: (amount: number) => string;
}): string | null {
  const { requiredMonthlyReal, feasibleMonthlyCeilingReal, monthlyTakeHome, mustInvestMore } = input;
  if (!mustInvestMore) return null;
  if (!Number.isFinite(requiredMonthlyReal)) {
    return "That is more than you take home each month — see the moves below, or retire a little later.";
  }
  if (!Number.isFinite(monthlyTakeHome) || monthlyTakeHome <= 0) return null;
  // OVER THE LINE is judged on the solver's ceiling, never on cash alone.
  const ceiling = Number.isFinite(feasibleMonthlyCeilingReal) ? feasibleMonthlyCeilingReal : 0;
  if (requiredMonthlyReal > ceiling) {
    return "That is more than you take home each month — see the moves below, or retire a little later.";
  }
  // Inside the ceiling: what is left to LIVE on is a cash question, so it is quoted off cash. It
  // can be negative for an amount funded partly out of PF — a real, honest squeeze, not an error.
  const left = monthlyTakeHome - requiredMonthlyReal;
  if (left < 0) {
    return `That is within reach, but it would take ${input.formatCurrency(-left)}/month more than your bank credit — some of it is already going to PF. Spending less also lowers the number above, which this figure does not yet credit you for.`;
  }
  return `That would leave ${input.formatCurrency(left)}/month to live on — spending less also lowers the number above, which this figure does not yet credit you for.`;
}

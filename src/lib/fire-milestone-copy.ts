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

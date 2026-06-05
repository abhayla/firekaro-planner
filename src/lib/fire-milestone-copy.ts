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

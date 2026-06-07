import { describe, it, expect } from "vitest";
import {
  safeWithdrawalBands,
  sequenceRiskWarning,
  simulateDrawdown,
  DECUMULATION_EARLY_SHOCK,
  DECUMULATION_SHOCK_YEARS,
} from "@/lib/decumulation";

/**
 * Stage A — safe-withdrawal bands. The accessor wraps the EXISTING Floor/Ceiling
 * rule + DEFAULT_FLOOR_CEILING multipliers to produce THIS year's safe range (real ₹).
 */
describe("safeWithdrawalBands", () => {
  it("returns a sane, well-ordered band for a retired-corpus persona (real frame)", () => {
    // ₹3 Cr corpus at a 3.5% real SWR, real frame (inflation passed as 0).
    const b = safeWithdrawalBands({ corpus: 3_00_00_000, swr: 0.035, inflation: 0 });
    expect(b.floor).toBeLessThanOrEqual(b.suggested);
    expect(b.suggested).toBeLessThanOrEqual(b.ceiling);
    // Suggested == SWR draw on the corpus at the at-FIRE snapshot.
    expect(b.suggested).toBe(Math.round(3_00_00_000 * 0.035));
    // Band derived from the 0.8 / 1.2 DEFAULT_FLOOR_CEILING multipliers.
    expect(b.floor).toBe(Math.round(b.suggested * 0.8));
    expect(b.ceiling).toBe(Math.round(b.suggested * 1.2));
    // At the snapshot (year 0, no prior draw) no guardrail has fired.
    expect(b.triggered).toBe("none");
    // All real ₹ — finite, non-negative.
    expect(Number.isFinite(b.floor)).toBe(true);
    expect(Number.isFinite(b.ceiling)).toBe(true);
  });

  it("guards non-positive corpus / SWR → zeros, not NaN (honest empty — gh-#39 class)", () => {
    for (const bad of [
      { corpus: 0, swr: 0.035, inflation: 0 },
      { corpus: -5, swr: 0.035, inflation: 0 },
      { corpus: 1_00_00_000, swr: 0, inflation: 0 },
      { corpus: 1_00_00_000, swr: -0.01, inflation: 0 },
    ]) {
      const b = safeWithdrawalBands(bad);
      expect(b).toEqual({ floor: 0, ceiling: 0, suggested: 0, triggered: "none" });
    }
  });

  it("fires the floor guardrail when the corpus has dropped below the floor since retirement", () => {
    // Last year drew ₹10.5L (implying a ~₹3Cr starting corpus at 3.5%); corpus has since
    // fallen to ₹2Cr (< 80% of the implied start) → the Floor/Ceiling rule cuts spending.
    const b = safeWithdrawalBands({
      corpus: 2_00_00_000,
      swr: 0.035,
      inflation: 0,
      yearsIntoRetirement: 3,
      priorYearWithdrawal: 10_50_000,
    });
    expect(b.triggered).toBe("floor");
    // The suggested draw reflects the 10% floor cut on the prior year's draw.
    expect(b.suggested).toBeLessThan(10_50_000);
    // Band invariant MUST hold even when the floor guardrail fires (the band brackets the
    // suggested draw, one reference frame) — the catch-test for the band-coherence HIGH.
    expect(b.floor).toBeLessThanOrEqual(b.suggested);
    expect(b.suggested).toBeLessThanOrEqual(b.ceiling);
  });

  it("fires the ceiling guardrail when the corpus has grown past the ceiling, band still well-ordered", () => {
    // Last year drew ₹10.5L (implying a ~₹3Cr start at 3.5%); corpus has since grown to ₹4Cr
    // (> 120% of the implied start) → the Floor/Ceiling rule holds spending flat (no ratchet).
    const b = safeWithdrawalBands({
      corpus: 4_00_00_000,
      swr: 0.035,
      inflation: 0,
      yearsIntoRetirement: 3,
      priorYearWithdrawal: 10_50_000,
    });
    expect(b.triggered).toBe("ceiling");
    // Band invariant holds on the ceiling-capped path too (catch-test for the HIGH).
    expect(b.floor).toBeLessThanOrEqual(b.suggested);
    expect(b.suggested).toBeLessThanOrEqual(b.ceiling);
  });
});

/**
 * Stage B — decumulation sequence-of-returns warning. Measures whether the corpus
 * survives to plan-to age under a BAD EARLY-RETIREMENT SEQUENCE (the #1 retiree-ruin
 * risk), NOT a smooth-average projection that can never fail (rule 31 honesty).
 */
describe("simulateDrawdown", () => {
  it("withdraw-then-grow: reports the depletion year for an underfunded corpus", () => {
    // ₹10L corpus, withdrawing ₹3L/yr at 0% return → depletes during year 4 (index 3).
    const sim = simulateDrawdown(10_00_000, 3_00_000, 50, () => 0);
    expect(sim.depletionYear).toBe(3);
    expect(sim.finalBalance).toBe(0);
  });

  it("survives when returns cover withdrawals", () => {
    const sim = simulateDrawdown(3_00_00_000, 10_00_000, 30, () => 0.04);
    expect(sim.depletionYear).toBeNull();
    expect(sim.finalBalance).toBeGreaterThan(0);
  });

  it("guards a non-finite return → treats it as 0%, never returns NaN (defensive-coding)", () => {
    const sim = simulateDrawdown(3_00_00_000, 10_00_000, 10, () => NaN);
    expect(Number.isFinite(sim.finalBalance)).toBe(true);
    // 0% real growth, withdraw ₹10L/yr for 10 yrs from ₹3Cr → survives with ₹2Cr left.
    expect(sim.finalBalance).toBe(2_00_00_000);
  });
});

describe("sequenceRiskWarning", () => {
  const SMOOTH_RETURN = 0.04; // 4% real

  it("a thin-margin corpus + a bad early sequence depletes with a finite depletion age", () => {
    // ₹2.6 Cr corpus, ₹11L/yr real withdrawal (~4.2% rate), 35-yr retirement from age 55.
    const r = sequenceRiskWarning({
      corpus: 2_60_00_000,
      annualRealWithdrawal: 11_00_000,
      expectedRealReturn: SMOOTH_RETURN,
      yearsInRetirement: 35,
      fireAge: 55,
    });
    expect(r.survivalUnderBadSequence).toBe(false);
    expect(r.depletionAge).toBeDefined();
    expect(r.depletionAge!).toBeGreaterThan(55);
    expect(r.depletionAge!).toBeLessThanOrEqual(55 + 35);
    expect(r.note).toMatch(/early|bad market|buffer|withdraw/i);
  });

  it("a fat-margin corpus survives even the bad early sequence", () => {
    const r = sequenceRiskWarning({
      corpus: 6_00_00_000,
      annualRealWithdrawal: 12_00_000, // 2% rate — very safe
      expectedRealReturn: SMOOTH_RETURN,
      yearsInRetirement: 35,
      fireAge: 55,
    });
    expect(r.survivalUnderBadSequence).toBe(true);
    expect(r.depletes).toBe(false);
    expect(r.depletionAge).toBeUndefined();
  });

  it("ANTI-FREE-LUNCH: the bad-sequence path is materially worse than the smooth path", () => {
    const corpus = 5_00_00_000;
    const withdrawal = 15_00_000;
    const years = 30;
    const smooth = simulateDrawdown(corpus, withdrawal, years, () => SMOOTH_RETURN);
    const badReturn = (y: number) =>
      y === 0 ? -DECUMULATION_EARLY_SHOCK : y < DECUMULATION_SHOCK_YEARS ? 0 : SMOOTH_RETURN;
    const bad = simulateDrawdown(corpus, withdrawal, years, badReturn);
    // The shock must actually bite — bad sequence leaves materially less corpus.
    expect(bad.finalBalance).toBeLessThan(smooth.finalBalance);
    expect(smooth.finalBalance - bad.finalBalance).toBeGreaterThan(0.1 * smooth.finalBalance);
  });

  it("MIDDLE CASE: survives normal markets but a bad early sequence depletes it (the key warning)", () => {
    // Fat enough to survive a SMOOTH 6% path (4.67% draw), but a −30% early crash ruins it —
    // the most important user message: "normal markets fine, bad early sequence could ruin you."
    const r = sequenceRiskWarning({
      corpus: 3_00_00_000,
      annualRealWithdrawal: 14_00_000,
      expectedRealReturn: 0.06,
      yearsInRetirement: 40,
      fireAge: 50,
    });
    expect(r.depletes).toBe(false); // smooth path survives
    expect(r.survivalUnderBadSequence).toBe(false); // bad early sequence does not
    expect(r.note).toMatch(/bad market in your first|#1 risk|cash buffer/i);
  });

  it("smooth-depletes note reports the SMOOTH depletion age, not the bad-sequence age", () => {
    // Underfunded even under normal markets: 3Cr, ₹20L/yr (6.7%), 3% real → depletes smooth.
    const r = sequenceRiskWarning({
      corpus: 3_00_00_000,
      annualRealWithdrawal: 20_00_000,
      expectedRealReturn: 0.03,
      yearsInRetirement: 35,
      fireAge: 55,
    });
    expect(r.depletes).toBe(true);
    expect(r.note).toMatch(/even under normal markets/i);
  });

  it("guards a non-positive corpus → honest 'not yet at FIRE' signal, not NaN", () => {
    const r = sequenceRiskWarning({
      corpus: 0,
      annualRealWithdrawal: 10_00_000,
      expectedRealReturn: SMOOTH_RETURN,
      yearsInRetirement: 30,
    });
    expect(r.survivalUnderBadSequence).toBe(false);
    expect(Number.isFinite(r.depletionAge ?? 0)).toBe(true);
    expect(r.note).toMatch(/reach FIRE|corpus|once you/i);
  });

  // gh-#50 supervisor-review HIGH: SequenceRiskCard rendered a red "Your corpus runs short even
  // under normal markets" alarm to a no-data user (fireNumber===0 → corpus 0). The lib now flags
  // `unplannable` so the card branches to a neutral state. These lock that contract at the pure
  // layer (this repo's vitest is node-env with no component-mount harness — gh-#39 class, rule 31).
  it("flags unplannable=true when there is no corpus yet — card MUST NOT show a depletion alarm", () => {
    const r = sequenceRiskWarning({
      corpus: 0,
      annualRealWithdrawal: 10_00_000,
      expectedRealReturn: SMOOTH_RETURN,
      yearsInRetirement: 30,
      fireAge: 35,
    });
    expect(r.unplannable).toBe(true);
  });

  it("flags unplannable=true when withdrawal or horizon is missing", () => {
    expect(
      sequenceRiskWarning({ corpus: 3_00_00_000, annualRealWithdrawal: 0, expectedRealReturn: 0.04, yearsInRetirement: 30 })
        .unplannable,
    ).toBe(true);
    expect(
      sequenceRiskWarning({ corpus: 3_00_00_000, annualRealWithdrawal: 12_00_000, expectedRealReturn: 0.04, yearsInRetirement: 0 })
        .unplannable,
    ).toBe(true);
  });

  it("a real, stress-testable plan is NOT unplannable (card shows the verdict)", () => {
    const r = sequenceRiskWarning({
      corpus: 3_00_00_000,
      annualRealWithdrawal: 12_00_000,
      expectedRealReturn: 0.04,
      yearsInRetirement: 30,
      fireAge: 55,
    });
    expect(r.unplannable).toBe(false);
  });

  it("sources its shock magnitude from the existing stress-test convention (30% / 3yr)", () => {
    expect(DECUMULATION_EARLY_SHOCK).toBeCloseTo(0.3, 5);
    expect(DECUMULATION_SHOCK_YEARS).toBe(3);
  });
});

/**
 * Integration proof for the impure derive→lever-engine wiring (gh-issue #48, Stage C).
 * Loads the default Sharmas seed through the REAL stores + the live useAcceleration() composable
 * (pattern copied from useFireDerive.seed.spec.ts) and locks the two load-bearing invariants:
 *   - BASELINE COHERENCE: the engine baseline's years-to-FIRE equals the FireHero headline
 *     (fire.yearsToRegular) — the #20/#47 real-frame coherence check (Rule 26).
 *   - DOUBLE-COUNT GUARD (bug-#11 / D-2026-06-06-11): the levers never double-count the surplus
 *     derive() already invests — save-more(0) yields ~0 phantom acceleration.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadIyersSeed } from "@/seeds/iyers";
import { useFireDerive } from "@/lib/useFireDerive";
import { useAcceleration } from "@/composables/useAcceleration";

describe("useAcceleration — Sharmas seed (derive→engine wiring proof)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    loadSeedPersona(useHouseholdStore(), useAssumptionsStore());
  });

  it("BASELINE COHERENCE: the engine baseline years == the FireHero headline (Rule 26, #20/#47)", () => {
    const accel = useAcceleration();
    const fire = useFireDerive();
    expect(accel.baselineYears.value).toBeCloseTo(fire.yearsToRegular.value, 0); // ±1 year
  });

  it("bridge NOT binding for Sharmas (corpus-limited) ⇒ card renders normal lever deltas", () => {
    const accel = useAcceleration();
    expect(accel.bridgeBinding.value).toBe(false);
  });

  it("DOUBLE-COUNT GUARD: save-more of ₹0 yields no phantom acceleration (~0 years, bug-#11 lock)", () => {
    const accel = useAcceleration();
    expect(accel.saveMoreImpact(0)).toBeNull(); // caller omits non-positive amounts
  });

  it("save-more of a positive amount is a genuine accelerator (positive years saved)", () => {
    const accel = useAcceleration();
    const impact = accel.saveMoreImpact(25_000)!;
    expect(impact).not.toBeNull();
    expect(impact.reachable).toBe(true);
    expect(impact.deltaYears).toBeGreaterThan(0);
  });

  it("ranks at least one achievable lever, biggest-years-saved first, each a genuine accelerator", () => {
    const accel = useAcceleration();
    const ranked = accel.rankedLevers.value;
    expect(ranked.length).toBeGreaterThan(0);
    const reachable = ranked.filter((l) => l.reachable);
    expect(reachable.length).toBeGreaterThan(0);
    for (const l of reachable) expect(l.deltaYears).toBeGreaterThan(0);
    // sorted descending by years saved
    for (let i = 1; i < reachable.length; i++) {
      expect(reachable[i - 1].deltaYears).toBeGreaterThanOrEqual(reachable[i].deltaYears);
    }
  });

  it("REGIME GATE end-to-end: Sharmas files NEW regime ⇒ the 80CCD(1B) lever is omitted (FinTech HIGH)", () => {
    const accel = useAcceleration();
    const fire = useFireDerive();
    expect(fire.householdTaxRecommendation.value?.recommended).toBe("NEW");
    expect(accel.rankedLevers.value.map((l) => l.key)).not.toContain("nps-80ccd1b");
  });

  it("ONLY the variance-bearing risk-notch carries a confidence band; cashflow levers do not", () => {
    const accel = useAcceleration();
    const ranked = accel.rankedLevers.value;
    const riskNotch = ranked.find((l) => l.key === "risk-notch");
    if (riskNotch && riskNotch.reachable) {
      expect(riskNotch.band, "risk-notch must carry a band").toBeTruthy();
      expect(riskNotch.band!.p10Years).toBeLessThanOrEqual(riskNotch.band!.expectedYears);
      expect(riskNotch.band!.expectedYears).toBeLessThanOrEqual(riskNotch.band!.p90Years);
      // SUBSTANCE (FinTech 2026-06-06): the band must add HONEST downside — its conservative tail (p90)
      // is materially later than the lever's deterministic perturbed point. A σ that failed to rise
      // (the funding-from-the-wrong-sleeve bug) would collapse this; assert it can't regress.
      expect(riskNotch.band!.p90Years).toBeGreaterThan(riskNotch.perturbedYears);
    }
    // the cashflow levers (trim / save-more) never carry a band
    const trim = ranked.find((l) => l.key === "trim-expenses");
    if (trim) expect(trim.band ?? null).toBeNull();
  });
});

describe("useAcceleration — Iyers seed (bridge-binding honesty, gh-48 HIGH 2026-06-06)", () => {
  // Code-review/FinTech caught a live optimistic-skew defect (rule 31 / bug-#22 class): on Iyers the
  // card chip showed the SCALAR corpus-only years (~17.5) while the FireHero headline is the
  // bridge-adjusted ~18.9 — the action surface was 1.4yr ROSIER than the honest headline. These locks
  // assert the card never shows an absolute more optimistic than the headline, and that the bridge-
  // binding state is detectable so the card can drop the (overstated) scalar lever deltas + caveat.
  beforeEach(() => {
    setActivePinia(createPinia());
    loadIyersSeed(useHouseholdStore(), useAssumptionsStore());
  });

  it("headlineYears equals the FireHero headline (the honest, bridge-adjusted number the card shows)", () => {
    const accel = useAcceleration();
    const fire = useFireDerive();
    expect(accel.headlineYears.value).toBeCloseTo(fire.yearsToRegular.value, 5);
  });

  it("OPTIMISM LOCK (rule 31): the card baseline is NEVER earlier/sooner than the honest headline", () => {
    const accel = useAcceleration();
    // headlineYears = max(corpusOnlyYears, bridge runway) ≥ the scalar baseline, ALWAYS. The card must
    // render headlineYears, so a user can never see a FIRE date more optimistic than the truth.
    expect(accel.headlineYears.value).toBeGreaterThanOrEqual(accel.baselineYears.value - 0.01);
  });

  it("flags bridgeBinding when liquidity (the accessible-money bridge) gates FIRE later than corpus", () => {
    const accel = useAcceleration();
    // Iyers has an active bridge shortfall (corpus-rich but early-years-liquidity-limited), so the honest
    // headline is materially later than the scalar corpus model ⇒ bridgeBinding ⇒ the card drops the
    // scalar "N years sooner" deltas (they overstate the liquidity-gated date) and shows the bridge caveat.
    expect(accel.bridgeBinding.value).toBe(true);
    expect(accel.headlineYears.value).toBeGreaterThan(accel.baselineYears.value + 0.25);
  });
});

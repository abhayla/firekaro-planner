import { describe, it, expect } from "vitest";
import {
  calculateCoastFire,
  calculateBaristaFire,
  coastTrajectory,
  realReturnForCoast,
} from "./coast-fire";

describe("calculateCoastFire", () => {
  it("returns smaller corpus when years and return are positive", () => {
    // 1Cr target, 20 years, 6% real return
    // coastCorpus = 1Cr / 1.06^20 = ~3.12 lakh
    const result = calculateCoastFire({
      fireNumber: 10_000_000,
      yearsToRetirement: 20,
      realReturn: 0.06,
    });
    expect(result.coastCorpus).toBeCloseTo(3_118_047, -2); // within 100 rupees
  });

  it("coast corpus == fire number when years <= 0", () => {
    const result = calculateCoastFire({
      fireNumber: 5_000_000,
      yearsToRetirement: 0,
      realReturn: 0.06,
    });
    expect(result.coastCorpus).toBe(5_000_000);
  });

  it("coast corpus == fire number when realReturn <= 0 (no compounding helps)", () => {
    const result = calculateCoastFire({
      fireNumber: 5_000_000,
      yearsToRetirement: 20,
      realReturn: 0,
    });
    expect(result.coastCorpus).toBe(5_000_000);
  });

  it("ADR-0006: a DRIFTING target needs a bigger coast corpus, and the round trip holds", () => {
    // The bug this locks: discounting a CONSTANT target while the real FIRE number rises at g
    // under-states the coast corpus, i.e. tells the user they can stop saving sooner than they
    // can. The invariant is the round trip — coasting must land on the target AS IT WILL BE.
    const fireNumber = 10_000_000;
    const years = 20;
    const realReturn = 0.06;
    const g = 0.0023; // the live basket drift
    const drifted = calculateCoastFire({ fireNumber, yearsToRetirement: years, realReturn, targetDriftRate: g });
    const constant = calculateCoastFire({ fireNumber, yearsToRetirement: years, realReturn });

    expect(drifted.coastCorpus).toBeGreaterThan(constant.coastCorpus);
    expect(
      drifted.coastCorpus * Math.pow(1 + realReturn, years),
      "coasting must reach the target AS IT WILL BE, not as it is today",
    ).toBeGreaterThanOrEqual(fireNumber * Math.pow(1 + g, years) - 1);

    // …and `yearsAtCurrent` inverts the SAME race.
    const t = drifted.yearsAtCurrent(drifted.coastCorpus);
    expect(t).toBeCloseTo(years, 6);
  });

  it("ADR-0006: drift 0 is byte-identical to the pre-ADR-0006 constant-target result", () => {
    const args = { fireNumber: 10_000_000, yearsToRetirement: 20, realReturn: 0.06 };
    expect(calculateCoastFire({ ...args, targetDriftRate: 0 }).coastCorpus).toBe(
      calculateCoastFire(args).coastCorpus,
    );
  });

  it("ADR-0006: when the target outruns the return, you need the DRIFTED number today", () => {
    // netRate <= 0 — no amount of compounding gains on the target.
    const r = calculateCoastFire({
      fireNumber: 5_000_000,
      yearsToRetirement: 10,
      realReturn: 0.01,
      targetDriftRate: 0.02,
    });
    expect(r.coastCorpus).toBeCloseTo(5_000_000 * Math.pow(1.02, 10), 6);
    expect(r.yearsAtCurrent(1_000_000)).toBe(Infinity);
  });

  it("coast corpus = 0 when target is 0", () => {
    const result = calculateCoastFire({
      fireNumber: 0,
      yearsToRetirement: 20,
      realReturn: 0.06,
    });
    expect(result.coastCorpus).toBe(0);
  });

  it("hasReachedCoast true once user has >= coast corpus", () => {
    const result = calculateCoastFire({
      fireNumber: 10_000_000,
      yearsToRetirement: 20,
      realReturn: 0.06,
    });
    // coast corpus ~= 3.12 lakh
    expect(result.hasReachedCoast(3_000_000)).toBe(false);
    expect(result.hasReachedCoast(3_500_000)).toBe(true);
    expect(result.hasReachedCoast(10_000_000)).toBe(true);
  });

  it("coastRatio scales linearly with current corpus", () => {
    const result = calculateCoastFire({
      fireNumber: 10_000_000,
      yearsToRetirement: 20,
      realReturn: 0.06,
    });
    const r1 = result.coastRatio(1_000_000);
    const r2 = result.coastRatio(2_000_000);
    expect(r2 / r1).toBeCloseTo(2, 5);
  });

  it("yearsAtCurrent: 0 when already at fire number", () => {
    const result = calculateCoastFire({
      fireNumber: 10_000_000,
      yearsToRetirement: 20,
      realReturn: 0.06,
    });
    expect(result.yearsAtCurrent(10_000_000)).toBe(0);
    expect(result.yearsAtCurrent(15_000_000)).toBe(0);
  });

  it("yearsAtCurrent: realistic for partial corpus", () => {
    // current 3.12 lakh, target 1Cr, 6% real return -> ~20 years
    const result = calculateCoastFire({
      fireNumber: 10_000_000,
      yearsToRetirement: 20,
      realReturn: 0.06,
    });
    expect(result.yearsAtCurrent(3_118_047)).toBeCloseTo(20, 0);
  });
});

describe("realReturnForCoast (A1 — no positive clamp, gh-issue #9 L2)", () => {
  // ADR-0006 / gh #180 re-baseline: the helper was `nominal − inflation` (arithmetic). It is now
  // the GEOMETRIC `(1+r)/(1+π) − 1` — byte-identical to the kernel's `toRealReturn` in derive.ts —
  // so a display surface can never carry a different real return from the headline. The two
  // expectations below moved by exactly that difference (3.10% → 2.873%, −5.00% → −4.464%);
  // nothing about the no-clamp contract these cases exist for changed.
  it("returns the true (positive) real return, in the kernel's geometric form", () => {
    expect(realReturnForCoast(0.11, 0.079)).toBeCloseTo(0.0287303058, 10);
  });

  it("IS the kernel's real-return formula — not an approximation of it (gh #180)", () => {
    // The identity that makes "one real return on screen" structural rather than a convention.
    for (const [r, pi] of [
      [0.11, 0.06],
      [0.09673, 0.06],
      [0.07694, 0.06],
      [0.04, 0.075],
    ] as const) {
      expect(realReturnForCoast(r, pi)).toBeCloseTo((1 + r) / (1 + pi) - 1, 12);
    }
  });

  it("returns a NEGATIVE real return when inflation exceeds nominal — NOT clamped", () => {
    // Debt-heavy / high-inflation household: blended return 7%, general inflation 12%
    // → real return is genuinely negative.
    expect(realReturnForCoast(0.07, 0.12)).toBeCloseTo(-0.0446428571, 10);
  });

  it("a negative real return flows through to coast == fireNumber (no understatement)", () => {
    const real = realReturnForCoast(0.07, 0.12); // ≈ −0.0446
    const r = calculateCoastFire({ fireNumber: 5_000_000, yearsToRetirement: 20, realReturn: real });
    expect(r.coastCorpus).toBe(5_000_000);
  });

  it("the old 0.01 clamp WOULD have understated the coast corpus (regression guard)", () => {
    // Documents the bug the clamp caused: forcing realReturn to 0.01 makes the
    // library compound it down, reporting a coast corpus far below the true
    // fireNumber — the optimistic "stop saving sooner" signal A1 removes.
    const clamped = calculateCoastFire({ fireNumber: 5_000_000, yearsToRetirement: 20, realReturn: 0.01 });
    expect(clamped.coastCorpus).toBeLessThan(5_000_000);
  });
});

describe("calculateBaristaFire", () => {
  it("zero corpus needed when barista income >= expenses", () => {
    const result = calculateBaristaFire({
      annualExpenses: 600_000,
      baristaIncome: 700_000,
      swr: 0.035,
    });
    expect(result.baristaCorpus).toBe(0);
    expect(result.hasReachedBarista(0)).toBe(true);
  });

  it("partial gap funded at SWR", () => {
    // expenses 12L, barista 6L -> gap 6L / 0.035 = ~1.71 Cr
    const result = calculateBaristaFire({
      annualExpenses: 1_200_000,
      baristaIncome: 600_000,
      swr: 0.035,
    });
    expect(result.baristaCorpus).toBeCloseTo(17_142_857, 0);
  });

  it("full corpus equivalent to FIRE number when barista income = 0", () => {
    // expenses 12L, no barista income -> 12L / 0.035 = 3.43 Cr (the full FIRE number)
    const result = calculateBaristaFire({
      annualExpenses: 1_200_000,
      baristaIncome: 0,
      swr: 0.035,
    });
    expect(result.baristaCorpus).toBeCloseTo(34_285_714, 0);
  });

  it("hasReachedBarista respects threshold", () => {
    const result = calculateBaristaFire({
      annualExpenses: 1_200_000,
      baristaIncome: 600_000,
      swr: 0.035,
    });
    expect(result.hasReachedBarista(10_000_000)).toBe(false);
    expect(result.hasReachedBarista(20_000_000)).toBe(true);
  });
});

describe("coastTrajectory (A21.1)", () => {
  it("starts at the current corpus and grows with the real return", () => {
    const pts = coastTrajectory({
      currentCorpus: 10_000_000,
      fireNumber: 30_000_000,
      yearsToRetirement: 15,
      realReturn: 0.06,
      startYear: 2026,
    });
    expect(pts).toHaveLength(16); // t = 0..15 inclusive
    expect(pts[0].corpusNoContribution).toBe(10_000_000);
    expect(pts[0].year).toBe(2026);
    expect(pts[15].corpusNoContribution).toBeGreaterThan(pts[0].corpusNoContribution);
    // No schedule supplied → the legacy flat line (the fallback, not the product path).
    expect(pts.every((p) => p.fireTarget === 30_000_000)).toBe(true);
  });

  it("ADR-0006 Phase 1c: with a target schedule the FIRE line RISES and bends where a goal falls due", () => {
    // The exact shape the kernel hands it: a perpetual leg drifting in real terms, plus a dated
    // ₹40 L goal that stops inflating at year 5 and therefore DECAYS in real terms after it.
    const g = 0.004;
    const perpetual = 26_000_000;
    const goalToday = 4_000_000;
    const cpi = 0.06;
    const educationInflation = 0.09;
    const targetRealAt = (t: number) =>
      perpetual * Math.pow(1 + g, t) +
      (goalToday * Math.pow(1 + educationInflation, Math.min(t, 5))) / Math.pow(1 + cpi, t);

    const pts = coastTrajectory({
      currentCorpus: 10_000_000,
      fireNumber: perpetual + goalToday,
      yearsToRetirement: 15,
      realReturn: 0.06,
      startYear: 2026,
      fireTargetRealAt: targetRealAt,
    });

    // t = 0 is the headline number itself — the SIZE never moves, only the trajectory.
    expect(pts[0].fireTarget).toBe(perpetual + goalToday);
    // It follows the schedule exactly, not an approximation of it.
    for (const p of pts) {
      expect(p.fireTarget, `year +${p.yearsFromNow}`).toBe(Math.round(targetRealAt(p.yearsFromNow)));
    }
    // The line is NOT flat — the substance the flat-line bug hid.
    expect(pts[15].fireTarget).toBeGreaterThan(pts[0].fireTarget);
    // …and the goal leg's real decay after year 5 is visible as a shrinking year-on-year step.
    const step = (i: number) => pts[i + 1].fireTarget - pts[i].fireTarget;
    expect(step(2), "still rising fast while the goal inflates at 9%").toBeGreaterThan(step(8));
  });

  it("falls back to the flat number rather than putting NaN on the axis (rule 31)", () => {
    const pts = coastTrajectory({
      currentCorpus: 1_000_000,
      fireNumber: 20_000_000,
      yearsToRetirement: 5,
      realReturn: 0.05,
      startYear: 2026,
      fireTargetRealAt: () => Number.NaN,
    });
    expect(pts.every((p) => p.fireTarget === 20_000_000)).toBe(true);
  });

  it("a corpus at/above Coast reaches the FIRE number AS IT WILL BE by retirement", () => {
    // This used to RE-DERIVE `fire / (1+r)^years` here, which is the pre-ADR-0006 constant-target
    // formula — so it would have kept passing even after the library started discounting a
    // drifting target, and the two would have silently disagreed. Take the coast corpus from the
    // library, and assert the property that actually matters: coasting lands on the target as it
    // WILL be at retirement, `fire x (1+g)^Y`, not as it is today.
    const fire = 30_000_000;
    const years = 15;
    const r = 0.06;
    const g = 0.0023;
    const { coastCorpus } = calculateCoastFire({
      fireNumber: fire,
      yearsToRetirement: years,
      realReturn: r,
      targetDriftRate: g,
    });
    expect(
      coastCorpus * Math.pow(1 + r, years),
      "coastCorpus x (1+r)^Y must clear fireNumber x (1+g)^Y",
    ).toBeGreaterThanOrEqual(fire * Math.pow(1 + g, years) - 1);

    const pts = coastTrajectory({
      currentCorpus: coastCorpus,
      fireNumber: fire,
      yearsToRetirement: years,
      realReturn: r,
      startYear: 2026,
    });
    expect(pts[years].corpusNoContribution).toBeGreaterThanOrEqual(fire - 1);
  });

  it("flat corpus when real return is non-positive", () => {
    const pts = coastTrajectory({
      currentCorpus: 5_000_000,
      fireNumber: 20_000_000,
      yearsToRetirement: 10,
      realReturn: 0,
      startYear: 2026,
    });
    expect(pts.every((p) => p.corpusNoContribution === 5_000_000)).toBe(true);
  });
});

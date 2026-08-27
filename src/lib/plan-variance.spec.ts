/**
 * #138 — Plan-vs-actual variance. The honesty core: NEVER sell an assumption change as
 * "progress". The delta is DECOMPOSED into:
 *   - progress  (your corpus / net worth actually grew),
 *   - reality   (your actual expenses changed → the target moved),
 *   - goalpost  (you changed an assumption — SWR/return/inflation/variant → a re-DEFINITION,
 *               not slippage; the card must say "assumptions changed", not "you fell behind").
 * Plus rupee deltas are CPI-REBASED (a flat nominal net worth over time is a REAL decline).
 *
 * The decomposition uses counterfactual `derive()` calls on the CURRENT household: deriving it
 * under the BASELINE assumptions isolates the assumption (goalpost) effect on the FIRE target from
 * the expense (reality) effect; net-worth growth is the progress signal. Net worth is
 * assumption-invariant, so an assumption-only change leaves progress EXACTLY zero.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";
import {
  computePlanVariance,
  captureBaselineFrom,
  isBaselineFrameCurrent,
  FRAME_VERSION,
  type PlanBaseline,
} from "@/lib/plan-variance";
import type { Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
const NOW = Date.UTC(2026, 5, 10); // fixed wall clock for the spec (no live Date)
const eighteenMonthsAgo = new Date(NOW - 18 * 30 * 24 * 3600 * 1000).toISOString();

function setup(): { household: Household; assumptions: Assumptions } {
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  loadSeedPersona(h, a);
  return { household: h.data, assumptions: a.values };
}

describe("#138 computePlanVariance — decomposed, honest delta", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("an ASSUMPTION-ONLY change reports 'goalpost moved', NOT 'you fell behind'", () => {
    const { household, assumptions } = setup();
    // Baseline captured under the current assumptions; then ONLY tighten SWR (3.25% → 3.0%).
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo);
    const tightened: Assumptions = { ...assumptions, swrOverride: 0.03 };

    const v = computePlanVariance({
      baseline,
      household, // identical household — only the assumption differs
      currentAssumptions: tightened,
      lens: LENS,
      nowMs: NOW,
    });

    // The WHOLE move is the goalpost (assumptions), not progress or reality.
    expect(v.assumptionsChanged).toBe(true);
    expect(v.changedAssumptionKeys).toContain("swrOverride");
    expect(v.attribution.goalpost).not.toBe(0);
    expect(v.attribution.progress).toBe(0); // net worth is assumption-invariant → exactly zero
    expect(v.attribution.reality).toBe(0); // expenses/household unchanged → target reality zero
    // A lower SWR raises the FIRE number → FIRE LATER → goalpost is months LATER (negative-sooner).
    expect(v.attribution.goalpost).toBeLessThan(0);
  });

  it("detects ANY assumption change as a goalpost (not just SWR) — equity return, inflation, variant", () => {
    const { household, assumptions } = setup();
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo);
    // Three DIFFERENT assumption fields, each must register as a goalpost change (proves the
    // decomposition reads the whole DECOMP_KEYS set, not a hardcoded swrOverride).
    for (const change of [
      { equityReturn: assumptions.equityReturn + 0.02 },
      { inflation: assumptions.inflation + 0.01 },
      { fatMultiplier: assumptions.fatMultiplier + 0.1 },
    ]) {
      const key = Object.keys(change)[0];
      const v = computePlanVariance({
        baseline,
        household,
        currentAssumptions: { ...assumptions, ...change },
        lens: LENS,
        nowMs: NOW,
      });
      expect(v.assumptionsChanged, `${key} must be detected`).toBe(true);
      expect(v.changedAssumptionKeys, `${key} must be listed`).toContain(key);
      expect(v.attribution.progress, `${key}: still no fake progress`).toBe(0);
    }
  });

  it("CPI-REBASES the rupee delta: flat nominal net worth over 18 months reads as a REAL decline", () => {
    const { household, assumptions } = setup();
    // Baseline net worth equals today's (flat nominal), captured 18 months ago.
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo);

    const v = computePlanVariance({ baseline, household, currentAssumptions: assumptions, lens: LENS, nowMs: NOW });

    // Same household + same assumptions ⇒ nominal net worth is identical ⇒ real value has DECLINED.
    expect(v.netWorthDeltaReal).toBeLessThan(0);
    expect(v.elapsedMonths).toBeGreaterThan(12);
    // Magnitude check (substance, not just sign): real decline == netWorth × (1 − (1+inf)^elapsedYears).
    const elapsedYears = (NOW - Date.parse(eighteenMonthsAgo)) / (365.25 * 24 * 3600 * 1000);
    const expected = Math.round(baseline.netWorth * (1 - Math.pow(1 + assumptions.inflation, elapsedYears)));
    expect(v.netWorthDeltaReal).toBeCloseTo(expected, -2);
  });

  it("PURE REALITY (expenses changed, same assumptions & corpus) reports reality≠0, goalpost=0, progress=0", () => {
    const { household, assumptions } = setup();
    // Baseline had a ₹1Cr LOWER FIRE target (lower past expenses) and a 1yr earlier planned FIRE;
    // same assumptions + same net worth. So the only force is the expense (reality) channel.
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo, {
      fireNumber: derive(household, assumptions, LENS).fireNumber - 10_000_000,
      yearsToFire: deriveYTF(household, assumptions) - 1,
      netWorth: deriveNetWorth(household, assumptions),
    });
    const v = computePlanVariance({ baseline, household, currentAssumptions: assumptions, lens: LENS, nowMs: NOW });
    expect(v.attribution.reality).not.toBe(0);
    expect(v.attribution.reality).toBeLessThan(0); // higher expenses now → FIRE later
    expect(v.attribution.goalpost).toBe(0);
    expect(v.attribution.progress).toBe(0);
    expect(v.assumptionsChanged).toBe(false);
  });

  it("NEVER flips a driver's sign when the linear estimate opposes the non-linear headline (H1 guard)", () => {
    const { household, assumptions } = setup();
    // Corpus GREW (rawProgress > 0) but the baseline planned FIRE 2yr EARLIER, so the headline shows
    // 2yr LATER (negative). Linear rawSum (>0) opposes the headline (<0) → the guard must NOT scale
    // by a negative factor that would render genuine corpus growth as a force pushing FIRE later.
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo, {
      netWorth: deriveNetWorth(household, assumptions) - 4_000_000, // corpus grew since
      yearsToFire: deriveYTF(household, assumptions) - 2, // but baseline planned 2yr earlier
    });
    const v = computePlanVariance({ baseline, household, currentAssumptions: assumptions, lens: LENS, nowMs: NOW });
    expect(v.fireDateDeltaMonths).toBeLessThan(0); // headline: later
    // Progress is the only non-zero raw driver and it is POSITIVE — it must never render NEGATIVE
    // (corpus growth shown as a delay). The guard zeroes the attribution rather than sign-flipping it.
    expect(v.attribution.progress).toBeGreaterThanOrEqual(0);
    expect(v.attribution.reality).toBe(0);
    expect(v.attribution.goalpost).toBe(0);
  });

  it("guards a malformed capturedAt (no NaN rupee delta reaches a user)", () => {
    const { household, assumptions } = setup();
    const baseline = captureBaselineFrom(household, assumptions, LENS, "not-a-real-date");
    const v = computePlanVariance({ baseline, household, currentAssumptions: assumptions, lens: LENS, nowMs: NOW });
    expect(Number.isFinite(v.netWorthDeltaReal)).toBe(true);
    expect(Number.isFinite(v.fireNumberDeltaReal)).toBe(true);
    expect(v.elapsedMonths).toBe(0);
  });

  it("PURE PROGRESS (corpus grew, same assumptions & expenses) reports progress>0, goalpost=0", () => {
    const { household, assumptions } = setup();
    // A coherent "corpus grew" baseline: net worth ₹40L LOWER AND the date planned 1 year LATER
    // (a smaller past corpus → a later planned FIRE), same assumptions/expenses (target reality = 0).
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo, {
      netWorth: deriveNetWorth(household, assumptions) - 4_000_000,
      yearsToFire: deriveYTF(household, assumptions) + 1,
    });

    const v = computePlanVariance({ baseline, household, currentAssumptions: assumptions, lens: LENS, nowMs: NOW });

    expect(v.attribution.progress).toBeGreaterThan(0);
    expect(v.attribution.goalpost).toBe(0); // assumptions unchanged
    expect(v.attribution.reality).toBe(0); // expenses unchanged
    expect(v.assumptionsChanged).toBe(false);
  });

  it("fireDateDeltaMonths is the exact observed headline (baseline yearsToFire − current)", () => {
    const { household, assumptions } = setup();
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo, {
      yearsToFire: deriveYTF(household, assumptions) + 1, // baseline planned 1 year later
    });
    const v = computePlanVariance({ baseline, household, currentAssumptions: assumptions, lens: LENS, nowMs: NOW });
    // You are now 1 year (12 months) EARLIER than the locked plan.
    expect(v.fireDateDeltaMonths).toBeCloseTo(12, 5);
  });

  it("the drivers SUM to the exact headline (no confusing headline-vs-driver gap)", () => {
    const { household, assumptions } = setup();
    // A mixed move: corpus grew AND an assumption changed.
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo, {
      netWorth: deriveNetWorth(household, assumptions) - 3_000_000,
    });
    const v = computePlanVariance({
      baseline,
      household,
      currentAssumptions: { ...assumptions, swrOverride: 0.03 },
      lens: LENS,
      nowMs: NOW,
    });
    const sum = v.attribution.progress + v.attribution.reality + v.attribution.goalpost;
    expect(sum).toBeCloseTo(v.fireDateDeltaMonths, 4);
  });

  it("guards a zero monthly contribution + non-finite inflation (no NaN reaches a user)", () => {
    const { household, assumptions } = setup();
    const baseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo, { monthlyContribution: 0 });
    const v = computePlanVariance({
      baseline,
      household,
      currentAssumptions: { ...assumptions, inflation: Number.NaN as unknown as number },
      lens: LENS,
      nowMs: NOW,
    });
    expect(Number.isFinite(v.attribution.progress)).toBe(true);
    expect(Number.isFinite(v.attribution.goalpost)).toBe(true);
    expect(Number.isFinite(v.netWorthDeltaReal)).toBe(true);
  });
});

function deriveNetWorth(h: Household, a: Assumptions): number {
  const d = derive(h, a, LENS);
  return d.totalCorpus - d.totalLiabilitiesValue;
}
function deriveYTF(h: Household, a: Assumptions): number {
  return derive(h, a, LENS).yearsToRegular;
}

/**
 * ADR-0006 — the frame gate on the persisted plan baseline (ADR-0005 document).
 *
 * Every existing baseline was locked under the old modelling frame. Differencing it against today's
 * plan measures the MODEL's move, not the user's, and would print "N months behind" to every user
 * who had ever locked a plan — a fabricated verdict, and precisely the optimism-in-reverse this ADR
 * is about. The document therefore carries its frame, and the UI declines to make a claim across a
 * frame change: it says so and offers the re-lock. It must NEVER re-lock silently — the baseline is
 * the starting point the user consciously chose, so replacing it is their decision, not ours.
 */
describe("plan-baseline — frame-change migration (ADR-0006)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("a freshly captured baseline carries the current frame", () => {
    const { household, assumptions } = setup();
    const b = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo);
    expect(b.frameVersion).toBe(FRAME_VERSION);
    expect(isBaselineFrameCurrent(b)).toBe(true);
  });

  it("a baseline with NO frame tag is recognised as pre-frame-change", () => {
    const { household, assumptions } = setup();
    const legacy: PlanBaseline = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo);
    delete legacy.frameVersion;
    expect(isBaselineFrameCurrent(legacy)).toBe(false);
    expect(isBaselineFrameCurrent(null)).toBe(false);
    expect(isBaselineFrameCurrent(undefined)).toBe(false);
  });

  it("an unrecognised (future or foreign) frame tag is also not current", () => {
    const { household, assumptions } = setup();
    const b = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo, {
      frameVersion: "adr-9999",
    });
    expect(isBaselineFrameCurrent(b)).toBe(false);
  });

  it("the frame tag survives a JSON round-trip through the storage adapter", () => {
    // The baseline is persisted as a document (localStorage in demo, PUT /api/planner in server
    // mode). A tag that did not survive serialisation would silently re-open the whole problem.
    const { household, assumptions } = setup();
    const b = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo);
    const roundTripped = JSON.parse(JSON.stringify(b)) as PlanBaseline;
    expect(isBaselineFrameCurrent(roundTripped)).toBe(true);
  });

  it("the tag is metadata only — it never touches the variance maths", () => {
    // The gate lives at the UI seam (hero + card) so that the pure decomposition stays testable and
    // frame-agnostic. Same inputs, different tags ⇒ identical result.
    const { household, assumptions } = setup();
    const tagged = captureBaselineFrom(household, assumptions, LENS, eighteenMonthsAgo);
    const untagged: PlanBaseline = { ...tagged };
    delete untagged.frameVersion;

    const args = { household, currentAssumptions: assumptions, lens: LENS, nowMs: NOW } as const;
    expect(computePlanVariance({ baseline: untagged, ...args })).toEqual(
      computePlanVariance({ baseline: tagged, ...args }),
    );
  });
});

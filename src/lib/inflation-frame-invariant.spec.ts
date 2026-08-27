/**
 * ADR-0006 REGRESSION LOCK — the kernel must never again collapse both sides of the FIRE
 * projection onto ONE inflation rate (gh #167 acceptance item 4).
 *
 * Why this file exists. `#20` fixed a real optimism bug by making the expense side grow at
 * general CPI *and* deflating returns at general CPI. That bought headline/chart agreement at the
 * price of the model asserting two different spending baskets for the same household in the same
 * run — and, because the FIRE target is expenses ÷ SWR, it silently understated `needReal`,
 * `needNominal`, `requiredMonthlyReal` and `householdFireAge` by `(1+g)^T`. Optimistic errors make
 * the salaried accumulator UNDER-SAVE, which is Tier-0 (`goal-anchored-decisions.md`).
 *
 * These are BEHAVIOURAL assertions, deliberately not a grep for a source comment: a string lock is
 * defeated by the next refactor, whereas a single-rate model cannot satisfy assertion 1 at all.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import { requiredMonthlyContributionFor } from "@/lib/required-contribution";
import type { Assumptions } from "@/types/assumptions";

/** The EXACT lens the dashboard renders by default (#22 — never verify on a convenient lens). */
const DEFAULT_PRODUCT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

type Store = ReturnType<typeof useHouseholdStore>;
type ASt = ReturnType<typeof useAssumptionsStore>;
const PERSONAS: Array<{ name: string; load: (h: Store, a: ASt) => void }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
];

/**
 * The PRE-ADR-0006 headline, captured from `src/lib/__snapshots__/headline-golden-master.spec.ts.snap`
 * (and the matching `requiredMonthlyContributionFor` run at each persona's STORED target age) on
 * commit e38b2f6, BEFORE any kernel edit on this branch. These are the "old" side of the honesty
 * ratchet and must never be re-derived from the live kernel — the whole point is that they are frozen.
 */
const PRE_ADR_0006 = {
  sharmas: { householdFireAge: 56, needReal: 105_982_068, requiredMonthlyReal: Number.POSITIVE_INFINITY },
  mehtas: { householdFireAge: 51, needReal: 102_333_391, requiredMonthlyReal: Number.POSITIVE_INFINITY },
  iyers: { householdFireAge: 57, needReal: 80_319_726, requiredMonthlyReal: 148_264 },
  mauryas: { householdFireAge: 68, needReal: 113_310_486, requiredMonthlyReal: Number.POSITIVE_INFINITY },
} as const;

/**
 * ADR-0006 Phase 1b (MEDIUM-8) — the LIVE-DEFAULTS direction record.
 *
 * Assertion 4 below is deliberately scoped to the FRAME leg, because the re-grounded inputs and
 * the 2% step-up move the headline EARLIER by design. That scoping has a hole: a future change
 * that made the frame more optimistic could hide behind the step-up on the live path and never
 * trip anything. So the live-defaults prescription is RECORDED here with an explicit, commented
 * allowance, and a movement outside it has to be argued in the PR rather than absorbed silently.
 *
 * Measured on this branch at each persona's STORED target age, default product lens. Only the
 * Iyers have a finite figure; the other three are honestly unreachable at their stored age (the
 * ADR-0006 item-4 state), and "unreachable" is itself the assertion for them — a finite number
 * appearing there would mean the kernel had started inventing one again.
 */
const LIVE_DEFAULTS_REQUIRED_MONTHLY = {
  sharmas: Number.POSITIVE_INFINITY,
  mehtas: Number.POSITIVE_INFINITY,
  iyers: 146_273,
  mauryas: Number.POSITIVE_INFINITY,
} as const;
/**
 * How far the live figure may move before someone has to explain it. The step-up leg is worth
 * roughly −1.5% on the Iyers' prescription and the frame leg roughly +2.5%, so a band of ±8%
 * catches a re-framing large enough to matter while tolerating ordinary re-grounding.
 */
const LIVE_DEFAULTS_ALLOWANCE = 0.08;

/**
 * The pre-ADR-0006 INPUTS. Forcing them isolates the FRAME leg of the change from the re-grounded
 * assumptions + the step-up default, which move the headline in the opposite (earlier) direction
 * by design (ADR-0006 guard: a frame-only landing would have shipped a defeatist headline).
 */
const PRE_ADR_0006_INPUTS: Partial<Assumptions> = {
  healthcareInflation: 0.14,
  inflationWeights: { general: 60, healthcare: 20, education: 10, housing: 10 },
  householdSavingsStepUpPercent: 0,
};

describe("ADR-0006 — the FIRE target and the corpus must not share one inflation rate (gh #167)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // ------------------------------------------------------------------ assertion 1
  it("negative control: raising ONE expense bucket must raise the prescription and never pull FIRE earlier", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: anchor 30, stored target 47 ⇒ T = 17 (≥ 10)

    const baseline = a.values;
    // ONLY healthcare moves. CPI, weights, returns, step-up all identical.
    const hotter: Assumptions = { ...baseline, healthcareInflation: 0.15 };

    const kBase = derive(h.data, baseline, DEFAULT_PRODUCT_LENS);
    const kHot = derive(h.data, hotter, DEFAULT_PRODUCT_LENS);
    const targetAge = kBase.targetRetirementAge;
    const T = targetAge - kBase.anchorAge;
    expect(T, "fixture must have a long enough horizon for the drift to bite").toBeGreaterThanOrEqual(10);

    const rcBase = requiredMonthlyContributionFor({
      snapshot: h.data, assumptions: baseline, lens: DEFAULT_PRODUCT_LENS, targetAge,
    });
    const rcHot = requiredMonthlyContributionFor({
      snapshot: h.data, assumptions: hotter, lens: DEFAULT_PRODUCT_LENS, targetAge,
    });

    const why =
      "gh #167 / ADR-0006: derive.ts must grow the FIRE target at the HOUSEHOLD BASKET while the " +
      "corpus grows at the NOMINAL return. If both sides were collapsed onto general CPI again, " +
      "every assertion below would read UNCHANGED.";

    // `fireNumber` is a TODAY's-rupee figure — an inflation rate cannot move it.
    expect(kHot.fireNumber, `${why} — fireNumber is today's ₹ and must not move`).toBeCloseTo(
      kBase.fireNumber, 6,
    );
    // …but everything that looks FORWARD must get harder.
    expect(kHot.realTargetDriftRate, `${why} — the real target drift must rise`).toBeGreaterThan(
      kBase.realTargetDriftRate,
    );
    expect(rcHot.needReal, `${why} — needReal at T=${T}`).toBeGreaterThan(rcBase.needReal);
    expect(rcHot.needNominal, `${why} — needNominal at T=${T}`).toBeGreaterThan(rcBase.needNominal);

    expect(kBase.householdFireAge, "baseline must be reachable for the comparison to mean anything").not.toBeNull();
    expect(kHot.householdFireAge, `${why} — FIRE age must not come EARLIER`).toBeGreaterThanOrEqual(
      kBase.householdFireAge as number,
    );
    expect(kHot.householdFireAge, `${why} — FIRE age must be STRICTLY later at T=${T} ≥ 10`).toBeGreaterThan(
      kBase.householdFireAge as number,
    );
  });

  // ------------------------------------------------------------------ assertion 2
  it("positive control: when all four buckets equal general CPI the headline collapses to the single-rate model", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const cpi = a.values.inflation;

    // Four buckets, all at CPI — the drift must vanish EXACTLY.
    const flat: Assumptions = {
      ...a.values,
      healthcareInflation: cpi,
      educationInflation: cpi,
      housingInflation: cpi,
    };
    // The single-rate reference: one bucket carrying all the weight.
    const singleRate: Assumptions = {
      ...a.values,
      inflationWeights: { general: 100, healthcare: 0, education: 0, housing: 0 },
    };

    const kFlat = derive(h.data, flat, DEFAULT_PRODUCT_LENS);
    const kRef = derive(h.data, singleRate, DEFAULT_PRODUCT_LENS);

    expect(kFlat.realTargetDriftRate, "g must be 0 when every bucket is CPI").toBeCloseTo(0, 12);
    expect(kRef.realTargetDriftRate, "g must be 0 for the single-rate reference").toBeCloseTo(0, 12);

    const why =
      "ADR-0006 §3: the change is a GENERALISATION, not a re-tuning — a household whose basket " +
      "equals CPI must get the single-rate headline back, field for field.";
    expect(kFlat.yearsToRegular, `${why} — yearsToRegular`).toBe(kRef.yearsToRegular);
    expect(kFlat.fireNumber, `${why} — fireNumber`).toBe(kRef.fireNumber);
    expect(kFlat.householdFireAge, `${why} — householdFireAge`).toBe(kRef.householdFireAge);
    expect(kFlat.progressPercent, `${why} — progressPercent`).toBe(kRef.progressPercent);
  });

  // ------------------------------------------------------------------ assertion 3
  for (const persona of PERSONAS) {
    it(`${persona.name}: the headline solver and the chart crossover agree within a year (two-frame lock)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);

      expect(k.householdFireAge, `${persona.name}: headline must be reachable`).not.toBeNull();
      expect(
        k.crossovers.regular.age,
        `${persona.name}: the projection must cross its own regular target within the horizon`,
      ).not.toBeNull();

      // This is the ONE property `#20` bought by collapsing both sides. The new model must keep it
      // WITHOUT the collapse — it now holds because both paths run the same nominal frame AND the
      // projection's regular target is the headline `fireNumber` (before ADR-0006 it was
      // expenses ÷ SWR, which put the chart 4–8 years optimistically early on every seed).
      expect(
        Math.abs((k.crossovers.regular.age as number) - (k.householdFireAge as number)),
        `${persona.name}: headline ${k.householdFireAge} vs chart crossover ${k.crossovers.regular.age} — ` +
          "the two frames have drifted apart (ADR-0006 assertion 3)",
      ).toBeLessThanOrEqual(1);
    });
  }

  // ------------------------------------------------------------------ assertion 4
  for (const persona of PERSONAS) {
    it(`${persona.name}: honesty ratchet — the FRAME change alone may only move the number conservatively`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);

      // The frame leg in isolation: today's kernel, yesterday's inputs.
      const frameOnly: Assumptions = { ...a.values, ...PRE_ADR_0006_INPUTS } as Assumptions;
      const k = derive(h.data, frameOnly, DEFAULT_PRODUCT_LENS);
      const rc = requiredMonthlyContributionFor({
        snapshot: h.data,
        assumptions: frameOnly,
        lens: DEFAULT_PRODUCT_LENS,
        targetAge: k.targetRetirementAge,
      });
      const old = PRE_ADR_0006[persona.name as keyof typeof PRE_ADR_0006];

      const why =
        "ADR-0006 assertion 4: removing the optimistic frame may only push the number UP and the " +
        "date LATER. A smaller/earlier figure here is an optimistic regression and must be " +
        "justified explicitly, never re-baselined silently. (Scoped to the frame leg on purpose — " +
        "the re-grounded inputs + the 2% step-up move the headline EARLIER by design.)";
      expect(rc.needReal, `${persona.name}: needReal ${rc.needReal} vs pre-ADR-0006 ${old.needReal} — ${why}`)
        .toBeGreaterThanOrEqual(old.needReal);
      // …and the PRESCRIPTION itself, which is what the user acts on. `needReal` rising while the
      // required monthly FELL would be an optimism leak the needReal check alone cannot see
      // (Infinity >= Infinity holds for the three unreachable personas, which is the right
      // statement: removing the optimistic frame must not make an unreachable plan reachable).
      expect(
        rc.requiredMonthlyReal,
        `${persona.name}: requiredMonthlyReal ${rc.requiredMonthlyReal} vs pre-ADR-0006 ` +
          `${old.requiredMonthlyReal} — ${why}`,
      ).toBeGreaterThanOrEqual(old.requiredMonthlyReal);
      expect(k.householdFireAge, `${persona.name}: FIRE age must stay reachable under the frame leg`).not.toBeNull();
      expect(
        k.householdFireAge as number,
        `${persona.name}: FIRE age ${k.householdFireAge} vs pre-ADR-0006 ${old.householdFireAge} — ${why}`,
      ).toBeGreaterThanOrEqual(old.householdFireAge);
    });
  }
});

/**
 * ADR-0006 Phase 1b (MEDIUM-8) — the LIVE-DEFAULTS direction case.
 *
 * Assertion 4 is frame-only by design. This is the companion that watches the path the user
 * actually gets, so a future optimistic frame change cannot hide behind the step-up leg.
 */
describe("ADR-0006 — the LIVE prescription is recorded, not just the frame leg", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: requiredMonthlyReal on live defaults is where it was recorded`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const rc = requiredMonthlyContributionFor({
        snapshot: h.data,
        assumptions: a.values,
        lens: DEFAULT_PRODUCT_LENS,
        targetAge: k.targetRetirementAge,
      });
      const recorded = LIVE_DEFAULTS_REQUIRED_MONTHLY[persona.name as keyof typeof LIVE_DEFAULTS_REQUIRED_MONTHLY];

      if (!Number.isFinite(recorded)) {
        expect(
          Number.isFinite(rc.requiredMonthlyReal),
          `${persona.name}: this plan is honestly unreachable at its stored target age. A finite ` +
            "figure here means the kernel has started inventing one again (ADR-0006 item 4).",
        ).toBe(false);
        return;
      }

      const lo = recorded * (1 - LIVE_DEFAULTS_ALLOWANCE);
      const hi = recorded * (1 + LIVE_DEFAULTS_ALLOWANCE);
      expect(
        rc.requiredMonthlyReal,
        `${persona.name}: the live prescription moved from ${recorded} to ${rc.requiredMonthlyReal}, ` +
          `outside the ±${LIVE_DEFAULTS_ALLOWANCE * 100}% allowance. That is not automatically wrong — ` +
          "but it must be explained per persona in the PR and this constant re-recorded, never " +
          "silently widened. A DOWNWARD move especially: it is the optimistic direction.",
      ).toBeGreaterThanOrEqual(lo);
      expect(rc.requiredMonthlyReal).toBeLessThanOrEqual(hi);
    });
  }
});

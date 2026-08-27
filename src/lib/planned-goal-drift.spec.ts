/**
 * ADR-0006 Phase 1c decision (b) — a DATED goal stops inflating on its due year.
 *
 * Phase 1 grew the whole FIRE target at one rate, so a ₹50 L education bill due in 8 years kept
 * compounding at education inflation for the ENTIRE horizon. Over a 17-year plan that is nine
 * extra years of 9% on money that was spent in year 8 — a target inflated by ~2.2x where the
 * honest figure is ~2.0x. Wrong in the pessimistic direction, but wrong: it is not the household's
 * plan, and it makes the goals layer look like a perpetual expense instead of a dated lump.
 *
 * The rule the kernel now implements:
 *   goal_i(t) = todayAmount_i x (1 + bucketRate_i)^min(t, dueYears_i)   [NOMINAL rupees]
 * i.e. its own price index until the due year, then FLAT IN NOMINAL RUPEES. Flat rather than
 * removed is the conservative half of the choice: the corpus had to carry the full amount to the
 * due date and is never credited back for having spent it.
 *
 * These assert the EXACT arithmetic through the real `derive()` + solver path, not a band.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";
import { requiredMonthlyContributionFor } from "@/lib/required-contribution";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

/**
 * ADR-0006 Phase 1d — the calendar year every `derive()` call in this file is evaluated in.
 *
 * The kernel no longer reads the wall clock (it used to, at `derive.ts`'s dated-goal handling), so
 * a pinned year is what makes these baselines DETERMINISTIC: without it they would silently shift
 * on 1 January, every dated goal a year nearer, hence a year less inflation, hence FIRE earlier —
 * the optimistic direction, arriving unannounced. 2026 is the year the current baselines were
 * measured in, so pinning it keeps them byte-identical and frozen from here on.
 */
const PINNED_CURRENT_YEAR = 2026;
const PINNED = { currentYear: PINNED_CURRENT_YEAR } as const;

/**
 * ₹50 L, one education goal, `dueInYears` from now, and NOTHING else in the family layer.
 * `bucket` is what the line's `inflationBucket` is set to — pass `null` (NOT `undefined`, which
 * would silently take the default) to exercise the ADR-0006 Phase 1d fallback, where the price
 * index has to come from `kind` instead.
 */
function oneEducationGoal(dueInYears: number, bucket: "education" | null = "education") {
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  loadSeedPersona(h, a);
  h.data.expenses.plannedFuture = [
    {
      id: "test-education-goal",
      label: "Undergraduate degree",
      todayAmount: 5_000_000,
      targetYear: PINNED_CURRENT_YEAR + dueInYears,
      isMultiYear: false,
      ...(bucket ? { inflationBucket: bucket } : {}),
      kind: "education",
    },
  ];
  // The extended-family contingency is a PERPETUAL leg that rides the household basket, and it
  // is reported inside the same `needPlannedGoalsReal` bucket. Zero it so this test reads the
  // dated-goal arithmetic and nothing else.
  h.data.extendedFamilyContingencyPercent = 0;
  return { h, a };
}

describe("ADR-0006 Phase 1c (b) — a dated goal inflates to its due year and then stops", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("₹50 L education goal due in 8 years: at a 17-year target it is capped at 8 years of education inflation", () => {
    const { h, a } = oneEducationGoal(8);
    const k = derive(h.data, a.values, LENS, PINNED);
    const anchorAge = k.anchorAge;
    const targetAge = anchorAge + 17;

    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge,
      currentYear: PINNED_CURRENT_YEAR,
    });
    expect(r.yearsToTarget, "the fixture must actually be a 17-year plan").toBe(17);

    // THE FRAME, stated precisely. `needPlannedGoalsReal` is TODAY's rupees AT THE TARGET AGE:
    // the goal's NOMINAL value at year 17 — which is its today's amount grown at education
    // inflation for only the 8 years to its due date, then held flat for years 9..17 — deflated
    // back to today's rupees at general CPI over the full 17 years.
    //
    //   ₹50,00,000 x (1 + educationInflation)^8 / (1 + CPI)^17
    //
    // Note the direction: because the lump stops growing at 9% while the deflator keeps running
    // at 6%, its REAL value FALLS after the due year. That is the correct statement — a bill paid
    // in year 8 does not get more expensive in year 12 — and it is exactly what the pre-1c model
    // could not express.
    const expected = Math.round(
      5_000_000 * Math.pow(1 + a.values.educationInflation, 8) / Math.pow(1 + a.values.inflation, 17),
    );
    expect(r.needPlannedGoalsReal).toBe(expected);
    // ₹50 L → ₹99.63 L nominal by year 8, worth ₹36.998 L in today's money at year 17.
    expect(expected).toBe(3_699_834);

    // The uncapped model would have compounded all 17 years — materially bigger, and wrong.
    const uncapped =
      5_000_000 * Math.pow(1 + a.values.educationInflation, 17) / Math.pow(1 + a.values.inflation, 17);
    expect(uncapped).toBeGreaterThan(expected * 1.3);

    // …and the three narrated steps still add up to the headline need (the T-378 e2e contract).
    expect(r.needBaseReal + r.needPlannedGoalsReal + r.needHealthcareReservationReal).toBe(r.needReal);
  });

  it("a goal falling beyond the horizon inflates for the WHOLE horizon (the cap never binds)", () => {
    // The schema requires a `targetYear`, so there is no literally undated goal; the case that
    // "inflates throughout" is a goal whose due year sits past the plan's own horizon.
    const { h, a } = oneEducationGoal(40);
    const k = derive(h.data, a.values, LENS, PINNED);
    const targetAge = k.anchorAge + 17;

    const r = requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge,
      currentYear: PINNED_CURRENT_YEAR,
    });

    const expected = Math.round(
      5_000_000 * Math.pow(1 + a.values.educationInflation, 17) / Math.pow(1 + a.values.inflation, 17),
    );
    expect(r.needPlannedGoalsReal).toBe(expected);
    expect(r.needBaseReal + r.needPlannedGoalsReal + r.needHealthcareReservationReal).toBe(r.needReal);
  });

  it("the goal leg never grows past its due year — the schedule is flat in nominal ₹ from year 8 on", () => {
    const { h, a } = oneEducationGoal(8);
    const k = derive(h.data, a.values, LENS, PINNED);
    // Isolate the goal leg by differencing two horizons: everything else in the target grows
    // monotonically, so a flat NOMINAL goal leg is visible as equal successive increments.
    const nominalAt = (t: number) =>
      k.regularTargetComponentsRealAt(t).plannedGoals * Math.pow(1 + a.values.inflation, t);
    const atDue = nominalAt(8);
    expect(nominalAt(12), "no growth after the due year").toBeCloseTo(atDue, 4);
    expect(nominalAt(30), "still no growth 22 years later").toBeCloseTo(atDue, 4);
    expect(nominalAt(4), "…but it DOES grow before the due year").toBeLessThan(atDue);
  });
});

/**
 * ADR-0006 Phase 1d (F5) — a goal's price index falls back to its `kind` before it falls back to
 * general CPI.
 *
 * `inflationBucket` is optional and most real lines never carry one; `kind` is the field the goal
 * form and `derived-records.ts` actually classify by. Routing on the bucket alone sent every
 * bucket-less education goal to 6% all-items CPI instead of 9% education inflation, which makes
 * the FIRE target too SMALL — the optimistic direction.
 */
describe("ADR-0006 Phase 1d (F5) — an education goal with no bucket still inflates at education inflation", () => {
  beforeEach(() => setActivePinia(createPinia()));

  /** The goal leg at a 17-year target, in today's rupees, for the current fixture. */
  function plannedGoalsRealAt17(h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) {
    const k = derive(h.data, a.values, LENS, PINNED);
    return requiredMonthlyContributionFor({
      snapshot: h.data,
      assumptions: a.values,
      lens: LENS,
      targetAge: k.anchorAge + 17,
      currentYear: PINNED_CURRENT_YEAR,
    }).needPlannedGoalsReal;
  }

  /** 9% to the due year, then flat, deflated at 6% over 17 years — the bucketed answer. */
  const EDUCATION_ANSWER = 3_699_834;

  it("the two rates are genuinely different, else nothing below proves anything", () => {
    const a = useAssumptionsStore();
    expect(a.values.educationInflation).not.toBeCloseTo(a.values.inflation, 6);
  });

  it("an EXPLICIT education bucket prices the goal at education inflation", () => {
    const { h, a } = oneEducationGoal(8, "education");
    expect(plannedGoalsRealAt17(h, a)).toBe(EDUCATION_ANSWER);
  });

  it("kind: 'education' with NO bucket prices IDENTICALLY — it does not fall through to CPI", () => {
    const { h, a } = oneEducationGoal(8, null);
    const goal = h.data.expenses.plannedFuture[0];
    // The line reaches the kernel with no usable bucket — either genuinely absent, or stamped
    // "general" by the store's hydrate backfill, which is the same under-pricing by another route.
    expect(goal.inflationBucket ?? "general").toBe("general");
    expect(goal.kind).toBe("education");

    const got = plannedGoalsRealAt17(h, a);
    expect(got, "a bucket-less education goal must cost the same as a bucketed one").toBe(
      EDUCATION_ANSWER,
    );

    // …and strictly more than the all-items-CPI answer the pre-1d routing gave it.
    const atGeneralCpi = Math.round(
      (5_000_000 * Math.pow(1 + a.values.inflation, 8)) / Math.pow(1 + a.values.inflation, 17),
    );
    expect(got, "the pre-1d fallback under-priced this goal").toBeGreaterThan(atGeneralCpi);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadRaviSeed } from "@/seeds/ravi";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import { computeIndividualFire } from "@/lib/individual-fire";
import { resolveHouseholdBasket } from "@/lib/assumption-math";

describe("computeIndividualFire (#81 Phase 2 — standalone per-adult FIRE)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  function setup() {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // rohit + priya (adults) · aarav + meera (dependents)
    return { h, a };
  }

  it("returns null for a dependent or a missing member", () => {
    const { h, a } = setup();
    expect(computeIndividualFire(h.data, a.values, "aarav", "2025-26")).toBeNull();
    expect(computeIndividualFire(h.data, a.values, "ghost", "2025-26")).toBeNull();
  });

  it("produces a domain-SANE standalone FIRE for an earning adult", () => {
    const { h, a } = setup();
    const r = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(r).not.toBeNull();
    // Sane bounds (rule 31): an affluent mid-30s earner's personal FIRE number is crores,
    // not negative / zero / absurd; the personal FIRE age is plausible (35..75), not 81/115.
    expect(r.individualFireNumber).toBeGreaterThan(1_00_00_000); // > ₹1 Cr
    expect(r.individualFireNumber).toBeLessThan(100_00_00_000); // < ₹100 Cr
    expect(r.attributableAnnualExpenses).toBeGreaterThan(0);
    expect(r.attributableCorpus).toBeGreaterThan(0);
    expect(Number.isFinite(r.yearsToIndividualFire)).toBe(true);
    expect(r.individualFireAge).toBeGreaterThanOrEqual(r.anchorAge);
    expect(r.individualFireAge).toBeLessThan(90);
  });

  it("gh #194 — a Solo member's zero-value-portfolio blend equals the household's (cross-screen coherence)", () => {
    // Ravi is Solo (one adult, no dependents) with an auto-flowed EPF line at `value: 0` plus a
    // SIP contribution line — exactly the class this bug hit: `corpusWeightOf`'s VALUE weights
    // total zero for this member, so before this fix `blendPortfolioReturn` fell through to ITS
    // OWN truly-empty debt default (individual-fire.ts had no contributionWeights to hand), while
    // `derive()`'s household path already resolved off the CONTRIBUTION mix (gh #194, 24f9c0a).
    // Since Ravi IS the whole household, the member-lens blended rate must equal the household's.
    const { h, a } = setup();
    loadRaviSeed(h, a);
    const householdDerived = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const memberId = h.data.members.find((m) => m.role === "ADULT")!.id;
    const member = computeIndividualFire(h.data, a.values, memberId, "2025-26")!;
    expect(member).not.toBeNull();
    expect(member.nominalReturn).toBeCloseTo(householdDerived.blendedReturn, 9);
  });

  it("EXCLUDES ring-3 (dependents) costs from every adult's attributable expenses", () => {
    const { h, a } = setup();
    const before = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    // Add a large dependents-tagged cost — it must NOT raise any adult's attributable expenses.
    h.addRecurring({ label: "Kids international school", amount: 80000, frequency: "M", source: "manual", ownerId: "Dependents" });
    const after = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(after.attributableAnnualExpenses).toBeCloseTo(before.attributableAnnualExpenses, 0);
    const priya = computeIndividualFire(h.data, a.values, "priya", "2025-26")!;
    // The household total expense DID rise by that ₹80k/mo, but neither adult's attributable did.
    const householdAnnualExpenses = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" }).annualExpensesToday;
    expect(householdAnnualExpenses).toBeGreaterThan(after.attributableAnnualExpenses + priya.attributableAnnualExpenses);
  });

  it("split % raises each adult's share of SHARED costs (monotonic)", () => {
    const { h, a } = setup();
    a.values.householdSplitPercent = 30;
    const lo = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    a.values.householdSplitPercent = 70;
    const hi = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(hi.attributableAnnualExpenses).toBeGreaterThan(lo.attributableAnnualExpenses);
    expect(hi.attributableCorpus).toBeGreaterThanOrEqual(lo.attributableCorpus);
  });

  it("UNREACHABLE individual FIRE → Infinity age, never an absurd finite age (HIGH-1 rule-31 lock)", () => {
    const { h, a } = setup();
    // Force an unreachable-but-POSITIVE-savings adult: ~0 corpus, large own expenses, tiny surplus.
    // calculateYearsToTarget caps at 1200 months → returns 100.0 (finite); the helper must map that
    // to Infinity so the card shows "not within horizon", not "age 132".
    const rohit = h.data.members.find((m) => m.id === "rohit")!;
    rohit.salary = undefined; // no salary → income is the tiny exempt stream below
    h.data.businesses = []; // no business income either
    h.data.investments = []; // attributable corpus → 0
    h.data.expenses.avgMonthly = 0;
    h.data.expenses.recurring = [
      { id: "r1", label: "Rohit huge own cost", amount: 500000, frequency: "M", source: "manual", ownerId: "rohit" },
    ]; // ₹60L/yr, all his (ring 1)
    h.data.otherIncome = [
      // ₹60.06L/yr tax-exempt, his → savings ≈ ₹6k/yr (positive but minuscule vs a ~₹17 Cr target)
      { id: "o1", type: "Other", amount: 500500, frequency: "M", ownerId: "rohit", isTaxExempt: true } as never,
    ];
    const r = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(r.attributableAnnualSavings).toBeGreaterThan(0); // positive savings (the HIGH-1 path)
    expect(r.attributableCorpus).toBe(0);
    expect(Number.isFinite(r.yearsToIndividualFire)).toBe(false); // unreachable → Infinity
    expect(Number.isFinite(r.individualFireAge)).toBe(false); // NOT a finite absurd age
  });

  it("gh #162 part 1 — carries the household healthcare corpus reservation (never bare base)", () => {
    // RCA: computeIndividualFire built the target as bare calculateFIRENumber(...) — no
    // healthcareCorpusReservationPercent — so every member-lensed surface was ~17% optimistic
    // vs the household path (derive.ts adds base × healthcareCorpusReservationPercent, default 20%).
    const { h, a } = setup();
    // A zero reservation reproduces the bare pre-fix base exactly (no double-count, no hidden
    // floor) — measure it directly rather than back-computing, to avoid rounding noise.
    h.data.healthcareCorpusReservationPercent = 0;
    const zero = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    const bareBase = zero.individualFireNumber;

    h.data.healthcareCorpusReservationPercent = 0.2; // explicit default, not implicit
    const withReservation = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    // The FIX must add the reservation on top of the base — never leave the bare base standing.
    expect(withReservation.individualFireNumber).toBeCloseTo(bareBase * 1.2, -2);
    expect(withReservation.individualFireNumber).toBeGreaterThan(bareBase);

    // Raising the household's reservation % must raise EVERY adult's individual target,
    // through the SAME shared calculateFireTarget helper the household path uses.
    h.data.healthcareCorpusReservationPercent = 0.3;
    const higher = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(higher.individualFireNumber).toBeGreaterThan(withReservation.individualFireNumber);
    expect(higher.individualFireNumber).toBeCloseTo(bareBase * 1.3, -2);

    // The FIRE AGE must move LATER (or stay equal) as the target rises — never earlier.
    expect(higher.individualFireAge === Infinity || withReservation.individualFireAge === Infinity
      ? true
      : higher.individualFireAge >= withReservation.individualFireAge).toBe(true);
  });

  it("a member-OWNED expense lands fully in that adult, not split", () => {
    const { h, a } = setup();
    a.values.householdSplitPercent = 50;
    const before = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    h.addRecurring({ label: "Rohit's club", amount: 10000, frequency: "M", source: "manual", ownerId: "rohit" });
    const after = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    // Full ₹10k/mo × 12 = ₹1.2L added (ring-1, not halved).
    expect(after.attributableAnnualExpenses - before.attributableAnnualExpenses).toBeCloseTo(120000, 0);
    // And it does NOT touch Priya's attributable expenses.
    const priyaBeforeId = computeIndividualFire(h.data, a.values, "priya", "2025-26")!;
    expect(priyaBeforeId.attributableAnnualExpenses).not.toBeCloseTo(after.attributableAnnualExpenses, 0);
  });
  // ---- gh #162 part 2, §4.4 — the reservation-leg inflation asymmetry (T5) ----
  //
  // RCA: `derive.ts` grows the healthcare reservation leg at `healthcareInflation` (9%) on its own
  // schedule (`healthcareReservationNominalAt`) while this file grew the member's WHOLE target —
  // reservation included — at `resolveHouseholdBasket` (6.24%). Where healthcareInflation > basket
  // (the normal case) the member's reservation share rose SLOWER than the household's, so the
  // member target understated the household-grade reservation, and understated it more the further
  // out the member's FIRE date is. Small, monotone, OPTIMISTIC — the Tier-0 direction.
  it("gh #162 part 2 T5 — the target is byte-identical at t=0 and STEEPER later (two-leg schedule)", () => {
    const { h, a } = setup();
    h.data.healthcareCorpusReservationPercent = 0.2;
    // Isolate the RESERVATION leg from the basket channel (see T5b): with a general-only weight
    // vector, `healthcareInflation` reaches the target ONLY through the reservation leg, which is
    // exactly the asymmetry §4.4 closes.
    a.values.inflationWeights = { general: 1, healthcare: 0, education: 0, housing: 0 };
    a.values.healthcareInflation = 0.09;

    // (a) t = 0 byte-identical: the reported `individualFireNumber` is the target TODAY, and the
    // two-leg split must sum to exactly what the single-rate collapse summed to at t = 0.
    const withGap = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    const zeroReservation = (() => {
      h.data.healthcareCorpusReservationPercent = 0;
      const r = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
      h.data.healthcareCorpusReservationPercent = 0.2;
      return r;
    })();
    expect(withGap.individualFireNumber).toBeCloseTo(zeroReservation.individualFireNumber * 1.2, -2);

    // (b) STEEPER later: with healthcareInflation ABOVE the basket the reservation leg outruns the
    // base leg, so the target the solver chases at t > 0 is LARGER than the single-rate schedule's
    // — which can only push the member's FIRE age LATER (or leave it, on a rounding tie). Compare
    // against the SAME household with healthcareInflation pinned DOWN to the basket, where the two
    // schedules provably coincide (one rate for both legs).
    const basket = resolveHouseholdBasket(a.values);
    a.values.healthcareInflation = basket;
    const noGap = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    // Same target TODAY (the reservation % did not change) …
    expect(noGap.individualFireNumber).toBeCloseTo(withGap.individualFireNumber, -2);
    // … but a strictly LONGER solve when the reservation leg runs hotter than the basket.
    expect(withGap.yearsToIndividualFire).toBeGreaterThan(noGap.yearsToIndividualFire);
    expect(withGap.individualFireAge).toBeGreaterThanOrEqual(noGap.individualFireAge);
  });

  it("gh #162 part 2 T5b — a ZERO reservation makes healthcareInflation irrelevant (no leg to grow)", () => {
    const { h, a } = setup();
    h.data.healthcareCorpusReservationPercent = 0;
    // `healthcareInflation` ALSO feeds the household basket by weight (`resolveHouseholdBasket`),
    // so it must be zeroed out of the basket to isolate the RESERVATION leg — otherwise this test
    // measures the basket channel, not the leg, and fails on main for the wrong reason.
    a.values.inflationWeights = { general: 1, healthcare: 0, education: 0, housing: 0 };
    a.values.healthcareInflation = 0.05;
    const lo = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    a.values.healthcareInflation = 0.2;
    const hi = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    // With no reservation leg the two-leg schedule collapses to the base leg alone — identical.
    expect(hi.yearsToIndividualFire).toBe(lo.yearsToIndividualFire);
    expect(hi.individualFireNumber).toBe(lo.individualFireNumber);
  });

  it("gh #162 part 2 T5c — raising healthcareInflation never pulls a member's FIRE age EARLIER", () => {
    const { h, a } = setup();
    h.data.healthcareCorpusReservationPercent = 0.2;
    a.values.inflationWeights = { general: 1, healthcare: 0, education: 0, housing: 0 };
    // Monotone-later, and a high enough medical inflation legitimately outruns the corpus into
    // "not within horizon" (Infinity) — which is the CONSERVATIVE terminal state, never an earlier
    // age. Infinity compares correctly under >=, so the ladder covers both regimes in one sweep.
    let prev = -Infinity;
    for (const hi of [0.04, 0.06, 0.09, 0.12, 0.15]) {
      a.values.healthcareInflation = hi;
      const r = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
      expect(Number.isNaN(r.yearsToIndividualFire)).toBe(false);
      expect(r.yearsToIndividualFire).toBeGreaterThanOrEqual(prev);
      prev = r.yearsToIndividualFire;
    }
    // …and the top of the ladder really is strictly worse than the bottom (not a flat no-op).
    a.values.healthcareInflation = 0.04;
    const lo = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    a.values.healthcareInflation = 0.12;
    const hi12 = computeIndividualFire(h.data, a.values, "rohit", "2025-26")!;
    expect(hi12.yearsToIndividualFire).toBeGreaterThan(lo.yearsToIndividualFire);
  });
  // ---- gh #162 part 2, T2 — per-seed member bounds, bands DERIVED from the measured run ----
  //
  // Bands come from the step-3 before/after measurement (§4.4 landing), never invented and never
  // widened to admit a number (D-2026-09-29-03). Each row is the POST-FIX age with a ±1 tolerance
  // for the solver's integer-age rounding, plus the substance locks (no NaN/Infinity leaking into
  // a reachable member, target byte-identical at t = 0, expenses/corpus non-negative).
  it("gh #162 part 2 T2 — per-seed member bounds on the measured post-fix ages", () => {
    const seeds: Array<[string, (h: never, a: never) => void, Array<[string, number | null]>]> = [
      ["sharmas", loadSeedPersona as never, [["rohit", 48], ["priya", 47]]],
      ["mehtas", loadMehtasSeed as never, [["vikram", 45], ["aanya", 63]]],
      ["iyers", loadIyersSeed as never, [["ashwin", 47], ["lakshmi", 84]]],
      ["mauryas", loadMauryasSeed as never, [["abhay", 56], ["madhu", null]]],
      ["ravi", loadRaviSeed as never, [["ravi", 41]]],
    ];
    for (const [seed, load, rows] of seeds) {
      setActivePinia(createPinia());
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      (load as unknown as (x: unknown, y: unknown) => void)(h, a);
      for (const [memberId, expectedAge] of rows) {
        const r = computeIndividualFire(h.data, a.values, memberId, "2025-26")!;
        expect(r, `${seed}/${memberId}`).not.toBeNull();
        expect(Number.isNaN(r.individualFireAge), `${seed}/${memberId} age NaN`).toBe(false);
        expect(Number.isNaN(r.individualFireNumber), `${seed}/${memberId} target NaN`).toBe(false);
        expect(r.attributableAnnualExpenses, `${seed}/${memberId} exp`).toBeGreaterThanOrEqual(0);
        expect(r.attributableCorpus, `${seed}/${memberId} corpus`).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(r.individualFireNumber), `${seed}/${memberId} finite target`).toBe(true);
        if (expectedAge === null) {
          // Measured unreachable (madhu: no salary, target ₹3.0 Cr) — must stay "not within horizon",
          // never a rendered finite absurd age (rule 31).
          expect(Number.isFinite(r.individualFireAge), `${seed}/${memberId} unreachable`).toBe(false);
          continue;
        }
        expect(Number.isFinite(r.individualFireAge), `${seed}/${memberId} reachable`).toBe(true);
        expect(r.individualFireAge, `${seed}/${memberId} lo`).toBeGreaterThanOrEqual(expectedAge - 1);
        expect(r.individualFireAge, `${seed}/${memberId} hi`).toBeLessThanOrEqual(expectedAge + 1);
        // Age and years must never disagree (the cross-screen-coherence class).
        expect(r.individualFireAge, `${seed}/${memberId} coherence`).toBe(
          Math.round(r.anchorAge + r.yearsToIndividualFire),
        );
      }
    }
  });
});

/**
 * Pure-kernel tests for derive() (Stage-T0 B-1).
 *
 * Exercises the kernel directly with plain inputs AND proves the wrapper
 * (useFireDerive) and the kernel agree byte-for-byte on the Sharmas headline —
 * the behaviour lock for the extraction.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { loadSeedPersona } from "@/lib/seed-persona";
import { useFireDerive } from "@/lib/useFireDerive";
import { derive, bridgeRentalPostTaxAnnual, SEC_24A_DEDUCTION_RATE } from "@/lib/derive";
import type { OtherIncomeLine } from "@/types/household";
import { calculateNpsWithdrawal, postTaxAnnuityIncome } from "@/lib/nps-withdrawal";
import { calculateYearsToTarget } from "@/lib/fire-math";

describe("derive() — pure kernel", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("the wrapper and the kernel produce a byte-identical Sharmas headline", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    const ui = useUiStore();
    loadSeedPersona(h, a);

    const wrapper = useFireDerive();
    const kernel = derive(h.data, a.values, {
      isFamilyView: ui.isFamilyView,
      viewingMemberId: ui.viewingMemberId,
      currentFY: ui.currentFY,
    });

    // Headline + every load-bearing aggregate must match exactly.
    expect(kernel.fireNumber).toBe(wrapper.fireNumber.value);
    expect(kernel.baseFireNumber).toBe(wrapper.baseFireNumber.value);
    expect(kernel.familyLayerCorpus).toBe(wrapper.familyLayerCorpus.value);
    expect(kernel.healthcareReservation).toBe(wrapper.healthcareReservation.value);
    expect(kernel.effectiveSWR).toBe(wrapper.effectiveSWR.value);
    expect(kernel.totalCorpus).toBe(wrapper.totalCorpus.value);
    expect(kernel.annualTax).toBe(wrapper.annualTax.value);
    expect(kernel.progressPercent).toBe(wrapper.progressPercent.value);
    expect(kernel.projection.length).toBe(wrapper.projection.value.length);
  });

  it("does NOT double-count SIP contributions — monthlyContribution = annualSavings/12 (gh-issue #11)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas — carries investment SIPs (monthlyContribution > 0)
    // Sanity: the seed genuinely has SIPs, else this test would prove nothing.
    const totalSip = h.data.investments.reduce((s, i) => s + (i.monthlyContribution ?? 0), 0);
    expect(totalSip).toBeGreaterThan(0);

    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    // Expenses EXCLUDE SIPs (UI contract), so SIP money is already inside annualSavings — it must
    // NOT be added again. The corpus-growth contribution is the savings residual alone.
    expect(k.monthlyContribution).toBe(Math.round(k.annualSavings / 12));
  });

  it("the Sharmas headline includes family layer + healthcare reservation on top of base", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.fireNumber).toBeGreaterThan(k.baseFireNumber);
    expect(k.fireNumber).toBeCloseTo(
      k.baseFireNumber + k.familyLayerCorpus + k.baseFireNumber * k.healthcareReservationPercent,
      0,
    );
  });

  it("is pure — same inputs yield an equal headline across repeated calls", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
    const first = derive(h.data, a.values, lens).fireNumber;
    const second = derive(h.data, a.values, lens).fireNumber;
    expect(first).toBe(second);
  });

  it("gh-issue #2 review: a member lens does not leak the other earner's employer NPS into this earner's tax", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: rohit + priya earners (not solo → member lens active)
    const lens = { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" };

    const priya = h.data.members.find((m) => m.id === "priya")!;

    priya.salary!.employerNpsAnnual = 0;
    const rohitTaxBaseline = derive(h.data, a.values, lens).annualTax;

    // Give ONLY Priya a large employer-NPS deduction.
    priya.salary!.employerNpsAnnual = 500_000;
    const rohitTaxAfter = derive(h.data, a.values, lens).annualTax;

    // Rohit's lensed tax must be unchanged — Priya's employer NPS is her deduction, not his.
    // (Before the fix, deriveDeductions summed unlensed members and leaked it into his tax.)
    expect(rohitTaxAfter).toBe(rohitTaxBaseline);
  });

  it("gh-issue #29: let-out rental is taxed on 70% NAV (Sec 24a) — but cash income stays FULL", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };

    // Control income so the household sits SOLIDLY in the 30% slab (≫ ₹12L rebate, < ₹50L
    // surcharge) — isolates a CLEAN marginal effect, away from rebate/surcharge cliffs.
    const rohit = h.data.members.find((m) => m.id === "rohit")!;
    const priya = h.data.members.find((m) => m.id === "priya")!;
    rohit.salary!.annualCTC = 3_000_000;
    priya.salary!.annualCTC = 0;

    const R = 240_000; // ₹20k/mo annualized, let-out
    const line = {
      id: "test-29-line",
      source: "Direct",
      amount: R,
      frequency: "A" as const,
      ownerId: rohit.id,
      isTaxExempt: false,
    };

    // Two scenarios differing ONLY in the income TYPE of one line, same gross R:
    //   Rental   → Sec 24(a): only 70% of R is taxable
    //   Interest → fully taxable
    h.data.otherIncome = [{ ...line, type: "Rental" as const }];
    const rental = derive(h.data, a.values, lens);

    h.data.otherIncome = [{ ...line, type: "Interest" as const }];
    const interest = derive(h.data, a.values, lens);

    // (1) CASH income IDENTICAL — the 30% standard deduction is a TAX fiction; the landlord still
    //     receives full rent. Guards against the naive "0.7×otherTaxable" fix, which would drop 30%
    //     of real cash and push FIRE LATER (a bigger error than the bug).
    expect(rental.annualIncome.total).toBe(interest.annualIncome.total);

    // (2) Rental taxed LESS — Sec 24(a) removes 0.3·R from taxable income. FAILS pre-fix (both
    //     currently enter grossIncome at full R → equal tax).
    expect(rental.annualTax).toBeLessThan(interest.annualTax);

    // (3) SUBSTANCE: at the 30% slab, removing 0.3·R saves ≈ (30% + 4% cess) × 0.3·R. Not just
    //     "less", but less by the RIGHT amount — and bounded by the hard invariant that a deduction
    //     of D cannot reduce tax by more than D.
    const taxSaving = interest.annualTax - rental.annualTax;
    const deduction = 0.3 * R;
    expect(taxSaving).toBeGreaterThan(0.28 * deduction); // ~30% slab floor
    expect(taxSaving).toBeLessThanOrEqual(deduction); // ≤ deducted income (no over-correction)
  });

  it("gh-issue #9: projected expenses grow at a constant NOMINAL inflation (real/nominal coherence)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const p = k.projection;
    expect(p.length).toBeGreaterThan(15);

    // Year 0 expense = today's expense (inflation^0). The classic FIRE bug is a real-vs-nominal
    // mismatch; this pins that expenses compound at a CONSTANT nominal rate, not a real/zero one.
    const base = p[0].inflatedAnnualExpenses;
    const ratio = p[1].inflatedAnnualExpenses / base;
    expect(ratio).toBeGreaterThan(1.05); // 4-bucket blended inflation ≈ 7.9% — NOT ~1.0 (real/zero)
    expect(ratio).toBeLessThan(1.1);
    for (const n of [5, 10, 15]) {
      const expected = base * Math.pow(ratio, n);
      expect(Math.abs(p[n].inflatedAnnualExpenses - expected) / expected).toBeLessThan(0.001);
    }

    // Corpus accumulates (nominal blended return + contributions) — not flat/shrinking.
    expect(p[10].corpus).toBeGreaterThan(p[0].corpus);
  });

  it("an empty household yields a zero corpus and zero progress (defensive)", () => {
    const a = useAssumptionsStore();
    const h = useHouseholdStore();
    // Empty household from the store's default shape.
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.totalCorpus).toBe(0);
    expect(k.progressPercent).toBe(0);
  });

  it("A14.2 — the Sharmas' ₹4L NPS (below the ₹5L threshold) yields no annuity → headline unchanged", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.npsAnnuityIncome).toBe(0);
    expect(k.fireWithdrawableCorpus).toBe(k.totalCorpus);
  });

  it("A14.2 — an NPS corpus above ₹5L lowers the required FIRE number vs the same household without NPS", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };

    const withoutNps = derive(h.data, a.values, lens).fireNumber;

    // Add a large NPS holding (> ₹5L) so the mandatory 40% annuity kicks in.
    h.addInvestment({ type: "NPS", label: "NPS top-up", value: 5_000_000, monthlyContribution: 0, ownerId: "rohit" });
    const withNps = derive(h.data, a.values, lens);

    // Annuity income is positive (40% × 50L × 6% = ₹1.2L/yr).
    expect(withNps.npsAnnuityIncome).toBeGreaterThan(0);
    // The FIRE number drops by ~ annuityIncome / SWR (the annuity's present value).
    expect(withNps.fireNumber).toBeLessThan(withoutNps);
    // The withdrawable corpus excludes the annuitised 40% (no double-count).
    expect(withNps.fireWithdrawableCorpus).toBeLessThan(withNps.totalCorpus);
  });

  it("M1 (#9): an enabled glide path de-risks late years → LOWER terminal corpus than the flat path", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };

    // Make the portfolio all-equity so the flat blended return == equityReturn (0.12),
    // which sits ABOVE the entire glide schedule (75→40% equity ⇒ 10.75%→9%). This
    // isolates the de-risking effect: every glide year compounds at or below the flat
    // rate, so the terminal corpus MUST be lower under glide. (A mixed portfolio would
    // conflate the 2-asset glide blend with the de-risking and muddy the direction.)
    h.data.investments = [];
    h.addInvestment({ type: "Stocks", label: "Equity", value: 5_000_000, monthlyContribution: 0, ownerId: "rohit" });

    const glideOff = { enabled: false, startEquityPercent: 75, endEquityPercent: 40, taperWindowYears: 10 };
    const glideOn = { enabled: true, startEquityPercent: 75, endEquityPercent: 40, taperWindowYears: 10 };

    h.data.glidePath = { ...glideOff };
    const off = derive(h.data, a.values, lens);
    h.data.glidePath = { ...glideOn };
    const on = derive(h.data, a.values, lens);

    expect(off.blendedReturn).toBeCloseTo(0.12, 5); // all-equity flat baseline
    // #20: real-framing enlarged yfat, so on/off projections now run to
    // DIFFERENT horizons (glide-on FIREs later → longer projection). Comparing
    // each path's OWN last point conflates horizon length with the de-risking
    // effect this test isolates — compare at a COMMON year index instead.
    const commonIdx = Math.min(off.projection.length, on.projection.length) - 1;
    const lastOff = off.projection[commonIdx].corpus;
    const lastOn = on.projection[commonIdx].corpus;
    expect(lastOn).toBeLessThan(lastOff);
    // The glide must NOT pull the FIRE crossover earlier (no optimistic bias).
    if (on.crossovers.regular.year != null && off.crossovers.regular.year != null) {
      expect(on.crossovers.regular.year).toBeGreaterThanOrEqual(off.crossovers.regular.year);
    }
    // The HEADLINE "years to FIRE" (FireHero uses yearsToRegular) must ALSO be
    // glide-aware — strictly later under de-risking, never earlier. This is the
    // lock that would fail if the headline regressed to the flat-return path.
    expect(on.yearsToRegular).toBeGreaterThan(off.yearsToRegular);
  });

  it("M1 (#9): enabling glide on a MIXED (sub-75%-equity) household never pulls FIRE earlier", () => {
    // Regression lock for the optimistic-shift bug rules 24/25 caught on the Sharmas:
    // a naive 2-asset rebase to 75% equity RAISED the return (their real equity weight
    // is below 75%) and pulled FIRE *earlier*. The anchored model (start from the actual
    // blended return, only ever shed equity downward) must guarantee glide ⇒ later-or-equal.
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas — mixed portfolio, actual equity weight < 75%
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };

    h.data.glidePath = { enabled: false, startEquityPercent: 75, endEquityPercent: 40, taperWindowYears: 10 };
    const off = derive(h.data, a.values, lens);
    h.data.glidePath = { enabled: true, startEquityPercent: 75, endEquityPercent: 40, taperWindowYears: 10 };
    const on = derive(h.data, a.values, lens);

    expect(on.yearsToRegular).toBeGreaterThanOrEqual(off.yearsToRegular);
    // Compare at a COMMON year index (see the all-equity test above for why).
    const commonIdx = Math.min(off.projection.length, on.projection.length) - 1;
    const lastOff = off.projection[commonIdx].corpus;
    const lastOn = on.projection[commonIdx].corpus;
    expect(lastOn).toBeLessThanOrEqual(lastOff);
  });

  it("M1 (#9): a non-glide seed accumulates monotonically at the flat blended return", () => {
    // NB: the BYTE-IDENTITY of the non-glide path is locked at the fire-math layer
    // (fire-math.spec.ts constant-function `toEqual`) + the Sharmas seed lock; this
    // test only guards that the default (glide-off) seed still accumulates sanely.
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // default glidePath.enabled === false
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
    const p = derive(h.data, a.values, lens).projection;
    expect(p[2].corpus).toBeGreaterThan(p[1].corpus);
    expect(p[1].corpus).toBeGreaterThan(p[0].corpus);
  });

  it("#20: headline FIRE is real-framed (CPI), REACHABLE, and agrees with the chart crossover", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
    const k = derive(h.data, a.values, lens);

    // (a) #21 trip-wire — regular FIRE MUST be reachable within the plan horizon.
    // The deflator bug (4-bucket healthcare blend ~7.9% instead of general CPI ~6%
    // to deflate market RETURNS) crushed the real return to ~0.9% and made the
    // crossover null (~age 115). A null/unreachable crossover for the flagship
    // accumulator seed is the failure this asserts against.
    expect(k.crossovers.regular.year, "Sharmas must reach regular FIRE within horizon").not.toBeNull();
    expect(k.crossovers.regular.age!).toBeLessThanOrEqual(k.planToAge);

    // (b) #20 agreement invariant — the headline years-to-FIRE and the chart
    // crossover must AGREE (they disagreed pre-fix: the headline was optimistic via
    // nominal-vs-frozen-target while the chart already inflated its target). The
    // residual gap is the flat-REAL (headline) vs flat-NOMINAL (chart) contribution
    // assumption + monthly-vs-annual granularity — bounded, not arbitrary.
    expect(Math.abs(k.corpusOnlyYearsToRegular - k.crossovers.regular.yearsFromNow!)).toBeLessThan(6);

    // (c) #20 real-frame direction — deflating returns by general CPI makes the
    // headline strictly LATER than the buggy nominal-return-vs-frozen-target years
    // (the optimistic-early guard; the old headline was ~22.8y, the honest one ~50y).
    const nominalFrameYears = calculateYearsToTarget(
      k.fireWithdrawableCorpus,
      k.fireNumber,
      k.monthlyContribution,
      k.blendedReturn,
    );
    expect(k.corpusOnlyYearsToRegular).toBeGreaterThan(nominalFrameYears);
  });

  it("#15 bridge: a fully-liquid household's headline is byte-identical (bridge covered, no move)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: true, viewingMemberId: null, currentFY: "2025-26" };
    // Replace the portfolio with a single fully-liquid equity holding → no locked
    // window → bridge trivially covered → headline == corpus-only adequacy age.
    h.data.investments = [];
    h.addInvestment({ type: "Stocks", label: "Equity", value: 5_000_000, monthlyContribution: 50_000, ownerId: "rohit" });
    const k = derive(h.data, a.values, lens);
    expect(k.bridgeCoverage).not.toBeNull();
    expect(k.bridgeCoverage!.covered).toBe(true);
    expect(k.yearsToRegular).toBe(k.corpusOnlyYearsToRegular);
  });

  it("#15 bridge: a corpus-adequate but LOCKED early-retiree's headline moves LATER than corpus-only", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: true, viewingMemberId: null, currentFY: "2025-26" };
    // Construct a household that is corpus-adequate very soon (huge current corpus,
    // so corpusOnlyYearsToRegular ≈ 0 at an early age) but with MOST of it locked
    // in a no-opening-year PPF (assumed locked till 60) → the liquid runway can't
    // bridge the early-retirement years → headline pushed later.
    h.data.investments = [];
    h.data.members.forEach((m) => { if (m.role === "EARNER") m.targetRetirementAge = 45; });
    h.addInvestment({ type: "FD", label: "Liquid", value: 2_000_000, monthlyContribution: 0, ownerId: "rohit" });
    h.addInvestment({ type: "PPF", label: "Big PPF", value: 200_000_000, monthlyContribution: 0, ownerId: "rohit" });
    const k = derive(h.data, a.values, lens);
    // Corpus is adequate almost immediately (₹20Cr ≫ FIRE number).
    expect(k.corpusOnlyYearsToRegular).toBeLessThan(5);
    expect(k.bridgeCoverage).not.toBeNull();
    expect(k.bridgeCoverage!.covered).toBe(false);
    expect(k.bridgeCoverage!.lockedCorpus).toBeGreaterThan(k.bridgeCoverage!.reachableCorpus);
    // The honest headline is LATER than the corpus-only adequacy age.
    expect(k.yearsToRegular).toBeGreaterThan(k.corpusOnlyYearsToRegular);
  });

  it("A2 (#7): the NPS annuity offset is the POST-TAX pension, not the gross figure", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    // Whole-household lens → the NPS corpus the kernel sees is deterministic.
    const lens = { isFamilyView: true, viewingMemberId: null, currentFY: "2025-26" };
    // Large NPS so the mandatory 40% annuity fires (> ₹5L).
    h.addInvestment({ type: "NPS", label: "NPS top-up", value: 8_000_000, monthlyContribution: 0, ownerId: "rohit" });

    const k = derive(h.data, a.values, lens);
    const npsCorpus = k.lensedInvestments
      .filter((i) => i.type === "NPS")
      .reduce((s, i) => s + i.value, 0);
    const gross = calculateNpsWithdrawal({ totalCorpus: npsCorpus }).annuityIncomeAnnual;

    expect(gross).toBeGreaterThan(0);
    expect(k.householdMarginalRate).toBeGreaterThan(0); // Sharmas sit in a taxable slab
    // The offset must equal the post-tax helper output — and be strictly below
    // gross. This is the lock that would FAIL if derive regressed to the old
    // optimistic gross-annuity offset.
    expect(k.npsAnnuityIncome).toBe(postTaxAnnuityIncome(gross, k.householdMarginalRate));
    expect(k.npsAnnuityIncome).toBeLessThan(gross);
  });
});

describe("bridgeRentalPostTaxAnnual — #29 bridge rental cash (Sec 24a), unit-tested directly (#32)", () => {
  const rental = (over: Partial<OtherIncomeLine> = {}): OtherIncomeLine => ({
    id: "r1",
    type: "Rental",
    source: "Direct",
    amount: 240_000,
    frequency: "A",
    ownerId: "m1",
    isTaxExempt: false,
    ...over,
  });

  it("let-out rental nets gross·(1−mr·0.7) — strictly MORE than the pre-fix gross·(1−mr)", () => {
    const mr = 0.3;
    const R = 240_000;
    const net = bridgeRentalPostTaxAnnual([rental()], mr);
    // Sec 24a: only 70% of NAV taxable → 240000·(1 − 0.3·0.7) = 240000·0.79 = 189600
    expect(net).toBeCloseTo(R * (1 - mr * (1 - SEC_24A_DEDUCTION_RATE)), 0);
    // pre-fix taxed the full gross → 240000·0.7 = 168000; the fix nets strictly more
    expect(net).toBeGreaterThan(R * (1 - mr));
  });

  it("tax-exempt rental nets FULL gross (no tax) — the exempt-asymmetry fix", () => {
    expect(bridgeRentalPostTaxAnnual([rental({ isTaxExempt: true })], 0.3)).toBe(240_000);
  });

  it("sums multiple rental lines and ignores non-rental other-income", () => {
    const net = bridgeRentalPostTaxAnnual(
      [
        rental({ id: "a", amount: 100_000 }),
        rental({ id: "b", amount: 50_000 }),
        rental({ id: "c", type: "Interest", amount: 999_999 }),
      ],
      0.3,
    );
    // (100000 + 50000)·0.79 = 118500; the Interest line is excluded
    expect(net).toBeCloseTo(150_000 * (1 - 0.3 * 0.7), 0);
  });

  it("zero marginal rate → full rent (nothing taxed)", () => {
    expect(bridgeRentalPostTaxAnnual([rental({ amount: 120_000 })], 0)).toBe(120_000);
  });
});

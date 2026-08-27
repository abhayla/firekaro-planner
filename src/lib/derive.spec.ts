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
import { derive, bridgeRentalPostTaxAnnual, SEC_24A_DEDUCTION_RATE, SEC_71_HP_LOSS_SETOFF_CAP } from "@/lib/derive";
import type { OtherIncomeLine } from "@/types/household";
import { calculateNpsWithdrawal, postTaxAnnuityIncome } from "@/lib/nps-withdrawal";
import { calculateYearsToTarget, calculateFIRENumber } from "@/lib/fire-math";
import { toMonthly } from "@/lib/cashflow";

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

  // gh #34: a non-earning (homemaker) spouse is an ADULT with longevity. The household plan
  // horizon MUST extend to the LONGEST-LIVED adult so the corpus covers a surviving spouse —
  // not stop at the earner's planToAge (which would under-provision her later years).
  it("gh #34: a non-earning adult's longevity extends the household plan-to horizon", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    // Earner plans to 88; homemaker spouse plans to 95. Household horizon must be 95.
    h.data.members = [
      {
        id: "you", name: "You", dateOfBirth: "1986-01-01", role: "ADULT",
        targetRetirementAge: 55, planToAge: 88, relation: "",
        city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married",
        employmentStatus: "Employed",
        salary: { annualCTC: 3_000_000, hikePercent: 8 },
      },
      {
        id: "spouse", name: "Spouse", dateOfBirth: "1988-01-01", role: "ADULT",
        planToAge: 95, relation: "Spouse",
        city: "Metro", health: "Healthy", riskAppetite: "Conservative", marital: "Married",
      },
    ] as typeof h.data.members;
    h.data.expenses.avgMonthly = 80_000;

    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.planToAge).toBe(95);
  });

  // gh #34 substance lock: extending the horizon to the longer-lived non-earning spouse must
  // RAISE the FIRE number (longer horizon → lower SWR → bigger corpus), not merely survive as a
  // field. Demoting her to a child DEPENDENT (no planToAge) drops the horizon back to the earner.
  it("gh #34: a non-earning spouse who outlives the earner RAISES the FIRE number vs. ignoring her longevity", () => {
    const a = useAssumptionsStore();
    const build = (spouseRole: "ADULT" | "DEPENDENT") => {
      const h = useHouseholdStore();
      h.data.members = [
        {
          id: "you", name: "You", dateOfBirth: "1986-01-01", role: "ADULT",
          targetRetirementAge: 55, planToAge: 85, relation: "",
          city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married",
          employmentStatus: "Employed", salary: { annualCTC: 3_000_000, hikePercent: 8 },
        },
        {
          id: "spouse", name: "Spouse", dateOfBirth: "1988-01-01", role: spouseRole,
          planToAge: spouseRole === "ADULT" ? 98 : null, relation: "Spouse",
          city: "Metro", health: "Healthy", riskAppetite: "Conservative", marital: "Married",
        },
      ] as typeof h.data.members;
      h.data.expenses.avgMonthly = 80_000;
      return derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    };
    setActivePinia(createPinia());
    const withSpouse = build("ADULT");
    setActivePinia(createPinia());
    const ignoringSpouse = build("DEPENDENT");

    expect(withSpouse.planToAge).toBe(98);
    expect(ignoringSpouse.planToAge).toBe(85);
    // The honest plan funds the surviving spouse to 98 → a strictly larger FIRE number.
    expect(withSpouse.fireNumber).toBeGreaterThan(ignoringSpouse.fireNumber);
  });

  // gh #67: a salary-less ADULT who owns an ACTIVE business is an earner (derived) — the only
  // genuinely-new classification the income-derived model introduces. Their business profit flows
  // into income and they count in lensedEarners; EPS/gratuity (salaried-only) correctly skip them.
  it("gh #67: a salary-less adult with an active business derives as an earner (businessShare counted)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.data.members = [
      {
        id: "owner", name: "Owner", dateOfBirth: "1986-01-01", role: "ADULT",
        targetRetirementAge: 55, planToAge: 88, relation: "",
        city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married",
      },
    ] as typeof h.data.members;
    h.data.businesses = [
      { id: "biz", name: "Shop", legalKind: "SoleProp", annualProfit: 1_800_000, frequency: "A",
        sharePercent: 100, ownerId: "owner", isOperated: true },
    ] as typeof h.data.businesses;
    h.data.expenses.avgMonthly = 60_000;

    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    // The business owner is a derived earner...
    expect(k.lensedEarners.length).toBe(1);
    expect(k.lensedEarners[0].id).toBe("owner");
    // ...whose business profit is in income (no salary, but businessShare > 0)...
    expect(k.annualIncome.salaryIncome).toBe(0);
    expect(k.annualIncome.businessShare).toBe(1_800_000);
    // ...and the FIRE headline is real (reachable, positive number).
    expect(k.fireNumber).toBeGreaterThan(0);
    expect(Number.isFinite(k.yearsToRegular)).toBe(true);
  });

  it("gh #34: when the earner is the longest-lived adult, the horizon stays the earner's planToAge", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.data.members = [
      {
        id: "you", name: "You", dateOfBirth: "1986-01-01", role: "ADULT",
        targetRetirementAge: 55, planToAge: 92, relation: "",
        city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married",
        employmentStatus: "Employed", salary: { annualCTC: 3_000_000, hikePercent: 8 },
      },
      {
        id: "spouse", name: "Spouse", dateOfBirth: "1988-01-01", role: "ADULT",
        planToAge: 85, relation: "Spouse",
        city: "Metro", health: "Healthy", riskAppetite: "Conservative", marital: "Married",
      },
    ] as typeof h.data.members;
    h.data.expenses.avgMonthly = 80_000;

    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.planToAge).toBe(92);
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

  // gh #66: the member lens re-scopes the member-attributable DISPLAY collections (income/
  // investments/liabilities/insurance/business) to the selected member + "Joint", while FIRE /
  // adequacy stays household-scoped (the #22/#23 honesty guardrail). These two tests lock both legs.
  it("gh #66: lensed display collections SHRINK to the selected member (+ Joint), and orthogonal to family-view", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: rohit + priya (earners), aarav + meera (dependents)
    const whole = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const lensed = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" });

    // Every member-attributable collection is re-scoped to rohit (+ Joint), so it is a STRICT subset.
    expect(lensed.lensedInvestments.length).toBeLessThan(whole.lensedInvestments.length);
    expect(lensed.lensedInvestments.length).toBeGreaterThan(0);
    expect(lensed.lensedInvestments.every((i) => i.ownerId === "rohit" || i.ownerId === "Joint")).toBe(true);
    expect(lensed.lensedEarners.length).toBe(1);
    expect(lensed.lensedEarners[0].id).toBe("rohit");
    expect(lensed.lensedLiabilities.every((l) => l.ownerId === "rohit" || l.ownerId === "Joint" || l.isSharedWithSpouse)).toBe(true);
    expect(lensed.lensedInsurance.every((p) => p.insuredPersonId === "rohit")).toBe(true);
    expect(lensed.lensedBusinesses.every((b) => b.ownerId === "rohit" || b.ownerId === "Joint")).toBe(true);
    expect(lensed.lensedOtherIncome.every((o) => o.ownerId === "rohit" || o.ownerId === "Joint")).toBe(true);
    // The lensed income DISPLAY changes too (only rohit's salary, not the household total).
    expect(lensed.annualIncome.salaryIncome).toBeLessThan(whole.annualIncome.salaryIncome);

    // #66 orthogonality: the member lens applies even with family-view ON.
    const lensedFamilyOn = derive(h.data, a.values, { isFamilyView: true, viewingMemberId: "rohit", currentFY: "2025-26" });
    expect(lensedFamilyOn.lensedInvestments.length).toBe(lensed.lensedInvestments.length);
    expect(lensedFamilyOn.annualIncome.salaryIncome).toBe(lensed.annualIncome.salaryIncome);
  });

  it("gh #66 honesty lock: FIRE number/age is INVARIANT to member selection (household figure)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const whole = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    for (const memberId of ["rohit", "priya", "aarav"]) {
      const lensed = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: memberId, currentFY: "2025-26" });
      // The household FIRE adequacy leg must NOT move when a member is viewed — the #22/#23 guardrail.
      expect(lensed.fireNumber, `FIRE number invariant under lens=${memberId}`).toBe(whole.fireNumber);
      expect(lensed.yearsToRegular, `years-to-FIRE invariant under lens=${memberId}`).toBe(whole.yearsToRegular);
      expect(lensed.totalCorpus, `corpus invariant under lens=${memberId}`).toBe(whole.totalCorpus);
      expect(lensed.annualSavings, `savings invariant under lens=${memberId}`).toBe(whole.annualSavings);
    }
  });

  // D-2026-06-13-02: the hero now LENSES to individualFireByMember — this locks the SOURCE is the
  // proper mini-household number (strictly below the household target, finite-or-honest age), so the
  // lensed headline can never be the absurd household-target ÷ 1 #22 class.
  it("D-2026-06-13-02: individualFireByMember gives a proper mini-household number per adult (hero headline source)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: 2 adults
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(k.individualFireByMember.length).toBeGreaterThanOrEqual(2);
    for (const r of k.individualFireByMember) {
      const ctx = `member=${r.memberId} fireNo=${r.individualFireNumber} age=${r.individualFireAge}`;
      // One adult's slice is STRICTLY below the whole-household target (never household ÷ 1).
      expect(r.individualFireNumber, `${ctx} — individual < household target`).toBeLessThan(k.fireNumber);
      expect(r.individualFireNumber, `${ctx} — positive`).toBeGreaterThan(0);
      // The age is finite-and-sane OR the honest Infinity sentinel — never a finite absurd age.
      if (Number.isFinite(r.individualFireAge)) {
        const planTo = h.data.members.find((m) => m.id === r.memberId)?.planToAge ?? 90;
        expect(r.individualFireAge, `${ctx} — within the member's horizon`).toBeLessThanOrEqual(planTo);
        expect(r.individualFireAge, `${ctx} — never before today`).toBeGreaterThanOrEqual(r.anchorAge);
      }
    }
  });

  it("member-lens cards: lensedTotalCorpus/Liabilities re-scope WITH their count (display twin), while the FIRE corpus stays household", () => {
    // Root cause this locks (prod bug — the dashboard Investments/Liabilities card showed a HOUSEHOLD
    // value beside a PER-MEMBER count → the value never refreshed under "Viewing as <member>"). The
    // fix exposes member-scoped display twins; this asserts (a) default-lens = household byte-identical,
    // (b) a member's twin is a STRICT subset and COHERENT with its lensed instrument/loan list, and
    // (c) the FIRE-math totalCorpus stays invariant (the #22/#23 guardrail is untouched).
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: rohit owns a strict subset of the household's investments
    const whole = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    // (a) default lens → display twin equals the household total (no visible change on "Whole household").
    expect(whole.lensedTotalCorpus).toBe(whole.totalCorpus);
    expect(whole.lensedTotalLiabilitiesValue).toBe(whole.totalLiabilitiesValue);

    const rohit = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" });
    // (b) the twin RE-SCOPES (the fix): rohit's investable corpus is a strict subset of the household's…
    expect(rohit.lensedTotalCorpus).toBeLessThan(whole.lensedTotalCorpus);
    expect(rohit.lensedTotalCorpus).toBeGreaterThan(0);
    // …and the corpus DISPLAY corresponds to the corpus-eligible slice of the SAME lensed list that
    // drives the card's instrument COUNT — value and count come from one scope (kills the incoherence).
    expect(rohit.lensedInvestments.length).toBeLessThan(whole.lensedInvestments.length);
    // (c) the FIRE-math household corpus is UNCHANGED under the lens — guardrail preserved.
    expect(rohit.totalCorpus).toBe(whole.totalCorpus);

    // (d) Joint assets are INTENTIONALLY visible at full value in EVERY member's own view (the
    // established lens semantic — a co-owned asset is fully accessible to each owner; FinTech-noted).
    // So Σ(members) OVER-counts the household by exactly the Joint overlap — locking this documents the
    // overlap is deliberate and guards against a future "silently split Joint per owner" regression.
    const priya = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "priya", currentFY: "2025-26" });
    expect(rohit.lensedTotalCorpus + priya.lensedTotalCorpus).toBeGreaterThan(whole.lensedTotalCorpus);
  });

  // #81 Phase 1: member-attributable itemised expenses. The lensed expense DISPLAY mirrors
  // lensedInvestments (member's own + the always-shared "Household"); the consolidated view
  // shows all; and the HOUSEHOLD expense/FIRE total stays INVARIANT to member selection.
  it("#81 Phase 1: lensed expenses = member's own + Household; consolidated = all; household total invariant", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // rohit + priya (adults) · aarav + meera (dependents)
    h.addRecurring({ label: "Rohit gym", amount: 3000, frequency: "M", source: "manual", ownerId: "rohit" });
    h.addRecurring({ label: "Priya yoga", amount: 2500, frequency: "M", source: "manual", ownerId: "priya" });
    h.addRecurring({ label: "Groceries", amount: 20000, frequency: "M", source: "manual", ownerId: "Household" });
    h.addRecurring({ label: "Kids tuition", amount: 8000, frequency: "M", source: "manual", ownerId: "Dependents" });
    h.addRecurring({ label: "Aarav coaching", amount: 5000, frequency: "M", source: "manual", ownerId: "aarav" });

    const whole = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    // Consolidated: every recurring line is visible.
    expect(whole.lensedRecurringExpenses.length).toBe(h.data.expenses.recurring.length);
    // Coherence: the default-lens monthly total equals avgMonthly + ALL itemised monthly.
    const fullMonthly =
      h.data.expenses.avgMonthly +
      h.data.expenses.recurring.reduce((s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }), 0);
    expect(whole.lensedMonthlyExpenses).toBeCloseTo(fullMonthly, 2);

    // Lensed to rohit: only rohit's own + the shared "Household"; never priya's / Dependents / a child's.
    const lensed = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" });
    const labels = lensed.lensedRecurringExpenses.map((r) => r.label);
    expect(labels).toContain("Rohit gym");
    expect(labels).toContain("Groceries");
    expect(labels).not.toContain("Priya yoga");
    expect(labels).not.toContain("Kids tuition");
    expect(labels).not.toContain("Aarav coaching");
    expect(
      lensed.lensedRecurringExpenses.every((r) => {
        const o = r.ownerId ?? "Household";
        return o === "rohit" || o === "Household";
      }),
    ).toBe(true);
    // Lensed itemised set is a strict subset of consolidated.
    expect(lensed.lensedRecurringExpenses.length).toBeLessThan(whole.lensedRecurringExpenses.length);

    // HONESTY LOCK: the household expense + FIRE totals are INVARIANT to member selection.
    expect(lensed.annualExpensesToday, "household annual expenses invariant under lens").toBe(whole.annualExpensesToday);
    expect(lensed.fireNumber, "FIRE number invariant under lens").toBe(whole.fireNumber);

    // lensedPlannedExpenses lenses identically (own + Household; never another member's).
    h.addPlannedFuture({ label: "Priya sabbatical", todayAmount: 500000, targetYear: 2032, isMultiYear: false, ownerId: "priya" });
    h.addPlannedFuture({ label: "Family Europe trip", todayAmount: 800000, targetYear: 2030, isMultiYear: false, ownerId: "Household" });
    const wholeP = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const rohitP = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" });
    expect(wholeP.lensedPlannedExpenses.map((p) => p.label)).toEqual(
      expect.arrayContaining(["Priya sabbatical", "Family Europe trip"]),
    );
    const rohitPlanned = rohitP.lensedPlannedExpenses.map((p) => p.label);
    expect(rohitPlanned).toContain("Family Europe trip"); // Household — shared, visible
    expect(rohitPlanned).not.toContain("Priya sabbatical"); // Priya's own — hidden under Rohit
  });

  // #81 Phase 2: standalone individual FIRE is ADDED alongside the household number — the household
  // path stays byte-identical + invariant, and the gap = household exp − Σ(adults attributable).
  it("#81 Phase 2: individual FIRE added per adult; household path byte-identical + invariant", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const before = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });

    // One individual-FIRE entry per ADULT (rohit, priya); dependents excluded.
    expect(before.individualFireByMember.map((r) => r.memberId).sort()).toEqual(["priya", "rohit"]);
    // Each individual FIRE number is domain-sane (rule 31) and POSITIVE.
    for (const r of before.individualFireByMember) {
      expect(r.individualFireNumber).toBeGreaterThan(0);
      expect(r.individualFireNumber).toBeLessThan(before.fireNumber); // a single adult's slice < the whole household target
    }
    // Gap = household expenses − Σ(adults' attributable). For the all-shared 50/50 seed it is ~0.
    const sumAttr = before.individualFireByMember.reduce((s, r) => s + r.attributableAnnualExpenses, 0);
    expect(before.individualFireExpenseGapAnnual).toBe(Math.max(0, Math.round(before.annualExpensesToday - sumAttr)));
    expect(before.individualFireExpenseGapAnnual).toBeGreaterThanOrEqual(0);

    // HONESTY LOCK: viewing an adult does NOT move the household number (individual block is additive).
    for (const id of ["rohit", "priya", "aarav"]) {
      const lensed = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: id, currentFY: "2025-26" });
      expect(lensed.fireNumber, `household FIRE invariant under lens=${id}`).toBe(before.fireNumber);
      expect(lensed.yearsToRegular, `years invariant under lens=${id}`).toBe(before.yearsToRegular);
    }

    // A dependents-tagged cost raises the GAP but NOT any adult's individual FIRE.
    h.addRecurring({ label: "Kids school", amount: 50000, frequency: "M", source: "manual", ownerId: "Dependents" });
    const after = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    expect(after.individualFireExpenseGapAnnual).toBeGreaterThan(before.individualFireExpenseGapAnnual);
    const rohitBefore = before.individualFireByMember.find((r) => r.memberId === "rohit")!;
    const rohitAfter = after.individualFireByMember.find((r) => r.memberId === "rohit")!;
    expect(rohitAfter.attributableAnnualExpenses).toBeCloseTo(rohitBefore.attributableAnnualExpenses, 0);
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

  // ── gh-issue #32: §24(b) home-loan interest + municipal taxes + §71 loss cap ──
  // Differential pattern, mirroring #29: hold EVERYTHING constant except the one rental field under
  // test, in a clean 30%-slab band (₹30L salary, ≪ ₹50L surcharge, ≫ ₹12L rebate).
  describe("gh-issue #32: let-out rental §24(b)/municipal/§71", () => {
    function thirtyPctSlabHousehold() {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      loadSeedPersona(h, a);
      const rohit = h.data.members.find((m) => m.id === "rohit")!;
      const priya = h.data.members.find((m) => m.id === "priya")!;
      rohit.salary!.annualCTC = 3_000_000;
      priya.salary!.annualCTC = 0;
      const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" };
      const baseLine = {
        id: "test-32-line",
        source: "Direct",
        amount: 240_000, // ₹2.4L/yr let-out rent
        frequency: "A" as const,
        ownerId: rohit.id,
        isTaxExempt: false,
        type: "Rental" as const,
      };
      return { h, a, lens, baseLine };
    }

    it("(a) home-loan interest lowers tax by ≈ marginalRate×interest; CASH unchanged", () => {
      const { h, a, lens, baseLine } = thirtyPctSlabHousehold();
      const INTEREST = 100_000;

      h.data.otherIncome = [{ ...baseLine }]; // no interest
      const noInterest = derive(h.data, a.values, lens);

      h.data.otherIncome = [{ ...baseLine, homeLoanInterest: INTEREST }];
      const withInterest = derive(h.data, a.values, lens);

      // CASH basis UNCHANGED — §24(b) is a TAX-ONLY deduction; the landlord still receives full rent
      // and the EMI is already a separate household expense. (Same trap #29's review caught.)
      expect(withInterest.annualIncome.total).toBe(noInterest.annualIncome.total);

      // Taxed strictly LESS, and by ≈ marginalRate × interest (30% slab + 4% cess ⇒ ~31.2%).
      const taxSaving = noInterest.annualTax - withInterest.annualTax;
      const mr = withInterest.householdMarginalRate; // slab rate (excl. cess)
      expect(taxSaving).toBeGreaterThan(0); // FAILS pre-#32 (interest ignored ⇒ equal tax)
      expect(taxSaving).toBeGreaterThan(mr * INTEREST * 0.95); // ~marginal, with cess headroom
      expect(taxSaving).toBeLessThanOrEqual(INTEREST); // deduction of D can't save more than D
    });

    it("(b) municipal taxes reduce taxable income further (GAV→NAV); CASH unchanged", () => {
      const { h, a, lens, baseLine } = thirtyPctSlabHousehold();
      const MUNI = 30_000;

      h.data.otherIncome = [{ ...baseLine }];
      const noMuni = derive(h.data, a.values, lens);

      h.data.otherIncome = [{ ...baseLine, municipalTaxes: MUNI }];
      const withMuni = derive(h.data, a.values, lens);

      expect(withMuni.annualIncome.total).toBe(noMuni.annualIncome.total); // cash unchanged
      // NAV drops by MUNI, and only 70% of NAV is taxable ⇒ taxable falls by 0.7×MUNI.
      const taxSaving = noMuni.annualTax - withMuni.annualTax;
      const taxableDrop = 0.7 * MUNI;
      const mr = withMuni.householdMarginalRate;
      expect(taxSaving).toBeGreaterThan(0);
      expect(taxSaving).toBeGreaterThan(mr * taxableDrop * 0.95);
      expect(taxSaving).toBeLessThanOrEqual(taxableDrop); // ≤ the income actually removed
    });

    it("(c) §71: a house-property LOSS sets off against other income only up to ₹2L", () => {
      const { h, a, lens, baseLine } = thirtyPctSlabHousehold();
      // NAV = 0.7 × 240k = ₹168k. Interest ₹2,500,000 ⇒ netHP = 168k − 2,500,000 = −₹2,332,000.
      // §71 caps the loss set-off at ₹2L: taxableHP = −₹200,000. So vs a zero-interest rental
      // (taxable = +₹168k), interest can reduce taxable income by AT MOST (168k + 200k) = ₹368k —
      // NOT the full ₹2.33M loss. The uncapped remainder would carry forward 8 yrs (out of scope).
      const HUGE_INTEREST = 2_500_000;

      h.data.otherIncome = [{ ...baseLine }]; // taxable HP = +0.7·240k
      const noInterest = derive(h.data, a.values, lens);

      h.data.otherIncome = [{ ...baseLine, homeLoanInterest: HUGE_INTEREST }];
      const cappedLoss = derive(h.data, a.values, lens);

      expect(cappedLoss.annualIncome.total).toBe(noInterest.annualIncome.total); // cash unchanged

      const taxSaving = noInterest.annualTax - cappedLoss.annualTax;
      const mr = cappedLoss.householdMarginalRate;
      // Max taxable income removed = NAV (0.7·240k = 168k, no longer taxed) + the ₹2L §71 loss set-off.
      const maxTaxableRemoved = 0.7 * 240_000 + 200_000;
      // The saving must NOT exceed marginalRate(+cess ~1.04) × that capped amount. If §71 were missing,
      // the engine would deduct the full ₹2.33M loss and the saving would blow past this bound.
      expect(taxSaving).toBeLessThanOrEqual(maxTaxableRemoved * (mr + 0.05));
    });

    it("(d) CASH basis identical across no-tax-fields / interest / municipal / capped-loss", () => {
      const { h, a, lens, baseLine } = thirtyPctSlabHousehold();
      h.data.otherIncome = [{ ...baseLine }];
      const plain = derive(h.data, a.values, lens).annualIncome.total;

      h.data.otherIncome = [{ ...baseLine, homeLoanInterest: 100_000 }];
      const withInterest = derive(h.data, a.values, lens).annualIncome.total;

      h.data.otherIncome = [{ ...baseLine, municipalTaxes: 30_000 }];
      const withMuni = derive(h.data, a.values, lens).annualIncome.total;

      h.data.otherIncome = [{ ...baseLine, homeLoanInterest: 2_500_000 }];
      const cappedLoss = derive(h.data, a.values, lens).annualIncome.total;

      // The cash a landlord receives is the full rent in EVERY case — tax fields never touch it.
      expect(withInterest).toBe(plain);
      expect(withMuni).toBe(plain);
      expect(cappedLoss).toBe(plain);
    });

    it("(e) §71 cap is AGGREGATE: one loss + one profitable rental net BEFORE the ₹2L cap bites", () => {
      const { h, a, lens, baseLine } = thirtyPctSlabHousehold();
      h.data.otherIncome = [];
      const noRental = derive(h.data, a.values, lens);

      // A: rent ₹2L, interest ₹15L → houseProperty = 2L·0.7 − 15L = −13.6L (loss)
      // B: rent ₹5L, no interest    → houseProperty = 5L·0.7 = +3.5L (profit)
      // AGGREGATE netHP = −10.1L → §71 caps the SET-OFF at −₹2L → tax LOWER than salary-only by ≈mr·2L.
      // PER-PROPERTY capping (the regression this guards) would cap A at −2L, leaving net +1.5L taxable
      // → tax HIGHER. The sign of the tax change distinguishes the two mechanics.
      h.data.otherIncome = [
        { ...baseLine, id: "rA", amount: 200_000, homeLoanInterest: 1_500_000 },
        { ...baseLine, id: "rB", amount: 500_000 },
      ];
      const twoRentals = derive(h.data, a.values, lens);

      expect(twoRentals.annualTax).toBeLessThan(noRental.annualTax); // a capped LOSS, not net profit
      const saving = noRental.annualTax - twoRentals.annualTax;
      expect(saving).toBeGreaterThan(0.28 * SEC_71_HP_LOSS_SETOFF_CAP); // ≈30%+cess on the ₹2L set-off
      expect(saving).toBeLessThanOrEqual(SEC_71_HP_LOSS_SETOFF_CAP); // can't save more than the capped loss
      // Cash unchanged: BOTH full rents (₹2L + ₹5L) flow to income regardless of the tax treatment.
      expect(twoRentals.annualIncome.total).toBe(noRental.annualIncome.total + 700_000);
    });
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

    const withoutNps = derive(h.data, a.values, lens);

    // Add a large NPS holding (> ₹5L) so the mandatory 40% annuity kicks in.
    h.addInvestment({ type: "NPS", label: "NPS top-up", value: 5_000_000, monthlyContribution: 0, ownerId: "rohit" });
    const withNps = derive(h.data, a.values, lens);

    // Annuity income is positive (40% × 50L × 6% = ₹1.2L/yr).
    expect(withNps.npsAnnuityIncome).toBeGreaterThan(0);
    // The FIRE number drops by ~ annuityIncome / SWR (the annuity's present value).
    expect(withNps.fireNumber).toBeLessThan(withoutNps.fireNumber);
    // The withdrawable corpus excludes the annuitised 40% (no double-count).
    expect(withNps.fireWithdrawableCorpus).toBeLessThan(withNps.totalCorpus);

    // #17 cross-leg "annuity-once" SUBSTANCE lock (no double-offset): the adequacy leg
    // must reduce the FIRE number by EXACTLY ONE annuity's present value. The base FIRE
    // number (pre healthcare-reservation multiplier) is calculateFIRENumber(netAnnualExpenses)
    // where net = annualExpensesToday − npsAnnuityIncome — the annuity subtracted ONCE.
    // If a refactor double-offset it (gross − 2·annuity, the optimistic bug), this exact
    // reconstruction from the engine's own exposed inputs would fail. (NB: assert against
    // baseFireNumber, not fireNumber — the latter applies the healthcare-reservation
    // multiplier on top. The bridge leg separately receives GROSS expenses — annuity
    // credited once there via the NPS holding's own income stream — guarded by the
    // contract at derive.ts ~line 605.)
    const expectedBase = calculateFIRENumber(
      withNps.annualExpensesToday - withNps.npsAnnuityIncome,
      withNps.effectiveSWR,
      withNps.anchorAge,
    );
    expect(withNps.baseFireNumber).toBe(expectedBase);
    // The drop vs no-NPS is one annuity PV, never two (a second offset would drop further).
    const oneAnnuityDrop = withoutNps.baseFireNumber - withNps.baseFireNumber;
    const twoAnnuityDrop =
      withoutNps.baseFireNumber -
      calculateFIRENumber(
        withNps.annualExpensesToday - 2 * withNps.npsAnnuityIncome,
        withNps.effectiveSWR,
        withNps.anchorAge,
      );
    expect(oneAnnuityDrop).toBeGreaterThan(0);
    expect(oneAnnuityDrop).toBeLessThan(twoAnnuityDrop);
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
    h.data.members.forEach((m) => { if (m.role === "ADULT") m.targetRetirementAge = 45; });
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

describe("seed-anchor regression locks (gh-issue #17 — catch silent adequacy-leg drift)", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("Sharmas default-lens headline is pinned (a future #23 refactor can't silently drift it)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    // Pinned to the known-good values (re-anchored 2026-08-27, T-376/gh-#165). The byte-identical
    // wrapper/kernel test only proves the two agree with EACH OTHER; this anchors the ACTUAL headline
    // so a future adequacy-leg refactor (#23) that silently drifts it is a CI failure. FIRE age ≈ 59
    // (anchor 33 + ~25.67y), comfortably under the #22 sanity ceiling.
    // Re-anchor note: this moved from 25.58y/₹105,482,068 → 25.67y/₹105,982,068 (a +₹5,00,000 shift)
    // when T-376 fixed the Tier-0 honesty bug (gh-#165): the Sharmas seed's kind-less "Foreign
    // vacation" plannedFuture line (`seed-persona.ts`, no `kind` set → defaults to 'general') now
    // correctly enters the FIRE-number family-layer lump, matching every other planned goal. This is
    // the EXPECTED, intended effect of the fix, not drift.
    expect(k.yearsToRegular).toBeCloseTo(25.67, 2);
    expect(Math.round(k.fireNumber)).toBe(105_982_068);
  });
});

describe("T-376/gh-#165 — 'general' planned goals enter the FIRE number (Tier-0 honesty fix)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("a general planned goal (house upgrade) increases fireNumber and pushes FIRE strictly later", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

    const before = derive(h.data, a.values, lens);

    h.addPlannedFuture({
      label: "House upgrade",
      todayAmount: 10_000_000, // ₹1 Cr
      targetYear: new Date().getFullYear() + 6,
      isMultiYear: false,
      kind: "general",
    });

    const after = derive(h.data, a.values, lens);

    // The lump is a one-shot addition to the family-layer corpus — not divided by SWR.
    expect(after.familyLayerCorpus - before.familyLayerCorpus).toBeCloseTo(10_000_000, 0);
    expect(after.fireNumber).toBeGreaterThan(before.fireNumber);
    expect(after.corpusOnlyYearsToRegular).toBeGreaterThan(before.corpusOnlyYearsToRegular);
    expect(after.yearsToRegular).toBeGreaterThan(before.yearsToRegular);
  });

  it("removing the general goal restores a byte-identical headline to today (no regression)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

    const before = derive(h.data, a.values, lens);

    const added = h.addPlannedFuture({
      label: "House upgrade",
      todayAmount: 10_000_000,
      targetYear: new Date().getFullYear() + 6,
      isMultiYear: false,
      kind: "general",
    });
    h.removePlannedFuture(added.id);

    const after = derive(h.data, a.values, lens);
    expect(after.fireNumber).toBe(before.fireNumber);
    expect(after.yearsToRegular).toBe(before.yearsToRegular);
  });

  it("a 'medical'-kind and a kind-less (v4-faithful default) planned goal ALSO enter the FIRE number", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

    const before = derive(h.data, a.values, lens);

    h.addPlannedFuture({
      label: "Major surgery reserve",
      todayAmount: 2_000_000,
      targetYear: new Date().getFullYear() + 3,
      isMultiYear: false,
      kind: "medical",
    });
    h.addPlannedFuture({
      label: "Unclassified goal",
      todayAmount: 1_000_000,
      targetYear: new Date().getFullYear() + 2,
      isMultiYear: false,
      // kind intentionally omitted — v4-faithful default must still count.
    });

    const after = derive(h.data, a.values, lens);
    expect(after.familyLayerCorpus - before.familyLayerCorpus).toBeCloseTo(3_000_000, 0);
    expect(after.fireNumber).toBeGreaterThan(before.fireNumber);
  });
});

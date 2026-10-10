/**
 * #232 — CONSERVATION LAW of the member lens: for every row (asset, contribution, income, expense,
 * loan balance, EMI), Σ over the household's adults of that adult's attributed amount == the row's
 * real amount, at ANY split %. Checked per row (the share functions) and end to end (the sums of
 * `computeIndividualFire`'s attributable fields against the household's in-scope totals), on the
 * five real seeds and on fast-check-generated ownership layouts.
 *
 * Before the fix (main @ c191d74) every adult took `split` of every shared row (Σ = 120% at split 60)
 * and a shared loan gave its owner 100% plus the spouse `split` (Σ = 150% at the default 50).
 */
import fc from "fast-check";
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadRaviSeed } from "@/seeds/ravi";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { computeIndividualFire } from "@/lib/individual-fire";
import { ownedRowShare, liabilityShare, expenseRowShare } from "@/lib/member-row-share";
import { isAdultRole, type Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import { toMonthly, toAnnual } from "@/lib/cashflow";
import { isEarningMember } from "@/lib/member-earning";

type HStore = ReturnType<typeof useHouseholdStore>;
type AStore = ReturnType<typeof useAssumptionsStore>;
const SEEDS: Record<string, (h: HStore, a: AStore) => void> = {
  Sharmas: (h, a) => loadSeedPersona(h, a),
  Iyers: (h, a) => loadIyersSeed(h, a),
  Mehtas: (h, a) => loadMehtasSeed(h, a),
  Mauryas: (h, a) => loadMauryasSeed(h, a),
  Ravi: (h, a) => loadRaviSeed(h, a),
};
const SPLITS = [30, 50, 60, 70];
const ASOF = new Date("2026-10-10T00:00:00");

function adultsOf(d: Household) {
  return d.members.filter((m) => isAdultRole(m.role));
}

/** The real amount of every row the adults (or the couple) own — what the member shares must sum to. */
function inScopeTotals(d: Household) {
  const ids = new Set(adultsOf(d).map((m) => m.id));
  const inScope = (o: string | undefined) => o === "Joint" || o === "Household" || (o != null && ids.has(o));
  const fireInv = d.investments.filter(
    (i) => !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence") && inScope(i.ownerId),
  );
  return {
    corpus: fireInv.reduce((s, i) => s + i.value, 0),
    liabilities: d.liabilities
      .filter((l) => l.isSharedWithSpouse || inScope(l.ownerId))
      .reduce((s, l) => s + l.outstandingBalance, 0),
    expenses:
      (d.expenses.avgMonthly +
        d.expenses.recurring
          .filter((r) => {
            const loan = r.source === "auto-loan" ? d.liabilities.find((l) => l.id === r.sourceRefId) : undefined;
            return loan ? loan.isSharedWithSpouse || inScope(loan.ownerId) : inScope(r.ownerId ?? "Household");
          })
          .reduce((s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }), 0)) *
      12,
    income:
      adultsOf(d).reduce((s, m) => s + (isEarningMember(m, d.businesses) ? m.salary?.annualCTC ?? 0 : 0), 0) +
      d.otherIncome.filter((o) => inScope(o.ownerId)).reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0) +
      d.businesses
        .filter((b) => inScope(b.ownerId))
        .reduce((s, b) => s + toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100), 0),
  };
}

/** Per-row law: the adults' shares of every row sum to exactly 1 (in-scope) or 0 (dependent-owned). */
function expectRowsConserved(d: Household, splitPercent: number) {
  const adults = adultsOf(d);
  const ids = new Set(adults.map((m) => m.id));
  const total = (f: (memberId: string) => number) => adults.reduce((s, m) => s + f(m.id), 0);
  const expected = (owner: string | undefined) =>
    owner === "Joint" || owner === "Household" || (owner != null && ids.has(owner)) ? 1 : 0;
  for (const i of d.investments) {
    expect(total((id) => ownedRowShare(d, id, splitPercent, i.ownerId)), `asset ${i.id}`).toBeCloseTo(expected(i.ownerId), 12);
  }
  for (const o of [...d.otherIncome, ...d.businesses]) {
    expect(total((id) => ownedRowShare(d, id, splitPercent, o.ownerId)), `income ${o.id}`).toBeCloseTo(expected(o.ownerId), 12);
  }
  for (const l of d.liabilities) {
    const want = l.isSharedWithSpouse ? 1 : expected(l.ownerId);
    expect(total((id) => liabilityShare(d, id, splitPercent, l)), `loan ${l.id}`).toBeCloseTo(want, 12);
  }
  for (const r of d.expenses.recurring) {
    const loan = r.source === "auto-loan" ? d.liabilities.find((l) => l.id === r.sourceRefId) : undefined;
    const want = loan ? (loan.isSharedWithSpouse ? 1 : expected(loan.ownerId)) : expected(r.ownerId ?? "Household");
    expect(total((id) => expenseRowShare(d, id, splitPercent, r)), `expense ${r.id}`).toBeCloseTo(want, 12);
  }
}

/** End-to-end law: Σ adults' attributable figures == the in-scope household totals (±₹1 rounding per adult). */
function expectKernelConserved(d: Household, values: Assumptions) {
  const adults = adultsOf(d);
  const rs = adults.map((m) => computeIndividualFire(d, values, m.id, "2025-26", undefined, ASOF)!);
  const sum = (k: "attributableCorpus" | "attributableLiabilitiesValue" | "attributableAnnualExpenses" | "attributableAnnualIncome") =>
    rs.reduce((s, r) => s + r[k], 0);
  const t = inScopeTotals(d);
  const tol = adults.length;
  expect(Math.abs(sum("attributableCorpus") - t.corpus), "corpus").toBeLessThanOrEqual(tol);
  expect(Math.abs(sum("attributableLiabilitiesValue") - t.liabilities), "liabilities").toBeLessThanOrEqual(tol);
  expect(Math.abs(sum("attributableAnnualExpenses") - t.expenses), "expenses").toBeLessThanOrEqual(tol * 12);
  expect(Math.abs(sum("attributableAnnualIncome") - t.income), "income").toBeLessThanOrEqual(tol);
}

describe("#232 member-lens conservation law (Σ member shares == the row)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const [name, load] of Object.entries(SEEDS)) {
    for (const split of SPLITS) {
      it(`${name} @ split ${split}: every row and every attributable total is conserved`, () => {
        const h = useHouseholdStore();
        const a = useAssumptionsStore();
        load(h, a);
        a.values.householdSplitPercent = split;
        expectRowsConserved(h.data, split);
        expectKernelConserved(h.data, a.values);
      });
    }
  }

  it("a shared loan is never the owner's 100% plus the spouse's split (Sharmas ₹38L at split 60)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    a.values.householdSplitPercent = 60;
    const shared = h.data.liabilities.filter((l) => l.isSharedWithSpouse);
    expect(shared.length).toBeGreaterThan(0);
    const rohit = computeIndividualFire(h.data, a.values, "rohit", "2025-26", undefined, ASOF)!;
    const priya = computeIndividualFire(h.data, a.values, "priya", "2025-26", undefined, ASOF)!;
    const sharedTotal = shared.reduce((s, l) => s + l.outstandingBalance, 0);
    expect(rohit.attributableLiabilitiesValue + priya.attributableLiabilitiesValue).toBe(
      h.data.liabilities.reduce((s, l) => s + l.outstandingBalance, 0),
    );
    expect(priya.attributableLiabilitiesValue).toBeCloseTo(0.4 * sharedTotal, 0);
  });

  it("a single adult carries 100% of the shared pool (Ravi), never only `split` of it", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadRaviSeed(h, a);
    a.values.householdSplitPercent = 50;
    const ravi = computeIndividualFire(h.data, a.values, adultsOf(h.data)[0].id, "2025-26", undefined, ASOF)!;
    expect(Math.abs(ravi.attributableAnnualExpenses - inScopeTotals(h.data).expenses)).toBeLessThanOrEqual(12);
  });

  it("property: any ownership layout, any split, 2 or 3 adults — every row and total is conserved", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const base = JSON.parse(JSON.stringify(h.data)) as Household;
    const baseValues = JSON.parse(JSON.stringify(a.values)) as Assumptions;
    const owners = ["rohit", "priya", "Joint", "aarav"];
    const expenseOwners = ["rohit", "priya", "Household", "Dependents"];
    const nInv = base.investments.length;
    const nLoan = base.liabilities.length;
    const nExp = base.expenses.recurring.length;
    const nInc = base.otherIncome.length + base.businesses.length;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        fc.array(fc.constantFrom(...owners), { minLength: nInv, maxLength: nInv }),
        fc.array(fc.record({ owner: fc.constantFrom(...owners), shared: fc.boolean() }), { minLength: nLoan, maxLength: nLoan }),
        fc.array(fc.constantFrom(...expenseOwners), { minLength: nExp, maxLength: nExp }),
        fc.array(fc.constantFrom(...owners), { minLength: nInc, maxLength: nInc }),
        (split, thirdAdult, invOwners, loanOwners, expOwners, incOwners) => {
          const d = JSON.parse(JSON.stringify(base)) as Household;
          const values = { ...baseValues, householdSplitPercent: split };
          if (thirdAdult) {
            const priya = d.members.find((m) => m.id === "priya")!;
            d.members.push({ ...priya, id: "third", name: "Third", salary: undefined });
          }
          d.investments.forEach((i, k) => (i.ownerId = invOwners[k]));
          d.liabilities.forEach((l, k) => {
            l.ownerId = loanOwners[k].owner === "Joint" ? "rohit" : loanOwners[k].owner;
            l.isSharedWithSpouse = loanOwners[k].shared;
          });
          // An auto-flowed EMI carries its loan's owner (store `autoFlowEMIToRecurring`), so only the
          // non-loan rows take a generated owner.
          d.expenses.recurring.forEach((r, k) => {
            const loan = r.source === "auto-loan" ? d.liabilities.find((l) => l.id === r.sourceRefId) : undefined;
            r.ownerId = loan ? loan.ownerId : expOwners[k];
          });
          [...d.otherIncome, ...d.businesses].forEach((o, k) => (o.ownerId = incOwners[k]));
          expectRowsConserved(d, split);
          expectKernelConserved(d, values);
        },
      ),
      { numRuns: 60, seed: 232 },
    );
  });
});

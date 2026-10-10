/**
 * #87 round 1 (Tier-A review) — WHO is a taxpayer, and WHOSE return each row lands on.
 *
 * Two CRITICAL findings this locks out:
 *  1. The taxpayer list was built from EARNERS only (salary or operated business). A household
 *     whose income is all rent / interest / dividends (post-FIRE, retired, capital-income-only)
 *     had NO assessee, so its tax was ₹0 — measured: Sharmas with salaries set to 0 and ₹20L of
 *     interest → annualTax 0. Every adult with attributed taxable income now files.
 *  2. A rental's §24(a) 30% standard deduction and §24(b) interest were split by the household
 *     Joint share even when ONE person owned the property, so the relief landed on the wrong slab.
 *     They now follow the SAME owner shares as the rent itself.
 *
 * Plus three surviving mutants from the review: M2 (unowned rows dropped instead of going to the
 * anchor adult), M3 (salaried standard deduction handed to a non-salaried adult), M5 (per-person
 * regime forced to NEW).
 *
 * CONSERVATION LAW: for every row, the shares given to people sum to exactly the row (income AND
 * its deductions) — so Σ per-person taxable gross === the household's taxable gross whenever no
 * per-person cap (§71 ₹2L loss set-off) binds. No row given twice, none dropped.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { loadRaviSeed } from "@/seeds/ravi";
import { derive } from "@/lib/derive";
import { computeTax } from "@/lib/tax";
import { computeHousePropertyTax } from "@/lib/tax-deductions";
import { toAnnual } from "@/lib/cashflow";
import type { Household } from "@/types/household";

const FY = "2025-26";
const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: FY } as const;

function sharmas(mutate?: (d: Household) => void) {
  setActivePinia(createPinia());
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  loadSeedPersona(h, a, FY);
  const data = JSON.parse(JSON.stringify(h.data)) as Household;
  mutate?.(data);
  return { data, values: a.values };
}
const run = (mutate?: (d: Household) => void, split?: number) => {
  const { data, values } = sharmas(mutate);
  return derive(data, split == null ? values : { ...values, householdSplitPercent: split }, LENS);
};
const who = (k: ReturnType<typeof derive>, id: string) =>
  k.perAssesseeTax.perAssessee.find((x) => x.memberId === id);
const noSalaries = (d: Household) => {
  for (const m of d.members) if (m.salary) m.salary.annualCTC = 0;
  d.businesses = [];
};
const interest = (ownerId: string, amount: number) => ({
  id: `probe-${ownerId}`,
  type: "Interest" as const,
  source: "Direct",
  label: "probe interest",
  ownerId,
  amount,
  frequency: "A" as const,
  isTaxExempt: false,
});

describe("#87 — every adult with taxable income files (zero-earner households are taxed)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("zero earners, ₹20L interest owned by Rohit → Rohit files and pays real tax (was ₹0)", () => {
    const k = run((d) => {
      noSalaries(d);
      d.otherIncome = [interest("rohit", 2_000_000) as never];
    });
    const r = who(k, "rohit")!;
    expect(r, "rohit must be an assessee").toBeDefined();
    expect(r.grossIncome).toBe(2_000_000);
    expect(r.isSalaried).toBe(false);
    expect(k.annualTax).toBeGreaterThan(0);
    // NEW regime, no standard deduction, ₹20L: (4–8 @5%)+(8–12 @10%)+(12–16 @15%)+(16–20 @20%) = 2,00,000 + 4% cess.
    expect(k.annualTax).toBeLessThanOrEqual(208_000);
    expect(k.annualTax).toBe(Math.min(r.oldTax, r.newTax));
  });

  it("zero earners, unowned ₹20L row → the anchor adult (first adult) pays; tax is never lower than one owner", () => {
    const k = run((d) => {
      noSalaries(d);
      d.otherIncome = [interest("no-such-member", 2_000_000) as never];
    });
    expect(k.perAssesseeTax.perAssessee.map((x) => x.memberId)).toEqual(["rohit"]);
    expect(who(k, "rohit")!.grossIncome).toBe(2_000_000);
    const owned = run((d) => {
      noSalaries(d);
      d.otherIncome = [interest("rohit", 2_000_000) as never];
    });
    expect(k.annualTax).toBe(owned.annualTax);
  });

  it("zero earners and zero income → the anchor adult still files (a ₹0 return), never an empty list", () => {
    const k = run((d) => {
      noSalaries(d);
      d.otherIncome = [];
    });
    expect(k.perAssesseeTax.perAssessee.map((x) => x.memberId)).toEqual(["rohit"]);
    expect(k.annualTax).toBe(0);
  });

  it("M2: an unowned row with earners present lands on the anchor earner at 100%, nobody else", () => {
    const base = run();
    const k = run((d) => d.otherIncome.push(interest("ghost", 500_000) as never));
    expect(who(k, "rohit")!.grossIncome - who(base, "rohit")!.grossIncome).toBe(500_000);
    expect(who(k, "priya")!.grossIncome).toBe(who(base, "priya")!.grossIncome);
  });

  it("a non-salaried adult with capital income files WITHOUT the salaried standard deduction (M3)", () => {
    // #87 round 4: with an earner present a non-earner no longer files (her income moves to the
    // earner), so M3 is exercised in a zero-earner household, where she does file.
    const k = run((d) => {
      noSalaries(d);
      d.otherIncome.push(interest("priya", 1_400_000) as never);
    });
    const p = who(k, "priya")!;
    expect(p, "priya (capital income, no salary) must file").toBeDefined();
    expect(p.isSalaried).toBe(false);
    const independent = computeTax({
      grossIncome: p.grossIncome,
      regime: p.regime,
      fy: FY,
      deductions: p.deductions,
      employerNpsByMember: p.employerNpsByMember,
      taxpayerAge: p.age,
      isSalaried: false,
    });
    expect(independent.standardDeduction).toBe(0);
    expect(p.tax).toBe(independent.totalTax);
    expect(p.tax).toBeGreaterThan(0);
  });
});

describe("#87 — rental §24(a)/§24(b) relief follows the property's owner shares", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("a rental owned 100% by Priya: all of its rent AND all of its 30% + interest relief are Priya's", () => {
    const noRental = run((d) => (d.otherIncome = d.otherIncome.filter((o) => o.type !== "Rental")));
    const k = run((d) => {
      const r = d.otherIncome.find((o) => o.type === "Rental")!;
      r.ownerId = "priya";
      r.homeLoanInterest = 50_000;
    });
    // ₹15k/month = ₹1.8L; NAV × 70% − ₹50k interest = 1,26,000 − 50,000 = 76,000.
    expect(who(k, "priya")!.grossIncome - who(noRental, "priya")!.grossIncome).toBe(76_000);
    expect(who(k, "rohit")!.grossIncome).toBe(who(noRental, "rohit")!.grossIncome);
  });

  it("each person's rental loss set-off is capped at ₹2L on THEIR return (§71), never pooled", () => {
    const k = run((d) => {
      const r = d.otherIncome.find((o) => o.type === "Rental")!;
      r.ownerId = "priya";
      r.homeLoanInterest = 600_000; // 1,26,000 − 6,00,000 = −4,74,000 → capped −2,00,000
    });
    const noRental = run((d) => (d.otherIncome = d.otherIncome.filter((o) => o.type !== "Rental")));
    // OLD regime only: NEW allows no set-off (§115BAC(2), #236), so its gross ignores the loss.
    expect(who(k, "priya")!.oldGrossIncome - who(noRental, "priya")!.oldGrossIncome).toBe(-200_000);
    expect(who(k, "priya")!.newGrossIncome).toBe(who(noRental, "priya")!.newGrossIncome);
    expect(who(k, "rohit")!.grossIncome).toBe(who(noRental, "rohit")!.grossIncome);
  });
});

describe("#87 — conservation: Σ per-person taxable gross === household taxable gross", () => {
  const PERSONAS: Array<[string, (h: never, a: never) => void]> = [
    ["sharmas", (h, a) => loadSeedPersona(h, a, FY)],
    ["iyers", (h, a) => loadIyersSeed(h, a)],
    ["mehtas", (h, a) => loadMehtasSeed(h, a)],
    ["mauryas", (h, a) => loadMauryasSeed(h, a, FY)],
    ["ravi", (h, a) => loadRaviSeed(h, a)],
  ];
  for (const [name, load] of PERSONAS) {
    for (const split of [50, 70]) {
      it(`${name} @ split ${split}: no row given twice, none dropped; each regime is that person's cheaper one (M5)`, () => {
        setActivePinia(createPinia());
        const h = useHouseholdStore();
        const a = useAssumptionsStore();
        load(h as never, a as never);
        const k = derive(h.data, { ...a.values, householdSplitPercent: split }, LENS);
        const d = h.data;
        const salaries = d.members.reduce((s, m) => s + (m.role === "ADULT" ? (m.salary?.annualCTC ?? 0) : 0), 0);
        const other = d.otherIncome
          .filter((o) => !o.isTaxExempt)
          .reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0);
        const biz = d.businesses.reduce(
          (s, b) => s + toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100),
          0,
        );
        const household = salaries + other + biz - computeHousePropertyTax(d.otherIncome).rentalTaxDeduction;
        const sum = k.perAssesseeTax.perAssessee.reduce((s, x) => s + x.grossIncome, 0);
        expect(Math.abs(sum - household), `${name}: Σ per-person gross vs household gross`).toBeLessThanOrEqual(2);
        for (const x of k.perAssesseeTax.perAssessee) {
          expect(x.tax, `${name}/${x.name} pays the cheaper regime`).toBe(Math.min(x.oldTax, x.newTax));
          expect(x.regime, `${name}/${x.name} regime`).toBe(x.oldTax <= x.newTax ? "OLD" : "NEW");
        }
        expect(k.householdTaxRecommendation.oldTax).toBe(
          k.perAssesseeTax.perAssessee.reduce((s, x) => s + x.oldTax, 0),
        );
        expect(k.householdTaxRecommendation.newTax).toBe(
          k.perAssesseeTax.perAssessee.reduce((s, x) => s + x.newTax, 0),
        );
      });
    }
  }
});

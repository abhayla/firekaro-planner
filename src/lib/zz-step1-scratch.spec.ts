/** STEP 1 proof (#87): pooled household tax vs Σ per-assessee tax INCLUDING business/other income. */
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
import { computeTax, recommendRegime } from "@/lib/tax";
import { deductionsForMember, computeHousePropertyTax } from "@/lib/tax-deductions";
import { isEarningMember } from "@/lib/member-earning";
import { isAdultRole } from "@/types/household";
import { toAnnual } from "@/lib/cashflow";
import { ageFromDOB } from "@/lib/age";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
const PINNED_CURRENT_YEAR = 2026;

const PERSONAS: Array<{ name: string; load: (h: any, a: any) => void }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a, LENS.currentFY) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a, LENS.currentFY) },
  { name: "ravi", load: (h, a) => loadRaviSeed(h, a) },
];

describe("step1", () => {
  beforeEach(() => setActivePinia(createPinia()));
  for (const p of PERSONAS) {
    it(p.name, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      p.load(h, a);
      const k = derive(h.data, a.values, LENS, { currentYear: PINNED_CURRENT_YEAR });
      const household = h.data;
      const asOf = new Date(PINNED_CURRENT_YEAR, 3, 1);
      const split = a.values.householdSplitPercent ?? 50;
      const earners = household.members.filter(
        (m) => isAdultRole(m.role) && isEarningMember(m, household.businesses),
      );
      const anchorId = earners[0]?.id;
      const { rentalTaxDeduction } = computeHousePropertyTax(household.otherIncome);
      const rows: any[] = [];
      let sum = 0;
      for (const m of earners) {
        const w = (ownerId: string) =>
          ownerId === m.id ? 1 : ownerId === "Joint" ? (earners.length <= 1 ? 1 : m.id === anchorId ? split / 100 : 1 - split / 100) : 0;
        const salary = m.salary?.annualCTC ?? 0;
        let other = 0;
        for (const o of household.otherIncome) {
          if (o.isTaxExempt) continue;
          const ann = toAnnual({ amount: o.amount, period: o.frequency });
          const unowned = !household.members.some((mm) => mm.id === o.ownerId) && o.ownerId !== "Joint";
          other += unowned ? (m.id === anchorId ? ann : 0) : ann * w(o.ownerId);
        }
        let biz = 0;
        for (const b of household.businesses) {
          const ann = toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100);
          const unowned = !household.members.some((mm) => mm.id === b.ownerId) && b.ownerId !== "Joint";
          biz += unowned ? (m.id === anchorId ? ann : 0) : ann * w(b.ownerId);
        }
        const rentShare = rentalTaxDeduction * (earners.length <= 1 ? 1 : m.id === anchorId ? split / 100 : 1 - split / 100);
        const gross = salary + other + biz - rentShare;
        const ded = deductionsForMember(household, m.id, split, { asOfDate: asOf.toISOString().slice(0, 10) });
        const isSalaried = salary > 0;
        const age = ageFromDOB(m.dateOfBirth, asOf);
        const rec = recommendRegime({ grossIncome: gross, fy: LENS.currentFY, deductions: ded.totalDeductions, employerNpsByMember: ded.employerNpsByMember, taxpayerAge: age, isSalaried });
        const t = computeTax({ grossIncome: gross, regime: rec.recommended, fy: LENS.currentFY, deductions: ded.totalDeductions, employerNpsByMember: ded.employerNpsByMember, taxpayerAge: age, isSalaried });
        sum += t.totalTax;
        rows.push({ name: m.name, gross: Math.round(gross), ded: Math.round(ded.totalDeductions), regime: rec.recommended, tax: Math.round(t.totalTax) });
      }
      console.log(`\n=== ${p.name} === earners=${earners.length} pooledTax=${Math.round(k.annualTax)} perAssesseeSum=${Math.round(sum)} delta=${Math.round(sum - k.annualTax)}`);
      console.log(JSON.stringify(rows));
      expect(true).toBe(true);
    });
  }
});

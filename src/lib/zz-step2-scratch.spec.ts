/** STEP 2 (#87): print the post-change headline bundle per seed. */
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

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
const PINNED_CURRENT_YEAR = 2026;

const PERSONAS: Array<{ name: string; load: (h: any, a: any) => void }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a, LENS.currentFY) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a, LENS.currentFY) },
  { name: "ravi", load: (h, a) => loadRaviSeed(h, a) },
];

describe("step2", () => {
  beforeEach(() => setActivePinia(createPinia()));
  for (const p of PERSONAS) {
    it(p.name, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      p.load(h, a);
      const k = derive(h.data, a.values, LENS, { currentYear: PINNED_CURRENT_YEAR });
      const out = {
        annualTax: Math.round(k.annualTax),
        monthlyTakeHome: Math.round(k.monthlyTakeHome),
        savingsRate: Math.round(k.savingsRate * 10000) / 10000,
        annualSavings: Math.round(k.annualSavings),
        monthlyContribution: Math.round(k.monthlyContribution),
        householdFireAge: k.householdFireAge,
        fireAge: k.fireAge,
        requiredMonthlyReal: Math.round(k.requiredMonthlyReal ?? 0),
        annualIncomeTotal: Math.round(k.annualIncome.total),
        annualExpensesToday: Math.round(k.annualExpensesToday),
        identity: Math.round(
          k.annualIncome.total - k.annualTax - (k.annualSavings + k.annualExpensesToday),
        ),
        regime: k.householdTaxRecommendation.recommended,
        marginalRate: k.householdMarginalRate,
        perAssessee: k.perAssesseeTax.perAssessee.map((x: any) => `${x.name}:${Math.round(x.tax)}(${x.regime})`),
      };
      console.log(`\n=== ${p.name} ===\n${JSON.stringify(out)}`);
      expect(true).toBe(true);
    });
  }
});

import { requiredMonthlyContributionFor } from "@/lib/required-contribution";
describe("step2-rc", () => {
  beforeEach(() => setActivePinia(createPinia()));
  for (const p of PERSONAS) {
    it(`rc-${p.name}`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      p.load(h, a);
      const k = derive(h.data, a.values, LENS, { currentYear: PINNED_CURRENT_YEAR });
      const rc = requiredMonthlyContributionFor({ snapshot: h.data, assumptions: a.values, lens: LENS as any, targetAge: k.targetRetirementAge });
      console.log(`RC ${p.name}: requiredMonthlyReal=${rc.requiredMonthlyReal} needReal=${rc.needReal} fireAge=${k.fireAge} householdFireAge=${k.householdFireAge}`);
      expect(true).toBe(true);
    });
  }
});

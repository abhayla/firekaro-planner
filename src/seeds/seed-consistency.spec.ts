/**
 * Seed-persona financial-consistency lock (#12).
 *
 * Fixing the #11 SIP double-count exposed that the demo personas were
 * financially OVER-COMMITTED — configured to invest (Σ SIP monthlyContribution)
 * more than their actual monthly surplus (annualSavings / 12). A household
 * cannot invest more than it saves, so such a seed is internally inconsistent
 * and quietly mis-teaches the demo. This spec is the invariant that would have
 * caught the #11/#12 class:
 *
 *   for each persona:  Σ(investment.monthlyContribution)  ≤  round(annualSavings / 12)
 *
 * Plus a soft "compelling + realistic accumulator" check (savings rate, FIRE
 * horizon) so the demo personas stay aspirational but plausible.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { derive } from "@/lib/derive";

type Loader = (h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) => void;

// Per-persona "compelling + realistic" bounds (#12). Tighter than a shared range
// so a silent retune (e.g. the Iyers drifting from ~10y to ~22y on a future tax
// change) FAILS the lock instead of passing. Anchored to each persona's story:
// Sharmas mid-journey, Mehtas near-FIRE, Iyers the contract's 40-50% / 10-15y wedge.
const PERSONAS: Array<{
  name: string;
  load: Loader;
  savingsRate: [number, number];
  maxYearsToFire: number;
}> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a), savingsRate: [40, 55], maxYearsToFire: 20 },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a), savingsRate: [40, 60], maxYearsToFire: 5 },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a), savingsRate: [40, 50], maxYearsToFire: 15 },
];

const WHOLE_HOUSEHOLD = { isFamilyView: true, viewingMemberId: null, currentFY: "2025-26" };

describe("seed-persona financial consistency (#12)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: Σ SIP monthlyContribution ≤ monthly surplus (annualSavings/12)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, WHOLE_HOUSEHOLD);

      const sumSip = h.data.investments.reduce((s, i) => s + (i.monthlyContribution ?? 0), 0);
      const surplus = Math.round(k.annualSavings / 12);

      expect(
        sumSip,
        `${persona.name}: SIPs ₹${sumSip}/mo exceed surplus ₹${surplus}/mo ` +
          `(savingsRate ${k.savingsRate}%, yearsToRegular ${Number(k.yearsToRegular).toFixed(1)}, ` +
          `annualSavings ₹${k.annualSavings})`,
      ).toBeLessThanOrEqual(surplus);
    });

    it(`${persona.name}: the corpus-growth contribution equals round(annualSavings/12) (no #11 double-count)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, WHOLE_HOUSEHOLD);
      expect(k.monthlyContribution).toBe(Math.round(k.annualSavings / 12));
    });

    it(`${persona.name}: marks profile + wizard complete (routes to the dashboard, not the wizard)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      expect(h.data.profileComplete, `${persona.name} profileComplete`).toBe(true);
      expect(h.data.wizardCompleted, `${persona.name} wizardCompleted`).toBe(true);
    });

    it(`${persona.name}: is a compelling, realistic accumulator (savings rate + FIRE horizon)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, WHOLE_HOUSEHOLD);
      // Aspirational but plausible, per-persona (catches a silent retune).
      const [lo, hi] = persona.savingsRate;
      expect(k.savingsRate, `${persona.name} savingsRate ${k.savingsRate}%`).toBeGreaterThanOrEqual(lo);
      expect(k.savingsRate, `${persona.name} savingsRate ${k.savingsRate}%`).toBeLessThanOrEqual(hi);
      expect(Number(k.yearsToRegular), `${persona.name} yearsToRegular ${Number(k.yearsToRegular).toFixed(1)}`)
        .toBeLessThanOrEqual(persona.maxYearsToFire);
    });
  }
});

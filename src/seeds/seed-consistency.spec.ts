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
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";

type Loader = (h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) => void;

// Per-persona FIRE-horizon bounds (#12). Tighter than a shared range so a silent
// retune FAILS the lock instead of passing.
//
// #20/#22/#21 (2026-06-03): the FIRE date is now HONEST — real-return frame +
// general-CPI deflator (#20) + household-coherent lens (#22), and the Sharmas were
// equity-tilted to a realistic ~9.7% blend (#21) so their honest horizon is also
// compelling (mid-50s FIRE, not 62). These bounds reflect the honest CORRECTED
// horizons on the whole-household lens: Sharmas ~26y, Iyers ~19y (≈2y past their
// own retire-goal of 55 — on-track), Mehtas near-FIRE. NOT bug-era optimistic values.
const PERSONAS: Array<{
  name: string;
  load: Loader;
  savingsRate: [number, number];
  maxYearsToFire: number;
}> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a), savingsRate: [40, 55], maxYearsToFire: 27 }, // #21 equity-tilted → ~26y (age 56)
  // T-376/gh-#165: 5 → 5.4 — Mehtas' two kind-less plannedFuture goals ("Retirement world
  // tour" ₹15L, "Switzerland residency" ₹25L) now correctly enter the FIRE-number lump
  // (previously silently excluded — the Tier-0 honesty bug this fix closes), pushing the
  // honest horizon from ~5.0y to ~5.33y. Still a compelling, fast FIRE horizon.
  // ADR-0006: 5.4 → 5.7. The frame change (drifting target, true monthly compounding, continuous
  // target resolution) pushes this out ~0.25y net of the new 2% step-up. Still the fastest persona
  // and still comfortably inside "compelling".
  // ADR-0006 Phase 1c: 5.7 → 6.1 (measured 6.00). The healthcare corpus reservation now drifts at
  // healthcare inflation (9%) rather than the household basket (6.24%), so the target this persona
  // is racing rises faster. Over a horizon this short the effect is small (+0.3y); the band is
  // re-tightened just above the new value, not widened to hide it.
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a), savingsRate: [40, 60], maxYearsToFire: 6.1 },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a), savingsRate: [40, 50], maxYearsToFire: 20 }, // ~19y, ≈2y past retire-goal 55
  // Single-income (₹42L CTC) + homemaker spouse + big education goals → honestly
  // behind the age-50 aspiration: ~23y to FIRE (age ~67), ~38% pre-EMI savings rate.
  // ADR-0006: 24 → 24.5 (age ~68). Same net effect as the Mehtas note above. NOT widened to
  // accommodate a breach of the #22 fireAge ≤ 70 gate — that gate still passes with ~2y of margin;
  // this is the seed's own "compelling accumulator" band, tightened back around the new value.
  // ADR-0006 Phase 1c: 24.5 → 25.0 (measured 24.92, FIRE age ~68.9 on the default lens). Same
  // cause as the Mehtas note: the medical reservation on a 25-year horizon at 9% instead of
  // 6.24%. This persona has the largest education goals, so decision (b)'s goal cap claws some
  // of it back — the net is +0.4y, not the +2y the reservation leg alone would imply. The #22
  // fireAge ≤ 70 gate still passes with ~1.1y of margin.
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a), savingsRate: [34, 42], maxYearsToFire: 25.0 },
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

/**
 * A7.2 — GOLDEN-MASTER headline snapshots, one per populated seed persona.
 *
 * This locks the EXACT `derive()` headline (FIRE age/number/savings-rate/years/corpus) for
 * every populated persona on the DEFAULT product lens. It is the complement to two existing
 * gates: `headline-plausibility.spec.ts` proves the headline is in a SANE band (substance),
 * and this proves it does not MOVE silently (regression). Any math change that shifts a
 * persona's headline trips this snapshot — forcing a deliberate, reviewed update rather than
 * an accidental drift. (Empty persona has no headline — covered by `empty-partial-state-sweep`.)
 *
 * IMPORTANT: a snapshot update here is a SIGNAL, not a chore — when it fails, confirm the new
 * number is still plausible (rule 31) and intended BEFORE running `vitest -u`.
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

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

type H = ReturnType<typeof useHouseholdStore>;
type A = ReturnType<typeof useAssumptionsStore>;
const PERSONAS: Array<{ name: string; load: (h: H, a: A) => void }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
];

const r = (x: number, dp = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** dp) / 10 ** dp : x);

describe("A7.2 golden-master — per-persona headline (DEFAULT lens)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: derive() headline is locked`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, LENS);
      const headline = {
        // Lock the lens scope too — a #22-class regression that silently scoped the household to
        // one earner would move this count and trip the golden master (code-review 2026-06-07).
        lensedEarners: k.lensedEarners.length,
        anchorAge: k.anchorAge,
        targetRetirementAge: k.targetRetirementAge,
        fireAge: r(k.anchorAge + k.yearsToRegular, 2),
        yearsToRegular: r(k.yearsToRegular),
        corpusOnlyYearsToRegular: r(k.corpusOnlyYearsToRegular),
        yearsToLean: r(k.yearsToLean),
        yearsToFat: r(k.yearsToFat),
        savingsRate: k.savingsRate,
        progressPercent: k.progressPercent,
        fireNumber: Math.round(k.fireNumber),
        totalCorpus: Math.round(k.totalCorpus),
        fireWithdrawableCorpus: Math.round(k.fireWithdrawableCorpus),
        annualSavings: Math.round(k.annualSavings),
        monthlyContribution: Math.round(k.monthlyContribution),
        effectiveSWR: k.effectiveSWR,
      };
      expect(headline).toMatchSnapshot();
    });
  }
});

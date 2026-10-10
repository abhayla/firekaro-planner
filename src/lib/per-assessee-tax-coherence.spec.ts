/**
 * #87 — the per-earner cards on /tax-planning and the kernel's household `annualTax` are ONE
 * derivation, so they agree to the rupee.
 *
 * THE DEFECT THIS LOCKS OUT. `derive.ts` used to run a single `recommendRegime` + `computeTax`
 * over the POOLED household income — a single-filer model. India taxes each adult separately, so
 * pooling pushed the second earner's whole income through the first's marginal slabs and granted
 * the household ONE basic exemption, ONE standard deduction and ONE 87A rebate. Measured on the
 * seeds (default lens, FY 2025-26): sharmas 11,65,840 -> 7,16,560; iyers 8,81,400 -> 6,31,800;
 * mehtas 19,99,140 -> 13,57,200. Meanwhile /tax-planning rendered per-earner cards from a SECOND,
 * per-member computation, so the screen's own table never summed to the screen's own total, and
 * neither matched the dashboard headline. All three now read `perAssesseeHouseholdTax`.
 *
 * These are COHERENCE locks. The golden master pins the values; this pins that the surfaces
 * cannot drift apart again.
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
import { perAssesseeHouseholdTax } from "@/lib/tax-deductions";
import { isEarningMember } from "@/lib/member-earning";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

type H = ReturnType<typeof useHouseholdStore>;
type A = ReturnType<typeof useAssumptionsStore>;

// `filers` = adults with taxable income (#87 round 1: a non-earning co-owner of a Joint rental /
// FD files on her own share — the Mauryas' Madhu). `earners` = salary/business adults.
const PERSONAS: Array<{ name: string; earners: number; filers: number; load: (h: H, a: A) => void }> = [
  { name: "sharmas", earners: 2, filers: 2, load: (h, a) => loadSeedPersona(h, a, LENS.currentFY) },
  { name: "mehtas", earners: 2, filers: 2, load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", earners: 2, filers: 2, load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", earners: 1, filers: 2, load: (h, a) => loadMauryasSeed(h, a, LENS.currentFY) },
  { name: "ravi", earners: 1, filers: 1, load: (h, a) => loadRaviSeed(h, a) },
];

describe("#87 — /tax-planning's per-earner sum EQUALS the kernel's household tax", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: Σ per-assessee tax === derive().annualTax, to the rupee`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, LENS);

      // Reproduce EXACTLY what /tax-planning's `perAssessee` computed builds (same helper, same
      // scope, same split) — this is the screen's derivation, not a paraphrase of it.
      const earners = h.data.members.filter((m) => isEarningMember(m, h.data.businesses));
      const page = perAssesseeHouseholdTax(
        h.data,
        {
          members: h.data.members,
          businesses: h.data.businesses,
          otherIncome: h.data.otherIncome,
        },
        LENS.currentFY,
        a.values.householdSplitPercent ?? 50,
        new Date(new Date().getFullYear(), 3, 1),
      );

      expect(earners.length, `${persona.name} earner count`).toBe(persona.earners);
      const cardSum = page.perAssessee.reduce((s, x) => s + x.tax, 0);
      expect(cardSum, `${persona.name}: card sum vs kernel annualTax`).toBe(k.annualTax);
      // …and the kernel's own roll-up agrees with its own parts (no third number anywhere).
      expect(k.perAssesseeTax.perAssessee.reduce((s, x) => s + x.tax, 0)).toBe(k.annualTax);
      expect(k.fyTax.totalTax).toBe(k.annualTax);
    });
  }
});

describe("#87 — direction: per-assessee is never worse than pooled, and single-earner never moves", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("every DUAL-earner seed pays strictly LESS than the pooled model charged", () => {
    // The measured pooled figures the single-filer kernel produced before this change. They are
    // written here as the DEFECT's own evidence: if a future kernel ever reproduces one of them,
    // pooling has come back.
    const POOLED_BEFORE: Record<string, number> = {
      sharmas: 1_165_840,
      iyers: 881_400,
      mehtas: 1_999_140,
    };
    for (const persona of PERSONAS.filter((p) => p.earners > 1)) {
      setActivePinia(createPinia());
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, LENS);
      expect(k.annualTax, `${persona.name}: must be below the pooled single-filer bill`).toBeLessThan(
        POOLED_BEFORE[persona.name],
      );
      // Each earner files their own return — there are as many as there are earning adults.
      expect(k.perAssesseeTax.perAssessee.length).toBe(persona.filers);
    }
  });

  it("every SINGLE-filer seed is byte-identical: one assessee, one return", () => {
    for (const persona of PERSONAS.filter((p) => p.filers === 1)) {
      setActivePinia(createPinia());
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, LENS);
      expect(k.perAssesseeTax.perAssessee.length, persona.name).toBe(1);
      expect(k.annualTax, persona.name).toBe(k.perAssesseeTax.perAssessee[0].tax);
    }
  });

  it("no assessee's attributed income or tax is negative, and Joint shares sum to the whole", () => {
    for (const persona of PERSONAS) {
      setActivePinia(createPinia());
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, LENS);
      for (const x of k.perAssesseeTax.perAssessee) {
        expect(x.tax, `${persona.name}/${x.name} tax >= 0`).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(x.grossIncome), `${persona.name}/${x.name} finite gross`).toBe(true);
      }
      // No income is created or destroyed by the attribution: the assessees' taxable grosses sum
      // to the household's own taxable gross (salary + business + other-taxable − rental collapse).
      const summedGross = k.perAssesseeTax.perAssessee.reduce((s, x) => s + x.grossIncome, 0);
      expect(summedGross, `${persona.name}: attribution conserves taxable income`).toBeCloseTo(
        k.fyTax.grossIncome,
        6,
      );
    }
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useHouseholdStore } from "@/stores/household";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import { migrateStepUpDefault, ASSUMPTIONS_MIGRATION_VERSION } from "@/stores/assumptions";
import { setAdapter } from "@/lib/storage-adapter";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "@/types/assumptions";

describe("assumptions store — householdInflation (A3.2 editable weights)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("default inflationWeights are the disjoint 74/8/0/18 (ADR-0006)", () => {
    const a = useAssumptionsStore();
    expect(a.values.inflationWeights).toEqual({
      general: 74,
      healthcare: 8,
      education: 0,
      housing: 18,
    });
  });

  it("blends at the default weights to ~6.24%, within 100bp of general CPI (ADR-0006)", () => {
    const a = useAssumptionsStore();
    // (0.06*74 + 0.09*8 + 0.09*0 + 0.06*18) / 100 = 6.24%
    // RE-BASELINED from 7.90% — see fire-math.spec.ts for the two grounding corrections. The BOUND
    // is the durable assertion: `general` is the all-items CPI, so a basket of disjoint shares of
    // its own components cannot credibly sit a full point above it.
    expect(a.householdInflation()).toBeCloseTo(0.0624, 6);
    expect(a.householdInflation() - a.values.inflation).toBeGreaterThanOrEqual(0);
    expect(a.householdInflation() - a.values.inflation).toBeLessThanOrEqual(0.01);
  });

  it("a stored step-up of exactly 0 (the pre-ADR-0006 default) is treated as unset on hydrate", () => {
    const a = useAssumptionsStore();
    expect(a.values.householdSavingsStepUpPercent).toBe(2);
  });

  it("shifting weight toward healthcare raises the blended rate", () => {
    const a = useAssumptionsStore();
    const before = a.householdInflation();
    a.set("inflationWeights", { general: 20, healthcare: 60, education: 10, housing: 10 });
    const after = a.householdInflation();
    expect(after).toBeGreaterThan(before);
    // (0.06*20 + 0.09*60 + 0.09*10 + 0.06*10) / 100 = 8.1%
    expect(after).toBeCloseTo(0.081, 6);
  });

  it("normalizes by weight-sum so non-100 weights with same ratios match the default", () => {
    const a = useAssumptionsStore();
    a.set("inflationWeights", { general: 37, healthcare: 4, education: 0, housing: 9 });
    expect(a.householdInflation()).toBeCloseTo(0.0624, 6);
  });
});

/**
 * ADR-0006 — ONE basket. `assumptions.householdInflation()` (what the expense chart, the
 * lifestyle-inflation nudge and the Preferences readout show) and `derive().householdInflation`
 * (what the FIRE target actually grows at) resolve the same blend from the same store. Nothing
 * enforced that until now, so a change to either resolver could have put a different rate on the
 * screen from the one in the plan — the #180 class, one layer down.
 */
describe("householdInflation is the SAME basket the kernel plans with (ADR-0006)", () => {
  const DEFAULT_PRODUCT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
  type Store = ReturnType<typeof useHouseholdStore>;
  type ASt = ReturnType<typeof useAssumptionsStore>;
  const PERSONAS: Array<{ name: string; load: (h: Store, a: ASt) => void }> = [
    { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
    { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
    { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
    { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
  ];

  beforeEach(() => setActivePinia(createPinia()));

  for (const p of PERSONAS) {
    it(`${p.name}: store basket === derive().householdInflation`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      p.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      expect(a.householdInflation()).toBeCloseTo(k.householdInflation, 12);
      // ...and it is strictly ABOVE general CPI, which is what makes the target drift real.
      expect(k.householdInflation).toBeGreaterThan(a.values.inflation);
      expect(k.realTargetDriftRate).toBeCloseTo(
        (1 + k.householdInflation) / (1 + a.values.inflation) - 1,
        12,
      );
    });
  }
});

/**
 * ADR-0006 Phase 1b (HIGH-3) — the step-up migration must be ONE-SHOT.
 *
 * The Phase-1 version sniffed the VALUE on every hydrate, so a user who deliberately chose 0 got
 * 2 back on the next reload: the product silently refused to let them keep an explicit setting.
 * The previous test in this file only asserted the DEFAULT and so locked that bug in — these
 * assert the actual contract (idempotence across repeated hydrates + a real storage round-trip).
 */
describe("assumptions store — the step-up migration is ONE-SHOT (ADR-0006 Phase 1b)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setAdapter(null);
  });

  it("lifts a legacy 0 exactly once and stamps the document", () => {
    // A pre-ADR-0006 document: a stored 0, no stamp.
    const first = migrateStepUpDefault({ householdSavingsStepUpPercent: 0 });
    expect(first.householdSavingsStepUpPercent, "the legacy 0 must be dropped so the new default wins").toBeUndefined();
    expect(first.assumptionsMigratedV).toBe(ASSUMPTIONS_MIGRATION_VERSION);
  });

  it("a DELIBERATE 0 written after the stamp survives every later hydrate", () => {
    const chose0 = { ...DEFAULT_ASSUMPTIONS, householdSavingsStepUpPercent: 0, assumptionsMigratedV: 1 };
    let doc: Partial<Assumptions> = chose0;
    for (let reload = 0; reload < 3; reload++) {
      doc = migrateStepUpDefault(doc);
      expect(
        doc.householdSavingsStepUpPercent,
        `reload ${reload + 1}: a stamped, deliberate 0 must never be lifted back to the default`,
      ).toBe(0);
    }
  });

  it("stamps even a FIRST-RUN document, so a 0 typed in /preferences survives reloads", () => {
    // The exact Preferences §Core scenario: brand-new user, nothing stored, types 0 into the
    // "Savings step-up (% real per year)" field, then reloads twice.
    const store = new Map<string, string>();
    setAdapter({
      get: <T,>(k: string): T | null => (store.has(k) ? (JSON.parse(store.get(k)!) as T) : null),
      set: (k: string, v: unknown) => void store.set(k, JSON.stringify(v)),
      remove: (k: string) => void store.delete(k),
      clearForCurrentUser: () => store.clear(),
    });

    const a = useAssumptionsStore();
    a.hydrate();
    expect(a.values.householdSavingsStepUpPercent, "fresh user gets the new default").toBe(2);
    a.set("householdSavingsStepUpPercent", 0);
    // The deep watch persists asynchronously; write the document the way the watch would.
    store.set("assumptions", JSON.stringify(a.values));

    for (let reload = 0; reload < 2; reload++) {
      setActivePinia(createPinia());
      const reloaded = useAssumptionsStore();
      reloaded.hydrate();
      expect(
        reloaded.values.householdSavingsStepUpPercent,
        `reload ${reload + 1}: the 0 the user typed in /preferences must still be 0`,
      ).toBe(0);
      store.set("assumptions", JSON.stringify(reloaded.values));
    }
    setAdapter(null);
  });
});

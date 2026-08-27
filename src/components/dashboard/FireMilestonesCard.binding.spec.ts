/**
 * gh #180 / ADR-0006 item 5 — ONE real return on screen.
 *
 * The bug this file exists to make impossible: the Coast/Barista card deflated the nominal blended
 * return at the household EXPENSE BASKET (`assumptions.householdInflation()`, ~6.24% today, 7.90%
 * before ADR-0006) while the FireHero four inches above it deflated at GENERAL CPI. One household,
 * one dashboard, two different real returns — and every value-level spec stayed green, because no
 * test ever compared the two surfaces. That is the DETECTION gap, not just the code bug, so the
 * lock below is deliberately two-layered:
 *
 *   (a) a source scan — the card must read the kernel's `realBlendedReturn` and must not reach for
 *       `householdInflation` at all (the wiring);
 *   (b) a numeric identity across ALL FOUR seed personas on the DEFAULT product lens — the real
 *       return the Coast maths consumes equals the hero's to 1e-9 (the substance). A future edit
 *       that reintroduces a second deflator, or swaps the geometric form for `r − π`, fails here
 *       even if it type-checks and renders.
 *
 * Same dep-free source-scan pattern as `FireHero.binding.spec.ts` (this repo's node test env has no
 * DOM/@vue/test-utils and the contract bans new deps).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import { realReturnForCoast } from "@/lib/coast-fire";

const src = readFileSync(fileURLToPath(new URL("./FireMilestonesCard.vue", import.meta.url)), "utf8");
const script = src.slice(0, src.indexOf("<template>"));

/** The EXACT lens the dashboard renders by default (#22 — never verify on a convenient lens). */
const DEFAULT_PRODUCT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

type Store = ReturnType<typeof useHouseholdStore>;
type ASt = ReturnType<typeof useAssumptionsStore>;
const PERSONAS: Array<{ name: string; load: (h: Store, a: ASt) => void }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
];

describe("FireMilestonesCard — gh #180 wiring lock", () => {
  it("the Coast real return comes from the kernel's ONE real return", () => {
    expect(script, "must read derive()'s realBlendedReturn via useFireDerive").toMatch(
      /fire\.realBlendedReturn\.value/,
    );
  });

  it("the card never deflates at the household expense basket (that IS #180)", () => {
    expect(script, "householdInflation must not appear as a live call in this card").not.toMatch(
      /assumptions\.householdInflation\(\)/,
    );
    expect(script, "no second real-return derivation may live in the component").not.toMatch(
      /blendedReturn\.value\s*-\s*/,
    );
  });

  it("a negative real return is still passed through unclamped (gh-issue #9 L2)", () => {
    // The A1 contract predates #180 and must survive it: no Math.max floor on the way to coast-fire.
    expect(script).not.toMatch(/Math\.max\(0\.01/);
    expect(script).toMatch(/realReturn: realReturn\.value/);
  });
});

describe("gh #180 — hero and Coast share ONE real return, on every seed persona", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  for (const p of PERSONAS) {
    it(`${p.name}: the Coast real return equals the hero's to 1e-9 (default lens)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      p.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);

      // What the card feeds coast-fire, and what the hero / solver / MC band / chart all use.
      const coastReal = k.realBlendedReturn;
      expect(Number.isFinite(coastReal), `${p.name}: real return must be finite`).toBe(true);
      expect(coastReal).toBeCloseTo((1 + k.blendedReturn) / (1 + a.values.inflation) - 1, 12);

      // The pre-fix expression, kept here as the NEGATIVE control: deflating at the basket gives a
      // materially different number, so this identity could not have passed before the fix.
      const basketDeflated = (1 + k.blendedReturn) / (1 + k.householdInflation) - 1;
      expect(
        Math.abs(coastReal - basketDeflated),
        `${p.name}: basket-deflated and CPI-deflated returns must be measurably different — ` +
          "if they are not, the basket has been collapsed back onto CPI (#167)",
      ).toBeGreaterThan(1e-4);

      // And the shared helper reproduces the kernel exactly, for any caller holding raw inputs.
      expect(realReturnForCoast(k.blendedReturn, a.values.inflation)).toBeCloseTo(coastReal, 12);
    });
  }
});

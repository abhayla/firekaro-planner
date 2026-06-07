/**
 * A7.5 — RESILIENCE / error-injection at the kernel boundary.
 *
 * A crash or a NaN/Infinity on a money screen is a trust killer for the honesty-first persona. This
 * feeds derive() deliberately PATHOLOGICAL / corrupt household data (the shape a bad import, a
 * migration gap, or a degenerate edit could produce) and asserts the kernel DEGRADES GRACEFULLY:
 * never throws, never emits NaN, keeps the clamped fields (progress 0–100) in range, and keeps the
 * money fields finite. Years-to-FIRE MAY be ±Infinity (the honest "not within horizon" signal) — but
 * NEVER NaN. Complements A7.1 (random valid inputs) with explicit corrupt-input witnesses + the
 * defensive-coding guarantee (`defensive-coding.md`).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

type Mutate = (h: ReturnType<typeof useHouseholdStore>) => void;

const PATHOLOGICAL: Array<{ name: string; mutate: Mutate }> = [
  { name: "negative monthly expenses (corrupt import)", mutate: (h) => (h.data.expenses.avgMonthly = -50_000) },
  { name: "astronomical expenses (overflow probe)", mutate: (h) => (h.data.expenses.avgMonthly = 1e15) },
  { name: "zero expenses (degenerate, no FIRE target)", mutate: (h) => (h.data.expenses.avgMonthly = 0) },
  {
    name: "inverted ages (planTo < target < current)",
    mutate: (h) => {
      h.data.members[0].targetRetirementAge = 25;
      h.data.members[0].planToAge = 20;
    },
  },
  {
    name: "all investments wiped (zero corpus, real target)",
    mutate: (h) => {
      h.data.investments = [];
    },
  },
  {
    name: "negative investment value (corrupt holding)",
    mutate: (h) => {
      if (h.data.investments[0]) h.data.investments[0].value = -1_000_000;
    },
  },
];

describe("A7.5 kernel resilience — pathological inputs never crash or emit NaN", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const { name, mutate } of PATHOLOGICAL) {
    it(`${name}: derive() degrades gracefully (no throw, no NaN, clamped fields in range)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      loadSeedPersona(h, a); // a real, valid household...
      mutate(h); // ...then inject one pathological field.

      let k: ReturnType<typeof derive> | undefined;
      expect(() => {
        k = derive(h.data, a.values, LENS);
      }, `${name}: derive() must not throw`).not.toThrow();
      const out = k!;

      // (1) NO numeric output field may be NaN — a NaN anywhere can reach a money screen.
      for (const [field, value] of Object.entries(out)) {
        if (typeof value === "number") {
          expect(Number.isNaN(value), `${name}: output field "${field}" must never be NaN`).toBe(false);
        }
      }
      // (2) Clamped fields stay in their contract range (defensive guards hold).
      expect(out.progressPercent, `${name}: progress 0–100`).toBeGreaterThanOrEqual(0);
      expect(out.progressPercent, `${name}: progress 0–100`).toBeLessThanOrEqual(100);
      // (3) Money fields stay finite (NOT Infinity/-Infinity reaching a corpus/savings figure).
      expect(Number.isFinite(out.totalCorpus), `${name}: totalCorpus finite`).toBe(true);
      expect(Number.isFinite(out.annualSavings), `${name}: annualSavings finite`).toBe(true);
      expect(Number.isFinite(out.savingsRate), `${name}: savingsRate finite`).toBe(true);
      // (4) Years-to-FIRE may be ±Infinity (honest "not within horizon") — but NEVER NaN, and a
      //     FINITE value is never negative (a negative would render a false "already retired").
      for (const y of [out.yearsToRegular, out.yearsToLean, out.yearsToFat, out.corpusOnlyYearsToRegular]) {
        expect(Number.isNaN(y), `${name}: a years-to-FIRE field must never be NaN`).toBe(false);
        if (Number.isFinite(y)) expect(y, `${name}: a finite years value is never negative`).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

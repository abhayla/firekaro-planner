/**
 * Store-level proof for the P3 monthly snapshot capture (audit A29.1/A30.1).
 *
 * Verifies the hydrate-time + Dashboard-time triggers accrue exactly one real
 * snapshot per calendar month (idempotent per `YYYY-MM`), skip empty
 * households, and enrich the current period with the derived FIRE number.
 *
 * vitest env is 'node', so localStorage is polyfilled (the storage adapter
 * no-ops without it) — same subset the expense-history + adapter specs use.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "./household";
import { useAssumptionsStore } from "./assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadAllSnapshots, periodKey } from "@/lib/expense-history";
import { LocalAuthProvider, setAuthProvider } from "@/lib/auth-provider";

beforeAll(() => {
  if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      get length() {
        return store.size;
      },
      key(i: number) {
        return Array.from(store.keys())[i] ?? null;
      },
      getItem(k: string) {
        return store.has(k) ? store.get(k)! : null;
      },
      setItem(k: string, v: string) {
        store.set(k, v);
      },
      removeItem(k: string) {
        store.delete(k);
      },
      clear() {
        store.clear();
      },
    };
  }
});

beforeEach(() => {
  localStorage.clear();
  setAuthProvider(new LocalAuthProvider()); // userId === 'self'
  setActivePinia(createPinia());
});

const MAY = new Date(2026, 4, 15); // 2026-05
const MAY_LATER = new Date(2026, 4, 28); // still 2026-05
const JUNE = new Date(2026, 5, 1); // 2026-06

describe("household snapshot capture (P3)", () => {
  it("captures nothing for an empty household", () => {
    const h = useHouseholdStore();
    h.maybeCaptureSnapshot(MAY);
    expect(loadAllSnapshots()).toHaveLength(0);
  });

  it("captures exactly one snapshot for the current period", () => {
    const h = useHouseholdStore();
    loadSeedPersona(h, useAssumptionsStore());
    h.maybeCaptureSnapshot(MAY);
    const snaps = loadAllSnapshots();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].period).toBe(periodKey(MAY));
    expect(snaps[0].totalAnnual).toBeGreaterThan(0);
  });

  it("a second capture in the same month adds none (idempotent per period)", () => {
    const h = useHouseholdStore();
    loadSeedPersona(h, useAssumptionsStore());
    h.maybeCaptureSnapshot(MAY);
    h.maybeCaptureSnapshot(MAY);
    h.maybeCaptureSnapshot(MAY_LATER); // different day, same month
    expect(loadAllSnapshots()).toHaveLength(1);
  });

  it("accrues a new point in a new month", () => {
    const h = useHouseholdStore();
    loadSeedPersona(h, useAssumptionsStore());
    h.maybeCaptureSnapshot(MAY);
    h.maybeCaptureSnapshot(JUNE);
    expect(loadAllSnapshots().map((s) => s.period)).toEqual(["2026-05", "2026-06"]);
  });

  it("recordFireSnapshot enriches the current period with the FIRE number (no duplicate)", () => {
    const h = useHouseholdStore();
    loadSeedPersona(h, useAssumptionsStore());
    h.maybeCaptureSnapshot(MAY); // expense-only first
    h.recordFireSnapshot(85_700_000, 2043, 12_500_000, MAY);
    const snaps = loadAllSnapshots();
    expect(snaps).toHaveLength(1); // same period → enriched, not duplicated
    expect(snaps[0].fireNumber).toBe(85_700_000);
    expect(snaps[0].fireTargetYear).toBe(2043);
    expect(snaps[0].netWorth).toBe(12_500_000);
  });

  it("hydrate() triggers a capture for a persisted household", () => {
    const h1 = useHouseholdStore();
    loadSeedPersona(h1, useAssumptionsStore());
    h1.persist();

    // Fresh pinia + store → hydrate loads persisted data and captures.
    setActivePinia(createPinia());
    const h2 = useHouseholdStore();
    h2.hydrate();
    expect(loadAllSnapshots().length).toBeGreaterThanOrEqual(1);
  });
});

/**
 * T-377 (QN-2) — the `quick` carve-out on `uiBodySchema`, proven WITHOUT a database.
 *
 * Why this file exists next to the live `planner.integration.spec.ts` cases: the integration
 * suite only runs where `server/.env` points at a real Postgres (it imports `src/index.ts`,
 * which boots `validateEnv`). The load-bearing risk here is a pure SCHEMA property and can —
 * and therefore must — be locked in the no-DB tier so it is enforced on every clone and in CI:
 *
 *   1. `uiBodySchema` is a strip-mode `z.object`. Before T-377 an unknown `quick` key was
 *      SILENTLY DROPPED on PUT — the user's gut-feel guess would vanish with a 200 OK.
 *   2. The PUT handler merges `{ ...existingPrefs, ...parsed.data }`. That merge only preserves
 *      an existing `quick` if a quick-less body parses to an object with NO `quick` KEY AT ALL.
 *      A schema that defaulted the field to `undefined`-but-present would spread
 *      `quick: undefined` over the stored blob and destroy it. This spec pins that.
 */
import { describe, it, expect } from "vitest";
import { uiBodySchema, quickPrefsSchema } from "./planner";

describe("uiBodySchema — the T-377 `quick` carve-out", () => {
  it("accepts and PRESERVES a full quick blob (without the schema entry it would be stripped)", () => {
    const quick = {
      guess: 100_000_000,
      completedAt: "2026-08-27T00:00:00.000Z",
      createdIds: ["inv-1", "mem-2"],
      directPlans: true,
    };
    const parsed = uiBodySchema.safeParse({ isFamilyView: false, currentFY: "2025-26", quick });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.quick).toEqual(quick);
  });

  it("MERGE-NOT-REPLACE: a quick-less body parses with NO `quick` key, so the spread cannot clobber", () => {
    const parsed = uiBodySchema.safeParse({ isFamilyView: true, currentFY: "2025-26" });
    expect(parsed.success).toBe(true);
    // The exact property the route's `{ ...existingPrefs, ...parsed.data }` merge depends on.
    expect(parsed.success && Object.prototype.hasOwnProperty.call(parsed.data, "quick")).toBe(false);

    const existingPrefs = { quick: { guess: 42 }, planBaseline: { fireNumber: 1 } };
    const merged = { ...existingPrefs, ...(parsed.success ? parsed.data : {}) };
    expect(merged.quick, "an existing quick blob survives a quick-less ui write").toEqual({ guess: 42 });
    expect(merged.planBaseline, "the #138 baseline still co-resides untouched").toEqual({ fireNumber: 1 });
  });

  it("every quick field is optional — a partial blob is valid (QN-1 writes incrementally)", () => {
    expect(quickPrefsSchema.safeParse({}).success).toBe(true);
    expect(quickPrefsSchema.safeParse({ guess: 0 }).success).toBe(true);
    expect(quickPrefsSchema.safeParse({ directPlans: false }).success).toBe(true);
  });

  it("rejects malformed input rather than persisting junk (422 at the route)", () => {
    expect(quickPrefsSchema.safeParse({ guess: -1 }).success).toBe(false);
    expect(quickPrefsSchema.safeParse({ guess: "ten crore" }).success).toBe(false);
    expect(quickPrefsSchema.safeParse({ createdIds: "inv-1" }).success).toBe(false);
    expect(quickPrefsSchema.safeParse({ directPlans: "yes" }).success).toBe(false);
  });

  it("null clears the blob (the ui store's setQuickPrefs(null) path)", () => {
    const parsed = uiBodySchema.safeParse({ quick: null });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.quick).toBeNull();
  });
});

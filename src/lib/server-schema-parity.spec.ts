/**
 * Server-schema-parity guard (T-379-fix).
 *
 * The ServerAdapter (v6) persists frontend documents through Hono routes whose Zod
 * body schemas are `z.object()` — STRIP mode by default: any key present on the
 * frontend TYPE that the server schema does NOT declare is silently dropped on
 * PUT, with no error surfaced anywhere. This bit twice for real: the `ui.quick`
 * carve-out (T-377, caught before ship) and `frameVersion` (ADR-0006, shipped and
 * caught here) — both optional fields the frontend type declared and persisted,
 * that the server schema never declared.
 *
 * This spec is the mechanism so a THIRD instance can't ship silently: for every
 * server-adapter-persisted document that has its own (non-shared) server schema,
 * build a FULLY-POPULATED sample by hand from the frontend TYPE — every optional
 * field set — run it through the matching server Zod schema, and assert NO key was
 * lost. `household` is excluded on purpose: its server schema (`householdSchema`) is the SAME
 * schema object the frontend type is built from (imported from `src/types/*`), so there is no
 * drift surface to test — the frontend type IS the schema there.
 *
 * `assumptions` is excluded for a DIFFERENT and deliberate reason (ADR-0007 / gh #185): its server
 * schema is `persistedAssumptionsSchema`, which OMITS the three income-path knobs because
 * `user_assumptions` has no column for them until #185 step 6. That omission is intentional — a
 * field the server accepts but cannot store is the ADR-0006 silent-drop bug — so a "no key lost"
 * parity check would fail by design here. The narrower contract that DOES hold (accepted set ===
 * column set, and the three knobs accepted by neither) is locked in
 * `server/src/lib/planner-assumptions-mapping.spec.ts`.
 *
 * Import note: this file imports server/src/lib/planner-schemas.ts — a PURE file
 * (Zod schemas only, no Hono/Prisma/auth imports) specifically so it is importable
 * from the root vitest config (`environment: "node"`, no @planner alias, no DB).
 */
import { describe, it, expect } from "vitest";
import {
  planBaselineSchema,
  lifecycleSnapshotSchema,
  quickPrefsSchema,
  uiBodySchema,
} from "../../server/src/lib/planner-schemas";
import type { PlanBaseline } from "./plan-variance";
import type { LifecycleSnapshot } from "./lifecycle-digest";
import type { QuickPrefs } from "@/stores/ui";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";

/** Every key path present in a value, dot-separated, arrays walked by index. Sorted. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined || typeof value !== "object") {
    return prefix ? [prefix] : [];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [prefix || "[]"];
    return value.flatMap((item, i) => keyPaths(item, `${prefix}[${i}]`));
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return [prefix || "{}"];
  return entries.flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

/** Asserts `parsed` (server Zod output) preserves every key path present in `sample` (frontend input). */
function expectNoStrippedKeys(sample: unknown, parsed: unknown) {
  const before = keyPaths(sample).sort();
  const after = keyPaths(parsed).sort();
  expect(after, "server schema silently dropped key(s) present on the frontend sample").toEqual(before);
}

describe("server-schema-parity — frontend type vs server Zod schema (T-379-fix)", () => {
  // Fully-populated PlanBaseline — every optional field set, incl. frameVersion (ADR-0006).
  const planBaselineSample: PlanBaseline = {
    capturedAt: "2026-08-27T00:00:00.000Z",
    fireNumber: 34285714,
    fireAge: 52.4,
    yearsToFire: 18.5,
    netWorth: 9500000,
    monthlyContribution: 85000,
    annualExpenses: 1200000,
    assumptions: DEFAULT_ASSUMPTIONS,
    frameVersion: "adr-0006",
  };

  it("plan-baseline: planBaselineSchema keeps every field, including frameVersion", () => {
    const parsed = planBaselineSchema.safeParse(planBaselineSample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expectNoStrippedKeys(planBaselineSample, parsed.data);
    expect(parsed.data.frameVersion).toBe("adr-0006");
  });

  // Fully-populated LifecycleSnapshot — every optional field set, incl. frameVersion (ADR-0006).
  const lifecycleSnapshotSample: LifecycleSnapshot = {
    capturedAt: "2026-08-27T00:00:00.000Z",
    fireAge: 52.4,
    fireYear: 2044,
    currentCorpus: 6200000,
    fireNumber: 34285714,
    savingsRatePct: 42,
    milestoneBand: 25,
    activeNudgeIds: ["milestone-25", "annual-review"],
    monteCarloP50Age: 53,
    frameVersion: "adr-0006",
  };

  it("lifecycleSnapshot: lifecycleSnapshotSchema keeps every field, including frameVersion", () => {
    const parsed = lifecycleSnapshotSchema.safeParse(lifecycleSnapshotSample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expectNoStrippedKeys(lifecycleSnapshotSample, parsed.data);
    expect(parsed.data.frameVersion).toBe("adr-0006");
  });

  // Fully-populated QuickPrefs — every optional field set.
  const quickPrefsSample: QuickPrefs = {
    guess: 30000000,
    completedAt: "2026-08-27T00:00:00.000Z",
    createdIds: ["inv-1", "exp-1"],
    directPlans: true,
  };

  it("quick: quickPrefsSchema keeps every field", () => {
    const parsed = quickPrefsSchema.safeParse(quickPrefsSample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expectNoStrippedKeys(quickPrefsSample, parsed.data);
  });

  it("ui: uiBodySchema keeps lifecycleSnapshot + quick nested, both fully populated", () => {
    const uiSample = {
      isFamilyView: true,
      viewingMemberId: "member-1",
      lifecycleSnapshot: lifecycleSnapshotSample,
      quick: quickPrefsSample,
    };
    const parsed = uiBodySchema.safeParse(uiSample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expectNoStrippedKeys(uiSample, parsed.data);
  });
});

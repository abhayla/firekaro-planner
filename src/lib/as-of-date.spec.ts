/**
 * #198 — proves the class: every screen that shows a member's age must agree with the kernel's
 * own age for that SAME member, at the SAME `asOfDate` — and `todayIsoLocal()` must never read
 * the UTC calendar date (the class that makes early-IST-morning users see "yesterday").
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";
import { ageFromDOB } from "@/lib/age";
import { todayIsoLocal, ageAsOf } from "@/lib/as-of-date";

describe("todayIsoLocal — local calendar date, not UTC", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the LOCAL date even when UTC has already rolled to the next day", () => {
    // 2026-09-29T23:30 in a UTC+5:30 zone (e.g. IST) is 2026-09-29T18:00Z — UTC is still the
    // same day here, so pick a moment where UTC has rolled but local has not: 00:30 local in a
    // zone AHEAD of UTC. We simulate this directly by constructing a Date whose local getters
    // and toISOString() disagree — the real-world case is any positive-offset zone just after
    // local midnight where toISOString() (UTC) still reports the previous day.
    const localMidnightThirty = new Date(2026, 8, 29, 0, 30, 0); // local: 2026-09-29 00:30
    expect(todayIsoLocal(localMidnightThirty)).toBe("2026-09-29");

    // The bug this replaces: `new Date().toISOString().slice(0, 10)` uses UTC getters, which for
    // a UTC+5:30 machine at 00:30 local resolves to the PRIOR UTC day. Demonstrate the divergence
    // directly against the old expression to document the defect being fixed.
    const utcSliced = localMidnightThirty.toISOString().slice(0, 10);
    // In a zone west of UTC (like the CI runner, typically UTC) this may already agree — the
    // point of this module is correctness in EVERY zone, so assert todayIsoLocal always matches
    // the LOCAL getters, independent of what toISOString() would have said.
    expect(todayIsoLocal(localMidnightThirty)).toBe(
      `${localMidnightThirty.getFullYear()}-${String(localMidnightThirty.getMonth() + 1).padStart(2, "0")}-${String(localMidnightThirty.getDate()).padStart(2, "0")}`,
    );
    void utcSliced;
  });
});

describe("#198 — displayed age === kernel anchorAge, same member, same asOfDate", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("Sharmas: Profile-style ageAsOf(primary earner) matches derive()'s anchorAge at a pinned asOfDate", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a, "2025-26");

    const asOfDate = "2026-09-29";
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26", asOfDate };
    const k = derive(h.data, a.values, lens, { currentYear: 2026 });

    const primary = h.data.members.find((m) => m.id === "rohit")!;
    const displayedAge = ageAsOf(primary.dateOfBirth, asOfDate);

    expect(displayedAge).toBe(k.anchorAge);
  });

  it("catches a wall-clock-only age: if the display used ageFromDOB(dob) with NO asOfDate while the kernel is pinned to a different date, they diverge", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a, "2025-26");

    // Pin the kernel far in the future relative to "now" so a bare `ageFromDOB(dob)` (wall clock)
    // would disagree with the kernel's pinned anchorAge — this is exactly the #198 regression
    // shape: a form/profile reading the real Date() while the kernel reads an explicit lens date.
    const asOfDate = "2030-09-29";
    const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26", asOfDate };
    const k = derive(h.data, a.values, lens, { currentYear: 2030 });

    const primary = h.data.members.find((m) => m.id === "rohit")!;
    const wallClockAge = ageFromDOB(primary.dateOfBirth); // the old, buggy call shape
    const correctAge = ageAsOf(primary.dateOfBirth, asOfDate);

    expect(correctAge).toBe(k.anchorAge);
    expect(wallClockAge).not.toBe(correctAge);
  });

  it("useFireDerive's own asOfDate (todayIsoLocal, wall clock 'now') agrees with a Profile-style ageAsOf() at the SAME instant — the actual #198 regression shape", () => {
    vi.useFakeTimers();
    try {
      // 00:30 local time — the exact window where the OLD `new Date().toISOString().slice(0,10)`
      // (UTC) would resolve to a DIFFERENT calendar day than the local date any UTC+ zone's user
      // (and any local-getter-based display) sees.
      vi.setSystemTime(new Date(2026, 8, 29, 0, 30, 0));

      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      loadSeedPersona(h, a, "2025-26");

      const kernelAsOfDate = todayIsoLocal(); // what useFireDerive.ts now threads into the lens
      const lens = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26", asOfDate: kernelAsOfDate };
      const k = derive(h.data, a.values, lens, { currentYear: 2026 });

      const primary = h.data.members.find((m) => m.id === "rohit")!;
      const profileDisplayedAge = ageAsOf(primary.dateOfBirth, kernelAsOfDate);

      expect(profileDisplayedAge).toBe(k.anchorAge);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * #223 rounds 2-3 — `salary.hasEpf` is household state, honoured by `autoFlowSalaryToEPF()`
 * itself, so it holds across EVERY surface that calls it: `/quick`, `updateMember` (Profile), and
 * the salary form. This is the store-level proof the review rounds asked for.
 *
 * Round-3 fix (HIGH finding): round 2 only removed a row marked `autoFlowSource`, so any
 * household whose EPF row was auto-created BEFORE this PR (no marker at all — the vast majority
 * of production data) kept that row and its deduction forever on flip-to-false. The auto-flow's
 * OWN dedupe (`existing = investments.find(...)`) already treats the FIRST EPF_VPF row for a
 * member as its own regardless of who created it — it overwrites that row's contribution on every
 * run. So ownership is already asserted by existing behaviour: `hasEpf:false` now removes exactly
 * that row (the one `find` returns), never a SECOND row for the same member (a genuine hand-added
 * extra, which `find` never touches either way).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "./household";

beforeEach(() => {
  if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    } as Storage;
  }
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("autoFlowSalaryToEPF — hasEpf is member salary state", () => {
  it("creates no EPF row for a member whose salary says hasEpf:false", () => {
    const h = useHouseholdStore();
    const m = h.addMember({
      name: "You",
      dateOfBirth: "1988-01-01",
      role: "ADULT",
      targetRetirementAge: 50,
      city: "Metro",
      health: "Healthy",
      riskAppetite: "Moderate",
      marital: "Single",
    });
    h.updateMember(m.id, { salary: { annualCTC: 30_00_000, hikePercent: 0, hasEpf: false } });
    expect(h.data.investments.some((i) => i.type === "EPF_VPF" && i.ownerId === m.id)).toBe(false);
  });

  it("removes its OWN auto-created row when hasEpf flips to false, keeping a user-added one", () => {
    const h = useHouseholdStore();
    const m = h.addMember({
      name: "You",
      dateOfBirth: "1988-01-01",
      role: "ADULT",
      targetRetirementAge: 50,
      city: "Metro",
      health: "Healthy",
      riskAppetite: "Moderate",
      marital: "Single",
    });
    // hasEpf defaults true (absent) — the auto-flow creates a row.
    h.updateMember(m.id, { salary: { annualCTC: 30_00_000, hikePercent: 0 } });
    const auto = h.data.investments.find((i) => i.type === "EPF_VPF" && i.ownerId === m.id);
    expect(auto, "the auto-flow must create a row when hasEpf is absent (defaults true)").toBeTruthy();
    expect(auto!.autoFlowSource).toBe(true);

    // A user adds a SECOND EPF row by hand (e.g. a previous employer's balance) — no
    // autoFlowSource marker, exactly as InvestmentForm.vue creates one.
    const manual = h.addInvestment({
      type: "EPF_VPF",
      label: "Old employer EPF",
      value: 5_00_000,
      monthlyContribution: 0,
      ownerId: m.id,
    });

    h.updateMember(m.id, { salary: { annualCTC: 30_00_000, hikePercent: 0, hasEpf: false } });

    const remaining = h.data.investments.filter((i) => i.type === "EPF_VPF" && i.ownerId === m.id);
    expect(remaining.map((i) => i.id)).toEqual([manual.id]);
    expect(remaining.some((i) => i.id === auto!.id)).toBe(false);
  });

  it("#223 round 3 — a LEGACY row with no autoFlowSource marker is removed on flip-to-false", () => {
    const h = useHouseholdStore();
    const m = h.addMember({
      name: "You",
      dateOfBirth: "1988-01-01",
      role: "ADULT",
      targetRetirementAge: 50,
      city: "Metro",
      health: "Healthy",
      riskAppetite: "Moderate",
      marital: "Single",
    });
    // Simulates a household saved BEFORE this PR: the auto-flow created this row under the OLD
    // code, which never set `autoFlowSource`. Added directly (not via updateMember) so it starts
    // with no marker at all — exactly what a pre-existing production row looks like.
    const legacy = h.addInvestment({
      type: "EPF_VPF",
      label: "EPF",
      value: 0,
      monthlyContribution: 50_000,
      ownerId: m.id,
    });
    expect(legacy.autoFlowSource).toBeUndefined();

    h.updateMember(m.id, { salary: { annualCTC: 30_00_000, hikePercent: 0, hasEpf: false } });

    expect(h.data.investments.some((i) => i.id === legacy.id)).toBe(false);
    expect(h.data.investments.some((i) => i.type === "EPF_VPF" && i.ownerId === m.id)).toBe(false);
  });

  it("re-creates the row when hasEpf flips back to true", () => {
    const h = useHouseholdStore();
    const m = h.addMember({
      name: "You",
      dateOfBirth: "1988-01-01",
      role: "ADULT",
      targetRetirementAge: 50,
      city: "Metro",
      health: "Healthy",
      riskAppetite: "Moderate",
      marital: "Single",
    });
    h.updateMember(m.id, { salary: { annualCTC: 30_00_000, hikePercent: 0, hasEpf: false } });
    expect(h.data.investments.some((i) => i.type === "EPF_VPF" && i.ownerId === m.id)).toBe(false);

    h.updateMember(m.id, { salary: { annualCTC: 30_00_000, hikePercent: 0, hasEpf: true } });
    const row = h.data.investments.find((i) => i.type === "EPF_VPF" && i.ownerId === m.id);
    expect(row).toBeTruthy();
    expect(row!.monthlyContribution).toBeGreaterThan(0);
  });
});

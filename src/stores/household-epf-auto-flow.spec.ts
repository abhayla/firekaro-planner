/**
 * #223 round 2 — `salary.hasEpf` is household state, honoured by `autoFlowSalaryToEPF()` itself,
 * so it holds across EVERY surface that calls it: `/quick`, `updateMember` (Profile), and the
 * salary form. This is the store-level proof the review round asked for: a member with
 * `hasEpf:false` gets no EPF row after `updateMember`, flipping back to true re-creates it, and a
 * user-added EPF row (no `autoFlowSource` marker) is never touched either way.
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

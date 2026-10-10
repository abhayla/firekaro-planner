/**
 * gh #218 PR B fix round 1 — migration-on-hydrate for EPF rows the auto-flow wrote under the
 * retired 40%-of-CTC basic. hydrate() must re-derive them on the ONE basic base (50% of CTC, or
 * the user's own basic), leave a user-edited amount alone, and be idempotent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "./household";
import { monthlyEpfContributionFor } from "@/lib/salary-cash";

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

const CTC = 20_00_000;
// Retired rule: basic 8L → (8L × 12% + 8L × 12%) / 12 = 16,000/month.
const RETIRED_40 = 16_000;
// Current rule: basic 10L (50%) → 20,000/month.
const CURRENT_50 = 20_000;

/** Persist a household whose one earner's EPF row carries `monthly`, then hydrate a fresh store. */
function persistThenHydrate(monthly: number, extraRow?: number) {
  const h1 = useHouseholdStore();
  const m = h1.addMember({
    name: "You",
    dateOfBirth: "1988-01-01",
    role: "ADULT",
    targetRetirementAge: 50,
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Single",
  });
  h1.updateMember(m.id, { salary: { annualCTC: CTC, hikePercent: 0 } });
  const row = h1.data.investments.find((i) => i.type === "EPF_VPF" && i.ownerId === m.id)!;
  row.monthlyContribution = monthly;
  if (extraRow !== undefined) {
    h1.data.investments.push({ id: "prev", type: "EPF_VPF", label: "Old EPF", value: 0, monthlyContribution: extraRow, ownerId: m.id });
  }
  h1.persist();
  setActivePinia(createPinia());
  const h2 = useHouseholdStore();
  h2.hydrate();
  const rows = h2.data.investments.filter((i) => i.type === "EPF_VPF" && i.ownerId === m.id);
  return { h2, rows };
}

describe("hydrate — re-derive auto EPF rows written under the retired 40% basic (gh #218)", () => {
  it("the current rule is 50% of CTC (fixture sanity)", () => {
    expect(monthlyEpfContributionFor({ annualCTC: CTC })).toBe(CURRENT_50);
  });

  it("an auto row at the retired 40% figure is re-derived to 50%", () => {
    const { rows } = persistThenHydrate(RETIRED_40);
    expect(rows[0].monthlyContribution).toBe(CURRENT_50);
  });

  it("a user-edited row (any other amount) is left untouched", () => {
    const { rows } = persistThenHydrate(12_345);
    expect(rows[0].monthlyContribution).toBe(12_345);
  });

  it("a second EPF row for the same member is never touched, even at the retired figure", () => {
    const { rows } = persistThenHydrate(RETIRED_40, RETIRED_40);
    expect(rows[0].monthlyContribution).toBe(CURRENT_50);
    expect(rows.find((r) => r.id === "prev")!.monthlyContribution).toBe(RETIRED_40);
  });

  it("is idempotent: a second hydrate after persisting changes nothing", () => {
    const { h2, rows } = persistThenHydrate(RETIRED_40);
    const ownerId = rows[0].ownerId;
    h2.persist();
    setActivePinia(createPinia());
    const h3 = useHouseholdStore();
    h3.hydrate();
    const again = h3.data.investments.filter((i) => i.type === "EPF_VPF" && i.ownerId === ownerId);
    expect(again.map((r) => r.monthlyContribution)).toEqual([CURRENT_50]);
  });
});

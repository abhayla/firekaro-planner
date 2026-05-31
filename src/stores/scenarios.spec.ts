import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useScenariosStore } from "./scenarios";
import { makeKey } from "@/lib/storage-adapter";

describe("useScenariosStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    if (typeof localStorage !== "undefined") {
      // adapter-namespaced key per ADR-0001 (Stage A5).
      localStorage.removeItem(makeKey("self", "scenarios"));
    }
  });

  it("hydrates with 6 seed scenarios when localStorage is empty (Stage M)", () => {
    const store = useScenariosStore();
    store.hydrate();
    expect(store.scenarios.length).toBe(6);
    const names = store.scenarios.map((s) => s.name);
    // 3 positive + 3 stress per audit Entry #26 A26.1
    expect(names.some((n) => n.startsWith("Positive ·"))).toBe(true);
    expect(names.some((n) => n.startsWith("Stress ·"))).toBe(true);
    expect(names.filter((n) => n.startsWith("Positive ·")).length).toBe(3);
    expect(names.filter((n) => n.startsWith("Stress ·")).length).toBe(3);
  });

  it("addScenario appends with generated id + createdAt", () => {
    const store = useScenariosStore();
    store.hydrate();
    const before = store.scenarios.length;
    const created = store.addScenario("Test scenario", { annualExpenses: 720000 });
    expect(store.scenarios.length).toBe(before + 1);
    expect(created.id).toMatch(/^scn-/);
    expect(created.name).toBe("Test scenario");
    expect(created.leverValues.annualExpenses).toBe(720000);
    expect(created.createdAt).toBeGreaterThan(0);
  });

  it("removeScenario filters by id", () => {
    const store = useScenariosStore();
    store.hydrate();
    const initial = store.scenarios.length;
    const target = store.scenarios[0];
    store.removeScenario(target.id);
    expect(store.scenarios.length).toBe(initial - 1);
    expect(store.scenarios.find((s) => s.id === target.id)).toBeUndefined();
  });

  it("updateScenario patches in place", () => {
    const store = useScenariosStore();
    store.hydrate();
    const target = store.scenarios[0];
    store.updateScenario(target.id, { name: "Renamed" });
    expect(store.scenarios.find((s) => s.id === target.id)?.name).toBe("Renamed");
  });

  it("reset returns to seed scenarios", () => {
    const store = useScenariosStore();
    store.hydrate();
    store.removeScenario(store.scenarios[0].id);
    store.removeScenario(store.scenarios[0].id);
    store.reset();
    expect(store.scenarios.length).toBe(6);
  });
});

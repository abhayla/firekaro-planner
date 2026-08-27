/**
 * ui store — lifecycle-snapshot persistence (Stage B, Rule 25 unit round-trip).
 *
 * The store persists through the storage seam. Tests run in the node env (no real
 * `localStorage`), so we install an in-memory `StorageAdapter` via `setAdapter()`
 * BEFORE the store is created — proving a true persist()→hydrate() round-trip of
 * `lifecycleSnapshot` (and, via JSON, its JSON-safety) without touching the DOM.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import { useUiStore } from "@/stores/ui";
import { setAdapter, type StorageAdapter } from "@/lib/storage-adapter";
import { getCurrentFinancialYear } from "@/lib/expense-history";
import type { LifecycleSnapshot } from "@/lib/lifecycle-digest";

/** Map-backed in-memory adapter (JSON-encoded, mirroring LocalStorageAdapter). */
function makeMemoryAdapter(): StorageAdapter & { _store: Map<string, string> } {
  const _store = new Map<string, string>();
  return {
    _store,
    get<T>(key: string): T | null {
      const raw = _store.get(key);
      return raw == null ? null : (JSON.parse(raw) as T);
    },
    set<T>(key: string, value: T): void {
      _store.set(key, JSON.stringify(value));
    },
    remove(key: string): void {
      _store.delete(key);
    },
    clearForCurrentUser(): void {
      _store.clear();
    },
  };
}

const SNAP: LifecycleSnapshot = {
  capturedAt: "2026-06-03T00:00:00.000Z",
  fireAge: 55.4,
  fireYear: 2052,
  currentCorpus: 12_500_000,
  fireNumber: 40_000_000,
  savingsRatePct: 42,
  milestoneBand: 25,
  activeNudgeIds: ["marginal-relief"],
  monteCarloP50Age: 56,
};

let mem: ReturnType<typeof makeMemoryAdapter>;

describe("ui store — lifecycleSnapshot persistence (Stage B)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mem = makeMemoryAdapter();
    setAdapter(mem);
  });
  afterEach(() => setAdapter(null));

  it("captureLifecycleSnapshot persists, and a fresh store hydrates it back (round-trip)", async () => {
    const ui = useUiStore();
    ui.captureLifecycleSnapshot(SNAP);
    await nextTick(); // flush the watch → persist

    // Fresh pinia + store sharing the same adapter → hydrate reads the persisted blob.
    setActivePinia(createPinia());
    setAdapter(mem);
    const ui2 = useUiStore();
    ui2.hydrate();
    expect(ui2.lifecycleSnapshot).toEqual(SNAP);
  });

  it("capturing the snapshot does NOT perturb the other ui fields", async () => {
    const ui = useUiStore();
    ui.toggleFamilyView(); // isFamilyView → true
    ui.captureLifecycleSnapshot(SNAP);
    await nextTick();

    const blob = mem.get<Record<string, unknown>>("ui");
    expect(blob?.isFamilyView).toBe(true);
    // currentFY is auto-derived, not user state → never written to the blob.
    expect(blob).not.toHaveProperty("currentFY");
    expect((blob?.lifecycleSnapshot as LifecycleSnapshot)?.capturedAt).toBe(SNAP.capturedAt);
  });

  it("migration-on-hydrate: an older blob without the field backfills to null", () => {
    mem.set("ui", { isFamilyView: false }); // legacy shape (no lifecycleSnapshot)
    const ui = useUiStore();
    ui.hydrate();
    expect(ui.lifecycleSnapshot).toBeNull();
  });

  it("hydrate ignores a stale persisted currentFY and resolves to the auto current FY", () => {
    // A legacy blob pinned to an old FY must NOT override the wall-clock current FY.
    mem.set("ui", { isFamilyView: false, currentFY: "2024-25" });
    const ui = useUiStore();
    ui.hydrate();
    expect(ui.currentFY).toBe(getCurrentFinancialYear());
  });
});

describe("ui store — T-377 (QN-2) quick prefs + the shared session-only retirement age", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mem = makeMemoryAdapter();
    setAdapter(mem);
  });
  afterEach(() => setAdapter(null));

  it("quick prefs round-trip through persist() → hydrate()", async () => {
    const ui = useUiStore();
    ui.setQuickPrefs({ guess: 10_00_00_000, completedAt: "2026-08-27T00:00:00.000Z", directPlans: true });
    await nextTick();

    setActivePinia(createPinia());
    const fresh = useUiStore();
    fresh.hydrate();
    expect(fresh.quick?.guess).toBe(10_00_00_000);
    expect(fresh.quick?.completedAt).toBe("2026-08-27T00:00:00.000Z");
    expect(fresh.quick?.directPlans).toBe(true);
  });

  it("setQuickPrefs MERGES (QN-1 may write one field at a time), null clears", async () => {
    const ui = useUiStore();
    ui.setQuickPrefs({ guess: 5_00_00_000 });
    ui.setQuickPrefs({ directPlans: false });
    await nextTick();
    expect(ui.quick).toEqual({ guess: 5_00_00_000, directPlans: false });
    ui.setQuickPrefs(null);
    expect(ui.quick).toBeNull();
  });

  it("a pre-T-377 blob (no `quick` key) hydrates to null — no crash, no fabricated guess", () => {
    mem.set("ui", { isFamilyView: false, viewingMemberId: null, lifecycleSnapshot: null });
    const ui = useUiStore();
    ui.hydrate();
    expect(ui.quick).toBeNull();
  });

  it("whatIfTargetAge is SESSION-ONLY — never written to the persisted blob (#64 class)", async () => {
    const ui = useUiStore();
    ui.setWhatIfTargetAge(53);
    ui.setQuickPrefs({ guess: 1 }); // force a persist so the blob is definitely written
    await nextTick();

    const blob = mem.get<Record<string, unknown>>("ui");
    expect(blob).toBeTruthy();
    expect(Object.keys(blob!)).not.toContain("whatIfTargetAge");

    setActivePinia(createPinia());
    const fresh = useUiStore();
    fresh.hydrate();
    expect(fresh.whatIfTargetAge).toBeNull();
  });

  it("setWhatIfTargetAge rounds and rejects a non-finite age (rule 31)", () => {
    const ui = useUiStore();
    ui.setWhatIfTargetAge(52.6);
    expect(ui.whatIfTargetAge).toBe(53);
    ui.setWhatIfTargetAge(Number.NaN);
    expect(ui.whatIfTargetAge).toBeNull();
    ui.setWhatIfTargetAge(null);
    expect(ui.whatIfTargetAge).toBeNull();
  });
});

describe("ui store — T-379 (QN-5) what-if lever set", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mem = makeMemoryAdapter();
    setAdapter(mem);
  });
  afterEach(() => setAdapter(null));

  it("toggleWhatIfLever switches a move on, then off (and is idempotent per key)", () => {
    const ui = useUiStore();
    expect(ui.whatIfLevers).toEqual([]);

    ui.toggleWhatIfLever("step-up-10");
    expect(ui.whatIfLevers).toEqual(["step-up-10"]);
    // Toggling the SAME key again removes it — never duplicates it.
    ui.toggleWhatIfLever("step-up-10");
    expect(ui.whatIfLevers).toEqual([]);

    ui.toggleWhatIfLever("delay-3");
    ui.toggleWhatIfLever("delay-3");
    ui.toggleWhatIfLever("delay-3");
    expect(ui.whatIfLevers).toEqual(["delay-3"]);
  });

  it("toggleWhatIfLever keeps the other switched-on moves untouched", () => {
    const ui = useUiStore();
    ui.toggleWhatIfLever("step-up-10");
    ui.toggleWhatIfLever("delay-3");
    ui.toggleWhatIfLever("trim-expenses");
    expect(ui.whatIfLevers).toEqual(["step-up-10", "delay-3", "trim-expenses"]);

    ui.toggleWhatIfLever("delay-3");
    expect(ui.whatIfLevers).toEqual(["step-up-10", "trim-expenses"]);
  });

  it("clearWhatIfLevers switches every move off (the picker's 'Switch all off')", () => {
    const ui = useUiStore();
    ui.toggleWhatIfLever("step-up-10");
    ui.toggleWhatIfLever("direct-plans");
    expect(ui.whatIfLevers).toHaveLength(2);

    ui.clearWhatIfLevers();
    expect(ui.whatIfLevers).toEqual([]);
    // Idempotent — clearing an already-empty set is a no-op, never a crash.
    ui.clearWhatIfLevers();
    expect(ui.whatIfLevers).toEqual([]);
  });

  it("the what-if lever set is SESSION-ONLY — never written to the persisted blob (#64 class)", async () => {
    const ui = useUiStore();
    ui.toggleWhatIfLever("step-up-10");
    ui.setQuickPrefs({ guess: 1 }); // force a persist so the blob is definitely written
    await nextTick();

    const blob = mem.get<Record<string, unknown>>("ui");
    expect(blob).toBeTruthy();
    expect(Object.keys(blob!)).not.toContain("whatIfLevers");

    setActivePinia(createPinia());
    const fresh = useUiStore();
    fresh.hydrate();
    expect(fresh.whatIfLevers).toEqual([]);
  });
});

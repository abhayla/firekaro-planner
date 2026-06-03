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
    ui.setCurrentFY("2024-25");
    ui.captureLifecycleSnapshot(SNAP);
    await nextTick();

    const blob = mem.get<Record<string, unknown>>("ui");
    expect(blob?.isFamilyView).toBe(true);
    expect(blob?.currentFY).toBe("2024-25");
    expect((blob?.lifecycleSnapshot as LifecycleSnapshot)?.capturedAt).toBe(SNAP.capturedAt);
  });

  it("migration-on-hydrate: an older blob without the field backfills to null", () => {
    mem.set("ui", { isFamilyView: false, currentFY: "2025-26" }); // legacy shape
    const ui = useUiStore();
    ui.hydrate();
    expect(ui.lifecycleSnapshot).toBeNull();
    expect(ui.currentFY).toBe("2025-26");
  });
});

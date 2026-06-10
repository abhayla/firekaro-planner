import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { ServerAdapter, SERVER_KEYS } from "./server-adapter";

// vitest env is 'node' — polyfill localStorage for the local-fallback path
// (same in-memory shim as storage-adapter.spec.ts).
beforeAll(() => {
  if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    } as Storage;
  }
});

/** Minimal Response stub for the injected fetch. */
function okJson(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  } as unknown as Response;
}
function httpError(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe("ServerAdapter — write-behind cache (mocked fetch, no DB/network)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("get/set on a server key is synchronous against the in-memory cache", () => {
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, _init?: RequestInit) => okJson(null));
    const a = new ServerAdapter("u1", { fetchImpl });
    expect(a.get("household")).toBeNull();
    a.set("household", { name: "X" });
    // Synchronous read — no flush has fired yet (still inside the debounce window).
    expect(a.get<{ name: string }>("household")).toEqual({ name: "X" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("debounce coalesces N rapid set()s into ONE PUT (the last value wins)", async () => {
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, _init?: RequestInit) => okJson(null));
    const a = new ServerAdapter("u1", { fetchImpl, debounceMs: 1500 });

    a.set("household", { v: 1 });
    a.set("household", { v: 2 });
    a.set("household", { v: 3 });
    expect(fetchImpl).not.toHaveBeenCalled(); // still within the window

    await vi.advanceTimersByTimeAsync(1500);

    const puts = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT");
    expect(puts).toHaveLength(1);
    expect(String(puts[0][0])).toContain("/api/planner/household");
    expect(JSON.parse((puts[0][1] as RequestInit).body as string)).toEqual({ v: 3 });
  });

  it("debounces each key independently", async () => {
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, _init?: RequestInit) => okJson(null));
    const a = new ServerAdapter("u1", { fetchImpl, debounceMs: 1000 });
    a.set("household", { a: 1 });
    a.set("ui", { currentFY: "2026-27" });
    await vi.advanceTimersByTimeAsync(1000);
    const puts = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts.map((p) => String(p[0])).sort()).toEqual([
      expect.stringContaining("/api/planner/household"),
      expect.stringContaining("/api/planner/ui"),
    ]);
  });

  it("hydrateAll fills the cache from one concurrent GET per SERVER_KEYS entry", async () => {
    const byKey: Record<string, unknown> = {
      household: { name: "Sharma" },
      assumptions: { inflation: 0.06 },
      scenarios: [{ id: "s1" }],
      features: { flags: {}, wizardCompleted: true },
      ui: { currentFY: "2026-27" },
      "expense-history": [{ period: "2026-05" }],
      "plan-baseline": { fireNumber: 105500000 },
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const key = String(url).split("/api/planner/")[1];
      return okJson(byKey[key] ?? null);
    });
    const a = new ServerAdapter("u1", { fetchImpl, baseUrl: "http://localhost:3100" });

    await a.hydrateAll();

    // One GET per server-backed key (SERVER_KEYS) — grows automatically as keys are added (#138).
    expect(fetchImpl).toHaveBeenCalledTimes(SERVER_KEYS.size);
    expect(a.get("household")).toEqual({ name: "Sharma" });
    expect(a.get("ui")).toEqual({ currentFY: "2026-27" });
    expect(a.get("expense-history")).toEqual([{ period: "2026-05" }]);
    expect(a.get("plan-baseline")).toEqual({ fireNumber: 105500000 });
  });

  it("hydrateAll rejects when a GET fails (the main.ts fallback trigger)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      return String(url).includes("/ui") ? httpError(500) : okJson(null);
    });
    const a = new ServerAdapter("u1", { fetchImpl });
    await expect(a.hydrateAll()).rejects.toThrow(/HTTP 500/);
  });

  it("falls through to localStorage for non-server keys (active-seed, tour-dismissed)", () => {
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, _init?: RequestInit) => okJson(null));
    const a = new ServerAdapter("u1", { fetchImpl });

    a.set("active-seed", "sharmas");
    expect(a.get<string>("active-seed")).toBe("sharmas");
    // No server flush scheduled for a local-only key.
    expect(localStorage.getItem("firekaro-mvp:u1:active-seed")).toBe(JSON.stringify("sharmas"));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("clearForCurrentUser fires DELETE /all, clears the cache and pending flushes", async () => {
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, _init?: RequestInit) => okJson(null));
    const a = new ServerAdapter("u1", { fetchImpl });
    a.set("household", { name: "X" });

    a.clearForCurrentUser();

    expect(a.get("household")).toBeNull();
    const del = fetchImpl.mock.calls.find((c) => (c[1] as RequestInit).method === "DELETE");
    expect(del).toBeTruthy();
    expect(String(del![0])).toContain("/api/planner/all");

    // The pending flush for "household" was cancelled — advancing time fires no PUT.
    await vi.advanceTimersByTimeAsync(2000);
    const puts = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT");
    expect(puts).toHaveLength(0);
  });

  it("a failed flush never throws into the synchronous set() caller", async () => {
    const onFlushError = vi.fn();
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, _init?: RequestInit) => httpError(500));
    const a = new ServerAdapter("u1", { fetchImpl, debounceMs: 500, onFlushError });
    expect(() => a.set("household", { v: 1 })).not.toThrow();
    // debounce (500) + 2 backoff retries (300 + 900) before the failure surfaces.
    await vi.advanceTimersByTimeAsync(1800);
    expect(onFlushError).toHaveBeenCalledWith("household", expect.anything());
  });

  it("retries a failed flush with backoff and succeeds — no silent loss (gh #37)", async () => {
    let puts = 0;
    const onFlushError = vi.fn();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if ((init as RequestInit)?.method === "PUT") {
        puts++;
        return puts < 3 ? httpError(500) : okJson(null); // fail twice, then succeed
      }
      return okJson(null);
    });
    const a = new ServerAdapter("u1", { fetchImpl, debounceMs: 500, onFlushError });
    a.set("household", { v: 1 });
    await vi.advanceTimersByTimeAsync(1800); // debounce + 2 backoffs
    expect(puts).toBe(3); // original + 2 retries, succeeding on the 3rd
    expect(onFlushError).not.toHaveBeenCalled(); // recovered → never surfaced as a failure
  });

  it("re-queues after retries exhaust so the write is not silently dropped (gh #37)", async () => {
    const onFlushError = vi.fn();
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, _init?: RequestInit) => httpError(500));
    // Small, jitter-free backoff for deterministic timing.
    const a = new ServerAdapter("u1", {
      fetchImpl,
      debounceMs: 500,
      requeueBaseMs: 500,
      rng: () => 0.5, // 0.5*2-1 = 0 → no jitter
      onFlushError,
    });
    a.set("household", { v: 1 });
    await vi.advanceTimersByTimeAsync(1800); // first cycle: 3 attempts all fail
    const puts1 = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").length;
    expect(puts1).toBe(3);
    expect(onFlushError).toHaveBeenCalledTimes(1);
    // The key was RE-QUEUED (not dropped): after the backoff the PUT is re-attempted.
    await vi.advanceTimersByTimeAsync(1800);
    const puts2 = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").length;
    expect(puts2).toBeGreaterThan(puts1); // still pending → re-persisted on recovery, no silent loss
  });

  it("gh #37 follow-up: re-queue uses CAPPED exponential backoff, not a fixed-cadence hammer", async () => {
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, init?: RequestInit) =>
      (init as RequestInit)?.method === "PUT" ? httpError(500) : okJson(null),
    );
    const a = new ServerAdapter("u1", {
      fetchImpl,
      debounceMs: 100,
      requeueBaseMs: 4000,
      requeueMaxMs: 16_000,
      rng: () => 0.5, // no jitter
    });
    const puts = () => fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").length;

    a.set("household", { v: 1 });
    // Burst 1: debounce(100) + inline retries(300 + 900) → 3 PUTs by ~1300ms.
    await vi.advanceTimersByTimeAsync(1300);
    expect(puts()).toBe(3);
    // First re-queue delay is 4000ms. The OLD fixed re-queue would have re-fired by ~1.5s —
    // advancing 2000ms (well past 1.5s, short of the 4000 backoff) must NOT produce a new burst.
    await vi.advanceTimersByTimeAsync(2000);
    expect(puts()).toBe(3); // backoff is holding — no hammer
    // Cross the backoff window → burst 2 fires (another 3 attempts).
    await vi.advanceTimersByTimeAsync(4000);
    expect(puts()).toBe(6);
  });

  it("gh #37 follow-up: a fresh set() during backoff resets to the prompt debounce window", async () => {
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, init?: RequestInit) =>
      (init as RequestInit)?.method === "PUT" ? httpError(500) : okJson(null),
    );
    const a = new ServerAdapter("u1", {
      fetchImpl,
      debounceMs: 100,
      requeueBaseMs: 10_000, // long backoff so a reset is unambiguous
      rng: () => 0.5,
    });
    const puts = () => fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").length;

    a.set("household", { v: 1 });
    await vi.advanceTimersByTimeAsync(1300); // burst 1 → 3 PUTs, then a 10s backoff is armed
    expect(puts()).toBe(3);
    await vi.advanceTimersByTimeAsync(2000); // mid-backoff (3300 << 10000)
    expect(puts()).toBe(3);

    // A fresh user edit must reset the backoff to the prompt debounce window, not wait 10s.
    a.set("household", { v: 2 });
    await vi.advanceTimersByTimeAsync(1300); // debounce(100) + inline retries → burst 2
    expect(puts()).toBe(6);
    // And the re-attempt carries the LATEST value.
    const lastPut = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").at(-1)!;
    expect(JSON.parse((lastPut[1] as RequestInit).body as string)).toEqual({ v: 2 });
  });

  it("gh #37 follow-up: backoff GROWS exponentially across re-queues then CAPS at requeueMaxMs", async () => {
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, init?: RequestInit) =>
      (init as RequestInit)?.method === "PUT" ? httpError(500) : okJson(null),
    );
    // base 1000 → delays 1000, 2000, 4000(cap), 4000(cap) … ; each burst = 3 inline PUTs over ~1200ms.
    const a = new ServerAdapter("u1", {
      fetchImpl,
      debounceMs: 100,
      requeueBaseMs: 1000,
      requeueMaxMs: 4000,
      rng: () => 0.5, // no jitter — deterministic
    });
    const puts = () => fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").length;

    a.set("household", { v: 1 });
    await vi.advanceTimersByTimeAsync(1300); // burst1 ends (PUTs 100/400/1300); requeue n=1 → +1000 → t≈2300
    expect(puts()).toBe(3);
    await vi.advanceTimersByTimeAsync(900); // t≈2200 < 2300
    expect(puts()).toBe(3); // gap1 = 1000

    await vi.advanceTimersByTimeAsync(1300); // burst2 ends t≈3500; requeue n=2 → +2000 → t≈5500
    expect(puts()).toBe(6);
    await vi.advanceTimersByTimeAsync(1900); // t≈5400 < 5500
    expect(puts()).toBe(6); // gap2 = 2000 (grew)

    await vi.advanceTimersByTimeAsync(1300); // burst3 ends t≈6700; requeue n=3 → min(4000,4000) → t≈10700
    expect(puts()).toBe(9);
    await vi.advanceTimersByTimeAsync(3900); // t≈10600 < 10700
    expect(puts()).toBe(9); // gap3 = 4000 (capped)

    await vi.advanceTimersByTimeAsync(1300); // burst4 ends t≈11900; requeue n=4 → STILL 4000 (cap), not 8000 → t≈15900
    expect(puts()).toBe(12);
    await vi.advanceTimersByTimeAsync(3900); // t≈15800 < 15900 (if cap were absent, delay would be 8000 → no burst either)
    expect(puts()).toBe(12);
    await vi.advanceTimersByTimeAsync(1300); // t≈17100 ≥ 15900 → burst5 fires ⇒ delay was 4000 (capped), NOT 8000
    expect(puts()).toBe(15);
  });

  it("gh #37 follow-up: a SUCCESSFUL flush resets the backoff counter (direct-flush path, not just set())", async () => {
    let mode: "ok" | "fail" = "fail";
    const fetchImpl = vi.fn(async (_url?: string | URL | Request, init?: RequestInit) => {
      if ((init as RequestInit)?.method !== "PUT") return okJson(null);
      return mode === "ok" ? okJson(null) : httpError(500);
    });
    const a = new ServerAdapter("u1", {
      fetchImpl,
      debounceMs: 100,
      requeueBaseMs: 2000,
      requeueMaxMs: 16_000,
      rng: () => 0.5,
    });
    const puts = () => fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").length;

    a.set("household", { v: 1 });
    await vi.advanceTimersByTimeAsync(1300); // burst1 fail (PUTs 100/400/1300) → requeue n=1 (+2000 → t≈3300)
    await vi.advanceTimersByTimeAsync(3300); // burst2 at ~3300 fail → requeue n=2 (+4000 → t≈8500)
    // Recover: the n=2 re-queued burst succeeds → backoff counter MUST reset to 0.
    mode = "ok";
    await vi.advanceTimersByTimeAsync(5200); // burst3 at ~8500 succeeds (single PUT, no inline retries) → no timer armed
    const afterRecover = puts();

    // Now fail again via the DIRECT flush path (no preceding set(), so set()-reset can't help).
    mode = "fail";
    void a.flush("household"); // direct flush at t≈8500: PUTs at +0/+300/+1200 → done ~9700
    await vi.advanceTimersByTimeAsync(1300); // 3 inline attempts → exhaust → scheduleRequeue (delay = base IFF counter reset)
    const afterDirectBurst = puts();
    expect(afterDirectBurst).toBe(afterRecover + 3);
    // Reset → n=1 → delay 2000. If success had NOT reset, n=3 → delay min(2000·4,16000)=8000.
    await vi.advanceTimersByTimeAsync(1500); // <2000 from the burst's exhaust → no re-fire either way
    expect(puts()).toBe(afterDirectBurst);
    await vi.advanceTimersByTimeAsync(1500); // crosses the 2000 base backoff (but NOT 8000) → re-fires ⇒ counter was reset
    expect(puts()).toBeGreaterThan(afterDirectBurst);
  });
});

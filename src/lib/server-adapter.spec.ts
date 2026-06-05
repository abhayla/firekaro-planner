import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { ServerAdapter } from "./server-adapter";

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

  it("hydrateAll fills the cache from 6 concurrent GETs", async () => {
    const byKey: Record<string, unknown> = {
      household: { name: "Sharma" },
      assumptions: { inflation: 0.06 },
      scenarios: [{ id: "s1" }],
      features: { flags: {}, wizardCompleted: true },
      ui: { currentFY: "2026-27" },
      "expense-history": [{ period: "2026-05" }],
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const key = String(url).split("/api/planner/")[1];
      return okJson(byKey[key] ?? null);
    });
    const a = new ServerAdapter("u1", { fetchImpl, baseUrl: "http://localhost:3100" });

    await a.hydrateAll();

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(a.get("household")).toEqual({ name: "Sharma" });
    expect(a.get("ui")).toEqual({ currentFY: "2026-27" });
    expect(a.get("expense-history")).toEqual([{ period: "2026-05" }]);
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
    const a = new ServerAdapter("u1", { fetchImpl, debounceMs: 500, onFlushError });
    a.set("household", { v: 1 });
    await vi.advanceTimersByTimeAsync(1800); // first cycle: 3 attempts all fail
    const puts1 = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").length;
    expect(puts1).toBe(3);
    expect(onFlushError).toHaveBeenCalledTimes(1);
    // The key was RE-QUEUED (not dropped): a later window re-attempts the PUT.
    await vi.advanceTimersByTimeAsync(1800);
    const puts2 = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit).method === "PUT").length;
    expect(puts2).toBeGreaterThan(puts1); // still pending → re-persisted on recovery, no silent loss
  });
});

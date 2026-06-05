/**
 * ServerAdapter — the v6 write-behind cache behind the StorageAdapter seam.
 *
 * The interface stays SYNCHRONOUS (get/set/remove/clearForCurrentUser) so the 6
 * Pinia stores + expense-history.ts + the router guards are UNCHANGED. The trick:
 *   - get(key)  reads an in-memory cache synchronously (warm-filled at boot by
 *               hydrateAll() BEFORE the app mounts — see main.ts).
 *   - set(key)  writes the cache synchronously, THEN schedules a per-key 1.5s
 *               debounce flush (PUT /api/planner/{key}). A keystroke storm
 *               coalesces to ONE PUT after the last edit.
 *   - the ONE async seam is hydrateAll() (6 concurrent GETs), awaited at boot.
 *
 * Only the 6 server-backed entityKeys go over the wire. Client-only prefs
 * (active-seed, tour-dismissed, …) fall through to a userId-scoped
 * LocalStorageAdapter so they still persist locally.
 *
 * sendBeacon flush-on-unload is DEFERRED to Phase 2 (DEFERRED-v6.md) — Phase 1
 * accepts the <1.5s tab-close loss window (rare; honest call-out).
 */

import { type StorageAdapter, LocalStorageAdapter } from "@/lib/storage-adapter";

/** The 6 entityKeys persisted to the backend (mirror the 6 /api/planner paths). */
export const SERVER_KEYS: ReadonlySet<string> = new Set([
  "household",
  "assumptions",
  "scenarios",
  "features",
  "ui",
  "expense-history",
]);

const DEFAULT_DEBOUNCE_MS = 1500;

export interface ServerAdapterOptions {
  /** Backend origin, e.g. "http://localhost:3100". "" = same-origin. */
  baseUrl?: string;
  /** Injectable fetch (tests). Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-key debounce window (ms). Default 1500. */
  debounceMs?: number;
  /** Send the x-dev-bypass header (dev only). */
  devBypass?: boolean;
  /** Called when a debounced flush fails (after logging). */
  onFlushError?: (key: string, err: unknown) => void;
}

export class ServerAdapter implements StorageAdapter {
  private readonly cache = new Map<string, unknown>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly localFallback: LocalStorageAdapter;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly debounceMs: number;
  private readonly devBypass: boolean;
  private readonly onFlushError?: (key: string, err: unknown) => void;

  constructor(userId: string, opts: ServerAdapterOptions = {}) {
    this.localFallback = new LocalStorageAdapter(userId);
    this.baseUrl = opts.baseUrl ?? "";
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.devBypass = opts.devBypass ?? false;
    this.onFlushError = opts.onFlushError;
  }

  // ---------- StorageAdapter (synchronous) ----------

  get<T>(key: string): T | null {
    if (!SERVER_KEYS.has(key)) return this.localFallback.get<T>(key);
    return this.cache.has(key) ? (this.cache.get(key) as T) : null;
  }

  set<T>(key: string, value: T): void {
    if (!SERVER_KEYS.has(key)) {
      this.localFallback.set(key, value);
      return;
    }
    this.cache.set(key, value);
    this.scheduleFlush(key);
  }

  remove(key: string): void {
    if (!SERVER_KEYS.has(key)) {
      this.localFallback.remove(key);
      return;
    }
    // No per-key server DELETE endpoint (the API exposes DELETE /all only, mapped
    // to clearForCurrentUser). remove() is not invoked on server keys in
    // production (only in tests) — drop the cache entry + cancel any pending flush.
    this.cache.delete(key);
    this.cancelTimer(key);
  }

  clearForCurrentUser(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.cache.clear();
    this.localFallback.clearForCurrentUser();
    void this.safeRequest("DELETE", "/api/planner/all");
  }

  // ---------- Async boot seam ----------

  /**
   * Warm the cache with the 6 server keys via concurrent GETs. Awaited in
   * main.ts BEFORE mount so every subsequent store get() is a sync cache read.
   * Rejects if any GET fails — main.ts catches and falls back to localStorage.
   */
  async hydrateAll(): Promise<void> {
    const keys = [...SERVER_KEYS];
    const values = await Promise.all(keys.map((k) => this.fetchKey(k)));
    keys.forEach((k, i) => {
      if (values[i] !== null && values[i] !== undefined) this.cache.set(k, values[i]);
    });
  }

  /** Flush every pending key immediately (Phase 2 sendBeacon-on-unload hook). */
  async flushAllPending(): Promise<void> {
    const keys = [...this.timers.keys()];
    for (const key of keys) this.cancelTimer(key);
    await Promise.all(keys.map((k) => this.flush(k)));
  }

  // ---------- internals ----------

  private async fetchKey(key: string): Promise<unknown> {
    const res = await this.request("GET", `/api/planner/${key}`);
    if (!res.ok) throw new Error(`hydrate ${key} failed: HTTP ${res.status}`);
    const body = (await res.json()) as { success?: boolean; data?: unknown };
    return body?.data ?? null;
  }

  private scheduleFlush(key: string): void {
    this.cancelTimer(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.flush(key);
      }, this.debounceMs),
    );
  }

  private cancelTimer(key: string): void {
    const t = this.timers.get(key);
    if (t) {
      clearTimeout(t);
      this.timers.delete(key);
    }
  }

  /**
   * Flush one key's cached value to the backend. Public for tests.
   *
   * On failure: retry with backoff, then RE-QUEUE (re-schedule) the key so the
   * value is NOT silently lost — the cache still holds the latest value and a
   * later backend recovery re-persists it (gh #37: a dropped flush previously
   * left the UI showing rows the server never saved → silent data loss on
   * reload). Never throws into the synchronous store mutation that triggered it.
   */
  async flush(key: string, attempt = 0): Promise<void> {
    if (!this.cache.has(key)) return;
    try {
      const res = await this.request("PUT", `/api/planner/${key}`, this.cache.get(key));
      if (!res.ok) throw new Error(`PUT ${key} -> HTTP ${res.status}`);
    } catch (err) {
      const MAX_RETRIES = 2;
      if (attempt < MAX_RETRIES) {
        await this.sleep(300 * 3 ** attempt); // 300ms, 900ms backoff
        return this.flush(key, attempt + 1);
      }
      // Retries exhausted. The cache still holds the value — DO NOT drop it.
      // Re-arm a debounced flush so a later recovery re-persists it (no silent loss).
      this.onFlushError?.(key, err);
      // eslint-disable-next-line no-console
      console.warn(`[ServerAdapter] flush of "${key}" failed after ${MAX_RETRIES + 1} attempts — re-queued`, err);
      this.scheduleFlush(key);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.devBypass) headers["x-dev-bypass"] = "true";
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private async safeRequest(method: string, path: string): Promise<void> {
    try {
      await this.request(method, path);
    } catch (err) {
      this.onFlushError?.(path, err);
      // eslint-disable-next-line no-console
      console.warn(`[ServerAdapter] ${method} ${path} failed`, err);
    }
  }
}

/**
 * Storage adapter — the multi-tenant abstraction over persistence.
 *
 * Phase 0 Stage A5 per docs/goals/build-firekaro-mvp-v5.md §3 (ADR-0001).
 *
 * v5 runtime ships the LocalStorageAdapter which writes to the browser's
 * localStorage namespaced by userId. v6 commercial SaaS swaps to a remote
 * adapter (HttpAdapter or similar) that calls a backend keyed by the same
 * userId — no consumer code changes when the swap happens.
 *
 * Why this seam matters: Concern #4 from /improve-codebase-architecture
 * named the assumption-store override layer; ADR-0001 escalated the
 * concern to apply to EVERY persisted entity. Without an adapter, the
 * v5->v6 migration is a global rewrite. With this adapter, v6 is "swap
 * the import in stores/*.ts + plug in real AuthProvider".
 *
 * Invariants (enforced by ESLint-style grep in CI / Stage A5 DoD):
 *   - Zero direct localStorage.* calls in mvp/src outside this file.
 *   - Every persisted entity is owned by a userId (per ADR-0001).
 *
 * Storage key format: `firekaro-mvp:${userId}:${entityKey}`
 *   - The constant prefix `firekaro-mvp:` prevents collision with the
 *     v4 demo (`firekaro-demo:`) and the production app.
 *   - The userId segment is the multi-tenant key.
 *   - The entityKey is the domain-specific suffix (household, ui,
 *     assumptions, features, scenarios, active-seed, tour-dismissed).
 */

// ---------- Adapter interface ----------

export interface StorageAdapter {
  /** Read a value; returns null when absent or unparseable. */
  get<T>(key: string): T | null;

  /** Write a value. Throws on quota / unavailable storage. */
  set<T>(key: string, value: T): void;

  /** Delete a value. No-op when absent. */
  remove(key: string): void;

  /**
   * Delete every key owned by this adapter's userId. Used by the
   * household.resetAll() flow. Does NOT touch other users' data.
   */
  clearForCurrentUser(): void;
}

// ---------- LocalStorage implementation ----------

const PREFIX = "firekaro-mvp";

/**
 * Builds the namespaced key for a (userId, entityKey) pair.
 * Exported for tests + the legacy clear-by-string path in household.resetAll
 * (the legacy code did `removeItem('firekaro-mvp:ui')` which still works
 * for the default 'self' userId — see makeKey('self', 'ui') below).
 */
export function makeKey(userId: string, entityKey: string): string {
  if (!userId || userId.includes(":")) {
    throw new Error(
      `Invalid userId for storage key: ${JSON.stringify(userId)}. ` +
        `userId must be non-empty and must not contain ':' (the prefix separator).`,
    );
  }
  return `${PREFIX}:${userId}:${entityKey}`;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly userId: string) {}

  get<T>(entityKey: string): T | null {
    try {
      const raw = localStorage.getItem(makeKey(this.userId, entityKey));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  set<T>(entityKey: string, value: T): void {
    try {
      localStorage.setItem(
        makeKey(this.userId, entityKey),
        JSON.stringify(value),
      );
    } catch {
      // quota / unavailable — propagate as silent no-op to preserve the v4
      // "best-effort persistence" behavior. Consumers that need write
      // confirmation should layer that on top.
    }
  }

  remove(entityKey: string): void {
    try {
      localStorage.removeItem(makeKey(this.userId, entityKey));
    } catch {
      // ignore
    }
  }

  clearForCurrentUser(): void {
    try {
      const prefix = `${PREFIX}:${this.userId}:`;
      // Collect first, delete second — modifying localStorage during
      // iteration is undefined behavior.
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keysToDelete.push(k);
      }
      for (const k of keysToDelete) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}

// ---------- Adapter resolution ----------

import type { AuthProvider } from "@/lib/auth-provider";

/**
 * Active-adapter singleton (mirrors setAuthProvider/getAuthProvider in
 * auth-provider.ts). v6 boot installs a ServerAdapter here via setAdapter()
 * BEFORE the app mounts; makeAdapter() then returns it so the 6 Pinia stores +
 * expense-history.ts transparently persist to the backend WITHOUT any change to
 * their code (they call makeAdapter(getAuthProvider()) at setup). When no
 * adapter is set — v5 runtime, the GitHub Pages demo, and the ~480 unit tests —
 * makeAdapter() falls back to the localStorage path exactly as before.
 */
let activeAdapter: StorageAdapter | null = null;

/** v6 boot: install the active adapter (e.g. ServerAdapter). null = v5 local path. */
export function setAdapter(adapter: StorageAdapter | null): void {
  activeAdapter = adapter;
}

/** The installed active adapter, or null when on the v5 localStorage path. */
export function getAdapter(): StorageAdapter | null {
  return activeAdapter;
}

/**
 * Build the adapter for the currently-authenticated user. When a v6 adapter has
 * been installed via setAdapter() it wins (interface unchanged — still sync
 * get/set/remove/clearForCurrentUser); otherwise returns a userId-scoped
 * LocalStorageAdapter (the v5 path the ~480 tests depend on).
 */
export function makeAdapter(auth: AuthProvider): StorageAdapter {
  return activeAdapter ?? new LocalStorageAdapter(auth.getCurrentUserId());
}

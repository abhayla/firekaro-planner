import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { claimGuestPlan, shouldClaim, CLAIMABLE_KEYS } from "./guest-plan-claim";
import { LocalStorageAdapter, makeKey, type StorageAdapter } from "./storage-adapter";
import { ANON_USER_ID } from "./auth-provider";

// vitest.config.ts environment is 'node' — localStorage isn't available by default.
// In-memory polyfill (Web Storage spec subset) for this spec only. Same shape as
// browser localStorage; the adapter under test treats it as opaque.
beforeAll(() => {
  if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      get length() {
        return store.size;
      },
      key(i: number) {
        return Array.from(store.keys())[i] ?? null;
      },
      getItem(k: string) {
        return store.has(k) ? store.get(k)! : null;
      },
      setItem(k: string, v: string) {
        store.set(k, v);
      },
      removeItem(k: string) {
        store.delete(k);
      },
      clear() {
        store.clear();
      },
    };
  }
});

/**
 * #187 — the sign-up handoff must carry a guest's answers UP into a brand-new account, and must
 * refuse to touch an account that already has a plan.
 */
describe("guest plan claim (#187 sign-up handoff)", () => {
  beforeEach(() => localStorage.clear());

  const guestPlan = { members: [{ id: "you", name: "You" }], investments: [{ id: "quick-1" }] };

  function seedGuest() {
    const guest = new LocalStorageAdapter(ANON_USER_ID);
    guest.set("household", guestPlan);
    guest.set("ui", { quick: { guess: 50_000_000 } });
    guest.set("assumptions", { equityReturn: 0.11 });
    guest.set("features", { wizardCompleted: true });
  }

  it("shouldClaim only when the guest has members AND the account is empty", () => {
    expect(shouldClaim(guestPlan, { members: [] })).toBe(true);
    expect(shouldClaim(guestPlan, null)).toBe(true);
    // Never over an existing plan.
    expect(shouldClaim(guestPlan, { members: [{ id: "you" }] })).toBe(false);
    // Nothing to carry.
    expect(shouldClaim({ members: [] }, { members: [] })).toBe(false);
    expect(shouldClaim(null, null)).toBe(false);
  });

  it("copies every claimable key into a brand-new account", async () => {
    seedGuest();
    const authed = new LocalStorageAdapter("user_new");
    expect(await claimGuestPlan(authed)).toBe(true);
    for (const key of CLAIMABLE_KEYS) {
      expect(authed.get(key), `key ${key}`).not.toBeNull();
    }
    expect(authed.get<typeof guestPlan>("household")!.members.length).toBe(1);
  });

  it("clears the guest namespace afterwards so a second sign-in cannot re-import it", async () => {
    seedGuest();
    const authed = new LocalStorageAdapter("user_new");
    await claimGuestPlan(authed);
    expect(localStorage.getItem(makeKey(ANON_USER_ID, "household"))).toBeNull();
    // A second account on the same browser gets nothing.
    const other = new LocalStorageAdapter("user_other");
    expect(await claimGuestPlan(other)).toBe(false);
    expect(other.get("household")).toBeNull();
  });

  it("REFUSES to overwrite an account that already has a plan", async () => {
    seedGuest();
    const authed = new LocalStorageAdapter("user_existing");
    const existing = { members: [{ id: "mine", name: "Mine" }] };
    authed.set("household", existing);
    expect(await claimGuestPlan(authed)).toBe(false);
    expect(authed.get<typeof existing>("household")!.members[0]!.id).toBe("mine");
    // The guest blob is left alone too — nothing was consumed.
    expect(localStorage.getItem(makeKey(ANON_USER_ID, "household"))).not.toBeNull();
  });

  it("is a no-op (never throws) when there is no guest plan at all", async () => {
    const authed = new LocalStorageAdapter("user_new");
    await expect(claimGuestPlan(authed)).resolves.not.toThrow();
    expect(await claimGuestPlan(authed)).toBe(false);
  });

  /**
   * MAJOR finding (independent review): `set()` on a write-behind adapter (ServerAdapter in
   * production) only queues a debounced flush — it does NOT mean the write reached the server. If
   * `claimGuestPlan` cleared the guest namespace right after calling `set()`, a tab close or a
   * failed flush inside that window would permanently lose the guest's answers: gone from the guest
   * namespace, never persisted server-side. This fake adapter's flush is a controllable promise (a
   * real `LocalStorageAdapter` is synchronous and cannot exercise this race at all) so the test can
   * assert the namespace survives until the flush is confirmed, and is cleared once it succeeds.
   */
  describe("write-behind adapter: does not clear the guest namespace before the flush is confirmed", () => {
    function makeFakeServerAdapter(): {
      adapter: StorageAdapter & { flushAllPending(): Promise<void> };
      resolveFlush: () => void;
      rejectFlush: (err: unknown) => void;
      failFlush: () => void;
    } {
      const store = new Map<string, unknown>();
      let flushResolve!: () => void;
      let flushReject!: (err: unknown) => void;
      const flushPromise = new Promise<void>((res, rej) => {
        flushResolve = res;
        flushReject = rej;
      });
      let flushFailed = false;
      const adapter = {
        get: <T,>(key: string) => (store.has(key) ? (store.get(key) as T) : null),
        set: <T,>(key: string, value: T) => {
          store.set(key, value);
        },
        remove: (key: string) => {
          store.delete(key);
        },
        clearForCurrentUser: () => {
          store.clear();
        },
        flushAllPending: () => flushPromise,
      };
      return {
        adapter,
        resolveFlush: () => flushResolve(),
        rejectFlush: (err: unknown) => flushReject(err),
        failFlush: () => {
          flushFailed = true;
        },
      };
    }

    it("keeps the guest namespace until flushAllPending resolves", async () => {
      seedGuest();
      const { adapter, resolveFlush } = makeFakeServerAdapter();

      const claim = claimGuestPlan(adapter);
      // Give pending microtasks a tick — the flush has NOT resolved yet.
      await Promise.resolve();
      await Promise.resolve();
      expect(
        localStorage.getItem(makeKey(ANON_USER_ID, "household")),
        "guest namespace must survive while the flush is still in flight",
      ).not.toBeNull();

      resolveFlush();
      expect(await claim).toBe(true);
      expect(localStorage.getItem(makeKey(ANON_USER_ID, "household"))).toBeNull();
    });

    it("does NOT clear the guest namespace when the flush is reported as failed", async () => {
      seedGuest();
      const { adapter, resolveFlush, failFlush } = makeFakeServerAdapter();
      failFlush();

      // flushAllPending() itself resolves (server-adapter.ts never rejects on a failed PUT — it
      // re-queues instead) — hasFlushFailed is the only real failure signal.
      resolveFlush();
      const claimed = await claimGuestPlan(adapter, { hasFlushFailed: () => true });

      expect(claimed, "a reported flush failure must not be reported as a successful claim").toBe(false);
      expect(
        localStorage.getItem(makeKey(ANON_USER_ID, "household")),
        "the guest's answers are the only copy until the server write is confirmed — must not be deleted on a failed flush",
      ).not.toBeNull();
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { claimGuestPlan, shouldClaim, CLAIMABLE_KEYS } from "./guest-plan-claim";
import { LocalStorageAdapter, makeKey } from "./storage-adapter";
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

  it("copies every claimable key into a brand-new account", () => {
    seedGuest();
    const authed = new LocalStorageAdapter("user_new");
    expect(claimGuestPlan(authed)).toBe(true);
    for (const key of CLAIMABLE_KEYS) {
      expect(authed.get(key), `key ${key}`).not.toBeNull();
    }
    expect(authed.get<typeof guestPlan>("household")!.members.length).toBe(1);
  });

  it("clears the guest namespace afterwards so a second sign-in cannot re-import it", () => {
    seedGuest();
    const authed = new LocalStorageAdapter("user_new");
    claimGuestPlan(authed);
    expect(localStorage.getItem(makeKey(ANON_USER_ID, "household"))).toBeNull();
    // A second account on the same browser gets nothing.
    const other = new LocalStorageAdapter("user_other");
    expect(claimGuestPlan(other)).toBe(false);
    expect(other.get("household")).toBeNull();
  });

  it("REFUSES to overwrite an account that already has a plan", () => {
    seedGuest();
    const authed = new LocalStorageAdapter("user_existing");
    const existing = { members: [{ id: "mine", name: "Mine" }] };
    authed.set("household", existing);
    expect(claimGuestPlan(authed)).toBe(false);
    expect(authed.get<typeof existing>("household")!.members[0]!.id).toBe("mine");
    // The guest blob is left alone too — nothing was consumed.
    expect(localStorage.getItem(makeKey(ANON_USER_ID, "household"))).not.toBeNull();
  });

  it("is a no-op (never throws) when there is no guest plan at all", () => {
    const authed = new LocalStorageAdapter("user_new");
    expect(() => claimGuestPlan(authed)).not.toThrow();
    expect(claimGuestPlan(authed)).toBe(false);
  });
});

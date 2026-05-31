import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { LocalStorageAdapter, makeKey, makeAdapter } from "./storage-adapter";
import { LocalAuthProvider, setAuthProvider, getAuthProvider } from "./auth-provider";

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

describe("makeKey", () => {
  it("namespaces by userId", () => {
    expect(makeKey("self", "household")).toBe("firekaro-mvp:self:household");
    expect(makeKey("user-42", "scenarios")).toBe("firekaro-mvp:user-42:scenarios");
  });

  it("rejects empty userId", () => {
    expect(() => makeKey("", "x")).toThrow();
  });

  it("rejects userId containing ':'", () => {
    expect(() => makeKey("user:x", "y")).toThrow();
  });
});

describe("LocalStorageAdapter — single user", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("get returns null for absent key", () => {
    const a = new LocalStorageAdapter("self");
    expect(a.get("household")).toBeNull();
  });

  it("set then get round-trips a JSON object", () => {
    const a = new LocalStorageAdapter("self");
    const value = { foo: 1, bar: ["a", "b"] };
    a.set("household", value);
    expect(a.get("household")).toEqual(value);
  });

  it("set then get round-trips a primitive", () => {
    const a = new LocalStorageAdapter("self");
    a.set("active-seed", "sharmas");
    expect(a.get<string>("active-seed")).toBe("sharmas");
  });

  it("remove deletes a key", () => {
    const a = new LocalStorageAdapter("self");
    a.set("household", { x: 1 });
    expect(a.get("household")).not.toBeNull();
    a.remove("household");
    expect(a.get("household")).toBeNull();
  });

  it("get returns null when localStorage holds invalid JSON", () => {
    localStorage.setItem(makeKey("self", "broken"), "{not-json");
    const a = new LocalStorageAdapter("self");
    expect(a.get("broken")).toBeNull();
  });
});

describe("LocalStorageAdapter — multi-tenant namespacing (ADR-0001 invariant)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("two users with same entityKey do not collide", () => {
    const alice = new LocalStorageAdapter("alice");
    const bob = new LocalStorageAdapter("bob");
    alice.set("household", { fireNumber: 1_000_000 });
    bob.set("household", { fireNumber: 2_000_000 });
    expect(alice.get("household")).toEqual({ fireNumber: 1_000_000 });
    expect(bob.get("household")).toEqual({ fireNumber: 2_000_000 });
  });

  it("clearForCurrentUser only removes one user's keys", () => {
    const alice = new LocalStorageAdapter("alice");
    const bob = new LocalStorageAdapter("bob");
    alice.set("household", { x: 1 });
    alice.set("ui", { y: 2 });
    bob.set("household", { z: 3 });

    alice.clearForCurrentUser();

    expect(alice.get("household")).toBeNull();
    expect(alice.get("ui")).toBeNull();
    // Bob's data survives the clear.
    expect(bob.get("household")).toEqual({ z: 3 });
  });

  it("clearForCurrentUser is safe when no keys exist", () => {
    const a = new LocalStorageAdapter("self");
    expect(() => a.clearForCurrentUser()).not.toThrow();
  });

  it("writes are visible under the exact namespaced key", () => {
    const a = new LocalStorageAdapter("self");
    a.set("household", { x: 1 });
    expect(localStorage.getItem("firekaro-mvp:self:household")).not.toBeNull();
    // Wrong namespace doesn't accidentally match.
    expect(localStorage.getItem("firekaro-demo:self:household")).toBeNull();
    expect(localStorage.getItem("firekaro-mvp:other:household")).toBeNull();
  });
});

describe("makeAdapter(auth)", () => {
  beforeEach(() => {
    localStorage.clear();
    setAuthProvider(new LocalAuthProvider());
  });

  it("produces an adapter scoped to auth.getCurrentUserId()", () => {
    const a = makeAdapter(getAuthProvider());
    a.set("household", { x: 1 });
    // In v5 runtime userId is 'self'.
    expect(localStorage.getItem("firekaro-mvp:self:household")).not.toBeNull();
  });

  it("test-only setAuthProvider rescopes the adapter", () => {
    class StubAuth {
      getCurrentUserId() {
        return "test-user";
      }
      isAuthenticated() {
        return true;
      }
    }
    setAuthProvider(new StubAuth());
    const a = makeAdapter(getAuthProvider());
    a.set("household", { x: 99 });
    expect(localStorage.getItem("firekaro-mvp:test-user:household")).not.toBeNull();
    expect(localStorage.getItem("firekaro-mvp:self:household")).toBeNull();
  });
});

describe("LocalAuthProvider (v5 runtime)", () => {
  it("getCurrentUserId returns 'self'", () => {
    const auth = new LocalAuthProvider();
    expect(auth.getCurrentUserId()).toBe("self");
  });

  it("isAuthenticated always true", () => {
    const auth = new LocalAuthProvider();
    expect(auth.isAuthenticated()).toBe(true);
  });
});

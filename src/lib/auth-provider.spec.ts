import { describe, it, expect } from "vitest";
import {
  LocalAuthProvider,
  ServerAuthProvider,
  UnauthenticatedAuthProvider,
  getAuthProvider,
  setAuthProvider,
} from "./auth-provider";

describe("auth-provider seam", () => {
  it("LocalAuthProvider — demo: 'self' + always authenticated", () => {
    const p = new LocalAuthProvider();
    expect(p.getCurrentUserId()).toBe("self");
    expect(p.isAuthenticated()).toBe(true);
  });

  it("ServerAuthProvider — holds the real userId + authenticated", () => {
    const p = new ServerAuthProvider("user_abc123");
    expect(p.getCurrentUserId()).toBe("user_abc123");
    expect(p.isAuthenticated()).toBe(true);
  });

  describe("UnauthenticatedAuthProvider (gh login — server mode, no session)", () => {
    it("is NOT authenticated", () => {
      expect(new UnauthenticatedAuthProvider().isAuthenticated()).toBe(false);
    });

    // Regression: getCurrentUserId() must NOT throw. The Pinia stores instantiate
    // eagerly at mount and call it BEFORE the router auth guard can redirect to
    // /login; throwing crashed App setup and aborted the redirect (the bug fixed
    // when shipping the login redirect). It returns an empty sentinel instead.
    it("returns an empty sentinel without throwing", () => {
      const p = new UnauthenticatedAuthProvider();
      expect(() => p.getCurrentUserId()).not.toThrow();
      expect(p.getCurrentUserId()).toBe("");
    });
  });

  it("setAuthProvider / getAuthProvider swap the active singleton", () => {
    const original = getAuthProvider();
    try {
      setAuthProvider(new UnauthenticatedAuthProvider());
      expect(getAuthProvider().isAuthenticated()).toBe(false);
      setAuthProvider(new ServerAuthProvider("u1"));
      expect(getAuthProvider().getCurrentUserId()).toBe("u1");
    } finally {
      setAuthProvider(original); // restore for test isolation
    }
  });
});

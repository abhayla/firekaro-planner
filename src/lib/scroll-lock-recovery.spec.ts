import { describe, it, expect } from "vitest";
import { shouldReleaseScrollLock } from "./scroll-lock-recovery";

describe("shouldReleaseScrollLock", () => {
  it("releases when locked but no overlay is open (the stuck-lock bug)", () => {
    // <html> still carries v-overlay-scroll-blocked, but every overlay has
    // unmounted (e.g. on an SPA route change) — this is the freeze to heal.
    expect(shouldReleaseScrollLock(true, false)).toBe(true);
  });

  it("does NOT release when a lock corresponds to an open overlay", () => {
    // A dialog is legitimately open — leave Vuetify's lock alone.
    expect(shouldReleaseScrollLock(true, true)).toBe(false);
  });

  it("no-op when not locked even if an overlay is open", () => {
    expect(shouldReleaseScrollLock(false, true)).toBe(false);
  });

  it("no-op when nothing is locked and nothing is open", () => {
    expect(shouldReleaseScrollLock(false, false)).toBe(false);
  });
});

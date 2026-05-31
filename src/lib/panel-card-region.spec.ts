import { describe, it, expect } from "vitest";
import { resolvePanelRegion } from "./panel-card-region";

describe("resolvePanelRegion", () => {
  it("renders the body when no state flags are set", () => {
    expect(resolvePanelRegion({})).toBe("body");
    expect(resolvePanelRegion({ loading: false, error: false, empty: false })).toBe("body");
  });

  it("renders loading when loading is true", () => {
    expect(resolvePanelRegion({ loading: true })).toBe("loading");
  });

  it("renders error for a truthy boolean or a non-empty message string", () => {
    expect(resolvePanelRegion({ error: true })).toBe("error");
    expect(resolvePanelRegion({ error: "Network failed" })).toBe("error");
  });

  it("treats an empty error string as no error (falls through to body)", () => {
    expect(resolvePanelRegion({ error: "" })).toBe("body");
  });

  it("renders empty when empty is true and no higher-priority flag is set", () => {
    expect(resolvePanelRegion({ empty: true })).toBe("empty");
  });

  it("applies strict precedence loading > error > empty > body", () => {
    // loading beats everything
    expect(resolvePanelRegion({ loading: true, error: true, empty: true })).toBe("loading");
    // error beats empty
    expect(resolvePanelRegion({ error: true, empty: true })).toBe("error");
    expect(resolvePanelRegion({ error: "boom", empty: true })).toBe("error");
    // empty only when alone
    expect(resolvePanelRegion({ empty: true, error: false, loading: false })).toBe("empty");
  });
});

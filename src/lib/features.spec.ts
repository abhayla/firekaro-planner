import { describe, it, expect } from "vitest";
import {
  useFeatures,
  createFeatureState,
  featureRegistry,
  getFeature,
  featuresGuardingRoute,
} from "./features";

describe("featureRegistry", () => {
  it("ships ≥30 features per Stage A4 DoD", () => {
    expect(featureRegistry.length).toBeGreaterThanOrEqual(30);
  });

  it("every feature has a stable key + label + section", () => {
    for (const f of featureRegistry) {
      expect(f.key).toMatch(/^[a-z][a-zA-Z0-9.]+$/);
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.questionnaireSection).toBeGreaterThanOrEqual(1);
      expect(f.questionnaireSection).toBeLessThanOrEqual(6);
    }
  });

  it("keys are unique", () => {
    const keys = featureRegistry.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("contains the new v5 types per audit", () => {
    expect(getFeature("investments.international")).toBeDefined();
    expect(getFeature("investments.reit")).toBeDefined();
    expect(getFeature("family.parentsBucket")).toBeDefined();
    expect(getFeature("fire.coast")).toBeDefined();
    expect(getFeature("fire.barista")).toBeDefined();
    expect(getFeature("estate.planning")).toBeDefined();
  });
});

describe("featuresGuardingRoute", () => {
  it("returns features that gate a given route name", () => {
    const features = featuresGuardingRoute("estate-planning");
    expect(features.length).toBe(1);
    expect(features[0].key).toBe("estate.planning");
  });

  it("returns empty for routes nobody gates", () => {
    expect(featuresGuardingRoute("fire-dashboard")).toEqual([]);
    expect(featuresGuardingRoute("nonsense-route")).toEqual([]);
  });
});

describe("useFeatures — isEnabled", () => {
  it("returns the feature's defaultEnabled when no explicit toggle", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    // Stocks default-enabled (mainstream)
    expect(api.isEnabled("investments.stocks")).toBe(true);
    // Crypto default-disabled (opt-in)
    expect(api.isEnabled("investments.crypto")).toBe(false);
  });

  it("explicit toggle overrides default", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    api.enable("investments.crypto");
    expect(api.isEnabled("investments.crypto")).toBe(true);
    api.disable("investments.crypto");
    expect(api.isEnabled("investments.crypto")).toBe(false);
  });

  it("returns false for unknown keys (safety default)", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    expect(api.isEnabled("nonsense.thing")).toBe(false);
  });
});

describe("useFeatures — enable / disable / setEnabled", () => {
  it("setEnabled mutates state.value reactively", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    api.setEnabled("estate.planning", false);
    expect(state.value.flags["estate.planning"]).toBe(false);
    api.setEnabled("estate.planning", true);
    expect(state.value.flags["estate.planning"]).toBe(true);
  });

  it("does not affect unrelated features", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    api.enable("investments.crypto");
    expect(state.value.flags["investments.stocks"]).toBeUndefined();
    expect(api.isEnabled("investments.stocks")).toBe(true); // still default
  });
});

describe("useFeatures — enableAll (Skip path)", () => {
  it("turns every feature on in one call", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    api.enableAll();
    for (const f of featureRegistry) {
      expect(api.isEnabled(f.key)).toBe(true);
    }
  });

  it("overrides previous opt-outs", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    api.disable("estate.planning");
    api.enableAll();
    expect(api.isEnabled("estate.planning")).toBe(true);
  });
});

describe("useFeatures — resetToDefaults", () => {
  it("clears explicit overrides; features fall back to defaultEnabled", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    api.disable("investments.stocks");
    expect(api.isEnabled("investments.stocks")).toBe(false);
    api.resetToDefaults();
    expect(api.isEnabled("investments.stocks")).toBe(true); // default
  });
});

describe("useFeatures — disabledFeatureKeysForRoute (Discovery footer)", () => {
  it("returns keys disabled on the specified route", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    api.disable("estate.planning");
    expect(api.disabledFeatureKeysForRoute("estate-planning"))
      .toEqual(["estate.planning"]);
  });

  it("returns empty when route's features are enabled", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    // estate.planning defaults enabled — should not appear
    expect(api.disabledFeatureKeysForRoute("estate-planning")).toEqual([]);
  });

  it("returns empty for routes with no gating features", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    expect(api.disabledFeatureKeysForRoute("fire-dashboard")).toEqual([]);
  });
});

describe("useFeatures — flags computed", () => {
  it("renders the complete map (defaults + overrides) on every read", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    api.disable("estate.planning");
    api.enable("investments.crypto");
    const f = api.flags.value;
    expect(f["estate.planning"]).toBe(false);
    expect(f["investments.crypto"]).toBe(true);
    expect(f["investments.stocks"]).toBe(true); // default
    expect(f["family.marriageEvent"]).toBe(false); // default-disabled
  });

  it("flag map has exactly one entry per registry feature", () => {
    const state = createFeatureState();
    const api = useFeatures(state);
    expect(Object.keys(api.flags.value).length).toBe(featureRegistry.length);
  });
});

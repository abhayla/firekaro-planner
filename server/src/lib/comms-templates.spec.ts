import { describe, it, expect } from "vitest";
import { templateFor, NUDGE_KEYS } from "./comms-templates";

/**
 * Nudge→template mapping. Pins: every key resolves, category drives the consent
 * type, and the exact approved name is overridable via COMMS_TEMPLATE_<KEY> env
 * (so date-suffixed approved names wire in without a code change).
 */

describe("comms-templates", () => {
  it("resolves every nudge key with a name + category + paramCount", () => {
    for (const key of NUDGE_KEYS) {
      const t = templateFor(key, {} as NodeJS.ProcessEnv);
      expect(t.templateName.length).toBeGreaterThan(0);
      expect(["utility", "marketing"]).toContain(t.category);
      expect(t.paramCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("defaults welcome to the already-approved template", () => {
    expect(templateFor("welcome", {} as NodeJS.ProcessEnv).templateName).toBe(
      "firekaro_welcome_2026_06_03",
    );
  });

  it("categorizes the marketing nudges as marketing, alerts as utility", () => {
    expect(templateFor("monthly_digest", {} as NodeJS.ProcessEnv).category).toBe("marketing");
    expect(templateFor("winback", {} as NodeJS.ProcessEnv).category).toBe("marketing");
    expect(templateFor("milestone", {} as NodeJS.ProcessEnv).category).toBe("utility");
    expect(templateFor("offtrack", {} as NodeJS.ProcessEnv).category).toBe("utility");
  });

  it("applies a COMMS_TEMPLATE_<KEY> env override (exact approved name)", () => {
    const env = { COMMS_TEMPLATE_MILESTONE: "firekaro_milestone_2026_06_10" } as NodeJS.ProcessEnv;
    const t = templateFor("milestone", env);
    expect(t.templateName).toBe("firekaro_milestone_2026_06_10");
    expect(t.category).toBe("utility"); // category stays code-fixed
  });

  it("trims whitespace-only overrides back to the default", () => {
    const env = { COMMS_TEMPLATE_WINBACK: "   " } as NodeJS.ProcessEnv;
    expect(templateFor("winback", env).templateName).toBe("firekaro_winback");
  });
});

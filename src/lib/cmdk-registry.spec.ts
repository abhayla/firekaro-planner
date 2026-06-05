import { describe, it, expect, afterEach, vi } from "vitest";
import { buildCommands } from "./cmdk-registry";

// gh #36 regression: the command palette's "Switch to <Seed>" actions call
// loadSeed(), which overwrites the household. They must NOT exist in server/
// authenticated mode (a logged-in user pressing Cmd-K could destroy their
// real account). The first #36 fix gated the AppBar dropdown + Splash CTA but
// missed this 4th door — caught by the rule-29 independent reviewer.
describe("cmdk-registry — demo seed commands gated by server mode (gh #36)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("includes 'Switch to <Seed>' commands in demo (localStorage) mode", () => {
    vi.stubEnv("VITE_USE_SERVER_ADAPTER", "");
    const seedCmds = buildCommands().filter((c) => c.id.startsWith("act-seed-"));
    expect(seedCmds.length).toBeGreaterThan(0);
  });

  it("EXCLUDES every 'Switch to <Seed>' command in server/authenticated mode", () => {
    vi.stubEnv("VITE_USE_SERVER_ADAPTER", "on");
    const seedCmds = buildCommands().filter((c) => c.id.startsWith("act-seed-"));
    expect(seedCmds).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * T-378 (QN-1) — the router contract for `/quick`.
 *
 * Source-scan, not a mounted router: this repo's unit env is `node` with no DOM (creating the real
 * router calls `createWebHistory`, which needs `window`), and the contract bans new dependencies.
 * Same pattern as the FireHero / AccelerationCard binding specs.
 *
 * Two things must hold or the express path is unreachable for exactly the user it exists for:
 *   1. NO `meta.layout` — App.vue only special-cases `sidebar`, so `/quick` must NOT go through
 *      `realRoute()` (which stamps `meta: { layout: "sidebar" }` on every route it builds).
 *   2. The onboarding guard bounces layout-less-free sidebar routes to the wizard when the
 *      household is empty. `/quick` is the alternative TO the wizard, so it must stay outside
 *      that branch — which it does precisely BECAUSE it carries no sidebar layout.
 */
const routerSrc = readFileSync(resolve(__dirname, "index.ts"), "utf8");
const splashSrc = readFileSync(resolve(__dirname, "../pages/Splash.vue"), "utf8");

describe("/quick route", () => {
  it("is registered as a plain public route", () => {
    expect(routerSrc).toMatch(
      /\{\s*path:\s*"\/quick",\s*name:\s*"quick",\s*component:\s*\(\)\s*=>\s*import\("@\/pages\/QuickNumber\.vue"\)\s*\}/,
    );
  });

  it("does NOT get the sidebar layout (never built through realRoute)", () => {
    expect(routerSrc).not.toMatch(/realRoute\(\s*"\/quick"/);
    const line = routerSrc.split("\n").find((l) => l.includes('path: "/quick"')) ?? "";
    expect(line).not.toContain("layout");
  });

  it("keeps the onboarding guard gated on the sidebar layout, so /quick is exempt", () => {
    expect(routerSrc).toContain('to.meta?.layout === "sidebar"');
    expect(routerSrc).toContain('if (household.members.length === 0) return { name: "splash" }');
  });

  it("is what the splash 'start my own plan' card now opens", () => {
    expect(splashSrc).toMatch(/function startMyOwnPlan\(\)[\s\S]{0,160}router\.push\(\{ name: "quick" \}\)/);
    // The seven-step wizard stays reachable as the explicit "refine" path.
    expect(splashSrc).toMatch(/startDetailedWizard[\s\S]{0,200}name: "wizard"/);
  });
});

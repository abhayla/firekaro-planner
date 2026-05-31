/**
 * v5 a11y audit — equivalent of v4's Stage N (axe-core scan per route).
 *
 * Per v4 contract Q7-7a threshold:
 *   - Critical + Serious = blocking
 *   - Moderate = warning (logged, non-blocking)
 *   - Minor = ignored
 *
 * Output: test-results/v5-verification/a11y/<route>.json
 */
import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = [
  { path: "/", name: "splash" },
  { path: "/fire-goals/dashboard", name: "dashboard" },
  { path: "/preferences", name: "preferences" },
  { path: "/investments/buckets", name: "investments-buckets" },
  { path: "/fire-goals/stress-test", name: "stress-test" },
  { path: "/estate-planning", name: "estate-planning" },
  { path: "/tax-planning", name: "tax-planning" },
];

const OUTPUT = "test-results/v5-verification/a11y";
mkdirSync(OUTPUT, { recursive: true });

test.describe("v5 — axe-core a11y audit (WCAG 2.1 AA)", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto("/");
    const sampleBtn = page.getByRole("button", { name: /Try the sample/i });
    if (await sampleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sampleBtn.click();
      await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 10000 }).catch(() => {});
    }
    await page.close();
  });

  for (const route of ROUTES) {
    test(`a11y: ${route.name}`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      writeFileSync(
        join(OUTPUT, `${route.name}.json`),
        JSON.stringify(
          {
            url: results.url,
            violations: results.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              help: v.help,
              nodes: v.nodes.length,
            })),
            counts: {
              critical: results.violations.filter((v) => v.impact === "critical").length,
              serious: results.violations.filter((v) => v.impact === "serious").length,
              moderate: results.violations.filter((v) => v.impact === "moderate").length,
              minor: results.violations.filter((v) => v.impact === "minor").length,
            },
          },
          null,
          2,
        ),
      );

      // v4 Q7-7a threshold — Critical + Serious are blocking.
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(
        blocking,
        `${route.name}: ${blocking.length} Critical/Serious WCAG violations — ${blocking.map((v) => `${v.impact}:${v.id}`).join(", ")}`,
      ).toEqual([]);
    });
  }
});

/**
 * v5 verification sweep — TRUE rule 24 + rule 25 + rule 26 equivalent.
 *
 * v4 demo's pattern via Playwright MCP, adapted for the CLI.
 *
 * Each test loads the Sharmas sample seed INSIDE the test (not in
 * beforeAll — Playwright's default isolation gives every test a fresh
 * context, so beforeAll-loaded localStorage doesn't survive).
 *
 * Per route, the test:
 *   - Captures a screenshot, console messages, ARIA tree, localStorage
 *   - Asserts zero page errors + zero real console errors
 *   - Asserts the page contains content UNIQUE to this route (substance
 *     check — without this, the router guard's redirect-to-splash would
 *     silently pass)
 *   - Asserts the URL settled at the intended path (not redirected to /)
 */
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface RouteSpec {
  path: string;
  name: string;
  /** Substring that MUST be visible. If splash leaks in, this won't match. */
  expectText: RegExp;
}

const ROUTES: RouteSpec[] = [
  { path: "/", name: "splash", expectText: /Explore with sample data/i },
  { path: "/fire-goals/dashboard", name: "dashboard", expectText: /Years to FIRE|FIRE Number|Suggestions for you|FIRE milestones/i },
  { path: "/preferences", name: "preferences", expectText: /Statutory reference|Core FIRE|Expected returns/i },
  { path: "/investments/buckets", name: "investments-buckets", expectText: /Investment buckets|Bucket 1|years coverage/i },
  { path: "/fire-goals/stress-test", name: "stress-test", expectText: /Stress test|Pressure-test|market correction/i },
  { path: "/estate-planning", name: "estate-planning", expectText: /Estate planning|7-step|Will/i },
  { path: "/tax-planning", name: "tax-planning", expectText: /Taxes|Income consolidation/i },
  { path: "/investments/overview", name: "investments-overview", expectText: /Investments|Asset allocation|Equity/i },
  { path: "/liabilities/loans", name: "liabilities-loans", expectText: /Loan|Liabilit/i },
  { path: "/expenses/recurring", name: "expenses-recurring", expectText: /Recurring|Expense kind/i },
  { path: "/fire-goals/what-if", name: "what-if", expectText: /What-If|Scenario|Lever/i },
];

const OUTPUT_ROOT = "test-results/v5-verification";
mkdirSync(join(OUTPUT_ROOT, "screenshots"), { recursive: true });
mkdirSync(join(OUTPUT_ROOT, "console"), { recursive: true });
mkdirSync(join(OUTPUT_ROOT, "aria"), { recursive: true });
mkdirSync(join(OUTPUT_ROOT, "localstorage"), { recursive: true });

interface ConsoleEntry {
  type: string;
  text: string;
  location?: string;
}

async function loadSampleSeed(page: Page) {
  await page.goto("/", { waitUntil: "networkidle", timeout: 15000 });
  const sampleBtn = page.getByRole("button", { name: /Try the sample/i });
  if (await sampleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await sampleBtn.click();
    await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 10000 });
    await page.waitForTimeout(500);
  }
}

test.describe("v5 — verification sweep (rules 24/25/26 equivalent)", () => {
  for (const route of ROUTES) {
    test(`route: ${route.name}`, async ({ page }) => {
      const consoleMessages: ConsoleEntry[] = [];
      page.on("console", (msg: ConsoleMessage) => {
        consoleMessages.push({
          type: msg.type(),
          text: msg.text(),
          location: msg.location()?.url,
        });
      });

      const pageErrors: string[] = [];
      page.on("pageerror", (err) => {
        pageErrors.push(err.message);
      });

      // Load the sample seed FIRST for every route except /.
      // Without this, sidebar-layout routes get redirected to /splash
      // by the router guard (household.members.length === 0).
      if (route.name !== "splash") {
        await loadSampleSeed(page);
      }

      await page.goto(route.path, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);

      const screenshotPath = join(OUTPUT_ROOT, "screenshots", `${route.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      writeFileSync(
        join(OUTPUT_ROOT, "console", `${route.name}.json`),
        JSON.stringify({ url: page.url(), consoleMessages, pageErrors }, null, 2),
      );

      const ariaSnapshot = await page.locator("body").ariaSnapshot({ ref: false });
      writeFileSync(
        join(OUTPUT_ROOT, "aria", `${route.name}.txt`),
        ariaSnapshot,
      );

      const ls = await page.evaluate(() => {
        const out: Record<string, unknown> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("firekaro-mvp:")) {
            try {
              out[k] = JSON.parse(localStorage.getItem(k) || "null");
            } catch {
              out[k] = localStorage.getItem(k);
            }
          }
        }
        return out;
      });
      writeFileSync(
        join(OUTPUT_ROOT, "localstorage", `${route.name}.json`),
        JSON.stringify(ls, null, 2),
      );

      // ---- assertions ----

      expect(pageErrors, `page errors on ${route.name}: ${pageErrors.join("; ")}`).toEqual([]);

      const realErrors = consoleMessages.filter(
        (m) =>
          m.type === "error" &&
          !m.text.includes("[Vuetify]") &&
          !m.text.includes("DEPRECATION WARNING") &&
          !m.text.includes("Sass @import rules are deprecated"),
      );
      expect(
        realErrors,
        `console errors on ${route.name}: ${realErrors.map((e) => e.text).join("\n")}`,
      ).toEqual([]);

      expect(ariaSnapshot.length, `empty ARIA tree on ${route.name}`).toBeGreaterThan(50);

      // SUBSTANCE — page contains content unique to this route.
      const bodyText = await page.locator("body").innerText();
      expect(
        bodyText,
        `${route.name} did NOT show its expected content. URL settled at ${page.url()}. Body excerpt: ${bodyText.slice(0, 250)}`,
      ).toMatch(route.expectText);

      // URL must have settled at intended path (not redirected to /).
      if (route.name !== "splash") {
        expect(page.url(), `${route.name} redirected away from ${route.path}`).not.toMatch(/localhost:\d+\/$/);
      }
    });
  }
});

// Comprehensive authenticated prod-UI verification: load the app with the captured
// session, load sample data, auto-discover every nav route, and for each screen capture
// a full-page screenshot + console errors + render signals. Read-only walk (no edits).
import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";
import { mkdirSync } from "node:fs";

const HOSTS = ["firekaro.com", "accounts.google.com", "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com", "lh3.googleusercontent.com"];
const rules = [];
for (const h of HOSTS) { try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch {} }

mkdirSync("prod-verify", { recursive: true });
const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: ["--disable-blink-features=AutomationControlled", ...(rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [])],
  ignoreDefaultArgs: ["--enable-automation"],
});
const ctx = await browser.newContext({ storageState: "e2e/.auth/prod-user.json", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

let cur = "init";
const consoleErrors = {};
const note = (t) => { (consoleErrors[cur] ??= []).push(t.slice(0, 160)); };
page.on("console", (m) => { if (m.type() === "error") note(m.text()); });
page.on("pageerror", (e) => note("PAGEERROR: " + e.message));

const BASE = "https://firekaro.com";
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log("GOTO:", e.message));
await page.waitForTimeout(3500);

// Load sample data so every screen is populated.
const sampleBtn = page.getByRole("button", { name: /try the sample/i }).first();
if (await sampleBtn.isVisible().catch(() => false)) {
  await sampleBtn.click().catch(() => {});
  await page.waitForTimeout(6000);
}
await page.waitForSelector("#app[data-hydrated='true']", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);

// Explicit full section list (the 12-item sidebar + extras) — the app redirects each
// top-level route to its default child; landedUrl records where it resolves.
const routes = [
  "/dashboard", "/income", "/tax-planning", "/expenses", "/investments",
  "/liabilities", "/insurance", "/financial-health", "/fire-goals",
  "/preferences", "/profile", "/estate-planning", "/glossary",
];

const report = [];
for (const route of routes) {
  cur = route;
  try {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#app[data-hydrated='true']", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const safe = (route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root").slice(0, 50);
    await page.screenshot({ path: `prod-verify/${safe}.png`, fullPage: true }).catch(() => {});
    const heading = await page.locator("h1, h2, .text-h4, .text-h5, .text-h6").first().innerText().catch(() => "");
    const cards = await page.locator(".v-card").count().catch(() => 0);
    const bodyLen = (await page.locator("#app").innerText().catch(() => "")).length;
    report.push({ route, file: `prod-verify/${safe}.png`, landedUrl: page.url().replace(BASE, ""), heading: heading.replace(/\s+/g, " ").slice(0, 70), cards, bodyLen, errors: (consoleErrors[route] || []).length });
  } catch (e) {
    report.push({ route, error: String(e).slice(0, 120) });
  }
}

console.log(JSON.stringify({ routeCount: routes.length, report, consoleErrors }, null, 2));
await browser.close();

// Rule 32: non-destructive interactive-functionality check on PROD (captured session).
// Uses the app's REAL controls (Vuetify .v-list-item sidebar nav, the FY selector, the
// ⌘K command palette, dashboard "More info" popovers). Strictly non-destructive.
import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";
import { mkdirSync } from "node:fs";

const HOSTS = ["firekaro.com", "accounts.google.com", "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com", "lh3.googleusercontent.com"];
const rules = [];
for (const h of HOSTS) { try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch {} }
mkdirSync("prod-verify/interactions", { recursive: true });
const BASE = "https://firekaro.com";
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--disable-blink-features=AutomationControlled", ...(rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [])], ignoreDefaultArgs: ["--enable-automation"] });
const ctx = await browser.newContext({ storageState: "e2e/.auth/prod-user.json", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

let cur = "init"; const errs = {};
page.on("console", (m) => { if (m.type() === "error") (errs[cur] ??= []).push(m.text().slice(0, 130)); });
page.on("pageerror", (e) => (errs[cur] ??= []).push("PAGEERR:" + e.message.slice(0, 130)));
const hydrate = async () => { await page.waitForSelector("#app[data-hydrated='true']", { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(1800); };
const out = [];
const rec = (n, ok, d) => out.push({ interaction: n, responded: ok, detail: d });

// land + dismiss tour
cur = "dashboard"; await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" }).catch(() => {}); await hydrate();
await page.keyboard.press("Escape").catch(() => {});
const skip = page.getByRole("button", { name: /skip tour/i }).first();
if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); await page.waitForTimeout(700); }

// 1. SIDEBAR NAV (Vuetify .v-list-item) — click → URL changes
for (const [label, expect] of [["Taxes", "/tax"], ["Investments", "/investments"], ["Expenses", "/expenses"], ["Profile", "/profile"]]) {
  cur = "nav:" + label;
  const item = page.locator(".v-list-item").filter({ hasText: new RegExp("^\\s*" + label + "\\s*$", "i") }).first();
  if (!(await item.isVisible().catch(() => false))) { rec(`sidebar → ${label}`, false, "list-item not visible"); continue; }
  const before = page.url();
  await item.click().catch(() => {}); await page.waitForTimeout(1500);
  const after = page.url();
  rec(`sidebar → ${label}`, after !== before && after.toLowerCase().includes(expect), `url ${after.replace(BASE, "")}`);
}
await page.screenshot({ path: "prod-verify/interactions/after-nav.png" });

// 2. FY selector — open dropdown
cur = "fy"; await page.goto(BASE + "/income/overview", { waitUntil: "domcontentloaded" }).catch(() => {}); await hydrate();
const fy = page.getByRole("button", { name: /20\d\d/ }).first().or(page.locator(".v-app-bar, header").getByText(/20\d\d/).first());
let fyOk = false;
if (await fy.isVisible().catch(() => false)) {
  await fy.click().catch(() => {}); await page.waitForTimeout(800);
  fyOk = await page.locator(".v-overlay__content, [role='listbox'], [role='menu']").first().isVisible().catch(() => false);
  await page.keyboard.press("Escape").catch(() => {});
}
rec("FY selector opens", fyOk, fyOk ? "dropdown appeared" : "not found");

// 3. ⌘K command palette — open + close
cur = "cmdk"; await page.waitForTimeout(500);
const cmdk = page.getByRole("button", { name: /⌘K|⌃K|search/i }).first();
let cmdkOk = false, cmdkClosed = false;
if (await cmdk.isVisible().catch(() => false)) {
  await cmdk.click().catch(() => {}); await page.waitForTimeout(800);
  cmdkOk = await page.locator(".v-overlay__content, [role='dialog'], input[type='text']:visible").first().isVisible().catch(() => false);
  await page.screenshot({ path: "prod-verify/interactions/cmdk-open.png" });
  await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(600);
  cmdkClosed = !(await page.locator("[role='dialog']").first().isVisible().catch(() => false));
}
rec("⌘K command palette opens", cmdkOk, cmdkOk ? "overlay appeared" : "not found");
rec("⌘K palette closes (Esc)", cmdkOk && cmdkClosed, cmdkClosed ? "closed" : "n/a");

// 4. Dashboard "More info" popover
cur = "moreinfo"; await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" }).catch(() => {}); await hydrate();
await page.keyboard.press("Escape").catch(() => {});
const sk = page.getByRole("button", { name: /skip tour/i }).first();
if (await sk.isVisible().catch(() => false)) { await sk.click().catch(() => {}); await page.waitForTimeout(500); }
const info = page.getByRole("button", { name: /more info about/i }).first();
let infoOk = false;
if (await info.isVisible().catch(() => false)) {
  await info.click().catch(() => {}); await page.waitForTimeout(700);
  infoOk = await page.locator(".v-overlay__content, [role='tooltip'], [role='dialog']").first().isVisible().catch(() => false);
  await page.keyboard.press("Escape").catch(() => {});
}
rec("dashboard 'More info' popover opens", infoOk, infoOk ? "popover appeared" : "not found");

const totalErrors = Object.values(errs).reduce((n, a) => n + a.length, 0);
const passed = out.filter((o) => o.responded).length;
console.log(JSON.stringify({ summary: `${passed}/${out.length} interactions responded`, totalConsoleErrors: totalErrors, interactions: out, errs }, null, 2));
await browser.close();

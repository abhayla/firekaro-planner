// gh-issue #27 verification: investments overview corpus-card coherence + shared donut retitle.
// Headless bypass for the hung MCP (project_mcp_browser_bypass). Loads the Sharmas sample.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5175";
mkdirSync("verify-27", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
const errors = {};
let cur = "init";
page.on("console", (m) => {
  if (m.type() === "error") (errors[cur] ??= []).push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => (errors[cur] ??= []).push("PAGEERR:" + e.message.slice(0, 160)));
const hydrate = async () => {
  await page.waitForSelector("#app", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1600);
};

cur = "splash";
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
await hydrate();
const sample = page.getByRole("button", { name: /try the sample/i }).first();
if (await sample.isVisible().catch(() => false)) {
  await sample.click().catch(() => {});
  await page.waitForTimeout(1600);
}
await page.keyboard.press("Escape").catch(() => {});
const skip = page.getByRole("button", { name: /skip tour|skip|close|got it/i }).first();
if (await skip.isVisible().catch(() => false)) {
  await skip.click().catch(() => {});
  await page.waitForTimeout(600);
}

cur = "investments";
await page.goto(BASE + "/investments/overview", { waitUntil: "networkidle" }).catch(() => {});
await hydrate();
const body = await page.locator("body").innerText().catch(() => "");
// Extract the per-class footnote percentages → must sum to ~100 (coherent denominator).
const pcts = [...body.matchAll(/(\d+)%\s*of holdings/gi)].map((m) => Number(m[1]));
const pctSum = pcts.reduce((s, n) => s + n, 0);
const heroLabel = await page.locator(".hero-corpus__label").innerText().catch(() => "");
const checks = {
  cardLabelIsFireCorpus: /FIRE corpus/i.test(heroLabel),
  cardLabelNotTotalCorpus: !/Total corpus/i.test(heroLabel),
  sublabelExcludesHome: /Excludes your home/i.test(body),
  footnoteOfHoldings: /% of holdings/i.test(body),
  footnotePctSumNear100: pctSum >= 97 && pctSum <= 103,
  donutTitleAssets: /How your assets are allocated/i.test(body),
  donutTitleNotCorpus: !/How your corpus is invested/i.test(body),
};
await page.screenshot({ path: "verify-27/investments-overview.png", fullPage: true });

cur = "dashboard";
await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" }).catch(() => {});
await hydrate();
const dash = await page.locator("body").innerText().catch(() => "");
const dashChecks = {
  donutTitleAssets: /How your assets are allocated/i.test(dash),
  donutTitleNotCorpus: !/How your corpus is invested/i.test(dash),
};
await page.screenshot({ path: "verify-27/dashboard.png", fullPage: true });

// 4. MEMBER LENS — switch to a single member; coherence (% sum to ~100) MUST hold (the #22-class gap).
cur = "lens";
await page.goto(BASE + "/investments/overview", { waitUntil: "networkidle" }).catch(() => {});
await hydrate();
let lensChecks = { switched: false };
try {
  const select = page.locator(".v-select").filter({ hasText: "Whole household" }).first();
  if (await select.isVisible().catch(() => false)) {
    await select.click({ force: true });
    await page.waitForTimeout(700);
    // Scope to the OPEN menu overlay (not the sidebar) — pick the 2nd option (first real member
    // after "Whole household").
    const menu = page.locator(".v-overlay__content").last();
    const opt = menu.locator("[role='option'], .v-list-item").nth(1);
    const member = (await opt.innerText().catch(() => "")).trim().slice(0, 24);
    await opt.click().catch(() => {});
    await page.waitForTimeout(1400);
    const lbody = await page.locator("body").innerText().catch(() => "");
    const lpcts = [...lbody.matchAll(/(\d+)%\s*of holdings/gi)].map((m) => Number(m[1]));
    const lsum = lpcts.reduce((s, n) => s + n, 0);
    const home = lbody.match(/Excludes your home \(([^)]+)\)/i);
    lensChecks = {
      switched: true,
      member,
      pcts: lpcts,
      pctSumCoherent: lpcts.length === 0 || (lsum >= 97 && lsum <= 103),
      homeExcluded: home ? home[1] : "(none — member owns no primary residence)",
    };
    await page.screenshot({ path: "verify-27/investments-member-lens.png", fullPage: true });
  }
} catch (e) {
  lensChecks = { switched: false, err: String(e).slice(0, 120) };
}

console.log(JSON.stringify({ checks, footnotePcts: pcts, pctSum, dashChecks, lensChecks, errors }, null, 2));
await browser.close();

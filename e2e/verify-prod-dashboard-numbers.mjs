// Follow-up: dismiss the onboarding tour, re-capture a CLEAN dashboard, and extract the
// exact on-screen text of the FIRE milestones + the investments corpus figures, to settle
// the reviewer's flags (₹1.10 Cr vs ₹2.05 Cr, and the "13.7x Cr" milestone).
import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";
import { writeFileSync } from "node:fs";

const HOSTS = ["firekaro.com", "accounts.google.com", "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com", "lh3.googleusercontent.com"];
const rules = [];
for (const h of HOSTS) { try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch {} }

const BASE = "https://firekaro.com";
const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: ["--disable-blink-features=AutomationControlled", ...(rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [])],
  ignoreDefaultArgs: ["--enable-automation"],
});
const ctx = await browser.newContext({ storageState: "e2e/.auth/prod-user.json", viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

async function hydrate() { await page.waitForSelector("#app[data-hydrated='true']", { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(2500); }

await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log("GOTO:", e.message));
await hydrate();
// Dismiss the onboarding tour (try Escape + any skip/done/close button).
await page.keyboard.press("Escape").catch(() => {});
for (const re of [/skip tour/i, /skip/i, /finish/i, /done/i, /got it/i, /no thanks/i, /close/i]) {
  const b = page.getByRole("button", { name: re }).first();
  if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(800); break; }
}
await page.waitForTimeout(1500);
await page.screenshot({ path: "prod-verify/dashboard_clean.png", fullPage: true });
const dashText = (await page.locator("#app").innerText().catch(() => "")).replace(/\n{3,}/g, "\n\n");
writeFileSync("prod-verify/dashboard.txt", dashText);

await page.goto(BASE + "/investments", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log("GOTO:", e.message));
await hydrate();
await page.screenshot({ path: "prod-verify/investments_clean.png", fullPage: true });
const invText = (await page.locator("#app").innerText().catch(() => "")).replace(/\n{3,}/g, "\n\n");
writeFileSync("prod-verify/investments.txt", invText);

console.log("DONE — wrote dashboard.txt, investments.txt, dashboard_clean.png, investments_clean.png");
console.log("dashText length:", dashText.length, "| invText length:", invText.length);
await browser.close();

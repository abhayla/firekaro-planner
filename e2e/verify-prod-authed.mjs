// Tier-2 authenticated prod UI check: load firekaro.com using the captured session
// (e2e/.auth/prod-user.json) and confirm a logged-in user lands in the app (not /login).
import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";

const HOSTS = ["firekaro.com", "accounts.google.com", "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com", "lh3.googleusercontent.com"];
const rules = [];
for (const h of HOSTS) { try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch {} }

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--disable-blink-features=AutomationControlled", ...(rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [])],
  ignoreDefaultArgs: ["--enable-automation"],
});
const ctx = await browser.newContext({ storageState: "e2e/.auth/prod-user.json", viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto("https://firekaro.com", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log("GOTO:", e.message));
await page.waitForTimeout(4500);
await page.screenshot({ path: "prod-authed.png" });
console.log(JSON.stringify({
  finalUrl: page.url(),
  authenticated: !/\/login/.test(page.url()),
  title: await page.title().catch(() => ""),
  bodyPreview: (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 220),
}, null, 2));
await browser.close();

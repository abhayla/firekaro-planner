// Inspect real clickable elements on key prod screens so the interaction test uses
// correct selectors (the first attempt guessed wrong locators).
import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";
const HOSTS = ["firekaro.com", "accounts.google.com", "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com", "lh3.googleusercontent.com"];
const rules = [];
for (const h of HOSTS) { try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch {} }
const BASE = "https://firekaro.com";
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--disable-blink-features=AutomationControlled", ...(rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [])], ignoreDefaultArgs: ["--enable-automation"] });
const page = await browser.newContext({ storageState: "e2e/.auth/prod-user.json", viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
const hydrate = async () => { await page.waitForSelector("#app[data-hydrated='true']", { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(1800); };

const dump = {};
for (const route of ["/income/overview", "/expenses/overview", "/fire-goals/dashboard", "/investments/overview"]) {
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => {});
  await hydrate();
  const links = await page.$$eval("a[href]", (as) => [...new Set(as.map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/")))]).catch(() => []);
  const buttons = await page.$$eval("button", (bs) => [...new Set(bs.map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim()).filter((t) => t && t.length < 30))]).catch(() => []);
  const tabs = await page.$$eval("[role='tab'], .v-tab", (ts) => [...new Set(ts.map((t) => (t.innerText || "").trim()).filter(Boolean))]).catch(() => []);
  dump[route] = { links: links.slice(0, 25), buttons: buttons.slice(0, 25), tabs };
}
console.log(JSON.stringify(dump, null, 2));
await browser.close();

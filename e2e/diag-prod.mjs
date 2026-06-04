import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";

const HOSTS = ["firekaro.com", "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com"];
const rules = [];
for (const h of HOSTS) { try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch {} }

const browser = await chromium.launch({ headless: true, channel: "chrome", args: rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [] });
const page = await browser.newContext({ viewport: { width: 1280, height: 800 } }).then((c) => c.newPage());

const consoleErrs = [];
const netFails = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrs.push("PAGEERROR: " + e.message.slice(0, 200)));
page.on("requestfailed", (r) => netFails.push(`FAILED ${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
page.on("response", (r) => { if (r.status() >= 400) netFails.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });

await page.goto("https://firekaro.com", { waitUntil: "networkidle", timeout: 30000 }).catch((e) => console.log("GOTO:", e.message));
await page.waitForTimeout(2000);

const html = await page.content();
const assetRefs = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1]);
const appHtml = await page.locator("#app").innerHTML().catch(() => "(no #app)");
console.log(JSON.stringify({
  appInnerHtmlLen: appHtml.length,
  assetRefs,
  consoleErrs,
  netFails,
}, null, 2));
await browser.close();

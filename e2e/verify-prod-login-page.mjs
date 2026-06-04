// Pre-login verification: confirm firekaro.com/login actually renders over the
// forced-IPv4 path BEFORE a human is asked to type credentials. Headless (no window
// needed) — produces a screenshot + signals for inspection.
import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";

const HOSTS = [
  "firekaro.com", "accounts.google.com", "www.google.com", "apis.google.com",
  "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com", "lh3.googleusercontent.com",
];
const rules = [];
for (const h of HOSTS) {
  try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch { /* skip */ }
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const resp = await page
  .goto("https://firekaro.com", { waitUntil: "domcontentloaded", timeout: 30000 })
  .catch((e) => { console.log("GOTO_ERROR:", e.message); return null; });
await page.waitForTimeout(3000);

const hasGoogleBtn = await page.getByText(/sign in with google/i).first().isVisible().catch(() => false);
const bodyPreview = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 240);
await page.screenshot({ path: "prod-login-verify.png" });
console.log(JSON.stringify({
  httpStatus: resp?.status() ?? null,
  finalUrl: page.url(),
  title: await page.title().catch(() => ""),
  signInWithGoogleVisible: hasGoogleBtn,
  bodyPreview,
}, null, 2));
await browser.close();

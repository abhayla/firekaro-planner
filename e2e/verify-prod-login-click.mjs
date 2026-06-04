// Verify the FULL login handoff: open /login, click "Sign in with Google", and
// confirm it reaches a working Google sign-in page (not an error/timeout) — so the
// path the user will take is verified before they're asked to sign in.
import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";

const HOSTS = [
  "firekaro.com", "accounts.google.com", "www.google.com", "apis.google.com",
  "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com", "lh3.googleusercontent.com",
  "play.google.com", "accounts.youtube.com",
];
const rules = [];
for (const h of HOSTS) { try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch {} }

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--disable-blink-features=AutomationControlled", ...(rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [])],
  ignoreDefaultArgs: ["--enable-automation"],
});
const page = await browser.newContext({ viewport: { width: 1280, height: 800 } }).then((c) => c.newPage());

await page.goto("https://firekaro.com/login", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log("GOTO_LOGIN:", e.message));
await page.waitForTimeout(2000);

const btn = page.getByRole("button", { name: /sign in with google/i }).first();
const visible = await btn.isVisible().catch(() => false);
let clickResult = "button-not-visible";
if (visible) {
  clickResult = "clicked";
  await Promise.all([
    page.waitForURL(/google\.com|accounts\.google/i, { timeout: 25000 }).catch(() => {}),
    btn.click().catch((e) => { clickResult = "click-error: " + e.message; }),
  ]);
  await page.waitForTimeout(3500);
}
await page.screenshot({ path: "prod-login-click.png" });
console.log(JSON.stringify({
  loginButtonVisible: visible,
  clickResult,
  landedUrl: page.url(),
  landedTitle: await page.title().catch(() => ""),
  bodyPreview: (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 220),
}, null, 2));
await browser.close();

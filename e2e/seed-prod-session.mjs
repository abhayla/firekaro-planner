// Tier-2 prod-session seeder (testing-strategy.md). Opens ONE fully-isolated Chrome
// window (its own user-data-dir — cannot conflict with the user's normal Chrome, so
// there are never stray windows to clean up) and lets a human sign in with the
// dedicated test account via Google OAuth. The script:
//   - NEVER reads keystrokes or the password (it only polls for the session cookie),
//   - takes ONE screenshot at the start (so the launch can be verified before the user
//     is asked to type) and then is COMPLETELY hands-off — no further screenshots, no
//     process-killing — while the user signs in,
//   - saves ONLY the session cookie (storageState) to e2e/.auth/prod-user.json.
//
//   node e2e/seed-prod-session.mjs
import { chromium } from "@playwright/test";
import { promises as dns } from "node:dns";
import { mkdirSync, rmSync } from "node:fs";

const PROFILE = "e2e/.auth/prod-seed-profile";
const STATE_PATH = "e2e/.auth/prod-user.json";
const URL = "https://firekaro.com/login";
const WAIT_MS = 5 * 60 * 1000;

// Fresh isolated profile each run (separate Chrome instance from the user's Chrome).
try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* first run */ }
mkdirSync(PROFILE, { recursive: true });
mkdirSync("e2e/.auth", { recursive: true });

// This network's IPv6 is broken; force every OAuth host to IPv4 so the window doesn't hang.
const HOSTS = [
  "firekaro.com", "accounts.google.com", "www.google.com", "apis.google.com",
  "ssl.gstatic.com", "www.gstatic.com", "fonts.gstatic.com", "lh3.googleusercontent.com",
  "play.google.com", "accounts.youtube.com",
];
const rules = [];
for (const h of HOSTS) { try { const [ip] = await dns.resolve4(h); if (ip) rules.push(`MAP ${h} ${ip}`); } catch { /* skip */ } }

// launchPersistentContext with a dedicated dir => a SEPARATE Chrome instance that opens
// its own window and never attaches to the user's running Chrome (the bug behind the
// "no window" / "wrong window" failures).
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  channel: "chrome",
  viewport: null,
  args: [
    "--start-maximized",
    "--window-position=0,0",
    "--disable-blink-features=AutomationControlled",
    ...(rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : []),
  ],
  ignoreDefaultArgs: ["--enable-automation"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log("GOTO:", e.message));

// ONE verification screenshot, then hands off entirely.
await page.waitForTimeout(3000);
await page.screenshot({ path: "prod-seed-window.png" }).catch(() => {});
console.log("WINDOW_READY (verification screenshot -> prod-seed-window.png)");
console.log(">>> Sign in with abhayfaircent@gmail.com in the window. No further screenshots are taken while you type.");

const deadline = Date.now() + WAIT_MS;
let seeded = false;
while (Date.now() < deadline) {
  // Hands-off: only read the cookie jar (never the page content / password) while signing in.
  const cookies = await ctx.cookies("https://firekaro.com");
  const onApp = /:\/\/firekaro\.com/.test(page.url());
  if (onApp && cookies.some((c) => /session[._-]?token/i.test(c.name) && c.value && c.value.length > 16)) {
    seeded = true;
    break;
  }
  await page.waitForTimeout(2000);
}

if (!seeded) {
  console.error("TIMEOUT: no completed session detected after 5 minutes.");
  await ctx.close();
  process.exit(1);
}
await ctx.storageState({ path: STATE_PATH });
console.log(`SESSION_SAVED -> ${STATE_PATH}`);
await ctx.close();

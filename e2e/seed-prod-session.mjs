// Tier-2 prod-session seeder (testing-strategy.md). Opens a headed real-Chrome
// window on firekaro.com so a human logs in with the dedicated test account
// (Google OAuth — the password is typed by the human, never by this script).
// On success it saves ONLY the session cookie (storageState) to
// e2e/.auth/prod-user.json (gitignored, ~7-day life) for on-demand authenticated
// prod UI checks. Re-run when the session expires.
//
//   node e2e/seed-prod-session.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { promises as dns } from "node:dns";

const STATE_PATH = "e2e/.auth/prod-user.json";
const URL = "https://firekaro.com";
const WAIT_MS = 5 * 60 * 1000;

mkdirSync("e2e/.auth", { recursive: true });

// This network's IPv6 is broken (firekaro.com + Google login are dual-stack, so a
// browser hangs trying IPv6 first). We can't disable OS IPv6 without admin — instead
// resolve the IPv4 (A record) for every host the OAuth flow touches and force Chrome
// to use it via --host-resolver-rules, so no IPv6 connection is ever attempted.
const HOSTS = [
  "firekaro.com",
  "accounts.google.com",
  "www.google.com",
  "apis.google.com",
  "ssl.gstatic.com",
  "www.gstatic.com",
  "fonts.gstatic.com",
  "lh3.googleusercontent.com",
  "play.google.com",
  "accounts.youtube.com",
];
const rules = [];
for (const h of HOSTS) {
  try {
    const [ip] = await dns.resolve4(h);
    if (ip) rules.push(`MAP ${h} ${ip}`);
  } catch {
    /* skip hosts with no A record reachable */
  }
}
console.log(`Forcing IPv4 for ${rules.length}/${HOSTS.length} hosts (broken-IPv6 workaround, no admin needed).`);

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  // --disable-blink-features=AutomationControlled hides navigator.webdriver so
  // Google's "this browser may not be secure" check doesn't block a real human login.
  // --host-resolver-rules forces every OAuth host to its IPv4 (broken-IPv6 workaround).
  args: [
    "--start-maximized",
    "--disable-blink-features=AutomationControlled",
    ...(rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : []),
  ],
  ignoreDefaultArgs: ["--enable-automation"],
});
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });

console.log("\n>>> A Chrome window is open. Sign in with the test account (abhayfaircent@gmail.com).");
console.log(">>> Type the password yourself — this script never reads it. Waiting up to 5 minutes...\n");

const deadline = Date.now() + WAIT_MS;
let seeded = false;
while (Date.now() < deadline) {
  const cookies = await ctx.cookies(URL);
  // Better Auth sets a session cookie once OAuth completes.
  if (cookies.some((c) => /session|better-auth/i.test(c.name) && c.value)) {
    seeded = true;
    break;
  }
  await page.waitForTimeout(2000);
}

if (!seeded) {
  console.error("TIMEOUT: no session cookie detected after 5 minutes.");
  await browser.close();
  process.exit(1);
}

await ctx.storageState({ path: STATE_PATH });
const names = (await ctx.cookies(URL)).map((c) => c.name).join(", ");
console.log(`\nSESSION_SAVED -> ${STATE_PATH}  (cookies: ${names})`);
await browser.close();

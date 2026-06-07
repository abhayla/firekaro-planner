// Prod authenticated verification via CDP-attach (defeats Google's automation block).
// Launches a PLAIN Chrome with only --remote-debugging-port (NO --enable-automation, so
// navigator.webdriver stays false and Google accepts the login), waits for Abhay to sign in,
// then attaches Playwright over CDP to run a NON-DESTRUCTIVE sweep (render + read + dialog
// open/close only — NEVER create/edit/delete real data). Leaves the Chrome session intact.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = `verification-screenshots/PROD-authed-${ts}`;
mkdirSync(OUT, { recursive: true });

console.log("[0] Launching a normal Chrome (remote-debugging only, no automation flag) → firekaro.com/login");
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.cwd()}\\e2e\\.auth\\prod-cdp-profile`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    "https://firekaro.com/login",
  ],
  { detached: true, stdio: "ignore" },
);
chrome.unref();

// Wait for the debugging endpoint to come up.
async function cdpReady() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json/version`);
      if (r.ok) return true;
    } catch {}
    await new Promise((f) => setTimeout(f, 1500));
  }
  return false;
}
if (!(await cdpReady())) {
  console.log("VERDICT: BLOCKED — Chrome remote-debugging endpoint never came up.");
  process.exit(2);
}

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const ctx = browser.contexts()[0] || (await browser.newContext());
let p = ctx.pages().find((pg) => /firekaro\.com/.test(pg.url())) || ctx.pages()[0] || (await ctx.newPage());
await p.bringToFront().catch(() => {});

const cerr = [];
p.on("console", (m) => {
  if (m.type() === "error" && !/favicon|devtools|401|Failed to load resource|Unauthorized/i.test(m.text())) cerr.push(m.text());
});
const perr = [];
p.on("pageerror", (e) => perr.push(String(e)));
const clean = () => p.evaluate(() => document.querySelectorAll(".tour-overlay,.demo-chip").forEach((n) => n.remove())).catch(() => {});

console.log("[1] Chrome up — please sign in with Google. Waiting up to 8 min…");
const DEADLINE = Date.now() + 8 * 60 * 1000;
let authed = false;
while (Date.now() < DEADLINE) {
  await new Promise((f) => setTimeout(f, 4000));
  // Re-acquire the firekaro tab each loop (he may navigate during OAuth).
  p = ctx.pages().find((pg) => /firekaro\.com/.test(pg.url())) || p;
  const url = p.url();
  if (/firekaro\.com/.test(url) && !/\/login/.test(url)) {
    const so = await p.getByRole("button", { name: /sign out/i }).first().isVisible({ timeout: 1500 }).catch(() => false);
    if (so) { authed = true; break; }
  }
  const remain = Math.round((DEADLINE - Date.now()) / 1000);
  if (/\/login/.test(url)) console.log(`    …on /login, waiting for Google auth (${remain}s left)`);
}
if (!authed) {
  console.log("VERDICT: BLOCKED — login not completed in 8 min.");
  await browser.close().catch(() => {}); // disconnect CDP (leaves Chrome per detached spawn)
  process.exit(2);
}
console.log("[2] Authenticated ✓ — starting non-destructive sweep.");

const routes = [
  ["/fire-goals/dashboard", "dashboard"], ["/income/overview", "income"], ["/income/salary", "income-salary"],
  ["/income/business", "income-business"], ["/income/other-sources", "income-other"], ["/tax-planning", "tax"],
  ["/expenses/overview", "expenses"], ["/expenses/recurring", "expenses-recurring"], ["/expenses/planned", "expenses-planned"],
  ["/investments/holdings", "investments"], ["/investments/overview", "investments-overview"], ["/investments/buckets", "buckets"],
  ["/liabilities/overview", "liabilities"], ["/liabilities/loans", "loans"], ["/insurance/overview", "insurance"],
  ["/financial-health", "health"], ["/financial-health/net-worth", "net-worth"], ["/financial-health/cash-flow", "cash-flow"],
  ["/financial-health/emergency-fund", "emergency-fund"], ["/fire-goals/goals", "fire-goals"], ["/fire-goals/what-if", "what-if"],
  ["/fire-goals/stress-test", "stress-test"], ["/estate-planning", "estate"], ["/preferences", "preferences"],
  ["/profile", "profile"], ["/glossary", "glossary"],
];
const bounced = [];
for (const [r, l] of routes) {
  await p.goto("https://firekaro.com" + r, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await new Promise((f) => setTimeout(f, 1200));
  if (/\/login/.test(p.url())) bounced.push(r);
  await clean();
  await p.screenshot({ path: `${OUT}/${l}.png`, fullPage: true }).catch(() => {});
}

const checks = {};
await p.goto("https://firekaro.com/fire-goals/dashboard", { waitUntil: "networkidle" }).catch(() => {});
await new Promise((f) => setTimeout(f, 1200)); await clean();
checks.demoAffordancesAbsent = await p.evaluate(() => {
  const txt = document.body.innerText;
  return !document.querySelector(".seed-switcher-btn") && !/Explore with sample|Try the sample|Switch to (the )?(Sharma|Iyer|Mehta|Maurya)/i.test(txt);
});
checks.fireHeadline = await p.evaluate(() => {
  const t = (document.querySelector("main, .v-main")?.innerText || "").replace(/\s+/g, " ");
  const m = t.match(/age (\d{2,3})/i); return m ? m[0] : "(no age token)";
});

await p.goto("https://firekaro.com/liabilities/loans", { waitUntil: "networkidle" }).catch(() => {});
await new Promise((f) => setTimeout(f, 1200)); await clean();
try {
  await p.locator('.v-select:has-text("Type") .v-field').first().click({ timeout: 5000 });
  await new Promise((f) => setTimeout(f, 500));
  const opts = await p.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((e) => e.textContent.trim()));
  checks.loanTypes = opts.filter((t) => /Loan|Credit|Other/i.test(t));
  await p.keyboard.press("Escape");
} catch (e) { checks.loanTypes = "ERR: " + (e.message || "").split("\n")[0]; }
await p.screenshot({ path: `${OUT}/loans-type-dropdown.png`, fullPage: true }).catch(() => {});

await p.goto("https://firekaro.com/profile", { waitUntil: "networkidle" }).catch(() => {});
await new Promise((f) => setTimeout(f, 1200)); await clean();
checks.nonEarningAdultSection = await p.evaluate(() => /non-earning adult/i.test(document.body.innerText));

await p.goto("https://firekaro.com/financial-health", { waitUntil: "networkidle" }).catch(() => {});
await new Promise((f) => setTimeout(f, 1200)); await clean();
checks.health = await p.evaluate(() => {
  const t = (document.body.innerText || "").replace(/\s+/g, " ");
  const m = t.match(/(\d{1,3})\s*\/\s*100/); return { scoreToken: m ? m[0] : "(none)", hasDTI: /debt-to-income/i.test(t) };
});

await p.goto("https://firekaro.com/fire-goals/dashboard", { waitUntil: "networkidle" }).catch(() => {});
await new Promise((f) => setTimeout(f, 1000)); await clean();
try {
  const cog = p.getByRole("button", { name: /Adjust assumptions/i }).first();
  if (await cog.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cog.click(); await new Promise((f) => setTimeout(f, 700));
    const open = await p.getByText(/Assumptions/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    await p.keyboard.press("Escape");
    checks.assumptionsDialog = open ? "opened+closed OK" : "cog clicked, panel not detected";
  } else checks.assumptionsDialog = "cog not found";
} catch (e) { checks.assumptionsDialog = "ERR: " + (e.message || "").split("\n")[0]; }

const verdict =
  !bounced.length && !perr.length &&
  checks.demoAffordancesAbsent === true &&
  Array.isArray(checks.loanTypes) && checks.loanTypes.includes("Commercial Loan") && checks.loanTypes.includes("Home Loan") &&
  checks.nonEarningAdultSection === true && checks.health?.hasDTI === true
    ? "PASS" : "CHECK";

const report = { authed, bounced, consoleErrors: cerr, pageErrors: perr, checks, screenshots: OUT, routeCount: routes.length, verdict };
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log("\n================ PROD AUTHED SWEEP REPORT ================");
console.log(JSON.stringify(report, null, 2));
console.log("VERDICT:", verdict);
await browser.close().catch(() => {}); // disconnects CDP; detached Chrome stays for you
process.exit(verdict === "PASS" ? 0 : 1);

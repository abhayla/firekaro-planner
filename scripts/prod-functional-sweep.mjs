// Prod AUTHENTICATED functional sweep (rule 32) of the newly-deployed must-have surfaces.
// Uses the valid saved session (e2e/.auth/prod-user.json) — no Google login needed.
// NON-DESTRUCTIVE only: navigate / read / nav-click / dialog open+close / selector open+escape.
// NEVER create/edit/delete real data (prod discipline, testing-strategy.md).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = `verification-screenshots/PROD-functional-${TS}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((f) => setTimeout(f, ms));

const browser = await chromium.launch({ channel: "chrome", headless: process.env.HEADED ? false : true, args: process.env.HEADED ? ["--start-maximized"] : [] });
const ctx = await browser.newContext({
  storageState: "e2e/.auth/prod-user.json",
  viewport: process.env.HEADED ? null : { width: 1440, height: 900 },
});
const p = await ctx.newPage();
const cerr = [];
p.on("console", (m) => {
  if (m.type() === "error" && !/favicon|401|Failed to load resource|Unauthorized|devtools/i.test(m.text())) cerr.push(m.text());
});
const perr = [];
p.on("pageerror", (e) => perr.push(String(e)));
const clean = () => p.evaluate(() => document.querySelectorAll(".tour-overlay,.demo-chip").forEach((n) => n.remove())).catch(() => {});
const checks = {};
const bounced = [];
const go = async (path) => {
  await p.goto("https://firekaro.com" + path, { waitUntil: "networkidle", timeout: 40000 }).catch(() => {});
  await sleep(1200);
  await clean();
  if (/\/login/.test(p.url())) bounced.push(path);
};

// ---- auth confirm ----
await go("/fire-goals/dashboard");
checks.authed = !/\/login/.test(p.url());

// ---- obj-2: AccelerationCard (functional: ranked wins render + values) ----
checks.acceleration = await p.evaluate(() => {
  const t = (document.body.innerText || "").replace(/\s+/g, " ");
  return {
    present: /biggest achievable|get there faster|sooner|acceleration|faster to fire|biggest win/i.test(t),
    leverTokens: [...new Set((t.match(/\b(trim|risk|80CCD|save more|save ₹)/gi) || []).map((s) => s.toLowerCase()))].slice(0, 6),
    soonerToken: (t.match(/(\d+(\.\d+)?)\s*(years?|yrs?|months?)\s*(sooner|earlier|faster)/i) || ["(none)"])[0],
  };
});
await p.screenshot({ path: `${OUT}/dashboard-acceleration.png`, fullPage: true }).catch(() => {});

// functional interaction A: open + close the assumptions dialog (non-destructive — proves interactivity)
try {
  const cog = p.getByRole("button", { name: /adjust assumptions|assumptions/i }).first();
  if (await cog.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cog.click();
    await sleep(700);
    const open = await p.getByText(/assumptions/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    await p.keyboard.press("Escape");
    await sleep(400);
    checks.assumptionsDialog = open ? "opened+closed OK" : "clicked, panel not detected";
  } else checks.assumptionsDialog = "cog not found";
} catch (e) {
  checks.assumptionsDialog = "ERR: " + (e.message || "").split("\n")[0];
}

// ---- obj-3: readiness verdict (functional B: reach via nav-click → verdict renders) ----
let navResult = "(nav link not found)";
try {
  await go("/fire-goals/dashboard");
  const link = p.getByRole("link", { name: /can i retire|readiness/i }).first();
  if (await link.isVisible({ timeout: 4000 }).catch(() => false)) {
    await link.click();
    await sleep(1500);
    navResult = /\/readiness/.test(p.url()) ? "nav OK -> " + p.url() : "clicked, url=" + p.url();
  }
} catch (e) {
  navResult = "ERR: " + (e.message || "").split("\n")[0];
}
checks.readinessNav = navResult;
await go("/fire-goals/readiness");
checks.readiness = await p.evaluate(() => {
  const t = (document.querySelector("main,.v-main")?.innerText || document.body.innerText || "").replace(/\s+/g, " ");
  return {
    onPage: /\/readiness/.test(location.pathname),
    verdictToken: (t.match(/(ready now|ready at age|ready at|bridge[- ]limited|corpus short|not yet|on track|can('|’)?t (yet )?stop|short by)/i) || ["(none)"])[0],
    hasBridge: /bridge|liquid|locked|runway|accessible/i.test(t),
    ageToken: (t.match(/age \d{2,3}/i) || ["(no age)"])[0],
  };
});
await p.screenshot({ path: `${OUT}/readiness.png`, fullPage: true }).catch(() => {});

// ---- obj-1: tax-staleness banner — should be ABSENT for configured FY 2026-27 (correct) ----
await go("/tax-planning");
checks.taxStaleness = await p.evaluate(() => {
  const t = (document.body.innerText || "").replace(/\s+/g, " ");
  return {
    bannerPresent: /tax (rates|year|slabs).{0,50}(stale|unconfigured|last[- ]known|out of date|not configured)/i.test(t),
    note: "expected ABSENT for configured FY (banner only fires when live FY is unconfigured)",
  };
});
// functional interaction C: tax-year selector opens (non-destructive)
try {
  const sel = p.locator('.v-select:has-text("Tax year") .v-field, .v-select:has-text("year") .v-field').first();
  if (await sel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sel.click();
    await sleep(500);
    checks.taxYearSelector = await p.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((e) => e.textContent.trim()).slice(0, 5));
    await p.keyboard.press("Escape");
  } else checks.taxYearSelector = "selector not found";
} catch (e) {
  checks.taxYearSelector = "ERR: " + (e.message || "").split("\n")[0];
}
await p.screenshot({ path: `${OUT}/tax-planning.png`, fullPage: true }).catch(() => {});

const verdict =
  checks.authed && !bounced.length && !perr.length && checks.acceleration?.present && checks.readiness?.onPage
    ? "PASS"
    : "CHECK";
const report = { authed: checks.authed, account: "abhayfaircent@gmail.com", bounced, consoleErrors: cerr, pageErrors: perr, checks, screenshots: OUT, verdict };
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("VERDICT:", verdict);
await browser.close();
process.exit(verdict === "PASS" ? 0 : 1);

// Prod AUTHENTICATED functional sweep of the newly-deployed /fire-goals/drawdown (obj-4 #50).
// Uses the valid saved session (e2e/.auth/prod-user.json). NON-DESTRUCTIVE (navigate + read only).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = `verification-screenshots/PROD-drawdown-${TS}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((f) => setTimeout(f, ms));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ storageState: "e2e/.auth/prod-user.json", viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const cerr = [];
p.on("console", (m) => { if (m.type() === "error" && !/favicon|401|Failed to load resource|Unauthorized|devtools/i.test(m.text())) cerr.push(m.text()); });
const perr = [];
p.on("pageerror", (e) => perr.push(String(e)));
const clean = () => p.evaluate(() => document.querySelectorAll(".tour-overlay,.demo-chip").forEach((n) => n.remove())).catch(() => {});

await p.goto("https://firekaro.com/fire-goals/drawdown", { waitUntil: "networkidle", timeout: 40000 }).catch(() => {});
await sleep(1800); await clean();

const checks = await p.evaluate(() => {
  const bands = document.querySelector('[data-testid="withdrawal-bands"]');
  const seq = document.querySelector('[data-testid="sequence-risk"]');
  const t = (document.querySelector("main,.v-main")?.innerText || "").replace(/\s+/g, " ");
  return {
    bounced: /\/login/.test(location.pathname),
    onDrawdown: /\/drawdown/.test(location.pathname),
    bandsPresent: !!bands,
    bandsState: bands?.getAttribute("data-state") || null,
    seqPresent: !!seq,
    seqState: seq?.getAttribute("data-state") || null,
    // The fix: a data account must NOT hit the unplannable/false-alarm path.
    seqFalseAlarm: seq?.getAttribute("data-state") === "unplannable",
    withdrawRange: (t.match(/withdraw[^.]{0,80}/i) || ["(none)"])[0],
    seqVerdict: (t.match(/(plan holds up|runs short|bad market in your first|resilient|watch early years|lasts to age)[^.]{0,80}/i) || ["(none)"])[0],
    hasAnnualCheckin: /still on track|annual|since (you|last)|check-?in/i.test(t),
  };
});
await p.screenshot({ path: `${OUT}/drawdown.png`, fullPage: true }).catch(() => {});

const verdict =
  !checks.bounced && checks.onDrawdown && checks.bandsPresent && checks.seqPresent && !checks.seqFalseAlarm && !perr.length
    ? "PASS" : "CHECK";
const report = { account: "abhayfaircent@gmail.com", checks, consoleErrors: cerr, pageErrors: perr, screenshots: OUT, verdict };
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("VERDICT:", verdict);
await browser.close();
process.exit(verdict === "PASS" ? 0 : 1);

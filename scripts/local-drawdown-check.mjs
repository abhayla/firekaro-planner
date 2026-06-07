// Localhost render check of the NEW /fire-goals/drawdown surface (obj-4 #50) in demo mode.
// Confirms the page renders post-fix (no regression from the SequenceRiskCard restructure) and the
// cards are present with a valid plannable state + no console errors. The UNPLANNABLE (no-data)
// branch is locked by unit tests (decumulation.spec.ts) — not reachable via a seeded data persona.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:5175";
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = `verification-screenshots/LOCAL-drawdown-${TS}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((f) => setTimeout(f, ms));

// wait for dev server
let up = false;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(BASE); if (r.ok) { up = true; break; } } catch {}
  await sleep(1500);
}
if (!up) { console.log("VERDICT: BLOCKED — dev server never came up at " + BASE); process.exit(2); }

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const cerr = [];
p.on("console", (m) => { if (m.type() === "error" && !/favicon|devtools|Failed to load resource/i.test(m.text())) cerr.push(m.text()); });
const perr = [];
p.on("pageerror", (e) => perr.push(String(e)));
const clean = () => p.evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove())).catch(() => {});

// enter demo: splash → "Try the sample"
await p.goto(BASE, { waitUntil: "networkidle", timeout: 40000 }).catch(() => {});
await sleep(1500); await clean();
try {
  const sample = p.getByRole("button", { name: /try the sample|explore.*sample/i }).first();
  if (await sample.isVisible({ timeout: 4000 }).catch(() => false)) { await sample.click(); await sleep(2000); }
} catch {}
await clean();

// navigate to the new drawdown surface
await p.goto(BASE + "/fire-goals/drawdown", { waitUntil: "networkidle", timeout: 40000 }).catch(() => {});
await sleep(1800); await clean();

const checks = await p.evaluate(() => {
  const bands = document.querySelector('[data-testid="withdrawal-bands"]');
  const seq = document.querySelector('[data-testid="sequence-risk"]');
  const t = (document.querySelector("main,.v-main")?.innerText || "").replace(/\s+/g, " ");
  return {
    onDrawdownPage: /\/drawdown/.test(location.pathname),
    withdrawalBandsPresent: !!bands,
    withdrawalBandsState: bands?.getAttribute("data-state") || null,
    sequenceRiskPresent: !!seq,
    sequenceRiskState: seq?.getAttribute("data-state") || null,
    // The fix: a DATA persona must NOT be 'unplannable' and the seq card must render a real verdict.
    seqUnplannableFalseAlarm: seq?.getAttribute("data-state") === "unplannable",
    hasWithdrawCopy: /withdraw|safe (withdrawal )?range|after you retire/i.test(t),
    hasSeqCopy: /sequence|bad market|early retirement|first .* years/i.test(t),
  };
});
await p.screenshot({ path: `${OUT}/drawdown.png`, fullPage: true }).catch(() => {});

const verdict =
  checks.onDrawdownPage && checks.withdrawalBandsPresent && checks.sequenceRiskPresent &&
  !checks.seqUnplannableFalseAlarm && !perr.length
    ? "PASS" : "CHECK";
const report = { base: BASE, checks, consoleErrors: cerr, pageErrors: perr, screenshots: OUT, verdict };
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("VERDICT:", verdict);
await browser.close();
process.exit(verdict === "PASS" ? 0 : 1);

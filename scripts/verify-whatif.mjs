// Headed substance test for the What-If sandbox (#31 M2 deeper): moving a lever MUST
// recompute the FIRE output live. Run via PowerShell: node scripts/verify-whatif.mjs
import { chromium } from "@playwright/test";
const BASE = "http://localhost:5175";
const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
const dismiss = async () => {
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove())).catch(() => {});
};
let ok = false, before = "", after = "";
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const sample = page.getByRole("button", { name: /try the sample/i });
  await sample.waitFor({ state: "visible", timeout: 30000 });
  await sample.click();
  await page.locator(".seed-switcher-btn").waitFor({ state: "visible", timeout: 30000 });
  await page.goto(`${BASE}/fire-goals/what-if`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await dismiss();
  const corpusCard = page.locator(".delta-card").nth(1); // "Required corpus" card → whatIfFireNumber
  before = (await corpusCard.locator(".delta-card__value").innerText().catch(() => "")).trim();
  const thumbs = page.locator('[role="slider"]');
  const n = await thumbs.count();
  for (let i = 0; i < n; i++) {
    await thumbs.nth(i).focus().catch(() => {});
    for (let j = 0; j < 10; j++) await page.keyboard.press("ArrowRight").catch(() => {});
  }
  await page.waitForTimeout(900);
  after = (await corpusCard.locator(".delta-card__value").innerText().catch(() => "")).trim();
  ok = before !== "" && after !== "" && before !== after;
  await page.screenshot({ path: "verification-screenshots/whatif-recompute.png", fullPage: true });
} catch (e) { console.error("WHATIF_FAIL:", e.message?.split("\n")[0]); }
finally { await page.waitForTimeout(1000); await browser.close(); }
console.log(`What-If required-corpus: before="${before}"  after="${after}"`);
console.log(`recompute-on-lever-change: ${ok ? "✅ PASS" : "❌ FAIL"}   page errors: ${errs.length ? JSON.stringify(errs) : "none"}`);
process.exit(ok && errs.length === 0 ? 0 : 1);

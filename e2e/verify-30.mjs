// gh-issue #30 verification: reverse FIRE solver UI on /fire-goals/what-if.
// Asserts the "Retire by age" panel renders, reads the required monthly SIP, lowers the target
// age via the slider, and confirms the required SIP INCREASES (a lower age → less time → higher SIP).
// Headless bypass for the hung MCP (project_mcp_browser_bypass). Loads the Sharmas sample.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5175";
const OUT = "verify-30";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push("PAGEERR:" + e.message.slice(0, 200)));

const hydrate = async () => {
  await page.waitForSelector("#app", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1600);
};

// Parse "₹1.23 L" / "₹45.6 K" / "₹2.5 Cr" / "+₹..." → number of rupees.
const parseCompact = (s) => {
  if (!s) return NaN;
  const m = String(s).replace(/[₹,\s+]/g, "").match(/^(-?[\d.]+)(Cr|L|K)?$/i);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  const u = (m[2] || "").toLowerCase();
  return u === "cr" ? n * 1e7 : u === "l" ? n * 1e5 : u === "k" ? n * 1e3 : n;
};

const readSip = () =>
  page.locator('[data-testid="retire-required-sip"]').innerText().catch(() => "");
const readAge = () =>
  page.locator('[data-testid="retire-target-age"]').innerText().catch(() => "");

// 1. Enter the app via the splash sample, dismiss the tour overlay.
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
await hydrate();
const sample = page.getByRole("button", { name: /try the sample/i }).first();
if (await sample.isVisible().catch(() => false)) {
  await sample.click().catch(() => {});
  await page.waitForTimeout(1600);
}
await page.keyboard.press("Escape").catch(() => {});
const skip = page.getByRole("button", { name: /skip tour|skip|close|got it/i }).first();
if (await skip.isVisible().catch(() => false)) {
  await skip.click().catch(() => {});
  await page.waitForTimeout(600);
}

// 2. Navigate to the What-If sandbox.
await page.goto(BASE + "/fire-goals/what-if", { waitUntil: "networkidle" }).catch(() => {});
await hydrate();

const cardVisible = await page
  .locator('[data-testid="retire-by-age-card"]')
  .isVisible()
  .catch(() => false);

await page.screenshot({ path: `${OUT}/what-if-retire-by-age.png`, fullPage: true });

// 3. Read the BEFORE state.
const ageBefore = (await readAge()).trim();
const sipBeforeText = (await readSip()).trim();
const addlBefore = (await page.locator('[data-testid="retire-additional-sip"]').innerText().catch(() => "")).trim();
const onTrackBefore = (await page.locator('[data-testid="retire-ontrack-chip"]').innerText().catch(() => "")).trim();
const sipBefore = parseCompact(sipBeforeText);

// 4. Lower the target age via the slider. Vuetify exposes a focusable thumb (role="slider");
//    ArrowDown/ArrowLeft decrements by step (1 year). Try the thumb's inner element first, then
//    the role="slider" node, and verify the age actually moved (don't trust the keypress alone).
let sliderDriven = false;
const slider = page.locator('[data-testid="retire-age-slider"]');
const thumbCandidates = [
  slider.locator('[role="slider"]').first(),
  slider.locator(".v-slider-thumb").first(),
  slider.locator(".v-slider-thumb__surface").first(),
];
for (const thumb of thumbCandidates) {
  if (!(await thumb.isVisible().catch(() => false))) continue;
  await thumb.focus().catch(() => {});
  await thumb.click({ force: true }).catch(() => {}); // ensure it holds focus
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowDown").catch(() => {});
    await page.waitForTimeout(120);
  }
  const probe = (await readAge()).trim();
  if (Number(probe) < 47 || probe !== "47") {
    // moved at all (relative to a typical default) — but the authoritative check is before/after below
  }
  sliderDriven = true;
  // If the age changed from its initial read, we're done driving.
  if (Number(probe) !== Number(ageBefore)) break;
}
await page.waitForTimeout(400);

// 5. Read the AFTER state.
const ageAfter = (await readAge()).trim();
const sipAfterText = (await readSip()).trim();
const addlAfter = (await page.locator('[data-testid="retire-additional-sip"]').innerText().catch(() => "")).trim();
const sipAfter = parseCompact(sipAfterText);
await page.screenshot({ path: `${OUT}/what-if-retire-by-age-lower-age.png`, fullPage: true });

const ageDecreased = Number(ageAfter) < Number(ageBefore);
const sipIncreased = Number.isFinite(sipBefore) && Number.isFinite(sipAfter) && sipAfter > sipBefore;

const result = {
  pass:
    cardVisible &&
    sliderDriven &&
    ageDecreased &&
    sipIncreased &&
    consoleErrors.length === 0,
  cardVisible,
  sliderDriven,
  before: { age: ageBefore, requiredSIP: sipBeforeText, additionalSIP: addlBefore, onTrack: onTrackBefore },
  after: { age: ageAfter, requiredSIP: sipAfterText, additionalSIP: addlAfter },
  reactivity: {
    ageDecreased,
    sipIncreased,
    sipBeforeRupees: sipBefore,
    sipAfterRupees: sipAfter,
  },
  consoleErrorCount: consoleErrors.length,
  consoleErrors,
  screenshots: [`${OUT}/what-if-retire-by-age.png`, `${OUT}/what-if-retire-by-age-lower-age.png`],
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.pass ? 0 : 1);

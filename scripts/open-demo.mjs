/**
 * open-demo.mjs — launches the v5 MVP in a headed maximized Chromium
 * window, loads the Sharmas sample seed, lands on the Dashboard, and
 * keeps the browser open for hands-on verification.
 *
 * Usage:
 *   cd mvp && node scripts/open-demo.mjs
 *
 * Expects the dev server to already be running on http://localhost:5175
 * (start it with `npm run dev` in another terminal first, or let this
 * script's parent shell start it).
 *
 * Close the browser window to exit the script.
 */
import { chromium } from "@playwright/test";

const URL = process.env.MVP_URL || "http://localhost:5175";

async function waitForServer(url, maxSeconds = 60) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxSeconds) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return true;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

console.log(`[open-demo] waiting for ${URL} ...`);
const ready = await waitForServer(URL);
if (!ready) {
  console.error(`[open-demo] dev server did not respond at ${URL} within 60s.`);
  console.error(`[open-demo] start it with: cd mvp && npm run dev`);
  process.exit(1);
}
console.log(`[open-demo] dev server up.`);

const browser = await chromium.launch({
  headless: false,
  args: ["--start-maximized"],
});

const context = await browser.newContext({
  viewport: null, // use the actual maximized window size
});
const page = await context.newPage();

console.log(`[open-demo] navigating to ${URL} ...`);
await page.goto(URL, { waitUntil: "networkidle" });

// Land on Splash → click "Try the sample" to load Sharmas seed.
const sampleBtn = page.getByRole("button", { name: /Try the sample/i });
if (await sampleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  console.log(`[open-demo] clicking "Try the sample" to load Sharmas seed ...`);
  await sampleBtn.click();
  await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  console.log(`[open-demo] landed on ${page.url()}`);
} else {
  console.log(`[open-demo] Splash sample-button not visible — already on a route?`);
}

console.log(`
[open-demo] BROWSER IS OPEN — navigate around freely.

  Routes to try:
   - /fire-goals/dashboard   (you're here)
   - /preferences            (10-section sticky-nav settings)
   - /investments/overview   (NPS planning + EPF/VPF threshold cards)
   - /investments/buckets    (NEW — time-horizon buckets)
   - /fire-goals/stress-test (NEW — 10 stress scenarios)
   - /estate-planning        (NEW — 7-step checklist)
   - /tax-planning           (decision rule + derived deductions)
   - /fire-goals/what-if     (6 saved scenarios)
   - /liabilities/loans      (coBorrowers selector on home loans)
   - /expenses/recurring     (kind selector)

  Close this browser window to exit the script.
`);

// Wait for the user to close the browser.
await new Promise((resolve) => {
  browser.on("disconnected", resolve);
});
console.log(`[open-demo] browser closed. Exiting.`);
process.exit(0);

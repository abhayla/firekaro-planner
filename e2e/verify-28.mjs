// gh-issue #28 verification: /preferences in demo mode must NOT fetch /api/comms/consent (no console error).
import { chromium } from "@playwright/test";
const BASE = "http://localhost:5175";
const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
const consoleErrors = [];
const failedReqs = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
});
page.on("requestfailed", (r) => failedReqs.push(r.url()));
const hydrate = async () => {
  await page.waitForSelector("#app", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
};

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
await hydrate();
const sample = page.getByRole("button", { name: /try the sample/i }).first();
if (await sample.isVisible().catch(() => false)) {
  await sample.click().catch(() => {});
  await page.waitForTimeout(1500);
}
await page.keyboard.press("Escape").catch(() => {});

await page.goto(BASE + "/preferences", { waitUntil: "networkidle" }).catch(() => {});
await hydrate();
await page.waitForTimeout(1500); // give any (now-skipped) consent fetch time to NOT fire

const consentErrors = [
  ...consoleErrors.filter((t) => /comms\/consent|ERR_CONNECTION_REFUSED|3100/i.test(t)),
  ...failedReqs.filter((u) => /comms\/consent/i.test(u)),
];
console.log(
  JSON.stringify(
    {
      pass: consentErrors.length === 0,
      consentRelatedErrors: consentErrors,
      totalConsoleErrors: consoleErrors.length,
      allConsoleErrors: consoleErrors,
    },
    null,
    2,
  ),
);
await browser.close();

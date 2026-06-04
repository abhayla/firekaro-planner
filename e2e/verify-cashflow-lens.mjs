// #23 follow-on (Option B): under a member lens, the financial-health cashflow must use HOUSEHOLD
// income (not the lensed member's) — else a lower-earner lens shows a spurious negative surplus.
import { chromium } from "@playwright/test";
const BASE = "http://localhost:5175";
const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 140)));
page.on("pageerror", (e) => errors.push("PAGEERR:" + e.message.slice(0, 140)));
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

// read the HOUSEHOLD cashflow surplus first (no lens)
await page.goto(BASE + "/financial-health/cash-flow", { waitUntil: "networkidle" }).catch(() => {});
await hydrate();
const grabIncome = async () => {
  const t = await page.locator("body").innerText().catch(() => "");
  const m = t.match(/Annual income[\s\S]{0,40}?₹\s*([\d.]+)\s*(Cr|L|K)?/i);
  return m ? `${m[1]}${m[2] || ""}` : "(?)";
};
const householdIncome = await grabIncome();

// switch to a single member via the AppBar "Viewing as" select
const select = page.locator(".v-select").filter({ hasText: "Whole household" }).first();
let switched = false,
  member = "";
if (await select.isVisible().catch(() => false)) {
  await select.click({ force: true });
  await page.waitForTimeout(700);
  const opt = page.locator(".v-overlay__content").last().locator("[role='option'], .v-list-item").nth(1);
  member = (await opt.innerText().catch(() => "")).trim().slice(0, 20);
  await opt.click().catch(() => {});
  await page.waitForTimeout(1400);
  switched = true;
}
await page.goto(BASE + "/financial-health/cash-flow", { waitUntil: "networkidle" }).catch(() => {});
await hydrate();
const lensedIncome = await grabIncome();
const bodyText = await page.locator("body").innerText().catch(() => "");
// Coherence: the displayed income under the member lens must equal the HOUSEHOLD income (Option B),
// and there must be no negative-surplus artifact (a leading "-₹" on the surplus metric).
const negativeSurplus = /surplus[\s\S]{0,40}?-\s*₹/i.test(bodyText);
await page.screenshot({ path: "verify-27/cashflow-member-lens.png", fullPage: true });

console.log(
  JSON.stringify(
    {
      switched,
      member,
      householdIncome,
      lensedIncome,
      incomeIsHousehold: householdIncome === lensedIncome,
      spuriousNegativeSurplus: negativeSurplus,
      consoleErrors: errors,
    },
    null,
    2,
  ),
);
await browser.close();

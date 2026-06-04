// Headed B test (#31 M3): drive a member entry through the UI in
// VITE_USE_SERVER_ADAPTER=on mode; the ServerAdapter write-behind cache must flush it
// to /api/planner → Supabase. Verified afterwards by an independent curl GET.
// Prereq: backend on :3100, :5175 restarted with the ServerAdapter flag, dev user cleared.
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
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000); // ServerAdapter session resolve + hydrate from API
  await dismiss();
  const begin = page.getByRole("button", { name: /begin wizard/i });
  if (await begin.isVisible({ timeout: 8000 }).catch(() => false)) await begin.click();
  else await page.goto(`${BASE}/wizard/profile`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/wizard/, { timeout: 15000 }).catch(() => {});
  await dismiss();
  await page.getByLabel("Setup mode").click({ force: true });
  await page.getByRole("option", { name: "Solo" }).click();
  await page.getByLabel(/household name/i).fill("ServerAdapter Chain Test");
  const ec = page.locator(".person-card").first();
  await ec.getByLabel("Name").fill("B Chain Test");
  await ec.locator('[aria-label="Edit details"]').click().catch(() => {});
  await ec.getByLabel("Date of birth").fill("1985-01-01");
  await ec.getByTestId("member-retire-age").locator("input").fill("55");
  await ec.getByTestId("member-plan-to-age").locator("input").fill("90");
  await page.getByRole("button", { name: /save profile/i }).click();
  await page.waitForTimeout(5000); // let the ServerAdapter write-behind cache flush to the API
  await page.screenshot({ path: "verification-screenshots/serveradapter-wizard.png", fullPage: true });
  console.log("UI member entered in ServerAdapter mode; flush window elapsed.");
} catch (e) { console.error("SA_FAIL:", e.message?.split("\n")[0]); }
finally { await page.waitForTimeout(1000); await browser.close(); }
console.log("page errors:", errs.length ? JSON.stringify(errs) : "none");

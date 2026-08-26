import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

// T-376 (#165) rule 24/26 verification: Sharmas + a ₹1 Cr "general"-kind planned
// goal moves the FIRE headline. Screenshots BEFORE/AFTER into
// verification-screenshots/T-376-*/. Scratch verification spec — not part of the
// regression suite; safe to delete after the PR evidence is captured.
test("T-376: general-kind planned goal moves the FIRE headline (before/after)", async ({ page }) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = `verification-screenshots/T-376-${ts}`;
  mkdirSync(dir, { recursive: true });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Explore with sample data").click();
  await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const tour = page.locator(".tour-overlay");
  if (await tour.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/01-before-dashboard.png`, fullPage: true });
  const beforeText = await page.locator("body").innerText();

  await page.goto("/expenses/planned", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/02-before-planned-page.png`, fullPage: true });

  await page.getByLabel("Label *").fill("House upgrade (T-376 verify)");
  await page.getByLabel("Today's ₹ *").fill("10000000");
  await page.getByLabel("Target year *").fill(String(new Date().getFullYear() + 6));
  await page.screenshot({ path: `${dir}/03-form-filled.png`, fullPage: true });
  await page.locator("button:has(.mdi-plus)").first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/04-after-planned-page.png`, fullPage: true });

  await page.goto("/fire-goals/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/05-after-dashboard.png`, fullPage: true });
  const afterText = await page.locator("body").innerText();

  console.log("SCREENSHOTS_DIR:", dir);
  const beforeLines = beforeText.split("\n").filter((l) => /FIRE|age \d\d|₹/i.test(l)).slice(0, 12);
  const afterLines = afterText.split("\n").filter((l) => /FIRE|age \d\d|₹/i.test(l)).slice(0, 12);
  console.log("BEFORE_LINES:", JSON.stringify(beforeLines));
  console.log("AFTER_LINES:", JSON.stringify(afterLines));

  expect(beforeText).not.toEqual(afterText);
});

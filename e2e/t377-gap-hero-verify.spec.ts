import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * T-377 (QN-2) rule 24/26/31/32 verification for the gap hero.
 *
 * Exercises the REAL screen, not just its render: the four solver numbers, the live
 * retirement-age slider (interaction — rule 32), the "Set as my target" persist path, the
 * member lens, and the cross-page coherence of the "need" figure with the Goals screen
 * (rule 26). Screenshots at 1280 and 390 land in the verification-screenshots/T-377-<ts> folder.
 *
 * Scratch verification spec — evidence for the PR, not part of the regression suite.
 */

const DIR = `verification-screenshots/T-377-${new Date().toISOString().replace(/[:.]/g, "-")}`;

async function enterSample(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("Explore with sample data").click();
  await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const tour = page.locator(".tour-overlay");
  if (await tour.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  // The product tour can survive Escape; strip it so it cannot intercept pointer events
  // (the same defence e2e/member-lens-sweep.spec.ts uses).
  await page.evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove()));
  await page.waitForTimeout(800);
}

/** Parse an INR-compact string ("₹2.43 L", "₹10.60 Cr") to a number. */
function parseCompact(text: string): number {
  const m = text.replace(/[,\s]/g, "").match(/₹?([\d.]+)(Cr|L|K)?/i);
  if (!m) return NaN;
  const n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  return unit === "cr" ? n * 1e7 : unit === "l" ? n * 1e5 : unit === "k" ? n * 1e3 : n;
}

test("T-377: the gap hero shows four honest numbers and the slider actually recomputes", async ({ page }) => {
  mkdirSync(DIR, { recursive: true });
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await enterSample(page);

  const hero = page.locator('[data-testid="fire-hero"]');
  await expect(hero).toBeVisible();
  await page.screenshot({ path: `${DIR}/01-dashboard-1280.png`, fullPage: true });

  // ---- rule 24: all four solver numbers render ----
  const age = page.locator('[data-testid="fire-hero-age"]');
  const need = page.locator('[data-testid="fire-hero-need"]');
  const have = page.locator('[data-testid="hero-have"]');
  const gap = page.locator('[data-testid="hero-gap"]');
  const doThis = page.locator('[data-testid="hero-required-monthly"]');
  for (const l of [age, need, have, gap, doThis]) await expect(l).toBeVisible();

  const targetBefore = Number((await age.innerText()).trim());
  expect(Number.isFinite(targetBefore), "the headline must be a real age").toBe(true);
  expect(targetBefore).toBeGreaterThanOrEqual(40);
  expect(targetBefore).toBeLessThanOrEqual(70);

  const needText = await need.innerText();
  expect(needText, "both today's money AND the nominal figure are shown").toMatch(/today's money/);
  expect(needText).toMatch(/in \d{4}/);

  const doThisBefore = await doThis.innerText();
  console.log("HERO_BEFORE:", JSON.stringify({ targetBefore, needText, doThisBefore, gap: await gap.innerText() }));

  // ---- rule 32: the slider is FUNCTIONAL, not just rendered ----
  const slider = page.locator('[data-testid="hero-age-slider"]').locator("[role='slider']").first();
  await expect(slider).toBeVisible();
  await slider.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);

  const targetAfter = Number((await age.innerText()).trim());
  const doThisAfter = await doThis.innerText();
  console.log("HERO_AFTER:", JSON.stringify({ targetAfter, doThisAfter }));
  expect(targetAfter, "dragging the slider must move the headline age").toBeGreaterThan(targetBefore);
  expect(
    doThisAfter,
    `retiring later must change the required monthly amount (was ${doThisBefore})`,
  ).not.toBe(doThisBefore);
  await page.screenshot({ path: `${DIR}/02-slider-dragged-1280.png`, fullPage: true });

  // The "Set as my target" CTA appears only once the user has actually moved the slider.
  await expect(page.locator('[data-testid="hero-set-target"]')).toBeVisible();

  // ---- the retained honesty surfaces (non-removable) ----
  await expect(page.locator('[data-testid="fire-hero-pace"]'), "current-pace age is demoted, not deleted").toBeVisible();
  await expect(
    page.locator('[data-testid="fire-hero-confidence-subline"]'),
    "#18 confidence band survives",
  ).toBeVisible();
  await expect(page.locator('[data-testid="hero-kpi-corpus"]')).toBeVisible();

  // Reset back to the saved plan before the cross-page check.
  await page.locator('[data-testid="hero-reset-target"]').click();
  await page.waitForTimeout(600);
  expect(Number((await age.innerText()).trim())).toBe(targetBefore);

  // ---- rule 26: the hero "need" agrees with the Goals screen FIRE number ----
  const heroNeed = parseCompact((await need.innerText()).split("in today's money")[0]);
  await page.goto("/fire-goals/goals", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/03-goals-1280.png`, fullPage: true });
  const goalsText = await page.locator("body").innerText();
  const goalsFire = (goalsText.match(/₹\s?[\d.]+\s?(Cr|L)/g) ?? []).map(parseCompact);
  const matched = goalsFire.find((v) => Math.abs(v - heroNeed) / Math.max(1, heroNeed) < 0.02);
  const match = matched !== undefined;
  console.log(
    "RULE26:",
    JSON.stringify({ heroNeed, matched: matched ?? null, allGoalsFigures: goalsFire, match }),
  );
  expect(match, `the Goals screen must show the same FIRE number as the hero (${heroNeed})`).toBe(true);

  // ---- 390px (mobile) ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/fire-goals/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // The product tour re-arms on a fresh navigation — strip it so the mobile evidence shows
  // the hero itself, not the tour card sitting on top of it.
  await page.evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove()));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/04-dashboard-390.png`, fullPage: true });
  await expect(page.locator('[data-testid="hero-age-slider"]'), "the slider is reachable at 390px").toBeVisible();
  await expect(page.locator('[data-testid="hero-gap-tiles"]')).toBeVisible();
  await expect(page.locator('[data-testid="hero-required-monthly"]')).toBeVisible();

  console.log("SCREENSHOTS_DIR:", DIR);
  const newErrors = consoleErrors.filter((e) => !/favicon|401|Failed to load resource/i.test(e));
  console.log("CONSOLE_ERRORS:", JSON.stringify(newErrors));
  expect(newErrors, "no new console errors introduced by the hero").toEqual([]);
});

test("T-377: the member lens keeps the household caveat and shows the member's own number", async ({ page }) => {
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterSample(page);

  // The app-wide "Viewing as" control — driven exactly like e2e/member-lens-sweep.spec.ts.
  const viewingSelect = page.locator(".v-select").filter({ has: page.locator(".mdi-eye") });
  await expect(viewingSelect, "the Viewing-as control must exist on the dashboard").toBeVisible();
  await viewingSelect.click();
  await page.waitForTimeout(400);
  const opts = page.locator('.v-overlay-container [role="option"]');
  await opts.first().waitFor({ state: "visible", timeout: 5000 });
  const labels = (await opts.allInnerTexts()).map((l) => l.trim()).filter(Boolean);
  console.log("VIEWING_OPTIONS:", JSON.stringify(labels));
  // The first option is always "Whole household"; pick the first real adult after it.
  const memberLabel = labels[1];
  expect(memberLabel, "the sample household must expose at least one member lens").toBeTruthy();
  await page.getByRole("option", { name: memberLabel, exact: true }).click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${DIR}/05-member-lens-1280.png`, fullPage: true });
  await expect(
    page.locator('[data-testid="fire-hero-member-caveat"]'),
    "household stays primary — the member caveat is non-removable",
  ).toBeVisible();
  await expect(page.locator('[data-testid="hero-required-monthly"]')).toBeVisible();
  console.log("SCREENSHOTS_DIR:", DIR);
});

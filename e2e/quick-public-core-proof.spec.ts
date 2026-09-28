import { test, expect } from "@playwright/test";

/**
 * #187 CORE PROOF — a visitor with NO session reaches `/quick`, answers the ten cards and sees a
 * FIRE age, in SERVER mode (`VITE_USE_SERVER_ADAPTER=on`, `VITE_DEV_BYPASS` deliberately OFF so
 * `GET /api/planner/me` genuinely returns 401 and main.ts installs AnonymousAuthProvider).
 *
 * Run: npx playwright test --config=playwright.quick-public.config.ts
 * That config starts the backend AND a Vite dev server WITHOUT the dev-bypass flag.
 */

const PERSONA = { age: 25, targetAge: 55, monthlySpend: 25_000, monthlyIncome: 50_000 };

test("a signed-out visitor completes /quick and sees a FIRE age (server mode)", async ({
  browser,
}) => {
  // Fresh context = no cookies, no session, no localStorage carried in.
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  // 1. The backend really has no session for us.
  const me = await page.request.get("http://localhost:3100/api/planner/me");
  expect(me.status(), "GET /api/planner/me with no cookies must be 401").toBe(401);

  // 2. /quick renders card 1 — NOT the login page (the bug this fixes: router/index.ts
  //    used to redirect every unauthenticated visitor to /login).
  await page.goto("http://localhost:5175/quick", { waitUntil: "networkidle" });
  expect(page.url(), "must not have been redirected to /login").toContain("/quick");
  await expect(page.locator('[data-testid="quick-question"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid="quick-question"]')).toContainText("Gut feel");

  // 3. Answer the ten cards as a ₹6L/yr, age-25 persona.
  const next = async () => {
    await page.locator('[data-testid="quick-next"]').click();
    await page.waitForTimeout(150);
  };
  const lakh = async (testid: string, rupees: number) => {
    await page.locator(`[data-testid="${testid}"] input`).fill(String(rupees / 1e5));
    await expect(page.locator(`[data-testid="${testid}-preview"]`)).not.toHaveText("—");
  };

  await page.locator(`[data-testid="quick-guess-${5e7}"]`).click();
  await next(); // 1 gut feel
  await page.locator('[data-testid="quick-age"] input').fill(String(PERSONA.age));
  await page.locator('[data-testid="quick-target-age"] input').fill(String(PERSONA.targetAge));
  await next(); // 2 you
  await lakh("quick-spend", PERSONA.monthlySpend);
  await lakh("quick-income", PERSONA.monthlyIncome);
  await next(); // 3 spend + take-home
  await lakh("quick-corpus", 2e5);
  await next(); // 4 investments
  await lakh("quick-sip", 5000);
  await next(); // 5 monthly investing
  await next(); // 6 spouse (none)
  await next(); // 7 kids (none)
  await next(); // 8 kids' costs (none)
  await next(); // 9 big purchase (none)
  await next(); // 10 home loan (none) -> finish

  // 4. A FIRE age renders.
  await expect(page.locator('[data-testid="quick-result"]')).toBeVisible({ timeout: 25000 });
  const heroText = await page.locator('[data-testid="quick-result"]').innerText();
  const ageMatch = heroText.match(/\b(\d{2})\b(?=[^\n]*)/);
  expect(ageMatch, `no FIRE age found in the result:\n${heroText.slice(0, 800)}`).not.toBeNull();
  // The hero renders "…at <age>" / "age <age>" — assert a plausible retirement age is on screen.
  expect(heroText).toMatch(/\b(2[5-9]|[3-8]\d|9[0-9])\b/);
  console.log("[core-proof] result text >>>\n" + heroText.slice(0, 1200));

  // 5. Still signed out, and still gated everywhere else.
  await page.goto("http://localhost:5175/fire-goals/dashboard", { waitUntil: "networkidle" });
  expect(page.url(), "the planner must STILL be gated for a signed-out visitor").toContain("/login");

  const newErrors = consoleErrors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e));
  console.log("[core-proof] console errors:", JSON.stringify(newErrors));

  await context.close();
});

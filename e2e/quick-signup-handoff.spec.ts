import { test, expect } from "@playwright/test";

/**
 * #187 step 2 — the sign-up handoff. A GUEST completes /quick, then signs in, and the dashboard
 * shows the SAME FIRE age; proven independently by `GET /api/planner/household` (rule 25), never by
 * reading the UI back to itself.
 *
 * Run: npx playwright test --config=playwright.quick-handoff.config.ts
 * Two frontends against one backend: :5175 with NO dev-bypass (a real guest, 401 at /me) and :5176
 * with dev-bypass on (the signed-in user). Real sign-in is a same-origin session swap; two ports is
 * how that is reproduced without an interactive Google OAuth round trip, so the spec copies the
 * guest's localStorage across the port boundary that the real app does not have.
 */

const PERSONA = { age: 25, targetAge: 55, monthlySpend: 25_000, monthlyIncome: 50_000, sip: 5_000 };

test("a guest's /quick answers carry into the account after sign-in (rule 25)", async ({ browser }) => {
  // Start from a clean server side: "the account is empty" is the precondition claimGuestPlan needs.
  const api = await browser.newContext();
  const wipe = await api.request.delete("http://localhost:3100/api/planner/all", {
    headers: { "x-dev-bypass": "true" },
  });
  expect([200, 204, 404]).toContain(wipe.status());
  await api.close();

  const context = await browser.newContext();
  const page = await context.newPage();

  // ---- 1. As a GUEST (no session): complete /quick on the no-bypass frontend. ----
  await page.goto("http://localhost:5175/quick", { waitUntil: "networkidle" });
  expect(page.url()).toContain("/quick");
  await expect(page.locator('[data-testid="quick-question"]')).toBeVisible({ timeout: 20000 });

  const next = async () => {
    await page.locator('[data-testid="quick-next"]').click();
    await page.waitForTimeout(150);
  };
  const lakh = async (testid: string, rupees: number) => {
    await page.locator(`[data-testid="${testid}"] input`).fill(String(rupees / 1e5));
    await expect(page.locator(`[data-testid="${testid}-preview"]`)).not.toHaveText("—");
  };

  await page.locator(`[data-testid="quick-guess-${5e7}"]`).click();
  await next();
  await page.locator('[data-testid="quick-age"] input').fill(String(PERSONA.age));
  await page.locator('[data-testid="quick-target-age"] input').fill(String(PERSONA.targetAge));
  await next();
  await lakh("quick-spend", PERSONA.monthlySpend);
  await lakh("quick-income", PERSONA.monthlyIncome);
  await next();
  await lakh("quick-corpus", 2e5);
  await next();
  await lakh("quick-sip", PERSONA.sip);
  for (let i = 0; i < 6; i++) await next();

  await expect(page.locator('[data-testid="quick-result"]')).toBeVisible({ timeout: 25000 });
  const guestResult = await page.locator('[data-testid="quick-result"]').innerText();
  const guestFireAge = guestResult.match(/At today's pace you'd get there at (\d+)/)?.[1] ?? null;
  console.log("[handoff] guest pace-age:", guestFireAge);

  // The guest's plan really is in the anon namespace.
  const anonKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("firekaro-mvp:anon:")),
  );
  console.log("[handoff] anon keys after quick:", JSON.stringify(anonKeys));
  expect(anonKeys).toContain("firekaro-mvp:anon:household");

  // The signed-out visitor is offered the sign-up handoff, not a dead end.
  await expect(page.locator('[data-testid="quick-save-plan"]')).toBeVisible();

  // ---- 2. "Sign in": boot the authenticated app with the guest's blob present. ----
  const anonBlob = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("firekaro-mvp:anon:")) out[k] = localStorage.getItem(k)!;
    }
    return out;
  });
  page.on("console", (m) => {
    if (/boot|guest|claim/i.test(m.text())) console.log("[browser]", m.type(), m.text());
  });
  await page.goto("http://localhost:5176/login", { waitUntil: "domcontentloaded" });
  await page.evaluate((blob: Record<string, string>) => {
    for (const [k, v] of Object.entries(blob)) localStorage.setItem(k, v);
  }, anonBlob);

  // main.ts resolves the dev-bypass session, hydrates from the (empty) server, then
  // claimGuestPlan() carries the guest plan up.
  await page.goto("http://localhost:5176/fire-goals/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(6000); // let the write-behind ServerAdapter flush its PUTs

  // ---- 3. INDEPENDENT proof (rule 25): the server holds the quick answers. ----
  const res = await page.request.get("http://localhost:3100/api/planner/household", {
    headers: { "x-dev-bypass": "true" },
  });
  expect(res.ok(), `GET /api/planner/household -> ${res.status()}`).toBeTruthy();
  const raw = await res.text();
  console.log("[handoff] raw household response:", raw.slice(0, 400));
  const household = JSON.parse(raw).data;
  const authedKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("firekaro-mvp:")));
  console.log("[handoff] localStorage keys on :5176:", JSON.stringify(authedKeys));
  console.log(
    "[handoff] server household:",
    JSON.stringify({
      members: household.members?.length,
      investments: household.investments?.length,
      quickSource: (household.investments ?? []).filter(
        (i: { quickSource?: boolean }) => i.quickSource === true,
      ).length,
    }),
  );
  expect(household.members?.length, "the account must now hold the guest's member").toBeGreaterThan(0);
  const quickInvestments = (household.investments ?? []).filter(
    (i: { quickSource?: boolean }) => i.quickSource === true,
  );
  expect(quickInvestments.length, "the quick investment line must have carried over").toBeGreaterThan(0);

  // ---- 4. The dashboard shows the SAME number the guest saw. ----
  const dashText = await page.locator("body").innerText();
  const dashFireAge = dashText.match(/At today's pace you'd get there at (\d+)/)?.[1] ?? null;
  console.log("[handoff] dashboard pace-age:", dashFireAge);
  expect(dashFireAge, "the dashboard must render a pace age").not.toBeNull();
  expect(dashFireAge).toBe(guestFireAge);

  await context.close();
});

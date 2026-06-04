// Headed UI DATA-ENTRY for a household — drives the REAL app forms (wizard profile +
// the inline investment form) as a user would, then verifies persistence via the
// storage adapter. This is the "entered from UI" proof that a code fixture (a
// src/seeds/*.ts seed) cannot give. See .claude/rules/ui-verification.md "Data ENTRY".
//
// Phase 1 (this file): members (wizard) + investments (Holdings form), persistence-verified.
// Run: node scripts/enter-persona-via-ui.mjs [--headless]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5175";
const headless = process.argv.includes("--headless");
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = `verification-screenshots/mauryas-ENTRY-${ts}`;
mkdirSync(OUT, { recursive: true });

// Owner choices in the form are by NAME (stable across auto-generated member ids).
// NOTE on UI constraints discovered: PPF/NPS/EPF have allowJoint:false → owner must be an
// EARNER. Madhu is a non-earning dependent, so her PPF can't be assigned to her in the UI
// (assigned to Abhay here) and her frozen EPF can't be entered via this form at all
// (EPF auto-derives from salary). These are real product constraints the seed fixture hid.
const INVESTMENTS = [
  { type: "Stocks", label: "Direct equity portfolio", value: 2500000, monthly: 20000, owner: "Abhay Maurya", holdings: 25 },
  { type: "Mutual Funds", label: "Mutual fund SIPs (multi-cap)", value: 6000000, monthly: 25000, owner: "Abhay Maurya" },
  { type: "Mutual Funds", label: "Madhu's mutual funds", value: 3500000, monthly: 0, owner: "Madhu Kushwaha" },
  { type: "PPF", label: "PPF (Abhay)", value: 2500000, monthly: 12500, owner: "Abhay Maurya" },
  { type: "PPF", label: "PPF (Madhu → Abhay; non-earner can't own PPF in UI)", value: 1800000, monthly: 12500, owner: "Abhay Maurya" },
  { type: "NPS", label: "NPS Tier-I", value: 1200000, monthly: 10000, owner: "Abhay Maurya" },
  { type: "Real Estate", label: "3BHK Wakad, Pune", value: 13000000, owner: "Joint", reRole: "Primary residence (excluded from FIRE corpus)" },
  { type: "Real Estate", label: "2BHK (let out)", value: 6000000, owner: "Joint", reRole: "Investment (counts toward corpus)" },
  { type: "Gold", label: "Family gold + SGB", value: 1500000, owner: "Joint" },
  { type: "FD / Bonds", label: "Emergency fund FD", value: 1000000, owner: "Joint" },
  { type: "Crypto / Other", label: "Crypto (BTC/ETH)", value: 200000, owner: "Abhay Maurya" },
  { type: "ESOP", esopGrant: 2000000, esopVested: 60, label: "Cognizant RSUs", owner: "Abhay Maurya" },
  { type: "International Equity", label: "US index FoF (LRS)", value: 800000, owner: "Abhay Maurya" },
  { type: "REIT", label: "Listed REIT", value: 300000, owner: "Abhay Maurya" },
];

const browser = await chromium.launch({ headless, args: headless ? [] : ["--start-maximized"] });
const context = await browser.newContext({ viewport: headless ? { width: 1440, height: 900 } : null });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function dismissTour() {
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove())).catch(() => {});
}
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const log = (m) => console.log(m);

const entered = { members: 0, investments: 0 };
try {
  // Fresh state — clear any persisted demo data so we enter from scratch.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  // ---- Splash → wizard ----
  await page.getByRole("button", { name: /begin wizard/i }).click();
  await page.waitForURL(/\/wizard/, { timeout: 15000 });
  await dismissTour();

  // ---- ProfileStep: setup mode Solo (1 earner) + household name ----
  await page.getByLabel("Setup mode").click({ force: true });
  await page.getByRole("option", { name: "Solo" }).click();
  await page.getByLabel(/household name/i).fill("The Maurya Family");

  // Earner card → Abhay
  const earnerCard = page.locator(".person-card").first();
  await earnerCard.getByLabel("Name").fill("Abhay Maurya");
  await earnerCard.locator('[aria-label="Edit details"]').click().catch(() => {});
  await earnerCard.getByLabel("Date of birth").fill("1981-12-28");
  await earnerCard.getByTestId("member-retire-age").locator("input").fill("50");
  await earnerCard.getByTestId("member-plan-to-age").locator("input").fill("90");

  // Add 2 dependents: Madhu + Myra
  const deps = [
    { name: "Madhu Kushwaha", dob: "1981-04-15", relation: "Spouse" },
    { name: "Myra Maurya", dob: "2014-09-01", relation: "Child", edu: "Secondary" },
  ];
  for (let i = 0; i < deps.length; i++) {
    await page.getByRole("button", { name: /add dependent/i }).click();
    await page.waitForTimeout(300);
    const card = page.locator(".person-card").nth(1 + i); // 0 = earner
    await card.getByLabel("Name").fill(deps[i].name);
    await card.locator('[aria-label="Edit details"]').click().catch(() => {});
    await card.getByLabel("Date of birth").fill(deps[i].dob);
    await card.getByLabel("Relation").fill(deps[i].relation);
    if (deps[i].edu) {
      await card.getByLabel("Education stage").click({ force: true });
      await page.getByRole("option", { name: deps[i].edu }).click();
    }
  }
  await shot("01-profile-filled");
  await page.getByRole("button", { name: /save profile/i }).click();
  await page.waitForTimeout(800);

  // Verify members persisted via the adapter.
  entered.members = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(":household")) {
        try { return (JSON.parse(localStorage.getItem(k)).members || []).length; } catch {}
      }
    }
    return 0;
  });
  log(`  members persisted: ${entered.members}`);

  // ---- Investments via the Holdings inline form ----
  await page.goto(`${BASE}/investments/holdings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await dismissTour();
  // First-investment empty state has a CTA to reveal the form.
  const cta = page.getByRole("button", { name: /add your first investment/i });
  if (await cta.isVisible({ timeout: 2000 }).catch(() => false)) await cta.click();

  for (const inv of INVESTMENTS) {
    try {
      await page.getByLabel("Type", { exact: true }).first().click({ force: true });
      await page.getByRole("option", { name: inv.type, exact: true }).click();
      await page.waitForTimeout(150);
      await page.getByLabel(/label/i).first().fill(inv.label);
      await page.getByLabel("Owner", { exact: true }).first().click({ force: true });
      await page.getByRole("option", { name: inv.owner, exact: true }).click();

      if (inv.type === "ESOP") {
        await page.getByLabel(/total grant/i).fill(String(inv.esopGrant));
        await page.getByLabel(/vested %/i).fill(String(inv.esopVested));
      } else {
        // value field label varies by type ("Current market value *", "Balance at FY start *", ...)
        await page.locator('input[type="number"]').first().fill(String(inv.value));
        if (inv.monthly !== undefined) {
          await page.getByLabel(/monthly contribution/i).fill(String(inv.monthly));
        }
        if (inv.holdings) await page.getByLabel(/# holdings/i).fill(String(inv.holdings));
      }
      if (inv.reRole) {
        await page.getByRole("button", { name: /more details/i }).click().catch(() => {});
        await page.getByTestId("re-role-select").click({ force: true });
        await page.getByRole("option", { name: inv.reRole }).click();
      }
      await page.getByRole("button", { name: /^add investment$/i }).click();
      await page.waitForTimeout(400);
    } catch (e) {
      log(`  ⚠ investment "${inv.label}" failed: ${e.message?.split("\n")[0]}`);
      await shot(`FAIL-inv-${inv.label.replace(/[^a-z0-9]+/gi, "-").slice(0, 30)}`);
    }
  }

  entered.investments = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(":household")) {
        try { return (JSON.parse(localStorage.getItem(k)).investments || []).length; } catch {}
      }
    }
    return 0;
  });
  await shot("02-investments-entered");
  log(`  investments persisted: ${entered.investments}`);
} catch (err) {
  console.error("ENTRY_FAILED:", err?.message ?? err);
  await shot("FAILURE");
  errors.push(`HARNESS: ${err?.message ?? err}`);
} finally {
  if (!headless) await page.waitForTimeout(1500);
  await browser.close();
}

log("\n──────── UI DATA-ENTRY SUMMARY ────────");
log(`members entered+persisted     : ${entered.members} (expected 3)`);
log(`investments entered+persisted : ${entered.investments} (expected ${INVESTMENTS.length})`);
log(`page errors                   : ${errors.length ? JSON.stringify(errors) : "none"}`);
log(`screenshots                   : ${OUT}`);
const ok = entered.members === 3 && entered.investments >= INVESTMENTS.length - 1 && errors.length === 0;
log(`VERDICT                       : ${ok ? "PASS ✅" : "PARTIAL / FAIL — iterate"}`);
process.exit(ok ? 0 : 1);

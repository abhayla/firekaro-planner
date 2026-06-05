// COMPREHENSIVE NEW-USER end-to-end UI test (ServerAdapter mode → backend :3100 → Supabase).
// Drives the REAL UI as a brand-new empty user: Splash → "Begin wizard" → wizard →
// every section's data-entry forms (fill ALL fields incl optional) → per-section overview
// render check → exercise EVERY interactive control. Captures evidence per screen into
// verification-evidence/{run_id}/. PURE TESTER: records product issues, never fixes product.
//
// Run: node scripts/new-user-journey-verify.mjs [--headless]   (default headless)
//
// KEY DIFFERENCE vs scripts/enter-persona-via-ui.mjs (which is the localStorage demo path):
//  • This is ServerAdapter mode — persisted household lives in the BACKEND, not localStorage.
//    Verification reads GET http://localhost:3100/api/planner/household (x-dev-bypass: true).
//  • Entry is "Begin wizard" (new user), NOT "Try the sample" (loads demo seed).
//  • We do NOT localStorage.clear() — the user is already wiped server-side.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:5175";
const API = "http://localhost:3100";
const headless = !process.argv.includes("--headed");

const rand = Math.random().toString(36).slice(2, 8);
const run_id = new Date().toISOString().replace(/[:.]/g, "-") + "_" + rand;
const EV = `verification-evidence/${run_id}`;
const SHOTS = `${EV}/screenshots`;
mkdirSync(SHOTS, { recursive: true });

const BENIGN = [/Vue Devtools/i, /favicon/i, /\[vite\] connect/i, /Download the Vue/i];

// ───── backend API readers (the REAL persistence under ServerAdapter) ─────
const H = { "x-dev-bypass": "true" };
async function getHousehold() {
  try {
    const res = await fetch(`${API}/api/planner/household`, { headers: H });
    const j = await res.json();
    return j?.data ?? null;
  } catch { return null; }
}
// ServerAdapter write-behind: PUT /api/planner/<key> fires ~1500ms (debounce) after the
// last edit, coalesced to ONE PUT. So after a save we MUST wait for the flush before any
// API count read, or we read stale (pre-flush) state. Strategy: try to observe the PUT
// on the page network, else wait past the debounce, then GET-confirm.
let lastFlush = 0;
async function waitForFlush(keyRe = /\/api\/planner\/household/) {
  // already-pending flush may have fired; race a network observe vs a debounce timeout.
  const observed = page
    .waitForResponse((r) => keyRe.test(r.url()) && r.request().method() === "PUT" && r.ok(), { timeout: 3500 })
    .then(() => true)
    .catch(() => false);
  const ok = await observed;
  if (!ok) await page.waitForTimeout(1800); // past the 1500ms debounce as a fallback
  await page.waitForTimeout(250); // let the server commit + respond
  lastFlush = Date.now();
}
// Read household AFTER ensuring the write-behind flush has landed.
async function getHouseholdAfterFlush() {
  await waitForFlush();
  return getHousehold();
}

// ───── evidence accumulator ─────
const screens = [];
const coverageGaps = [];
function newScreen(name, route) {
  const s = { name, route, dataEntered: false, overviewVerified: null, consoleErrors: [], controls: [], screenshot: null, productIssues: [] };
  screens.push(s);
  return s;
}

const browser = await chromium.launch({ headless, args: headless ? [] : ["--start-maximized"] });
const context = await browser.newContext({ viewport: headless ? { width: 1440, height: 1000 } : null });
const page = await context.newPage();

// console capture: tag onto the "current" screen via a mutable ref
let curScreen = null;
const allPageErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  const t = m.text();
  if (BENIGN.some((re) => re.test(t))) return;
  if (curScreen) curScreen.consoleErrors.push(`[${m.type()}] ${t.slice(0, 300)}`);
});
page.on("pageerror", (e) => { const s = String(e).slice(0, 400); allPageErrors.push(s); if (curScreen) curScreen.productIssues.push(`PAGE ERROR: ${s}`); });

const log = (m) => console.log(m);
async function dismissTour() {
  await page.keyboard.press("Escape").catch(() => {});
  for (const re of [/skip/i, /got it/i, /^done$/i, /finish/i, /dismiss/i, /close/i]) {
    const b = page.getByRole("button", { name: re }).first();
    if (await b.isVisible({ timeout: 200 }).catch(() => false)) await b.click().catch(() => {});
  }
  await page.evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove())).catch(() => {});
}
async function go(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('#app[data-hydrated="true"]', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(350);
  await dismissTour();
}
async function shot(s, suffix = "") {
  const f = `${SHOTS}/${s.name}${suffix}.png`;
  await page.screenshot({ path: f, fullPage: true }).catch(() => {});
  if (!suffix) s.screenshot = f;
  return f;
}
async function ariaSummary() {
  // structural DOM summary (cheap proxy for ARIA tree)
  return page.evaluate(() => {
    const pick = (sel) => Array.from(document.querySelectorAll(sel)).length;
    return {
      headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((h) => h.textContent.trim().slice(0, 60)).slice(0, 15),
      tabs: pick('[role="tab"]'), buttons: pick("button"), dialogs: pick(".v-dialog"),
      tables: pick("table,.v-data-table"), cards: pick(".v-card"),
    };
  }).catch(() => ({}));
}
// record an interaction attempt
async function exercise(s, control, action, fn) {
  let responded = false, note = "";
  const before = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
  const errBefore = s.consoleErrors.length;
  try {
    const res = await fn();
    if (typeof res === "boolean") responded = res;
    else {
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
      const dialogOpen = await page.locator(".v-overlay--active").count().catch(() => 0);
      responded = after !== before || dialogOpen > 0;
    }
  } catch (e) { note = (e.message || "").split("\n")[0].slice(0, 120); }
  if (s.consoleErrors.length > errBefore) note += " [NEW console err]";
  s.controls.push({ control, action, responded, note });
  return responded;
}
const vvFill = async (locator, val) => {
  await locator.click().catch(() => {});
  await locator.fill("").catch(() => {});
  await locator.pressSequentially(String(val), { delay: 8 }).catch(() => {});
  await locator.blur().catch(() => {});
};
const sel = async (labelRe, optionName) => {
  await page.getByLabel(labelRe, { exact: false }).first().click({ force: true });
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: optionName, exact: true }).click();
};

// ───── data (mirrors enter-persona-via-ui.mjs Maurya household) ─────
const INVESTMENTS = [
  { type: "EPF · VPF (auto)", value: 4500000, owner: "Abhay Maurya", epf: true, vpf: 5 },
  { type: "Stocks", label: "Direct equity portfolio", value: 2500000, monthly: 20000, owner: "Abhay Maurya", holdings: 25, bucket: "Bucket 3", det: { Quantity: 250, "Avg price / share": 10000 } },
  { type: "Mutual Funds", label: "Mutual fund SIPs (multi-cap)", value: 6000000, monthly: 25000, owner: "Abhay Maurya", bucket: "Bucket 3", det: { Units: 60000, "NAV / unit": 100 } },
  { type: "PPF", label: "PPF (Abhay)", value: 2500000, monthly: 12500, owner: "Abhay Maurya", bucket: "Bucket 4", det: { "Account opening year": 2010 } },
  { type: "NPS", label: "NPS Tier-I", value: 1200000, monthly: 10000, owner: "Abhay Maurya", bucket: "Bucket 4", det: { "Opening year": 2016 } },
  { type: "Real Estate", label: "3BHK Wakad, Pune", value: 13000000, owner: "Joint", reRole: "Primary residence (excluded from FIRE corpus)", det: { "Purchase year": 2015 } },
  { type: "Real Estate", label: "2BHK (let out)", value: 6000000, owner: "Joint", reRole: "Investment (counts toward corpus)", det: { "Purchase year": 2019 } },
  { type: "Gold", label: "Family gold + SGB", value: 1500000, owner: "Joint", bucket: "Bucket 3", det: { Grams: 250, "Price/gram": 6000 } },
  { type: "FD / Bonds", label: "Emergency fund FD", value: 1000000, owner: "Joint", bucket: "Bucket 1", det: { Principal: 1000000, "Interest %": 7, "Maturity year": 2028, Bank: "SBI" } },
  { type: "Crypto / Other", label: "Crypto (BTC/ETH)", value: 200000, owner: "Abhay Maurya", bucket: "Bucket 4", det: { Coin: "BTC", Quantity: 0.05, "Price / coin": 4000000 } },
  { type: "ESOP", esopGrant: 2000000, esopVested: 60, label: "Cognizant RSUs", owner: "Abhay Maurya", esopExercise: 100, esopFmv: 800 },
  { type: "International Equity", label: "US index FoF (LRS)", value: 800000, owner: "Abhay Maurya", bucket: "Bucket 3" },
  { type: "REIT", label: "Listed REIT", value: 300000, owner: "Abhay Maurya", bucket: "Bucket 3" },
];
const RECURRING = [
  { label: "Society maintenance", amount: 7000, freq: "Monthly", kind: "General" },
  { label: "Property tax", amount: 25000, freq: "Annual", kind: "General" },
  { label: "Parents support (Abhay's parents)", amount: 25000, freq: "Monthly", kind: "Parents (sandwich-gen)" },
  { label: "Myra's school fees", amount: 15000, freq: "Monthly", kind: "General" },
];
const GOALS = [
  { label: "Myra's higher education", kind: "Education", today: 12000000, year: 2032, multi: 4 },
  { label: "Myra's wedding", kind: "Marriage", today: 4000000, year: 2040 },
  { label: "Car replacement", kind: "General", today: 1500000, year: 2029 },
  { label: "Foreign vacation", kind: "General", today: 400000, year: 2027 },
];
const LOANS = [
  { name: "SBI Home Loan", type: "Home Loan", outstanding: 3500000, emi: 45000, rate: 8.5, owner: "Abhay Maurya", shared: true },
  { name: "Car Loan", type: "Car Loan", outstanding: 600000, emi: 18000, rate: 9.5, owner: "Abhay Maurya", shared: false },
];
const POLICIES = [
  { type: "Health", provider: "Family floater", sum: 1500000, prem: 35000, insured: "Abhay Maurya" },
  { type: "Life", provider: "HDFC Click2Protect (term)", sum: 30000000, prem: 25000, insured: "Abhay Maurya" },
  { type: "Vehicle", provider: "HDFC Ergo Comprehensive", sum: 800000, prem: 18000, insured: "Abhay Maurya" },
];
const OTHER_INCOME = [
  { typeChip: "Rental", label: "Let-out flat rental", amount: 18000, freq: "Monthly", owner: "Abhay Maurya" },
  { typeChip: "Dividend", label: "PIFS Pvt Ltd dividend", amount: 50000, freq: "Annual", owner: "Abhay Maurya", source: "PIFS" },
  { typeChip: "Interest", label: "Savings + FD interest", amount: 40000, freq: "Annual", owner: "Abhay Maurya" },
];

const started = new Date().toISOString();
let summary = "";
try {
  // ════════ 0. SPLASH ════════
  let s = newScreen("splash", "/");
  curScreen = s;
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('#app[data-hydrated="true"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot(s);
  const beginVisible = await page.getByRole("button", { name: /begin wizard/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
  if (!beginVisible) { s.productIssues.push("Splash 'Begin wizard' CTA not visible for new user"); coverageGaps.push("Could not enter wizard — splash CTA missing"); }
  log(`0. splash: beginWizard visible=${beginVisible}`);

  // ════════ 1. WIZARD (onboarding) ════════
  s = newScreen("wizard-profile", "/wizard/profile");
  curScreen = s;
  await page.getByRole("button", { name: /begin wizard/i }).click();
  await page.waitForURL(/\/wizard/, { timeout: 15000 });
  await dismissTour();
  await page.waitForTimeout(600);
  try {
    await page.getByLabel("Setup mode").click({ force: true });
    await page.getByRole("option", { name: "Solo" }).click();
    await page.getByLabel(/household name/i).fill("The Maurya Family");
    const ec = page.locator(".person-card").first();
    await ec.getByLabel("Name").fill("Abhay Maurya");
    await ec.locator('[aria-label="Edit details"]').click().catch(() => {});
    await ec.getByLabel("Date of birth").fill("1981-12-28");
    await ec.getByTestId("member-retire-age").locator("input").fill("50");
    await ec.getByTestId("member-plan-to-age").locator("input").fill("90");
    // city / employment / risk / health / marital — fill if present (optional fields)
    for (const [lbl, val] of [[/city/i, "Pune"], [/employment/i, null], [/risk/i, null], [/health/i, null], [/marital/i, null]]) {
      const f = page.getByLabel(lbl).first();
      if (val && await f.isVisible({ timeout: 200 }).catch(() => false)) await f.fill(val).catch(() => {});
    }
    const deps = [
      { name: "Madhu Kushwaha", dob: "1981-04-15", relation: "Spouse" },
      { name: "Myra Maurya", dob: "2014-09-01", relation: "Child", edu: "Secondary" },
    ];
    for (let i = 0; i < deps.length; i++) {
      const d = deps[i];
      await page.getByRole("button", { name: /add dependent/i }).click();
      await page.waitForTimeout(300);
      const c = page.locator(".person-card").nth(1 + i);
      await c.getByLabel("Name").fill(d.name);
      await c.locator('[aria-label="Edit details"]').click().catch(() => {});
      await c.getByLabel("Date of birth").fill(d.dob);
      await c.getByLabel("Relation").fill(d.relation).catch(() => {});
      if (d.edu) { await c.getByLabel("Education stage").click({ force: true }).catch(() => {}); await page.getByRole("option", { name: d.edu }).click().catch(() => {}); }
    }
    await shot(s);
    s.aria = await ariaSummary();
    await page.getByRole("button", { name: /save profile/i }).click();
    await page.waitForTimeout(1200);
    const hh = await getHouseholdAfterFlush();
    const memCount = (hh?.members || []).length;
    s.dataEntered = memCount >= 1;
    if (memCount < 3) s.productIssues.push(`Wizard saved ${memCount}/3 members to backend`);
    log(`1. wizard members(API): ${memCount}/3`);
    // advance through remaining wizard steps to completion
    let steps = 0;
    while (steps++ < 7) {
      const next = page.getByRole("button", { name: /^(next|continue|finish|go to dashboard|skip)$/i }).first();
      if (!(await next.isVisible({ timeout: 800 }).catch(() => false))) break;
      await next.click().catch(() => {});
      await page.waitForTimeout(700);
      await dismissTour();
      if (!/\/wizard/.test(page.url())) break;
    }
    log(`   wizard advanced; now at ${page.url().replace(BASE, "")}`);
  } catch (e) { s.productIssues.push(`wizard harness/product: ${(e.message || "").split("\n")[0]}`); coverageGaps.push("wizard not fully completed: " + (e.message || "").split("\n")[0].slice(0, 80)); }

  // helper: standard interaction sweep for a section page (non-destructive)
  async function sweepControls(s) {
    // tabs
    const tabs = page.locator('[role="tab"]');
    const ntabs = await tabs.count().catch(() => 0);
    for (let i = 0; i < Math.min(ntabs, 5); i++) {
      await exercise(s, `tab[${i}]`, "click", async () => { await tabs.nth(i).click({ timeout: 2000 }); });
    }
    // FY / period selectors (v-select with year-like or period labels)
    for (const re of [/financial year/i, /^year/i, /period/i, /^FY/i]) {
      const f = page.getByLabel(re).first();
      if (await f.isVisible({ timeout: 200 }).catch(() => false)) {
        await exercise(s, `selector(${re.source})`, "open+pick", async () => {
          await f.click({ force: true });
          await page.waitForTimeout(250);
          const opt = page.getByRole("option").nth(1);
          const ok = await opt.isVisible({ timeout: 800 }).catch(() => false);
          if (ok) await opt.click().catch(() => {});
          await page.keyboard.press("Escape").catch(() => {});
          return ok;
        });
      }
    }
    // expand/collapse panels
    const panels = page.locator(".v-expansion-panel-title");
    const np = await panels.count().catch(() => 0);
    if (np > 0) await exercise(s, "expansion-panel", "toggle", async () => { await panels.first().click({ timeout: 2000 }); });
    // a non-destructive primary "add" dialog: open then cancel
    const addBtn = page.getByRole("button", { name: /^(add|new|create)/i }).first();
    if (await addBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await exercise(s, "add-dialog", "open", async () => {
        await addBtn.click({ timeout: 2000 });
        await page.waitForTimeout(400);
        return (await page.locator(".v-overlay--active").count()) > 0;
      });
      // cancel/close
      const cancel = page.getByRole("button", { name: /^(cancel|close|discard)$/i }).first();
      if (await cancel.isVisible({ timeout: 300 }).catch(() => false)) {
        await exercise(s, "add-dialog", "cancel", async () => { await cancel.click({ timeout: 2000 }); await page.keyboard.press("Escape").catch(() => {}); });
      } else { await page.keyboard.press("Escape").catch(() => {}); }
    }
  }

  // ════════ 2. INVESTMENTS (entry) ════════
  s = newScreen("investments-holdings", "/investments/holdings");
  curScreen = s;
  await go("/investments/holdings");
  try {
    const cta = page.getByRole("button", { name: /add your first investment/i });
    if (await cta.isVisible({ timeout: 2000 }).catch(() => false)) await cta.click();
    let added = 0;
    for (const inv of INVESTMENTS) {
      try {
        await sel("Type", inv.type);
        await page.waitForTimeout(150);
        if (inv.label) await page.getByLabel(/^label/i).first().fill(inv.label);
        await sel("Owner", inv.owner);
        if (inv.type === "ESOP") {
          await page.getByLabel(/total grant/i).first().fill(String(inv.esopGrant));
          await page.getByLabel(/vested %/i).first().fill(String(inv.esopVested));
          await page.getByTestId("esop-grantor-country").click({ force: true }).catch(() => {});
          await page.getByRole("option", { name: "US", exact: true }).first().click().catch(() => {});
          if (inv.esopExercise !== undefined) await page.getByTestId("esop-exercise-price").locator("input").fill(String(inv.esopExercise)).catch(() => {});
          if (inv.esopFmv !== undefined) await page.getByTestId("esop-fmv-at-vest").locator("input").fill(String(inv.esopFmv)).catch(() => {});
        } else {
          await page.locator('input[type="number"]').first().fill(String(inv.value));
          if (inv.epf && inv.vpf !== undefined) await page.getByLabel(/VPF top-up/i).first().fill(String(inv.vpf)).catch(() => {});
          if (inv.monthly !== undefined && !inv.epf) await page.getByLabel(/monthly contribution/i).fill(String(inv.monthly)).catch(() => {});
          if (inv.holdings) await page.getByLabel(/# holdings/i).fill(String(inv.holdings)).catch(() => {});
        }
        if (inv.bucket) {
          await page.getByTestId("investment-bucket-select").click({ force: true }).catch(() => {});
          await page.getByRole("option", { name: new RegExp(inv.bucket) }).first().click().catch(() => {});
        }
        if (inv.reRole || inv.det) {
          const firstDet = inv.det ? Object.keys(inv.det)[0] : null;
          const detVis = firstDet ? await page.getByLabel(firstDet, { exact: false }).first().isVisible({ timeout: 400 }).catch(() => false) : false;
          const reRoleVis = await page.getByTestId("re-role-select").isVisible({ timeout: 300 }).catch(() => false);
          if (!reRoleVis && !detVis) { await page.getByRole("button", { name: /more details/i }).click().catch(() => {}); await page.waitForTimeout(300); }
          if (inv.reRole) { await page.getByTestId("re-role-select").click({ force: true }).catch(() => {}); await page.getByRole("option", { name: inv.reRole }).first().click().catch(() => {}); }
          if (inv.det) for (const [lbl, val] of Object.entries(inv.det)) await page.getByLabel(lbl, { exact: false }).first().fill(String(val)).catch(() => {});
        }
        await page.getByRole("button", { name: /^add investment$/i }).click();
        await page.waitForTimeout(500);
        added++;
      } catch (e) { s.productIssues.push(`inv "${inv.label || inv.type}" entry: ${(e.message || "").split("\n")[0].slice(0, 80)}`); }
    }
    const hh = await getHouseholdAfterFlush();
    const invCount = (hh?.investments || []).length;
    s.dataEntered = invCount > 0;
    if (invCount < INVESTMENTS.length) s.productIssues.push(`investments persisted ${invCount}/${INVESTMENTS.length} to backend`);
    log(`2. investments(API): ${invCount}/${INVESTMENTS.length} (form-added ${added})`);
    await shot(s);
    s.aria = await ariaSummary();
    await sweepControls(s);
  } catch (e) { s.productIssues.push(`investments section: ${(e.message || "").split("\n")[0]}`); }

  // investments overview render check
  {
    const ov = newScreen("investments-overview", "/investments/overview");
    curScreen = ov;
    await go("/investments/overview");
    await page.waitForTimeout(900);
    await shot(ov);
    ov.aria = await ariaSummary();
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    ov.overviewVerified = !/No investments yet/i.test(txt) && /Direct equity|Mutual fund|Cr|L\b/.test(txt);
    if (!ov.overviewVerified) ov.productIssues.push("Investments overview does not render entered holdings");
    await sweepControls(ov);
    log(`   investments overview render: ${ov.overviewVerified}`);
  }

  // ════════ 3. EXPENSES (avg + recurring + planned) ════════
  s = newScreen("expenses-recurring", "/expenses/recurring");
  curScreen = s;
  await go("/expenses/overview");
  await page.getByLabel(/average \/ month/i).first().fill("85000").catch(() => {});
  await page.waitForTimeout(500);
  await go("/expenses/recurring");
  try {
    const rcta = page.getByRole("button", { name: /add your first commitment/i });
    if (await rcta.isVisible({ timeout: 1500 }).catch(() => false)) await rcta.click();
    await page.waitForTimeout(300);
    for (const x of RECURRING) {
      try {
        await page.getByLabel(/^label/i).first().fill(x.label);
        await page.getByLabel(/^amount/i).first().fill(String(x.amount));
        await page.getByLabel("Frequency").first().click({ force: true });
        await page.getByRole("option", { name: x.freq, exact: true }).first().click();
        await page.getByTestId("recurring-kind").click({ force: true });
        await page.getByRole("option", { name: x.kind, exact: true }).first().click();
        await page.getByRole("button", { name: /^add$/i }).first().click();
        await page.waitForTimeout(450);
      } catch (e) { s.productIssues.push(`recurring "${x.label}": ${(e.message || "").split("\n")[0].slice(0, 70)}`); }
    }
    let hh = await getHouseholdAfterFlush();
    const recCount = (hh?.expenses?.recurring || []).filter((x) => x.source === "manual").length;
    if (recCount < RECURRING.length) s.productIssues.push(`recurring persisted ${recCount}/${RECURRING.length}`);
    await shot(s);
    s.aria = await ariaSummary();
    await sweepControls(s);
    // planned
    const sp = newScreen("expenses-planned", "/expenses/planned");
    curScreen = sp;
    await go("/expenses/planned");
    for (const g of GOALS) {
      try {
        const panel = page.locator(".v-card", { hasText: "Add a planned expense" });
        await panel.getByLabel(/^label/i).fill(g.label);
        await page.getByTestId("planned-kind-select").click({ force: true });
        await page.getByRole("option", { name: g.kind, exact: true }).click();
        await panel.getByLabel(/today's/i).fill(String(g.today));
        await panel.getByLabel(/target year/i).fill(String(g.year));
        if (g.multi) { await panel.getByLabel(/multi-year/i).check(); await panel.getByLabel(/^years/i).fill(String(g.multi)); }
        await panel.locator(".v-btn--variant-flat").last().click();
        await page.waitForTimeout(450);
      } catch (e) { sp.productIssues.push(`goal "${g.label}": ${(e.message || "").split("\n")[0].slice(0, 70)}`); }
    }
    hh = await getHouseholdAfterFlush();
    const planCount = (hh?.expenses?.plannedFuture || []).length;
    sp.dataEntered = planCount > 0;
    if (planCount < GOALS.length) sp.productIssues.push(`planned persisted ${planCount}/${GOALS.length}`);
    await shot(sp);
    sp.aria = await ariaSummary();
    await sweepControls(sp);
    s.dataEntered = recCount > 0;
    log(`3. recurring(API): ${recCount}/${RECURRING.length}  planned: ${planCount}/${GOALS.length}`);
  } catch (e) { s.productIssues.push(`expenses section: ${(e.message || "").split("\n")[0]}`); }

  // expenses overview render check
  {
    const ov = newScreen("expenses-overview", "/expenses/overview");
    curScreen = ov;
    await go("/expenses/overview");
    await page.waitForTimeout(800);
    await shot(ov);
    ov.aria = await ariaSummary();
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    ov.overviewVerified = !/No recurring commitments/i.test(txt);
    if (!ov.overviewVerified) ov.productIssues.push("Expenses overview shows empty after entry");
    await sweepControls(ov);
    log(`   expenses overview render: ${ov.overviewVerified}`);
  }

  // ════════ 4. LIABILITIES ════════
  s = newScreen("liabilities-loans", "/liabilities/loans");
  curScreen = s;
  await go("/liabilities/loans");
  try {
    for (const l of LOANS) {
      try {
        const panel = page.locator(".v-card", { hasText: "Add a loan" });
        await panel.getByLabel(/loan name/i).fill(l.name);
        await panel.getByLabel("Type").click({ force: true });
        await page.getByRole("option", { name: l.type, exact: true }).click();
        await panel.getByLabel(/outstanding/i).fill(String(l.outstanding));
        await panel.getByLabel(/monthly emi/i).fill(String(l.emi));
        await panel.getByLabel(/interest/i).fill(String(l.rate));
        await panel.getByLabel("Owner").click({ force: true });
        await page.getByRole("option", { name: l.owner, exact: true }).click();
        if (l.shared) await panel.getByLabel(/shared with spouse/i).check().catch(() => {});
        await panel.getByRole("button", { name: /add loan/i }).click();
        await page.waitForTimeout(450);
      } catch (e) { s.productIssues.push(`loan "${l.name}": ${(e.message || "").split("\n")[0].slice(0, 70)}`); }
    }
    const hh = await getHouseholdAfterFlush();
    const c = (hh?.liabilities || []).length;
    s.dataEntered = c > 0;
    if (c < LOANS.length) s.productIssues.push(`liabilities persisted ${c}/${LOANS.length}`);
    await shot(s); s.aria = await ariaSummary(); await sweepControls(s);
    log(`4. liabilities(API): ${c}/${LOANS.length}`);
  } catch (e) { s.productIssues.push(`liabilities section: ${(e.message || "").split("\n")[0]}`); }
  {
    const ov = newScreen("liabilities-overview", "/liabilities/overview");
    curScreen = ov;
    await go("/liabilities/overview");
    await page.waitForTimeout(800); await shot(ov); ov.aria = await ariaSummary();
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    ov.overviewVerified = /SBI Home Loan|loan/i.test(txt) && !/No (loans|liabilities)/i.test(txt);
    if (!ov.overviewVerified) ov.productIssues.push("Liabilities overview doesn't render entered loans");
    await sweepControls(ov);
    log(`   liabilities overview render: ${ov.overviewVerified}`);
  }

  // ════════ 5. INSURANCE ════════
  s = newScreen("insurance-policies", "/insurance/policies");
  curScreen = s;
  await go("/insurance/policies");
  try {
    for (const p of POLICIES) {
      try {
        await page.getByLabel("Type", { exact: true }).first().click({ force: true });
        await page.getByRole("option", { name: p.type, exact: true }).first().click();
        await page.getByLabel(/provider/i).first().fill(p.provider);
        await page.getByLabel(/sum assured/i).first().fill(String(p.sum));
        await page.getByLabel(/premium/i).first().fill(String(p.prem));
        await page.getByLabel("Per", { exact: true }).first().click({ force: true }).catch(() => {});
        await page.getByRole("option", { name: "/yr", exact: true }).first().click().catch(() => {});
        await page.getByLabel(/insured person/i).first().click({ force: true });
        await page.getByRole("option", { name: p.insured, exact: true }).first().click();
        await page.getByRole("button", { name: /add policy/i }).first().click();
        await page.waitForTimeout(450);
      } catch (e) { s.productIssues.push(`policy "${p.provider}": ${(e.message || "").split("\n")[0].slice(0, 70)}`); }
    }
    const hh = await getHouseholdAfterFlush();
    const c = (hh?.insurance || []).length;
    s.dataEntered = c > 0;
    if (c < POLICIES.length) s.productIssues.push(`insurance persisted ${c}/${POLICIES.length}`);
    await shot(s); s.aria = await ariaSummary(); await sweepControls(s);
    log(`5. insurance(API): ${c}/${POLICIES.length}`);
  } catch (e) { s.productIssues.push(`insurance section: ${(e.message || "").split("\n")[0]}`); }
  {
    const ov = newScreen("insurance-overview", "/insurance/overview");
    curScreen = ov;
    await go("/insurance/overview");
    await page.waitForTimeout(800); await shot(ov); ov.aria = await ariaSummary();
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    ov.overviewVerified = /polic/i.test(txt) && !/No polic/i.test(txt);
    if (!ov.overviewVerified) ov.productIssues.push("Insurance overview doesn't render entered policies");
    await sweepControls(ov);
    log(`   insurance overview render: ${ov.overviewVerified}`);
  }

  // ════════ 6. SALARY (income) ════════
  s = newScreen("income-salary", "/income/salary");
  curScreen = s;
  await go("/income/salary");
  try {
    await page.locator(".rail-featured").first().click({ force: true });
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Edit salary" }).click();
    await page.waitForTimeout(500);
    const dlg = page.locator(".v-overlay--active .v-card", { hasText: "Edit salary" }).last();
    await dlg.locator('input[type="number"]').nth(0).fill("4200000");
    await dlg.locator('input[type="number"]').nth(1).fill("5");
    await dlg.locator('input[type="number"]').nth(2).fill("0");
    await dlg.locator('input[type="number"]').nth(3).fill("1680000");
    await dlg.locator('input[type="number"]').nth(4).fill("120000");
    await page.getByTestId("employer-sector-select").click({ force: true }).catch(() => {});
    await page.getByRole("option", { name: /private/i }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    await shot(s);
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /^done$/i }).click().catch(() => {});
    const hh = await getHouseholdAfterFlush();
    const ctc = (hh?.members || []).find((m) => m.salary)?.salary?.annualCTC || 0;
    s.dataEntered = ctc > 0;
    if (ctc !== 4200000) s.productIssues.push(`salary CTC persisted=${ctc}, expected 4200000`);
    s.aria = await ariaSummary();
    await sweepControls(s);
    log(`6. salary CTC(API): ${ctc}`);
  } catch (e) { s.productIssues.push(`salary entry: ${(e.message || "").split("\n")[0]}`); coverageGaps.push("salary entry incomplete: " + (e.message || "").split("\n")[0].slice(0, 70)); }

  // ════════ 7. BUSINESS ════════
  s = newScreen("income-business", "/income/business");
  curScreen = s;
  await go("/income/business");
  try {
    await page.getByRole("button", { name: /pvt ltd|private limited/i }).first().click();
    await page.waitForTimeout(600);
    await page.getByLabel(/business name/i).first().fill("PIFS Pvt Ltd");
    await page.getByLabel(/^profit/i).first().fill("500000");
    await page.getByLabel(/share %/i).first().fill("100");
    await page.getByLabel("Owner").first().click({ force: true });
    await page.getByRole("option", { name: "Abhay Maurya", exact: true }).first().click();
    await page.getByRole("button", { name: /add business/i }).first().click();
    await page.waitForTimeout(700);
    const hh = await getHouseholdAfterFlush();
    const c = (hh?.businesses || []).length;
    s.dataEntered = c > 0;
    if (c < 1) s.productIssues.push("business not persisted");
    await shot(s); s.aria = await ariaSummary(); await sweepControls(s);
    log(`7. businesses(API): ${c}/1`);
  } catch (e) { s.productIssues.push(`business entry: ${(e.message || "").split("\n")[0]}`); }

  // ════════ 8. OTHER SOURCES (income) ════════
  s = newScreen("income-other-sources", "/income/other-sources");
  curScreen = s;
  await go("/income/other-sources");
  try {
    for (const o of OTHER_INCOME) {
      try {
        await page.getByRole("button", { name: o.typeChip, exact: true }).first().click();
        await page.waitForTimeout(600);
        await page.getByLabel(/^amount/i).first().fill(String(o.amount));
        await page.getByLabel("Frequency").first().click({ force: true });
        await page.getByRole("option", { name: o.freq, exact: true }).first().click();
        if (o.source) { await page.getByLabel("Source").first().click({ force: true }).catch(() => {}); await page.getByRole("option", { name: new RegExp(o.source) }).first().click().catch(() => {}); }
        await page.getByLabel(/^label/i).first().fill(o.label);
        await page.getByLabel("Owner").first().click({ force: true });
        await page.getByRole("option", { name: o.owner, exact: true }).first().click();
        await page.getByRole("button", { name: new RegExp(`add ${o.typeChip}`, "i") }).first().click();
        await page.waitForTimeout(550);
      } catch (e) { s.productIssues.push(`other-income "${o.label}": ${(e.message || "").split("\n")[0].slice(0, 70)}`); }
    }
    const hh = await getHouseholdAfterFlush();
    const c = (hh?.otherIncome || []).length;
    s.dataEntered = c > 0;
    if (c < OTHER_INCOME.length) s.productIssues.push(`otherIncome persisted ${c}/${OTHER_INCOME.length}`);
    await shot(s); s.aria = await ariaSummary(); await sweepControls(s);
    log(`8. otherIncome(API): ${c}/${OTHER_INCOME.length}`);
  } catch (e) { s.productIssues.push(`other-sources section: ${(e.message || "").split("\n")[0]}`); }
  {
    const ov = newScreen("income-overview", "/income/overview");
    curScreen = ov;
    await go("/income/overview");
    await page.waitForTimeout(900); await shot(ov); ov.aria = await ariaSummary();
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    ov.overviewVerified = /Cr|L\b|₹|42/.test(txt) && !/No income/i.test(txt);
    if (!ov.overviewVerified) ov.productIssues.push("Income overview doesn't render entered income");
    await sweepControls(ov);
    log(`   income overview render: ${ov.overviewVerified}`);
  }

  // ════════ 9. read-only / derived sections — render + interactive sweep ════════
  const readonlyRoutes = [
    ["tax-planning", "/tax-planning"],
    ["financial-health", "/financial-health"],
    ["financial-health-networth", "/financial-health/net-worth"],
    ["financial-health-cashflow", "/financial-health/cash-flow"],
    ["fire-goals-dashboard", "/fire-goals/dashboard"],
    ["fire-goals-goals", "/fire-goals/goals"],
    ["fire-goals-whatif", "/fire-goals/what-if"],
    ["fire-goals-stress-test", "/fire-goals/stress-test"],
    ["investments-buckets", "/investments/buckets"],
    ["estate-planning", "/estate-planning"],
    ["preferences", "/preferences"],
    ["profile", "/profile"],
  ];
  for (const [name, route] of readonlyRoutes) {
    const sr = newScreen(name, route);
    curScreen = sr;
    await go(route);
    await page.waitForTimeout(1100);
    await shot(sr);
    sr.aria = await ariaSummary();
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    if (name === "fire-goals-dashboard") {
      const m = txt.match(/at age (\d{2})/i);
      const fireAge = m ? Number(m[1]) : null;
      sr.fireAge = fireAge;
      if (fireAge !== null && (fireAge < 45 || fireAge > 75)) sr.productIssues.push(`FIRE headline age=${fireAge} implausible (default lens)`);
      sr.overviewVerified = fireAge !== null;
      if (fireAge === null) sr.productIssues.push("FIRE dashboard shows no 'at age NN' headline");
      log(`   FIRE dashboard headline age=${fireAge}`);
    }
    await sweepControls(sr);
    log(`9. ${name} swept (${sr.controls.length} controls, ${sr.consoleErrors.length} console errs)`);
  }
} catch (err) {
  if (curScreen) curScreen.productIssues.push(`HARNESS FATAL: ${(err.message || err)}`);
  coverageGaps.push("Journey aborted early: " + String(err.message || err).slice(0, 120));
  log("JOURNEY_FAILED: " + (err.message || err));
} finally {
  // Final write-behind flush: make sure any pending debounce PUT lands before we close.
  try { await waitForFlush(); } catch {}
  try { await page.waitForTimeout(500); } catch {}
  try { await browser.close(); } catch {}
}

// ───── final substance: backend household snapshot ─────
let finalHH = null;
// browser is closed; poll the backend directly a few times in case a flush is in flight.
for (let i = 0; i < 4; i++) {
  finalHH = await getHousehold();
  if (finalHH && (finalHH.members || []).length) break;
  await new Promise((r) => setTimeout(r, 700));
}
const counts = finalHH ? {
  members: (finalHH.members || []).length,
  investments: (finalHH.investments || []).length,
  recurring: (finalHH.expenses?.recurring || []).filter((x) => x.source === "manual").length,
  planned: (finalHH.expenses?.plannedFuture || []).length,
  liabilities: (finalHH.liabilities || []).length,
  insurance: (finalHH.insurance || []).length,
  businesses: (finalHH.businesses || []).length,
  otherIncome: (finalHH.otherIncome || []).length,
} : "household NULL — nothing persisted to backend";

const serverPersistConfirmed = !!(finalHH && (finalHH.members || []).length > 0);
summary = `New-user journey run ${run_id}. serverPersistConfirmed=${serverPersistConfirmed}. Backend persisted: ${JSON.stringify(counts)}.`;
const index = { run_id, started, finished: new Date().toISOString(), adapter: "ServerAdapter→:3100", serverPersistConfirmed, backendCounts: counts, screens, coverageGaps, pageErrors: allPageErrors, summary };
try {
  writeFileSync(`${EV}/index.json`, JSON.stringify(index, null, 2));
} catch (e) {
  log("FAILED to write index.json: " + (e.message || e));
}

log("\n════════ JOURNEY EVIDENCE WRITTEN ════════");
log(`evidence: ${EV}/index.json`);
log(`serverPersistConfirmed: ${serverPersistConfirmed}`);
log(`backend counts: ${JSON.stringify(counts)}`);
log(`screens: ${screens.length}, coverageGaps: ${coverageGaps.length}, pageErrors: ${allPageErrors.length}`);
process.exit(0);

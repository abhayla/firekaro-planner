// Headed UI DATA-ENTRY for the FULL Maurya household — drives EVERY real app form
// (wizard profile → salary → investments → expenses → goals → liabilities →
// insurance → business → other income) as a user would, then verifies persistence
// via the storage adapter. This is the "entered from UI" proof a code fixture cannot
// give. See .claude/rules/ui-verification.md "Data ENTRY".
// Run: node scripts/enter-persona-via-ui.mjs [--headless]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Port-configurable (ENTRY_BASE) so the engine runs against any dev-server port — 5175 is often
// occupied by another worktree's server, and a demo-mode run may use a side port (§A2.6 continuation).
const BASE = process.env.ENTRY_BASE || "http://localhost:5175";
const headless = process.argv.includes("--headless");
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = `verification-screenshots/mauryas-ENTRY-${ts}`;
mkdirSync(OUT, { recursive: true });

// UI-constraint notes (surfaced by entering through the real forms — the fixture hid these):
//  • PPF/NPS/EPF allowJoint:false → owner must be an EARNER (Madhu's PPF → Abhay).
//  • Other-income + business owners are member-scoped with NO "Joint" (seed Joint → Abhay).
//  • Recurring-expense form exposes `kind` not `inflationBucket`, no "education" kind.
// Standard 1 (Abhay 2026-06-04): fill EVERY field incl optional + each type's detail accordion.
// For tradables the value DERIVES from qty×price, so qty×price is set == the intended value.
const INVESTMENTS = [
  { type: "EPF · VPF (auto)", value: 4500000, owner: "Abhay Maurya", epf: true, vpf: 5 },
  { type: "Stocks", label: "Direct equity portfolio", value: 2500000, monthly: 20000, owner: "Abhay Maurya", holdings: 25, bucket: "Bucket 3", det: { Quantity: 250, "Avg price / share": 10000 } },
  { type: "Mutual Funds", label: "Mutual fund SIPs (multi-cap)", value: 6000000, monthly: 25000, owner: "Abhay Maurya", bucket: "Bucket 3", det: { Units: 60000, "NAV / unit": 100 } },
  { type: "Mutual Funds", label: "Madhu's mutual funds", value: 3500000, monthly: 0, owner: "Madhu Kushwaha", bucket: "Bucket 3", det: { Units: 35000, "NAV / unit": 100 } },
  { type: "PPF", label: "PPF (Abhay)", value: 2500000, monthly: 12500, owner: "Abhay Maurya", bucket: "Bucket 4", det: { "Account opening year": 2010 } },
  { type: "PPF", label: "PPF (Madhu → Abhay)", value: 1800000, monthly: 12500, owner: "Abhay Maurya", bucket: "Bucket 4", det: { "Account opening year": 2012 } },
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
  { type: "Life", provider: "LIC term", sum: 5000000, prem: 8000, insured: "Madhu Kushwaha" },
  { type: "Vehicle", provider: "HDFC Ergo Comprehensive", sum: 800000, prem: 18000, insured: "Abhay Maurya" },
];
const OTHER_INCOME = [
  { typeChip: "Rental", label: "Let-out flat rental", amount: 18000, freq: "Monthly", owner: "Abhay Maurya" },
  { typeChip: "Dividend", label: "PIFS Pvt Ltd dividend", amount: 50000, freq: "Annual", owner: "Abhay Maurya", source: "PIFS" },
  { typeChip: "Interest", label: "Savings + FD interest", amount: 40000, freq: "Annual", owner: "Abhay Maurya" },
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
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const log = (m) => console.log(m);
const sel = async (labelRe, optionName) => {
  await page.getByLabel(labelRe, { exact: false }).first().click({ force: true });
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: optionName, exact: true }).click();
};
async function count(key) {
  return page.evaluate((k) => {
    for (let i = 0; i < localStorage.length; i++) {
      const lk = localStorage.key(i);
      if (lk && lk.endsWith(":household")) {
        try {
          const h = JSON.parse(localStorage.getItem(lk));
          if (k === "members") return (h.members || []).length;
          if (k === "investments") return (h.investments || []).length;
          if (k === "recurring") return (h.expenses?.recurring || []).filter((x) => x.source === "manual").length;
          if (k === "planned") return (h.expenses?.plannedFuture || []).length;
          if (k === "liabilities") return (h.liabilities || []).length;
          if (k === "insurance") return (h.insurance || []).length;
          if (k === "businesses") return (h.businesses || []).length;
          if (k === "otherIncome") return (h.otherIncome || []).length;
          if (k === "avgMonthly") return h.expenses?.avgMonthly || 0;
          if (k === "salaryCTC") return (h.members || []).find((m) => m.salary)?.salary?.annualCTC || 0;
        } catch {}
      }
    }
    return 0;
  }, key);
}
const r = {};
const overview = {};
let fieldOk = true, corpusOk = true, fireOk = true;
const crud = {};
const readHH = () => page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.endsWith(":household")) { try { return JSON.parse(localStorage.getItem(k)); } catch {} }
  }
  return null;
});
const go = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(700); await dismissTour(); };

// Standard 2 (Abhay 2026-06-04): after each section's save, open that section's OVERVIEW
// screen and verify the entered data actually RENDERS there (not just storage). Asserts the
// expected substrings are present AND the empty-state phrase is absent.
async function verifyOverview(name, path, mustContain = [], mustNotContain = []) {
  await go(path);
  await page.waitForTimeout(1000);
  const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const missing = mustContain.filter((s) => !txt.includes(s));
  const leaked = mustNotContain.filter((s) => txt.includes(s));
  const ok = missing.length === 0 && leaked.length === 0;
  overview[name] = ok;
  await page.screenshot({ path: `${OUT}/ov-${name}.png`, fullPage: true });
  log(`   overview[${name}] ${ok ? "✅" : `❌ missing=${JSON.stringify(missing)} leaked=${JSON.stringify(leaked)}`}`);
}

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  // ───────── 1. Members (wizard) ─────────
  await page.getByRole("button", { name: /begin wizard/i }).click();
  await page.waitForURL(/\/wizard/, { timeout: 15000 });
  await dismissTour();
  // Settle: the URL flips to /wizard before the profile step's lazy component finishes mounting;
  // wait for the first control to be present so the gated run is not flaky (observed 2026-06-07).
  await page.getByLabel("Setup mode").waitFor({ state: "visible", timeout: 15000 });
  await page.getByLabel("Setup mode").click({ force: true });
  await page.getByRole("option", { name: "Solo" }).click();
  await page.getByLabel(/household name/i).fill("The Maurya Family");
  const ec = page.locator(".person-card").first();
  await ec.getByLabel("Name").fill("Abhay Maurya");
  await ec.locator('[aria-label="Edit details"]').click().catch(() => {});
  await ec.getByLabel("Date of birth").fill("1981-12-28");
  await ec.getByTestId("member-retire-age").locator("input").fill("50");
  await ec.getByTestId("member-plan-to-age").locator("input").fill("90");
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
    await c.getByLabel("Relation").fill(d.relation);
    if (d.edu) { await c.getByLabel("Education stage").click({ force: true }); await page.getByRole("option", { name: d.edu }).click(); }
  }
  await shot("01-profile");
  await page.getByRole("button", { name: /save profile/i }).click();
  await page.waitForTimeout(800);
  r.members = await count("members");
  log(`1. members: ${r.members}/3`);

  // ───────── 2. Salary (→ EPF auto-flow) ─────────
  // Click the FeaturedRail earner card (@click emits edit) → EntryDialog with
  // EarnerSalaryForm → its own "Edit salary" pencil → the salary-edit dialog.
  await go("/income/salary");
  try {
    await page.locator(".rail-featured").first().click({ force: true });
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Edit salary" }).click();
    await page.waitForTimeout(500);
    await shot("02-salary-dialog");
    const dlg = page.locator(".v-overlay--active .v-card", { hasText: "Edit salary" }).last();
    await dlg.locator('input[type="number"]').nth(0).fill("4200000"); // Annual CTC
    await dlg.locator('input[type="number"]').nth(1).fill("5");       // Annual hike
    await dlg.locator('input[type="number"]').nth(2).fill("0");       // VPF top-up % (optional)
    await dlg.locator('input[type="number"]').nth(3).fill("1680000"); // Basic + DA
    await dlg.locator('input[type="number"]').nth(4).fill("120000");  // Employer NPS
    await page.getByTestId("employer-sector-select").click({ force: true });
    await page.getByRole("option", { name: /private/i }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    await shot("02b-salary-filled");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /^done$/i }).click().catch(() => {});
  } catch (e) { log(`   ⚠ salary: ${e.message?.split("\n")[0]}`); }
  r.salaryCTC = await count("salaryCTC");
  log(`2. salary CTC: ${r.salaryCTC}`);

  // ───────── 3. Investments ─────────
  await go("/investments/holdings");
  const cta = page.getByRole("button", { name: /add your first investment/i });
  if (await cta.isVisible({ timeout: 2000 }).catch(() => false)) await cta.click();
  for (const inv of INVESTMENTS) {
    try {
      await sel("Type", inv.type);
      await page.waitForTimeout(150);
      if (inv.label) await page.getByLabel(/^label/i).first().fill(inv.label);
      await sel("Owner", inv.owner);
      if (inv.type === "ESOP") {
        await page.getByLabel(/total grant/i).first().fill(String(inv.esopGrant));
        await page.getByLabel(/vested %/i).first().fill(String(inv.esopVested));
        await page.getByTestId("esop-grantor-country").click({ force: true });
        await page.getByRole("option", { name: "US", exact: true }).first().click().catch(() => {});
        if (inv.esopExercise !== undefined) await page.getByTestId("esop-exercise-price").locator("input").fill(String(inv.esopExercise));
        if (inv.esopFmv !== undefined) await page.getByTestId("esop-fmv-at-vest").locator("input").fill(String(inv.esopFmv));
      } else {
        await page.locator('input[type="number"]').first().fill(String(inv.value));
        if (inv.epf && inv.vpf !== undefined) await page.getByLabel(/VPF top-up/i).first().fill(String(inv.vpf));
        if (inv.monthly !== undefined && !inv.epf) await page.getByLabel(/monthly contribution/i).fill(String(inv.monthly));
        if (inv.holdings) await page.getByLabel(/# holdings/i).fill(String(inv.holdings));
      }
      if (inv.bucket) {
        await page.getByTestId("investment-bucket-select").click({ force: true });
        await page.getByRole("option", { name: new RegExp(inv.bucket) }).first().click();
      }
      if (inv.reRole || inv.det) {
        const reRoleVis = await page.getByTestId("re-role-select").isVisible({ timeout: 400 }).catch(() => false);
        const firstDet = inv.det ? Object.keys(inv.det)[0] : null;
        const detVis = firstDet ? await page.getByLabel(firstDet, { exact: false }).first().isVisible({ timeout: 400 }).catch(() => false) : false;
        if (!reRoleVis && !detVis) {
          await page.getByRole("button", { name: /more details/i }).click().catch(() => {});
          await page.waitForTimeout(400);
        }
        if (inv.reRole) {
          await page.getByTestId("re-role-select").click({ force: true });
          await page.getByRole("option", { name: inv.reRole }).first().click();
        }
        if (inv.det) {
          for (const [lbl, val] of Object.entries(inv.det)) {
            await page.getByLabel(lbl, { exact: false }).first().fill(String(val)).catch((e) => log(`     · ${inv.label} field "${lbl}": ${e.message?.split("\n")[0]}`));
          }
        }
      }
      await page.getByRole("button", { name: /^add investment$/i }).click();
      await page.waitForTimeout(400);
    } catch (e) { log(`   ⚠ inv "${inv.label || inv.type}": ${e.message?.split("\n")[0]}`); }
  }
  r.investments = await count("investments");
  await shot("03-investments");
  log(`3. investments: ${r.investments}/${INVESTMENTS.length}`);
  await verifyOverview("investments", "/investments/overview", [], ["No investments yet"]);

  // ───────── 4. Avg monthly burn ─────────
  await go("/expenses/overview");
  await page.getByLabel(/average \/ month/i).first().fill("85000").catch(() => {});
  await page.waitForTimeout(400);
  r.avgMonthly = await count("avgMonthly");
  log(`4. avgMonthly: ${r.avgMonthly}`);

  // ───────── 5. Recurring expenses ─────────
  await go("/expenses/recurring");
  const rcta = page.getByRole("button", { name: /add your first commitment/i });
  if (await rcta.isVisible({ timeout: 2000 }).catch(() => false)) await rcta.click();
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
      await page.waitForTimeout(400);
    } catch (e) { log(`   ⚠ recurring "${x.label}": ${e.message?.split("\n")[0]}`); }
  }
  r.recurring = await count("recurring");
  log(`5. recurring: ${r.recurring}/${RECURRING.length}`);

  // ───────── 6. Planned goals ─────────
  await go("/expenses/planned");
  for (const g of GOALS) {
    try {
      const panel = page.locator(".v-card", { hasText: "Add a planned expense" });
      await panel.getByLabel(/^label/i).fill(g.label);
      await page.getByTestId("planned-kind-select").click({ force: true });
      await page.getByRole("option", { name: g.kind, exact: true }).click();
      await panel.getByLabel(/today's/i).fill(String(g.today));
      await panel.getByLabel(/target year/i).fill(String(g.year));
      if (g.multi) {
        await panel.getByLabel(/multi-year/i).check();
        await panel.getByLabel(/^years/i).fill(String(g.multi));
      }
      await panel.locator(".v-btn--variant-flat").last().click();
      await page.waitForTimeout(400);
    } catch (e) { log(`   ⚠ goal "${g.label}": ${e.message?.split("\n")[0]}`); }
  }
  r.planned = await count("planned");
  log(`6. goals: ${r.planned}/${GOALS.length}`);
  await verifyOverview("expenses", "/expenses/overview", [], ["No recurring commitments"]);

  // ───────── 7. Liabilities ─────────
  await go("/liabilities/loans");
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
      if (l.shared) await panel.getByLabel(/shared with spouse/i).check();
      await panel.getByRole("button", { name: /add loan/i }).click();
      await page.waitForTimeout(400);
    } catch (e) { log(`   ⚠ loan "${l.name}": ${e.message?.split("\n")[0]}`); }
  }
  r.liabilities = await count("liabilities");
  log(`7. liabilities: ${r.liabilities}/${LOANS.length}`);
  await verifyOverview("liabilities", "/liabilities/overview", ["2 loans"], []);

  // ───────── 8. Insurance ─────────
  await go("/insurance/policies");
  for (const p of POLICIES) {
    try {
      await page.getByLabel("Type", { exact: true }).first().click({ force: true });
      await page.getByRole("option", { name: p.type, exact: true }).first().click();
      await page.getByLabel(/provider/i).first().fill(p.provider);
      await page.getByLabel(/sum assured/i).first().fill(String(p.sum));
      await page.getByLabel(/premium/i).first().fill(String(p.prem));
      await page.getByLabel("Per", { exact: true }).first().click({ force: true }); // premium period (optional)
      await page.getByRole("option", { name: "/yr", exact: true }).first().click().catch(() => {});
      await page.getByLabel(/insured person/i).first().click({ force: true });
      await page.getByRole("option", { name: p.insured, exact: true }).first().click();
      await page.getByRole("button", { name: /add policy/i }).first().click();
      await page.waitForTimeout(400);
    } catch (e) { log(`   ⚠ policy "${p.provider}": ${e.message?.split("\n")[0]}`); }
  }
  r.insurance = await count("insurance");
  log(`8. insurance: ${r.insurance}/${POLICIES.length}`);
  await verifyOverview("insurance", "/insurance/overview", ["2 policies"], []);

  // ───────── 9. Business (PIFS) ─────────
  await go("/income/business");
  try {
    await page.getByRole("button", { name: /pvt ltd|private limited/i }).first().click(); // AddTypeChips kind chip → EntryDialog
    await page.waitForTimeout(600);
    await page.getByLabel(/business name/i).first().fill("PIFS Pvt Ltd");
    await page.getByLabel(/^profit/i).first().fill("500000");
    await page.getByLabel(/share %/i).first().fill("100");
    await page.getByLabel("Owner").first().click({ force: true });
    await page.getByRole("option", { name: "Abhay Maurya", exact: true }).first().click();
    await page.getByRole("button", { name: /add business/i }).first().click();
    await page.waitForTimeout(600);
  } catch (e) { log(`   ⚠ business: ${e.message?.split("\n")[0]}`); }
  r.businesses = await count("businesses");
  log(`9. businesses: ${r.businesses}/1`);

  // ───────── 10. Other income ─────────
  await go("/income/other-sources");
  for (const o of OTHER_INCOME) {
    try {
      await page.getByRole("button", { name: o.typeChip, exact: true }).first().click(); // AddTypeChips type chip → EntryDialog
      await page.waitForTimeout(600);
      await page.getByLabel(/^amount/i).first().fill(String(o.amount));
      await page.getByLabel("Frequency").first().click({ force: true });
      await page.getByRole("option", { name: o.freq, exact: true }).first().click();
      if (o.source) { await page.getByLabel("Source").first().click({ force: true }); await page.getByRole("option", { name: new RegExp(o.source) }).first().click(); }
      await page.getByLabel(/^label/i).first().fill(o.label);
      await page.getByLabel("Owner").first().click({ force: true });
      await page.getByRole("option", { name: o.owner, exact: true }).first().click();
      await page.getByRole("button", { name: new RegExp(`add ${o.typeChip}`, "i") }).first().click();
      await page.waitForTimeout(500);
    } catch (e) { log(`   ⚠ other-income "${o.label}": ${e.message?.split("\n")[0]}`); }
  }
  r.otherIncome = await count("otherIncome");
  log(`10. otherIncome: ${r.otherIncome}/${OTHER_INCOME.length}`);
  await verifyOverview("income", "/income/overview", ["42.00"], []);

  // ── Substance: per-OPTIONAL-field VALUES (not just counts) + corpus fidelity ──
  const h = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(":household")) { try { return JSON.parse(localStorage.getItem(k)); } catch {} }
    }
    return null;
  });
  if (h) {
    const inv = h.investments || [];
    const fnd = (s) => inv.find((i) => (i.label || "").includes(s)) || {};
    const checks = [
      ["crypto coin=BTC", fnd("Crypto").coin === "BTC"],
      ["FD bank=SBI", fnd("Emergency fund").bank === "SBI"],
      ["FD interestRate=7", Number(fnd("Emergency fund").interestRate) === 7],
      ["FD maturityYear=2028", Number(fnd("Emergency fund").maturityYear) === 2028],
      ["PPF(Abhay) openingYear=2010", Number(fnd("PPF (Abhay)").openingYear) === 2010],
      ["NPS openingYear=2016", Number(fnd("NPS").openingYear) === 2016],
      ["ESOP grantorCountry=US", fnd("Cognizant").grantorCountry === "US"],
      ["ESOP fmvAtVest=800", Number(fnd("Cognizant").fmvAtVest) === 800],
      ["RE(3BHK) purchaseYear=2015", Number(fnd("Wakad").purchaseYear) === 2015],
      ["RE(3BHK) role=PrimaryResidence", fnd("Wakad").realEstateRole === "PrimaryResidence"],
      ["stocks holdingsCount=25", Number(fnd("Direct equity").holdingsCount) === 25],
      ["stocks bucket=3", Number(fnd("Direct equity").bucket) === 3],
    ];
    for (const [n, ok] of checks) if (!ok) { fieldOk = false; log(`   ❌ optional field ${n}`); }
    log(`   per-optional-field VALUES: ${fieldOk ? "✅ all 12 correct" : "❌ see above"}`);
    const corpus = inv.filter((i) => !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence")).reduce((s, i) => s + (i.value || 0), 0);
    corpusOk = corpus >= 30000000 && corpus <= 37000000; // seed 3.6Cr − Madhu's unrepresentable ₹30L EPF ≈ 3.3Cr
    log(`   corpus fidelity (ex-home) ₹${(corpus / 1e7).toFixed(2)}Cr → ${corpusOk ? "✅ in [3.0,3.7]Cr" : "❌ out of band"}`);
  } else { fieldOk = corpusOk = false; }

  // ── Substance: FIRE headline PLAUSIBILITY on the default lens (rule 31, the bug-#22 class) ──
  await go("/fire-goals/dashboard");
  await page.waitForTimeout(1500);
  await shot("00-dashboard-after-entry");
  const dtxt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const m = dtxt.match(/at age (\d{2})/i);
  const fireAge = m ? Number(m[1]) : null;
  fireOk = fireAge !== null && fireAge >= 45 && fireAge <= 72;
  log(`   FIRE headline age=${fireAge} → ${fireOk ? "✅ plausible" : "❌ implausible/absurd"}`);

  // ───────── CRUD: EDIT + DELETE on the 5 EntityRow forms (#31 H1) ─────────
  // EntityRow = `.entity-row` with `.entity-row__title` + trailing Edit/Delete (immediate, no confirm).
  async function editRow(name, path, rowTitle, editLabelRe, newVal, check) {
    try {
      await go(path);
      const row = page.locator(".entity-row").filter({ hasText: rowTitle }).first();
      await row.getByRole("button", { name: "Edit" }).click();
      await page.waitForTimeout(500);
      // Scope to the ACTIVE dialog — the same label often also exists on the page's add form.
      const dlg = page.locator(".v-overlay--active").last();
      await dlg.getByLabel(editLabelRe).first().fill(String(newVal));
      await dlg.getByRole("button", { name: /save changes/i }).click();
      await page.waitForTimeout(500);
      const h = await readHH();
      crud[`${name}-edit`] = check(h);
    } catch (e) { crud[`${name}-edit`] = false; log(`   ⚠ edit ${name}: ${e.message?.split("\n")[0]}`); }
    log(`   CRUD edit[${name}] ${crud[`${name}-edit`] ? "✅" : "❌"}`);
  }
  async function deleteRow(name, path, rowTitle, key, expectAfter) {
    try {
      await go(path);
      const row = page.locator(".entity-row").filter({ hasText: rowTitle }).first();
      await row.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(500);
      const c = await count(key);
      crud[`${name}-delete`] = c === expectAfter;
      log(`   CRUD delete[${name}] ${crud[`${name}-delete`] ? "✅" : "❌"} (count=${c}, expect ${expectAfter})`);
    } catch (e) { crud[`${name}-delete`] = false; log(`   ⚠ delete ${name}: ${e.message?.split("\n")[0]}`); }
  }
  const reit = (h) => Number((h.investments || []).find((i) => (i.label || "").includes("Listed REIT"))?.value) === 350000;
  const carEmi = (h) => Number((h.liabilities || []).find((l) => l.name === "Car Loan")?.monthlyEMI) === 20000;
  const vehPrem = (h) => Number((h.insurance || []).find((p) => (p.provider || "").includes("HDFC Ergo"))?.annualPremium) === 20000;
  const propTax = (h) => Number((h.expenses?.recurring || []).find((x) => (x.label || "").includes("Property tax"))?.amount) === 30000;
  const vac = (h) => Number((h.expenses?.plannedFuture || []).find((g) => (g.label || "").includes("Foreign vacation"))?.todayAmount) === 500000;

  await editRow("investment", "/investments/holdings", "Listed REIT", /current value/i, 350000, reit);
  await deleteRow("investment", "/investments/holdings", "Listed REIT", "investments", 14);
  await editRow("loan", "/liabilities/loans", "Car Loan", /monthly emi/i, 20000, carEmi);
  await deleteRow("loan", "/liabilities/loans", "Car Loan", "liabilities", 1);
  await editRow("insurance", "/insurance/policies", "HDFC Ergo", /annual premium/i, 20000, vehPrem);
  await deleteRow("insurance", "/insurance/policies", "HDFC Ergo", "insurance", 3);
  await editRow("recurring", "/expenses/recurring", "Property tax", /^amount/i, 30000, propTax);
  await deleteRow("recurring", "/expenses/recurring", "Property tax", "recurring", 3);
  await editRow("goal", "/expenses/planned", "Foreign vacation", /today/i, 500000, vac);
  await deleteRow("goal", "/expenses/planned", "Foreign vacation", "planned", 3);

  // ───────── M1: validation — invalid input disables submit (#31) ─────────
  try {
    await go("/investments/holdings");
    await sel("Type", "Stocks");
    const addBtn = page.getByRole("button", { name: /^add investment$/i });
    await page.locator('input[type="number"]').first().fill("0"); // invalid (rule: > 0)
    await page.waitForTimeout(300);
    const disabledOnInvalid = await addBtn.isDisabled().catch(() => false);
    await page.locator('input[type="number"]').first().fill("100000"); // valid
    await page.waitForTimeout(300);
    const enabledOnValid = await addBtn.isEnabled().catch(() => false);
    crud["validation-gate"] = disabledOnInvalid && enabledOnValid;
    log(`   M1 validation: invalid→disabled=${disabledOnInvalid}, valid→enabled=${enabledOnValid} → ${crud["validation-gate"] ? "✅" : "❌"}`);
  } catch (e) { crud["validation-gate"] = false; log(`   ⚠ validation: ${e.message?.split("\n")[0]}`); }
} catch (err) {
  console.error("ENTRY_FAILED:", err?.message ?? err);
  await shot("FAILURE");
  errors.push(`HARNESS: ${err?.message ?? err}`);
} finally {
  if (!headless) await page.waitForTimeout(1500);
  await browser.close();
}

log("\n──────── FULL UI DATA-ENTRY SUMMARY ────────");
const exp = { members: 3, salaryCTC: 4200000, investments: 15, avgMonthly: 85000, recurring: 4, planned: 4, liabilities: 2, insurance: 4, businesses: 1, otherIncome: 3 };
let allOk = true;
for (const [k, v] of Object.entries(exp)) {
  const got = r[k] ?? 0;
  const ok = k === "salaryCTC" || k === "avgMonthly" ? got === v : got >= v - 1;
  if (!ok) allOk = false;
  log(`${ok ? "✅" : "❌"} ${k}: ${got} (expected ${v})`);
}
log("--- per-section OVERVIEW render checks ---");
for (const [k, v] of Object.entries(overview)) log(`${v ? "✅" : "❌"} overview[${k}] data renders on screen`);
const ovOk = Object.values(overview).every(Boolean);
if (!ovOk) allOk = false;
log("--- SUBSTANCE checks (per-field values + corpus + FIRE plausibility) ---");
log(`${fieldOk ? "✅" : "❌"} per-optional-field VALUES   ${corpusOk ? "✅" : "❌"} corpus fidelity   ${fireOk ? "✅" : "❌"} FIRE headline plausible`);
if (!fieldOk || !corpusOk || !fireOk) allOk = false;
log("--- CRUD edit+delete checks (#31 H1) ---");
for (const [k, v] of Object.entries(crud)) log(`${v ? "✅" : "❌"} crud[${k}]`);
const crudOk = Object.keys(crud).length > 0 && Object.values(crud).every(Boolean);
if (!crudOk) allOk = false;
log(`page errors: ${errors.length ? JSON.stringify(errors) : "none"}`);
log(`screenshots: ${OUT}`);
log(`VERDICT: ${allOk && errors.length === 0 ? "PASS ✅" : "PARTIAL — iterate"}`);
process.exit(allOk && errors.length === 0 ? 0 : 1);

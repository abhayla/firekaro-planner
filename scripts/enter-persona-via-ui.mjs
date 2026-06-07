// Headed UI DATA-ENTRY for a FULL household — drives EVERY real app form (wizard profile →
// salary → investments → expenses → goals → liabilities → insurance → business → other income)
// as a user would, then verifies persistence via the storage adapter + renders on each section
// overview. This is the "entered from UI" proof a code fixture cannot give. See
// .claude/rules/ui-verification.md "Data ENTRY". §A2.6: persona-driven + SEQUENTIAL GATED.
// Run: PERSONA=mauryas|sharmas|iyers|mehtas ENTRY_BASE=http://localhost:5178 \
//        node scripts/enter-persona-via-ui.mjs [--headless]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Port-configurable (ENTRY_BASE) so the engine runs against any dev-server port — 5175 is often
// occupied by another worktree's server, and a demo-mode run may use a side port (§A2.6).
const BASE = process.env.ENTRY_BASE || "http://localhost:5175";
const headless = process.argv.includes("--headless");
const PKEY = process.env.PERSONA || "mauryas";
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = `verification-screenshots/${PKEY}-ENTRY-${ts}`;
mkdirSync(OUT, { recursive: true });

// UI-constraint notes (surfaced by entering through the real forms — the fixture hid these):
//  • PPF/NPS/EPF allowJoint:false → owner must be an EARNER.
//  • Other-income + business owners are member-scoped with NO "Joint" → assign to an earner.
//  • Recurring-expense form exposes `kind` not `inflationBucket`, no "education" kind.
// Standard 1 (Abhay 2026-06-04): fill EVERY field incl optional + each type's detail accordion.
// For tradables the value DERIVES from qty×price, so qty×price is set == the intended value.

const PERSONAS = {
  // ── Persona #1: MAURYAS — single-income, full-spread (every investment type). Solo setup. ──
  mauryas: {
    householdName: "The Maurya Family",
    setupMode: "Solo",
    earners: [
      { name: "Abhay Maurya", dob: "1981-12-28", retire: 50, planTo: 90, ctc: 4200000, hike: 5, vpf: 0, basic: 1680000, nps: 120000, sector: "private" },
    ],
    dependents: [
      { name: "Madhu Kushwaha", dob: "1981-04-15", relation: "Spouse" },
      { name: "Myra Maurya", dob: "2014-09-01", relation: "Child", edu: "Secondary" },
    ],
    INVESTMENTS: [
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
    ],
    avgMonthly: 85000,
    RECURRING: [
      { label: "Society maintenance", amount: 7000, freq: "Monthly", kind: "General" },
      { label: "Property tax", amount: 25000, freq: "Annual", kind: "General" },
      { label: "Parents support (Abhay's parents)", amount: 25000, freq: "Monthly", kind: "Parents (sandwich-gen)" },
      { label: "Myra's school fees", amount: 15000, freq: "Monthly", kind: "General" },
    ],
    GOALS: [
      { label: "Myra's higher education", kind: "Education", today: 12000000, year: 2032, multi: 4 },
      { label: "Myra's wedding", kind: "Marriage", today: 4000000, year: 2040 },
      { label: "Car replacement", kind: "General", today: 1500000, year: 2029 },
      { label: "Foreign vacation", kind: "General", today: 400000, year: 2027 },
    ],
    LOANS: [
      { name: "SBI Home Loan", type: "Home Loan", outstanding: 3500000, emi: 45000, rate: 8.5, owner: "Abhay Maurya", shared: true },
      { name: "Car Loan", type: "Car Loan", outstanding: 600000, emi: 18000, rate: 9.5, owner: "Abhay Maurya", shared: false },
    ],
    POLICIES: [
      { type: "Health", provider: "Family floater", sum: 1500000, prem: 35000, insured: "Abhay Maurya" },
      { type: "Life", provider: "HDFC Click2Protect (term)", sum: 30000000, prem: 25000, insured: "Abhay Maurya" },
      { type: "Life", provider: "LIC term", sum: 5000000, prem: 8000, insured: "Madhu Kushwaha" },
      { type: "Vehicle", provider: "HDFC Ergo Comprehensive", sum: 800000, prem: 18000, insured: "Abhay Maurya" },
    ],
    business: { name: "PIFS Pvt Ltd", kindRe: /pvt ltd|private limited/i, profit: 500000, share: 100, owner: "Abhay Maurya" },
    OTHER_INCOME: [
      { typeChip: "Rental", label: "Let-out flat rental", amount: 18000, freq: "Monthly", owner: "Abhay Maurya" },
      { typeChip: "Dividend", label: "PIFS Pvt Ltd dividend", amount: 50000, freq: "Annual", owner: "Abhay Maurya", source: "PIFS" },
      { typeChip: "Interest", label: "Savings + FD interest", amount: 40000, freq: "Annual", owner: "Abhay Maurya" },
    ],
    expected: { members: 3, salaryCTC: 4200000, investments: 15, avgMonthly: 85000, recurring: 4, planned: 4, liabilities: 2, insurance: 4, businesses: 1, otherIncome: 3 },
    overview: { investments: [[], ["No investments yet"]], expenses: [[], ["No recurring commitments"]], liabilities: [["2 loans"], []], insurance: [["2 policies"], []], income: [["42.00"], []] },
    corpus: [30000000, 37000000], // ex-home (seed 3.6Cr − Madhu's unrepresentable ₹30L EPF)
    fireAge: [45, 72],
    crud: true, // Mauryas runs the full CRUD edit/delete + validation lock (#31 H1)
  },

  // ── Persona #2: SHARMAS — the LOCKED target persona (urban salaried dual-income family). ──
  // Mapped from src/lib/seed-persona.ts. Couple+Children: 2 earners (Rohit, Priya) + 2 kids.
  sharmas: {
    householdName: "The Sharma Family",
    setupMode: "Couple+Children",
    earners: [
      { name: "Rohit", dob: "1996-01-15", retire: 47, planTo: 90, ctc: 2500000, hike: 9, vpf: 0, basic: 1000000, nps: 0, sector: "private" },
      { name: "Priya", dob: "1997-01-15", retire: 50, planTo: 90, ctc: 1800000, hike: 8, vpf: 0, basic: 720000, nps: 0, sector: "private" },
    ],
    dependents: [
      { name: "Aarav", dob: "2022-01-15", relation: "Child", edu: "Preschool" },
      { name: "Meera", dob: "2024-01-15", relation: "Child", edu: "Preschool" },
    ],
    INVESTMENTS: [
      { type: "EPF · VPF (auto)", value: 1500000, owner: "Rohit", epf: true, vpf: 0 },
      { type: "EPF · VPF (auto)", value: 900000, owner: "Priya", epf: true, vpf: 0 },
      { type: "Stocks", label: "My equity portfolio", value: 1800000, monthly: 20000, owner: "Rohit", holdings: 18, bucket: "Bucket 3", det: { Quantity: 180, "Avg price / share": 10000 } },
      { type: "Mutual Funds", label: "SIP basket", value: 2500000, monthly: 50000, owner: "Rohit", bucket: "Bucket 3", det: { Units: 25000, "NAV / unit": 100 } },
      { type: "Mutual Funds", label: "Priya's equity SIPs", value: 1200000, monthly: 22000, owner: "Priya", bucket: "Bucket 3", det: { Units: 12000, "NAV / unit": 100 } },
      { type: "PPF", label: "PPF account", value: 600000, monthly: 12500, owner: "Rohit", bucket: "Bucket 4", det: { "Account opening year": 2015 } },
      { type: "Real Estate", label: "2BHK Whitefield Bengaluru", value: 9500000, owner: "Joint", reRole: "Primary residence (excluded from FIRE corpus)", det: { "Purchase year": 2018 } },
      { type: "Gold", label: "Family gold", value: 400000, owner: "Joint", bucket: "Bucket 3", det: { Grams: 80, "Price/gram": 5000 } },
      { type: "FD / Bonds", label: "Emergency fund FD", value: 200000, owner: "Joint", bucket: "Bucket 1", det: { Principal: 200000, "Interest %": 7, "Maturity year": 2028, Bank: "HDFC" } },
      { type: "NPS", label: "NPS Tier-I", value: 400000, monthly: 5000, owner: "Rohit", bucket: "Bucket 4", det: { "Opening year": 2017 } },
      { type: "ESOP", esopGrant: 2500000, esopVested: 60, label: "Company ESOPs", owner: "Rohit", esopExercise: 100, esopFmv: 800 },
    ],
    avgMonthly: 45000,
    RECURRING: [
      { label: "Rent", amount: 35000, freq: "Monthly", kind: "General" },
      { label: "Society maintenance", amount: 12000, freq: "Quarterly", kind: "General" },
      { label: "Property tax", amount: 18000, freq: "Annual", kind: "General" },
      { label: "Parents support (Rohit's parents)", amount: 40000, freq: "Monthly", kind: "Parents (sandwich-gen)" },
    ],
    GOALS: [
      { label: "Aarav's overseas Masters", kind: "Education", today: 15000000, year: 2040, multi: 2 },
      { label: "Meera's college", kind: "Education", today: 4000000, year: 2042, multi: 4 },
      { label: "Aarav's wedding", kind: "Marriage", today: 2500000, year: 2050 },
      { label: "Meera's wedding", kind: "Marriage", today: 2500000, year: 2052 },
      { label: "Foreign vacation", kind: "General", today: 500000, year: 2028 },
    ],
    LOANS: [
      { name: "SBI Home Loan", type: "Home Loan", outstanding: 3800000, emi: 42000, rate: 8.5, owner: "Rohit", shared: true },
    ],
    POLICIES: [
      { type: "Health", provider: "Star Health Family Floater", sum: 1000000, prem: 22000, insured: "Rohit" },
      { type: "Life", provider: "HDFC Click2Protect (term)", sum: 25000000, prem: 15000, insured: "Rohit" },
      { type: "Life", provider: "ICICI iProtect Smart (term)", sum: 18000000, prem: 12000, insured: "Priya" },
      { type: "Vehicle", provider: "HDFC Ergo Comprehensive", sum: 800000, prem: 18000, insured: "Rohit" },
    ],
    business: { name: "Sharma Consulting", kindRe: /pvt ltd|private limited/i, profit: 600000, share: 100, owner: "Rohit" },
    OTHER_INCOME: [
      { typeChip: "Rental", label: "1BHK rental", amount: 15000, freq: "Monthly", owner: "Rohit" },
      { typeChip: "Dividend", label: "Pvt Ltd dividend", amount: 50000, freq: "Annual", owner: "Rohit", source: "Sharma" },
      { typeChip: "Interest", label: "Savings + FD interest", amount: 40000, freq: "Annual", owner: "Rohit" },
    ],
    expected: { members: 4, salaryCTC: 2500000, investments: 11, avgMonthly: 45000, recurring: 4, planned: 5, liabilities: 1, insurance: 4, businesses: 1, otherIncome: 3 },
    overview: { investments: [[], ["No investments yet"]], expenses: [[], ["No recurring commitments"]], liabilities: [[], []], insurance: [[], []], income: [[], []] },
    corpus: [9000000, 14000000],
    fireAge: [40, 68],
    crud: null,
  },

  // ── Persona #3: IYERS — late-30s sandwich-gen (2 earners + 2 kids + 2 dependent parents). ──
  // Mapped from src/seeds/iyers.ts. No business, no other-income; ~₹2.5Cr corpus incl. EPF.
  iyers: {
    householdName: "The Iyer Family",
    setupMode: "Couple+Children",
    earners: [
      { name: "Ashwin", dob: "1988-06-15", retire: 55, planTo: 90, ctc: 3500000, hike: 10, vpf: 0, basic: 1400000, nps: 0, sector: "private" },
      { name: "Lakshmi", dob: "1990-06-15", retire: 55, planTo: 90, ctc: 800000, hike: 8, vpf: 0, basic: 320000, nps: 0, sector: "private" },
    ],
    dependents: [
      { name: "Ananya", dob: "2016-06-15", relation: "Daughter", edu: "Primary" },
      { name: "Rohan", dob: "2018-06-15", relation: "Son", edu: "Primary" },
      { name: "Ramesh (father)", dob: "1958-06-15", relation: "Father" },
      { name: "Sudha (mother)", dob: "1961-06-15", relation: "Mother" },
    ],
    INVESTMENTS: [
      { type: "EPF · VPF (auto)", value: 6000000, owner: "Ashwin", epf: true, vpf: 0 },
      { type: "EPF · VPF (auto)", value: 1600000, owner: "Lakshmi", epf: true, vpf: 0 },
      { type: "Mutual Funds", label: "Index + Flexi-cap MF", value: 12000000, monthly: 50000, owner: "Ashwin", bucket: "Bucket 3", det: { Units: 120000, "NAV / unit": 100 } },
      { type: "Mutual Funds", label: "ELSS", value: 2000000, monthly: 12500, owner: "Lakshmi", bucket: "Bucket 3", det: { Units: 20000, "NAV / unit": 100 } },
      { type: "PPF", label: "Ashwin PPF", value: 1500000, monthly: 12500, owner: "Ashwin", bucket: "Bucket 4", det: { "Account opening year": 2014 } },
      { type: "NPS", label: "Ashwin NPS T1", value: 800000, monthly: 4200, owner: "Ashwin", bucket: "Bucket 4", det: { "Opening year": 2015 } },
      { type: "Gold", label: "Sovereign Gold Bonds", value: 500000, owner: "Joint", bucket: "Bucket 3", det: { Grams: 100, "Price/gram": 5000 } },
      { type: "FD / Bonds", label: "Emergency FD", value: 600000, owner: "Joint", bucket: "Bucket 1", det: { Principal: 600000, "Interest %": 6.5, "Maturity year": 2028, Bank: "SBI" } },
    ],
    avgMonthly: 45000,
    RECURRING: [
      { label: "Home rent (until home loan ends)", amount: 32000, freq: "Monthly", kind: "General" },
      { label: "Parents medical + support", amount: 18000, freq: "Monthly", kind: "Parents (sandwich-gen)" },
      { label: "Kids school fees", amount: 25000, freq: "Monthly", kind: "General" },
    ],
    GOALS: [
      { label: "Ananya's undergrad (Indian Tier-1)", kind: "Education", today: 5000000, year: 2034 },
      { label: "Rohan's undergrad", kind: "Education", today: 5000000, year: 2036 },
    ],
    LOANS: [
      { name: "Home Loan (SBI)", type: "Home Loan", outstanding: 3600000, emi: 34000, rate: 8.5, owner: "Ashwin", shared: true },
    ],
    POLICIES: [
      { type: "Life", provider: "LIC Term", sum: 20000000, prem: 22000, insured: "Ashwin" },
      { type: "Health", provider: "Star Family Floater", sum: 1500000, prem: 28000, insured: "Ashwin" },
      { type: "Health", provider: "Senior Floater (Parents)", sum: 1000000, prem: 45000, insured: "Ramesh (father)" },
    ],
    business: null,
    OTHER_INCOME: [],
    expected: { members: 6, salaryCTC: 3500000, investments: 8, avgMonthly: 45000, recurring: 3, planned: 2, liabilities: 1, insurance: 3, businesses: 0, otherIncome: 0 },
    overview: { investments: [[], ["No investments yet"]], expenses: [[], ["No recurring commitments"]], liabilities: [[], []], insurance: [[], []], income: [[], []] },
    corpus: [23000000, 27000000],
    fireAge: [45, 70],
    crud: null,
  },

  // ── Persona #4: MEHTAS — DINK couple near FIRE (2 earners, NO children, home loan paid off). ──
  // Mapped from src/seeds/mehtas.ts. ~₹4.5Cr corpus ex-home; RE is the (excluded) primary residence.
  mehtas: {
    householdName: "The Mehta Family",
    setupMode: "Couple",
    earners: [
      { name: "Vikram", dob: "1981-06-15", retire: 47, planTo: 90, ctc: 4500000, hike: 6, vpf: 0, basic: 1800000, nps: 0, sector: "private" },
      { name: "Aanya", dob: "1983-06-15", retire: 48, planTo: 90, ctc: 2800000, hike: 5, vpf: 0, basic: 1120000, nps: 0, sector: "private" },
    ],
    dependents: [],
    INVESTMENTS: [
      { type: "EPF · VPF (auto)", value: 6500000, owner: "Vikram", epf: true, vpf: 0 },
      { type: "EPF · VPF (auto)", value: 3800000, owner: "Aanya", epf: true, vpf: 0 },
      { type: "Stocks", label: "Direct equity (large + mid cap)", value: 8500000, monthly: 50000, owner: "Vikram", holdings: 24, bucket: "Bucket 3", det: { Quantity: 850, "Avg price / share": 10000 } },
      { type: "Mutual Funds", label: "Mutual fund SIPs (multi-cap)", value: 9200000, monthly: 80000, owner: "Vikram", bucket: "Bucket 3", det: { Units: 92000, "NAV / unit": 100 } },
      { type: "PPF", label: "PPF (matured + re-extended)", value: 2800000, monthly: 12500, owner: "Vikram", bucket: "Bucket 4", det: { "Account opening year": 2008 } },
      { type: "PPF", label: "PPF (matured)", value: 2500000, monthly: 12500, owner: "Aanya", bucket: "Bucket 4", det: { "Account opening year": 2009 } },
      { type: "Real Estate", label: "3BHK Bandra Mumbai", value: 35000000, owner: "Joint", reRole: "Primary residence (excluded from FIRE corpus)", det: { "Purchase year": 2012 } },
      { type: "Gold", label: "Family gold + SGB", value: 1200000, owner: "Joint", bucket: "Bucket 3", det: { Grams: 240, "Price/gram": 5000 } },
      { type: "FD / Bonds", label: "Retirement bucket FD", value: 2500000, owner: "Joint", bucket: "Bucket 1", det: { Principal: 2500000, "Interest %": 7, "Maturity year": 2028, Bank: "HDFC" } },
      { type: "NPS", label: "NPS Tier-I", value: 1800000, monthly: 8000, owner: "Vikram", bucket: "Bucket 4", det: { "Opening year": 2012 } },
      { type: "ESOP", esopGrant: 8000000, esopVested: 85, label: "Tech company ESOPs", owner: "Vikram", esopExercise: 100, esopFmv: 800 },
    ],
    avgMonthly: 162000,
    RECURRING: [
      { label: "Society maintenance", amount: 35000, freq: "Monthly", kind: "General" },
      { label: "Property tax", amount: 45000, freq: "Annual", kind: "General" },
      { label: "Health insurance premium", amount: 38000, freq: "Annual", kind: "General" },
    ],
    GOALS: [
      { label: "Retirement world tour", kind: "General", today: 1500000, year: 2027 },
      { label: "Switzerland residency (sabbatical)", kind: "General", today: 2500000, year: 2029 },
    ],
    LOANS: [],
    POLICIES: [
      { type: "Health", provider: "Apollo Munich Optima Restore", sum: 2500000, prem: 38000, insured: "Vikram" },
      { type: "Life", provider: "Term cover — HDFC Click2Protect", sum: 50000000, prem: 28000, insured: "Vikram" },
      { type: "Life", provider: "Term cover — ICICI iProtect", sum: 35000000, prem: 22000, insured: "Aanya" },
    ],
    business: null,
    OTHER_INCOME: [],
    expected: { members: 2, salaryCTC: 4500000, investments: 11, avgMonthly: 162000, recurring: 3, planned: 2, liabilities: 0, insurance: 3, businesses: 0, otherIncome: 0 },
    overview: { investments: [[], ["No investments yet"]], expenses: [[], ["No recurring commitments"]], liabilities: [[], []], insurance: [[], []], income: [[], []] },
    corpus: [42000000, 50000000],
    fireAge: [44, 60],
    crud: null,
  },
};

const P = PERSONAS[PKEY];
if (!P) { console.error(`unknown PERSONA "${PKEY}" — known: ${Object.keys(PERSONAS).join(", ")}`); process.exit(2); }
const { INVESTMENTS, RECURRING, GOALS, LOANS, POLICIES, OTHER_INCOME } = P;

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
const ov = (name) => P.overview[name] || [[], []];

// Fill one wizard person-card (earner or dependent) — expands the details accordion first.
async function fillEarnerCard(card, e) {
  await card.getByLabel("Name").fill(e.name);
  await card.locator('[aria-label="Edit details"]').click().catch(() => {});
  await card.getByLabel("Date of birth").fill(e.dob);
  await card.getByTestId("member-retire-age").locator("input").fill(String(e.retire));
  await card.getByTestId("member-plan-to-age").locator("input").fill(String(e.planTo));
}
async function fillDepCard(card, d) {
  await card.getByLabel("Name").fill(d.name);
  await card.locator('[aria-label="Edit details"]').click().catch(() => {});
  await card.getByLabel("Date of birth").fill(d.dob);
  await card.getByLabel("Relation").fill(d.relation);
  if (d.edu) { await card.getByLabel("Education stage").click({ force: true }); await page.getByRole("option", { name: d.edu }).click().catch(() => {}); }
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
  await page.getByRole("option", { name: P.setupMode, exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByLabel(/household name/i).fill(P.householdName);

  // Positional layout (the testid isn't in the DOM while a card's details accordion is collapsed,
  // so we can't filter by it). Each setup mode pre-creates a known number of EARNER cards first,
  // then DEPENDENT cards; "Add dependent" appends after. None of the 4 personas add earners beyond
  // the default, so earners are always the first P.earners.length cards and deps follow.
  const DEFAULT_DEPS = { Solo: 0, Couple: 0, "Couple+Children": 1, Custom: 0 };
  let needDeps = P.dependents.length - (DEFAULT_DEPS[P.setupMode] ?? 0);
  while (needDeps-- > 0) { await page.getByRole("button", { name: /add dependent/i }).click(); await page.waitForTimeout(300); }
  const card = (idx) => page.locator(".person-card").nth(idx);
  for (let i = 0; i < P.earners.length; i++) await fillEarnerCard(card(i), P.earners[i]);
  for (let i = 0; i < P.dependents.length; i++) await fillDepCard(card(P.earners.length + i), P.dependents[i]);
  await shot("01-profile");
  await page.getByRole("button", { name: /save profile/i }).click();
  await page.waitForTimeout(800);
  r.members = await count("members");
  log(`1. members: ${r.members}/${P.expected.members}`);

  // ───────── 2. Salary (→ EPF auto-flow) — one dialog PER earner ─────────
  await go("/income/salary");
  for (let i = 0; i < P.earners.length; i++) {
    const e = P.earners[i];
    try {
      // FeaturedRail: earner[0] is the FEATURED card; earner[1+] are .rail-compact cards.
      const railCard = i === 0 ? page.locator(".rail-featured").first() : page.locator(".rail-compact").nth(i - 1);
      await railCard.click({ force: true });
      await page.waitForTimeout(700);
      await page.getByRole("button", { name: "Edit salary" }).click();
      await page.waitForTimeout(500);
      if (i === 0) await shot("02-salary-dialog");
      const dlg = page.locator(".v-overlay--active .v-card", { hasText: "Edit salary" }).last();
      await dlg.locator('input[type="number"]').nth(0).fill(String(e.ctc));   // Annual CTC
      await dlg.locator('input[type="number"]').nth(1).fill(String(e.hike));  // Annual hike
      await dlg.locator('input[type="number"]').nth(2).fill(String(e.vpf));   // VPF top-up % (optional)
      await dlg.locator('input[type="number"]').nth(3).fill(String(e.basic)); // Basic + DA
      await dlg.locator('input[type="number"]').nth(4).fill(String(e.nps));   // Employer NPS
      await page.getByTestId("employer-sector-select").click({ force: true });
      await page.getByRole("option", { name: new RegExp(e.sector, "i") }).first().click().catch(() => {});
      await page.waitForTimeout(300);
      if (i === 0) await shot("02b-salary-filled");
      await page.getByRole("button", { name: /save changes/i }).click();
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: /^done$/i }).click().catch(() => {});
      await page.waitForTimeout(300);
    } catch (err) { log(`   ⚠ salary[${e.name}]: ${err.message?.split("\n")[0]}`); }
  }
  r.salaryCTC = await count("salaryCTC");
  log(`2. salary CTC (first earner): ${r.salaryCTC}`);

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
  await verifyOverview("investments", "/investments/overview", ...ov("investments"));

  // ───────── 4. Avg monthly burn ─────────
  await go("/expenses/overview");
  await page.getByLabel(/average \/ month/i).first().fill(String(P.avgMonthly)).catch(() => {});
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
  await verifyOverview("expenses", "/expenses/overview", ...ov("expenses"));

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
  await verifyOverview("liabilities", "/liabilities/overview", ...ov("liabilities"));

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
  await verifyOverview("insurance", "/insurance/overview", ...ov("insurance"));

  // ───────── 9. Business ─────────
  await go("/income/business");
  if (P.business) {
    try {
      await page.getByRole("button", { name: P.business.kindRe }).first().click(); // AddTypeChips kind chip → EntryDialog
      await page.waitForTimeout(600);
      await page.getByLabel(/business name/i).first().fill(P.business.name);
      await page.getByLabel(/^profit/i).first().fill(String(P.business.profit));
      await page.getByLabel(/share %/i).first().fill(String(P.business.share));
      await page.getByLabel("Owner").first().click({ force: true });
      await page.getByRole("option", { name: P.business.owner, exact: true }).first().click();
      await page.getByRole("button", { name: /add business/i }).first().click();
      await page.waitForTimeout(600);
    } catch (e) { log(`   ⚠ business: ${e.message?.split("\n")[0]}`); }
  }
  r.businesses = await count("businesses");
  log(`9. businesses: ${r.businesses}/${P.business ? 1 : 0}`);

  // ───────── 10. Other income ─────────
  await go("/income/other-sources");
  for (const o of OTHER_INCOME) {
    try {
      await page.getByRole("button", { name: o.typeChip, exact: true }).first().click(); // AddTypeChips type chip → EntryDialog
      await page.waitForTimeout(600);
      await page.getByLabel(/^amount/i).first().fill(String(o.amount));
      await page.getByLabel("Frequency").first().click({ force: true });
      await page.getByRole("option", { name: o.freq, exact: true }).first().click();
      if (o.source) { await page.getByLabel("Source").first().click({ force: true }); await page.getByRole("option", { name: new RegExp(o.source) }).first().click().catch(() => {}); }
      await page.getByLabel(/^label/i).first().fill(o.label);
      await page.getByLabel("Owner").first().click({ force: true });
      await page.getByRole("option", { name: o.owner, exact: true }).first().click();
      await page.getByRole("button", { name: new RegExp(`add ${o.typeChip}`, "i") }).first().click();
      await page.waitForTimeout(500);
    } catch (e) { log(`   ⚠ other-income "${o.label}": ${e.message?.split("\n")[0]}`); }
  }
  r.otherIncome = await count("otherIncome");
  log(`10. otherIncome: ${r.otherIncome}/${OTHER_INCOME.length}`);
  await verifyOverview("income", "/income/overview", ...ov("income"));

  // ── Substance: corpus fidelity + FIRE headline plausibility ──
  const h = await readHH();
  if (h) {
    const inv = h.investments || [];
    const corpus = inv.filter((i) => !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence")).reduce((s, i) => s + (i.value || 0), 0);
    corpusOk = corpus >= P.corpus[0] && corpus <= P.corpus[1];
    log(`   corpus fidelity (ex-home) ₹${(corpus / 1e7).toFixed(2)}Cr → ${corpusOk ? `✅ in [${P.corpus[0] / 1e7},${P.corpus[1] / 1e7}]Cr` : "❌ out of band"}`);
    // Mauryas-only: per-optional-field VALUE substance (its full-spread dataset has the rich fields)
    if (PKEY === "mauryas") {
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
    }
  } else { fieldOk = corpusOk = false; }

  // ── Substance: FIRE headline PLAUSIBILITY on the default lens (rule 31, the bug-#22 class) ──
  await go("/fire-goals/dashboard");
  await page.waitForTimeout(1500);
  await shot("00-dashboard-after-entry");
  const dtxt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const m = dtxt.match(/at age (\d{2})/i);
  const fireAge = m ? Number(m[1]) : null;
  fireOk = fireAge !== null && fireAge >= P.fireAge[0] && fireAge <= P.fireAge[1];
  log(`   FIRE headline age=${fireAge} → ${fireOk ? "✅ plausible" : "❌ implausible/absurd"}`);

  // ───────── CRUD: EDIT + DELETE (Mauryas-only — #31 H1 lock; §A3 covers others) ─────────
  if (P.crud) {
    async function editRow(name, path, rowTitle, editLabelRe, newVal, check) {
      try {
        await go(path);
        const row = page.locator(".entity-row").filter({ hasText: rowTitle }).first();
        await row.getByRole("button", { name: "Edit" }).click();
        await page.waitForTimeout(500);
        const dlg = page.locator(".v-overlay--active").last();
        await dlg.getByLabel(editLabelRe).first().fill(String(newVal));
        await dlg.getByRole("button", { name: /save changes/i }).click();
        await page.waitForTimeout(500);
        const hh = await readHH();
        crud[`${name}-edit`] = check(hh);
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

    // M1: validation — invalid input disables submit (#31)
    try {
      await go("/investments/holdings");
      await sel("Type", "Stocks");
      const addBtn = page.getByRole("button", { name: /^add investment$/i });
      await page.locator('input[type="number"]').first().fill("0");
      await page.waitForTimeout(300);
      const disabledOnInvalid = await addBtn.isDisabled().catch(() => false);
      await page.locator('input[type="number"]').first().fill("100000");
      await page.waitForTimeout(300);
      const enabledOnValid = await addBtn.isEnabled().catch(() => false);
      crud["validation-gate"] = disabledOnInvalid && enabledOnValid;
      log(`   M1 validation: invalid→disabled=${disabledOnInvalid}, valid→enabled=${enabledOnValid} → ${crud["validation-gate"] ? "✅" : "❌"}`);
    } catch (e) { crud["validation-gate"] = false; log(`   ⚠ validation: ${e.message?.split("\n")[0]}`); }
  }
} catch (err) {
  console.error("ENTRY_FAILED:", err?.message ?? err);
  await shot("FAILURE");
  errors.push(`HARNESS: ${err?.message ?? err}`);
} finally {
  if (!headless) await page.waitForTimeout(1500);
  await browser.close();
}

log(`\n──────── FULL UI DATA-ENTRY SUMMARY (${PKEY}) ────────`);
const exp = P.expected;
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
log("--- SUBSTANCE checks (corpus + FIRE plausibility" + (PKEY === "mauryas" ? " + per-field values" : "") + ") ---");
log(`${PKEY === "mauryas" ? (fieldOk ? "✅" : "❌") + " per-optional-field VALUES   " : ""}${corpusOk ? "✅" : "❌"} corpus fidelity   ${fireOk ? "✅" : "❌"} FIRE headline plausible`);
if ((PKEY === "mauryas" && !fieldOk) || !corpusOk || !fireOk) allOk = false;
if (P.crud) {
  log("--- CRUD edit+delete checks (#31 H1) ---");
  for (const [k, v] of Object.entries(crud)) log(`${v ? "✅" : "❌"} crud[${k}]`);
  if (!(Object.keys(crud).length > 0 && Object.values(crud).every(Boolean))) allOk = false;
}
log(`page errors: ${errors.length ? JSON.stringify(errors) : "none"}`);
log(`screenshots: ${OUT}`);
log(`VERDICT: ${allOk && errors.length === 0 ? "PASS ✅" : "PARTIAL — iterate"}`);
process.exit(allOk && errors.length === 0 ? 0 : 1);

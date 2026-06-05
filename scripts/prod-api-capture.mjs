import { chromium } from "@playwright/test";
const ctx = await chromium.launchPersistentContext("e2e/.auth/prod-seed-profile", { headless: true });
const p = ctx.pages()[0] || await ctx.newPage();
await p.goto("https://firekaro.com/fire-goals/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 });
await p.waitForTimeout(1500);
const get = async (k) => p.evaluate(async (key) => {
  try { const r = await fetch(`/api/planner/${key}`, { credentials: "include" }); const j = await r.json(); return { status: r.status, ok: j?.success, data: j?.data }; }
  catch (e) { return { status: 0, ok: false, err: String(e) }; }
}, k);
const hh = await get("household");
const as = await get("assumptions");
const me = await get("me");
const d = hh.data || {};
const cnt = (a) => Array.isArray(a) ? a.length : 0;
console.log("GET /api/planner/me        ->", me.status, me.ok ? "ok" : "FAIL");
console.log("GET /api/planner/household ->", hh.status, hh.ok ? "ok" : "FAIL");
console.log("GET /api/planner/assumptions ->", as.status, as.ok ? "ok" : "FAIL");
console.log("household substance:");
console.log("  members      :", cnt(d.members));
console.log("  investments  :", cnt(d.investments));
console.log("  liabilities  :", cnt(d.liabilities));
console.log("  insurance    :", cnt(d.insurance));
console.log("  businesses   :", cnt(d.businesses));
console.log("  otherIncome  :", cnt(d.otherIncome));
console.log("  recurring    :", cnt(d.expenses?.recurring));
console.log("  plannedFuture:", cnt(d.expenses?.plannedFuture));
console.log("  estateChecklist:", cnt(d.estateChecklist));
console.log("  §24b field present on any otherIncome:", (d.otherIncome||[]).some(o=>"homeLoanInterest" in o || "municipalTaxes" in o));
await ctx.close();

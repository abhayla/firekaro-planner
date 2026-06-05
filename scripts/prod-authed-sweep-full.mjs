import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const ts = new Date().toISOString().replace(/[:.]/g,"-");
const OUT = `verification-screenshots/PROD-authed-FULL-${ts}`;
mkdirSync(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext("e2e/.auth/prod-seed-profile", { headless: false, viewport: null, args: ["--start-maximized"] });
const p = ctx.pages()[0] || await ctx.newPage();
const cerr=[]; p.on("console",m=>{ if(m.type()==="error" && !/favicon|devtools|401|Failed to load resource/i.test(m.text())) cerr.push(m.text()); });
const perr=[]; p.on("pageerror",e=>perr.push(String(e)));
const routes = [["/fire-goals/dashboard","dashboard"],["/income/overview","income"],["/income/salary","income-salary"],["/income/business","income-business"],["/income/other-sources","income-other-sources"],["/tax-planning","tax"],["/expenses/overview","expenses"],["/expenses/recurring","expenses-recurring"],["/expenses/planned","expenses-planned"],["/investments/holdings","investments"],["/investments/overview","investments-overview"],["/investments/buckets","buckets"],["/liabilities/overview","liabilities"],["/insurance/overview","insurance"],["/financial-health","health"],["/financial-health/net-worth","net-worth"],["/financial-health/cash-flow","cash-flow"],["/financial-health/emergency-fund","emergency-fund"],["/fire-goals/goals","fire-goals"],["/fire-goals/what-if","what-if"],["/fire-goals/stress-test","stress-test"],["/estate-planning","estate"],["/preferences","preferences"],["/profile","profile"],["/glossary","glossary"]];
let authed=null, bounced=[];
for (const [r,l] of routes){
  await p.goto("https://firekaro.com"+r,{waitUntil:"networkidle",timeout:30000}).catch(()=>{});
  await p.waitForTimeout(1300);
  const url=p.url(); const b=/\/login/.test(url);
  if (authed===null) authed=!b; if (b) bounced.push(r);
  await p.evaluate(()=>document.querySelectorAll(".tour-overlay,.demo-chip").forEach(n=>n.remove())).catch(()=>{});
  await p.screenshot({path:`${OUT}/${l}.png`,fullPage:true});
  console.log(`  ${r} -> ${url.replace("https://firekaro.com","")} ${b?"[BOUNCED]":"[ok]"}`);
}
console.log("authenticated:", authed, "| bounced:", bounced.length?JSON.stringify(bounced):"none");
console.log("console errors:", cerr.length?JSON.stringify(cerr):"none");
console.log("page errors:", perr.length?JSON.stringify(perr):"none");
console.log("screenshots:", OUT, "count:", routes.length);
console.log("VERDICT:", (authed && perr.length===0 && bounced.length===0)?"PASS":"CHECK");
await ctx.close();

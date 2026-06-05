import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const ts = new Date().toISOString().replace(/[:.]/g,"-");
const OUT = `verification-screenshots/PROD-authed-${ts}`;
mkdirSync(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext("e2e/.auth/prod-seed-profile", { headless: true, viewport: {width:1440,height:900} });
const p = ctx.pages()[0] || await ctx.newPage();
const cerr=[]; p.on("console",m=>{ if(m.type()==="error" && !/favicon|devtools|401|Failed to load resource/i.test(m.text())) cerr.push(m.text()); });
const perr=[]; p.on("pageerror",e=>perr.push(String(e)));
const routes = [["/fire-goals/dashboard","dashboard"],["/income/overview","income"],["/tax-planning","tax"],["/expenses/overview","expenses"],["/investments/holdings","investments"],["/liabilities/overview","liabilities"],["/insurance/overview","insurance"],["/financial-health","health"],["/financial-health/net-worth","net-worth"],["/fire-goals/what-if","what-if"],["/fire-goals/stress-test","stress-test"],["/estate-planning","estate"],["/preferences","preferences"],["/profile","profile"]];
let authed=null, bounced=[];
for (const [r,l] of routes){
  await p.goto("https://firekaro.com"+r,{waitUntil:"networkidle",timeout:30000}).catch(()=>{});
  await p.waitForTimeout(1400);
  const url=p.url(); const b=/\/login/.test(url);
  if (authed===null) authed = !b;
  if (b) bounced.push(r);
  await p.evaluate(()=>document.querySelectorAll(".tour-overlay,.demo-chip").forEach(n=>n.remove())).catch(()=>{});
  await p.screenshot({path:`${OUT}/${l}.png`,fullPage:true});
  console.log(`  ${r} -> ${url.replace("https://firekaro.com","")} ${b?"[BOUNCED-login]":"[ok]"}`);
}
// non-destructive interaction (rule 32): open assumptions dialog then close
let interact="n/a";
try {
  await p.goto("https://firekaro.com/fire-goals/dashboard",{waitUntil:"networkidle"}).catch(()=>{});
  await p.waitForTimeout(1200);
  await p.evaluate(()=>document.querySelectorAll(".tour-overlay,.demo-chip").forEach(n=>n.remove()));
  const cog = p.getByRole("button",{name:/Adjust assumptions/i}).first();
  if (await cog.isVisible({timeout:3000}).catch(()=>false)){ await cog.click(); await p.waitForTimeout(700);
    const open = await p.getByText("Assumptions",{exact:true}).first().isVisible({timeout:3000}).catch(()=>false);
    await p.keyboard.press("Escape");
    interact = open ? "assumptions dialog opened+closed OK" : "cog clicked, panel not detected";
    await p.screenshot({path:`${OUT}/interact-assumptions.png`,fullPage:true});
  } else interact="cog not found";
} catch(e){ interact="err: "+(e.message||"").split("\n")[0]; }
const headline = await (async()=>{ try{ await p.goto("https://firekaro.com/fire-goals/dashboard",{waitUntil:"networkidle"}); await p.waitForTimeout(1200); const t=(await p.locator("main,.v-main").innerText()).replace(/\s+/g," "); const m=t.match(/at age (\d{2})|age (\d{2})/i); return m?m[0]:"(no age token)"; }catch{return "(n/a)";} })();
console.log("authenticated:", authed, "| bounced routes:", bounced.length?JSON.stringify(bounced):"none");
console.log("interaction:", interact);
console.log("FIRE headline:", headline);
console.log("console errors:", cerr.length?JSON.stringify(cerr):"none");
console.log("page errors:", perr.length?JSON.stringify(perr):"none");
console.log("screenshots:", OUT, "count:", routes.length);
console.log("VERDICT:", (authed && perr.length===0 && bounced.length===0)?"PASS":"CHECK");
await ctx.close();

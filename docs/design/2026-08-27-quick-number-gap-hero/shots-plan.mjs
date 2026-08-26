// node shots-plan.mjs — Option C result with three levers switched on (step-up + delay + direct), 390 + 1280.
import { createRequire } from "node:module"; import { fileURLToPath, pathToFileURL } from "node:url"; import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const roots = [path.join(here, "../../../package.json"), "D:/Abhay/Ventures/FIREKaro-Vue/package.json"];
let chromium; for (const r of roots) { try { chromium = createRequire(r)("@playwright/test").chromium; break; } catch {} }
const browser = await chromium.launch();
for (const w of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width: w, height: w === 390 ? 844 : 900 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(pathToFileURL(path.join(here, "option-c-merged.html")).href, { waitUntil: "networkidle" });
  for (let k = 0; k < 10; k++) await page.click("#next");
  for (const k of ["stepup", "delay", "direct"]) await page.click(`#levers input[data-k="${k}"]`);
  await page.waitForTimeout(300);
  const txt = await page.locator("#plansum").innerText();
  await page.screenshot({ path: path.join(here, "shots", `option-c-merged.plan.${w}.png`), fullPage: true });
  console.log(w, errs.length ? "ERRORS " + errs.join("|") : "clean", "|", txt.replace(/\s+/g, " ").slice(0, 200));
  await page.close();
}
await browser.close();

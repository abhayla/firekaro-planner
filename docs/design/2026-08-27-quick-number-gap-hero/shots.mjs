// node shots.mjs — screenshots both options at 390 / 1280, fails on console errors.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
const here = path.dirname(fileURLToPath(import.meta.url));
// resolve @playwright/test from the repo root, else from a sibling project that has it installed
const roots = [path.join(here, "../../../package.json"), "D:/Abhay/Ventures/FIREKaro-Vue/package.json", "D:/Abhay/Ventures/algochanakya/package.json"];
let chromium; for (const r of roots) { try { chromium = createRequire(r)("@playwright/test").chromium; break; } catch {} }
if (!chromium) throw new Error("@playwright/test not found in any known root — run npm ci at the repo root");
const out = path.join(here, "shots"); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let bad = 0;
for (const file of ["option-a-quick-number-panel.html", "option-b-conversational.html", "option-c-merged.html"]) {
  for (const w of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width: w, height: w === 390 ? 844 : 900 } });
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(pathToFileURL(path.join(here, file)).href, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const name = `${file.replace(".html", "")}.${w}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: true });
    if (file.startsWith("option-b") || file.startsWith("option-c")) { // also capture the result screen: answer through all 10 cards
      for (let k = 0; k < 10; k++) await page.click("#next");
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `${file.replace(".html", "")}.result.${w}.png`), fullPage: true });
    }
    console.log(`${name} ${errs.length ? "ERRORS: " + errs.join(" | ") : "clean"}`);
    bad += errs.length; await page.close();
  }
}
await browser.close();
process.exit(bad ? 1 : 0);

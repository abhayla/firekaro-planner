// Headed UI verification sweep for a FireKaro seed persona.
// ---------------------------------------------------------------------------
// WHY THIS EXISTS: the MCP Playwright server in this project is configured
// headless (--headless --isolated), so to get a *watchable* headed run with
// preserved screenshots we drive a standalone @playwright/test script instead.
// This is the canonical UI-verification engine — see /verify-ui skill +
// .claude/rules/ui-verification.md.
//
// USAGE:
//   node scripts/verify-persona.mjs [persona] [--headless] [--routes a,b,c]
//   node scripts/verify-persona.mjs              # Mauryas, headed, full sweep
//   node scripts/verify-persona.mjs mehtas       # a different persona
//   node scripts/verify-persona.mjs --headless   # CI / unattended
//   node scripts/verify-persona.mjs mauryas --routes /fire-goals/dashboard,/investments/holdings
//
// Screenshots are PRESERVED per-run under verification-screenshots/<persona>-<ts>/
// (gitignored). The supervisor rule above this session audits those PNGs to
// confirm the claim. Exits non-zero on any page error / console error.
// ---------------------------------------------------------------------------
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5175";

// --- args ---
const argv = process.argv.slice(2);
const headless = argv.includes("--headless");
const routesFlagIdx = argv.indexOf("--routes");
// Guard: when there's no --routes flag, routesFlagIdx is -1 and argv[routesFlagIdx+1] resolves to
// argv[0] (the persona itself) — which would wrongly exclude it and always default to mauryas.
const persona =
  argv.find((a) => !a.startsWith("--") && (routesFlagIdx === -1 || a !== argv[routesFlagIdx + 1])) || "mauryas";

// SEED_META labels (keep in sync with src/seeds/index.ts).
const LABELS = {
  sharmas: "The Sharmas",
  mehtas: "The Mehtas",
  iyers: "The Iyers",
  mauryas: "The Mauryas",
  empty: "Empty Sheet",
};
const personaLabel = LABELS[persona];
if (!personaLabel) {
  console.error(`Unknown persona "${persona}". One of: ${Object.keys(LABELS).join(", ")}`);
  process.exit(2);
}

// Full-sweep default: one representative screen per section (10).
const DEFAULT_ROUTES = [
  ["/fire-goals/dashboard", "fire-dashboard"],
  ["/income/overview", "income"],
  ["/tax-planning", "tax-planning"],
  ["/expenses/overview", "expenses"],
  ["/investments/holdings", "investments"],
  ["/liabilities/overview", "liabilities"],
  ["/insurance/overview", "insurance"],
  ["/financial-health", "financial-health"],
  ["/financial-health/net-worth", "net-worth"],
  ["/financial-health/cash-flow", "cash-flow"],
  ["/investments/buckets", "buckets"],
  ["/fire-goals/goals", "fire-goals"],
  ["/fire-goals/what-if", "what-if"],
  ["/fire-goals/stress-test", "stress-test"],
  ["/estate-planning", "estate-planning"],
  ["/preferences", "preferences"],
  ["/profile", "profile"],
];
const routes =
  routesFlagIdx >= 0 && argv[routesFlagIdx + 1]
    ? argv[routesFlagIdx + 1].split(",").map((r) => [r.trim(), r.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")])
    : DEFAULT_ROUTES;

// Preflight: dev server must be up.
const up = await fetch(BASE).then((r) => r.ok).catch(() => false);
if (!up) {
  console.error(`Dev server not reachable at ${BASE}. Start it first:  npm run dev`);
  process.exit(2);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = `verification-screenshots/${persona}-${ts}`;
mkdirSync(OUT, { recursive: true });

const BENIGN = [/Vue Devtools/i, /favicon/i, /\[vite\] connect/i];
const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({
  headless,
  args: headless ? [] : ["--start-maximized"],
});
const context = await browser.newContext({ viewport: headless ? { width: 1440, height: 900 } : null });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  const text = m.text();
  if (BENIGN.some((re) => re.test(text))) return;
  consoleErrors.push(`[${m.type()}] ${text}`);
});
page.on("pageerror", (e) => pageErrors.push(String(e)));

// The product tour overlay intercepts pointer events on first entry — dismiss it
// before any click/screenshot, else clicks hit the overlay and the screenshot is obscured.
async function dismissTour() {
  await page.keyboard.press("Escape").catch(() => {});
  for (const re of [/skip/i, /got it/i, /done/i, /finish/i, /dismiss/i, /close/i]) {
    const btn = page.getByRole("button", { name: re }).first();
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      await btn.click().catch(() => {});
    }
  }
  // Last resort: strip any lingering overlay so the screenshot is clean.
  await page
    .evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove()))
    .catch(() => {});
}

const inApp = () => page.locator(".seed-switcher-btn").waitFor({ state: "visible", timeout: 30000 });

const result = { persona, personaLabel, out: OUT, screenshots: [], headlineText: "(n/a)" };

try {
  // 1) Enter the app from the splash (fresh context has no data).
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const sample = page.getByRole("button", { name: /try the sample/i });
  await sample.waitFor({ state: "visible", timeout: 30000 });
  await sample.click();
  await inApp();
  await dismissTour();

  // 2) Switch to the target persona (Sharmas is already loaded by the sample CTA).
  if (persona !== "sharmas") {
    // The DemoTour auto-launches ~300ms deferred (rAF + 300ms), so the dismissTour() at entry can
    // miss it and the re-appeared overlay intercepts this click. Clear it RIGHT before, then force.
    await dismissTour();
    await page.locator(".seed-switcher-btn").click({ force: true });
    await page.waitForTimeout(400);
    await page.getByText(personaLabel, { exact: true }).click();
    await page.waitForTimeout(1200); // loadSeed + reactivity / possible reload
    await inApp().catch(() => {});
    await dismissTour();
  }

  // 3) Full sweep — screenshot every route on the DEFAULT product lens.
  for (const [route, label] of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await inApp();
    await dismissTour();
    await page.waitForTimeout(1200); // chart / Vue Query settle
    if (route.includes("fire-goals/dashboard")) {
      result.headlineText = await page
        .locator("main, .v-main")
        .innerText()
        .then((t) => t.replace(/\s+/g, " ").slice(0, 500))
        .catch(() => "(n/a)");
    }
    const file = `${OUT}/${label}.png`;
    await page.screenshot({ path: file, fullPage: true });
    result.screenshots.push(file);
    console.log(`  ✓ ${route} → ${file}`);
  }
} catch (err) {
  console.error("VERIFY_FAILED:", err?.message ?? err);
  await page.screenshot({ path: `${OUT}/FAILURE.png`, fullPage: true }).catch(() => {});
  pageErrors.push(`HARNESS: ${err?.message ?? err}`);
} finally {
  if (!headless) await page.waitForTimeout(1200);
  await browser.close();
}

// --- verdict ---
const failed = pageErrors.length > 0 || consoleErrors.length > 0;
console.log("\n──────── VERIFY SUMMARY ────────");
console.log("persona       :", personaLabel);
console.log("screenshots   :", result.screenshots.length, "→", OUT);
console.log("headline (FIRE):", result.headlineText);
console.log("console errors:", consoleErrors.length ? JSON.stringify(consoleErrors, null, 2) : "none");
console.log("page errors   :", pageErrors.length ? JSON.stringify(pageErrors, null, 2) : "none");
console.log("VERDICT       :", failed ? "FAIL ❌" : "PASS ✅");
process.exit(failed ? 1 : 0);

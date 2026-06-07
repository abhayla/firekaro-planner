// A7.7 — PERFORMANCE BUDGET as a GATE (not just a recorded score).
// Fails (exit 1) if the built JS bundle exceeds budget — a bundle-size regression check that serves
// the friction-free objective (a bloated bundle slows first paint for every user). Run AFTER
// `npm run build`, in CI or pre-merge: `node scripts/check-bundle-budget.mjs`.
//
// Budgets are set ~25% above the 2026-06-07 baseline (total 1198 KB raw across 74 chunks, largest
// chunk 528 KB) so normal growth passes but a bloat regression (e.g. an un-split heavy dep) trips it.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = "dist/assets";
const BUDGET_TOTAL_KB = 1500; // total raw JS across all chunks (~25% over the 1198 KB baseline)
const BUDGET_MAX_CHUNK_KB = 660; // any single chunk (~25% over the 528 KB vendor chunk)

let files;
try {
  files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`[bundle-budget] ${ASSETS_DIR} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const sizes = files
  .map((f) => ({ f, kb: statSync(join(ASSETS_DIR, f)).size / 1024 }))
  .sort((a, b) => b.kb - a.kb);
const totalKb = sizes.reduce((s, x) => s + x.kb, 0);
const largest = sizes[0];

console.log(`[bundle-budget] ${files.length} JS chunks · total ${totalKb.toFixed(0)} KB (budget ${BUDGET_TOTAL_KB}) · largest ${largest.f} ${largest.kb.toFixed(0)} KB (budget ${BUDGET_MAX_CHUNK_KB})`);

const failures = [];
if (totalKb > BUDGET_TOTAL_KB) failures.push(`total JS ${totalKb.toFixed(0)} KB exceeds budget ${BUDGET_TOTAL_KB} KB`);
if (largest.kb > BUDGET_MAX_CHUNK_KB) failures.push(`largest chunk ${largest.f} ${largest.kb.toFixed(0)} KB exceeds budget ${BUDGET_MAX_CHUNK_KB} KB`);

if (failures.length) {
  console.error("[bundle-budget] FAIL:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("[bundle-budget] PASS — within budget.");

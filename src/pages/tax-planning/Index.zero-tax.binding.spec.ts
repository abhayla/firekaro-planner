/**
 * Template/logic-binding lock for tax-planning/Index.vue's zero-tax collapse — gh #185 step 7
 * (income-path kernel spec §7: "tax section collapses to 'you pay zero tax' below ₹12L").
 *
 * Same dep-free source-scan pattern as FireHero.binding.spec.ts (this repo's node test env has no
 * DOM/@vue/test-utils and the contract bans new deps): live behaviour (Ravi vs Sharmas rendering,
 * the toggle) is verified in-browser via Playwright (rules 24/32); this spec pins the BINDINGS —
 * above all the honesty guard that the collapse can never fire on a real, non-zero figure, and
 * that the rebate threshold is read from the FY config, never hardcoded.
 *
 * Honesty surfaces locked here:
 *   - the gate is `activeResult.totalTax === 0 && perEarner.every(row => row.tax === 0)` — BOTH
 *     the household-pooled figure AND every earner's OWN computed tax (tax is per assessee; a
 *     two-earner household can pool to ₹0 while one earner's real bill, computed via
 *     `computeEarnerTaxCard`, is non-zero — round-2 CRITICAL fix). The pooled half never fires
 *     alone; a household that has actively chosen a regime with real tax due (pooled OR any
 *     earner) always sees the full section, including the per-earner table itself;
 *   - a genuine ₹0-₹0 tie collapses regardless of which side `pageRecommended`'s `<=` tie-break
 *     lands on, because the number shown is honestly zero either way (Playwright-proven: Ravi at
 *     ₹3L ties at ₹0/₹0 and `pageRecommended` resolves to OLD, yet the collapse still fires and
 *     the card names the Old regime's exemption/rebate);
 *   - the rebate limit shown in the New-regime copy comes from `getTaxConfigForFY(...).newRegime
 *     .rebateLimit` (the SAME constant the engine uses), never a literal `1200000`;
 *   - the Old-regime branch's "(the New regime also computes to ₹0...)" clause is GUARDED on
 *     `newResult.totalTax === 0` — round-2 FinTech HIGH fix — never asserted unconditionally,
 *     since a household could be on Old with New actually non-zero;
 *   - the card states its scope (slab income only; capital gains and TDS-on-filing called out —
 *     round-2 FinTech MEDIUM) and, on the Old-regime branch, that New is the statutory default and
 *     Old is an opt-in (round-2 FinTech addendum) — a ₹0/₹0 tie must not read as advice to opt out;
 *   - the collapsed card and the "show full section anyway" escape hatch both carry stable
 *     testids so Playwright/e2e can assert on them without coupling to copy;
 *   - the optimisation machinery (income/deduction meters, tax breakdown, tax cliff, per-earner
 *     table, filing disclaimer) is gated behind the SAME `zeroTaxSectionVisible` computed as the
 *     card's inverse — one gate, not two independently-driftable ones.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./Index.vue", import.meta.url)), "utf8");
const script = src.slice(0, src.indexOf("<template>"));
const template = src.slice(src.indexOf("<template>"));

describe("tax-planning Index.vue — zero-tax collapse (gh #185 step 7)", () => {
  it("the gate never fires on a real non-zero figure (honesty guard)", () => {
    // Gated on the CURRENTLY DISPLAYED regime's own computed tax (activeResult, which already
    // respects an explicit OLD/NEW pick via `mode`) being exactly zero — never a bare income/
    // threshold comparison, and never restricted to only the NEW-regime path (a genuine OLD-regime
    // ₹0 tie, e.g. Ravi's ₹3L household, must collapse too).
    expect(script).toMatch(
      /const isZeroTaxRecommended = computed\(\s*\(\)\s*=>\s*activeResult\.value\.totalTax === 0 && perEarner\.value\.every\(\(row\) => row\.tax === 0\),?\s*\);/,
    );
  });

  it("round-2 CRITICAL: the gate also requires every earner's OWN tax to be zero, not just the pool", () => {
    // Tax is per assessee — a two-earner household can pool to ₹0 while one earner's own bill
    // (computeEarnerTaxCard, per-member-correct) is non-zero. The per-earner clause must be
    // conjoined with (not instead of) the pooled check, so neither alone can drive the collapse.
    //
    // Numeric proof attempted (round-2 fix session, not committed as a fixture): tried to build a
    // real computeTax() case where the POOLED figure is ₹0 while one earner's OWN tax is non-zero,
    // across (a) NEW-regime income splits (11L/1.5L, 11.5L/1.5L), (b) OLD-regime deduction
    // concentrated entirely on one earner (₹2.5L+₹8L gross, ₹3.5L pooled deductions all on the
    // low earner), and (c) NEW-regime 80CCD(2) employer-NPS concentrated on one earner (₹5L/₹12.5L
    // gross, NPS only on the ₹5L earner). In every case tried, POOLING income under this page's
    // actual formulas (summed gross, ONE standard deduction / one NPS-cap basis applied once, same
    // rebate cliff) can only make the pooled figure >= the higher of what any individual split
    // would owe — never lower. Concretely: pooled non-zero always coincided with both individual
    // splits at zero (e.g. pooled ₹1,25,840 vs both earners' own ₹0), the OPPOSITE of the
    // reviewer's scenario; no split drove pooled to ₹0 while an individual owed > ₹0. The page also
    // never passes `taxpayerAge` to either the pooled or per-earner computeTax calls (grepped:
    // zero matches), so the OLD-regime senior/super-senior age-exemption asymmetry — the one real
    // mechanism that COULD produce this inversion — is not reachable through this page's actual
    // call sites either. Given that, a live-fixture proof isn't constructible with today's page
    // wiring; this source-scan assertion is kept as the durable guard so the per-earner clause
    // cannot silently regress, and the reasoning above is the record of what was tried.
    expect(script).toMatch(/perEarner\.value\.every\(\(row\) => row\.tax === 0\)/);
    // perEarner itself must be declared BEFORE the gate reads it (no forward-reference/TDZ bug).
    const perEarnerIdx = script.indexOf("const perEarner = computed(");
    const gateIdx = script.indexOf("const isZeroTaxRecommended = computed(");
    expect(perEarnerIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(perEarnerIdx);
  });

  it("the rebate threshold shown to the user comes from the FY config, never a hardcoded 1200000", () => {
    expect(script).toMatch(/getTaxConfigForFY\(selectedFY\.value\)\.newRegime\.rebateLimit/);
    // The literal 1,200,000 must not appear as a magic number driving the gate or the copy in this
    // file — the engine's own FY config is the single source (contract: never hardcode 1200000).
    expect(script).not.toMatch(/1_?200_?000|1200000/);
  });

  it("renders the collapsed card with a stable testid and the exact-condition reason text", () => {
    expect(template).toContain('data-testid="tax-zero-collapse"');
    expect(template).toContain("You pay ₹0 income tax");
    // NEW-regime branch: states the mechanism (New regime + ₹12L rebate u/s 87A) and the FY.
    expect(template).toMatch(/New\s+regime's ₹\{\{ Math\.round\(newRegimeRebateLimit \/ 100000\) \}\}L rebate/);
    expect(template).toMatch(/Section 87A/);
    expect(template).toMatch(/FY\s+\{\{ selectedFY \}\}/);
    // OLD-regime branch: a genuine tie (both regimes ₹0) must still name the mechanism honestly —
    // never silently reuse the New-regime copy for an Old-regime zero.
    expect(template).toMatch(/Old\s+regime's basic exemption and Section 87A rebate/);
    // LOW fix: the "deduction planning can't move a zero" sentence is ONE shared string, not
    // duplicated verbatim across both regime branches.
    expect(script).toMatch(/const zeroTaxDeductionPlanningNote =/);
    expect((template.match(/\{\{ zeroTaxDeductionPlanningNote \}\}/g) ?? []).length).toBe(2);
    expect(template).not.toMatch(/cannot lower a tax bill that is already ₹0, so we've hidden it below\./g);
  });

  it("round-2 FinTech HIGH: the '(New regime also ₹0)' clause is guarded, never unconditional", () => {
    // Must only render when newResult.totalTax is actually zero — a household on Old with a
    // genuinely non-zero New-regime figure must NOT see this clause.
    expect(template).toMatch(
      /<template v-if="newResult\.totalTax === 0"> \(the New regime also computes to ₹0 at this income\)<\/template>/,
    );
  });

  it("round-2 FinTech MEDIUM: a scope qualifier (slab income, capital gains, TDS) is present", () => {
    expect(template).toMatch(/capital gains, if any, are taxed separately and\s*\n?\s*not shown here/);
    expect(template).toMatch(/TDS already deducted is recovered on filing/);
  });

  it("round-2 FinTech addendum: the Old-regime branch names New as the statutory default (opt-in framing)", () => {
    expect(template).toMatch(
      /The New regime is the statutory default; choosing Old is an opt-in at filing\./,
    );
  });

  it("round-2 FinTech HIGH: the card's money line is honestly labelled, not 'take-home'", () => {
    // monthlyTakeHome.annualTake = gross taxable income − tax, with no PF subtracted — labelling
    // it "take-home" would overstate what actually reaches the bank (PF never does). The NEW
    // card must not claim "take-home"; the pre-existing hero/Take-home panel is out of scope here
    // (tracked separately) and is intentionally NOT touched by this fix.
    const cardStart = template.indexOf('data-testid="tax-zero-collapse"');
    const cardEnd = template.indexOf("</PanelCard>", cardStart);
    const cardMarkup = template.slice(cardStart, cardEnd);
    expect(cardMarkup).not.toMatch(/take-home/i);
    expect(cardMarkup).toContain("Income after tax (before PF)");
  });

  it("the card is gated by isZeroTaxRecommended AND is not the power-user override state", () => {
    expect(template).toMatch(
      /<PanelCard\s+v-if="isZeroTaxRecommended && !showFullSectionAnyway"/,
    );
  });

  it("a power-user escape hatch exists so the collapse never locks anyone out (toggle both ways)", () => {
    const toggles = template.match(/data-testid="tax-zero-collapse-toggle"/g) ?? [];
    expect(toggles.length).toBe(2); // collapse -> expand, and expand -> collapse back
    expect(template).toMatch(/@click="showFullSectionAnyway = true"/);
    expect(template).toMatch(/@click="showFullSectionAnyway = false"/);
  });

  it("the escape-hatch state resets whenever the zero-tax condition re-triggers (no stale expand)", () => {
    expect(script).toMatch(
      /watch\(isZeroTaxRecommended, \(isZero\) => \{\s*if \(!isZero\) showFullSectionAnyway\.value = false;\s*\}\);/,
    );
  });

  it("the optimisation machinery is gated behind the single zeroTaxSectionVisible computed", () => {
    expect(script).toMatch(
      /const zeroTaxSectionVisible = computed\(\s*\(\)\s*=>\s*!isZeroTaxRecommended\.value \|\| showFullSectionAnyway\.value,?\s*\);/,
    );
    // The optimisation block (income/deductions through the filing disclaimer) is wrapped in ONE
    // template gate driven by that computed — not per-panel ad-hoc gates that could drift apart.
    expect(template).toMatch(/<template v-if="zeroTaxSectionVisible">[\s\S]*Income &amp; deductions/);
    expect(template).toMatch(/for filing, use your CA \/ Cleartax[\s\S]{0,400}<\/v-alert>\s*<\/template>/);
  });

  it("the hero (StatDashboard) stays visible only when the section is visible — never orphaned", () => {
    expect(template).toMatch(/<StatDashboard\s+v-if="zeroTaxSectionVisible"/);
  });
});

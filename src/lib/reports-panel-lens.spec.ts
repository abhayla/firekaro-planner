import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";

/**
 * gh #161 — Reports "Investments & Liabilities" panel scope coherence.
 *
 * RCA: `Reports.vue`'s "Investments & Liabilities" panel read household `fire.totalCorpus` /
 * `fire.totalLiabilitiesValue` for the corpus / liabilities / net-worth rows while the "Income &
 * Expenses" panel's income/tax rows on the SAME page already read lensed values — a member's
 * income beside a household corpus under "Viewing as <member>". Same class as #160 (dashboard
 * tiles): a rendered figure and its neighbouring rows describing different scopes.
 *
 * Fix (D-2026-09-29-17, option a): the panel now reads `fire.lensedTotalCorpus` /
 * `fire.lensedTotalLiabilitiesValue` (the same member-attributable slice #160 wired into
 * `derive()`), so the whole panel is one scope. The separate "FIRE picture" panel is UNTOUCHED
 * (the #22/#23 guardrail: household FIRE adequacy never lenses) and now carries
 * `WholeHouseholdBadge` so the two scopes on the page are labelled.
 *
 * This spec locks the row-level invariant directly against the kernel output (no component mount
 * needed — Reports.vue's template bindings read these fields verbatim).
 */
describe("Reports panel — one scope per panel (gh #161)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("default (household) lens: Investments & Liabilities panel rows are byte-identical to the household totals", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });

    expect(k.lensedTotalCorpus).toBe(k.totalCorpus);
    expect(k.lensedTotalLiabilitiesValue).toBe(k.totalLiabilitiesValue);
  });

  it("member lens (Rohit): corpus/liabilities/net-worth rows all read HIS attributable slice — same scope as the income row", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: rohit + priya
    const whole = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const rohit = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" });

    const rohitIndividual = rohit.individualFireByMember.find((r) => r.memberId === "rohit");
    expect(rohitIndividual).toBeTruthy();

    // Corpus row: attributable slice, not the frozen household figure.
    expect(rohit.lensedTotalCorpus).toBe(rohitIndividual!.attributableCorpus);
    expect(rohit.lensedTotalCorpus).toBeLessThan(whole.totalCorpus);
    expect(rohit.lensedTotalCorpus).toBeGreaterThan(0);

    // Liabilities row: attributable slice, not the frozen household figure.
    expect(rohit.lensedTotalLiabilitiesValue).toBe(rohitIndividual!.attributableLiabilitiesValue);

    // Net worth row is derived in the template as corpus - liabilities — lock it reads the SAME
    // lensed pair (never mixing a lensed corpus with a household liabilities figure or vice versa).
    const netWorthRow = rohit.lensedTotalCorpus - rohit.lensedTotalLiabilitiesValue;
    expect(netWorthRow).toBe(rohitIndividual!.attributableCorpus - rohitIndividual!.attributableLiabilitiesValue);

    // Income row (already lensed pre-#161) is the SAME scope class as the corpus row post-fix:
    // both come from the member-lensed kernel output, not a household figure.
    expect(rohit.annualIncome).not.toEqual(whole.annualIncome);

    // FIRE-picture panel stays household under the lens (#22/#23 guardrail untouched by #161).
    expect(rohit.totalCorpus).toBe(whole.totalCorpus);
    expect(rohit.totalLiabilitiesValue).toBe(whole.totalLiabilitiesValue);
    expect(rohit.fireNumber).toBe(whole.fireNumber);
  });
});

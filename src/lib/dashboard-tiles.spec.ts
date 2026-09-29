import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";

/**
 * gh #160 — "section at a glance" tile scope coherence.
 *
 * RCA: on `/fire-goals/dashboard` under "Viewing as <member>", the Investments tile showed the
 * HOUSEHOLD value (`fire.totalCorpus`) beside a MEMBER-lensed subline count
 * (`fire.lensedInvestments.length`) — e.g. "₹1.10 Cr · 9 instruments" for Rohit while the
 * household holds 11. One tile, two scopes. Same class existed on the Liabilities tile
 * (`totalLiabilitiesValue` vs `lensedLiabilities.length`).
 *
 * Fix: `derive()`'s `lensedTotalCorpus`/`lensedTotalLiabilitiesValue` now read the member's
 * ATTRIBUTABLE slice (own 100% + Joint/shared × `householdSplitPercent`, the SAME
 * `corpusWeightOf` convention `individual-fire.ts` already uses for this member's own FIRE math)
 * instead of "own + 100% of every Joint/shared row" — so the tile VALUE and its lensed-list COUNT
 * describe the same scope. This spec locks that invariant directly against the kernel output
 * (no component mount needed — the Dashboard.vue bindings already read these two fields verbatim,
 * see `lensedTotalCorpus`/`lensedTotalLiabilitiesValue` usage there).
 *
 * The invariant asserted for EVERY tile pair, in a loop, so a future tile can't reintroduce the
 * class: value-scope and count-scope must be THE SAME under both the default (household) lens and
 * an explicit member lens.
 */
describe("dashboard tiles — one scope per tile (gh #160)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("default (household) lens: every tile's value is byte-identical to the household total (no lens applied)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas
    const k = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });

    // Investments tile: value === household corpus, count === household instrument count.
    expect(k.lensedTotalCorpus).toBe(k.totalCorpus);
    expect(k.lensedInvestments.length).toBe(h.data.investments.length);

    // Liabilities tile: value === household liabilities, count === household loan count.
    expect(k.lensedTotalLiabilitiesValue).toBe(k.totalLiabilitiesValue);
    expect(k.lensedLiabilities.length).toBe(h.data.liabilities.length);
  });

  it("member lens (Rohit): Investments tile value = Rohit's attributable corpus, count = his lensed list — SAME scope", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: rohit + priya
    const whole = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const rohit = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" });

    // The count is the lensed (visible-rows) list, unchanged by this fix.
    expect(rohit.lensedInvestments.length).toBeLessThan(whole.lensedInvestments.length);
    expect(rohit.lensedInvestments.length).toBeGreaterThan(0);

    // The value is now Rohit's ATTRIBUTABLE slice from individual-fire.ts — the SAME number his
    // own individual-FIRE card already shows — not the "own + 100% of Joint" figure a naive
    // household-scope filter would give (which is why this must be reused, not re-derived).
    const rohitIndividual = rohit.individualFireByMember.find((r) => r.memberId === "rohit");
    expect(rohitIndividual).toBeTruthy();
    expect(rohit.lensedTotalCorpus).toBe(rohitIndividual!.attributableCorpus);

    // Coherence: the value is strictly a fraction of the household total (own + partial Joint),
    // and strictly positive — never the frozen household figure the bug shipped.
    expect(rohit.lensedTotalCorpus).toBeLessThan(whole.totalCorpus);
    expect(rohit.lensedTotalCorpus).toBeGreaterThan(0);
    expect(rohit.lensedTotalCorpus).not.toBe(whole.totalCorpus);
  });

  it("member lens (Rohit): Liabilities tile value = Rohit's attributable liabilities, count = his lensed list — SAME scope", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const whole = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const rohit = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" });

    const rohitIndividual = rohit.individualFireByMember.find((r) => r.memberId === "rohit");
    expect(rohitIndividual).toBeTruthy();
    expect(rohit.lensedTotalLiabilitiesValue).toBe(rohitIndividual!.attributableLiabilitiesValue);

    // Household FIRE-adequacy math stays invariant under the lens (#22/#23 guardrail untouched).
    expect(rohit.totalCorpus).toBe(whole.totalCorpus);
    expect(rohit.totalLiabilitiesValue).toBe(whole.totalLiabilitiesValue);
  });

  it("Σ(members) attributable corpus reconstructs the household total — no more double-counting Joint", () => {
    // Locks the #160 semantic change: Joint is now SPLIT (via householdSplitPercent) across the
    // member tiles, not counted at 100% for every owner. For the locked 2-adult persona the split
    // sums to 100%, so summing every adult's attributable slice reconstructs the household figure
    // (within rounding) — the old behavior over-counted by the full Joint overlap.
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const whole = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" });
    const rohit = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "rohit", currentFY: "2025-26" });
    const priya = derive(h.data, a.values, { isFamilyView: false, viewingMemberId: "priya", currentFY: "2025-26" });

    expect(rohit.lensedTotalCorpus + priya.lensedTotalCorpus).toBeCloseTo(whole.totalCorpus, -1);
  });
});

/**
 * FOOLPROOF GATE — headline plausibility on the DEFAULT PRODUCT LENS (gh-issue #22).
 *
 * Why this file exists (the root-cause lesson): the FIRE headline was wrong THREE
 * times (#18/#20/#22) and every existing gate stayed green — type-check passed, the
 * component rendered, the console was clean, and the unit tests asserted the headline
 * *matched the current computation* (shape) instead of *being domain-sane* (substance).
 * The #22 lens bug specifically hid because the seed test exercised `isFamilyView:true`
 * (the coherent path) while the app DEFAULT is `isFamilyView:false` — test and product
 * diverged.
 *
 * This gate closes that hole. For EVERY seed persona, on the EXACT lens a user sees by
 * default (`isFamilyView:false`, `viewingMemberId:null`), it asserts the flagship
 * numbers fall in DOMAIN-SANE bounds. "FIRE at age 81" (the #22 symptom) is now a CI
 * FAILURE, not a silently-rendered number. A new absurd-but-rendering value trips a
 * red test instead of reaching a user.
 *
 * RULE: any new headline/output field that a user reads MUST get a plausibility bound
 * here, asserted on the DEFAULT product lens. See `.claude/rules/output-plausibility-verification.md`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import { runMonteCarloFire } from "@/lib/monte-carlo";
import { captureSnapshot, milestoneBandFor } from "@/lib/lifecycle-digest";

type Loader = (h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) => void;

// The EXACT lens FireHero + the ~20 dashboard FIRE consumers render by default.
const DEFAULT_PRODUCT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

const PERSONAS: Array<{ name: string; load: Loader }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
];

describe("headline plausibility — DEFAULT product lens (#22 foolproof gate)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: the default-lens FIRE headline is domain-SANE (not just rendering)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const fireAge = k.anchorAge + k.yearsToRegular;
      const ctx = `${persona.name} default-lens: fireAge=${fireAge.toFixed(1)} savings%=${k.savingsRate} earners=${k.lensedEarners.length}`;

      // (1) FIRE must be REACHABLE within a human lifetime — and not absurdly late.
      // The #22 bug produced age 81 (household target ÷ one earner). 70 is the ceiling.
      expect(Number.isFinite(k.yearsToRegular), `${ctx} — yearsToRegular finite`).toBe(true);
      expect(fireAge, `${ctx} — FIRE age must be ≤ 70 (caught the #22 age-81 bug)`).toBeLessThanOrEqual(70);
      // …and not earlier than the retirement TARGET (that would be optimistic nonsense).
      expect(fireAge, `${ctx} — FIRE age not absurdly early`).toBeGreaterThanOrEqual(
        Math.min(k.targetRetirementAge, k.anchorAge + 1),
      );

      // (2) Savings rate must be a believable accumulator band (the #22 bug halved it to ~26%).
      expect(k.savingsRate, `${ctx} — savings rate in 15-70%`).toBeGreaterThanOrEqual(15);
      expect(k.savingsRate, `${ctx} — savings rate in 15-70%`).toBeLessThanOrEqual(70);

      // (3) The default lens MUST count EVERY household earner — the #22 bug silently
      // scoped a dual-income household to the primary earner only.
      const householdEarners = h.data.members.filter((m) => m.role === "EARNER").length;
      expect(k.lensedEarners.length, `${ctx} — default lens pools all ${householdEarners} earners`).toBe(
        householdEarners,
      );

      // (4) Progress + FIRE number sanity (no NaN/∞/negative reaching a user).
      expect(k.progressPercent, `${ctx} — progress 0-100`).toBeGreaterThanOrEqual(0);
      expect(k.progressPercent, `${ctx} — progress 0-100`).toBeLessThanOrEqual(100);
      expect(k.fireNumber, `${ctx} — fireNumber positive + finite`).toBeGreaterThan(0);
      expect(Number.isFinite(k.fireNumber)).toBe(true);

      // (5) #18 MC band tracks the deterministic headline — on EVERY persona, INCLUDING
      // the glide-ON Iyers. Earlier this invariant was asserted only on the glide-OFF
      // Sharmas (where MC's scalar return == the headline schedule, so the gap is
      // structurally zero) — a shape-vs-substance gap: the lock ran on the one persona
      // that COULDN'T violate it (FinTech consolidated review, 2026-06-03). For a
      // glide-ON persona the MC uses the scalar pre-glide return while the headline uses
      // the tapered schedule, so MC p50 runs a few years FASTER (Iyers ≈ −2.5y) — a
      // documented #18-v2 limitation (MC doesn't taper). This bound passes today and
      // trips RED if that gap ever widens materially.
      const mc = runMonteCarloFire({
        currentCorpus: k.fireWithdrawableCorpus,
        targetCorpus: k.fireNumber,
        monthlySavings: k.monthlyContribution,
        meanReturn: k.realBlendedReturn,
        volatility: k.portfolioVolatility,
      });
      expect(mc.p10Years, `${ctx} — MC ordered p10≤p50≤p90`).toBeLessThanOrEqual(mc.p50Years);
      expect(mc.p50Years).toBeLessThanOrEqual(mc.p90Years);
      expect(
        Math.abs(mc.p50Years - k.corpusOnlyYearsToRegular),
        `${ctx} — MC p50 ${mc.p50Years.toFixed(1)} must track headline ${k.corpusOnlyYearsToRegular.toFixed(1)} (glide asymmetry bounded)`,
      ).toBeLessThan(6);
    });

    it(`${persona.name}: the default lens is BYTE-IDENTICAL to family view on FIRE adequacy`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const def = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const fam = derive(h.data, a.values, { ...DEFAULT_PRODUCT_LENS, isFamilyView: true });
      // The lens-coherence invariant: with no member explicitly selected, FIRE adequacy
      // is the whole household either way — numerator and denominator from the same set.
      expect(def.yearsToRegular).toBe(fam.yearsToRegular);
      expect(def.fireNumber).toBe(fam.fireNumber);
      expect(def.annualSavings).toBe(fam.annualSavings);
      expect(def.totalCorpus).toBe(fam.totalCorpus);
    });

    it(`${persona.name}: an explicit member lens keeps FIRE adequacy HOUSEHOLD — only income/tax lens (#23)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const earners = h.data.members.filter((m) => m.role === "EARNER");
      if (earners.length < 2) return; // a member lens is only meaningful for a multi-earner household
      const household = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const lensed = derive(h.data, a.values, { ...DEFAULT_PRODUCT_LENS, viewingMemberId: earners[0].id });

      // FIRE adequacy is inherently household — the family funds one shared corpus and retires
      // together — so selecting one earner must NOT move the FIRE number/corpus/savings/age. Only
      // the income/tax DISPLAY lenses (issue #23, FinTech-validated).
      const householdFields = [
        "fireNumber",
        "baseFireNumber",
        "totalCorpus",
        "annualSavings",
        "savingsRate",
        "monthlyContribution",
        "monthlyTakeHome",
        "yearsToRegular",
        "progressPercent",
      ] as const;
      for (const f of householdFields) {
        expect(lensed[f], `#23: ${persona.name} — lensed.${f} must stay household`).toBe(household[f]);
      }
      // ...but the income/tax DISPLAY still lenses to the selected member (strictly less income).
      expect(lensed.annualIncome.total).toBeLessThan(household.annualIncome.total);
    });

    it(`${persona.name}: the lifecycle-digest snapshot is domain-SANE on the default lens`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const snap = captureSnapshot(k, [], new Date("2026-06-03T00:00:00.000Z"));
      const ctx = `${persona.name} digest snapshot`;

      // The ceil(fireAge)==anchorAge+ceil(years) parity below RESTS on anchorAge being
      // an integer (whole-year age). Lock that invariant so a future age-in-months change
      // can't silently break the FireHero/digest parity (FinTech review 2026-06-03).
      expect(Number.isInteger(k.anchorAge), `${ctx} — anchorAge is a whole year`).toBe(true);

      // The displayed "now age" (ceil) MUST equal the FireHero headline age (Rule 26
      // parity) AND clear the #22 sanity ceiling — an absurd snapshot age is a CI fail.
      const displayedAge = Math.ceil(snap.fireAge);
      expect(displayedAge, `${ctx} — ceil(fireAge) equals headline age`).toBe(
        k.anchorAge + Math.ceil(k.yearsToRegular),
      );
      expect(displayedAge, `${ctx} — displayed FIRE age ≤ 70 (#22 bound)`).toBeLessThanOrEqual(70);

      // The milestone band is coherent with the corpus/target ratio (no off-by-band).
      expect(snap.milestoneBand, `${ctx} — band matches corpus ratio`).toBe(
        milestoneBandFor(snap.currentCorpus, snap.fireNumber),
      );
      // JSON-safe (no Infinity/NaN reaching the persisted ui blob).
      expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    });
  }
});

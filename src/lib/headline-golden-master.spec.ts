/**
 * A7.2 — GOLDEN-MASTER headline snapshots, one per populated seed persona.
 *
 * This locks the EXACT `derive()` headline (FIRE age/number/savings-rate/years/corpus) for
 * every populated persona on the DEFAULT product lens. It is the complement to two existing
 * gates: `headline-plausibility.spec.ts` proves the headline is in a SANE band (substance),
 * and this proves it does not MOVE silently (regression). Any math change that shifts a
 * persona's headline trips this snapshot — forcing a deliberate, reviewed update rather than
 * an accidental drift. (Empty persona has no headline — covered by `empty-partial-state-sweep`.)
 *
 * IMPORTANT: a snapshot update here is a SIGNAL, not a chore — when it fails, confirm the new
 * number is still plausible (rule 31) and intended BEFORE running `vitest -u`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

type H = ReturnType<typeof useHouseholdStore>;
type A = ReturnType<typeof useAssumptionsStore>;
// #176 round 3: the two loan-carrying seeds (sharmas, mauryas) take `currentFY` to pin their
// `derivedEndYear`. Passing NO argument here left them defaulting to `getCurrentFinancialYear()`
// — the WALL CLOCK — even though `LENS.currentFY` below already pins which FY the kernel itself
// resolves against. The two must agree: a seed's loan-end-year math and the kernel's own
// retirement-year math have to be computed against the SAME financial year, or the split between
// "EMI still live" and "EMI already ended" drifts independently of both the seed data AND the
// pinned kernel year — exactly the class the time-travel spec below catches.
const PERSONAS: Array<{ name: string; load: (h: H, a: A) => void }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a, LENS.currentFY) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a, LENS.currentFY) },
];

/**
 * ADR-0006 Phase 1d — the calendar year every `derive()` call in this file is evaluated in.
 *
 * The kernel no longer reads the wall clock (it used to, at `derive.ts`'s dated-goal handling), so
 * a pinned year is what makes these baselines DETERMINISTIC: without it they would silently shift
 * on 1 January, every dated goal a year nearer, hence a year less inflation, hence FIRE earlier —
 * the optimistic direction, arriving unannounced. 2026 is the year the current baselines were
 * measured in, so pinning it keeps them byte-identical and frozen from here on.
 */
const PINNED_CURRENT_YEAR = 2026;

const r = (x: number, dp = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** dp) / 10 ** dp : x);

// RE-ANCHORED 2026-09-29 (#176): sharmas moved in TWO steps, not one, and the net figure a
// single diff would show (55.42→53.08) hides both terms:
//   (1) +1.00y, 55.42→56.42 — `anchorAge` shifted 30→31 because the seed's `dobFromAge` is now
//       pinned to 1 April of FY 2025-26 instead of the wall clock, so the household starts a
//       year older on this run.
//   (2) −3.34y, 56.42→53.08 — the ₹42k/mo home-loan EMI (`seed-persona.ts`), which ends in 2037,
//       is now correctly excluded from the retirement expense base once it's paid off, instead
//       of being capitalised forever.
// mauryas' `anchorAge` is unchanged (explicit DOBs, not `dobFromAge`), so only the EMI-exclusion
// term applies there (FIRE age 68.92→66.58). iyers (loan has no endYear) and mehtas (no loan)
// snapshots are unchanged — the no-op guarantee for lines that don't end early.
// gh #218 — `monthlyTakeHome` is ADDED to the snapshot below; NO existing field moves. The cash
// figure is computed by subtracting the PF the household's EPF_VPF rows already carry (the same
// rupees the corpus receives) plus professional tax, so it introduces no second basic base and
// nothing downstream of it changes. Unifying the two basic bases DOES move two personas by one
// month — that is split out to PR B (`chore/218b-basic-50pct-unification`) for an owner call.
describe("A7.2 golden-master — per-persona headline (DEFAULT lens)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: derive() headline is locked`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, LENS, { currentYear: PINNED_CURRENT_YEAR });
      const headline = {
        // Lock the lens scope too — a #22-class regression that silently scoped the household to
        // one earner would move this count and trip the golden master (code-review 2026-06-07).
        lensedEarners: k.lensedEarners.length,
        anchorAge: k.anchorAge,
        targetRetirementAge: k.targetRetirementAge,
        fireAge: r(k.anchorAge + k.yearsToRegular, 2),
        yearsToRegular: r(k.yearsToRegular),
        corpusOnlyYearsToRegular: r(k.corpusOnlyYearsToRegular),
        yearsToLean: r(k.yearsToLean),
        yearsToFat: r(k.yearsToFat),
        savingsRate: k.savingsRate,
        // gh #218 — the CASH figure joins the golden master. It is the number a user reads on
        // the hero stat block, and it was silently `gross − tax` (optimistic by the whole PF
        // block) for five releases with every gate green. Locked here so it cannot drift back.
        monthlyTakeHome: k.monthlyTakeHome,
        progressPercent: k.progressPercent,
        fireNumber: Math.round(k.fireNumber),
        totalCorpus: Math.round(k.totalCorpus),
        fireWithdrawableCorpus: Math.round(k.fireWithdrawableCorpus),
        annualSavings: Math.round(k.annualSavings),
        monthlyContribution: Math.round(k.monthlyContribution),
        effectiveSWR: k.effectiveSWR,
      };
      expect(headline).toMatchSnapshot();
    });
  }
});

/**
 * #176 time-travel lock — the seeds' `currentFY` default (`getCurrentFinancialYear()`, which
 * reads `new Date()`) must NEVER leak into a seed's `derivedEndYear`. Before this fix a seed
 * loaded on 2026-09-29 vs 2027-01-15 vs 2027-05-02 computed a DIFFERENT loan end-year for the
 * exact same fixture data, because `getCurrentFinancialYear()`'s default crossed an FY boundary
 * (1 April) between calls — silently moving `baseFireNumber` with the calendar, not with any
 * user action. Only sharmas (`loadSeedPersona`) and mauryas (`loadMauryasSeed`) carry a loan with
 * an `endYear`, so only they are wall-clock-sensitive; this pins `derive()`'s headline byte-
 * identical across three real dates straddling both an FY boundary (2026-09-29 → 2027-01-15,
 * same FY 2026-27) and a full FY crossover (2027-01-15 → 2027-05-02, FY 2026-27 → 2027-28).
 */
describe("#176 time-travel — seed headline does not drift with the wall clock", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const WALL_CLOCK_DATES = ["2026-09-29T10:00:00Z", "2027-01-15T10:00:00Z", "2027-05-02T10:00:00Z"];

  const TIME_SENSITIVE: Array<{ name: string; load: (h: H, a: A) => void }> = [
    { name: "sharmas", load: (h, a) => loadSeedPersona(h, a, LENS.currentFY) },
    { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a, LENS.currentFY) },
  ];

  for (const persona of TIME_SENSITIVE) {
    it(`${persona.name}: derive() headline is byte-identical across ${WALL_CLOCK_DATES.length} real wall-clock dates`, () => {
      const headlines = WALL_CLOCK_DATES.map((iso) => {
        vi.setSystemTime(new Date(iso));
        try {
          setActivePinia(createPinia());
          const h = useHouseholdStore();
          const a = useAssumptionsStore();
          persona.load(h, a);
          const k = derive(h.data, a.values, LENS, { currentYear: PINNED_CURRENT_YEAR });
          return {
            fireAge: r(k.anchorAge + k.yearsToRegular, 2),
            yearsToRegular: r(k.yearsToRegular),
            fireNumber: Math.round(k.fireNumber),
            retirementAnnualExpensesToday: Math.round(k.retirementAnnualExpensesToday),
          };
        } finally {
          vi.useRealTimers();
        }
      });

      const [first, ...rest] = headlines;
      for (const later of rest) {
        expect(later).toEqual(first);
      }
    });
  }
});

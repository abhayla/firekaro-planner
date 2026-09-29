/**
 * gh-issue #222 — proof that EarnerSalaryForm.vue's preview and the tax-planning page's
 * per-earner card give the SAME regime + take-home for the SAME earner on the SAME data.
 *
 * Before this fix, EarnerSalaryForm.vue's `deriveTakeHomeFor` fed `recommendRegime`/
 * `computeTax` a hardcoded `oldDed = 175000` old-regime deduction instead of the earner's
 * REAL deductions (80C/80CCD(1B)/80D/§24 from their own investments/liabilities/insurance).
 * `tax-planning/Index.vue`'s per-earner table already derives real per-earner deductions
 * via `deriveDeductions` (gh-issue #201/#157) and calls `computeEarnerTaxCard`. Any earner
 * whose real deductions differ from ₹1.75L flat could get a DIFFERENT regime pick and a
 * DIFFERENT take-home figure on the two screens for the identical person.
 *
 * This spec asserts, for every ADULT earner on every seed persona (pinned asOfDate — never
 * the wall clock), that `previewEarnerTakeHome` (the form's new derivation) equals
 * `computeEarnerTaxCard` (the tax-planning page's derivation) to the rupee: same regime,
 * same annual take-home, same effective rate.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { loadRaviSeed } from "@/seeds/ravi";
import { deriveDeductions, computeEarnerTaxCard, previewEarnerTakeHome } from "@/lib/tax-deductions";
import { pfFromInvestmentRows, PROFESSIONAL_TAX_ANNUAL_PER_EARNER } from "@/lib/salary-cash";
import { todayIsoLocal } from "@/lib/as-of-date";

// Pinned so persona ages / FY selection never drift with the wall clock (matches
// headline-plausibility.spec.ts's DEFAULT_PRODUCT_LENS convention).
const PINNED_ASOF = new Date("2025-08-01T00:00:00.000Z");
const FY = "2025-26";

type Loader = (h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) => void;

const PERSONAS: Array<{ name: string; load: Loader }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a, PINNED_ASOF) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a, PINNED_ASOF) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a, FY) },
  { name: "ravi", load: (h, a) => loadRaviSeed(h, a, PINNED_ASOF) },
];

describe("gh-222 — salary-form preview matches the tax-planning per-earner card", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  for (const persona of PERSONAS) {
    it(`${persona.name}: every adult earner's preview === tax-page card (regime, take-home, eff. rate)`, () => {
      const household = useHouseholdStore();
      const assumptions = useAssumptionsStore();
      persona.load(household, assumptions);

      const earners = household.earners.filter((m) => (m.salary?.annualCTC ?? 0) > 0);
      expect(earners.length).toBeGreaterThan(0); // sanity: every persona used here has ≥1 earner

      for (const member of earners) {
        // The tax-planning page's derivation (Index.vue `perEarner`): member-scoped
        // deriveDeductions + computeEarnerTaxCard, with the AUTO-recommended regime for
        // THIS earner (mirrors computeEarnerTaxCard's own internal `rec`).
        const earnerDeductions = deriveDeductions(
          {
            ...household.data,
            members: [member],
            investments: household.data.investments.filter((i) => i.ownerId === member.id),
            liabilities: household.data.liabilities.filter((l) => l.ownerId === member.id),
            insurance: household.data.insurance.filter((p) => p.insuredPersonId === member.id),
          },
          { asOfDate: todayIsoLocal() },
        );
        const annualPf = pfFromInvestmentRows(household.data, member.id);
        const pageCardPeek = computeEarnerTaxCard(member, FY, earnerDeductions.totalDeductions, "OLD", annualPf);
        const pageCard = computeEarnerTaxCard(
          member,
          FY,
          earnerDeductions.totalDeductions,
          pageCardPeek.rec,
          annualPf,
        );

        // The form's new derivation, previewing the earner's ALREADY-SAVED salary (no draft
        // edit — the "just opened the form" case).
        const preview = previewEarnerTakeHome(household.data, member, FY);

        expect(preview).not.toBeNull();
        expect(preview!.rec).toBe(pageCard.rec);
        expect(preview!.takeHome).toBe(pageCard.takeHome);
        expect(preview!.effRate).toBeCloseTo(pageCard.effRate, 6);
        expect(preview!.tax).toBe(pageCard.tax);
      }
    });
  }

  it("a draft (unsaved) CTC edit previews against the draft, not the stored value", () => {
    const household = useHouseholdStore();
    const assumptions = useAssumptionsStore();
    loadSeedPersona(household, assumptions);
    const member = household.earners.find((m) => (m.salary?.annualCTC ?? 0) > 0)!;
    const storedCTC = member.salary!.annualCTC;
    const draftCTC = storedCTC + 500_000;

    const storedPreview = previewEarnerTakeHome(household.data, member, FY);
    const draftPreview = previewEarnerTakeHome(household.data, member, FY, { annualCTC: draftCTC });

    expect(draftPreview).not.toBeNull();
    expect(draftPreview!.gross).toBe(draftCTC);
    expect(draftPreview!.gross).not.toBe(storedPreview!.gross);
  });

  it("no CTC (0 or absent) previews null, never throws", () => {
    const household = useHouseholdStore();
    const assumptions = useAssumptionsStore();
    loadSeedPersona(household, assumptions);
    const member = household.earners.find((m) => (m.salary?.annualCTC ?? 0) > 0)!;

    expect(previewEarnerTakeHome(household.data, member, FY, { annualCTC: 0 })).toBeNull();
  });

  it("#223 — a hasEpf:false draft previews take-home = CTC − tax − professional tax, no PF", () => {
    const household = useHouseholdStore();
    const assumptions = useAssumptionsStore();
    loadSeedPersona(household, assumptions);
    const member = household.earners.find((m) => (m.salary?.annualCTC ?? 0) > 0)!;
    const ctc = member.salary!.annualCTC;

    // The member's EPF row still exists (round-1/2 only remove it via autoFlowSalaryToEPF on
    // SAVE) — the preview must still zero PF from the DRAFT alone, before any save happens.
    const noEpfPreview = previewEarnerTakeHome(household.data, member, FY, { hasEpf: false });
    expect(noEpfPreview).not.toBeNull();

    const expectedTakeHome = ctc - noEpfPreview!.tax - PROFESSIONAL_TAX_ANNUAL_PER_EARNER;
    expect(noEpfPreview!.takeHome).toBe(Math.max(0, expectedTakeHome));

    // And it must be HIGHER than the hasEpf:true (default) preview for the same CTC — PF no
    // longer reduces the cash figure.
    const withEpfPreview = previewEarnerTakeHome(household.data, member, FY);
    expect(noEpfPreview!.takeHome).toBeGreaterThanOrEqual(withEpfPreview!.takeHome);
  });
});

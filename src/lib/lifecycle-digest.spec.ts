/**
 * lifecycle-digest — pure delta engine unit + substance specs.
 *
 * Stage A (unit): the pure builder + diff, exercised on hand-built snapshots so
 * the contract (null baseline → no change; thresholds; direction; milestone
 * crossing; new nudges; zero-division guards) is locked in isolation.
 *
 * Stage D (substance, rule 31): per-persona reconciliation through the REAL
 * `derive()` kernel on the DEFAULT product lens — the digest delta MUST equal the
 * headline movement, never an independent recompute; plausibility bounds; and the
 * default==family-view parity (#22 invariant). Those live at the bottom of this
 * file (see the "substance" describe block).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import {
  captureSnapshot,
  computeLifecycleDigest,
  isSnapshotFrameCurrent,
  FRAME_VERSION,
  MILESTONE_BANDS,
  type LifecycleSnapshot,
} from "@/lib/lifecycle-digest";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { derive, cpiWithinYearReindexFactor } from "@/lib/derive";
import { runMonteCarloFire, headlineBandInputs, MAX_PROJECTION_YEARS } from "@/lib/monte-carlo";
import { evaluateNudges } from "@/lib/nudge-engine";
import { derivedFamilyLayer } from "@/lib/derived-records";

// A minimal sane baseline used by the unit-level diff tests.
const base: LifecycleSnapshot = {
  capturedAt: "2026-01-01T00:00:00.000Z",
  // Same frame on both sides, so the diff tests below exercise the DIFF and not the frame gate.
  frameVersion: FRAME_VERSION,
  fireAge: 56,
  fireYear: 2052,
  currentCorpus: 10_000_000,
  fireNumber: 40_000_000,
  savingsRatePct: 40,
  milestoneBand: 25,
  activeNudgeIds: ["marginal-relief", "nps-cap"],
  monteCarloP50Age: 57,
};

function withChange(patch: Partial<LifecycleSnapshot>): LifecycleSnapshot {
  return { ...base, capturedAt: "2026-06-03T00:00:00.000Z", ...patch };
}

describe("computeLifecycleDigest — pure diff (Stage A)", () => {
  it("null baseline → no meaningful change (first visit shows nothing)", () => {
    const d = computeLifecycleDigest(withChange({}), null);
    expect(d.hasMeaningfulChange).toBe(false);
    expect(d.fireDirection).toBe("same");
    expect(d.fireAgeDeltaYears).toBe(0);
    expect(d.newNudgeIds).toEqual([]);
    expect(d.milestoneCrossed).toBeNull();
    expect(d.sinceCapturedAt).toBeNull();
  });

  it("identical snapshot → no meaningful change", () => {
    const d = computeLifecycleDigest(withChange({}), base);
    expect(d.hasMeaningfulChange).toBe(false);
    expect(d.fireDirection).toBe("same");
    expect(d.sinceCapturedAt).toBe(base.capturedAt);
  });

  it("sub-threshold corpus edit (<2%) and sub-month age move → no change", () => {
    const d = computeLifecycleDigest(
      withChange({ currentCorpus: base.currentCorpus + 100_000 /* +1% */, fireAge: 56.02 }),
      base,
    );
    expect(d.hasMeaningfulChange).toBe(false);
  });

  it("a ≥1-month FIRE-date improvement → earlier + correct fractional delta", () => {
    // 8 months earlier: 56 → 55.333…
    const cur = withChange({ fireAge: 56 - 8 / 12 });
    const d = computeLifecycleDigest(cur, base);
    expect(d.fireDirection).toBe("earlier");
    expect(d.fireAgeDeltaYears).toBeCloseTo(8 / 12, 6); // baseline − current, positive = earlier
    expect(d.hasMeaningfulChange).toBe(true);
  });

  it("a later FIRE date → later direction, negative delta", () => {
    const cur = withChange({ fireAge: 56 + 1 });
    const d = computeLifecycleDigest(cur, base);
    expect(d.fireDirection).toBe("later");
    expect(d.fireAgeDeltaYears).toBeCloseTo(-1, 6);
    expect(d.hasMeaningfulChange).toBe(true);
  });

  it("a 25%→50% corpus-ratio crossing → milestoneCrossed: 50", () => {
    // baseline band 25; current corpus = 50% of fireNumber → band 50.
    const cur = withChange({ currentCorpus: base.fireNumber * 0.5, milestoneBand: 50 });
    const d = computeLifecycleDigest(cur, base);
    expect(d.milestoneCrossed).toBe(50);
    expect(d.hasMeaningfulChange).toBe(true);
  });

  it("a DROP in milestone band does not report a crossing (only upward)", () => {
    const cur = withChange({ milestoneBand: 0 });
    const d = computeLifecycleDigest(cur, base);
    expect(d.milestoneCrossed).toBeNull();
  });

  it("a new nudge id appears in newNudgeIds; removed ids are ignored", () => {
    const cur = withChange({ activeNudgeIds: ["marginal-relief", "estate-gaps"] });
    const d = computeLifecycleDigest(cur, base);
    expect(d.newNudgeIds).toEqual(["estate-gaps"]); // nps-cap removed (not reported), estate-gaps new
    expect(d.hasMeaningfulChange).toBe(true);
  });

  it("zero baseline corpus → no division blow-up; corpusDelta still reported", () => {
    const zeroBase = { ...base, currentCorpus: 0, milestoneBand: 0 as const };
    const cur = withChange({ currentCorpus: 50_000, milestoneBand: 0 });
    const d = computeLifecycleDigest(cur, zeroBase);
    expect(Number.isFinite(d.corpusDelta)).toBe(true);
    expect(d.corpusDelta).toBe(50_000);
  });

  it("unreachable FIRE age sentinel (-1) on either side → direction same, no fire delta", () => {
    const unreachableBase = { ...base, fireAge: -1, fireYear: -1 };
    const cur = withChange({ fireAge: 55 });
    const d = computeLifecycleDigest(cur, unreachableBase);
    expect(d.fireDirection).toBe("same");
    expect(d.fireAgeDeltaYears).toBe(0);
  });
});

describe("captureSnapshot — pure builder (Stage A)", () => {
  beforeEach(() => setActivePinia(createPinia()));
  const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

  it("maps derive() fields to a JSON-safe snapshot with a sane milestone band", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, LENS);
    const now = new Date("2026-06-03T10:00:00.000Z");
    const snap = captureSnapshot(k, ["marginal-relief"], now);

    expect(snap.capturedAt).toBe(now.toISOString());
    expect(snap.currentCorpus).toBe(Math.round(k.fireWithdrawableCorpus));
    expect(snap.fireNumber).toBe(Math.round(k.fireNumber));
    expect(snap.savingsRatePct).toBe(k.savingsRate);
    // fractional fireAge (precise) — ceil(fireAge) must equal FireHero's displayed age.
    expect(snap.fireAge).toBeCloseTo(k.anchorAge + k.yearsToRegular, 6);
    expect(Math.ceil(snap.fireAge)).toBe(k.anchorAge + Math.ceil(k.yearsToRegular));
    // band ∈ the shared constant, derived from corpus/fireNumber ratio.
    expect(MILESTONE_BANDS).toContain(snap.milestoneBand);
    const ratioPct = (snap.currentCorpus / snap.fireNumber) * 100;
    const expectedBand = [...MILESTONE_BANDS].reverse().find((b) => ratioPct >= b) ?? 0;
    expect(snap.milestoneBand).toBe(expectedBand);
    // JSON round-trip safe (no Infinity/NaN leaking).
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap.activeNudgeIds).toEqual(["marginal-relief"]);

    // SUBSTANCE (not shape): monteCarloP50Age must use the SAME real-return frame +
    // inputs useFireDerive feeds the headline band — incl. the #24-Part-1 glide schedule
    // AND the #24-Part-2 history-fed series — never an independent recompute. Mirroring
    // the production call EXACTLY guards the cross-consumer divergence (digest vs band).
    // ADR-0006 Phase 1d: "mirror the production call EXACTLY" is now structural — both sides build
    // their arguments with `headlineBandInputs`, so a hand-copied field can no longer rot out of
    // sync (it had: this mirror was passing the base-leg `realTargetDriftRate` while production
    // passed the effective whole-target rate).
    const mc = runMonteCarloFire(headlineBandInputs(k));
    const expectedP50Age =
      mc.p50Years < MAX_PROJECTION_YEARS ? Math.round(k.anchorAge + mc.p50Years) : null;
    expect(snap.monteCarloP50Age).toBe(expectedP50Age);
  });

  it("skipMonteCarlo option yields null p50 without running the simulation", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, LENS);
    const snap = captureSnapshot(k, [], new Date("2026-06-03T10:00:00.000Z"), {
      skipMonteCarlo: true,
    });
    expect(snap.monteCarloP50Age).toBeNull();
    // The rest of the snapshot is unaffected by skipping MC.
    expect(snap.fireNumber).toBe(Math.round(k.fireNumber));
  });
});

// ---------------------------------------------------------------------------
// Stage D — substance & plausibility (rule 31). Reconciliation through the REAL
// derive() kernel on the DEFAULT product lens.
// ---------------------------------------------------------------------------

type Loader = (h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) => void;
const DEFAULT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
const PERSONAS: Array<{ name: string; load: Loader }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
];

function activeNudgeIdsFor(h: ReturnType<typeof useHouseholdStore>, k: ReturnType<typeof derive>): string[] {
  return evaluateNudges({
    household: h.data,
    family: derivedFamilyLayer(h.data),
    annualExpenses: k.annualExpensesToday,
    taxableIncome: k.fyTax.taxableIncome,
    fy: DEFAULT_LENS.currentFY,
    marginalSlabRate: k.householdMarginalRate,
    currentMonth: 5, // deterministic (June) — outside the LTCG Jan–Mar window
    monthlySurplus: Math.round(k.annualSavings / 12),
  }).map((n) => n.id);
}

describe("lifecycle-digest substance — reconciliation vs derive() (Stage D, rule 31)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: digest fireAgeDelta EQUALS the headline movement (no parallel recompute)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);

      const now = new Date("2026-06-03T00:00:00.000Z");
      const before = derive(h.data, a.values, DEFAULT_LENS);
      const baseline = captureSnapshot(before, activeNudgeIdsFor(h, before), now);
      const baselineFireAge = before.anchorAge + before.yearsToRegular;

      // A realistic improvement the kernel actually respects: trim ₹25k/mo of
      // expenses. (Per gh-issue #11 the corpus grows from the SAVINGS RESIDUAL, not
      // from an investment's monthlyContribution — so editing a SIP is inert/can
      // even drag returns; cutting spend raises savings AND lowers the FIRE number.)
      h.data.expenses.avgMonthly = Math.max(0, h.data.expenses.avgMonthly - 25_000);
      const after = derive(h.data, a.values, DEFAULT_LENS);
      const current = captureSnapshot(after, activeNudgeIdsFor(h, after), now);
      const newFireAge = after.anchorAge + after.yearsToRegular;

      const digest = computeLifecycleDigest(current, baseline);

      // Only assert the equality when BOTH ages are reachable (sane).
      if (Number.isFinite(baselineFireAge) && Number.isFinite(newFireAge)) {
        expect(
          digest.fireAgeDeltaYears,
          `${persona.name}: digest delta must equal baselineFireAge − newFireAge`,
        ).toBeCloseTo(baselineFireAge - newFireAge, 6);
      }
      // corpus delta sign must match the edit direction (more savings ⇒ corpus today
      // unchanged at capture, but fireNumber/years move — corpusDelta here ≈ 0 since the
      // SIP changes future flow, not today's corpus). Assert it is at least finite + sane.
      expect(Number.isFinite(digest.corpusDelta)).toBe(true);
    });

    it(`${persona.name}: a single realistic edit never moves FIRE by an absurd amount`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const now = new Date("2026-06-03T00:00:00.000Z");
      const before = derive(h.data, a.values, DEFAULT_LENS);
      const baseline = captureSnapshot(before, [], now);

      // Realistic improvement: trim ₹25k/mo of expenses (raises savings + lowers
      // the FIRE number → unambiguously earlier; see the reconciliation test note).
      h.data.expenses.avgMonthly = Math.max(0, h.data.expenses.avgMonthly - 25_000);
      const after = derive(h.data, a.values, DEFAULT_LENS);
      const current = captureSnapshot(after, [], now);
      const digest = computeLifecycleDigest(current, baseline);

      // Plausibility: a ₹25k/mo expense cut must not swing the FIRE date by > ~5 years.
      expect(
        Math.abs(digest.fireAgeDeltaYears),
        `${persona.name}: |fireAgeDelta| ≤ 5y for a single realistic edit`,
      ).toBeLessThanOrEqual(5);
      // Direction must be 'earlier' or 'same' for MORE saving — never 'later'.
      expect(digest.fireDirection).not.toBe("later");
    });

    it(`${persona.name}: digest is identical on the default lens vs explicit family view (#22)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const now = new Date("2026-06-03T00:00:00.000Z");

      const def = derive(h.data, a.values, DEFAULT_LENS);
      const fam = derive(h.data, a.values, { ...DEFAULT_LENS, isFamilyView: true });
      const defSnap = captureSnapshot(def, [], now);
      const famSnap = captureSnapshot(fam, [], now);

      expect(defSnap.fireAge).toBeCloseTo(famSnap.fireAge, 6);
      expect(defSnap.currentCorpus).toBe(famSnap.currentCorpus);
      expect(defSnap.fireNumber).toBe(famSnap.fireNumber);
      expect(defSnap.milestoneBand).toBe(famSnap.milestoneBand);
    });
  }
});

/**
 * ADR-0006 — the frame gate. Every stored snapshot predates the frame change on deploy day, and the
 * headline moved for every user for reasons that have nothing to do with what they did. Reporting
 * that as "your FIRE date moved 2 years later since you were away" is a fabricated claim about the
 * user's behaviour — rule 31, and the exact class this ADR exists to remove from the product.
 */
describe("lifecycle-digest — frame-change migration (ADR-0006)", () => {
  it("captureSnapshot stamps the current frame", () => {
    const snap = captureSnapshot(
      {
        anchorAge: 35,
        yearsToRegular: 20,
        fireWithdrawableCorpus: 10_000_000,
        fireNumber: 40_000_000,
        savingsRate: 40,
        realBlendedReturn: 0.04,
        realReturnSchedule: 0.04,
        realTargetDriftRate: 0.0023,
        // ADR-0006 Phase 1d: the WHOLE-target drift the band actually runs on. Same value here
        // because this synthetic fixture has no dated goals and no medical reservation — on a real
        // household the two differ, which is exactly why the band must not read the base leg.
        effectiveTargetDriftRate: 0.0023,
        householdContributionSchedule: 100_000,
        // ADR-0006 Phase 1b: the CPI-re-indexed band inflow (≈ 96.9% of the real amount at 6% CPI).
        // Phase 1d: COMPUTED from the kernel's own factor, not hard-coded. The literal that used to
        // sit here (96_766) was arithmetically wrong — the factor is 0.969067, not 0.96766 — and a
        // wrong constant in a fixture is a lock on the wrong behaviour.
        bandContributionSchedule: 100_000 * cpiWithinYearReindexFactor(0.06),
        portfolioVolatility: 0.15,
        monthlyContribution: 100_000,
      },
      [],
      new Date("2026-08-27T00:00:00.000Z"),
      { skipMonteCarlo: true },
    );
    expect(snap.frameVersion).toBe(FRAME_VERSION);
    expect(isSnapshotFrameCurrent(snap)).toBe(true);
  });

  it("a snapshot with NO frame tag is recognised as pre-frame-change", () => {
    const legacy: LifecycleSnapshot = { ...base };
    delete legacy.frameVersion;
    expect(isSnapshotFrameCurrent(legacy)).toBe(false);
    expect(isSnapshotFrameCurrent(null)).toBe(false);
  });

  it("a stale-framed baseline is treated exactly like NO baseline — no delta is claimed", () => {
    const legacy: LifecycleSnapshot = { ...base };
    delete legacy.frameVersion;
    // A move that WOULD be loudly reported within one frame: 4 years later + a corpus jump.
    const current = withChange({ fireAge: 60, currentCorpus: 20_000_000 });

    const acrossFrames = computeLifecycleDigest(current, legacy);
    expect(acrossFrames.hasMeaningfulChange, "no claim may survive a frame change").toBe(false);
    expect(acrossFrames.fireAgeDeltaYears).toBe(0);
    expect(acrossFrames.fireDirection).toBe("same");
    expect(acrossFrames.corpusDelta).toBe(0);
    expect(acrossFrames.sinceCapturedAt).toBeNull();

    // ...and the SAME diff inside one frame is still reported in full — the gate is scoped to the
    // frame change, it does not quietly mute the digest.
    const withinFrame = computeLifecycleDigest(current, base);
    expect(withinFrame.hasMeaningfulChange).toBe(true);
    expect(withinFrame.fireDirection).toBe("later");
    expect(withinFrame.fireAgeDeltaYears).toBeCloseTo(-4, 6);
  });
});

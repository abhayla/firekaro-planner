import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { coastFireBlurb, baristaFireBlurb, expectedHeadlineCopy } from "./fire-milestone-copy";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { derive } from "@/lib/derive";

// gh #39 (new-user path): the Coast/Barista descriptive copy must NOT assert the
// "you've effectively coasted / no contributions needed" framing when there is no FIRE
// target (a zero-data new user). It must show an honest "add your data" prompt instead.

describe("coastFireBlurb", () => {
  it("with a real FIRE target: shows the stop-saving framing with the corpus", () => {
    const s = coastFireBlurb(true, "₹2.50 Cr");
    expect(s).toContain("₹2.50 Cr");
    expect(s).toMatch(/no additional contributions needed/i);
  });

  it("gh #39: NO target → honest prompt, never the false 'compounds to your full FIRE / no contributions needed'", () => {
    const s = coastFireBlurb(false, "₹0");
    expect(s).not.toMatch(/no additional contributions needed/i);
    expect(s).not.toMatch(/compounds to your full FIRE/i);
    expect(s).not.toContain("₹0");
    expect(s).toMatch(/add your income/i);
  });
});

describe("baristaFireBlurb", () => {
  it("with a real FIRE target: shows the part-time framing with the corpus", () => {
    const s = baristaFireBlurb(true, "₹1.20 Cr");
    expect(s).toContain("₹1.20 Cr");
    expect(s).toMatch(/part-time/i);
  });

  it("gh #39: NO target → honest prompt, never the false 'corpus + half-time income covers expenses'", () => {
    const s = baristaFireBlurb(false, "₹0");
    expect(s).not.toMatch(/covers expenses/i);
    expect(s).not.toContain("₹0");
    expect(s).toMatch(/add your income/i);
  });
});

// ADR-0007 / gh #185 step 5 — the dashboard hero's SECOND ("expected") headline number.
// `expectedHeadlineCopy` performs NO math of its own: both ages are handed in verbatim from the
// kernel (`derive()` via `useFireDerive`). These unit cases lock the pure decision logic; the
// integration case below proves it against the REAL kernel output on the Sharmas seed (Core proof).
describe("expectedHeadlineCopy (pure decision logic)", () => {
  it("shows the second number when the kernel says the hike genuinely beats the conservative age", () => {
    const s = expectedHeadlineCopy(51, 42, 12);
    expect(s).toBe("42 if your 12% hikes continue");
  });

  it("formats a fractional hike basis without a trailing zero mismatch", () => {
    const s = expectedHeadlineCopy(51, 47, 9.5);
    expect(s).toBe("47 if your 9.5% hikes continue");
  });

  it("suppressed: expectedFireAgeBasis is null (no earner typed a hike beating the default)", () => {
    expect(expectedHeadlineCopy(51, 51, null)).toBeNull();
  });

  it("suppressed: expectedFireAgeBasis is 0", () => {
    expect(expectedHeadlineCopy(51, 51, 0)).toBeNull();
  });

  it("suppressed: expectedFireAge equals the conservative age (nothing to add)", () => {
    expect(expectedHeadlineCopy(51, 51, 12)).toBeNull();
  });

  it("suppressed: expectedFireAge is somehow NOT earlier than the conservative age (belt-and-braces)", () => {
    expect(expectedHeadlineCopy(51, 55, 12)).toBeNull();
  });

  it("suppressed: no conservative age to anchor to (plan unreachable)", () => {
    expect(expectedHeadlineCopy(null, 42, 12)).toBeNull();
  });

  it("suppressed: no expected age from the kernel", () => {
    expect(expectedHeadlineCopy(51, null, 12)).toBeNull();
  });
});

describe("expectedHeadlineCopy — real kernel output (Core proof, gh #185 step 5)", () => {
  const DEFAULT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

  beforeEach(() => setActivePinia(createPinia()));

  it("Sharmas seed (earners hikePercent 9% / 8%, both > 0): the kernel yields a genuine second number and the helper renders it", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const k = derive(h.data, a.values, DEFAULT_LENS);

    expect(k.householdFireAge, "Sharmas must have a reachable conservative headline").not.toBeNull();
    expect(k.expectedFireAgeBasis, "Sharmas earners typed hikes > 0 — basis must be set").not.toBeNull();
    expect(k.expectedFireAge, "expected age must be present when basis is set").not.toBeNull();

    const copy = expectedHeadlineCopy(k.householdFireAge, k.expectedFireAge, k.expectedFireAgeBasis);
    expect(copy, "the second number must render for Sharmas on the real kernel output").not.toBeNull();
    expect(copy).toMatch(/^\d+ if your [\d.]+% hikes continue$/);
    // The rendered age must be the SAME number the kernel computed — never a re-derivation.
    expect(copy).toContain(`${k.expectedFireAge} if your`);
  });

  it("a household with every earner's hikePercent = 0: the kernel yields no basis and the helper shows ONE number", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    // Zero every earner's hike so the expected run can never beat the conservative default —
    // proving the SUPPRESSED case on the real kernel, not just a fabricated input pair.
    for (const m of h.data.members) {
      if (m.salary) m.salary = { ...m.salary, hikePercent: 0 };
    }
    const k = derive(h.data, a.values, DEFAULT_LENS);

    expect(k.expectedFireAgeBasis, "no earner has a hike above the conservative default").toBeNull();
    const copy = expectedHeadlineCopy(k.householdFireAge, k.expectedFireAge, k.expectedFireAgeBasis);
    expect(copy, "no second number when nothing beats the conservative headline").toBeNull();
  });

  it("expectedFireAge === householdFireAge (basis somehow still set): still shows ONE number, never two identical ages", () => {
    // Belt-and-braces case per the helper's own doc comment — even if a future kernel change ever
    // set a non-null basis without a strictly-earlier expected age, the UI must not show "51 · 51".
    expect(expectedHeadlineCopy(51, 51, 12)).toBeNull();
  });
});

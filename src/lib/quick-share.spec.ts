import { describe, it, expect } from "vitest";
import {
  encodeQuickAnswers,
  decodeQuickAnswers,
  buildShareUrl,
  shareText,
  shareOgTitle,
} from "./quick-share";
import { emptyQuickAnswers, quickAnswersSchema } from "@/types/quick-number";

const FULL = {
  ...emptyQuickAnswers(),
  guess: 10_00_00_000,
  age: 38,
  targetAge: 50,
  spend: 1_80_000,
  income: 5_00_000,
  corpus: 80_00_000,
  directPlans: true,
  sip: 1_75_000,
  includeSpouse: true,
  spouseCorpus: 70_00_000,
  kids: 2,
  kidsAge: 6,
  education: 75_00_000,
  postgrad: 1_50_00_000,
  wedding: 50_00_000,
  includeHouse: true,
  house: 1_00_00_000,
  houseInYears: 6,
  hasLoan: true,
  emi: 1_00_000,
  loanRate: 0.072,
  loanYearsLeft: 7,
};

describe("quick-share codec (#187)", () => {
  it("round-trips a fully-answered card set byte-for-byte on every field", () => {
    const back = decodeQuickAnswers(encodeQuickAnswers(FULL));
    expect(back).not.toBeNull();
    for (const key of Object.keys(FULL) as (keyof typeof FULL)[]) {
      expect(back![key], `field ${key}`).toEqual(FULL[key]);
    }
  });

  it("round-trips the minimum answer set (age + target + spend only)", () => {
    const min = { ...emptyQuickAnswers(), age: 25, targetAge: 55, spend: 25_000 };
    const back = decodeQuickAnswers(encodeQuickAnswers(min));
    expect(back?.age).toBe(25);
    expect(back?.targetAge).toBe(55);
    expect(back?.spend).toBe(25_000);
    expect(back?.includeSpouse).toBe(false);
    expect(back?.hasLoan).toBe(false);
    expect(back?.directPlans).toBeNull();
  });

  it("preserves the three-state directPlans answer (true / false / not-sure)", () => {
    for (const v of [true, false, null] as const) {
      const back = decodeQuickAnswers(encodeQuickAnswers({ ...FULL, directPlans: v }));
      expect(back?.directPlans).toBe(v);
    }
  });

  it("keeps the token URL-safe and short enough for a WhatsApp message", () => {
    // MEASURED 2026-09-28: a maximal answer set (every field, crore-scale amounts) is 108 chars,
    // so the whole link is ~145 chars — well under WhatsApp's preview cut and any URL limit. The
    // ceiling is pinned so an added field cannot quietly bloat the link past a usable length.
    const token = encodeQuickAnswers(FULL);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBe(108);
    const minimal = encodeQuickAnswers({ ...emptyQuickAnswers(), age: 25, targetAge: 55, spend: 25_000 });
    expect(minimal.length).toBeLessThan(60);
  });

  it("decodes to answers the intake schema itself accepts", () => {
    const back = decodeQuickAnswers(encodeQuickAnswers(FULL));
    expect(quickAnswersSchema.safeParse(back).success).toBe(true);
  });

  it("returns null (never throws) for absent / malformed / oversized tokens", () => {
    for (const bad of [null, undefined, "", "!!!not-base64!!!", "AAAA", "x".repeat(500)]) {
      expect(() => decodeQuickAnswers(bad as string)).not.toThrow();
      expect(decodeQuickAnswers(bad as string)).toBeNull();
    }
  });

  it("returns null for a token that decodes to schema-invalid answers (age 3)", () => {
    // age 3 is below the schema's min(18) — a tampered link must render blank cards, not a
    // half-populated screen.
    const tampered = encodeQuickAnswers({ ...FULL, age: 3 });
    expect(decodeQuickAnswers(tampered)).toBeNull();
  });

  it("tolerates an OLDER, shorter payload by falling back to defaults for the missing tail", () => {
    const full = encodeQuickAnswers(FULL);
    // Simulate a link written by a build that only knew the first four fields.
    const truncated = btoa("2s9v8s|12|1e|3zk")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const back = decodeQuickAnswers(truncated);
    expect(back).not.toBeNull();
    expect(back!.loanYearsLeft).toBe(emptyQuickAnswers().loanYearsLeft);
    expect(decodeQuickAnswers(full)).not.toBeNull();
  });

  it("buildShareUrl produces a /quick?r= link on the given origin", () => {
    const url = buildShareUrl(FULL, "https://firekaro.com/");
    expect(url.startsWith("https://firekaro.com/quick?r=")).toBe(true);
    const token = new URL(url).searchParams.get("r");
    expect(decodeQuickAnswers(token)?.age).toBe(38);
  });

  it("share copy names the age and carries no Hindi (#187 scope)", () => {
    expect(shareText(47)).toBe("I can reach FIRE at 47 — check yours.");
    expect(shareOgTitle(47)).toBe("I can reach FIRE at 47 — check yours");
    expect(shareText(null)).toContain("FIRE number");
    // Devanagari must not appear anywhere in the share copy.
    for (const s of [shareText(47), shareOgTitle(47), shareText(null)]) {
      expect(s).not.toMatch(/[ऀ-ॿ]/);
    }
  });
});

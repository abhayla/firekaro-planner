import { describe, it, expect } from "vitest";
import { computeGlidePath, equityPercentAtYear, summarizeGlidePath } from "./glide-path";
import type { GlidePathConfig } from "@/types/household";

const DEFAULT_CONFIG: GlidePathConfig = {
  enabled: true,
  startEquityPercent: 75,
  endEquityPercent: 40,
  taperWindowYears: 10,
};

describe("computeGlidePath", () => {
  it("returns empty array when disabled", () => {
    const result = computeGlidePath({ ...DEFAULT_CONFIG, enabled: false }, 30);
    expect(result).toEqual([]);
  });

  it("returns single end-equity point when years to retirement <= 0", () => {
    const result = computeGlidePath(DEFAULT_CONFIG, 0);
    expect(result).toEqual([{ year: 0, equityPercent: 40 }]);
  });

  it("holds startEquity in the flat region (years before taper window)", () => {
    const result = computeGlidePath(DEFAULT_CONFIG, 30);
    // flatYears = 30 - 10 = 20, so years 0..20 should be 75
    for (let y = 0; y <= 20; y++) {
      const point = result.find((p) => p.year === y);
      expect(point?.equityPercent).toBe(75);
    }
  });

  it("tapers linearly in the taper window", () => {
    const result = computeGlidePath(DEFAULT_CONFIG, 30);
    // taper region: years 21..30, going from 75% -> 40%
    const at30 = result.find((p) => p.year === 30);
    expect(at30?.equityPercent).toBe(40);

    // midpoint of taper (year 25 = 5 years into taper) = 75 + (40-75)*0.5 = 57.5
    const at25 = result.find((p) => p.year === 25);
    expect(at25?.equityPercent).toBe(57.5);
  });

  it("taper window matches years-to-retirement when smaller", () => {
    const result = computeGlidePath(DEFAULT_CONFIG, 5);
    // taperWindow=10 but yearsToRetirement=5, so taper over 5 years
    expect(result[0].year).toBe(0);
    expect(result[0].equityPercent).toBe(75);
    expect(result[result.length - 1].year).toBe(5);
    expect(result[result.length - 1].equityPercent).toBe(40);
  });
});

describe("equityPercentAtYear", () => {
  it("returns startEquity when disabled (no glide)", () => {
    expect(equityPercentAtYear({ ...DEFAULT_CONFIG, enabled: false }, 30, 15)).toBe(75);
  });

  it("returns startEquity for years inside flat region", () => {
    expect(equityPercentAtYear(DEFAULT_CONFIG, 30, 10)).toBe(75);
    expect(equityPercentAtYear(DEFAULT_CONFIG, 30, 20)).toBe(75);
  });

  it("returns endEquity at retirement", () => {
    expect(equityPercentAtYear(DEFAULT_CONFIG, 30, 30)).toBe(40);
    expect(equityPercentAtYear(DEFAULT_CONFIG, 30, 35)).toBe(40);
  });

  it("interpolates within the taper region", () => {
    // 5 years into a 10-year taper = midpoint = 57.5
    expect(equityPercentAtYear(DEFAULT_CONFIG, 30, 25)).toBeCloseTo(57.5, 5);
  });
});

describe("summarizeGlidePath", () => {
  it("returns 'Glide off' when disabled", () => {
    expect(summarizeGlidePath({ ...DEFAULT_CONFIG, enabled: false }, 30))
      .toBe("Glide off");
  });

  it("describes the taper for enabled paths", () => {
    expect(summarizeGlidePath(DEFAULT_CONFIG, 30))
      .toBe("Glide 75% → 40% over last 10 years");
  });

  it("matches singular year wording", () => {
    expect(summarizeGlidePath({ ...DEFAULT_CONFIG, taperWindowYears: 1 }, 5))
      .toBe("Glide 75% → 40% over last 1 year");
  });
});

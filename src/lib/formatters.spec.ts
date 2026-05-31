import { describe, it, expect } from "vitest";
import {
  formatINR,
  formatINRLakhs,
  formatINRCompact,
  formatPercent,
  parseINR,
  formatYearsMonths,
} from "./formatters";

// These functions render money/percent on EVERY screen — a bug here is
// visible everywhere. Tests pin the Indian grouping, lakh/crore abbreviation,
// the NaN/invalid guards, and the parse round-trip.

describe("formatINR", () => {
  it("formats with the Indian (lakh/crore) digit grouping and ₹ symbol", () => {
    expect(formatINR(150000)).toBe("₹1,50,000");
    expect(formatINR(3650000)).toBe("₹36,50,000");
    expect(formatINR(10000000)).toBe("₹1,00,00,000");
  });

  it("rounds to whole rupees (no paise)", () => {
    expect(formatINR(1234.56)).toBe("₹1,235");
    expect(formatINR(999.4)).toBe("₹999");
  });

  it("handles zero and negatives", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(-50000)).toBe("-₹50,000");
  });

  it("guards against NaN / non-number input", () => {
    expect(formatINR(NaN)).toBe("₹0");
    // @ts-expect-error — runtime guard for bad upstream data
    expect(formatINR(undefined)).toBe("₹0");
    // @ts-expect-error — runtime guard for bad upstream data
    expect(formatINR("abc")).toBe("₹0");
  });
});

describe("formatINRLakhs (no symbol, no space)", () => {
  it("abbreviates crore / lakh / thousand at the right boundaries", () => {
    expect(formatINRLakhs(15000000)).toBe("1.50Cr");
    expect(formatINRLakhs(525000)).toBe("5.25L");
    expect(formatINRLakhs(8300)).toBe("8.3K");
  });

  it("uses crore at exactly 1 crore and lakh at exactly 1 lakh", () => {
    expect(formatINRLakhs(10000000)).toBe("1.00Cr");
    expect(formatINRLakhs(100000)).toBe("1.00L");
    expect(formatINRLakhs(1000)).toBe("1.0K");
  });

  it("falls back to full formatINR below ₹1000", () => {
    expect(formatINRLakhs(500)).toBe("₹500");
    expect(formatINRLakhs(0)).toBe("₹0");
  });

  it("guards against NaN", () => {
    expect(formatINRLakhs(NaN)).toBe("₹0");
  });
});

describe("formatINRCompact (₹ + space + suffix, sign-aware)", () => {
  it("abbreviates with a space and ₹ prefix", () => {
    expect(formatINRCompact(15000000)).toBe("₹1.50 Cr");
    expect(formatINRCompact(525000)).toBe("₹5.25 L");
    expect(formatINRCompact(8300)).toBe("₹8.3K");
  });

  it("preserves the sign on negatives by magnitude bucket", () => {
    expect(formatINRCompact(-15000000)).toBe("-₹1.50 Cr");
    expect(formatINRCompact(-525000)).toBe("-₹5.25 L");
    expect(formatINRCompact(-8300)).toBe("-₹8.3K");
  });

  it("falls back to formatINR below ₹1000 (incl. negatives)", () => {
    expect(formatINRCompact(500)).toBe("₹500");
    expect(formatINRCompact(-500)).toBe("-₹500");
    expect(formatINRCompact(0)).toBe("₹0");
  });

  it("guards against NaN", () => {
    expect(formatINRCompact(NaN)).toBe("₹0");
  });
});

describe("formatPercent", () => {
  it("formats with default 1 decimal and a % suffix", () => {
    expect(formatPercent(42.5)).toBe("42.5%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("respects the decimals argument", () => {
    expect(formatPercent(33.3333, 2)).toBe("33.33%");
    expect(formatPercent(33.3333, 0)).toBe("33%");
  });

  it("guards against NaN", () => {
    expect(formatPercent(NaN)).toBe("0%");
  });
});

describe("parseINR (reverse of the compact formats)", () => {
  it("parses crore / lakh / thousand suffixes", () => {
    expect(parseINR("1.50 Cr")).toBe(15000000);
    expect(parseINR("36.50 L")).toBe(3650000);
    expect(parseINR("5.25 K")).toBe(5250);
  });

  it("strips ₹, commas, and whitespace", () => {
    expect(parseINR("₹1,50,000")).toBe(150000);
    expect(parseINR("₹36,50,000")).toBe(3650000);
  });

  it("is case-insensitive on the suffix", () => {
    expect(parseINR("1.5cr")).toBe(15000000);
    expect(parseINR("2l")).toBe(200000);
  });

  it("returns 0 for empty / unparseable input", () => {
    expect(parseINR("")).toBe(0);
    expect(parseINR("abc")).toBe(0);
  });

  it("round-trips with formatINRCompact for representative values", () => {
    for (const v of [15000000, 525000, 8300]) {
      expect(parseINR(formatINRCompact(v))).toBeCloseTo(v, -2);
    }
  });
});

describe("formatYearsMonths", () => {
  it("renders whole years, whole months, and combined", () => {
    expect(formatYearsMonths(5)).toBe("5y");
    expect(formatYearsMonths(0.5)).toBe("6m");
    expect(formatYearsMonths(3.25)).toBe("3y 3m");
  });

  it("clamps negatives to zero", () => {
    expect(formatYearsMonths(-1)).toBe("0m");
  });

  it("does NOT roll a rounded-up 12th month into a year (known quirk: shows '2y 12m')", () => {
    // y = floor(2.999) = 2; m = round(0.999*12) = 12 — the helper renders
    // "2y 12m" rather than "3y". Documented here so a future fix is a
    // deliberate change, not a silent surprise.
    expect(formatYearsMonths(2.999)).toBe("2y 12m");
  });

  it("renders the em-dash for null / undefined / non-finite", () => {
    expect(formatYearsMonths(null)).toBe("—");
    expect(formatYearsMonths(undefined)).toBe("—");
    expect(formatYearsMonths(Infinity)).toBe("—");
    expect(formatYearsMonths(NaN)).toBe("—");
  });
});

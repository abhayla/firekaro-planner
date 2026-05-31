import { describe, it, expect } from "vitest";
import { ageFromDOB, dobFromAge } from "./age";

describe("ageFromDOB", () => {
  it("returns full years when after birthday", () => {
    const asOf = new Date("2026-06-15");
    expect(ageFromDOB("1990-01-15", asOf)).toBe(36);
  });

  it("subtracts one when before birthday", () => {
    const asOf = new Date("2026-01-14");
    expect(ageFromDOB("1990-01-15", asOf)).toBe(35);
  });

  it("counts birthday day itself as having turned", () => {
    const asOf = new Date("2026-01-15");
    expect(ageFromDOB("1990-01-15", asOf)).toBe(36);
  });

  it("returns 0 for empty / null / undefined", () => {
    expect(ageFromDOB("")).toBe(0);
    expect(ageFromDOB(null)).toBe(0);
    expect(ageFromDOB(undefined)).toBe(0);
  });

  it("returns 0 for unparseable input", () => {
    expect(ageFromDOB("not-a-date")).toBe(0);
  });

  it("returns 0 for DOB in the future", () => {
    const asOf = new Date("2026-01-01");
    expect(ageFromDOB("2030-01-01", asOf)).toBe(0);
  });

  it("handles February 29 leap year DOB on non-leap reference year", () => {
    const asOf = new Date("2026-02-28");
    expect(ageFromDOB("2000-02-29", asOf)).toBe(25);
    const asOfMar = new Date("2026-03-01");
    expect(ageFromDOB("2000-02-29", asOfMar)).toBe(26);
  });

  it("never returns negative", () => {
    const asOf = new Date("2026-01-01");
    expect(ageFromDOB("3000-01-01", asOf)).toBe(0);
  });
});

describe("dobFromAge", () => {
  it("synthesizes Jan 1 of the year that gives the requested age", () => {
    const asOf = new Date("2026-06-15");
    const dob = dobFromAge(36, asOf);
    expect(dob).toBe("1990-01-01");
    // Round-trip: ageFromDOB(dob) should be 36 because Jan 1 < Jun 15.
    expect(ageFromDOB(dob, asOf)).toBe(36);
  });

  it("clamps below 0", () => {
    const asOf = new Date("2026-01-01");
    expect(dobFromAge(-5, asOf)).toBe("2026-01-01");
  });

  it("clamps above 120", () => {
    const asOf = new Date("2026-01-01");
    expect(dobFromAge(500, asOf)).toBe("1906-01-01");
  });

  it("floors fractional ages", () => {
    const asOf = new Date("2026-06-15");
    expect(dobFromAge(36.7, asOf)).toBe("1990-01-01");
  });
});

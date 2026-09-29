/**
 * #198 fix-round-2, item 3 — `ageAsOf` must be zone-independent. A UTC-midnight parse
 * (`new Date("YYYY-MM-DD")`) combined with LOCAL getters is only correct EAST of UTC; west of UTC
 * (e.g. America/Los_Angeles, UTC-7/8) UTC midnight is still the PREVIOUS local day, so the local
 * getters would read one day earlier than the `asOfDate` string says. This is a SEPARATE spec file
 * (not appended to `as-of-date.spec.ts`) because `process.env.TZ` must be set before any `Date` is
 * constructed in this process/worker — vitest runs each spec file in its own module context, so
 * setting `TZ` at the top of this file (before importing anything that touches `Date`) reliably
 * changes what the JS engine's LOCAL getters resolve to for every `Date` created in this file.
 */
process.env.TZ = "America/Los_Angeles"; // UTC-7/8 — a negative offset from UTC

import { describe, it, expect } from "vitest";
import { ageAsOf } from "@/lib/as-of-date";

describe("#198 fix-round-2 — ageAsOf is zone-independent (negative-offset zone)", () => {
  it("resolves the SAME calendar age in America/Los_Angeles as the asOfDate string states, for a birthday on the asOfDate itself", () => {
    // Born 2000-09-29; asOfDate is exactly the birthday, so age turns 26 that day. Under the OLD
    // UTC-midnight-parse implementation, `new Date("2026-09-29")` is UTC midnight = 2026-09-28
    // 17:00 PDT (still the 28th, LOCAL, in America/Los_Angeles) — one day BEFORE the birthday —
    // so `ageFromDOB` would see "asOf is still the 28th" and report 25, not 26. The fixed
    // y/m/d-parts constructor builds 2026-09-29 00:00 LOCAL directly, sidestepping UTC, so it
    // correctly reports 26 in every zone.
    expect(ageAsOf("2000-09-29", "2026-09-29")).toBe(26);
  });

  it("agrees with the local-getter-based todayIsoLocal() convention: age as-of TODAY (this zone) for a birthday 30 years ago today", () => {
    const dob = "1996-09-29";
    expect(ageAsOf(dob, "2026-09-29")).toBe(30);
  });
});

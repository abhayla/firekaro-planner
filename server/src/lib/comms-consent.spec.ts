import { describe, it, expect } from "vitest";
import {
  decideSend,
  resolveConsentPatch,
  type ConsentRecord,
  type FrequencyPolicy,
} from "./comms-consent";

/**
 * Consent + frequency gate — the DPDP/cap decision every production send passes
 * before the Wati adapter. Pins: no consent → deny, revoked → deny, marketing
 * needs opt-in (utility does not), frequency cap counts only the rolling window.
 */

const NOW = "2026-06-02T12:00:00.000Z";
const POLICY: FrequencyPolicy = { maxPerWindow: 3, windowHours: 24 };

const consent = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({
  channel: "whatsapp",
  marketingOptIn: true,
  revokedAt: null,
  ...over,
});

const base = {
  channel: "whatsapp" as const,
  recentSendTimestamps: [] as string[],
  now: NOW,
  policy: POLICY,
};

describe("decideSend — consent gating", () => {
  it("denies when there is no consent record", () => {
    expect(decideSend({ ...base, category: "utility", consent: null })).toEqual({
      allowed: false,
      reason: "no-consent",
    });
  });

  it("denies when the consent record is for a different channel", () => {
    const d = decideSend({ ...base, category: "utility", consent: consent({ channel: "email" }) });
    expect(d).toEqual({ allowed: false, reason: "no-consent" });
  });

  it("denies when consent is revoked — even for utility", () => {
    const d = decideSend({
      ...base,
      category: "utility",
      consent: consent({ revokedAt: "2026-06-01T00:00:00.000Z" }),
    });
    expect(d).toEqual({ allowed: false, reason: "revoked" });
  });

  it("allows utility with base consent even without marketing opt-in", () => {
    const d = decideSend({
      ...base,
      category: "utility",
      consent: consent({ marketingOptIn: false }),
    });
    expect(d).toEqual({ allowed: true, reason: "allowed" });
  });

  it("denies marketing when marketing opt-in is missing", () => {
    const d = decideSend({
      ...base,
      category: "marketing",
      consent: consent({ marketingOptIn: false }),
    });
    expect(d).toEqual({ allowed: false, reason: "no-marketing-consent" });
  });

  it("allows marketing when opted in and under the cap", () => {
    const d = decideSend({ ...base, category: "marketing", consent: consent() });
    expect(d).toEqual({ allowed: true, reason: "allowed" });
  });
});

describe("decideSend — frequency cap", () => {
  it("denies once sends in the window reach the cap", () => {
    const recent = [
      "2026-06-02T11:00:00.000Z",
      "2026-06-02T09:00:00.000Z",
      "2026-06-01T13:00:00.000Z", // within 24h
    ];
    const d = decideSend({
      ...base,
      category: "utility",
      consent: consent(),
      recentSendTimestamps: recent,
    });
    expect(d).toEqual({ allowed: false, reason: "frequency-cap" });
  });

  it("ignores sends older than the window", () => {
    const recent = [
      "2026-06-01T11:00:00.000Z", // 25h ago — outside 24h window
      "2026-05-30T12:00:00.000Z",
      "2026-05-29T12:00:00.000Z",
    ];
    const d = decideSend({
      ...base,
      category: "utility",
      consent: consent(),
      recentSendTimestamps: recent,
    });
    expect(d).toEqual({ allowed: true, reason: "allowed" });
  });

  it("ignores unparseable timestamps (defensive)", () => {
    const d = decideSend({
      ...base,
      category: "utility",
      consent: consent(),
      recentSendTimestamps: ["not-a-date", "", "2026-06-02T11:59:00.000Z"],
    });
    expect(d).toEqual({ allowed: true, reason: "allowed" });
  });

  it("checks consent BEFORE the cap (revoked beats an empty window)", () => {
    const d = decideSend({
      ...base,
      category: "marketing",
      consent: consent({ revokedAt: NOW }),
    });
    expect(d.reason).toBe("revoked");
  });
});

describe("resolveConsentPatch (gh-issue #10 — DPDP re-opt-in + phone validation)", () => {
  const NOW = new Date("2026-06-03T00:00:00Z");

  it("OMITTING `revoked` leaves revokedAt untouched on update (no silent re-opt-in)", () => {
    const res = resolveConsentPatch({ whatsappNumberRaw: undefined }, NOW);
    expect(res.ok).toBe(true);
    if (res.ok) expect("revokedAt" in res.update).toBe(false);
  });

  it("revoked:true stamps revokedAt; revoked:false explicitly clears it", () => {
    const t = resolveConsentPatch({ revoked: true }, NOW);
    const f = resolveConsentPatch({ revoked: false }, NOW);
    if (t.ok) expect(t.update.revokedAt).toEqual(NOW);
    if (f.ok) expect(f.update.revokedAt).toBeNull();
  });

  it("a NEW row defaults to un-revoked when `revoked` is omitted", () => {
    const res = resolveConsentPatch({}, NOW);
    if (res.ok) expect(res.create.revokedAt).toBeNull();
  });

  it("rejects a too-short or too-long number (E.164 7–15 digits)", () => {
    expect(resolveConsentPatch({ whatsappNumberRaw: "12" }, NOW).ok).toBe(false);
    expect(resolveConsentPatch({ whatsappNumberRaw: "1".repeat(16) }, NOW).ok).toBe(false);
  });

  it("accepts a valid number; empty string ⇒ explicit clear (null)", () => {
    const ok = resolveConsentPatch({ whatsappNumberRaw: "+91 79726 72473" }, NOW);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.update.whatsappNumber).toBe("919999900001");
      expect(ok.create.whatsappNumber).toBe("919999900001");
    }
    const clear = resolveConsentPatch({ whatsappNumberRaw: "" }, NOW);
    if (clear.ok) expect(clear.update.whatsappNumber).toBeNull();
  });

  it("omitting the number leaves it untouched (no whatsappNumber key in update)", () => {
    const res = resolveConsentPatch({ revoked: false }, NOW);
    if (res.ok) expect("whatsappNumber" in res.update).toBe(false);
  });
});

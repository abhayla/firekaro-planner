/**
 * Pure consent + frequency-cap decision for outbound comms (WhatsApp first, email
 * later). The gate every production send passes BEFORE the Wati adapter is called
 * (docs/whatsapp-wati-integration.md → Runtime architecture). No DB / IO here — the
 * sender service loads the consent record + recent send timestamps and passes them
 * in; this function only decides allow/deny. DPDP Act 2023: marketing needs explicit
 * opt-in; any send needs an un-revoked channel consent.
 */

import { normalizeWhatsAppNumber } from "./wati-client";

export type CommsChannel = "whatsapp" | "email";
export type TemplateCategory = "utility" | "marketing";

/**
 * Resolve the create/update field patches for a consent PUT from its (partial) input.
 * DPDP-critical (gh-issue #10): an OMITTED `revoked` MUST NOT clear `revokedAt` — re-opt-in
 * after a revoke must be EXPLICIT (`revoked:false`), never a silent side effect of an unrelated
 * toggle (e.g. marketing-only). The UPDATE patch therefore omits `revokedAt` entirely when
 * `revoked` is absent; a NEW row defaults to un-revoked. Phone numbers are validated to E.164
 * length (7–15 digits) and follow the same "absent ⇒ untouched, empty ⇒ explicit clear" rule.
 * Pure (injectable `now`) so the destructive-default class is unit-locked.
 */
export interface ConsentPatchInput {
  revoked?: boolean;
  whatsappNumberRaw?: string;
}
export type ConsentPatchResult =
  | { ok: false; error: string }
  | {
      ok: true;
      create: { revokedAt: Date | null; whatsappNumber?: string | null };
      update: { revokedAt?: Date | null; whatsappNumber?: string | null };
    };

export function resolveConsentPatch(input: ConsentPatchInput, now: Date): ConsentPatchResult {
  // A NEW row: explicit revoke ⇒ timestamp, otherwise un-revoked.
  const create: { revokedAt: Date | null; whatsappNumber?: string | null } = {
    revokedAt: input.revoked ? now : null,
  };
  const update: { revokedAt?: Date | null; whatsappNumber?: string | null } = {};

  // `revoked` present ⇒ set/clear; ABSENT ⇒ leave the stored revocation untouched (DPDP).
  if (input.revoked !== undefined) {
    update.revokedAt = input.revoked ? now : null;
  }

  // Number present ⇒ validate + set/clear; absent ⇒ untouched; empty after normalize ⇒ clear.
  if (input.whatsappNumberRaw !== undefined) {
    const n = normalizeWhatsAppNumber(input.whatsappNumberRaw);
    if (n.length && (n.length < 7 || n.length > 15)) {
      return { ok: false, error: "Invalid WhatsApp number — must be 7–15 digits" };
    }
    const value = n.length ? n : null;
    create.whatsappNumber = value;
    update.whatsappNumber = value;
  }

  return { ok: true, create, update };
}

export interface ConsentRecord {
  channel: CommsChannel;
  /** Explicit opt-in to MARKETING messages on this channel (DPDP). Utility does not require it. */
  marketingOptIn: boolean;
  /** ISO timestamp the user revoked all comms on this channel; null/undefined = active. */
  revokedAt?: string | null;
}

export interface FrequencyPolicy {
  /** Max sends allowed within the window. */
  maxPerWindow: number;
  /** Rolling window length in hours. */
  windowHours: number;
}

export interface SendDecisionInput {
  channel: CommsChannel;
  category: TemplateCategory;
  /** The user's consent on this channel, or null if none on record. */
  consent: ConsentRecord | null;
  /** ISO timestamps of prior sends on this channel to this user. */
  recentSendTimestamps: string[];
  /** ISO "now". Passed in (not read) so the function stays pure + testable. */
  now: string;
  policy: FrequencyPolicy;
}

export type DenyReason =
  | "no-consent"
  | "revoked"
  | "no-marketing-consent"
  | "frequency-cap";

export interface SendDecision {
  allowed: boolean;
  /** Machine-readable reason: "allowed" or a DenyReason. */
  reason: "allowed" | DenyReason;
}

const DENIED = (reason: DenyReason): SendDecision => ({ allowed: false, reason });

/**
 * Decide whether one comms message may be sent. Order: consent presence → revocation
 * → marketing opt-in (marketing only) → frequency cap. Fail-closed on missing/odd input.
 */
export function decideSend(input: SendDecisionInput): SendDecision {
  const { consent, category, channel, recentSendTimestamps, now, policy } = input;

  // 1. Must have a consent record for this channel.
  if (!consent || consent.channel !== channel) return DENIED("no-consent");

  // 2. Revoked → nothing goes out on this channel.
  if (consent.revokedAt) return DENIED("revoked");

  // 3. Marketing requires explicit opt-in; utility rides on the base channel consent.
  if (category === "marketing" && !consent.marketingOptIn) return DENIED("no-marketing-consent");

  // 4. Frequency cap — count sends inside the rolling window.
  const nowMs = Date.parse(now);
  const windowMs = Math.max(0, policy.windowHours) * 3_600_000;
  const cutoff = nowMs - windowMs;
  const inWindow = recentSendTimestamps.filter((ts) => {
    const t = Date.parse(ts);
    return Number.isFinite(t) && t >= cutoff && t <= nowMs;
  }).length;
  if (inWindow >= policy.maxPerWindow) return DENIED("frequency-cap");

  return { allowed: true, reason: "allowed" };
}

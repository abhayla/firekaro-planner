import { quickAnswersSchema, emptyQuickAnswers, type QuickAnswers, type QuickAnswersDraft } from "@/types/quick-number";

/**
 * #187 — the shareable `/quick?r=<compact>` payload.
 *
 * WHY A HAND-ROLLED CODEC: the link is the product here — it goes into a WhatsApp message, so it
 * must stay short and must not break when WhatsApp's linkifier meets `+`, `/` or `=`. So the ten
 * answers are packed as a fixed-ORDER, pipe-joined list of base-36 integers (money rounded to
 * whole rupees, the loan rate to basis points) and then the whole string is base64url'd. A MAXIMAL
 * ten-card answer set (every field filled, crore-scale amounts) measures 108 characters — see
 * quick-share.spec.ts, which pins that ceiling; a minimal one is around 40.
 *
 * Forward/backward compatibility: the field ORDER is append-only and frozen. A decoder reading a
 * shorter payload (an older link) leaves the missing tail at its `emptyQuickAnswers()` default; a
 * decoder reading a LONGER payload (a newer link) ignores the extra fields. Never reorder FIELDS —
 * append.
 */

/** The frozen wire order. APPEND ONLY — reordering silently corrupts every link already shared. */
const FIELD_ORDER = [
  "guess",
  "age",
  "targetAge",
  "spend",
  "income",
  "corpus",
  "sip",
  "spouseCorpus",
  "kids",
  "kidsAge",
  "education",
  "postgrad",
  "wedding",
  "house",
  "houseInYears",
  "emi",
  "loanRateBps",
  "loanYearsLeft",
  "flags",
] as const;

/** Bit positions in the `flags` integer — also append-only. */
const FLAG_SPOUSE = 1;
const FLAG_HOUSE = 2;
const FLAG_LOAN = 4;
const FLAG_DIRECT_KNOWN = 8;
const FLAG_DIRECT_TRUE = 16;

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function n(v: number | undefined): number {
  return Number.isFinite(v) && (v as number) > 0 ? Math.round(v as number) : 0;
}

/** Pack the ten answers into the compact `?r=` token. */
export function encodeQuickAnswers(a: QuickAnswers): string {
  let flags = 0;
  if (a.includeSpouse) flags |= FLAG_SPOUSE;
  if (a.includeHouse) flags |= FLAG_HOUSE;
  if (a.hasLoan) flags |= FLAG_LOAN;
  if (a.directPlans === true || a.directPlans === false) {
    flags |= FLAG_DIRECT_KNOWN;
    if (a.directPlans === true) flags |= FLAG_DIRECT_TRUE;
  }
  const values: Record<(typeof FIELD_ORDER)[number], number> = {
    guess: n(a.guess),
    age: n(a.age),
    targetAge: n(a.targetAge),
    spend: n(a.spend),
    income: n(a.income),
    corpus: n(a.corpus),
    sip: n(a.sip),
    spouseCorpus: n(a.spouseCorpus),
    kids: n(a.kids),
    kidsAge: n(a.kidsAge),
    education: n(a.education),
    postgrad: n(a.postgrad),
    wedding: n(a.wedding),
    house: n(a.house),
    houseInYears: n(a.houseInYears),
    emi: n(a.emi),
    loanRateBps: Math.round((a.loanRate ?? 0) * 10_000),
    loanYearsLeft: n(a.loanYearsLeft),
    flags,
  };
  return b64urlEncode(FIELD_ORDER.map((k) => values[k].toString(36)).join("|"));
}

/**
 * Unpack a `?r=` token back into a full draft. Returns null when the token is absent, malformed,
 * or decodes to answers the schema rejects — a bad link must render the ten cards from scratch,
 * never a half-populated screen (and NEVER throw at route-enter time).
 */
export function decodeQuickAnswers(token: string | null | undefined): QuickAnswersDraft | null {
  if (!token || typeof token !== "string" || token.length > 400) return null;
  let parts: string[];
  try {
    parts = b64urlDecode(token).split("|");
  } catch {
    return null;
  }
  if (parts.length < 4) return null;

  const at = (key: (typeof FIELD_ORDER)[number]): number | undefined => {
    const i = FIELD_ORDER.indexOf(key);
    if (i < 0 || i >= parts.length) return undefined;
    const v = parseInt(parts[i]!, 36);
    return Number.isFinite(v) && v >= 0 ? v : undefined;
  };

  const base = emptyQuickAnswers();
  const flags = at("flags") ?? 0;
  const draft: QuickAnswersDraft = {
    ...base,
    guess: at("guess") ?? base.guess,
    age: at("age") ?? base.age,
    targetAge: at("targetAge") ?? base.targetAge,
    spend: at("spend") ?? base.spend,
    income: at("income") ?? base.income,
    corpus: at("corpus") ?? base.corpus,
    sip: at("sip") ?? base.sip,
    includeSpouse: (flags & FLAG_SPOUSE) !== 0,
    spouseCorpus: at("spouseCorpus") ?? base.spouseCorpus,
    kids: at("kids") ?? base.kids,
    kidsAge: at("kidsAge") ?? base.kidsAge,
    education: at("education") ?? base.education,
    postgrad: at("postgrad") ?? base.postgrad,
    wedding: at("wedding") ?? base.wedding,
    includeHouse: (flags & FLAG_HOUSE) !== 0,
    house: at("house") ?? base.house,
    houseInYears: at("houseInYears") ?? base.houseInYears,
    hasLoan: (flags & FLAG_LOAN) !== 0,
    emi: at("emi") ?? base.emi,
    loanRate: (at("loanRateBps") ?? 0) / 10_000,
    loanYearsLeft: at("loanYearsLeft") ?? base.loanYearsLeft,
    directPlans:
      (flags & FLAG_DIRECT_KNOWN) === 0 ? null : (flags & FLAG_DIRECT_TRUE) !== 0,
  };
  // A shared link must never produce a screen the intake screen itself would refuse.
  return quickAnswersSchema.safeParse(draft).success ? draft : null;
}

/** The absolute URL a recipient opens to see the same result with no account. */
export function buildShareUrl(a: QuickAnswers, origin: string): string {
  return `${origin.replace(/\/$/, "")}/quick?r=${encodeQuickAnswers(a)}`;
}

/** The one-line share text. Plain ASCII + the age — no Hindi (#187 scope decision). */
export function shareText(fireAge: number | null): string {
  return fireAge && Number.isFinite(fireAge)
    ? `I can reach FIRE at ${Math.round(fireAge)} — check yours.`
    : "I just found my FIRE number — check yours.";
}

/** The OG title the result screen stamps onto the live DOM. */
export function shareOgTitle(fireAge: number | null): string {
  return fireAge && Number.isFinite(fireAge)
    ? `I can reach FIRE at ${Math.round(fireAge)} — check yours`
    : "Find out when you can reach FIRE";
}

export const SHARE_OG_DESCRIPTION =
  "FireKaro asks ten quick questions and gives you an honest FIRE date in today's rupees. No account needed.";

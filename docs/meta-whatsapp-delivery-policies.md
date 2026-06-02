# Meta WhatsApp — message delivery policies (Marketing vs Utility vs Authentication)

**Created:** 2026-06-02 · **Owner roles:** Growth/Lifecycle & Retention + Privacy/Compliance (DPDP) ·
**Why:** our first live FireKaro template send returned Wati HTTP 200 but **FAILED** delivery with
*"Meta has restricted it for higher quality messaging"* — Meta's **per-user marketing template
limit** (error **131049**). This document is the authoritative, FireKaro-specific reference on what
delivers, what gets throttled, what it costs, and how to design our messages so they actually arrive.

> **Rates and exact thresholds change.** Treat numeric rates here as "as of mid-2025, India" and
> re-verify against the Meta developer docs before relying on them commercially. Mechanics (the
> categories, the per-user cap, the 24h window, error 131049) are stable.

---

## 0. TL;DR — the one thing to understand

There are **three INDEPENDENT delivery gates**. A message must clear *all three* to arrive. People
constantly confuse them:

| Gate | Side | What it controls | What trips it | Our incident |
|---|---|---|---|---|
| **Per-user marketing limit** | **Recipient** | How many *marketing* templates a person receives from *any* business in a period | Recipient's low recent marketing read-rate / full inbox | ✅ **This is what failed us** (err 131049) |
| **Business messaging tier** | **Sender** | How many *unique users* your number can message / 24h (250 → 1K → 10K → 100K → ∞) | Your sending volume + verification + quality | Not our issue (low volume) |
| **Quality rating** | **Sender** | Green / Yellow / Red health of your number | Blocks, spam reports, low read rates | Not our issue yet |

Plus two pre-conditions: the **template must be approved**, and its **category** (Utility/Marketing/
Authentication) determines pricing AND which gates apply.

**The punchline for FireKaro:** **UTILITY** templates are *not* subject to the per-user marketing
cap (gate 1). Most of our lifecycle messages can legitimately be Utility — and that's the difference
between "delivers reliably" and "silently dropped."

---

## 1. The three template categories (Meta's exact rules)

Source: [Meta — Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization/) (updated 2026-05-21).

### Marketing — the most flexible, the most restricted at delivery
Awareness, sales, promotions, offers, product launches, newsletters, **retargeting/re-engagement**,
app promotion, relationship-building (birthday/anniversary). **Also classified Marketing:**
- **Mixed content** — any utility message that *also* contains promo/persuasion (e.g. an order
  update with a discount).
- **Unclear content** — body is only `{{1}}` or "Congratulations!" with no clear purpose.

→ Charged per message, **no free window**, and **subject to the per-user marketing cap (§3)**.

### Utility — triggered by a user action; delivers reliably
To qualify as Utility a template must meet **BOTH**:
1. **Non-promotional** — zero promotional or persuasive intent, and
2. **Either** specific to / requested by the user (their order, account, service, transaction)
   **OR** essential/critical to the user (e.g. safety).

Examples Meta lists: opt-in/opt-out confirmation, order management, account updates, payment
receipts, appointment/booking updates, alerts.

→ **Free inside an open 24h customer-service window**, cheap outside it, and **NOT subject to the
per-user marketing cap.**

### Authentication — OTP / identity only
One-time passcodes, identity verification. Optimized for high-volume fast delivery; very rigid format.

### Category auto-classification & reclassification
- When you submit a template, **Meta decides the final category** from the content — you can't force
  Utility on a promotional message. Since **2025-04-09** enforcement is strict: pick Utility but write
  promo copy → it's **approved as Marketing** and priced/capped as Marketing.
- Templates in production can be **auto-recategorized** if content patterns warrant.
- **Appeal/review window:** request a category review up to **60 days** from creation (or from the
  date the category was changed).

---

## 2. What happened to us — the per-user MARKETING cap (error 131049)

Source: [Meta — Per-user marketing template message limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/) (updated 2026-05-21).

> "WhatsApp may limit the number of marketing template messages a WhatsApp user receives **from any
> business** in a given period of time when they are less likely to be receptive… based on a number of
> factors, including a **dynamic view of an individual's recent marketing message read rate** and how
> many messages they currently have in their inbox."

Key mechanics:
- **It's a RECIPIENT-side, adaptive cap** — it tracks *the user*, across *all* businesses, not just us.
  Our test number `917972672473` had received broker-marketing broadcasts; its marketing read-rate /
  inbox state pushed it over the line, so *new* marketing templates (ours included) are dropped.
- **Counting:** every delivered marketing template counts toward the user's limit. **If the user
  replies to a marketing message, it opens a 24h window; marketing sent inside that window does NOT
  count.**
- **Retry rule:** wait **≥ 24h** before resending a marketing template to a capped user. Excessive
  retries within 24h → delivery to that user blocked up to 24h, error **131049**.
- **Error code:** failed delivery fires the messages webhook with `status=failed`,
  **`error code 131049`**. (Wati surfaces this as `statusString: FAILED`,
  `failedDetail: "…restricted it for higher quality messaging…"`.)

### Geography (critical for an Indian product with NRI ambitions)
- **India: the per-user marketing cap IS active.** ← us.
- **United States (+1): marketing templates are NOT delivered at all** right now — any attempt errors.
- **NOT active (exempt):** EEA, UK, Japan, South Korea (sender or recipient in these regions).

> Implication: a **US-based NRI cannot receive WhatsApp *marketing* at all.** Utility/Auth still work.
> This reinforces leaning Utility, and keeping email as the parallel channel for marketing reach.

---

## 3. Business messaging tier limits (sender-side volume cap)

Source: [Meta — Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits) · [Chatarmin 2026 guide](https://chatarmin.com/en/blog/whats-app-messaging-limits).

Caps how many **unique users** your business can *start conversations with* per rolling 24h:
- **Tiers:** 250 (unverified) → **1,000** (after Business Verification) → 10,000 → 100,000 → **unlimited**.
- **Since Oct 2025: portfolio-level** — all numbers in a Business Manager share the *highest* achieved
  limit; a new number inherits the strongest number's tier instantly.
- **Auto-scaling:** Meta re-evaluates every **6 hours**; to climb you must use **≥ 50% of the current
  limit within 7 days** while keeping quality high.
- Not our constraint yet (we're low-volume), but matters at scale.

## 4. Quality rating (sender-side health)

Green (high) / Yellow (medium) / Red (low), per number. Driven by read rates, blocks, and spam
reports. Low quality → tier downgrade or restriction. High quality → faster tier upgrades. **Utility
+ genuine opt-in + relevance keep it green;** spraying marketing tanks it.

## 5. Template approval + pacing
- Every template needs Meta approval before sending (UTILITY approves fastest; MARKETING gets strict
  review and must show relevance + prior opt-in; AUTH is rigid).
- **New marketing templates are "paced"** — Meta sends to a subset first and watches quality before
  releasing the full broadcast.

---

## 6. The 24-hour customer-service window (session messages) — the escape hatch
When a user **messages your business first** (or replies to your template), a **24-hour window** opens
in which you can send **free-form, non-template "service" messages** AND **free utility templates**:
- **No template approval needed** for free-form messages in the window.
- **NOT subject to the per-user marketing cap.**
- **Free** (utility-in-window and service messages cost nothing).
- This is the most reliable way to reach an engaged user — and how we'll verify delivery to
  `917972672473` (have the user message the business number, then send a session message).

---

## 7. Pricing (per-message model — India)

Source: [Meta — Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) · [MediaNama, India per-message](https://www.medianama.com/2025/07/223-whatsapp-business-per-message-pricing-india/) · [PickyAssist India rates](https://pickyassist.com/blog/whatsapp-message-pricing-india-2025/).

- **Since 1 July 2025 (India): per-message pricing** (replaced conversation-based).
- **Approx India rates (mid-2025, verify current):** Marketing **₹0.78** · Utility **₹0.11** ·
  Authentication **₹0.12** · Auth-International ~₹2.3.
- **Free:** all **service/non-template** messages inside an open 24h window; **utility templates
  inside an open window**; everything inside a 72h click-to-WhatsApp-ad entry-point window.
- **Volume discounts** on Utility/Auth as monthly volume scales (25M → 300M+).
- **Takeaway:** Utility is **~7× cheaper** than Marketing AND free-in-window AND uncapped. Every
  message we can legitimately make Utility wins on cost *and* deliverability.

---

## 8. Opt-in (Meta policy ∩ India DPDP Act 2023)
- **Meta** requires demonstrable opt-in before sending templates (especially marketing); opt-in can
  be collected off-WhatsApp (website/app checkbox) and confirmed via a utility opt-in template.
- **DPDP Act 2023** requires purpose-bound, revocable consent + an easy opt-out (see
  `whatsapp-wati-integration.md`). The two regimes align: capture explicit consent at FireKaro
  onboarding, store the record, honor STOP/opt-out, never buy/scrape numbers.

---

## 9. Error-code quick reference (delivery failures)
| Code | Meaning | Action |
|---|---|---|
| **131049** | Per-user marketing limit — recipient won't receive more marketing now | Don't retry < 24h; switch to Utility or wait |
| 131047 | Re-engagement needed — outside 24h window, must use a template | Send an approved template |
| 131026 | Message undeliverable (recipient can't receive / not on WA / quality) | Verify number; reduce marketing pressure |
| 131048 | Spam-rate limit hit (sender quality) | Improve quality, reduce volume |
| 130472 | User in an experiment group / marketing not delivered | Expected; don't retry aggressively |

---

## 10. What this means for FireKaro (the strategy)

1. **Make lifecycle messages UTILITY wherever legitimate.** They must be non-promotional + user-
   specific/critical. These qualify:
   - **Welcome** after signup — account/onboarding confirmation (keep it informational, **no
     "explore our features" promo tone**, or Meta reclassifies it Marketing).
   - **Milestone reached** (₹1 Cr, Coast-FIRE, 25/50/75%) — an account-status update about *their*
     plan.
   - **Off-track / plan-needs-attention alert** — account alert specific to their data.
   - **Goal-deadline reminder**, **tax-filing/Budget update** tied to their plan.
2. **Accept that these are MARKETING (capped + ₹0.78 + opt-in-strict):** monthly digest, newsletter,
   appraisal-prompt, dormant win-back, festival/awareness. Use them **sparingly, highly relevant,**
   and design them to **earn a reply** (a reply opens the free 24h window and uncaps the user).
3. **Keep the copy clean of mixed content.** A utility update with even one promo line becomes
   Marketing. Separate the transactional message from any upsell.
4. **Never hammer a capped user.** On error 131049, stop for ≥ 24h (our send-log must record the
   webhook status and back off — not retry).
5. **Capture real delivery status**, never trust Wati's 200: consume the `template-message-sent`,
   `…delivered`, `…failed` webhooks (or poll `getMessages`) and store it on the send-log.
6. **Email is the uncapped parallel channel** for true marketing/digest reach (and the only marketing
   path to US-based NRIs). WhatsApp = high-signal utility + engaged-user session messaging.
7. **Verification path for the capped test number:** have the user message the business number →
   send a free-form **session** message (uncapped, no template) → confirm receipt.

---

## Sources
- [Meta — Per-user marketing template message limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/)
- [Meta — Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization/)
- [Meta — Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [MediaNama — WhatsApp per-message pricing in India (Jul 2025)](https://www.medianama.com/2025/07/223-whatsapp-business-per-message-pricing-india/)
- [PickyAssist — India message pricing 2025](https://pickyassist.com/blog/whatsapp-message-pricing-india-2025/)
- [Chatarmin — WhatsApp messaging limits 2026](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [AiSensy — Meta frequency capping for WhatsApp marketing](https://m.aisensy.com/blog/meta-frequency-capping-for-whatsapp-marketing-messages/)
- [Wati — Understanding template types & guidelines](https://support.wati.io/en/articles/11463489-understanding-whatsapp-template-message-types-and-guidelines)
- Internal: `docs/whatsapp-wati-integration.md`, memory `project_wati_delivery_gotcha`

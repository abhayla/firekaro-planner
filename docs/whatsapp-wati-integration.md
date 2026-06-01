# WhatsApp engagement via Wati.io — design + templates

**Created:** 2026-06-01 · **Status:** 🟡 In design / build · **Owner roles:** Growth/Lifecycle &
Retention (loop), Full-Stack (channel), Privacy/Compliance DPDP (consent). · **Scope:** Phase 1 of
`retention-engagement-features.md` — **WhatsApp only** (email deferred).

## Decisions (locked 2026-06-01)
- **Channel first:** WhatsApp via **Wati.io** (existing subscription — reuse, Principle 4). Email later.
- **CRM sync target:** FireKaro users go into the **existing PIFS Zoho CRM** (org `60019670093`,
  plan crmplus), in the **same database/module as broker contacts**, distinguished by a **filter
  value** (a `Lead Source` / custom field = `FireKaro`). Abhay's explicit call.
  - `TODO(5W):` ratify "FireKaro user contacts live in PIFS's CRM under a FireKaro source filter"
    in `5Wealths\Financial Wealth\FW-FireKaro\DECISIONS.md` — it's a cross-entity data + funnel
    decision (FireKaro → AP demat lead funnel), portfolio-tier per L-042.
- **SSOT unchanged:** FireKaro's own DB remains SSOT for all user + financial data. Only a **minimal
  marketing contact** (name, WhatsApp number, consent flags, lifecycle stage, source=`FireKaro`) is
  synced to PIFS CRM — **no salary/PAN/financial values** (DPDP minimisation).

## DPDP consent (gates every send — build before any message goes out)
WhatsApp business-initiated messages require prior opt-in (Meta policy + DPDP Act 2023). Because
contacts also land in **PIFS's** CRM, onboarding consent copy MUST disclose:
> "I agree to receive FireKaro updates on WhatsApp, and that my contact details are processed by
> Passive Income Financial Solutions Pvt Ltd (PIFS) for FireKaro and related financial-product
> communication. I can opt out anytime."

Consent model: opt-in checkbox at onboarding + a per-channel preference centre with a hard frequency
cap and an STOP/opt-out path. Store `{ userId, channel: "whatsapp", purpose, consentedAt, revokedAt, source }`.

## Safety rail — recipient allowlist (enforced in code, not just policy)
Per Abhay's standing instruction, **all testing sends go ONLY to his number `917972672473`; no other
number is messaged without explicit broadcast approval.** This is enforced in `wati-client.ts`, not
left to discipline — the adapter is **fail-closed**:
- `WATI_TEST_RECIPIENTS` (comma-separated, in `server/.env`) — the allowlist. Dev value: `917972672473`.
- `WATI_ALLOW_ALL_RECIPIENTS` — the explicit broadcast switch; only the exact string `'true'` enables
  sending to non-allowlisted numbers. Flipping it on = messaging real users = **escalation** (spend +
  outbound), Abhay's call only.
- If a recipient is not allowlisted and broadcast is off, `sendTemplateMessage` returns a blocked
  result and **never calls Wati** (no message leaves). Empty allowlist + broadcast off ⇒ nothing sends.

Regression-locked by `wati-client.spec.ts` (blocks a stranger's number, allows `917972672473`,
broadcast bypass requires the explicit flag).

## Inputs needed from Abhay (the only blockers to live sends)
1. **WATI_API_ENDPOINT** — your tenant base URL (Wati → API Docs, e.g. `https://live-server-XXXXX.wati.io`).
2. **WATI_API_TOKEN** — the access token (Wati → API Docs → "Access Token"). Stored in `server/.env`
   only (gitignored — never committed; `validate-env.ts` will require it when the channel is enabled).
3. Confirmation I may **submit the templates below for Meta approval** via your Wati account
   (approval takes ~1–3 days — the long pole; submit early).

## Message templates (submit to Meta via Wati)
WhatsApp categories: **UTILITY** (transactional, tied to a user action — cheaper, easier approval)
vs **MARKETING** (promotional/engagement). Variables are positional `{{n}}`.

| # | Name | Category | Body |
|---|------|----------|------|
| 1 | `firekaro_welcome` | UTILITY | Hi {{1}}, welcome to FireKaro 🎯 Your FIRE number is ₹{{2}}. Open your plan: {{3}} |
| 2 | `firekaro_milestone` | UTILITY | 🎉 {{1}}, you crossed {{2}} — you're now {{3}}% of the way to FIRE. See your plan: {{4}} |
| 3 | `firekaro_offtrack` | UTILITY | Hi {{1}}, your FIRE plan slipped off-track: {{2}}. Here's the fix: {{3}} |
| 4 | `firekaro_monthly_digest` | MARKETING | Hi {{1}}, your FireKaro month: net worth {{2}}, savings rate {{3}}%, FIRE date {{4}}. Details: {{5}} |
| 5 | `firekaro_appraisal_prompt` | MARKETING | Hi {{1}}, got a raise recently? Update your salary in FireKaro and watch your FIRE date move earlier: {{2}} |
| 6 | `firekaro_winback` | MARKETING | Hi {{1}}, it's been a while. Your FIRE date is now {{2}} — see what changed: {{3}} |

Start with #1–#3 (UTILITY) — fastest approval and the highest-signal moments; layer MARKETING after.

## ⚠️ Delivery gotcha — Meta marketing cap + "200 ≠ delivered" (found 2026-06-02)
Wati `sendTemplateMessage` returns **HTTP 200 on ACCEPT, not on delivery**. Real status is async —
verify via `GET /api/v1/getMessages/{number}` → `statusString` + `failedDetail` (see
`scripts/wati-diagnose.ts`).

First live test to `917972672473` returned 200 but the message **FAILED**:
`"Message undeliverable as Meta has restricted it for higher quality messaging - retry again in a
few days"` — and so did the PIFS broker MARKETING broadcasts to that number going back to April. Cause:
**Meta's per-recipient MARKETING-template frequency cap** (quality throttle). Implications:
- **Prefer UTILITY templates** for FireKaro lifecycle (welcome/milestone/off-track are legitimately
  account-update/utility) — utility is NOT subject to the marketing cap and delivers reliably.
- **Session messages** (free text, within 24h of the user messaging the business) bypass template
  limits — the most reliable way to verify the pipe.
- The send-log/adapter MUST record **actual delivery status** (poll getMessages or consume the
  `Template Message Sent`/`…DELIVERED`/`…FAILED` webhooks) — never treat the 200 as proof.

## Architecture (FireKaro v6 backend — Hono/Prisma)
1. **Schema (Prisma, new):** `CommsConsent` (per-user/channel/purpose) + `WhatsAppSendLog`
   (userId, template, params hash, status, providerMessageId, sentAt) for idempotency + audit.
2. **Wati adapter** (`server/src/lib/wati-client.ts`): `sendTemplate(toNumber, templateName, params)`
   → `POST {WATI_API_ENDPOINT}/api/v1/sendTemplateMessage` with `Authorization: Bearer {token}`.
   Pure HTTP, fully unit-testable with a mocked fetch (no creds needed to test the adapter logic).
3. **Trigger layer:** reuse `src/lib/nudge-engine.ts` to decide *which* nudge fires; map nudge →
   template + params; gate on consent + frequency cap; write the send-log; call the adapter.
4. **CRM sync** (`server/src/lib/zoho-crm-sync.ts`): upsert a minimal contact into PIFS CRM with
   `Lead Source = FireKaro` on opt-in. Built behind the same consent gate. (Phase 1b — after sends.)
5. **Scheduler:** digest cadence via cron/queue (Phase 1b).

## Build order (what's blocked vs not)
- **Now, unblocked, reversible (I build under TDD):** consent model + preference centre + Wati
  adapter (mocked-fetch unit tests) + nudge→template mapping + send-log schema. Zero spend, no creds.
- **Blocked on Wati creds + template approval:** live send + end-to-end verification (rules 24/25/26).
- **Escalation (Abhay's go):** flipping on real outbound sends (spend + publishes to users);
  writing real contacts into the PIFS production CRM.

## References
- `docs/retention-engagement-features.md` — parent backlog
- `src/lib/nudge-engine.ts` — nudge generation (reuse target)
- `.claude/rules/engineering-roles.md` — Growth / Privacy(DPDP) roles
- `5W-GLOSSARY.md` — Wati.io; PIFS entity

---
name: wa-template-verify
description: >
  Send a WhatsApp template to the fail-closed allowlisted test number via Wati and VERIFY ACTUAL
  DELIVERY — the terminal message status, never the HTTP 200. Use when testing a newly-approved Wati
  template, adding a FireKaro lifecycle template, or debugging why a WhatsApp message did not arrive.
  Classifies failures by Meta error code (131049 per-user marketing cap, etc.).
type: workflow
allowed-tools: "Bash Read"
argument-hint: "<template_name>"
version: "1.0.0"
---

# WhatsApp template send + delivery verification

Encodes the hard-won discipline from 2026-06-02: **Wati's HTTP 200 means *accepted*, not
*delivered*.** A send is only "successful" when `getMessages` shows `statusString: DELIVERED`. Run
all commands from the repo's `server/` directory (it loads `WATI_*` from the gitignored `server/.env`).

## STEP 1: Confirm the template is APPROVED + the right category
```bash
cd server && npx tsx scripts/wati-diagnose.ts <template_name>
```
Read the `=== TEMPLATE ===` block:
- `status` MUST be `APPROVED`. If `PENDING`/`DRAFT` → stop; it can't deliver yet.
- `category`: **UTILITY delivers reliably. MARKETING is subject to the per-user cap** (err 131049) and
  will likely FAIL to a previously-marketed number like the test recipient. If MARKETING, expect a
  cap failure and prefer a UTILITY template (see `docs/meta-whatsapp-delivery-policies.md`).
- Note `customParams` (variable count) so the send fills the right values.

## STEP 2: Send to the allowlisted number (only)
```bash
cd server && npx tsx scripts/wati-test-send.ts <template_name>
```
The Wati adapter is **fail-closed**: it only sends to numbers in `WATI_TEST_RECIPIENTS`
(`feedback_whatsapp_test_recipient`). A `200 / ok:true` here means *accepted* — NOT delivered.
A transient `400` right after approval is known; retry once (Wati send endpoint lags approval).

## STEP 3: Verify the TERMINAL delivery status (the real check)
Wait a few seconds, then:
```bash
cd server && npx tsx scripts/wati-daily-report.ts --since-hours 1
```
or inspect the specific message:
```bash
cd server && npx tsx scripts/wati-diagnose.ts <template_name>   # read the top RECENT MESSAGES item
```
- `statusString: DELIVERED` (or `READ`) → ✅ genuine success.
- `statusString: SENT` → still in flight; re-check in a few seconds.
- `statusString: FAILED` → read `failedDetail` + the error bucket (STEP 4).

## STEP 4: Classify a failure (don't guess)
| `failedDetail` / code | Meaning | Action |
|---|---|---|
| 131049 "…higher quality messaging…" | per-user MARKETING cap | switch to a UTILITY template; do NOT resend < 24h |
| 131026 not on WhatsApp / invalid | bad/again number | verify the number |
| 131047 outside 24h window | needs a template / session | send approved template |
Then report the human-confirmed outcome. For a true end-to-end pass, ask the user to confirm phone
receipt (the one signal not observable from the API).

## CRITICAL RULES
- MUST verify `statusString` (DELIVERED/READ) — NEVER report success on the HTTP 200.
- MUST only ever send to the `WATI_TEST_RECIPIENTS` allowlist; broadcast to real users is an
  escalation (spend + outbound), the user's call only (`WATI_ALLOW_ALL_RECIPIENTS`).
- MUST NOT auto-retry a 131049 (marketing-cap) failure within 24h — Meta blocks the WABA for that user.
- Prefer UTILITY templates for FireKaro lifecycle messages; MARKETING is capped + ~7× costlier.

---
name: wati-send-and-verify-delivery
description: >
  Send a WhatsApp template via Wati.io to a safe test recipient and VERIFY THE MESSAGE ACTUALLY
  DELIVERED — by reading the terminal message status from Wati, never trusting the HTTP 200 (which
  only means "accepted"). Use when testing a newly-approved Wati template, sending a WhatsApp
  template through Wati, or debugging why a Wati/WhatsApp message did not arrive. Confirms template
  approval + category first, enforces a fail-closed recipient allowlist, and classifies any failure
  by its Meta error code (e.g. 131049 = per-user marketing cap). Portable: depends only on Wati
  env vars + curl, so it works in any Claude Code or Claude Cowork project.
type: workflow
allowed-tools: "Bash Read"
argument-hint: "<template_name> [recipient_number]"
version: "2.1.0"
---

# Wati — send a WhatsApp template and verify actual delivery

**Core discipline (the reason this skill exists):** Wati's `sendTemplateMessage` returning **HTTP 200
means *accepted*, not *delivered*.** A send is only successful when Wati's `getMessages` shows
`statusString: DELIVERED` (or `READ`). Always verify the terminal status.

## Prerequisites
- **Only hard dependency: `curl`** (or any HTTP client). **Do NOT depend on `python3`/`jq`** — read
  the JSON responses yourself; they're small.
- **Config values** (never hardcode): `WATI_API_ENDPOINT`, `WATI_API_TOKEN`, `WATI_TEST_RECIPIENTS`,
  `WATI_ALLOW_ALL_RECIPIENTS`.

| Var | Purpose |
|---|---|
| `WATI_API_ENDPOINT` | Tenant base URL, e.g. `https://live-mt-server.wati.io/<tenantId>` (no trailing slash) |
| `WATI_API_TOKEN` | Access token. If it begins with `Bearer `, strip that prefix — the calls add the scheme |
| `WATI_TEST_RECIPIENTS` | Comma-separated allowlist of numbers (digits, no `+`) that may receive test sends |
| `WATI_ALLOW_ALL_RECIPIENTS` | Must equal `true` to send to anyone outside the allowlist (an explicit broadcast — escalation) |

## STEP 0: Resolve the config (don't assume it's already in the shell)
These values may live in the **shell env**, a **dotenv file** (`.env`, `server/.env`, …), or a
**secret store / Cowork secret**. Locate them however this project stores them, then export for the
session. If they're in a dotenv file, source it:
```bash
for f in .env server/.env server/.env.local .env.local; do
  [ -f "$f" ] && set -a && . "$f" && set +a && break
done
TOKEN="${WATI_API_TOKEN#Bearer }"          # strip a leading "Bearer " if present
BASE="${WATI_API_ENDPOINT%/}"              # trim trailing slash
TPL="$1"                                      # arg 1: template name
NUM="${2:-$(printf '%s' "$WATI_TEST_RECIPIENTS" | cut -d, -f1 | tr -cd '0-9')}"  # arg 2 or first allowlisted
```
If `$BASE` or `$TOKEN` is empty after this, STOP and ask where this project keeps its Wati credentials.

## STEP 1: Confirm the template is APPROVED + check its category
```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/getMessageTemplates"
```
Read the returned JSON yourself: find the object in `messageTemplates[]` whose `elementName == $TPL`,
then check its `status`, `category`, and `customParams` (variable names).
- `status` MUST be `APPROVED` (else it can't deliver — stop).
- **`category`: UTILITY delivers reliably. MARKETING is subject to Meta's per-user cap** and will
  likely FAIL to a number that has recently received marketing (error 131049). Prefer UTILITY for
  lifecycle/transactional messages.
- Note the `customParams` (variable names) so STEP 3 fills the right count.

## STEP 2: SAFETY GATE — never message anyone but the allowlist
MUST refuse to send to `$NUM` unless it is in `WATI_TEST_RECIPIENTS`, OR
`WATI_ALLOW_ALL_RECIPIENTS == "true"`. Sending to real users is an escalation (spend + outbound) —
the human's explicit decision only. Verify `$NUM` is allowlisted before STEP 3.

## STEP 3: Send the template
```bash
curl -s -X POST "$BASE/api/v1/sendTemplateMessage?whatsappNumber=$NUM" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"template_name\":\"$TPL\",\"broadcast_name\":\"$TPL\",\"parameters\":[]}"
```
(For a template WITH variables, set `parameters` to `[{"name":"1","value":"..."}]` etc.)
A `200` / `result:true` here = **accepted, NOT delivered.** A transient `400` immediately after
approval is known — retry once (Wati's send endpoint lags Meta approval).

## STEP 4: Verify the TERMINAL delivery status (the real check)
Wait a few seconds, then read the most recent message for the number:
```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/getMessages/$NUM?pageSize=5"
```
In the returned JSON, find the most recent `messages.items[]` entry with `eventType == "broadcastMessage"`
and read its `statusString` (and `failedDetail` if failed):
- `DELIVERED` / `READ` → ✅ genuine success.
- `SENT` → still in flight; re-check in a few seconds.
- `FAILED` → read `failedDetail` and classify (STEP 5).

## STEP 5: Classify a failure (don't guess)
| `failedDetail` / Meta code | Meaning | Action |
|---|---|---|
| 131049 "…higher quality messaging…" | per-user MARKETING cap (recipient-side) | use a UTILITY template; **do NOT resend < 24h** |
| 131026 not on WhatsApp / invalid | bad number | verify the number |
| 131047 outside 24h window | session expired | send an approved template |
| 131048 spam-rate | sender quality | reduce volume, improve quality |
For a true end-to-end pass, also ask the human to confirm phone receipt — the one signal not visible
in the API.

## CRITICAL RULES
- MUST verify `statusString` (DELIVERED/READ) — NEVER report success on the HTTP 200.
- MUST only send to `WATI_TEST_RECIPIENTS` unless `WATI_ALLOW_ALL_RECIPIENTS=="true"` (escalation).
- MUST NOT auto-retry a 131049 (marketing-cap) failure within 24h — Meta blocks the WABA for that user.
- Prefer UTILITY templates for lifecycle/transactional messages; MARKETING is capped + ~7× costlier.
- Self-contained by design (Wati API + curl only). If a project ships Wati helper scripts, they MAY
  be used as a shortcut, but this skill never depends on them.

> **To finalize as a GLOBAL skill** (usable across all Claude Code + Cowork projects): move this
> directory to `~/.claude/skills/wati-send-and-verify-delivery/`. It is already portable — no
> project paths, no hardcoded numbers; it reads everything from the `WATI_*` env vars above.

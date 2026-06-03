---
name: wati-template-create-and-track
description: >
  Create + submit WhatsApp message templates to Meta (via the Wati.io API) from a project manifest,
  then track each to APPROVED. Use when adding/submitting new Wati/WhatsApp templates, getting
  templates approved, or re-submitting a rejected template. Reads a per-project wati-templates.json
  manifest (full template anatomy: category UTILITY/MARKETING/AUTHENTICATION, language, header, body,
  footer, buttons, positional variables + Meta samples), submits each not-yet-existing one to
  Wati's create endpoint, then polls approval status. Idempotent (never re-submits an APPROVED/PENDING
  template). Portable: depends only on the WATI_* env vars + curl, so it works in any Claude Code or
  Cowork project. Pairs with /wati-send-and-verify-delivery (which sends an APPROVED template and
  verifies real delivery) — this skill ends where that one begins.
type: workflow
allowed-tools: "Bash Read"
argument-hint: "[manifest-path] [template-key]"
version: "1.0.0"
---

# Wati — create + submit WhatsApp templates and track to approval

**What this does:** turns a project's template manifest into APPROVED Meta templates. For each template
in the manifest that does NOT already exist in the Wati tenant, it POSTs a create+submit call (which
sends it to Meta for review), then polls until `APPROVED`/`REJECTED`. Submitting ≠ sending: no user
is messaged and there is no per-message spend — this is account/config setup. **Sending** an approved
template is the *other* skill (`/wati-send-and-verify-delivery`).

**Recurring-task framing:** the manifest is the single source of truth; re-running the skill only acts
on templates not yet submitted, so it is safe to run repeatedly as the catalog grows.

## Prerequisites
- **Only hard dependency: `curl`** (read the small JSON responses yourself — do NOT depend on `jq`/`python3`).
  In a Node project, an inline `node` one-liner is a fine batch accelerator, but never a requirement.
- **Config values** (never hardcode): `WATI_API_ENDPOINT`, `WATI_API_TOKEN` (same vars as
  `/wati-send-and-verify-delivery`).

| Var | Purpose |
|---|---|
| `WATI_API_ENDPOINT` | Tenant base URL, e.g. `https://live-mt-server.wati.io/<tenantId>` (no trailing slash) |
| `WATI_API_TOKEN` | Access token. If it begins with `Bearer `, strip that prefix — the calls add the scheme |

## STEP 0: Resolve the config (don't assume it's already in the shell)
Load the machine-global file first as the base, then let any project-local file override it:
```bash
for f in "$HOME/.config/wati/.env" "$HOME/.wati.env" "$WATI_ENV_FILE" \
         .env server/.env server/.env.local .env.local; do
  [ -n "$f" ] && [ -f "$f" ] && set -a && . "$f" && set +a
done
TOKEN="${WATI_API_TOKEN#Bearer }"     # strip a leading "Bearer "
BASE="${WATI_API_ENDPOINT%/}"         # trim trailing slash
```
If `$BASE` or `$TOKEN` is empty: STOP — this environment has no Wati credentials. Set up
`~/.config/wati/.env` (the `WATI_*` lines, `chmod 600`) or, in Cowork, add them as environment secrets.

## STEP 1: Locate + read the manifest
Default path `docs/wati-templates.json` (override: arg 1). **Read it with the Read tool** — you (the
agent) parse it; no runtime JSON parser needed. Manifest shape:
```jsonc
{
  "wabaId": "<digits>",                       // the WhatsApp Business Account id (also returned by getMessageTemplates)
  "defaults": { "language": "en", "footer": "...", "header": null, "buttons": [] },
  "templates": [
    {
      "key": "MILESTONE",                     // maps to the project's send-time mapping (e.g. COMMS_TEMPLATE_<KEY>)
      "elementName": "firekaro_milestone",    // the Meta template name (kept verbatim by the API — no date suffix)
      "category": "UTILITY",                  // UTILITY | MARKETING | AUTHENTICATION
      "language": "en",                       // optional; falls back to defaults
      "status": "pending",                    // approved | pending | rejected  (skip create for approved/pending)
      "header": null,                         // optional: { "type":"text|image|...", ... }
      "body": "Hi {{1}}, ... firekaro.com.",  // positional {{1}}..{{n}}; MUST end with static text
      "footer": "...",                        // optional
      "buttons": [],                          // optional
      "variables": [ { "position": 1, "name": "name", "sample": "Abhay" } ]  // order MUST match {{n}}
    }
  ]
}
```

### Meta content rules the manifest MUST satisfy (verify before submitting)
- **Body MUST NOT end with a variable** — there must be static text after the last `{{n}}` (Meta rejects otherwise).
- **Variables are positional** `{{1}}`,`{{2}}`,… and `variables[]` order MUST match those positions; each
  `sample` is the approval example Meta sees.
- **Category honesty:** UTILITY = transactional / account-specific (delivers reliably, no opt-in).
  MARKETING = promotional / engagement (per-user capped, costs ~7×, needs the recipient's marketing opt-in).
  One persuasive line ("grow your wealth", "don't miss out") makes Meta reclassify a UTILITY template as
  MARKETING. Pick the category that matches the copy; do not mislabel to dodge the cap.

## STEP 2: Idempotency gate — never re-submit what already exists
```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/getMessageTemplates?pageSize=100"
```
For each manifest template, find the tenant object whose `elementName == <elementName>`. **Skip** any
that is already `APPROVED` or `PENDING` (submitting a duplicate name errors or creates noise). Capture
the `wabaId` from any returned object if the manifest didn't have it. Only `REJECTED` or absent
templates proceed to STEP 3.

## STEP 3: Create + submit each pending template
**Endpoint (note the camelCase + slash — this exact path):**
```
POST $BASE/api/v1/whatsApp/templates
```
Payload (built from the manifest entry; `customParams` is the positional samples, in order):
```bash
curl -s -X POST "$BASE/api/v1/whatsApp/templates" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "elementName": "firekaro_milestone",
    "category": "UTILITY",
    "language": "en",
    "type": "template",
    "body": "Hi {{1}}, ... firekaro.com.",
    "footer": "FireKaro · firekaro.com",
    "customParams": [
      {"paramName":"1","paramValue":"Abhay"},
      {"paramName":"2","paramValue":"1 Cr"},
      {"paramName":"3","paramValue":"25%"}
    ]
  }'
```
- `customParams[].paramName` is the **position as a string** (`"1"`,`"2"`,…); `paramValue` is the sample.
- Omit `customParams` for a variable-free template; add `header`/`buttons` only when the manifest has them.
- **Success = `{ "ok": true, "result": { "status": { "newStatus": 1, ... }, "waTemplateId": "...", "elementName": "..." } }`.**
  `newStatus: 1` means *submitted to Meta / pending* — the create call itself submits for review.
  Record the returned `elementName` (verbatim — the API keeps your name) and `waTemplateId`.

## STEP 4: Poll approval status (Meta review = 30 min – 24 h)
Re-run STEP 2's `getMessageTemplates` and read each template's `status`:
- `APPROVED` → ✅ ready; usable via `/wati-send-and-verify-delivery`.
- `PENDING` → still under Meta review; report and exit (do NOT block for hours — re-run later).
- `REJECTED` → read the rejection reason; go to STEP 5.

Report a status table per run (status · category · elementName). Update the manifest `status` field
(and record the approved name) so the next run skips the now-approved ones.

## STEP 5: Handle a rejection (don't guess — read the feedback, fix, resubmit)
Common causes: body ends with a variable; promotional copy in a UTILITY template; mismatched samples.
Fix the manifest, then delete the rejected template and resubmit:
```bash
# delete by name (all languages)
curl -s -X DELETE "$BASE/api/v1/whatsApp/templates/$WABAID/<elementName>" -H "Authorization: Bearer $TOKEN"
# or a single language
curl -s -X DELETE "$BASE/api/v1/whatsApp/templates/$WABAID/<elementName>/<langCode>" -H "Authorization: Bearer $TOKEN"
```
Then re-run STEP 3 for that key.

## STEP 6: Hand off
Once a template is `APPROVED`, the project wires its real name into whatever send-time mapping it uses
(in FireKaro: the `COMMS_TEMPLATE_<KEY>` env var, no code change). Verify a real delivery with
`/wati-send-and-verify-delivery <elementName>` to your test number before relying on it.

## CRITICAL RULES
- MUST use the exact create path `POST /api/v1/whatsApp/templates` (camelCase `whatsApp`, slash before
  `templates`) — `/api/v1/whatsapp-templates` is a 404 (the doc *filename* mangles the real path).
- MUST be idempotent: skip any `elementName` already `APPROVED`/`PENDING`. Never blind-resubmit.
- MUST keep `category` honest (UTILITY vs MARKETING) and ensure the body does NOT end with a variable.
- MUST source `WATI_*` from env only — never hardcode the endpoint or token; never log the token.
- MUST treat the manifest as the source of truth; record returned `elementName`/`waTemplateId`/`status`
  back into it so re-runs are no-ops on done templates.
- Submitting is config (no spend, no user messaged) — but it IS a real artifact in the live tenant + a
  Meta review, so submit only the human-reviewed manifest content. **Sending** an approved template is
  the other skill and (to real users) is the explicit spend/escalation gate — not this skill's job.
- Self-contained: Wati API + curl only. If a project ships Wati helper scripts they MAY be a shortcut,
  but this skill never depends on them.

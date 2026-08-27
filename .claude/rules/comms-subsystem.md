---
description: >
  Architecture of the FireKaro comms subsystem (WhatsApp via Wati + Zoho CRM lifecycle messaging) —
  the mounted routes, the server/src/lib layer, template SSOT, and the spend/consent send-discipline.
globs:
  - "server/src/lib/wati-*.ts"
  - "server/src/lib/whatsapp-*.ts"
  - "server/src/lib/comms-*.ts"
  - "server/src/lib/lifecycle-*.ts"
  - "server/src/lib/zoho-*.ts"
  - "server/src/lib/planner-read.ts"
  - "server/src/routes/whatsapp-webhook.ts"
  - "server/src/routes/comms-consent-route.ts"
  - "server/src/routes/lifecycle-internal.ts"
---

# Comms subsystem — WhatsApp (Wati) + Zoho CRM lifecycle messaging

> Extracted from `CLAUDE.md` (2026-06-03) to fit the project-root line budget per
> `configuration-ssot.md` (path-scoped detail belongs in a `globs:`-scoped rule). `CLAUDE.md` keeps a
> one-line pointer here. Go-live blockers live in `docs/comms-go-live-handoff.md` (the canonical
> needs-Abhay register). This rule is the SSOT for the subsystem's *architecture*.

## Mounted routes (besides `/api/planner`)

- **`/api/comms`** — consent CRUD + `whatsappNumber` capture (`comms-consent-route.ts`).
- **`/api/webhooks`** — Wati delivery webhook (`whatsapp-webhook.ts`).
- **`/api/internal`** — the token-guarded daily lifecycle scheduler `POST /lifecycle/run`
  (`lifecycle-internal.ts`), guarded by `LIFECYCLE_RUN_TOKEN`, **mounted OUTSIDE `authMiddleware`**;
  cron line in `docs/DEPLOY.md` §5a (the §5a job also folds in the DPDP send-log PII purge).

## The `server/src/lib/` layer

- `wati-client.ts` — WhatsApp send. **Fail-closed allowlist → only Abhay's `<owner-test-number — see D:AbhayGLOBAL.md>`** in test
  (see the `feedback_whatsapp_test_recipient` memory — never message any other number without
  explicit approval).
- `whatsapp-sender.ts` + `whatsapp-triggers.ts` — consent-gated send + per-event triggers; the
  send-log carries a `dedupeKey`.
- `comms-consent.ts` + `comms-templates.ts` + `comms-signup.ts` — DPDP consent, approved templates,
  signup hook + `maybeSendWelcome` (D3).
- **Lifecycle loop:** `lifecycle-evaluator.ts` (PURE: derived FIRE signals →
  milestone / off-track / annual-review nudges + per-period dedupe keys) + `lifecycle-runner.ts`
  (loads each consenting user's household, runs the shared **`@planner`/`@`-aliased `src/lib`
  `derive()`** — no logic duplication — and fires deduped nudges).
- `planner-read.ts` — the `UserAssumptions`→`Assumptions` mapper, shared with the planner route.
- `zoho-crm-client.ts` + `zoho-lead-mapping.ts` — Zoho lead upsert.

Each has a colocated `.spec.ts`.

## Send-discipline (MUST)

- Outbound sends are **spend + outward-facing → escalate per `decision-authority.md`** before
  flipping `WATI_ALLOW_ALL_RECIPIENTS` / A6.
- Wati **`200 ≠ delivered`** — verify via `getMessages` status (see the `project_wati_delivery_gotcha`
  memory: Meta marketing-cap silently FAILS MARKETING templates per-recipient; lean UTILITY/session).
- Recipient PII (`toNumber`, `failedDetail`, `whatsappNumber`) MUST be redacted in logs
  (`structured-logging.md`) and is purged from the send-log after 90 days (DPDP minimization, #10).

## WhatsApp templates

Defined in the manifest `docs/wati-templates.json` (SSOT; `docs/whatsapp-templates.md` is its readable
companion). Created/submitted to Meta via the **global** skill `/wati-template-create-and-track`;
sending an approved template is `/wati-send-and-verify-delivery` (both global in `~/.claude/skills/`,
sharing `WATI_*` creds).

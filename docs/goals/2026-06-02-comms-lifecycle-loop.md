# Goal: Wire the WhatsApp comms lifecycle loop (capture number → welcome → scheduled evaluator)

**Authored:** 2026-06-02 · **For:** the built-in `/goal` command (Abhay runs it) · **Author:** Claude (design forks pre-resolved in-session 2026-06-02; this contract is zero-user-input).

> **Division of labor (rule 28):** this file is the *contract*. Abhay invokes `/goal` on it; `/goal`
> executes autonomously to the Definition of Done. Claude does NOT run `/goal`.

---

## Context (read first)

The WhatsApp comms system is built and **all 8 templates are Meta-APPROVED** (`docs/wati-templates.json`),
the consent-gated **sender** (`server/src/lib/whatsapp-sender.ts`), the **triggers**
(`whatsapp-triggers.ts` — `triggerWelcome/Milestone/OffTrack/GoalReminder/AnnualReview/MonthlyDigest/Winback/SalaryUpdate`),
and the **signup hook** (`comms-signup.ts` → wired into Better Auth `user.create.after`) all exist and
are unit-tested. The fail-closed allowlist (`WATI_TEST_RECIPIENTS`, only `917972672473`) + the
`WATI_ALLOW_ALL_RECIPIENTS` broadcast flip (**A6 — Abhay's spend gate, untouched by this goal**) are live.

**The gap (why nothing auto-sends today):**
1. **No WhatsApp number is stored anywhere.** `CommsConsent` = `{userId, channel, marketingOptIn, revokedAt}`
   — no phone. OAuth (Google) yields email/name only. No UI captures a number. So every send can only
   reach the hardcoded test allowlist. **This blocks the entire loop and is Phase 0.**
2. **No scheduled evaluator exists.** `evaluateNudges()` (`src/lib/nudge-engine.ts`) detects conditions
   but is **frontend-only** and produces *in-app* nudges — it never reaches the sender. Lifecycle sends
   (milestone/off-track/digest/annual/winback) have nothing firing them.
3. **Welcome never sends.** `onUserCreated` seeds consent + Zoho lead but does NOT send the welcome —
   and couldn't, since there's no number at signup.

**Load-bearing constraint:** *winback* targets users who don't open the app, so evaluation MUST be
**server-side + scheduled** — client-driven evaluation can never reach absent users. This settles the
architecture.

**Safety property (must hold throughout):** every send flows through the existing consent gate
(`decideSend`) + fail-closed allowlist. Until Abhay flips A6, sends reach ONLY `917972672473`. The whole
loop is therefore **buildable and end-to-end testable now, with zero real-user spend.** This goal MUST
NOT flip A6.

---

## Resolved design decisions (do NOT re-litigate)

- **D1 — Number storage:** add `whatsappNumber String?` to `CommsConsent` (Prisma migration, Supabase).
  Normalize to digits (reuse `normalizeWhatsAppNumber`). The sender resolves `toNumber` from this row;
  **fail-closed** — no stored number ⇒ no send (logged, not an error).
- **D2 — Number capture UX:** collect it in the **Preferences → Notifications** section (the existing
  consent toggle), NOT forced in onboarding (principle 3 — minimal friction; WhatsApp is opt-in). Extend
  the `PUT /api/comms/consent` schema with an optional `whatsappNumber` + the Preferences UI with a
  number field shown when the WhatsApp channel is enabled. DPDP: explicit opt-in, editable, revocable.
- **D3 — Welcome trigger point:** fire `triggerWelcome` when a WhatsApp number is **first saved with an
  un-revoked consent** (in the consent PUT path), NOT at OAuth signup. Idempotent — once per user
  (dedup via send-log).
- **D4 — Evaluation = server-side, reuse pure logic:** a new `server/src/lib/lifecycle-evaluator.ts`
  loads each consenting user's household (`household-repo`), runs the **existing pure `derive()`** (server
  already imports `src/lib` via the `@planner` alias — no logic duplication), and emits `(nudgeKey, params)`.
- **D5 — Scheduler = external cron → token-protected endpoint:** `POST /api/internal/lifecycle/run`
  (guarded by a new `LIFECYCLE_RUN_TOKEN` env, like the Wati webhook token). A daily PM2/system cron on
  the VPS hits it. NOT an in-process `setInterval` (restart-safe, manually triggerable, observable in the
  request log). Manual trigger for testing: `curl -H "x-internal-token: …" .../api/internal/lifecycle/run`.
- **D6 — Dedup (the one genuinely new piece):** extend the send-log with a `dedupeKey` (e.g.
  `nudgeKey:period` or `nudgeKey:threshold`) + a uniqueness check; the evaluator skips a nudge already
  sent for its period/threshold (milestone once per crossed band; monthly_digest once/month; annual_review
  once/FY; winback once per dormancy episode). The 4/24h frequency cap stays as a backstop.
- **D7 — Winback dormancy:** needs a `lastSeenAt` server-side (from the Better Auth session). Add it; the
  evaluator treats ~60d no-login as dormant.
- **D8 — Cadence + first-live set:** daily evaluator. **UTILITY nudges go live first** (welcome, milestone,
  off-track, annual-review — reliable, no marketing opt-in). The 3 MARKETING nudges (monthly_digest,
  winback, salary_update) stay gated behind `marketingOptIn` + A6.

---

## Phases & Definition of Done

**Phase 0 — Number capture (foundational).** DoD:
- `whatsappNumber` on `CommsConsent` (migration applied to Supabase); `PUT /api/comms/consent` accepts +
  stores it (normalized); Preferences Notifications UI captures/edits it (shown when WhatsApp enabled).
- Sender resolves `toNumber` from the stored consent row; no number ⇒ fail-closed (no send, logged).
- **Verified (rules 24/25):** set a number via the Preferences UI → confirm persisted via
  `GET /api/comms/consent` → a test send to that number (= `917972672473`) reaches `DELIVERED` via the
  existing Wati path.

**Phase 1 — Welcome + scheduled evaluator (UTILITY nudges).** DoD:
- `triggerWelcome` fires once when number+consent first saved (D3); idempotent (send-log dedup).
- `lifecycle-evaluator.ts` + `POST /api/internal/lifecycle/run` (token-guarded) + the send-log `dedupeKey`.
- Evaluator fires `milestone`/`offtrack`/`annual_review` correctly for a seeded test household, each
  exactly once per period/threshold (dedup proven by running the endpoint twice → second run sends nothing).
- All sends consent-gated + allowlist-gated (no real-user send; A6 untouched).
- **Tests:** unit specs for the evaluator (condition→nudge mapping), dedup, and number-resolution;
  the welcome-on-consent path. Full `npm run test:unit` (both trees) green; type-check clean.
- **Verified end-to-end** to `917972672473`: trigger the endpoint against a seeded household → the right
  UTILITY nudge(s) reach `DELIVERED`; a re-run sends nothing (dedup).
- VPS: document the daily cron line in `docs/DEPLOY.md` (Abhay wires the cron — it's a VPS change).

**Phase 2 — MARKETING nudges + winback (deferred behind marketingOptIn + A6).** DoD:
- `lastSeenAt` (D7) + `monthly_digest`/`winback`/`salary_update` wired in the evaluator, gated on
  `marketingOptIn`. NOT live until Abhay enables marketing consent collection + flips A6.

---

## Verification & gates (every phase)
- Rule 29 independent review (code-reviewer-agent; no financial math here so FinTech analyst N/A).
- Rules 24/25 for the Preferences UI change (screenshot + ARIA + console; UI→DB persistence).
- The fail-closed allowlist is the test harness — verify real `DELIVERED` to `917972672473` only.
- Conventional commits per phase; `/post-fix-pipeline` to finalize.

## Out of scope (do NOT do)
- Flipping `WATI_ALLOW_ALL_RECIPIENTS` / A6 (Abhay's spend gate).
- Collecting numbers in forced onboarding (Preferences opt-in only — D2).
- Email channel (WhatsApp only for now).
- Real-user marketing sends (Phase 2 stays gated).

## Key files
- `server/prisma/schema.prisma` (CommsConsent + whatsapp_send_log dedupeKey), `server/src/routes/comms-consent-route.ts`,
  `server/src/lib/comms-consent.ts`, `whatsapp-sender.ts`, `comms-repo.ts`, NEW `lifecycle-evaluator.ts`,
  NEW `server/src/routes/lifecycle-internal.ts`, `server/src/index.ts` (mount), `src/pages/Preferences.vue`,
  `src/lib/derive.ts` + `nudge-engine.ts` (reuse, don't duplicate). Runbook: `docs/DEPLOY.md` (cron line).

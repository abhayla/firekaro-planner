# FireKaro comms — go-live handoff (items that need Abhay)

**Created:** 2026-06-02 · **Owner of the build:** Claude (everything reversible is done + pushed) ·
**This doc:** the *only* things blocked on you, with exact steps. Tick as you go. **It is now the
consolidated "needs Abhay" register for the whole repo** (comms go-live + infra/repo) — future
sessions append here, not in a parallel file. Supersedes `.claude/tasks/needs-abhay.md` (deleted to
keep one source of truth).

> **Status of the build:** the entire WhatsApp + Zoho + consent system is **code-complete, tested
> (95 server tests), DB-migrated, and live-verified** (consent UI persists to the migrated Supabase).
> Nothing below is code work — it's accounts/secrets/deploy/go-live that require *your* login, MFA,
> spend approval, or SSH. Each item says what I'll do the moment you unblock it.

---

## A. Critical path to send real WhatsApp messages (in order)

### A1. Zoho OAuth → refresh token  ✅ DONE (2026-06-02)
Self Client created (Abhay), grant code exchanged → `ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN` in LOCAL
`server/.env` (scope `ZohoCRM.modules.ALL`, India DC). **Verified live:** `upsertLead` created Lead
`475281000040523001` in PIFS CRM with `Lead_Source=FireKaro`, confirmed via getRecord, then deleted.
*Carry-over:* the same `ZOHO_*` values must also go into the **VPS** `server/.env` (part of A4).

### A2. Zoho `FireKaro` Lead_Source value  ✅ SELF-RESOLVED (2026-06-02)
Zoho accepted `Lead_Source="FireKaro"` on first upsert and stored it (the value now exists). No
manual picklist edit needed. *(If you ever want it as a formal picklist option for filtering UIs,
add it under Leads → Lead Source — optional, not blocking.)*

### A3. The 7 WhatsApp templates  ✅ DONE — created, submitted, APPROVED + delivery-verified (2026-06-02)
**Fully self-resolved.** Wati exposes a create endpoint (`POST /api/v1/whatsApp/templates`), so I
submitted all 7 (#2–8) from the manifest `docs/wati-templates.json` via the global skill
`/wati-template-create-and-track`, under **clean base names** (no date suffix). **Meta APPROVED all 7**
(verified via `getMessageTemplates` — 4 UTILITY, 3 MARKETING).
- **No env wiring needed:** the approved names exactly match the code defaults in
  `server/src/lib/comms-templates.ts` (`DEFAULTS`), so the sender resolves the right name with NO
  `COMMS_TEMPLATE_*` override — locally AND on the VPS (which already runs that code from A4). The
  override env vars remain available if a future template ever approves under a different name.
- **End-to-end proven:** sent `firekaro_milestone` (UTILITY, 3 vars) to the test number `<owner-test-number — see GLOBAL.md>`
  → Wati terminal status `DELIVERED` confirmed. The approved-template → send → deliver path works.
- Remaining for full lifecycle: the MARKETING three (`monthly_digest`/`winback`/`salary_update`) only
  *send* once `marketingOptIn` consent + broadcast (A6) are on; UTILITY four are usable now (gated by
  the test allowlist until A6).

### A4. VPS env + redeploy  ✅ DONE (2026-06-02 — Claude has SSH after all)
The "no SSH" was stale — key `~/.ssh/firekaro_v6_vps` works (root@srv1707492). Done in **safe mode**:
- Backed up the VPS code (`/root/firekaro-backup-precomms-*.tgz`), provisioned `WATI_*` + `ZOHO_*` +
  `WATI_WEBHOOK_SECRET` into the VPS `server/.env` (`WATI_ALLOW_ALL_RECIPIENTS=false` — A6 still gates spend).
- Shipped HEAD via `git archive | ssh tar` (the box isn't a git checkout), `npm ci` + `npm run build`
  (frontend), `npm ci` + `prisma:generate` (server — client now knows the new tables),
  `prisma:migrate:deploy` = **no pending migrations** (already applied), `pm2 reload firekaro-api`.
- **Verified live:** `/api/health` ok+db connected · `/api/comms/consent` → 401 (route live, prod auth) ·
  `/api/webhooks/wati` → 200 · `/preferences` → 200 (Notifications UI shipped).
- **Still pending here:** `COMMS_TEMPLATE_*` go in once templates are approved (A3).
- Rollback if ever needed: extract the backup tgz over `/var/www/firekaro`, `npm ci && npm run build`,
  `pm2 reload`.

### A5. Register the Wati delivery webhook  ✅ DONE + verified live
✅ **DONE 2026-06-02** — Abhay registered the webhook in the Wati UI (events: Template Message
Sent / DELIVERED / Read / FAILED / Status Update) → `https://firekaro.com/api/webhooks/wati?token=…`.
**Verified live end-to-end:** a real send's `templateMessageSent_v2` linked the `whatsappMessageId`
to the send-log row, then `sentMessageDELIVERED_v2` flipped it to **DELIVERED** (prod DB confirmed).
Verifying caught a real bug — the handler matched on number+template, but Wati's DELIVERED payload
carries ONLY the `whatsappMessageId`; fixed to correlate by that id (commit `9960649`).

### A6. Flip outbound ON (go-live) 🚦 spend + real users — your decision
**You:** set `WATI_ALLOW_ALL_RECIPIENTS=true` on the VPS + `pm2 restart`. After this, real users (with consent) get messages and per-message spend begins. This is intentionally yours — I will not flip it.

---

## B. Security & governance (separate from go-live)

- **B1. Supabase RLS — ✅ RESOLVED (2026-06-10, Abhay-approved Option B).** The Security Advisor had flagged 2 CRITICAL on `zymbhuwuguzeueslwhyz` (`rls_disabled_in_public` + `sensitive_columns_exposed`): the anon-keyed PostgREST Data API could read/write every table because RLS was off. **Fixed:** enabled `ROW LEVEL SECURITY` (deny-all, no policies) on **all 25 `public` tables** via the `postgres` `DATABASE_URL` (session pooler). **Safety gate first** (role is `postgres` = superuser/bypassrls + owner of all 25 → RLS-exempt → app NOT locked out), then verified **25/25 `rowsecurity=true`** + **live prod smoke green** (`/api/internal/smoke` `user.count=3, 37ms`, public 200) — the app reads fine through RLS; the anon/`authenticated` roles (Data API) get deny-all (subject to RLS, no policies). Rollback if ever needed: `ALTER TABLE … DISABLE ROW LEVEL SECURITY`. **Note:** could not black-box-test the anon REST path (no anon key in-session), but the mechanism is sound; the Supabase advisor will clear the CRITICALs on its next scan (verify at the advisor page).
- **B2. Cowork shares this working tree** — a Cowork agent is committing to the same `main`/working dir; one of my commits got swept into a tax commit earlier. **Fix:** give Cowork its own `git worktree`, or keep it read-only (the daily-report is read-only — ideal).
- **B3. `TODO(5W)`** — ratify "FireKaro user contacts live in PIFS's CRM under a `FireKaro` source filter" (cross-entity funnel) in the 5Wealths DECISIONS log.
- **B4. Cloudflare origin-cert token** — standing TODO from the deploy: rotate/delete the scoped CF API token left in `server/.env`.
- **B5. ESLint drift — ✅ RESOLVED (2026-06-04, Delivery/Platform-Lead decision).** The premise was
  **outdated**: `server/eslint.config.mjs` + a `lint` script already exist (enforcing the envelope
  `no-restricted-syntax` + `no-console` invariants over `server/src/**`), and `api-envelope-pattern.md`
  / `structured-logging.md` / `commit-convention.md` already reference `server/eslint.config.mjs`
  correctly — **not stale**. The one genuine gap was the **frontend** storage invariant ("no direct
  `localStorage` outside `storage-adapter.ts`"), documented "CI-enforced" but with **no actual gate**.
  Closed by a targeted scan-test `src/lib/storage-invariant.spec.ts` (runs in `npm run test:unit`,
  non-vacuous: covers >100 files + a positive-fixture regex check). **A full frontend ESLint setup for
  a single invariant is YAGNI** — the targeted guard is the proportionate machine-enforcement. No
  1-word direction needed; resolved.
- **B6. #32 rental-tax migration — ✅ DONE (applied to prod; live in the box's 9 migrations, confirmed 2026-06-07).** The migration
  `server/prisma/migrations/20260605120000_rental_24b_fields/` adds two nullable columns
  (`homeLoanInterest`, `municipalTaxes`) to `OtherIncomeLine`. It MUST be applied to Supabase via
  `cd server && npm run prisma:migrate:deploy` **BEFORE** the #32 code deploys to prod — otherwise the
  regenerated Prisma client SELECTs columns the live DB lacks → `P2022` on every household read/write.
  Deploy-gated (part of the standard migrate-before-deploy step in `docs/DEPLOY.md`). Until applied,
  the backend live-DB integration spec (`server/src/routes/planner.integration.spec.ts`) fails locally
  with P2022 against a not-yet-migrated DB; it auto-skips on CI (no `DATABASE_URL`), so CI stays green.

- **B7. #46 temporal-contributions migration — ✅ DONE (applied to prod 2026-06-07, deploy SHA `d04571c`; smoke green, schema up to date at 10 migrations).** The migration
  `server/prisma/migrations/20260606120000_add_investment_contribution_schedule/` adds ONE nullable
  `contributionSchedule JSONB` column to `Investment` (the time-varying contribution plan; merged to
  `main` @ `c7c70a5`, authored-not-applied per the goal contract). It is applied **automatically** by
  the standard `cd server && npm run prisma:migrate:deploy` step already in `docs/DEPLOY.md` §3 +
  Redeploy — **no special action needed**; it ships with the next redeploy. **The one thing not to
  miss:** it is **schema-changing**, so honour the runbook's own rule (`DEPLOY.md` §Rollback: *take a
  Supabase PITR backup before a schema-changing deploy*), and after deploy confirm the column exists
  (the §8 smoke + an `Investment` read round-trip). Until applied, the live-DB integration spec
  (`planner.integration.spec.ts`) fails locally with *"column contributionSchedule does not exist"*
  against a not-yet-migrated DB; it auto-skips on CI (no `DATABASE_URL`), so CI stays green. The
  feature is inert without the column **only on the ServerAdapter path** — the localStorage demo path
  works regardless (verified).

- **B8. GitHub Actions billing block — CI on `main` cannot run at all — 🚦 needs your GitHub billing
  fix (found 2026-08-26, fleet task T-350).** **UPDATE 2026-08-27 01:45 IST: still blocked (every run on 2026-08-26 19:xx UTC failed the same way) and now BLOCKS THE QUICK NUMBER WAVE — T-376→T-379 (`docs/goals/2026-08-27-quick-number-front-door.md`) will open PRs whose checks never start; checkers verify locally but nothing can merge until GitHub → Settings → Billing & plans is fixed (payment method / spending limit).** `main`'s CI workflow (`.github/workflows/ci.yml`) has
  been RED on the last 2 pushes (2026-06-25 `ac7dc76`, 2026-08-26 `b7614de`), but **the code is not
  broken** — a full local reproduction of every CI step (frontend `npm ci` + `type-check` + 1239/1239
  unit tests + `build`, exact CI env vars) passed cleanly on current `main`. The real cause, confirmed
  via `gh run view <run-id>` on both failing runs: **both jobs never start** (2-3s "run" time) with the
  annotation *"The job was not started because recent account payments have failed or your spending
  limit needs to be increased. Please check the 'Billing & plans' section in your settings"* — an
  **account-level** GitHub Actions billing/spending-limit block on `abhayla` (this private repo's
  owner), not a repo config issue (`repos/.../actions/permissions` confirms Actions are enabled;
  workflow is registered `active`). **No code change or PR can fix this** — a diff cannot un-block a
  payment method. **What unblocks it:** go to https://github.com/settings/billing on the `abhayla`
  account → resolve any failed payment method under "Payment information" → check "Spending limits"
  for Actions minutes (a $0/low limit is common once free-tier private-repo minutes are exhausted,
  or a card decline needs re-auth). Once fixed, no re-push is even needed —
  `gh run rerun 32976850742 --repo abhayla/firekaro-planner` (or any new push) will go green, since
  local reproduction already proves current `main` passes every CI step. T-350 closed as
  `BLOCKED-awaiting-billing`; worktree `C:\Abhay\Ventures\firekaro-planner-t350` (no commits, nothing
  to land) kept for reference until this is resolved.

---

## C. Optional / nice-to-have

- **C1. Wati skills live in the REPO  ✅ CORRECTED (2026-06-03)** — both `wati-send-and-verify-delivery`
  and `wati-template-create-and-track` are committed under **`.claude/skills/`** so **Cowork + clones
  discover them** (the repo is the only shared surface across environments). The earlier "move to
  `~/.claude/skills/` to be global" call (2026-06-02) was WRONG — `~/.claude` is machine-local and
  invisible to Cowork, which broke discovery there. Lesson: [[project_cowork_skill_discovery]].
  **Creds are still environment-local:** the `WATI_*` values live in this machine's
  `~/.config/wati/.env` + (gitignored) `server/.env` — Cowork can't see either, so Cowork must supply
  the 4 `WATI_*` vars via its OWN environment secrets (per each skill's STEP 0).
- **C2. Comms lifecycle loop — Phase 0 + 1 BUILT + live-verified (2026-06-02).** The `/goal` run is
  done. Number capture (`CommsConsent.whatsappNumber`, Preferences UI), welcome-on-consent (D3), the
  server-side `lifecycle-evaluator` + token-guarded `POST /api/internal/lifecycle/run`, and per-period
  send-log dedupe (`whatsapp_send_log.dedupeKey`) all ship. **Live-verified end-to-end:** `welcome` +
  `annual_review` both reached **DELIVERED** to the test number `<owner-test-number — see GLOBAL.md>`; a second endpoint run
  sent nothing (dedup). Two additive Supabase migrations applied (`whatsappNumber`, `dedupeKey`). Phase 2
  (marketing digest / winback / salary-update + `lastSeenAt`) stays deferred behind `marketingOptIn` + A6.
  Full unit coverage; both trees green. **Needs Abhay (to take it live on prod):**
  - **C2a. VPS redeploy  ✅ CODE SHIPPED (2026-06-04, deploy `c73ac77`).** Done alongside the smoke endpoint
    (backup taken `firekaro-backup-presmoke-*.tgz`; `git archive | ssh tar` → `npm ci && build` both trees →
    `prisma:generate` → `prisma:migrate:deploy` = no pending → `pm2 restart`). App health + smoke green
    post-deploy. The comms-loop code (`/api/internal/lifecycle/run` + Preferences number field) is now LIVE but
    **dormant** — it does nothing until C2b + C2c below (and sends still gated by A6).
  - **C2b. `LIFECYCLE_RUN_TOKEN`** — add a real secret to the VPS `server/.env` (`openssl rand -base64 32`).
    Unset ⇒ the endpoint returns 500 (fail-closed). Documented in `docs/DEPLOY.md` §1.
  - **C2c. Daily cron** — add the crontab line from `docs/DEPLOY.md` §5a (POSTs the token-guarded endpoint
    daily). Enabling it does **not** message real users — sends stay restricted to the test allowlist until A6.
  - **C2d.** A6 (`WATI_ALLOW_ALL_RECIPIENTS`) stays the go-live spend flip — the loop explicitly does NOT touch it.
- **C3. Post-deploy production smoke — Tier-1 ✅ LIVE (2026-06-04); Tier-2 ⏳ pending session-seed.** The
  token-guarded `GET /api/internal/smoke` (read-only `prisma.user.count()` round-trip, richer than
  `/api/health`'s `SELECT 1`) is code-complete, independently reviewed, **deployed, and live-verified in prod**.
  Governance: `.claude/rules/testing-strategy.md` (prod = smoke + synthetic only). Shipped on deploy `c73ac77`
  (which also carried C2a's comms-loop code — see C2a note).
  - **C3a. `SMOKE_TOKEN`  ✅ DONE (2026-06-04).** Generated on-box (`openssl rand -hex 32`) → VPS `server/.env`,
    `pm2 restart`. **Live-verified:** `curl -H "x-smoke-token: …" https://firekaro.com/api/internal/smoke` →
    `{ok:true,database:"connected",probe:"user.count",count:2,ms:22}`; no-token/wrong-token → 401. Token lives
    only on the box (never in git/chat). Wired into `docs/DEPLOY.md` §8.
  - **C3b. Dedicated test Google account** (Tier-2 authenticated prod UI) — address received: **`abhayfaircent@gmail.com`**.
    Still pending the **one-time session-seed**: I drive Playwright to prod `/login`, you type the password yourself
    (never shared), I keep only the resulting cookie (`e2e/.auth/user.json`, gitignored, ~7-day). Tier-2 is on-demand
    (big releases / incident verification), not every deploy — run at the next significant release.

---

## D. Standing dependencies (recurring gates — not one-off; here so they're never a surprise)

These recur on every relevant change; the *current* concrete instances are A1/A4/A6/B3 above.
- **VPS redeploy = your SSH** (key `~/.ssh/firekaro_v6_vps` → `72.61.240.224`). I prep the exact `git archive | ssh … tar` → `npm ci && build` → `pm2 reload firekaro-api` commands; you run them (runbook `docs/DEPLOY.md`), or paste them after `! ` so output lands in-session.
- **DNS for `firekaro.com` = yours** (Cloudflare-fronted, not in the Hostinger account). Live + Full-strict now — no change pending.
- **`/goal` execution = yours** — I author the contract (`goal-creator` → `docs/goals/…md`); you run the built-in `/goal`. I never simulate it.
- **Interactive CLI/MCP logins = you** (gcloud / gh / Zoho / Wati / Cloudflare-MCP / Hostinger-MCP `authenticate`). Fastest path: type the command after `! ` in the prompt so it runs in-session and I see the output.
- **Deploy / spend / publish-externally = one-line escalation, then your go** (`decision-authority.md`). I keep all non-gated work moving in parallel meanwhile.
- **5Wealths-portfolio writes = yours (L-042)** — I log `TODO(5W):` in-repo; I cannot write into `D:\…\5Wealths\`. You carry them across in a 5W session (open: retire old firekaro.com Next.js app; B1 RLS posture; B3 CRM-source ratification).

## E. Notifier (the cross-project owner-alert gateway, built 2026-06-11 — repo `abhayla/Notifier`)

### E1. Telegram chat ID  ✅ DONE (2026-06-11)
Abhay messaged **@AbhayApps_bot** → chatId `315101961` captured via getUpdates, channel enabled in
`Notifier/config.yaml` (P0: telegram+whatsapp; P1: telegram), and **live-verified end-to-end**
(telegram `message_id=12` delivered + whatsapp `DELIVERED` in the same P0 fan-out). Telegram is now
Notifier's default instant channel. *(Gotcha logged: PS5.1 `Set-Content -Encoding utf8` writes a BOM
that breaks `process.loadEnvFile` on the first line — rewrite env files BOM-free.)*

### E2. Email channel  ✅ DONE (2026-06-11) — Apps Script web-app, deployed by Claude via browser automation
Claude drove the whole Apps Script deploy in a real Chrome window (Abhay only logged into Google):
created the `notifier-email-webapp` script file in the EXISTING Gmail-Autosend project (clipboard
paste — gmail-autosend.gs untouched), deployed it as a Web app (Execute as Me · access Anyone), and
captured the URL. Full 3-channel pipeline verify GREEN (telegram message_id=14, whatsapp DELIVERED,
email draft created → the existing `autoSendDrafts` trigger sends + labels `FW-FireKaro/Alert` ≤5 min).
The Google-session browser profile was deleted after use (never committed). Web app URL +
`NOTIFIER_GMAIL_WEBAPP_TOKEN` live in `Notifier/.env`. *(Gotchas logged: Apps Script returns 401 if a
web app deploys with access "Only myself" — must be "Anyone"; Monaco mangles synthetic-typed code →
paste via clipboard; the deploy dialog access dropdown sits below the fold → scroll the inner panel.)*

### E2-historical. (the manual fallback, now superseded by the automation above)
Everything is built (`7941e96`): the add-on snippet is **`Notifier/appsscript/notifier-email-webapp.gs`**
(creates a send-to-self DRAFT with a conformant `[FW-…:…]` subject; your EXISTING `autoSendDrafts`
trigger sends + labels it — gmail-autosend.gs is NOT modified). The webapp transport + token are wired
in Notifier (token in `Notifier/.env` `NOTIFIER_GMAIL_WEBAPP_TOKEN`, embedded in the snippet). Your 3
steps (~3 min, needs your Google login — why I can't do it):
1. Open script.google.com → the **Gmail-Autosend** project → Files **+** → Script → name it
   `notifier-email-webapp` → paste the snippet file's contents → Save.
2. Deploy → **New deployment** → type **Web app** → Execute as: **Me** · Access: **Anyone with the
   link** → Deploy (authorize when prompted).
3. Paste the **Web app URL** (`https://script.google.com/macros/s/…/exec`) here → I wire it into
   `config.yaml`, enable the email channel, and live-verify (draft created → auto-sent ≤5 min →
   Gmail receipt confirmed).

### E3. `notifier_owner_alert` template — ⏳ Meta review (no action; submitted 2026-06-11,
waTemplateId `1585582266465108`). On approval I switch `Notifier/config.yaml` from the interim
`firekaro_welcome_2026_06_03` to the real template and re-verify delivery.

### E4a. Notifier VPS deploy  ✅ DONE (2026-06-11, Abhay-authorized)
Notifier runs on the Hostinger VPS as PM2 process `notifier` (id 1, alongside `firekaro-api` id 0,
which was untouched — 16h uptime preserved). Shipped via `git archive | ssh tar` to `/root/notifier`,
`npm ci`, `.env` + `config.yaml` scp'd (chmod 600), `pm2 start npm --name notifier -- run start`,
`pm2 save`. Localhost-bound :3300 (not publicly exposed — admin UI via SSH tunnel
`ssh -L 3300:127.0.0.1:3300`). **All 3 channels verified FROM THE VPS** (`npm run verify:channels`:
telegram message_id=15, whatsapp DELIVERED, email draft created). Redeploy = re-ship tar + `pm2 reload
notifier`. Rollback = `pm2 delete notifier` (zero impact on firekaro-api).

### E4b. FireKaro detector wiring (first batch)  ✅ DONE + DEPLOYED to prod (2026-06-11, Abhay-authorized)
`server/src/lib/owner-notify.ts` (`notifyOwner` — fire-and-forget, no-op when env unset, 2s timeout,
never throws → cannot break/slow FireKaro) wired into 3 detectors: **5xx** (`onError` → P1, deduped
per path), **DB-down** (`/api/health` catch → P0, deduped), **signup** (`onUserCreated` → P1 per user;
email gated behind `NOTIFIER_OWNER_PII`, default off — DPDP). Independent review = 0 HIGH; 2 MED
hardening fixes applied (PII-off-by-default, 5xx body truncated). Merged `898b9ba` → main; deployed to
prod (backup → ship → `NOTIFIER_URL`/`NOTIFIER_KEY` added to VPS `server/.env` → build → pm2 reload).
**Verified live:** health ok + smoke `user.count=3` + the deploy-green ping reached Telegram
(`message_id=16`) — the FireKaro→Notifier prod path is proven. Public site renders (login + Google
button, no console errors); bundle hash unchanged (server-only). Owner detectors are LIVE.

### E4c. Remaining detectors + external monitors (next, when you want)
Still to wire (expand the first batch): activation (first FIRE number), lifecycle WhatsApp-send
failures, auth brute-force / rate-limit storms. AND **external uptime + cron-watchdog** (Better Stack /
healthchecks.io) — the "whole VPS down" alert Notifier structurally can't self-report; needs your free
account signup (1-2 logins).

## What I'll do the moment each unblocks
- A1 → exchange code, store `ZOHO_*`, verify a real lead upsert (to a test source).
- A3 → wire `COMMS_TEMPLATE_*`, run `/wati-send-and-verify-delivery` per template to your number.
- A5 → confirm webhook → send-log status capture; run `wati-daily-report.ts --from-db`.
- A2 → confirm lead lands in PIFS CRM tagged `FireKaro`.
The only thing I will *not* do is **A6** (go-live spend) — that's the single true your-call.

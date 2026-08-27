# FireKaro v6 — Production Deploy Runbook

Target: **Hostinger KVM VPS, Ubuntu 24.04** (Mumbai). Stack on the box: **Node 20 +
PM2 + nginx**, reverse-proxying to the Hono backend, serving the built Vue SPA.
**Database stays on Supabase** (`firekaro-planner`, session pooler) — there is **no
Postgres on the VPS**. Domain **firekaro.com** via DNS (Abhay's step) + certbot TLS.

> Artifacts this runbook uses (all in-repo): `.github/workflows/ci.yml`,
> `server/ecosystem.config.cjs`, `deploy/nginx/firekaro.com.conf`,
> `.env.production.example`, `server/.env.example`.

---

## 0. One-time VPS prerequisites

```bash
# Node 20 (NodeSource), nginx, certbot, pm2, git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git
sudo npm install -g pm2
```

App lives at `/var/www/firekaro` (clone of this repo). Built SPA is served from
`/var/www/firekaro/dist`.

```bash
sudo mkdir -p /var/www/firekaro && sudo chown "$USER" /var/www/firekaro
git clone https://github.com/abhayla/firekaro-planner.git /var/www/firekaro
```

---

## 1. Backend env (`server/.env` on the VPS) — the production checklist

Copy `server/.env.example` → `server/.env` and set **real** values:

| Var | Production value |
|---|---|
| `NODE_ENV` | `production` (PM2 also forces this) |
| `DEV_BYPASS_AUTH` | `false` — never `true` in prod (boot guard refuses otherwise) |
| `DATABASE_URL` | Supabase **session pooler** URI (`aws-1-ap-south-1.pooler.supabase.com:5432`) |
| `BETTER_AUTH_SECRET` | a real secret — `openssl rand -base64 32` (NOT the placeholder) |
| `BETTER_AUTH_URL` | `https://firekaro.com` |
| `ALLOWED_ORIGINS` | `https://firekaro.com,https://www.firekaro.com` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | the production OAuth client (see §6) |
| `PORT` | `3100` |
| `LIFECYCLE_RUN_TOKEN` | a real secret (`openssl rand -base64 32`) — guards `POST /api/internal/lifecycle/run`; the daily cron (§5a) sends it in `x-internal-token`. Unset ⇒ the endpoint returns 500 (fail-closed, never runs unguarded). |

`validate-env.ts` fails the boot fast if a required var is missing or a placeholder
secret is used in production — that is intended.

---

## 2. Install deps + generate Prisma client

```bash
cd /var/www/firekaro && npm ci
cd server && npm ci && npm run prisma:generate
```

## 3. Apply migrations to Supabase

```bash
cd /var/www/firekaro/server && npm run prisma:migrate:deploy
```

> Standalone Prisma commands against the Supabase session pooler should append
> `?connection_limit=1` to `DATABASE_URL` if other clients hold connections
> (the pooler caps at 15 → `EMAXCONNSESSION`).
>
> **Pending schema-changing migration (check the needs-Abhay register before deploying):**
> any `ADD COLUMN`/schema-changing migration listed under `docs/comms-go-live-handoff.md` §B
> (currently **B7** — gh-46 `Investment.contributionSchedule`) is applied by the command above,
> but is schema-changing → **take a Supabase PITR backup first** (per §Rollback) and confirm the
> column post-deploy (§8 smoke + an `Investment` read).
>
> **THIS RELEASE REQUIRES `prisma:migrate:deploy` BEFORE the app restart:** migration
> `20260827120000_adr0006_assumptions_columns` adds three nullable columns to `user_assumptions`
> (`householdSavingsStepUpPercent`, `householdSplitPercent`, `assumptionsMigratedV`). The new
> server code writes them on every `PUT /api/planner/assumptions`, so restarting the app before
> the migration is applied makes that endpoint 500 on every save. Additive + nullable → no
> backfill, and pre-migration rows keep today's behaviour (the read mapper falls back to the
> research defaults).

## 4. Build the SPA

```bash
cd /var/www/firekaro
cp .env.production.example .env.production    # VITE_API_BASE_URL stays empty (same-origin)
npm run build                                  # → dist/
```

`dist/` is what nginx serves. Rebuild + repeat on every frontend change.

## 5. Start the backend under PM2

```bash
cd /var/www/firekaro/server
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup     # resurrect on VPS reboot (run the printed command)
pm2 logs firekaro-api       # confirm "firekaro_v6 backend listening"
```

## 5a. Lifecycle nudge cron (WhatsApp lifecycle loop)

The lifecycle evaluator (welcome / milestone / off-track / annual-review WhatsApp
nudges) is driven by a daily POST to a token-guarded internal endpoint — NOT an
in-process timer (restart-safe, observable, manually triggerable). It only fires
nudges to **consenting** users, each **once per period/threshold** (send-log
dedupe). Outbound is still restricted to `WATI_TEST_RECIPIENTS` until the A6
broadcast flag is flipped, so enabling the cron does **not** message real users.

Add a root crontab entry on the VPS (09:00 IST = 03:30 UTC chosen here):

```bash
sudo crontab -e
# Daily FireKaro lifecycle nudges (reads the token from server/.env)
30 3 * * * cd /var/www/firekaro/server && curl -s -X POST \
  -H "x-internal-token: $(grep -E '^LIFECYCLE_RUN_TOKEN=' .env | cut -d= -f2- | tr -d '\"')" \
  http://127.0.0.1:3100/api/internal/lifecycle/run >> /var/log/firekaro-lifecycle.log 2>&1
```

Manual trigger / smoke test (returns `{users, candidates, sent, deduped, notSent, piiPurged}`):

```bash
curl -s -X POST -H "x-internal-token: $LIFECYCLE_RUN_TOKEN" \
  http://127.0.0.1:3100/api/internal/lifecycle/run
```

A second run within the same period returns `sent:0` (everything deduped) — that
is the expected idempotent behaviour, not a failure.

**DPDP send-log retention (#10):** this same daily run also purges recipient PII
from `whatsapp_send_log` — it NULLs `toNumber` on rows older than 90 days while
KEEPING the row (template/status/timestamp stay for analytics). The count is
reported as `piiPurged`. It is idempotent (already-purged rows are skipped) and
needs **no separate cron** — it is folded into `/lifecycle/run`. A purge failure
is logged but does not fail the lifecycle run.

## 6. Google OAuth (production client)

In Google Cloud Console → the FireKaro OAuth client:
- **Authorized JavaScript origins:** `https://firekaro.com`
- **Authorized redirect URI:** `https://firekaro.com/api/auth/callback/google`

Put the client id/secret in `server/.env` (§1). Better Auth mounts the callback
under `/api/auth/*`, which nginx proxies to the backend.

## 7. nginx + TLS

```bash
sudo cp deploy/nginx/firekaro.com.conf /etc/nginx/sites-available/firekaro.com
sudo ln -s /etc/nginx/sites-available/firekaro.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**DNS (Abhay):** point `firekaro.com` + `www` A records at the VPS IP. After DNS
resolves:

```bash
sudo certbot --nginx -d firekaro.com -d www.firekaro.com   # adds 443 + http→https redirect
```

## 8. Smoke test (verifies the deploy)

Tier 1 — automated, hands-off, every deploy (`testing-strategy.md`):
```bash
curl https://firekaro.com/api/health           # {"success":true,"data":{"status":"ok","database":"connected"}}
curl -H "x-smoke-token: $SMOKE_TOKEN" \
  https://firekaro.com/api/internal/smoke      # {"success":true,"data":{"ok":true,"database":"connected","probe":"user.count",...}}
```
The `/api/internal/smoke` probe runs a real Prisma `user.count()` through the
Supabase pooler — richer than `/api/health`'s raw `SELECT 1` (it catches a missing
`prisma generate` / a botched migration). It needs `SMOKE_TOKEN` in `server/.env`
(`openssl rand -hex 32`); if unset it returns 500 (smoke disabled), not an error.

Also confirm the **live SPA bundle hash CHANGED** (proves the new build is actually
serving, not a stale cached one):
```bash
curl -s https://firekaro.com | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
```

Tier 1.5 — **post-deploy UI verification (MANDATORY, EVERY deploy — big or small,
`testing-strategy.md`):** drive Playwright against the LIVE site and verify the
**unauthenticated** surface renders + functions — screenshot + ARIA snapshot + console
of the login/splash page (the "Sign in with Google" control present + interactive; no
NEW console errors beyond the expected unauth `401 /api/planner/me` + the
`[boot] not authenticated` warning). Non-destructive only. A green smoke endpoint is NOT
a substitute — a deploy can ship a broken bundle the health check never exercises.

Tier 2 — on-demand (significant releases / incident verification): in a browser
`https://firekaro.com` → bounced to `/login` → "Sign in with Google" → Google
consent → back to the app → onboarding/dashboard. Confirm a write persists: edit a
preference, reload, value survives (ServerAdapter → Supabase round-trip). For the
dedicated test account, this is the manual session-seed for authenticated prod UI
runs.

---

## Redeploy (subsequent releases)

> **The VPS `/var/www/firekaro` is NOT a git checkout** (no `.git`) — it's a `git archive | tar`
> extraction of a tracked-files snapshot (the repo is private; no clone/`git pull` on the box). So the
> redeploy ships from your **local** clone via git-archive over SSH. Verified working 2026-06-09 with
> the key `~/.ssh/firekaro_v6_vps` (root@72.61.240.224). `.env.production`, `server/.env`,
> `node_modules`, and `dist` are gitignored ⇒ NOT shipped ⇒ prod secrets/build are preserved.

```bash
# from your LOCAL clone, on the commit you want live (main, CI-green):
KEY=~/.ssh/firekaro_v6_vps; VPS=root@72.61.240.224
# 1. backup current prod code (rollback safety — the box has no .git):
ssh -i $KEY $VPS 'cd /var/www && tar czf firekaro-pre-deploy-$(date +%Y%m%d-%H%M%S).tar.gz --exclude=node_modules --exclude=dist.bak firekaro'
# 2. ship tracked files (overwrites tracked; preserves gitignored .env/node_modules/dist):
git archive --format=tar HEAD | ssh -i $KEY $VPS 'tar -x -C /var/www/firekaro'
# 3. install + build + regenerate Prisma client (needed on any schema change) + zero-downtime reload:
ssh -i $KEY $VPS 'set -e; cd /var/www/firekaro && npm ci && npm run build \
  && cd server && npm ci && npm run prisma:generate \
  && npm run prisma:migrate:deploy && pm2 reload firekaro-api'
```

CI (`.github/workflows/ci.yml`) gates every push/PR to main on type-check + unit
tests + build for both trees before you ship to the VPS.

**Smoke gate after every redeploy (DEPLOY.md §8 / Tier-1):**
```bash
ssh -i $KEY $VPS 'TOKEN=$(grep -hE "^SMOKE_TOKEN=" /var/www/firekaro/.env.production /var/www/firekaro/server/.env | head -1 | cut -d= -f2- | tr -d "\"'"'"'"); curl -s http://localhost:3100/api/health; curl -s -H "x-smoke-token: $TOKEN" http://localhost:3100/api/internal/smoke'
curl -s -o /dev/null -w "%{http_code}\n" https://firekaro.com   # public SPA renders
curl -s https://firekaro.com | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1  # bundle hash CHANGED?
```

**Deploy-green owner ping (after smoke passes) — also proves the FireKaro→Notifier wire:**
```bash
# Reads FireKaro's own NOTIFIER_KEY from server/.env; sends a P1 "deploy green" to Telegram.
ssh -i $KEY $VPS 'cd /var/www/firekaro/server && set -a; . ./.env; set +a; \
  curl -s -X POST "$NOTIFIER_URL/notify" -H "Content-Type: application/json" -H "X-Api-Key: $NOTIFIER_KEY" \
  -d "{\"project\":\"firekaro\",\"severity\":\"P1\",\"type\":\"deploy\",\"title\":\"Deploy succeeded — smoke green\",\"dedupeKey\":\"deploy:$(date +%s)\"}"'
```
The owner-alert detectors (signup, 5xx, DB-down) require `NOTIFIER_URL=http://127.0.0.1:3300` +
`NOTIFIER_KEY=<firekaro project key>` in the VPS `server/.env` (the Notifier service runs as PM2
`notifier` on the same box). If those are unset, `notifyOwner` is a silent no-op — FireKaro is
unaffected. See `server/src/lib/owner-notify.ts` + `github.com/abhayla/Notifier`.

**Then Tier-1.5 post-deploy UI verification (MANDATORY every deploy — see §8):** Playwright
the live login/splash → screenshot + ARIA + console (non-destructive). If the deploy touched an
authed screen, also run the Tier-2 authed critical-path when a session exists, else surface the skip.

**Tier-2 authed session seed (when an authed prod check is needed):** `node scripts/prod-login-capture.mjs`
— run via the **PowerShell** tool so the window is VISIBLE (the Bash tool is sandboxed/invisible). It opens
prod `/login` in **REAL Chrome with the automation signature stripped** (`channel:'chrome'` +
`ignoreDefaultArgs:['--enable-automation']` + `--disable-blink-features=AutomationControlled`), which defeats
Google's "this browser may not be secure" block that headed *bundled* Chromium trips. Abhay types the
password (never seen/stored); the script captures ONLY the FireKaro session cookie to gitignored
`e2e/.auth/user.json` (the ~47 Google cookies the persistent profile pulls in are sanitized off disk + the
profile dir deleted). Verified 2026-06-10 (`plan-baseline` authed round-trip + the 3 honesty cards).

---

## Rollback

The box has **no `.git`**, so rollback = restore the pre-deploy backup tar (step 1 above), then
rebuild + reload:
```bash
KEY=~/.ssh/firekaro_v6_vps; VPS=root@72.61.240.224
ssh -i $KEY $VPS 'cd /var/www && tar xzf firekaro-pre-deploy-<TS>.tar.gz \
  && cd firekaro && npm ci && npm run build && cd server && npm ci && pm2 reload firekaro-api'
```
Migrations: Prisma migrate has no auto-down — restore from a Supabase point-in-time
backup if a migration must be reverted. Take a backup before a schema-changing deploy.

---

## Access (verified 2026-06-09)

Deploy is runnable from a local clone over SSH — key **`~/.ssh/firekaro_v6_vps`** → `root@72.61.240.224`
(VPS hostname `srv1707492`; app at `/var/www/firekaro`, PM2 process `firekaro-api`, Node 22). The
Hostinger MCP (when connected) is managed-hosting + VM-lifecycle only — it does NOT do SSH command-exec
for this self-managed VPS, so the deploy uses the SSH key above, not the MCP. (Supersedes the prior
"no SSH credentials" blocker note.)

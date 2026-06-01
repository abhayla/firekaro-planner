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

```bash
curl https://firekaro.com/api/health           # {"success":true,"data":{"status":"ok","database":"connected"}}
```
Then in a browser: `https://firekaro.com` → bounced to `/login` → "Sign in with
Google" → Google consent → back to the app → onboarding/dashboard. Confirm a
write persists: edit a preference, reload, value survives (ServerAdapter →
Supabase round-trip).

---

## Redeploy (subsequent releases)

```bash
cd /var/www/firekaro && git pull
npm ci && npm run build                        # frontend → dist/
cd server && npm ci && npm run prisma:migrate:deploy
pm2 reload firekaro-api                          # zero-downtime backend reload
```

CI (`.github/workflows/ci.yml`) gates every push/PR to main on type-check + unit
tests + build for both trees before you pull to the VPS.

---

## Rollback

```bash
cd /var/www/firekaro && git checkout <last-good-sha>
npm ci && npm run build && cd server && npm ci && pm2 reload firekaro-api
```
Migrations: Prisma migrate has no auto-down — restore from a Supabase point-in-time
backup if a migration must be reverted. Take a backup before a schema-changing deploy.

---

## Open blocker (as of 2026-06-01)

The automated execution of §0–§7 from this Claude session is **blocked**: no
Hostinger MCP is connected in-session and no VPS SSH credentials are available.
Unblock by reconnecting the Hostinger MCP (`/mcp`) or providing SSH access; the
steps above are otherwise ready to run.

# DEPLOY runbook — provision `firekaro_v6` on the VPS

**Status:** hand-off. The autonomous run produced + validated the schema and the
migration SQL but **cannot SSH the VPS unattended** (no credentials in-session,
per the 2026-05-31 auth saga). Abhay runs the keystrokes below on
`103.118.16.189` (Postgres 16, alongside the existing `firekaro` DB).

> **Secrets:** every password / secret below is a **placeholder**. Generate real
> ones and keep them out of git. The committed `.env.example` carries placeholders
> only; the real `.env` is gitignored.

---

## 0. Prereqs
- SSH access to `103.118.16.189`.
- The existing Postgres 16 server is up (it already hosts `firekaro`).
- `mvp/server/` is on the box (or deployed via your usual path) with `node`/`npm`.

## 1. Create the database, role, and grants

`psql` as the Postgres superuser:

```sql
-- New database — sibling of the old firekaro DB (which stays untouched).
CREATE DATABASE firekaro_v6;

-- Dedicated least-privilege app role (NOT a superuser).
CREATE USER firekaro_v6_user WITH PASSWORD 'CHANGE_ME_strong_password';

-- Ownership so Prisma migrate can create/alter tables.
ALTER DATABASE firekaro_v6 OWNER TO firekaro_v6_user;

\connect firekaro_v6
GRANT ALL ON SCHEMA public TO firekaro_v6_user;
ALTER SCHEMA public OWNER TO firekaro_v6_user;
```

## 2. `pg_hba.conf` — allow the app to connect

Add ONE line scoped to the app host (find `pg_hba.conf` via
`SHOW hba_file;` in psql). Use `scram-sha-256` (Postgres 16 default), NOT `md5`
— the 2026-05-31 auth failure was an md5/scram mismatch.

```
# TYPE  DATABASE      USER                ADDRESS            METHOD
host    firekaro_v6   firekaro_v6_user    <APP_HOST_IP>/32   scram-sha-256
```

- If the backend runs **on the same VPS**, `<APP_HOST_IP>` = `127.0.0.1/32`
  (and prefer `local`/`host 127.0.0.1`).
- If it runs **elsewhere**, use that host's public IP `/32`. Do NOT open `0.0.0.0/0`.

Reload: `SELECT pg_reload_conf();` (or `systemctl reload postgresql`).

## 3. Point the backend at the new DB

In `mvp/server/.env` (gitignored — create from `.env.example`):

```
DATABASE_URL="postgresql://firekaro_v6_user:CHANGE_ME_strong_password@127.0.0.1:5432/firekaro_v6?schema=public"
BETTER_AUTH_SECRET="<openssl rand -base64 32>"
BETTER_AUTH_URL="https://<your-v6-api-origin>"
ALLOWED_ORIGINS="https://<your-v6-frontend-origin>"
GOOGLE_CLIENT_ID="<google oauth client id>"
GOOGLE_CLIENT_SECRET="<google oauth client secret>"
# DEV_BYPASS_AUTH must be UNSET or false in production.
NODE_ENV="production"
PORT="3100"
```

## 4. Apply the migration

From `mvp/server/`:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy      # applies prisma/migrations/20260531120000_init
```

`migrate deploy` is the production-safe apply (no prompts, no drift reset). It
creates all 22 tables. Better Auth uses the `user`/`session`/`account`/
`verification` tables already in this schema — no separate Better Auth migration
is needed (the Prisma adapter reads these tables directly).

Verify:

```bash
npx prisma migrate status     # should report "Database schema is up to date!"
psql "$DATABASE_URL" -c "\dt"  # should list 22 tables
```

## 5. Start the backend

```bash
npm run start                  # NODE_ENV=production tsx src/index.ts on PORT 3100
curl -s http://127.0.0.1:3100/api/health | jq    # { status: "ok", database: "connected" }
```

## 6. THEN run the deferred verification

Once the DB is live and the backend is up, run **`VERIFY-AFTER-PROVISION.md`** —
that is the Tier-2 gate script (Rule 25 / Rule 26 live round-trips) that this
contract deferred because no DB existed in-session. The build is NOT considered
"persistence-proven" until that script passes.

---

## Rollback
- Drop the DB to start over: `DROP DATABASE firekaro_v6;` (the old `firekaro` DB
  is never touched by any step here).
- The migration is forward-only in Phase 1; `prisma migrate resolve --rolled-back`
  can mark it un-applied if you need to re-run.

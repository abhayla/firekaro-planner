# SESSION-KICKOFF — autonomous verification of the firekaro-planner repo

**How to use:** open Claude Code **in this folder** (`D:\Abhay\VibeCoding\firekaro-planner`) and paste:

> **"Read `SESSION-KICKOFF.md` and execute it autonomously, end to end. Do not stop for confirmation
> except where this file explicitly says a human action is required. Report each gate as it passes."**

This repo was extracted 2026-05-31 from `FIREKaro-Vue/mvp` (fresh git history). It is the canonical
FireKaro product. **All context you need is in this repo** — `CLAUDE.md`, `.claude/`, and the project
memory (`MEMORY.md` + `project_standalone_repo.md`, `project_v6_db_supabase.md`,
`project_v6_hosting.md`). Read those first, then run the phases below.

---

## Ground truth (everything you need — no back-references)

- **Layout:** `src/` = Vue 3 frontend (port 5175). `server/` = Hono + Prisma + Better Auth backend
  (port 3100) → Supabase. Each has its **own `package.json`/`node_modules`** (node_modules are NOT in
  git — you must `npm install` in BOTH `.` and `server/`).
- **DB:** Supabase project `firekaro-planner` (ap-south-1, Postgres 17). The connection string is
  already in **`server/.env`** (gitignored, carried over) — **session pooler**
  `aws-1-ap-south-1.pooler.supabase.com:5432`, user `postgres.zymbhuwuguzeueslwhyz`. The direct
  `db.*.supabase.co` host is IPv6-only (P1001 over IPv4) — do NOT switch to it.
- **`server/.env`** already contains: `DATABASE_URL` (Supabase pooler), `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL=http://localhost:3100`, `ALLOWED_ORIGINS=http://localhost:5175`,
  `DEV_BYPASS_AUTH=true`. Do not commit it.
- **Dev auth:** 3-factor dev-bypass (NODE_ENV!=prod + DEV_BYPASS_AUTH=true + `x-dev-bypass: true`
  header). Dev user = `dev@firekaro-v6.local`.
- **Expected test counts:** frontend **471** unit tests (36 files); backend **21** (15 pure
  diff-engine + 6 live Supabase integration, env-gated on `DATABASE_URL`).
- **Guardrails:** NEVER edit `D:\Abhay\VibeCoding\FIREKaro-Vue\**` (legacy/archive). NEVER commit
  `.env`. Clean up any dev-user test rows you write to Supabase (SQL in Phase 1.6).

---

## PHASE 1 — Repo verification (FULLY AUTONOMOUS · no MCP · no human)

Run in order; report PASS/FAIL with the number per gate. On any failure, diagnose + fix the root
cause (rule 17), re-run, and only escalate if stuck after ~5 attempts.

1. **Install frontend:** from repo root — `npm install`.
2. **Install backend + generate client:** `cd server && npm install && npx prisma generate`.
3. **Frontend type-check** (root): `npm run type-check` → **0 errors** (banner `firekaro-mvp`).
4. **Frontend tests** (root): `npm run test:unit` → **471 passed**.
5. **Frontend build** (root): `npm run build` → succeeds.
6. **Backend type-check** (`server/`): `npm run type-check` → **0 errors**.
7. **Backend tests** (`server/`): `npm run test:unit` → **21 passed** (the 6 integration tests hit live
   Supabase via `server/.env` — they write rows for `dev@firekaro-v6.local`).
8. **Cleanup the dev-user rows** the backend tests wrote (run from `server/`):
   ```bash
   cat <<'SQL' | npx prisma db execute --stdin --schema=prisma/schema.prisma
   DO $$ DECLARE uid text; BEGIN
     SELECT id INTO uid FROM "user" WHERE email='dev@firekaro-v6.local';
     IF uid IS NOT NULL THEN
       DELETE FROM liability_co_borrowers WHERE "userId"=uid;
       DELETE FROM members WHERE "userId"=uid; DELETE FROM businesses WHERE "userId"=uid;
       DELETE FROM other_income_lines WHERE "userId"=uid; DELETE FROM investments WHERE "userId"=uid;
       DELETE FROM liabilities WHERE "userId"=uid; DELETE FROM insurance_policies WHERE "userId"=uid;
       DELETE FROM recurring_expense_lines WHERE "userId"=uid; DELETE FROM planned_future_lines WHERE "userId"=uid;
       DELETE FROM estate_checklist_items WHERE "userId"=uid; DELETE FROM expense_snapshots WHERE "userId"=uid;
       DELETE FROM household_config WHERE "userId"=uid; DELETE FROM user_assumptions WHERE "userId"=uid;
       DELETE FROM scenarios WHERE "userId"=uid; DELETE FROM user_features WHERE "userId"=uid;
       DELETE FROM user_ui_prefs WHERE "userId"=uid; DELETE FROM "user" WHERE id=uid;
     END IF; END $$;
   SQL
   ```

**Gate:** all 8 green → Phase 1 PASS. This proves the extracted repo builds + round-trips data against
Supabase with no human input.

---

## PHASE 2 — Live app test against Supabase (AUTONOMOUS · uses Playwright MCP, already connected)

Prove the *real app* persists to Supabase end-to-end (rules 24/25/26).

1. **Frontend env** — create `.env.local` in the repo root (gitignored):
   ```
   VITE_USE_SERVER_ADAPTER=on
   VITE_API_BASE_URL=http://localhost:3100
   VITE_DEV_BYPASS=true
   ```
2. **Start backend** (background): `cd server && npm run dev` → wait, then
   `curl -s http://localhost:3100/api/health` must show `"database":"connected"`.
3. **Start frontend** (background, root): `npm run dev` → http://localhost:5175.
4. **Drive via Playwright MCP** (`mcp__playwright__browser_*`): navigate to `http://localhost:5175`.
   The dev user is fresh/empty, so you'll land on splash/wizard. Go through onboarding far enough to
   create a household with at least one member (or load a seed persona). The boot sequence
   (`src/main.ts`) will resolve `/api/planner/me` with the dev-bypass header and install the
   `ServerAdapter`.
5. **Verify persistence (dual-signal, rule 25):**
   - Wait > 1.5s (the ServerAdapter per-key debounce flush window).
   - Network/echo: `curl -s -H "x-dev-bypass: true" http://localhost:3100/api/planner/household | jq '.data.members | length'` → ≥ 1.
   - Independent DB read: `cd server` and
     `cat <<'SQL' | npx prisma db execute --stdin --schema=prisma/schema.prisma` ... `SELECT count(*) FROM members WHERE "userId"=(SELECT id FROM "user" WHERE email='dev@firekaro-v6.local');` → matches.
   - **Reload** the page (Playwright) → the data survives (hydrateAll re-fills from Supabase).
6. **Screenshot + ARIA + console** (rule 24) on the populated screen — no new errors.
7. **Cleanup**: re-run the Phase 1.6 dev-user delete SQL. Stop the dev servers (kill the backgrounded
   `npm run dev` PIDs).

**Gate:** edit persists to Supabase within ~1.5s, survives reload, dual-signal confirmed → Phase 2 PASS.
If the Playwright MCP browser hangs, retry once, else report and skip (do not `browser_close` to force-recover).

---

## PHASE 3 — MCP re-auth (MINIMAL HUMAN — only the Supabase click)

These MCPs are for *management* work (sizing/deploy), NOT for Phases 1–2. Do them so they're ready.

1. **Supabase MCP** — on a fresh session it may show "needs authentication". If so:
   - Call `mcp__plugin_supabase_supabase__authenticate` → it returns an authorization URL.
   - **[HUMAN — the only required interaction]** Ask Abhay to open that URL and authorize. If the
     redirect page errors, have him paste the `http://localhost:.../callback?...` URL back; call
     `mcp__plugin_supabase_supabase__complete_authentication` with it.
   - Verify: `list_projects` shows `firekaro-planner` (ref `zymbhuwuguzeueslwhyz`).
2. **Hostinger MCP** (OPTIONAL — only needed when deployment starts, which is LATER):
   - Re-add: `claude mcp add hostinger-api -e HOSTINGER_API_TOKEN=<Abhay's hPanel API token> -- hostinger-api-mcp`
     (the package is already installed globally; a Claude Code restart loads its tools). Skip unless
     deploy work is starting. Rotate the token if it was ever pasted in chat.

---

## On completion — report

Produce a short report: each Phase's gate (PASS/FAIL + numbers), the live-persistence proof (member
count via API + direct Supabase read + reload-survives), Supabase left clean (0 `dev@firekaro-v6.local`
rows), and the MCP states. Then state the next step per Abhay's order: **test done → Google OAuth →
login UI → (later) deploy to the Hostinger Ubuntu VPS + firekaro.com cutover.** Do NOT deploy, do NOT
touch DNS, do NOT edit the legacy FIREKaro-Vue repo.

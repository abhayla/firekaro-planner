# FireKaro comms — go-live handoff (items that need Abhay)

**Created:** 2026-06-02 · **Owner of the build:** Claude (everything reversible is done + pushed) ·
**This doc:** the *only* things blocked on you, with exact steps. Tick as you go.

> **Status of the build:** the entire WhatsApp + Zoho + consent system is **code-complete, tested
> (95 server tests), DB-migrated, and live-verified** (consent UI persists to the migrated Supabase).
> Nothing below is code work — it's accounts/secrets/deploy/go-live that require *your* login, MFA,
> spend approval, or SSH. Each item says what I'll do the moment you unblock it.

---

## A. Critical path to send real WhatsApp messages (in order)

### A1. Zoho OAuth — create a Self Client → give me 3 values  ⛔ blocks lead-sync creds
Why me-can't: needs your Zoho login + OneAuth MFA; I won't enter your password.
**You (2 min):** `https://api-console.zoho.in` → **Add Client → Self Client** → create →
- copy **Client ID** + **Client Secret**
- tab **Generate Code** → scope `ZohoCRM.modules.ALL`, time 10 min, any "scope description" → **Create** → copy the **grant code**
- paste me **Client ID + Client Secret + grant code**.
**Then I:** exchange the code for a refresh token, store `ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN`, and the Zoho lead-sync is credential-complete.
*(Alt: log into Zoho once in the controlled "Claude Chrome" and I drive the whole flow.)*

### A2. Zoho — add `FireKaro` to the `Lead_Source` picklist
Why me-can't: edits your production CRM config. (I *could* try via API — say the word and I will; otherwise:)
**You (1 min):** CRM → Setup → Customization → Modules → **Leads** → field **Lead Source** → add value **`FireKaro`** → save.

### A3. Approve the 7 WhatsApp templates → send me the exact names  ⛔ (in progress on your side)
Catalog: `docs/whatsapp-templates.md` (welcome already approved). Wati will likely date-suffix them.
**You:** create + approve #2–8 in Wati; paste me each **exact approved name**.
**Then I:** set `COMMS_TEMPLATE_<KEY>=<exact name>` (no code change — env-driven mapping is built).

### A4. Provision VPS env + redeploy latest code  ⛔ prod deploy
Why me-can't: no SSH/file access to the Hostinger box (Hostinger MCP is API-only) + this is a production deploy.
**You (or give me SSH):** on the VPS, in `server/.env` add:
```
WATI_API_ENDPOINT=...           WATI_API_TOKEN=...
WATI_TEST_RECIPIENTS=917972672473   WATI_ALLOW_ALL_RECIPIENTS=false   # keep false until A6
WATI_WEBHOOK_SECRET=<random>
ZOHO_CLIENT_ID=...  ZOHO_CLIENT_SECRET=...  ZOHO_REFRESH_TOKEN=...   # from A1
COMMS_TEMPLATE_MILESTONE=...  COMMS_TEMPLATE_OFFTRACK=... (etc, from A3)
```
then: `git pull` → `cd server && npm install && npx prisma generate` → `pm2 restart firekaro-api`.
*(The Supabase migration is ALREADY applied to prod — no DB step needed.)*

### A5. Register the Wati delivery webhook
Why: captures real DELIVERED/FAILED into the send-log. Depends on A4 (endpoint must be live).
**You:** in Wati → set webhook URL to `https://firekaro.com/api/webhooks/wati?token=<WATI_WEBHOOK_SECRET>`.
**Then I:** can verify webhook events land in `whatsapp_send_log`. *(I can also register it via the Wati API once deployed — tell me.)*

### A6. Flip outbound ON (go-live) 🚦 spend + real users — your decision
**You:** set `WATI_ALLOW_ALL_RECIPIENTS=true` on the VPS + `pm2 restart`. After this, real users (with consent) get messages and per-message spend begins. This is intentionally yours — I will not flip it.

---

## B. Security & governance (separate from go-live)

- **B1. Supabase RLS** — all 24 tables have Row-Level Security *disabled*. Not an active leak today (the app uses Prisma over the pooler, not the anon key client-side), but if the anon key ever leaked, every row is readable. Enabling needs policies (enabling without them breaks the app). **Your decision** — flag as `TODO(5W)` or a security pass.
- **B2. Cowork shares this working tree** — a Cowork agent is committing to the same `main`/working dir; one of my commits got swept into a tax commit earlier. **Fix:** give Cowork its own `git worktree`, or keep it read-only (the daily-report is read-only — ideal).
- **B3. `TODO(5W)`** — ratify "FireKaro user contacts live in PIFS's CRM under a `FireKaro` source filter" (cross-entity funnel) in the 5Wealths DECISIONS log.
- **B4. Cloudflare origin-cert token** — standing TODO from the deploy: rotate/delete the scoped CF API token left in `server/.env`.

---

## C. Optional / nice-to-have

- **C1. Finalize the Wati skill as global** — `mv .claude/skills/wati-send-and-verify-delivery ~/.claude/skills/` so it's usable across all Claude Code + Cowork projects (it's already portable). Your call (affects all projects).

---

## What I'll do the moment each unblocks
- A1 → exchange code, store `ZOHO_*`, verify a real lead upsert (to a test source).
- A3 → wire `COMMS_TEMPLATE_*`, run `/wati-send-and-verify-delivery` per template to your number.
- A5 → confirm webhook → send-log status capture; run `wati-daily-report.ts --from-db`.
- A2 → confirm lead lands in PIFS CRM tagged `FireKaro`.
The only thing I will *not* do is **A6** (go-live spend) — that's the single true your-call.

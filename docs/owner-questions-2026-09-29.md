# Owner questions parked overnight — 2026-09-29 (read first thing)

> ## ⚠ INCIDENT (2026-09-29 ~00:50 IST): a worker changed the PRODUCTION Supabase schema without authorisation
> **What:** while fixing PR #190's red handoff test, the fixer found the "harness" DB missing two migrations and applied them by hand through Prisma raw SQL. The harness `server/.env` points at project `zymbhu…` — the SAME Supabase project production uses. Statements run (all additive, no data rows touched): `ALTER TABLE user_assumptions ADD COLUMN IF NOT EXISTS` ×3 (ADR-0006 columns), `CREATE TYPE ActivationEventType`, `CREATE TABLE activation_event`, `UPDATE _prisma_migrations` marking two old rows finished, `INSERT INTO _prisma_migrations` ×2 with checksum `manual-harness-repair`. Two timed-out `prisma migrate resolve --applied` calls may also have touched bookkeeping (unverified).
> **Impact on prod:** none observed. Served code has 0 references to the new columns (`grep -c householdSavingsStepUpPercent server/prisma/schema.prisma` on the VPS → 0), api error log has 0 `P2022` lines, `/api/health` → database connected. The new table/columns are inert until #190 deploys. **Root cause:** there is no dev database; local `.env` IS prod, and nothing blocks DDL from a laptop. Worker's brief said "do NOT apply to any remote DB"; it treated the harness as local.
> **Owner decisions needed:** (a) keep the applied DDL (recommended — it matches the migration files byte-for-byte except the checksum; at deploy, `prisma migrate deploy` will see them as applied) or roll back (`DROP TABLE activation_event; DROP TYPE …; ALTER TABLE … DROP COLUMN` ×3 and delete the two bookkeeping rows — say so and I do it in the deploy window); (b) create a separate dev/staging Supabase project (free tier allows 2) so the laptop never touches prod again — recommended, needs your Supabase login; (c) the `manual-harness-repair` checksums will make `prisma migrate deploy` report a checksum mismatch — fix is to update those two rows to the real checksums before deploy; I will prepare the exact statements.
> **Mechanism opened:** MECHANISM-DUE row `prod-db-ddl-from-laptop` (user-level PreToolUse hook blocking prisma migrate/db push/`$executeRaw` DDL when DATABASE_URL matches a prod ref outside a deploy window, fail-open; plus the dev DB). Recorded PROJECT-LOG D-2026-09-29-02.

Abhay went to sleep ~00:30 IST with the direction "implement whatever is clear and possible tonight, ask the rest in the morning". Everything below is a fork I did NOT decide. Status lines are updated as the night's work lands.

## Questions (one line each, recommended answer first)

1. **Apply the `ActivationEvent` migration + deploy PR #190 in tonight's or tomorrow's prod window?** Recommended: tomorrow 21:00–23:30 IST window, after you read the PR. Nothing is applied to any DB until you say so (one-deploy-a-day rule R6).
2. **#185 step 4 — change the kernel so salary growth feeds the headline?** Recommended: yes, after steps 2–3 land tonight and you read the ADR's cited wage-growth default. This moves every user's headline FIRE age; it is Tier A and needs your explicit go.
3. **Item c — rewrite `engineering-roles.md` + `claude-behavior.md` to rules+pointers?** Recommended: yes. A draft PR is prepared for you to read the diff; nothing merged.
4. **Public /quick share previews:** crawlers see the generic site OG tags, not the person's number (single-page-app limit). Recommended: accept for now; per-result previews need server rendering, file as good-to-have. Say no if the personalised preview is the whole point of sharing.

## Overnight queue (authorised) — status
- [x] PR #190 public /quick + counters — MERGED `68307c6` (~01:45 IST). Tier A review round 1 (2 MAJOR: guest data cleared before confirmed flush; rate-limit keyed on spoofable X-Forwarded-For) → both fixed → round 2: MERGEABLE. Leftover nits filed as #192. **Not proven live:** the signed-out /quick Playwright run and the sign-up handoff both write to the DB and the only DB is prod, so they were NOT re-run after the fixes (the worker's first core-proof run at ~00:20 did pass: `1 passed`, `/me → 401`, FIRE age rendered). Deploy still owner-gated.
- [ ] #176 endYear honesty bug: fix + FinTech review → PR
- [ ] #185 steps 2–3 (ADR + seeds + invariants, red on main) → PR
- [ ] Item c draft PR for morning read

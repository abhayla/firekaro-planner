-- gh-issue #10: DB-level idempotency backstop for the lifecycle nudge loop.
-- Enforce at most ONE non-blocked send per (userId, dedupeKey) — so even if the
-- app-level alreadySent() check is bypassed or races, the database rejects a duplicate.
--
-- PARTIAL on purpose:
--   * BLOCKED rows (frequency-capped / no-number) are EXEMPT — alreadySent() ignores
--     them and they legitimately retry, so they must be allowed to repeat.
--   * dedupeKey IS NULL (ad-hoc, non-deduped sends) are EXEMPT — they may repeat freely.
--
-- Prisma cannot express a partial unique index in schema.prisma, so it is managed here
-- (and documented on the WhatsAppSendLog model). `prisma migrate deploy` applies this;
-- do NOT `migrate dev` against it (the schema-diff would try to drop the unmodelled index).
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_send_log_user_dedupe_key"
  ON "whatsapp_send_log" ("userId", "dedupeKey")
  WHERE "status" <> 'BLOCKED' AND "dedupeKey" IS NOT NULL;

-- gh-issue #4: per-member employer sector. "government" gets the 14%-of-basic 80CCD(2)
-- ceiling under the OLD regime too (private = 10% old / 14% new). Nullable/additive —
-- existing rows default to NULL ⇒ treated as "private" (conservative) by the tax engine.
ALTER TABLE "members" ADD COLUMN "salaryEmployerSector" TEXT;

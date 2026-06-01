-- Sec 80CCD(2) employer NPS contribution (gh-issue #2 finding #2).
-- Additive, nullable column — non-destructive, no data loss, no downtime.
-- Model `Member` maps to table `members` (@@map).
ALTER TABLE "members" ADD COLUMN "salaryEmployerNpsAnnual" DOUBLE PRECISION;

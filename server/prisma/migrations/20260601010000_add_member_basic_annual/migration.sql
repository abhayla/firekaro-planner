-- Basic salary (Basic+DA) per member, to cap Sec 80CCD(2) at 10%/14% of basic (gh-issue #3).
-- Additive, nullable column — non-destructive, no data loss, no downtime.
-- Model `Member` maps to table `members` (@@map).
ALTER TABLE "members" ADD COLUMN "salaryBasicAnnual" DOUBLE PRECISION;

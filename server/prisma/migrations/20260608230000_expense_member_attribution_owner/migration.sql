-- #81 Phase 1: member-attributable itemised expenses.
-- Adds a nullable `ownerId` to both itemised-expense tables so each recurring line and
-- planned-future line can be attributed to a member ("<memberId>"), the shared household
-- ("Household", the default), or the children collectively ("Dependents"). DISPLAY-only —
-- the FIRE/household expense total is unchanged; an absent value is read as "Household" by
-- the kernel (lib/expense-attribution.ts), so existing rows stay byte-identical.
--
-- Additive + nullable → safe, no backfill required (the frontend hydrate backfills the tag,
-- and the diff engine writes it on the next save).

ALTER TABLE "recurring_expense_lines" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "planned_future_lines" ADD COLUMN "ownerId" TEXT;

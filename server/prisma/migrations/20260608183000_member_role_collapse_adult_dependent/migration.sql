-- gh #67: collapse the retired earner/non-earning-adult role flag into a single "ADULT" role.
-- Earning-status is now DERIVED from the presence of labour income (salary / active business) in
-- the FIRE kernel, never stored. The adult/dependent distinction (not derivable) is preserved.
--
-- EARNER            -> ADULT
-- NON_EARNING_ADULT -> ADULT
-- DEPENDENT         -> DEPENDENT (unchanged)
--
-- Idempotent: re-running only touches the retired values. `role` stays a free-text String column
-- (no enum), so this is a pure data migration with no schema/DDL change.
-- #81 fix (2026-06-08): the Member model is `@@map("members")` (snake_case). The original SQL
-- targeted "Member" and failed with 42P01 (relation does not exist) — so this #67 migration never
-- actually deployed to Supabase; its errored run touched zero rows. Corrected to "members".
UPDATE "members"
SET "role" = 'ADULT'
WHERE "role" IN ('EARNER', 'NON_EARNING_ADULT');

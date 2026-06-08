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
UPDATE "Member"
SET "role" = 'ADULT'
WHERE "role" IN ('EARNER', 'NON_EARNING_ADULT');

-- #223 — does this member's salary have EPF (PF deducted)? Nullable/additive — existing rows
-- default to NULL, which the app treats as "true" (most salaried members are EPF-covered).
-- AUTHORED, NOT APPLIED — no remote database has run it yet (the deploy window applies it with
-- `npm run prisma:migrate:deploy`).
ALTER TABLE "members" ADD COLUMN "salaryHasEpf" BOOLEAN;

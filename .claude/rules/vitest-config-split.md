---
description: Vitest has two configs. vitest.config.ts excludes *-integration.spec.ts; vitest.integration.config.ts includes only them. Never mix.
globs: ["vitest.config.ts", "vitest.integration.config.ts", "server/lib/**/*.spec.ts", "server/routes/**/*.spec.ts", "src/**/*.spec.ts"]
version: "1.0.0"
synthesized: true
private: false
---

# Vitest Config Split

FIREKaro runs two Vitest configs. The split exists because integration specs require a live Postgres and would otherwise poison the unit loop — a fast developer-inner loop MUST NOT require a running database.

## The Two Configs

- `vitest.config.ts` — unit config. Excludes the `*-integration.spec.ts` glob. Runs on every `npm run test:unit`.
- `vitest.integration.config.ts` — integration config. Includes ONLY `*-integration.spec.ts`. Runs when integration coverage is explicitly requested.

Integration specs currently include `envelope-integration.spec.ts`, `pagination-integration.spec.ts`, and any other file suffixed `-integration.spec.ts` under `server/lib/**` or `server/routes/**`.

## MUST / MUST NOT

- Unit specs MUST use the `.spec.ts` suffix WITHOUT the `-integration` infix.
- Integration specs MUST use the `-integration.spec.ts` suffix so the config filter picks them up. Renaming an integration file without the suffix re-adds it to the unit loop, which will then fail whenever the DB is offline.
- MUST NOT add database setup (`beforeAll` that connects to Postgres, Prisma migrations) to a file in the unit config. Move the file to integration naming instead.
- MUST NOT call the unit command expecting integration coverage. Unit passes do not imply integration passes.
- New integration spec files MUST be runnable from a clean clone by following the DB setup steps in the project `CLAUDE.md` (`npm run db:generate && npm run db:push`). Do not assume hidden local state.

## Running

- Unit: `npm run test:unit`
- Unit, single file: `npm run test:unit -- path/to/file.spec.ts`
- Unit, by pattern: `npm run test:unit -- --grep "pattern"`
- Integration: invoke via the integration config directly (see `package.json` scripts for the exact alias).

## CI Placement

Both configs MUST run in CI. A PR that only runs unit tests has not exercised any envelope-shape or pagination contract against the real database and can regress integration without detection. Budget the integration suite to run in a separate CI job so unit failures do not gate integration start (the suites are independent).

## Why This Matters

A monolithic Vitest config creates an "all or nothing" developer experience: either every contributor runs Postgres locally just to run `test:unit`, or the integration suite gets silently skipped. Neither is sustainable. The split keeps the unit loop sub-second on a clean clone and makes integration coverage an explicit, auditable step.

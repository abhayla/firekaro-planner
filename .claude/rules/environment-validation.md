---
description: Server must validate required env vars at boot via server/lib/validate-env.ts. Placeholder secrets are rejected.
globs: ["server/**/*.ts"]
version: "1.0.0"
synthesized: true
private: false
---

# Environment Variable Validation

The server MUST validate required environment variables at boot before any listener is bound. The canonical validator is `server/lib/validate-env.ts` and it runs from `server/index.ts` during startup. A missing or placeholder value fails fast with a clear error — not a 500 three minutes into the first request.

## Required Vars

At minimum, the validator enforces the presence of:

- `DATABASE_URL` — Postgres connection string for Prisma.
- `BETTER_AUTH_SECRET` — signing secret for Better Auth sessions.

Additional variables produce warnings (not hard failures) when missing in production:

- `ALLOWED_ORIGINS` — CORS origin allow-list. If unset in prod, CORS falls back to a restrictive default.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials. If unset in prod, the Better Auth social sign-in endpoint returns an error at the first click.
- `BETTER_AUTH_URL` — canonical origin used in the Google OAuth redirect URI. Missing or wrong → Google rejects the callback.

## MUST / MUST NOT

- Any new required variable MUST be added to `REQUIRED_VARS` in `validate-env.ts` — do not scatter `process.env.X ?? throw` checks across modules.
- The validator MUST run before Hono's listener binds. Configure it inside `server/index.ts`, not lazily on first request.
- Placeholder-secret detection MUST be preserved — values like `changeme`, `replace-me`, `your-secret-here`, or a short default MUST be rejected in production. A syntactically valid but placeholder secret is worse than a missing one because it passes presence checks silently.
- MUST NOT log the value of a missing or invalid variable in the error. Log the variable name only. `Missing required env var: BETTER_AUTH_SECRET` is correct; `Missing BETTER_AUTH_SECRET (got: abcd1234)` leaks the live value.
- New prod-only warnings MUST degrade gracefully in dev — `DEV_BYPASS_AUTH=true` environments intentionally run without `GOOGLE_CLIENT_*` set.

## Adding a New Required Var

1. Add the name to `REQUIRED_VARS` (or to the warnings list for prod-only).
2. Add a placeholder-pattern entry if the value is a secret.
3. Update `.env.example` in the repo root so first-time setup picks it up.
4. Confirm `npm run dev` fails with a readable message when the var is missing.

## Why This Matters

Early fail-fast validation turns a silent runtime surprise into a one-line boot error. The placeholder detection specifically protects against the common failure mode where `.env` is copied from `.env.example` into production without substitution — a real risk for a personal-finance app handling live user credentials.

---
description: Dev-only auth bypass pattern. Gated by DEV_BYPASS_AUTH=true and production refusal. Security-sensitive — treat as private.
globs: ["server/middleware/**/*.ts", "server/lib/auth.ts", "server/routes/auth/**/*.ts"]
version: "1.0.0"
synthesized: true
private: true
---

# Dev Auth Bypass

FIREKaro supports a local-development auth bypass so the frontend can be driven without going through the Better Auth Google OAuth flow. This pattern is security-sensitive: it short-circuits session verification and MUST never activate in production.

## How It Works

The auth middleware in `server/middleware/auth.ts` checks three conditions before yielding a cached dev user:

1. `process.env.NODE_ENV !== 'production'` — the process MUST NOT be running as production.
2. `process.env.DEV_BYPASS_AUTH === 'true'` — the bypass MUST be opted into at env-file level.
3. The incoming request carries an `x-dev-bypass` header — the bypass MUST be opted into per-request.

Only when all three are true does the middleware attach the cached dev user (email `dev@firekaro.local`) to the request context. Any other path runs the full Better Auth session handler.

## MUST / MUST NOT — Security Invariants

- MUST NOT remove or loosen the `NODE_ENV !== 'production'` guard. That single check is the last line of defence; every other condition can be set accidentally.
- MUST NOT allow the bypass to trigger from config alone. The `x-dev-bypass` header requirement forces an explicit opt-in per request so a stale env var cannot silently expose a running instance.
- MUST NOT log the dev user's session token or cached Better Auth record. Even in dev, the logger's redaction paths (`token`, `session`, `authorization`) must apply.
- MUST NOT extend the bypass to cover new sensitive endpoints without also extending the three-factor gate check to cover them.
- MUST NOT expose a UI toggle that flips `DEV_BYPASS_AUTH` — it is an env-only knob. A UI toggle would be tamperable at runtime.
- MUST NOT store production credentials in `.env.development` or similar shadow files. Placeholder detection in `validate-env.ts` (see `environment-validation.md`) catches the common mistake of reusing prod secrets in dev.

## Prod Refusal

The middleware MUST log and reject any attempt to set `DEV_BYPASS_AUTH=true` in a production process. The intended behaviour is: detect the misconfiguration at boot, emit a `logger.error(...)`, and either exit non-zero or force the bypass off. Do not "tolerate" the misconfiguration by ignoring it — a silent ignore masks the deployment error.

## Rotation & Cleanup

- The cached dev user's email and any dev-only credentials MUST be reset if they ever appear in a real user record. Do not treat `dev@firekaro.local` as a stable reserved address — a real Google OAuth account MUST NOT share this email.
- When extracting this pattern for other projects, strip the email, header name, and any internal user IDs before copying — they are specific to this codebase.

## Why This Matters

A dev-mode auth bypass is one of the highest-blast-radius footguns in a backend codebase. The three-factor gate (`NODE_ENV`, `DEV_BYPASS_AUTH`, `x-dev-bypass` header) is deliberately redundant so that no single misconfiguration — a shell env var, a forgotten `.env` line, a curl with the wrong header — can unlock production data.

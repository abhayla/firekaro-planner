---
description: Server-side logging MUST use the pino logger from server/lib/logger.ts. console.log is blocked by ESLint.
paths: ["server/**/*.ts"]
version: "1.0.0"
synthesized: true
private: false
---

# Structured Logging with Pino

All server-side logging in FIREKaro MUST go through the pino logger exported from `server/lib/logger.ts`. `server/eslint.config.mjs` (run via `cd server && npm run lint`) blocks `console.log`, `console.info`, `console.warn`, `console.error`, and `console.debug` in `server/src/**` — via both the built-in `no-console` rule and a `no-restricted-syntax` selector that carries the project message: "Use the pino logger from server/lib/logger.ts instead of console.*. See rules/structured-logging.md." Test specs (`server/src/**/*.spec.ts`) are exempt from the console block.

## Logger Behavior

- Dev (`NODE_ENV !== 'production'`): pretty-printed via `pino-pretty` with colorized levels and timestamps.
- Prod: single-line JSON per log, suitable for log aggregators.
- Redaction: the following paths are redacted to `[Redacted]` before emission — `password`, `secret`, `token`, `authorization`, `cookie`, `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.secret`, `*.token`.

## MUST / MUST NOT

- MUST use `logger.info`, `logger.warn`, `logger.error`, or `logger.debug` from `server/lib/logger.ts`.
- MUST pass structured context as the first object argument: `logger.info({ userId, traceId }, 'User logged in')`. The message string is the second argument.
- MUST NOT use `console.*` in `server/**` — ESLint blocks it.
- MUST NOT interpolate secrets into the message string. Pino redaction only works on object fields, not on the formatted message. `logger.info({ password: req.body.password })` is safely redacted; `logger.info(\`pw=${req.body.password}\`)` is NOT — the secret ends up in plaintext.
- MUST NOT log full request/response bodies for auth, OTP, or user-profile endpoints. Log field names or shapes, never raw values.

## Correlation IDs

The Hono middleware in `server/index.ts` attaches a `traceId` to every request context. When logging inside a route handler, pull the id from context (`c.get('traceId')`) and include it in the structured log payload so errors can be correlated across the stack. The global `onError` handler already does this for uncaught failures.

## Why This Matters

Pino is roughly an order of magnitude faster than `console.*` in production, emits parseable JSON, and — critically — the redaction config is the single choke point that prevents secrets from leaking to stdout. Bypassing pino defeats that protection and produces logs that cannot be correlated back to requests.

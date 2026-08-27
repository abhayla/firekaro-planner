---
description: Rate-limit tiers for OTP, auth, and general API endpoints. In-memory Map-based, with stricter prod thresholds.
paths: ["server/src/index.ts", "server/src/middleware/rate-limit.ts", "server/src/routes/**/*.ts"]
version: "1.0.0"
synthesized: true
private: false
---

# Rate Limiting Middleware

FIREKaro applies rate limits at the Hono middleware layer. `server/src/middleware/rate-limit.ts`
exports a generic `rateLimit({ windowMs, max, prefix })` factory (in-memory Map-based, one isolated
store per call). `server/src/index.ts` mounts it and chooses the thresholds — relaxed in dev/test,
tightened in production.

## Tiers (v6 implementation)

| Tier | Window | Limit (prod) | Limit (dev/test) | Applies To |
|------|--------|--------------|------------------|------------|
| Auth (Better Auth: Google sign-in, sessions) | 1 min | 20 requests | 2000 (so the E2E suite isn't throttled) | `/api/auth/*` |

> The v6 planner has **no OTP/SMS flow** (Google OAuth only), so there is no OTP tier — unlike the
> retired root app this rule was inherited from. The document API (`/api/planner/*`) is session-gated
> and not separately rate-limited yet; add a general tier here if a public abuse vector appears.

The factory is the mechanism; the chosen `max`/`windowMs` live at the mount site in `index.ts`.

## MUST / MUST NOT

- The auth tier (`/api/auth/*`) MUST stay rate-limited — it is the brute-force / OAuth-abuse surface.
- If an OTP or other auth sub-flow is ever added, it MUST be bucketed separately (its own `prefix`) so a brute-force attacker on one cannot consume another's budget.
- MUST NOT raise the prod limits to accommodate a misbehaving client. Fix the client or add a per-client allow-list; do not weaken the global ceiling.
- MUST NOT bypass rate limiting for dev via unconditional early returns — pass a higher `max` for non-prod at the mount site so the prod ceiling is always enforced by the same code path.
- Responses at the limit MUST return HTTP 429 with an `apiError(c, message, 429, ErrorCode.RATE_LIMITED)` envelope (see `api-envelope-pattern.md`).

## Scaling Caveat

The Map-based store resets on process restart and does not share state across nodes. If FIREKaro ever runs behind more than one backend process, replace the in-memory Map with Redis or an equivalent shared store before deploying — otherwise an attacker can simply round-robin across nodes to bypass limits.

## Why This Matters

Credential stuffing and OAuth-callback abuse are the highest-severity vectors for a finance app holding real PII (PAN, salary, family data). Rate-limiting `/api/auth/*` caps brute-force attempts against the session/OAuth surface. (If an OTP/SMS flow is ever added, SMS-pumping and phone enumeration become first-class concerns and MUST get their own separately-budgeted tier.)

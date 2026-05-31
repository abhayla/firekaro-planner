---
description: Rate-limit tiers for OTP, auth, and general API endpoints. In-memory Map-based, with stricter prod thresholds.
globs: ["server/index.ts", "server/middleware/rate-limit.ts", "server/routes/auth/**/*.ts"]
version: "1.0.0"
synthesized: true
private: false
---

# Rate Limiting Middleware

FIREKaro applies tiered rate limits at the Hono middleware layer in `server/index.ts`. The implementation is in-memory Map-based — suitable for a single-node deployment. Thresholds tighten in production versus development.

## Tiers

| Tier | Window | Limit (prod) | Limit (dev) | Applies To |
|------|--------|--------------|-------------|------------|
| OTP send/verify | 5 min | 5 requests | higher | `/api/auth/otp/**` |
| Auth (login, signup, refresh) | 1 min | 20 requests | higher | `/api/auth/**` excluding OTP |
| General API | 1 min | per-route defaults | relaxed | everything else under `/api/**` |

Exact thresholds live in `server/middleware/rate-limit.ts` — treat that file as the source of truth and do not duplicate the numbers elsewhere.

## MUST / MUST NOT

- OTP endpoints MUST be bucketed separately from other auth routes. A brute-force OTP attacker must not consume the general auth budget, and a failed login must not burn OTP send attempts.
- MUST NOT raise the prod limits to accommodate a misbehaving client. Fix the client or add a per-client allow-list; do not weaken the global ceiling.
- MUST NOT bypass rate limiting for dev via unconditional early returns — gate the relaxation on `NODE_ENV !== 'production'` so the prod ceiling is always enforced.
- Responses at the limit MUST return HTTP 429 with an `apiError(c, message, 429, ErrorCode.RATE_LIMITED)` envelope (see `api-envelope-pattern.md`).

## Scaling Caveat

The Map-based store resets on process restart and does not share state across nodes. If FIREKaro ever runs behind more than one backend process, replace the in-memory Map with Redis or an equivalent shared store before deploying — otherwise an attacker can simply round-robin across nodes to bypass limits.

## Why This Matters

OTP abuse (SMS pumping, phone enumeration) and credential stuffing are the two highest-severity abuse vectors for a finance app collecting Indian mobile numbers and payment-adjacent data. The tiered buckets are calibrated to make each class of abuse separately budgeted, so noisy one does not mask detection of the other.

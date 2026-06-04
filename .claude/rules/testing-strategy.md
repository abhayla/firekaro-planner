# Scope: global

# Testing Strategy — which test type runs in which environment

**One-line rule:** Heavy testing runs **pre-merge** against a prod-like local env; **production gets
smoke + synthetic monitoring only**. Never run the full UI regression suite, load/stress tests, or
active security tests against the live `firekaro.com`. This file is the SSOT for *where* each test
type runs; `testing.md` owns *how* tests are written (FIRST principles, flaky discipline), and the
`e2e-*` rules own the Playwright mechanics. Added 2026-06-04 at Abhay's direction.

## The matrix (test type × environment)

| Test type | Pre-merge (local / CI) | Post-deploy (prod) | Continuous (prod) | NEVER on prod |
|---|---|---|---|---|
| **Unit** | ✓ every change (`npm run test:unit`, both trees) | — | — | — |
| **Integration (DB)** | ✓ (`household-diff`, `planner.integration` gated on `DATABASE_URL`) | — | — | — |
| **E2E functional UI** | ✓ full suite (localhost:5175 + ServerAdapter→Supabase) | smoke **subset** only | — | **full regression suite** |
| **Accessibility (axe)** | ✓ (`@axe-core/playwright`) | unauth render only | — | — |
| **Visual regression** | ✓ (screenshot verdicts, rules 24/26) | — | — | — |
| **Smoke / health** | — | ✓ **every deploy** (`/api/health` + token round-trip + unauth UI render) | ✓ uptime ping | — |
| **Authenticated UI critical-path** | ✓ (dev-bypass header) | **Tier-2 on-demand** (dedicated test Google account, manually session-seeded) | — | routine full authed UI |
| **Performance — synthetic** | ✓ Lighthouse/CWV budget on the build | one-shot on public pages post-deploy | ✓ lightweight latency monitor | — |
| **Performance — load / stress** | ✓ local/staging-like only | — | — | **load-testing prod** (self-DoS, cost, skews data) |
| **Security — SAST / dep-scan** | ✓ (`/supply-chain-audit`, `/security-audit`) | — | passive (TLS/headers) | — |
| **Security — active pentest** | authorized only | — | — | **no active pentest on prod** without explicit authorization |

## Why prod is smoke-only (standard practice)

- **Full UI regression on prod is an anti-pattern** — it pollutes real multi-tenant data, is slow and
  flaky against live infra, and risks touching real-user PII. The full suite belongs pre-merge.
- **Load/stress testing prod can DoS your own live site**, skew analytics, and hit Supabase
  pooler/cost limits. Load tests go to a local/staging-like env, never `firekaro.com`.
- **Active security testing (pentest/fuzzing) on prod** is both risky and, depending on posture,
  unauthorized — keep it pre-merge or in an authorized, isolated environment.
- Production's job is to answer "**is the live release healthy?**" — that's smoke + synthetic
  monitoring, a critical-path check, not a regression sweep.

## This project's scoped decisions (goal-anchored + YAGNI — rule 21)

- **No staging environment yet.** Standing up a second VPS/preview is spend + infra (your escalation
  gate) and unjustified at solo scale. **localhost-with-ServerAdapter→Supabase IS the prod-like
  full-test env.** Revisit a real staging env when traffic grows or a second developer joins.
- **Prod = smoke + synthetic monitoring only**, per the matrix. The two prod-smoke tiers:
  - **Tier 1 (automated, every deploy, hands-off):** `GET /api/health` + a token-guarded
    `GET /api/internal/smoke` (a Prisma **read** round-trip — `user.count()` — proving the generated
    client + a real table + a query work through the pooler, richer than `/api/health`'s raw
    `SELECT 1`; guarded by `SMOKE_TOKEN`, mirroring the existing `LIFECYCLE_RUN_TOKEN` pattern, built in
    `server/src/routes/smoke-internal.ts`) + an unauthenticated Playwright render check of the login
    page. No Google account needed; the dev-bypass is OFF in prod so this path is deliberately auth-free.
    A write→read→delete probe via a dedicated probe table is a documented future upgrade if the
    read-only check proves insufficient.
  - **Tier 2 (on-demand, significant releases / incident verification):** authenticated prod UI via the
    Playwright runner with a `storageState` seeded by a **one-time manual Google login** of a dedicated
    test account. Session lasts ~7 days; re-seed when it expires. Not run on every deploy.
- **No load/stress testing yet** — not warranted at current traffic (YAGNI). Add when scaling signals
  appear (sustained latency, Supabase limits).
- **Perf:** Lighthouse/CWV budget pre-merge (`/perf-test`, `vercel:performance-optimizer`) + a
  lightweight synthetic latency check on prod public pages (`/monitoring-setup`).

## Direct answers (the recurring questions)

- **UI testing on prod?** Smoke critical-path **yes**; full regression suite **no** (→ pre-merge).
  Authenticated UI on prod is **on-demand only**, via the dedicated test account.
- **Performance testing on prod?** Synthetic monitoring **yes** (lightweight, read-only); load/stress
  **no** (→ local).
- **Security testing on prod?** Passive (TLS/headers) **yes**; active pentest **no**.

## Relationship to the other rules (no duplication — `configuration-ssot.md`)

- `testing.md` — HOW tests are written (FIRST, pyramid ratios, flaky quarantine). This file is WHERE.
- `operating-model.md` — the pre-commit verification *edge* (rules 24/25/26/29/31) is **dev/test-scoped**;
  this file defines the **post-deploy** extension that edge does not cover.
- `engineering-roles.md` — **DevOps/Release** owns the prod smoke + tiers + rollback trigger; **QA** owns
  the pre-merge pyramid + which layer a test belongs in.
- `docs/DEPLOY.md` §8 (prod smoke commands) + §Rollback (the rollback trigger) — the runbook wiring.

## CRITICAL RULES

- MUST run the full UI regression suite, load/stress tests, and active security tests **pre-merge**, NOT
  against the live `firekaro.com`.
- MUST limit production testing to **smoke (critical-path) + synthetic monitoring**; prod answers
  "is the release healthy?", not "does everything still work?".
- MUST keep authenticated prod UI verification **on-demand** (dedicated test Google account,
  manually-seeded session) — never a routine every-deploy full-authed sweep, and never using a real
  user's account or Abhay's personal account.
- MUST NOT load-test or active-pentest production; MUST NOT stand up a staging environment at current
  scale without an explicit need (YAGNI) — localhost+Supabase is the prod-like test env.
- MUST keep this the SSOT for test *placement* (where) and cross-reference `testing.md` (how),
  `operating-model.md` (the pre-commit edge), and `DEPLOY.md` (the runbook) — never duplicate them.

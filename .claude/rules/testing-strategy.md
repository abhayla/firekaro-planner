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
| **Smoke / health** | — | ✓ **every deploy** (`/api/health` + token round-trip + bundle-hash-changed) | ✓ uptime ping | — |
| **Post-deploy UI verification (unauth, non-destructive)** | — | ✓ **MANDATORY every deploy** (Tier-1.5: live Playwright screenshot+ARIA+console of login/splash; big or small) | — | destructive actions on prod |
| **Authenticated UI critical-path** | ✓ (dev-bypass header) | **Tier-2 when the deploy touches an authed screen OR a session exists** (dedicated test Google account, manually session-seeded; skip surfaced verbatim if no session) | — | routine full authed UI / destructive flows |
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
- **Prod = smoke + synthetic monitoring only**, per the matrix. **UI verification after EVERY prod
  deploy is MANDATORY — big or small (Abhay directive, 2026-06-09): "UI verification should always be
  done after each production deployment. It doesn't matter whether it is a small deployment or a big
  one."** "It returned smoke 200" is NOT sufficient; a deploy can ship a broken bundle that the health
  endpoint never exercises. The three prod-deploy verification tiers:
  - **Tier 1 (automated, every deploy, hands-off):** `GET /api/health` + a token-guarded
    `GET /api/internal/smoke` (a Prisma **read** round-trip — `user.count()` — proving the generated
    client + a real table + a query work through the pooler, richer than `/api/health`'s raw
    `SELECT 1`; guarded by `SMOKE_TOKEN`, mirroring the existing `LIFECYCLE_RUN_TOKEN` pattern, built in
    `server/src/routes/smoke-internal.ts`) + confirm the live SPA bundle hash CHANGED (proves the new
    build is actually serving, not a cached old one). No Google account needed; dev-bypass is OFF in prod.
  - **Tier 1.5 — post-deploy UI verification (MANDATORY, EVERY deploy):** drive Playwright against the
    LIVE site → screenshot + ARIA snapshot + console of the **unauthenticated** surface (login/splash
    renders, the primary control — "Sign in with Google" — is present + interactive, no NEW console
    errors beyond the expected unauth 401 on `/api/planner/me` + the `[boot] not authenticated` warning),
    using **non-destructive interactions only** on prod (rule 32). This runs on every deploy regardless
    of size; the unauth surface needs no session.
  - **Tier 2 — authenticated prod UI (when the change touches authed screens OR a session is available):**
    authenticated prod UI via the Playwright runner with a `storageState` seeded by a **one-time manual
    Google login** of a dedicated test account (session ~7 days; re-seed when expired). When a deploy
    changes an AUTHED screen (e.g. the #65 `/tax-planning` tax figure), the authed critical-path SHOULD
    be verified too — if no live session is available, surface "authed prod UI verification SKIPPED —
    needs a logged-in session" (no silent skip) so it is done as soon as a session exists. Still
    NON-DESTRUCTIVE on prod (tab/FY/expand/dialog-open-cancel; NEVER create/edit/delete real data).
- **No load/stress testing yet** — not warranted at current traffic (YAGNI). Add when scaling signals
  appear (sustained latency, Supabase limits).
- **Perf:** Lighthouse/CWV budget pre-merge (`/perf-test`, `vercel:performance-optimizer`) + a
  lightweight synthetic latency check on prod public pages (`/monitoring-setup`).

## Direct answers (the recurring questions)

- **UI testing on prod?** **Post-deploy UI verification (unauth, non-destructive) is MANDATORY after
  EVERY deploy — big or small** (Tier-1.5; live screenshot+ARIA+console). Full regression suite **no**
  (→ pre-merge). **Authenticated** prod UI runs when the deploy touched an authed screen OR a session
  is available (Tier-2, dedicated test account) — and a missing session is surfaced, never silently skipped.
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
- MUST run **post-deploy UI verification (Tier-1.5: unauthenticated, non-destructive — live
  screenshot+ARIA+console) after EVERY prod deploy, big or small** (Abhay directive 2026-06-09) — a
  green smoke endpoint is NOT sufficient. MUST run the **authenticated** critical-path (Tier-2) too when
  the deploy touched an authed screen OR a session exists; if no live session is available, MUST surface
  "authed prod UI verification SKIPPED — needs a logged-in session" (no silent skip), never a routine
  every-deploy full-authed sweep, and never using a real user's or Abhay's personal account.
- MUST NOT load-test or active-pentest production; MUST NOT stand up a staging environment at current
  scale without an explicit need (YAGNI) — localhost+Supabase is the prod-like test env.
- MUST verify **interactive functionality** (clicks, tabs, FY switches, forms, dialogs), not just render
  /layout/console, at **every** testing layer (rule 32): pre-merge E2E exercises the full (incl. destructive)
  flows; the **prod smoke MUST include non-destructive interactions** (tab/FY/expand/dialog-open-then-cancel) —
  "it rendered" is never sufficient to claim a prod screen works.
- MUST keep this the SSOT for test *placement* (where) and cross-reference `testing.md` (how),
  `operating-model.md` (the pre-commit edge), `claude-behavior.md` rule 32 (interactive functionality), and
  `DEPLOY.md` (the runbook) — never duplicate them.

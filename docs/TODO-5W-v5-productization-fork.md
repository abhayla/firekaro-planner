# TODO(5W): How does research-complete v5 become the actual product?

**Type:** Strategic / portfolio decision brief — **NOT a repo-level decision.**
**Created:** 2026-05-30 · **Status:** Awaiting a 5Wealths session
**Boundary (L-042):** This brief lives in the product repo. The *decision* must be recorded by
Abhay in a 5Wealths session under
`D:\Abhay\VibeCoding\5Wealths\Financial Wealth\FW-FireKaro\DECISIONS.md` (MADR format, new
`D-2026-xx-xx-NNN`). This file is the input; it does **not** decide.

---

## The decision (one line)

Now that the v5 MVP is **research-complete, architecturally clean, and pushed**, how does its
research-correct math + redesigned UX become the *shipped* FireKaro — given that a **separate,
older production app already exists** and has a deploy plan?

## Why this is due now (not before)

ADR-0001 explicitly framed v5 as *"a single-user personal evaluator that Abhay reviews
**before deciding to incorporate into production**."* That evaluation is complete:
- Spine + P1–P5 + Stage-T0 + T0b shipped (research math wired, headline ₹12.86 Cr, 463 tests,
  ADR-0002 clean). See `docs/audit/v5-implementation-gap-2026-05-30.md`.
- The only repo work left is **hardening** (E2E + visual-regression + deploy) — and **its shape
  depends entirely on this fork.** Hardening-for-a-demo and hardening-toward-v6-SaaS are
  different jobs. So this decision should be made *before* the hardening goal is authored.

## The two FireKaros today

| | **Production app** (`src/` + `server/`) | **v5 MVP** (`mvp/`) |
|---|---|---|
| Stack | Vue 3 + Hono + Prisma/**Postgres** + Better Auth + TanStack Query | Vue 3 + Vuetify, **frontend-only**, localStorage |
| Users | Multi-user backend (58 Prisma models, real auth) | Single-user (`userId='self'`), adapter-abstracted |
| FIRE math | **Pre-audit** (the OLD math the mvp was *ported from then corrected*) | **Research-correct** (horizon SWR, 4-bucket inflation, family layer, NPS-annuity, …) |
| UX | Pre-redesign | The redesigned, SCREEN-STANDARD system |
| Deploy | `production-readiness-plan.md` → replace existing FireKaro, **5000 users**, VPS :3003, `firekaro_prod` | None (localStorage demo) |
| Role (5W-CONTEXT §4) | Financial Wealth **data layer** + commercial SaaS candidate | The "evaluate-before-incorporate" prototype |

**The core tension:** the production app has the **infrastructure** (multi-user backend, auth,
deploy plan) but the **wrong math/UX**; the mvp has the **right math/UX** but **no backend**.

## Options

### A — Port v5 *into* the production app
Keep the Hono/Prisma/auth backend; replace its `server/lib/calculations/*` with v5's corrected
math and swap its frontend for the mvp's redesigned screens. One full-stack app, deployed per
the existing plan.
- **+** Reuses the production backend + the 5000-user deploy plan; one app to maintain.
- **−** Re-implements the just-finished mvp work in a *different* architecture (server-side calc
  + TanStack Query + Prisma vs. pure client libs). Significant porting; risk of re-introducing
  the divergence the audit just closed.

### B — Evolve `mvp/` into v6 SaaS (ADR-0001 path)
Swap `LocalStorageAdapter` → a `ServerAdapter` + add a real `AuthProvider`. The mvp lineage
becomes the product.
- **+** Keeps the right math/UX as-is (zero porting); ADR-0001 architected exactly this seam.
- **−** Needs a backend. Either build new (abandons the production app's backend investment) or
  **reuse the production `server/` as the adapter target** (see Synthesis).

### C — Synthesis (likely the real answer): mvp frontend + production backend
The mvp's `ServerAdapter` (ADR-0001) targets the **existing `server/` (Hono+Prisma+auth)** as
its API. The research-correct mvp UX/math is the client; the production backend becomes the v6
persistence + multi-tenant layer; the old production *frontend* is retired.
- **+** Keeps both investments — right math/UX (mvp) AND real backend/auth/deploy (production);
  minimal re-implementation; ADR-0001's adapter seam is the join.
- **−** Requires deciding where calc runs (client libs vs. move to `server/lib/calculations`),
  reconciling the two schemas (mvp types vs. 58 Prisma models), and a real integration effort.

### D — Hold: mvp stays personal-eval; production ships its own (old) path
- **−** Ships pre-audit math to 5000 users while the correct version sits in `mvp/`. Hard to
  justify given the audit's "+60% underfunding" finding. Likely a non-starter, listed for completeness.

## Decision criteria for the 5W session

1. **Commercialization intent + timing** — is v6 SaaS a near-term goal (→ B/C) or is FireKaro
   primarily the 5W *data layer* for now (→ A or C-lite)? (5W-CONTEXT §4 says "double as
   commercial SaaS *when launched*.")
2. **Sunk-cost vs. correctness** — is the production backend worth preserving (→ A/C) or is a
   clean mvp-native backend cleaner (→ B)?
3. **Where calc runs** — client libs (mvp today) vs. server (`server/lib/calculations`). Affects
   multi-device, audit-trail, and the v6 trust model.
4. **Schema reconciliation cost** — mvp TS types vs. 58 Prisma models. Who's the source of truth?
5. **5W principles** — Principle 2 ("scale to all from day one") pushes toward C/B; Principle 1
   ("productized, not just-for-Abhay") rules out D.

## Reconciliation assessment (2026-05-30) — this REVISED the recommendation

My pre-assessment lean was **C**. I then ran the read-only reconciliation assessment I had
flagged as "Unverified" (3 parallel agents across `server/`, `prisma/`, `mvp/` — calc layer,
schema/data-model, API+auth seam). **The evidence flipped it to B.** They converged
independently:

| Axis | Option A (port into prod) | Option B (mvp → v6) | Option C (mvp UI + prod backend) |
|---|---|---|---|
| **Calc layer** | MEDIUM (port pure fns LOW, but build a Prisma→Household adapter + the `derive()` kernel + ~6 new fields) | **ZERO** (math already native to the mvp model) | worst (the rich `Household` snapshot must cross the client/server boundary) |
| **Schema / data model** | costly (normalize mvp's flat `Investment`/`Expense`/`Business` unions into prod's account+ledger tables; migrate 14 research fields) | **cheapest** (ADR-0001 designed for it — every entity already carries `userId`; clean adapter swap) | **most expensive** (a 58-table normalized API cannot wrap the mvp's single-blob key/value adapter without a thick fan-out/reassembly layer) |
| **API + auth seam** | n/a (one app) | LOW–MEDIUM (build a backend behind the existing adapter seam) | **HIGH** (aggregate-vs-granular fan-out/fan-in diff engine; sync→async interface break rippling through every `hydrate()`; envelope + per-entity field/enum remapping). Auth = MEDIUM. |

**Verdict: all three axes favor B; C is the highest-effort on every axis.** My earlier "C preserves
both investments" reasoning was wrong about the *cost* — the implemented `StorageAdapter` is a
**generic single-blob key/value store** (`get/set` by entity key; only 5 keys; `household` is one
giant aggregate), not the per-entity adapters ADR-0001 imagined. That makes mapping onto
production's 75 granular REST routes / 60 Prisma models *harder*, not easier.

### The deeper reframe (the real strategic insight)
The two apps are **not two versions of one product** — they are **different application
paradigms**: the production `src/`+`server/` app is a **tax/tracking ledger** (FY-scoped,
transactional, multi-user, ~58–60 normalized tables, 12-month salary grid, receipts, budgets,
advance-tax), while the mvp is a **FIRE-planning projector** (single forward-looking snapshot,
~10 entities, plan-to-age, scenarios). They disagree on persistence shape (normalized rows vs
one JSON blob), temporal model (history vs snapshot), and identity (auth users vs array members).
So the fork may not be "which codebase wins" at all — it may be **"are these one product or
two?"** (The 5W-CONTEXT framing fits both roles: the ledger = "canonical Financial-pillar data
source"; the projector = "commercial SaaS.") **This is the question to settle first in the 5W
session.**

## Revised recommendation (INPUT to the 5W decision — not the decision)

**Lean B: evolve `mvp/` into v6 by building a backend behind its adapter seam — do NOT try to
merge into or reuse the production `src/`+`server/` app.** It is lowest-cost on all three
measured axes, keeps the just-finished research math/UX untouched, and is exactly what ADR-0001
scaffolded. Treat the production app as a **separate product** (the tracking/ledger data source)
that may *feed* the projector via a future integration, rather than something to consolidate into.

**Sub-fork for the 5W session (agent-surfaced):** if you still want to reuse the production
backend, the cheap version of C is **not** wrapping its granular API — it's adding **one
production "household-snapshot" endpoint** (a single GET/PUT over a JSON aggregate column) so the
mvp's blob adapter maps 1:1. That trades away the production app's granular query/family
features. Decide that trade explicitly; don't drift into the expensive granular-wrap version of C.

**Honesty note:** I changed my own recommendation here on the evidence — the assessment was worth
running precisely because it moved the answer (C → B) before any code was committed to the wrong path.

## What each path means for the *next repo goal* (hardening)

- **A / C** → hardening targets a **full-stack** app (E2E through the backend, Postgres, auth,
  the VPS deploy plan) — much closer to `production-readiness-plan.md`.
- **B** → hardening targets the **mvp + a new backend** (build the ServerAdapter first).
- **D / undecided** → hardening is **demo-only** for `mvp/` (E2E + visual-regression + Vercel
  static deploy), with no backend integration.

→ **Author the hardening goal *after* this fork is decided**, so it builds toward the right target.

## Cross-references

- Record the decision: `D:\Abhay\VibeCoding\5Wealths\Financial Wealth\FW-FireKaro\DECISIONS.md`
  (new `D-2026-xx-xx-NNN`, MADR). Check `…\Financial Wealth\PROJECT-MAP.md` for FireKaro's
  feeder relationships before deciding.
- `docs/adr/0001-v5-portfolio-tier-stance.md` — the multi-tenant-ready / swap-the-adapter stance
- `docs/plans/production-readiness-plan.md` — the production-app deploy plan (5000 users, VPS)
- `docs/audit/v5-implementation-gap-2026-05-30.md` — proof v5 is research-complete
- `5W-CONTEXT.md` §4 — FireKaro as Financial Wealth data layer + commercial SaaS candidate
- `5W-PRINCIPLES.md` — Principles 1 (productize) + 2 (scale to all)

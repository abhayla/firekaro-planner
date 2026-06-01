# FIRE Planner as the product — decision, pros/cons, and replacement approach

**Created:** 2026-05-30 · **Status:** Direction chosen by Abhay ("Make the FIRE Planner the
product"); engineering plan below. **Decision record:** the portfolio-level commitment (retire
the old app *as the product*, adopt Option B) is 5W-tier — Abhay records it in a 5Wealths
session under `D:\Abhay\VibeCoding\5Wealths\Financial Wealth\FW-FireKaro\DECISIONS.md` (L-042
boundary). This repo doc is the analysis + the engineering plan it gates.

**Decision:** Make the **`mvp/` FIRE Planner** (research-correct math + redesigned UX) the
shipping product. Give it a real backend + login (**Option B** — evolve mvp into v6 behind its
adapter seam). Retire the old full-stack tracker (`src/`+`server/`) *as the product*; salvage its
proven infrastructure pieces. Basis: the 2026-05-30 reconciliation assessment
(`docs/TODO-5W-v5-productization-fork.md`) — Option B is lowest-cost on calc, schema, and
API/auth axes; merging (A/C) is most expensive.

---

## 1. What "the FIRE Planner is the product" means concretely
- The **`mvp/` codebase** is the shipping product (frontend + research math + UX).
- It gains a **real backend + login** so data is multi-user and cross-device (today it lives only
  in one browser via localStorage).
- The **old app** (`src/`+`server/` — a tax/transaction tracker carrying the pre-audit, wrong FIRE
  math) is retired as the product; its **data model + frontend dropped**, its **infra patterns kept**.

---

## 2. Pros

| # | Pro | Why it matters |
|---|---|---|
| 1 | **Correct math ships** | The whole audit (horizon SWR, 4-bucket inflation, family layer, NPS/EPF tax → ₹12.86 Cr headline) reaches users. The old app is wrong by ~40–80% for a family — shipping that is indefensible. |
| 2 | **Lowest-cost path** | Reconciliation assessment was unanimous: mvp math is already native (zero porting); ADR-0001 scaffolded exactly the "swap-in a backend" move. Merging is the most expensive path on every axis. |
| 3 | **Keeps the redesigned UX** | The SCREEN-STANDARD v5 design, not the old pre-redesign screens. |
| 4 | **It's the differentiated SaaS** | Research-grounded FIRE planning with minimal input is a product; transaction tracking is commodity + manual-entry-heavy (against 5W-Principle 3, automate). |
| 5 | **Clean multi-tenant foundation** | Every entity already carries `userId`; one adapter seam; ~480 tests; no legacy debt. |
| 6 | **Faster to something real** | Live clickable demo in a short loop (no backend needed); real multi-user product without re-porting. |

---

## 3. Cons / risks (honest)

| # | Con / risk | Mitigation |
|---|---|---|
| 1 | **Shelves real sunk investment** (old backend, 58 models, VPS deploy plan) | Salvage the infra patterns (§5); sunk cost ≠ reason to build on wrong foundations. |
| 2 | **No backend yet — genuine work** (auth, persistence, sync, security) | Reuse the old app's proven Better-Auth + Hono patterns; phase-gated build. |
| 3 | **Persistence-shape gap** (mvp = one localStorage JSON blob) | Start with a **snapshot/document** backend model that maps 1:1 to the blob adapter (cheapest); normalize later only if needed (YAGNI). |
| 4 | **Sync→async refactor** (mvp reads/writes synchronously) | Bounded change; regression-locked by the ~480-test suite; the demo stays on the sync path in parallel. |
| 5 | **Feature gaps vs old app** (transaction tracking, receipts, budgets, salary grid, net-worth history, advance-tax, Monte-Carlo, bank accounts, family-as-real-logins) | Add by **demand** in Phase 3 — do NOT port the ledger wholesale. |
| 6 | **Security/compliance surface** (real financial data + users) | Adopt the old app's security baseline (encryption at rest, rate-limiting, session hardening, 3-factor dev-bypass). Planning-only, user-entered data (no bank connections) keeps the surface smaller. |
| 7 | **Scope-creep into open-ended SaaS** | Hard phase gates; stop/redirect allowed after any phase. |

---

## 4. What we KEEP from the old app (salvage, don't waste)
Retire the old *product*, not the *work*. Lift:
- **Auth** — Better Auth + Google OAuth + the 3-factor dev-bypass gate (proven).
- **Backend conventions** — Hono structure, API-envelope pattern, pino logging, env validation,
  tiered rate-limiting, the `.claude/rules/` backend ruleset.
- **Deploy infra** — VPS / PM2 / nginx + the production-readiness security checklist.
- **Select calc the mvp never built** — Monte-Carlo, Guyton-Klinger / VPW withdrawal — reference,
  port only if the product wants them.
- **The tax-config single source of truth.**
Dropped: the data model (58-table tracker) and the old frontend.

---

## 5. The replacement APPROACH — 4 phases, hard gates

### Phase 0 — Live demo (immediate, near-zero risk)
Deploy the planner **as-is** (browser-only, no backend) to a shareable URL (Vercel static). Real
clickable product within a short loop; validates UX with real fingers before any backend spend;
the same frontend is the eventual product (nothing thrown away).

### Phase 1 — Backend foundation (the "v6" core) — pre-made design decisions

> **STATUS 2026-05-31 — BUILT + LIVE-VERIFIED on Supabase. Phase 1 complete.**
> Implemented by `docs/goals/2026-05-31-v6-phase1-backend-foundation.md` (autonomous run).
> Code lives in **`mvp/server/`** (Hono + Prisma + Better Auth, 22-table schema derived 1:1 from
> the Zod model) + the write-behind **`mvp/src/lib/server-adapter.ts`** behind the unchanged
> StorageAdapter seam. Proven in-session: `prisma validate`, the household **diff engine** (15 unit
> tests, red-first), the **ServerAdapter** (10 unit tests, mocked fetch), **471 mvp frontend tests
> green** with the 6 stores + router guards **UNCHANGED**.
>
> **DB DECISION (2026-05-31): Supabase, NOT the VPS.** A sizing test (300 synthetic households,
> measured on live Supabase Postgres 17) gave **~33 KB/user → 5k users ≈ 174 MB, 10k ≈ 338 MB**
> (uncapped snapshots; 10k/5yr worst case ≈ 485 MB) — under Supabase's 500 MB free-tier limit.
> Project **`firekaro-planner`** (`ap-south-1`, ref `zymbhuwuguzeueslwhyz`) created; the 22-table
> schema is applied to `public`. The Windows-VPS path (`DEPLOY-VPS-firekaro_v6.md`) is **dropped**.
>
> **Tier-2 live verification CLOSED (2026-05-31):** the 6 endpoint integration tests pass against
> Supabase (`planner.integration.spec.ts`, env-gated), and **Rule 25/26 are proven dual-signal** —
> endpoint round-trip + an independent MCP `SELECT` confirming the persisted rows (Joint ownerId,
> auto-flow no-dup, member-orphan cleanup, assumptions round-trip). `public` left empty
> (production-pristine). **Remaining for a real launch:** a login UI (dev-bypass only today),
> wiring the frontend with `VITE_USE_SERVER_ADAPTER=on`, and Phase 2 hardening.
>
> **HOSTING DECISION (2026-05-31): the app deploys to Hostinger** (DB stays on Supabase
> `firekaro-planner`). The Hono backend (`mvp/server/`) needs a Node-capable host — so a Hostinger
> **VPS** (or their Node-app hosting), NOT plain shared/hPanel hosting (which can't run a persistent
> Node process). The old `mvp/server/DEPLOY-VPS-firekaro_v6.md` (self-hosted Postgres on the Windows
> VPS) is **superseded** — DB is Supabase, app host is Hostinger.
>
> **TARGET ENV (confirmed 2026-05-31 via Hostinger MCP):** existing Hostinger **KVM 2 VPS** — Ubuntu
> 24.04 LTS, 2 vCPU / 8 GB RAM / 100 GB disk, IP **`72.61.240.224`** (hostname `srv1707492.hstgr.cloud`),
> **Mumbai DC** (same region as the Supabase DB → minimal latency). Deploy stack: **Node + PM2 + nginx**
> reverse proxy + HTTPS, pointing at Supabase. (Also on the account: a Premium shared-hosting plan — for
> the static frontend if wanted; backend goes on the VPS.)
>
> **DOMAIN = `firekaro.com` (apex) via a Phase-4 CUTOVER.** Abhay is OK retiring the old live Next.js
> app. **SEQUENCING (non-negotiable): deploy + verify v6 on the VPS IP FIRST, then flip firekaro.com.**
> The domain is **not in the Hostinger account** (Cloudflare-fronted), so the cutover is an **A-record
> change at Cloudflare** → `72.61.240.224` (+ handle Cloudflare proxy/SSL). No DNS change until the app
> is live — pointing early = pure downtime. Retiring firekaro.com is a **5W/portfolio commitment** —
> `TODO(5W)` record in `FW-FireKaro\DECISIONS.md`.

> **DECISION UPDATE (2026-05-31, grill with Abhay):** the **JSON snapshot/document model is
> REJECTED.** It optimized purely for migration cost, not for a real product — a blob-per-user
> is unqueryable, can't support cross-user/admin/analytics, races on multi-device partial
> writes, and fights 5W-Principle 2 (scale/multi-tenant from day one). It would also mean
> pouring the old app's 130 *normalized* tables into an opaque blob. Superseded by the
> normalized decisions below.

- **Persistence: a lean NORMALIZED schema — NOT a JSON blob, and NOT the old 130-table sprawl.**
  Normalize **only the planner's own domain** — the entity set already defined in
  `mvp/src/types/household.ts` + `assumptions.ts` (household, members, businesses, other-income,
  investments [12 instrument subtypes], liabilities, insurance, recurring/planned expenses,
  glide-path, estate checklist) + `scenarios`/`features`. That is ~**15–25 tables**, keyed by
  `userId`. The planner's existing clean model IS the table list — queryable + a clean migration
  target, without the tracker bloat (GST/invoicing/forum/courses) the planner has no concept of.
- **Schema source of truth = the existing Zod schemas (DECISION 2026-05-31).** The planner's
  whole data model is ALREADY written as Zod schemas (`z.infer<...>`) in
  `mvp/src/types/household.ts` (`memberSchema`, `businessSchema`, `investmentSchema`,
  `liabilitySchema`, `insurancePolicySchema`, `expensesSchema`, `householdSchema`, …) +
  `assumptions.ts` (`assumptionsSchema`). The v6 Prisma schema is **derived 1:1 from these Zod
  schemas** — each entity → a table keyed by `userId`. Zero shape drift, the `ServerAdapter` maps
  cleanly, and the research-correct, already-unit-tested model is preserved. NOT hand-designed
  fresh (would duplicate + drift), NOT adapted from the old app's tables (re-imports tracker
  modelling). The Zod schemas stay the runtime-validation contract; Prisma mirrors them.
- **New database + new schema — evolve NEITHER existing DB.** NOT the old VPS `firekaro` DB
  (130 tables, wrong tracker model — being retired) and NOT this repo's root `src/`+`server/`
  58-model schema (same tracker DNA, never deployed). A fresh schema lets the model be exactly
  the planner's domain instead of inheriting legacy baggage.
- **DB host: the SAME VPS** (`103.118.16.189`, existing Postgres 16) — a **new database**
  (e.g. `firekaro_v6`) alongside the old `firekaro`. Reuses existing infra; migration becomes a
  fast same-server copy, no network hop. (Abhay: "create on VPS only".)
- **Old `firekaro` DB role = read-only MIGRATION SOURCE only.** One-time export of the
  planning-relevant subset → transform → load into the new lean schema. Retired (with the whole
  old app) after cutover. Source, never target. (Data volume still unconfirmed — prod DB survey
  was parked; treat as effectively single-household + defer a general N-user pipeline until the
  count is known.)
- **Schema architecture (DECISION 2026-05-31, via `feature-dev:code-architect`):** **21 tables**
  — 13 domain (`household_config`, `members`, `businesses`, `other_income_lines`, `investments`,
  `liabilities`, `liability_co_borrowers`, `insurance_policies`, `recurring_expense_lines`,
  `planned_future_lines`, `estate_checklist_items`, `expense_snapshots`) + 4 config
  (`user_assumptions`, `scenarios`, `user_features`, `user_ui_prefs`) + 2 Better-Auth + 2 deferred
  (`data_sync_log`→P2, `migration_audit`→P4, YAGNI).
  - **Variant/nesting strategy:** table-per-entity; **JSONB column for per-subtype fields**
    (`investments.subtype_data` for the 12 instrument types; `scenarios.lever_values`;
    `user_features`/`user_ui_prefs` whole-blob). Rationale: the server only persists (calc is
    client-side) so NO per-subtype field is ever in a server-side WHERE/JOIN — every read is
    `WHERE userId=$1`. The Zod schema enforces variant-field integrity the DB doesn't (defense in
    depth). The `investmentSchema` is already flat at runtime (`household.ts:243` — union dispatch
    is READ-time only), so JSONB is the natural fit, NOT 12 variant tables (sprawl, zero query
    benefit) and NOT a wide sparse table.
  - **Arrays that get aggregated → child tables:** `recurring_expense_lines` +
    `planned_future_lines` (CRUD'd + auto-flow row-level upsert/delete), `liability_co_borrowers`
    (junction; the tax module's 2× Sec-24 deduction queries it).
  - **CRITICAL call-outs (would-be bugs caught by the architect pass):**
    (1) **`ownerId` can be the literal `"Joint"`**, not just a member id → store as plain TEXT +
    Zod validation, **NO hard FK** to `members.id` (would throw on every joint-owned asset).
    (2) **`expense_snapshots` lives OUTSIDE the household blob** — separate localStorage key
    `expense-history` via `expense-history.ts`; the ServerAdapter MUST register it explicitly or
    users lose FIRE-trajectory history on migration.
    (3) **Auto-flow derived recurring rows** (`source='auto-loan'/'auto-insurance'`) need
    `UNIQUE(userId, sourceRefId)` + `ON CONFLICT DO UPDATE` or the server duplicates them.
    (4) ServerAdapter `get('household')` JOINs ~10 child tables → reconstruct `Household`;
    `set('household')` diffs → INSERT/UPDATE/DELETE per child table. Optimistic locking
    (`updatedAt`/ETag) deferred to P2 (single-device is the P1 target).
- **Stack: reuse the proven infra, fresh schema.** Hono + Prisma + Postgres + Better Auth,
  pointed at the new `firekaro_v6` DB. Salvages the stack + patterns, drops the data model.
- **API surface (DECISION 2026-05-31, via `feature-dev:code-architect`):** **document endpoints,
  NOT granular REST.** `GET`+`PUT` per entityKey — `/api/planner/{household,assumptions,scenarios,
  features,ui,expense-history}` + `DELETE /api/planner/all` (clearForCurrentUser) + `GET
  /api/planner/me`. **13 endpoints / 7 paths.** Mirrors `StorageAdapter.get/set(key)` 1:1. The
  doc→tables diff runs **server-side** (where data + constraints live), inside one Postgres
  transaction (classify by id: insert/update/delete; `ON CONFLICT(userId,sourceRefId)` for
  auto-flow rows). Keeps the client adapter thin. `apiSuccess`/`apiError` envelope; userId from the
  authenticated session, NEVER the request body. (Granular per-entity REST rejected: the store
  mutates the whole local object + persists it, never per-entity over the wire.)
- **Adapter: `ServerAdapter` behind the existing `StorageAdapter` — WRITE-BEHIND CACHE, interface
  stays SYNCHRONOUS (DECISION 2026-05-31).** Do NOT make `get/set` async — that ripples into ~8
  files + breaks the ~480 tests (they mock `get` sync) AND breaks Vue reactivity (`watch(data,
  persist, {deep:true})` is sync; a Promise there floats on every keystroke). Instead: `ServerAdapter`
  holds an in-memory cache (satisfies the sync contract instantly) + a **per-key 1.5s debounce**
  flush (`PUT`). The ONE async seam is `hydrateAll()` — 6 concurrent GETs at boot, awaited in
  `main.ts` BEFORE mount, so every store `hydrate()` + router guard reads a warm cache
  **synchronously**. **Net: `household.ts`/`assumptions.ts`/`scenarios.ts`/`features.ts`/`ui.ts`/
  `expense-history.ts`/`router/index.ts` are UNCHANGED.** Seams that change: `storage-adapter.ts`
  (add `setAdapter()`/`getAdapter()` singleton, mirroring `setAuthProvider()`), new
  `server-adapter.ts`, `auth-provider.ts` (add `ServerAuthProvider`), `main.ts` (boot sequence).
  The v6 plan's "480-test regression risk" is thereby largely neutralized.
  - **Keystroke storm** → solved by the 1.5s debounce (one PUT after last keystroke), not by API shape.
  - **Tab-close <1.5s loses the edit** (localStorage had no such window) → mitigate with
    `navigator.sendBeacon` flush-on-unload (deferrable to P2).
  - **Server-side diff engine = highest-complexity piece** → unit-test the diff fn directly with
    the Zod schemas as fixtures BEFORE adapter integration, or risk silent data loss.
  - **Add `updatedAt` to every table NOW** (even though P1 = last-write-wins) → makes P2 ETag
    optimistic-locking a 3-line change, not a migration.
- **Auth: Better Auth backs the mvp's `AuthProvider`** (Google sign-in + sessions); every record
  keyed by the real `userId`.
- **Calc stays client-side** for now (already works); server just persists. Revisit only if
  server-authoritative recompute is needed.
- **Outcome:** the planner works for real users, logged in, across devices, on a queryable
  multi-tenant schema.

### Phase 2 — Hardening & security
E2E across the new surfaces; security baseline (encryption at rest, rate-limiting, session
hardening — lifted from the old app); visual-regression lock; real deploy. The "production-ready" gate.

### Phase 3 — Feature parity by *demand*, not wholesale
Explicitly decide which old-app features the product needs (transaction tracking? budgets?
Monte-Carlo? family-as-real-users?) and add one by one. Do **not** port the 58-model ledger wholesale.

### Phase 4 — Cutover
Point the domain at the planner; retire the old app.

---

## 6. Cutover detail — confirm before Phase 1
**Unverified — confirm:** what's *actually live* today. The production-readiness plan says "replace
the **existing** FireKaro deployment," implying a possible **legacy live app with real users**,
while the Vue `src/`+`server/` app appears **not yet deployed** (plan "in progress"). Two cases:
- **No real live users (most likely):** clean cutover — deploy the planner where the old app would
  have gone; nothing to migrate.
- **Live users with data:** add a one-time Phase-4 migration (export → import into the snapshot model).

A quick deploy-state check resolves which case applies before Phase 1's cutover plan is finalized.

### Deploy-state check (2026-05-30) — RESULT: a live FireKaro EXISTS → lean Case 2

Verified by read-only HTTP probe + repo inspection (not by accessing the live app's data):

- **`firekaro.com` and `www.firekaro.com` return HTTP 200** (Cloudflare-fronted), title
  *"FIRE Karo – Financial Independence Planning for Indians"*, meta description *"Tax
  optimization, retirement planning, and investment tracking tailored for Indian investors."*
  Fingerprint: **Next.js / React** (`_next/static`). A real, SEO-indexed FIRE product is
  **live in production today** — this is the "existing deployment" the production-readiness
  plan meant to replace.
- It is a **separate, pre-Vue app**: firekaro.com is **Next.js/React**, whereas every app in
  THIS repo is **Vue/Vite**. So it is neither the mvp planner nor this repo's `src/`+`server/`
  app. And this repo's Vue app was never shipped anyway — its VPS-setup checklist in
  `docs/plans/production-readiness-plan.md` is **0/10 (Phase 2 all unchecked)**, there is **no
  `deploy.yml`**, **no deploy job in `ci.yml`**, and **no deploy/release commits** in git. The
  Vue app was prepared for deploy but never shipped. So firekaro.com is a **separate/legacy**
  FireKaro.
- VPS `103.118.16.189:3003` does not respond on a direct external probe (consistent with
  Cloudflare proxying + a firewalled origin port — not evidence either way).

**Therefore §6's "most likely no real live users" assumption is WRONG — there IS a live app
WITH user data, and Abhay has decided to replace it AND migrate its data into the planner.**

**Confirmed identity (2026-05-30):** firekaro.com = **`D:\Abhay\VibeCoding\FIREKaro`** — a
**Next.js + NextAuth + Prisma/PostgreSQL** app (DB `firekaro_prod`). It is Abhay's own earlier
FireKaro, a **full tax/transaction tracker** with a **~130-model** schema (Account/Session/User
auth, Profile, NetWorth, Portfolio, Expense/Budget, Property+Rental, EPF/NPS, ESOP/RSU equity,
GST/Invoice/business-entity, Forum/Course/Group community platform, FamilyMember/HUF,
Insurance/Bank/CreditCard, FIRE goals/scenarios/milestones, AuditLog, etc.). It **stores
server-side user data** → **a data migration is required** (Abhay's decision: replace the app,
move the data into the planner).

This makes the cutover **Case 2 (live users + data)**, not the clean Case 1. The Phase-1 build
is unchanged, but a **data-migration workstream** is now in scope before/at Phase 4.

**Remaining forks for Abhay (gate the migration design, NOT Phase 1's start):**
1. **Real data volume** — is it effectively just Abhay's own household (+ a handful), or are
   there genuinely many real users? (The "5000 users" was a *target*, not actuals.) Determines
   whether migration is a one-household export or a general N-user pipeline.
2. **Migration fidelity** — the old app has ~130 tables (incl. GST/invoicing/community/forum
   that the planner has NO concept of). Migrate only the **planning-relevant subset** that maps
   to the planner's household model (profile, members, income/salary, investments, EPF/NPS,
   property, loans, insurance, expenses, goals), and **drop** tracker-only data (invoices, GST
   filings, forum posts, courses)? Recommended: yes — map the subset, archive the rest.
3. **Schema/auth on the new side** — confirm Phase-1's snapshot model + Better-Auth choice can
   represent the migrated subset.

**Portfolio-level (TODO(5W)):** "firekaro.com (the Next.js app) is retired and replaced by the
mvp planner; its user data migrates in" is a portfolio-tier commitment — record in
`FW-FireKaro\DECISIONS.md` (L-042). Two FireKaro codebases + this Vue repo now exist; the
canonical-product decision is 5W-tier.

---

## 7. Effort & risk shape (rough)
- **Phase 0:** small (deploy + config).
- **Phase 1:** the real build (backend + auth + adapter + async refactor). Medium — bounded because
  the snapshot model dodges the granular rewrite.
- **Phase 2–3:** scales with how much "real SaaS" you want; gated, controllable.
- **Top risks:** (1) Phase-3 scope creep → demand-gate features; (2) the async-adapter refactor →
  480-test regression lock + the demo staying on the sync path in parallel.

---

## 8. Recommended sequencing from here
1. **Phase 0 demo-deploy goal** — live URL within a short loop; commits you to nothing.
2. **Confirm the live-deployment state** (case 1 vs 2 in §6) so Phase 1 cutover is grounded.
3. **Phase 1 goal** — "v6 backend + login behind the adapter seam (snapshot model)."

Each phase is authored as its own `/goal` contract (separate file, idempotency preflight, the
standard 24/25/26 + TDD gates) when its predecessor is verified.

---

## References
- `docs/TODO-5W-v5-productization-fork.md` — the A/B/C analysis + reconciliation assessment (basis)
- `docs/adr/0001-v5-portfolio-tier-stance.md` — the multi-tenant-ready / swap-the-adapter scaffolding
- `docs/adr/0002-retire-layered-assumption-resolver.md` — canonical flat assumptions model
- `docs/plans/production-readiness-plan.md` — the old app's deploy plan (VPS, 5000 users)
- `docs/audit/v5-implementation-gap-2026-05-30.md` — proof the planner is research-complete
- `mvp/CLAUDE.md` · `mvp/src/lib/storage-adapter.ts` · `mvp/src/lib/auth-provider.ts` — the v6 seam
- `5W-CONTEXT.md` §4 / `5W-PRINCIPLES.md` — FireKaro's portfolio role + the four principles

---

## 9. Target persona & focus (chosen 2026-06-01)

**Primary wedge — the urban salaried accumulator.** Optimize FireKaro hardest for this user first
and let the product stay opinionated around them:

- Age **28–45**, **salaried** in IT / tech / finance / consulting / MNCs
- **Metro / Tier-1**, household income **₹15L–₹1Cr+**, equity-comfortable, English-literate
- Often **DINK or young-family / sandwich-gen** — exactly the seeded **Sharmas / Iyers / Mehtas**

**Basis:** (1) FIRE adoption in India is, observably, an affluent urban-salaried movement, not a
mass-market one — "cover all of India" would dilute a FIRE planner into a commodity budgeting app;
(2) the product is already deepest here; (3) Abhay's own household is the archetype (dogfood + the
5W Financial data-layer role); (4) YAGNI — build for the next real user, not a speculative one.

**Build tiering that follows from the wedge:**
- **Tier 0 — persona-independent, do now:** tax-config staleness guard (no silently-stale/guessed
  FY numbers) + Monte Carlo confidence bands (stop over-stating single-point certainty). Help every
  user regardless of targeting.
- **Tier 1 — deepen the wedge:** Form 16 / CAS import (kill manual-entry friction, honour
  Principle 3), persona-templated onboarding (reuse seeds), salaried/family/DINK polish.
- **Tier 2 — adjacent, after the wedge is excellent:** freelancer (44ADA, partly done), **NRI**,
  **HUF**.
- **Tier 3 — deprioritised (maybe never):** rural / agricultural, vernacular mass-market, pure
  already-retired seniors. Different products.

**Boundary (L-042):** the *market-positioning lock* is a 5 Wealths decision — to be recorded under
`D:\Abhay\VibeCoding\5Wealths\Financial Wealth\FW-FireKaro\DECISIONS.md`. This section is the
repo-side reflection that gates Tier-1/Tier-2 engineering, not the formal portfolio commitment.
`TODO(5W):` ratify "primary persona = urban salaried accumulator; defer NRI/HUF/vernacular/rural."

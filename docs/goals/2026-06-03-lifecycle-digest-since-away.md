# GOAL — In-app "Since you were away" lifecycle digest (Tier-1 stickiness wedge #1)

**Type:** Autonomous build contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below — do not pause to ask; make the call the
contract specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-03 · **Scope:** `src/` (+ ONE additive line in
`server/src/routes/planner.ts`) ONLY
**Invocation:** `/goal docs/goals/2026-06-03-lifecycle-digest-since-away.md`

---

## 0. Mission

Build an in-app **"Since you were away"** lifecycle digest on the FIRE dashboard. On each
visit it diffs the **current `derive()` headline state** against a **persisted baseline
snapshot** and surfaces the *meaningful* changes to the urban-salaried accumulator —
**FIRE-date delta first** ("Your FIRE date moved 8 months earlier — now age 56"), then the
driver (corpus / savings-rate delta), then newly-firing nudges and milestone-band
crossings. It is the rich **in-app destination** the already-built WhatsApp lifecycle nudge
(`server/src/lib/lifecycle-evaluator.ts` → `lifecycle-runner.ts` → `whatsapp-sender.ts`)
will deep-link to once Abhay flips A6 — so the outbound trigger and the in-app payoff are
two halves of ONE loop.

**Done =** a dismissible digest card renders on `/dashboard` (default demo / `LocalStorageAdapter`
path) showing domain-SANE deltas computed from the SAME `derive()` kernel as the headline;
the baseline snapshot round-trips through the storage seam; a pure delta engine +
substance/plausibility specs are green; both trees type-check + test clean.

**This is a fresh build.** Zero outbound sends, zero DPDP comms-consent, zero new spend,
**zero Prisma migration** (the snapshot rides inside the existing `ui` JSON blob). The one
genuinely gated thing — flipping A6 (`WATI_ALLOW_ALL_RECIPIENTS`) so the OUTBOUND WhatsApp
nudge goes live — is **OUT OF SCOPE** for this contract and stays Abhay's spend decision.

---

## 0.2 PREFLIGHT — read first (idempotency · NO duplication)

> **This is the first action of the run, before ANY stage. Non-negotiable.** A parallel
> session may already have implemented part of this. The contract must be **safe to run at
> any time without redoing finished work.**
>
> 1. **There is no single gap-ledger doc in this repo — the ledger is `git log` + the code +
>    GitHub Issues.** Run `git log --oneline -25` and grep for any matching
>    `feat(fire)` / `feat(dashboard)` / `lifecycle-digest` commits.
> 2. **For every artifact this contract creates, confirm absence before building:**
>    - `ls src/lib/lifecycle-digest.ts src/components/dashboard/LifecycleDigestCard.vue`
>      → both MUST be absent (confirmed absent at authoring 2026-06-03). If either now
>      exists, **verify-only** that file against this contract's spec — do NOT rebuild.
>    - `grep -n "lifecycleSnapshot" src/stores/ui.ts server/src/routes/planner.ts` → if
>      already present, the persistence layer is partly done; build only the missing delta.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| FIRE math kernel | `src/lib/derive.ts` (`derive()`, the `FireDerived` return interface) | **The single source of every headline number.** The snapshot + digest deltas MUST be derived from `FireDerived` fields — never recomputed independently (rule 31). Read the return object to get the EXACT field names for FIRE age/year, `fireWithdrawableCorpus`, `fireNumber`, `savingsRate`, and the Monte-Carlo p50. |
| Pinia-aware wrapper | `src/lib/useFireDerive.ts` (`useFireDerive()`) | Exposes the headline fields as computeds (`savingsRate`, `fireNumber`, `currentCorpus`→`fireWithdrawableCorpus`, …). The digest reads `derive()` output via this wrapper inside the dashboard, NOT by re-calling math. |
| Active nudge set | `src/lib/nudge-engine.ts` (`evaluateNudges(ctx: NudgeContext): Nudge[]`, `Nudge.id`) | The digest's "new nudges since last visit" = set-diff of `evaluateNudges` `id`s now vs. in the baseline snapshot. |
| Lifecycle bands (outbound parity) | `server/src/lib/lifecycle-evaluator.ts` (`LifecycleNudgeKey`, milestone bands 25/50/75/100, dedupe keys) | The in-app milestone-band logic MUST mirror this so the in-app digest and the outbound WhatsApp nudge agree on what counts as a milestone crossing. Read it; do not duplicate its server wiring — replicate only the **band thresholds** as a shared constant in the new pure module. |
| UI store (snapshot home) | `src/stores/ui.ts` (`UiPersistedShape` = `{ isFamilyView, viewingMemberId, currentFY }`, `hydrate()`/`persist()`, `watch(...)`) | The baseline snapshot persists as a NEW field on this store's persisted shape — reuses the existing `ui` entity-key seam (localStorage + server). Follow the store's migration-on-hydrate + `watch→persist` conventions (`rules/pinia-store-conventions.md`). |
| Storage seam | `src/lib/storage-adapter.ts` (`get/set(entityKey,…)`, key `firekaro-mvp:<userId>:ui`) | The snapshot persists via the `ui` entityKey ONLY — never a new entity key (a new key would need a new server endpoint + migration). **Zero direct `localStorage.*` outside this file** (CI-enforced invariant). |
| Server `ui` doc | `server/src/routes/planner.ts` (`uiBodySchema` ~line 43; `GET`/`PUT /ui`; backing model `UserUiPrefs.prefs Json`) | Backing column is a **whole-blob `Json`** (`server/prisma/schema.prisma` `model UserUiPrefs`) → storing the snapshot inside `prefs` needs **NO migration**. The ONLY server change is extending `uiBodySchema` with the optional `lifecycleSnapshot` field (additive, one Zod line) so the ServerAdapter doesn't strip it. |
| Dashboard surface | `src/pages/fire-goals/Dashboard.vue` (renders `src/components/dashboard/FireHero.vue`) | Where the digest card mounts — above/near `FireHero`. Read how `FireHero` consumes `useFireDerive()`; match its three-state + vuetify conventions. |
| Date/age helpers | `src/lib/age.ts` (`ageFromDOB`), `src/lib/formatters.ts` (`formatINRCompact`) | For the "since <relative time>" label and INR deltas. `new Date()` is fine here — this is app code, NOT a workflow script. |

**Gotchas:**
- **No `mvp/` tree here.** This is the extracted `firekaro-planner` repo — the active app is
  `src/`+`server/`. Run all `npm` commands from the **repo root** (frontend) and `server/`
  (backend). There is no `cd mvp`.
- **Storage invariant (CI-enforced):** zero direct `localStorage.*` anywhere in `src/`
  outside `storage-adapter.ts`. Persist only through the ui store → adapter.
- **`derive()` is the kernel — never recompute a headline number.** The digest's
  "FIRE date moved X" MUST be `headline_now − snapshot.fireAge`, both from `derive()`.
- **Default lens = whole household** (rule 31 / #22 fix): the snapshot + digest are computed
  on the DEFAULT product lens (no `viewingMemberId`), pooling all earners — never a single
  member.
- **Server change is OPTIONAL to the feature working:** the entire frontend works on the
  `LocalStorageAdapter` demo path with no backend. The `uiBodySchema` line only matters for
  logged-in `ServerAdapter` users; verify it via the DATABASE_URL-gated planner integration
  spec, don't block the UI stages on it.

---

## 2. STAGE A — pure delta engine (`src/lib/lifecycle-digest.ts`)

**File(s):** `src/lib/lifecycle-digest.ts` (create), `src/lib/lifecycle-digest.spec.ts`
(create). **Keep untouched:** `derive.ts`, `nudge-engine.ts`, all server files.

**TDD red-first** (`rules/tdd.md`): write `lifecycle-digest.spec.ts` failing first.

### Pre-made design decisions (do NOT deviate)

1. **Snapshot type** — export
   `interface LifecycleSnapshot { capturedAt: string /*ISO*/; fireAge: number; fireYear: number; currentCorpus: number; fireNumber: number; savingsRatePct: number; milestoneBand: 0|25|50|75|100; activeNudgeIds: string[]; monteCarloP50Age: number | null }`.
   Field values come from `FireDerived` (read `derive.ts` for exact source names; map, don't
   rename the domain meaning).
2. **`captureSnapshot(derived: FireDerived, activeNudgeIds: string[], now: Date): LifecycleSnapshot`**
   — pure builder. `milestoneBand` = largest band ≤ `(currentCorpus/fireNumber)*100` from the
   shared `MILESTONE_BANDS = [0,25,50,75,100]` constant (mirrors `lifecycle-evaluator.ts`).
3. **`computeLifecycleDigest(current: LifecycleSnapshot, baseline: LifecycleSnapshot | null): LifecycleDigest`**
   — pure. Returns
   `{ hasMeaningfulChange: boolean; fireAgeDeltaYears: number; fireDirection: 'earlier'|'later'|'same'; corpusDelta: number; savingsRateDeltaPct: number; newNudgeIds: string[]; milestoneCrossed: 0|25|50|75|100 | null; sinceCapturedAt: string | null }`.
4. **`hasMeaningfulChange` threshold** (avoid noisy digests): true if ANY of —
   `|fireAgeDeltaYears| ≥ 1/12` (≥ ~1 month), OR `|corpusDelta| / max(baseline.currentCorpus,1) ≥ 0.02` (≥2%),
   OR `newNudgeIds.length > 0`, OR `milestoneCrossed !== null`. If `baseline === null` →
   `hasMeaningfulChange: false` (first visit shows nothing; the dashboard captures a silent
   baseline — see Stage C).
5. **`fireDirection`** — a LOWER `fireAge` is `'earlier'` (good). Direction drives card color
   downstream (earlier=success, later=warning) per `rules/vuetify-conventions.md` trend rule.
6. **Pure module — no store/DOM/IO** (`rules/calculation-modules.md`). Monetary outputs
   `Math.round`. Guard every denominator `> 0` (`rules/defensive-coding.md`).

### Stage A acceptance
- `lifecycle-digest.spec.ts` covers: null baseline → no change; sub-threshold edits → no
  change; a ≥1-month FIRE-date improvement → `earlier` + correct delta; a 25%→50% corpus
  ratio → `milestoneCrossed: 50`; a new nudge id → in `newNudgeIds`; zero-division guards.
- `npm run test:unit -- src/lib/lifecycle-digest.spec.ts` green.
- **Stage gate sweep:** static (type-check + test:unit). No UI yet → Rule 24/25 N/A this stage.

---

## 3. STAGE B — persistence (ui store + one server Zod line)

**File(s):** `src/stores/ui.ts` (edit), `src/stores/ui.spec.ts` (extend if present, else
create), `server/src/routes/planner.ts` (edit — `uiBodySchema` ONLY). **Keep untouched:**
`server/prisma/schema.prisma` (NO migration), `storage-adapter.ts`, all other server files.

### Pre-made design decisions (do NOT deviate)

1. **Extend `UiPersistedShape`** with `lifecycleSnapshot: LifecycleSnapshot | null` (import
   the type from `@/lib/lifecycle-digest`). **Migration-on-hydrate:** older persisted blobs
   lacking the field backfill to `null` (`rules/pinia-store-conventions.md`).
2. **Store actions:** `captureLifecycleSnapshot(snapshot: LifecycleSnapshot)` (sets the field
   → `watch`/`persist` fires) and a getter `lifecycleSnapshot`. Add `lifecycleSnapshot` to the
   store's `watch([...], persist)` dependency list so it persists.
3. **Server `uiBodySchema`** — add `lifecycleSnapshot: z.any().nullable().optional()`
   (or a precise `z.object({...}).nullable().optional()` mirroring `LifecycleSnapshot` — prefer
   precise). ONE additive field; the `prefs` `Json` column absorbs it → **no migration**. Do
   not change the `GET`/`PUT` handlers otherwise.
4. **Seam parity:** persists via the `ui` entityKey for BOTH adapters. localStorage:
   `firekaro-mvp:<userId>:ui`. Server: `PUT /api/planner/ui` → `UserUiPrefs.prefs`.

### Stage B acceptance
- `npm run type-check && npm run test:unit` green at **repo root**.
- `cd server && npm run type-check && npm run lint && npm run test:unit` green (the
  DATABASE_URL-gated `planner.integration.spec.ts` round-trips the new field if a DB is set;
  otherwise it auto-skips — that's expected).
- **Rule 25 (persistence) — localStorage round-trip** on the demo path (drive in Stage C
  once the UI writes it; here, a unit assertion that `persist()`→`hydrate()` preserves
  `lifecycleSnapshot` is sufficient).
- **Stage gate sweep:** static both trees. Rule 25 unit round-trip green.

---

## 4. STAGE C — UI (`LifecycleDigestCard.vue` + dashboard wiring)

**File(s):** `src/components/dashboard/LifecycleDigestCard.vue` (create),
`src/pages/fire-goals/Dashboard.vue` (edit — mount the card). **Keep untouched:**
`FireHero.vue` (read it for conventions; do not modify).

### Pre-made design decisions (do NOT deviate)

1. **Component** — `LifecycleDigestCard.vue`, `<script setup lang="ts">`. Consumes
   `useFireDerive()` + `evaluateNudges(...)` + `useUiStore().lifecycleSnapshot`; computes the
   live snapshot via `captureSnapshot(...)`; calls `computeLifecycleDigest(live, baseline)`.
2. **Render only when `digest.hasMeaningfulChange`.** Three-state (`rules/vue-component-conventions.md`):
   content (deltas) / loading (skeleton while `derive()` settles) / empty (no baseline or no
   change → render nothing, or a quiet "You're all caught up" only if a baseline exists).
3. **Layout** — a dismissible `v-card variant="tonal"` ABOVE `FireHero` in `Dashboard.vue`.
   Lead line = FIRE-date delta, headline-first ("Your FIRE date moved **8 months earlier** —
   now age 56"). Sub-lines = corpus Δ (`formatINRCompact`), savings-rate Δ, new-nudge count,
   milestone crossed. Direction-aware color/icon (earlier=`success`/`mdi-trending-down` on
   age, later=`warning`) per the trend-indicator rule. "Since <relative time>" caption from
   `snapshot.capturedAt`.
4. **Dismiss = acknowledge** — the card's close button calls
   `captureLifecycleSnapshot(liveSnapshot)`, re-baselining so the digest only ever shows
   NET-NEW changes next visit (state-delta-driven, honest). No wall-clock "time away" gate.
5. **First-ever load** — if `baseline === null`, mount silently captures the live snapshot
   (no card shown) so the next real change has a baseline to diff against.
6. **Deep-link ready** — accept an optional `?digest=open` query/anchor so the future
   WhatsApp nudge can land directly on the open card. Do NOT build any outbound wiring.
7. **No new deps.** Vuetify + existing helpers only.

### Stage C acceptance (run the §5 gate sweep before committing)
- **Rule 24 (per UI screen):** drive Playwright MCP on `/dashboard` (default demo path).
  To force a visible digest: seed a baseline via `browser_evaluate` writing a prior-state
  `lifecycleSnapshot` into `firekaro-mvp:self:ui`, reload, assert the card renders the
  delta. Screenshot + ARIA snapshot + console (zero NEW errors). Read the PNG.
- **Rule 25 (write path = dismiss/acknowledge):** click dismiss → confirm (a) card hides AND
  (b) `firekaro-mvp:self:ui` `lifecycleSnapshot.capturedAt` advanced to the live capture
  (localStorage round-trip via `browser_evaluate`). Reload → card stays hidden (re-baselined).
- **a11y:** `/a11y-audit` on `/dashboard` — zero Critical+Serious on the new card (or DEFER w/ reason).

---

## 5. STAGE D — substance & plausibility (rule 31, load-bearing)

**File(s):** `src/lib/lifecycle-digest.spec.ts` (extend), and extend the existing
plausibility pattern in `src/lib/headline-plausibility.spec.ts` (read it first — it's the
#22-catching gate).

### Pre-made design decisions (do NOT deviate)

1. **Reconciliation assertion (rule 31 / FinTech end-to-end):** for each seed persona on the
   DEFAULT lens, capture a baseline, apply a realistic edit (e.g. +₹50k/mo SIP), recompute,
   and assert `digest.fireAgeDeltaYears == baselineFireAge − newFireAge` using the SAME
   `derive()` — the digest delta MUST equal the headline movement, never an independent number.
2. **Plausibility bounds:** assert no digest delta is domain-ABSURD — a single realistic edit
   must NOT move the FIRE date by > ~5 years, corpus delta sign must match the edit direction,
   and `milestoneCrossed` only fires on a real band crossing. Mirror the
   `headline-plausibility.spec.ts` per-persona structure.
3. **Default==family parity:** the digest computed on the default lens equals the digest on
   the explicit all-household lens (no single-earner division — #22 invariant).

### Stage D acceptance
- New substance specs green; `npm run test:unit` (root) no regression on the full 681+ suite.
- **Stage gate sweep:** static both trees + Rule 26 (below).

---

## 6. Verification gates (all 26 rules in `.claude/rules/claude-behavior.md` operative)

> **Rules 24, 25, 26 are MANDATORY gates at every task AND stage boundary.** Do not skip,
> soften, or defer the sweep. They are why this contract yields *proven-working* output.

**Tree-specific mechanics (adapted to the root `src/`+`server/` tree):**
- **Static gates (frontend, CWD = repo root):** `npm run type-check && npm run test:unit && npm run build`.
- **Static gates (backend, CWD = `server/`):** `npm run type-check && npm run lint && npm run test:unit`.
- **Rule 24** — Playwright MCP on `http://localhost:5175/dashboard` (self-heal: `npm run dev`
  once if down). Screenshot + `browser_snapshot` (ARIA) + `browser_console_messages`. All
  three pass; PNG read + confirmed; zero NEW console errors. ≤3 iterations → `/fix-loop` →
  `/systematic-debugging`.
- **Rule 25** — persistence signal is the **localStorage round-trip** on the default demo
  path: `browser_evaluate` reading `firekaro-mvp:<userId>:ui` confirms `lifecycleSnapshot`
  shape/values (per `src/lib/storage-adapter.ts`). Server path (ServerAdapter) confirmed via
  the DATABASE_URL-gated `server/src/routes/planner.integration.spec.ts` round-trip +
  optionally `curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/ui`. UI-only
  (card hides) does NOT count.
- **Rule 26** — post-phase independent + cross-page sweep: the digest reads the SAME
  `derive()` headline that `FireHero` shows — confirm the digest's "now age N" equals the
  `FireHero` headline age on the same screen (±0). The snapshot in `ui` must not perturb the
  existing `isFamilyView`/`currentFY` ui fields (re-read the ui blob after a dismiss). 3
  reconcile cycles → `/systematic-debugging` → DEFERRED-with-reason if unresolved.
- **Rule 15** — test failures route to `/fix-loop` (known retest) / `/systematic-debugging`
  (unclear). No ad-hoc retry ≥3×.
- **Rule 17** — root cause over patch. **Rule 20** — no fake data; surface uncertainty as
  `**Assumption:** X`. **Rule 23** — run to the full DoD; context-budget anxiety is not a stop.

**Failure-recovery budget:** per-task ~15 attempts (≈5 inline → `/fix-loop` →
`/systematic-debugging`) → DEFER the task, continue. MCP hang: 3 cycles (wait+retry →
close+re-navigate → kill+restart dev server) → DEFERRED. **Hard halts ONLY:** `npm install`
failure, in-contract decision contradiction, irrecoverable build break after full budget, OS
denial, missing token. Context-budget is NOT a halt — hand off via a one-line continuation note.

---

## 7. Commit + push

Four atomic conventional commits (one per stage), scope `fire` / `dashboard`:
1. `feat(fire): pure lifecycle-digest delta engine — derive()-grounded "what changed" (Stage A)`
2. `feat(fire): persist the lifecycle baseline snapshot in the ui blob (no migration) (Stage B)`
3. `feat(dashboard): "Since you were away" digest card on the FIRE dashboard (Stage C)`
4. `test(fire): substance + plausibility lock for lifecycle-digest deltas (rule 31) (Stage D)`

Stage files ONLY (NEVER `git add -A`). **Do NOT stage the ~10 untracked `*.png`
verification artifacts** in the working tree, nor the unrelated `M`-modified files unless
this contract touched them. End each message with the
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

**Branch + push:** work on `main`; commit per stage. **Push to `origin` after the full DoD
is green** (everyday git is autonomous per `decision-authority.md`). Do NOT deploy, do NOT
flip A6, do NOT run any prod migration.

---

## 8. Definition of Done (all MUST be true)

**Build:**
- [ ] `src/lib/lifecycle-digest.ts` + spec; `LifecycleSnapshot` rides the `ui` blob (no migration); `LifecycleDigestCard.vue` mounted on `/dashboard`; `uiBodySchema` extended one line.
- [ ] Digest renders on the demo path with a seeded baseline; dismiss re-baselines; first load captures silently; renders nothing when no meaningful change.

**Static gates:**
- [ ] Root: type-check 0 errors · `test:unit` no regression (≥681 green) · `build` succeeds.
- [ ] `server/`: type-check 0 · `lint` 0 · `test:unit` green.

**Rule 24:** screenshot + ARIA + console on `/dashboard` pass; PNG read; zero NEW console errors.
**Rule 25:** dismiss → localStorage `ui.lifecycleSnapshot.capturedAt` advanced (round-trip confirmed); server round-trip green where DATABASE_URL set.
**Rule 26:** digest "now age N" equals the `FireHero` headline age on-screen; ui blob's other fields intact.
**Rule 31 (substance):** per-persona reconciliation (`digest delta == headline movement`) + plausibility bounds + default==family parity all green.
**a11y:** zero Critical+Serious WCAG 2.1 AA on the new card (or DEFERRED w/ reason).
**Ship:** 4 conventional commits pushed to `main`; deferrals (if any) in `docs/goals/.run/lifecycle-digest-since-away-DEFERRED.md`.

---

## 9. Final report (required on completion)

Commit SHAs + per-stage gate results; Rule 24 verdict + PNG paths; Rule 25 round-trip
verdict (localStorage + server); Rule 26 headline-parity result; Rule 31 per-persona
reconciliation table; a11y summary; DoD green/amber/red tally; "skipped (already covered)"
list from §0.2; any DEFERRED entries with rule status + reason; and a one-line note that the
**A6 outbound flip remains Abhay's out-of-scope spend decision** (this digest is its in-app
destination).

---

## 10. Guardrails (hard stops)

- **`src/` + the single `uiBodySchema` line in `server/src/routes/planner.ts` ONLY.** Never
  touch `server/prisma/schema.prisma` (no migration), `demo/`, `.claude/`, or
  `D:\Abhay\VibeCoding\5Wealths\`.
- **No new dependencies.**
- **No design reinvention** — reuse `useFireDerive`, `evaluateNudges`, `derive()`, the ui
  store seam, vuetify conventions. Extend over inline.
- **No outbound, no DPDP comms-consent, no spend, no deploy, no A6.** If a stage seems to
  need any of these, STOP — it's out of scope; the contract is wrong, not the boundary.
- **Honesty (rule 20/31):** every digest number traces to `derive()`. No synthetic deltas.
  Flinch at an absurd delta and root-cause it, don't ship it.
- **Stop only on a true blocker** (§6). Context-budget anxiety is NOT a blocker — hand off
  via a one-line continuation note, never fake-complete.
- **Strategic items are `TODO(5W):` notes** — repo-level work only.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Which Tier-1 wedge | In-app "since you were away" lifecycle digest (return-stickiness amplifier, fully in-authority) — not more outbound (already built, A6-gated), not Form16/CAS (objective-0 activation) |
| 2 | Snapshot persistence home | Inside the existing `ui` JSON blob (`UserUiPrefs.prefs`) → **zero Prisma migration**; one additive `uiBodySchema` Zod line for ServerAdapter parity |
| 3 | New entity key? | NO — reuse the `ui` entityKey; a new key would force a new server endpoint + migration |
| 4 | Delta source | `derive()` kernel ONLY — digest delta == headline movement (rule 31); never an independent recompute |
| 5 | Re-baseline trigger | State-delta-driven: capture on dismiss/acknowledge + silent first-load capture (honest; only shows net-new change) — not a wall-clock "time away" gate |
| 6 | Lens | DEFAULT (whole household, all earners pooled) — never a single member (#22 invariant) |
| 7 | Surface | Dismissible `v-card` above `FireHero` on `/dashboard`; deep-link-ready for the future WhatsApp nudge; NOT a new route |
| 8 | Outbound / A6 | OUT OF SCOPE — Abhay's spend decision; this digest is its in-app destination only |

---

## References (loaded transitively)

- `rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 31
- `rules/output-plausibility-verification.md` — substance-not-shape (rule 31)
- `rules/goal-anchored-decisions.md` — wedge serves the locked persona + Tier-1 stickiness
- `rules/tdd.md` · `rules/calculation-modules.md` · `rules/defensive-coding.md`
- `rules/pinia-store-conventions.md` · `rules/vue-component-conventions.md` · `rules/vuetify-conventions.md`
- `rules/api-envelope-pattern.md` · `rules/hono-route-conventions.md` (the `uiBodySchema` edit)
- `src/lib/storage-adapter.ts` (seam) · `src/lib/headline-plausibility.spec.ts` (the gate pattern to extend)
- Skills the run may drive: `/fix-loop`, `/systematic-debugging`, `/a11y-audit`, `/auto-verify`

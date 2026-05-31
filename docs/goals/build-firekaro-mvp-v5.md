# Build FireKaro MVP — v5 (Research-Grounded Sandwich-Gen FIRE Planner)

**Type:** `/goal` contract — autonomous, single-run, exhaustive, full-quality-bar
**Invocation:** `/goal docs/goals/build-firekaro-mvp-v5.md`
**Author:** Captured 2026-05-27 → 2026-05-28 via 4-skill sequence (`/zoom-out` → `/improve-codebase-architecture` → `/grill-with-docs` → `/to-prd`)
**Supersedes:** NONE — extends `docs/goals/build-firekaro-demo-v4.md` by transitioning FireKaro from *demo-grade* to *MVP-grade* in a new isolated `mvp/` folder
**Sources of truth (READ ALL BEFORE EXECUTION):**
- `docs/audit/demo-v4-vs-research-audit.md` — 1722 lines, 36-entry research audit + R1+R1.4+R2 cross-cutting rules
- `docs/audit/demo-v5-action-items.md` — 215 sequenced MVP-1 actions across 8 (now 9) Phases
- `docs/audit/preferences-page-spec.md` — `/preferences` page schema (10 sections)
- `docs/adr/0001-v5-portfolio-tier-stance.md` — ADR-0001 multi-tenant-ready architecture
- `CONTEXT.md` — project glossary (Sandwich-gen, Plan-to age, FIRE number, SWR, Family layer, Statutory fact, Planning assumption, userId)
- `docs/research/fire-india/` — 6-chapter research evidence base (60+ sources)
- `5W-CONTEXT.md` + `5W-PRINCIPLES.md` + `5W-GLOSSARY.md` — portfolio framing
- `docs/goals/build-firekaro-demo-v4.md` — v4 predecessor (format template; v5 follows the same autonomy + rule + DoD pattern)

**Process bar:** All 26 rules in `.claude/rules/claude-behavior.md` operative. **Rules 24, 25, 26 are mandatory gates at every task + every stage boundary** (carries forward from v4).

**MVP-grade vs demo-grade criteria (the "demo → mvp" naming shift):**
- **Demo-grade (v4):** UI polish for portfolio + investor review · 3 illustrative seeds · localStorage with no abstraction · no auth concept · single-user implicit
- **MVP-grade (v5):** Research-grounded math · multi-tenant-ready architecture per ADR-0001 · 4 illustrative seeds (dual-persona sandwich-gen + DINK + empty) · feature-gated UI for non-overwhelming first-run · `/preferences` as canonical assumption home · evaluated standalone before incorporation

**Primary user (Q2-locked, dual-persona spectrum):** Indian working professional in the **sandwich-gen** demographic (per `CONTEXT.md`) — age 28-40 (median ~33 per research Ch 02 §2.9), income ₹25-80L/yr, simultaneously supporting children's education AND aging parents. Spans median-33 (Sharmas seed) through late-30s (new "Iyers" seed per Q7).

**Portfolio-tier stance (ADR-0001):** v5 runtime ships as single-user personal evaluator (localStorage on Abhay's machine). v5 *code* is multi-tenant-ready by design — every entity carries a `userId` placeholder (constant `'self'`), storage is abstracted behind adapter interfaces, AuthProvider is stubbed. v6 commercial SaaS becomes a swap-the-adapter + plug-in-auth exercise, not a rewrite.

**Isolation invariant (Decision 1):** All file writes go to `mvp/`, `docs/audit/`, `docs/adr/`, `docs/goals/`, `CONTEXT.md`. **NEVER modify** `src/`, `server/`, `prisma/`, `e2e/`, `.claude/`, or existing `demo/` files. The v4 demo continues to live unchanged at `demo/` and remains the v4 reference implementation.

---

## §0. Autonomy mode (READ FIRST — operative for the entire run)

**Abhay may or may not be available during the run.** The goal executes unattended end-to-end. Directives carry forward from v4 with v5-specific extensions:

1. **DO NOT ASK clarifying questions during the run.** Every substantive design fork is resolved in §1 (locked decisions) + §2 (cross-cutting rules) + the source artifacts in the header. If tempted, re-read the relevant section — the answer is there.
2. **DO NOT relitigate locked decisions.** The 9 locked architectural decisions (§1.1), 5 zoom-out altitude-gaps (§1.2), 6 architectural concerns (§1.3), and 7 grill resolutions (§1.4) are immutable for this run.
3. **Take routine implementation calls yourself** per `feedback-take-judgment-call`.
4. **No `AskUserQuestion` calls.** If a tool insists on asking, default to "Recommended" option.
5. **If a TRULY blocking issue surfaces** (Vue/Vuetify version conflict, OS-level permission denied, npm install fails after 3 retries, a locked-decision contradicts itself), halt cleanly with a final brief per §13.
6. **Periodic progress briefs** every ~30-60 min per `feedback-periodic-progress-briefs`. Briefs to stdout. Include: tasks completed since last brief · current stage · DEFERRED entries added · ETA to next stage.
7. **All file writes inside `mvp/`** (per Decision 1 isolation) plus the audit/contract artifacts listed in the header.
8. **Maintain a TaskCreate-tracked task list** throughout the run per rule 14. Mark tasks `in_progress` on start, `completed` on per-task gate green.
9. **Local commits per task — no push, no PR** (rule 6 adapted): after each task's gate passes, commit locally with `feat(mvp-v5): <stage>.<task> — <description>`. NEVER `git push`, NEVER `gh pr create`. EXCEPTION: Stage X (Vercel deploy) is the ONLY stage that pushes to remote — only after explicit user opt-in OR if a `VERCEL_TOKEN` env var is present at run start.

10. **OVERNIGHT AUTONOMY HARDENING** (carries from v4 §0(10) verbatim, scoped to v5):
    - **MCP browser hang recovery** — 3 cycles (wait 10s + retry → browser_close + navigate → kill dev server + restart). All 3 fail → log to `mvp/DEFERRED-v5.md` with reason → mark `completed (deferred)` → continue.
    - **WebFetch / WebSearch failure recovery** — use baseline knowledge from source artifacts. Log to DEFERRED.
    - **Rule 26 stage-boundary reconciliation budget** — 3 reconcile cycles per stage. Failure → log to DEFERRED with `Rule 26 stage drift` reason → proceed with degraded state noted.
    - **Per-task budget exhaustion** — 15 attempts per task → DEFERRED, not halted.
    - **A11y / Lighthouse gate failures** — 3 fix attempts → DEFERRED, not blocking.
    - **Vercel deploy failure (Stage X)** — 3 retries → defer to morning manual deploy; produce deploy-ready artifact regardless.
    - **Final report on wake** — required per §13.
    - **The 4 hard halts in §12 still apply.**

11. **5W-PRINCIPLES alignment (mandatory check at every Phase gate):**
    - **Principle 1 (Productize, no Abhay-only patches):** Every feature must work for a hypothetical "user #2" identical in shape to Abhay. No hardcoded names, emails, accounts, family identifiers.
    - **Principle 2 (Scale to all users from day one):** ADR-0001 implementation must be live by end of Phase 0. Every entity carries `userId`; storage goes through an adapter; features key by `userId`.
    - **Principle 3 (Automate everything — minimize manual input):** The 6-section onboarding questionnaire MUST include a "Skip — show me everything" affordance that degrades gracefully to full-feature exposure. Auto-derive what can be derived (family-layer inflation bucket auto-routes by `kind`; allocation auto-derives from holdings; deductions auto-sum from user data).
    - **Principle 4 (Continuously update from any signal):** Cross-section data flow is live (income changes → tax planning recomputes; investment changes → FIRE Dashboard recomputes). Reactive recompute is mandatory per A4.8.

---

## §0.5 — `claude-behavior.md` rule compliance (all 26 rules operative)

**Rules 24, 25, 26 highlighted — explicit Abhay mandate carries forward from v3+v4.**

| Rule | Applies as-is? | Adaptation for v5 |
|---|---|---|
| 1. Plan Before Coding | Yes | This contract IS the plan. Re-read before each task. |
| 2. Break Large Tasks | Yes | Tasks ≤3 files. |
| 3. Risk & Uncertainty Assessment | Yes | Note 2-3 break risks in commit body after non-trivial writes. Flag **Assumption:** lines. |
| 4. Verification | Yes | Per-task gate iterates until green per §11. |
| 5. Self-Improving Rules | Partial | Don't propose rule changes during run. Log candidates to `mvp/POST-RUN-NOTES-v5.md`. |
| 6. Git Checkpoints | Adapted | Local commits per task. **NO push, NO PR** — except Stage X Vercel deploy. |
| 7. No Redundant Comments | Yes | Only WHY comments where non-obvious. |
| 8. No Catch-All Files | Yes | Lib modules named after concept (`cashflow.ts`, `investment-traits.ts`), never `utils.ts`. |
| 9. Keep Files Focused | Yes | Split >300-line files unless test fixtures / generated. |
| 10-13 | Yes | Bash syntax, conventions, code quality, autonomous bug fixing as v4. |
| 14. Task Tracking | Yes | TaskCreate per stage. |
| 15. Test Failures → Use Skills | Yes | /fix-loop, /systematic-debugging, /learn-n-improve per failure class. |
| 16-23 | Yes | KISS, no laziness, senior standards, honesty, scope discipline, YAGNI, measure-before-optimize, standing directives. |
| **24. UI Change Screenshot Verification** | **Yes — mandatory at every UI task** | Playwright MCP: navigate → screenshot → ARIA snapshot → console_messages. 3 attempts max → /fix-loop. |
| **25. UI→DB Persistence Verification** | **Yes — mandatory at every UI-driven persist** | Network observation + independent API confirm. Both signals MUST pass. 3 attempts max → /fix-loop. |
| **26. Post-Phase Independent Verification** | **Yes — mandatory at every Phase boundary** | Rule 24+25 dual-signal sweep across all mutated resources. Cross-page consistency check. 3 reconcile cycles → DEFERRED. |
| Process contracts | Cross-ref | `docs/goals/autonomous-issue-loop.md` (bug-triage flow) and `docs/goals/manual-ui-narration-walkthrough.md` (UI review flow) are operative process artifacts; this contract assumes them when triggered. |

---

## §1. Locked decisions (immutable for this run)

### §1.1 — 9 architectural decisions (locked 2026-05-28 via constraints session)

1. **mvp/ folder** isolated from `demo/` and `src/` (`mvp/` is a sibling of `demo/`)
2. **Contract** at `docs/goals/build-firekaro-mvp-v5.md` (this file)
3. **Hybrid feature-gating** — always-12-sidebar + 6-section onboarding questionnaire
4. **Multi-step wizard UX** for the onboarding questionnaire (reuses v4 Wizard pattern at `mvp/src/pages/Wizard.vue`)
5. **Truly-hidden gated content** + context-aware "Looking for X? Enable in Preferences →" discovery footer
6. **Clone v4 → strip → extend baseline** — clarified per Q6: weave multi-tenant rework into Phase 0 stages (not "minimal strip"; strip v4's single-user patterns alongside v4-specific files)
7. **Inherit v4 UI/UX fully** — only audit-mandated changes apply (microcopy per Entry #32, new routes, new components)
8. **9 Phases × ~22 Stages structure** (Phase 0 added via /improve-codebase-architecture)
9. **Ratify after each Phase** (autonomy mode + final brief, not interactive during run)

### §1.2 — 5 zoom-out altitude-gaps (incorporated)

1. **demo→mvp naming shift** — surfaced in this preamble (MVP-grade criteria)
2. **Portfolio-tier silence resolved** — ADR-0001
3. **v4 P.4-P.6 deploy handling** — v5 ships independent `/mvp` URL on Vercel (Stage X). v4's Vercel deferral does NOT block v5.
4. **Process-contract cross-refs** — §0.5 row "Process contracts" cross-references `autonomous-issue-loop.md` + `manual-ui-narration-walkthrough.md`
5. **5W-PRINCIPLES alignment statement** — §0 directive #11

### §1.3 — 6 architectural concerns (incorporated)

From `/improve-codebase-architecture` HTML report (2026-05-28):

| # | Concern | Phase | Lands as |
|---|---|---|---|
| 1 | Investment polymorphism flat-schema | Phase 0 | Stage A2: `lib/investment-traits.ts` + `InvestmentRecord` discriminated union |
| 2 | `useFireDerive` god composable | Phase 2 | Stage C: `lib/derive.ts` kernel split |
| 3 | Money has no type; frequency string-conv | Phase 0 | Stage A1: `lib/cashflow.ts` + frequency enum standardization |
| 4 | Assumption store no override layer | Phase 0 | Stage A3: `lib/assumption-layers.ts` + Global/Household/Scenario resolver |
| 5 | autoFlow* in store (deferred MVP-2 + split-by-vintage per Q3) | Phase 2 | Stage E: `lib/derived-records.ts` for NEW family-layer flows only |
| 6 | No feature-flag seam | Phase 0 | Stage A4: `lib/features.ts` + `useFeatures()` composable |

### §1.4 — 7 grill resolutions (incorporated)

| Q | Resolution | Where it lands |
|---|---|---|
| Q1 | Portfolio-tier: multi-tenant-ready architecture, personal-eval runtime | ADR-0001 + Phase 0 Stage A5 |
| Q2 | Primary user: dual-persona sandwich-gen (median-33 + late-30s) | CONTEXT.md + Phase 8 Stage V (new "Iyers" seed) |
| Q3 | autoFlow* deferral split by vintage | Phase 2 Stage E |
| Q4 | /preferences UX: section-anchored single route + sticky nav | Phase 3 Stage G addendum |
| Q5 | A1.7 income-bucket method deferred to MVP-2 | Removed from Phase 2; glossary stub stays MVP-1 |
| Q6 | Multi-tenant rework woven into Phase 0 stages | All Phase 0 stages built ADR-0001-compliant from inception |
| Q7 | Add 4th seed (late-30s sandwich-gen "Iyers"); keep Mehtas | Phase 8 Stage V |

---

## §2. Cross-cutting rules (operative throughout)

**R1 — Default + Override (from audit doc preamble):**
- **R1.1** Every planning assumption ships with a research-defensible default AND a user-editable override.
- **R1.2** All overrides live on a single canonical `/preferences` page (full route, not a panel).
- **R1.3** Surfaces that USE an assumption display the resolved value read-only with a `?` deep-link to the corresponding row on `/preferences`.
- **R1.4** Statutory facts (tax slabs, statutory limits, regulatory rules, statutory rates, government-set indices and interest rates) are read-only on `/preferences`, displayed with source + version + FY, and **NEVER user-editable — even within What-If or scenario modes**.
- **R1.5** Every overridable assumption has a "Reset to default" affordance both per-row AND a global "Reset all assumptions to research defaults" button.

**R2 — Verify Before Propose:**
Before issuing any verdict or action item that proposes structural changes (new routes, new components, new schema fields, new tabs, new sections, new functions), read the actual `mvp/` (and v4 reference at `demo/`) implementation in code. No proposals based on inferred structure.

**5W-PRINCIPLES alignment** (§0 directive #11) — operative at every Phase gate.

---

## §3. Phase 0 — Architectural foundation (NEW vs v4)

**Goal:** Land cleanly-separated foundational modules that every subsequent Phase consumes. Each module is ADR-0001-compliant from inception (multi-tenant-ready architecture).

**Phase ratification gate:** Phase 0 complete when all 6 stages green, `mvp/` scaffold runs `npm run dev` cleanly, all foundational lib modules have unit-test coverage ≥80%, no Phase 1 work has begun.

### Stage A0 — Scaffold `mvp/` (clone → strip → multi-tenant rework)

**Deliverables:**
- `mvp/` directory at repo root (sibling to `demo/`)
- Cloned from `demo/` with v4-specific artifacts stripped (`demo/.audit-evidence/`, `demo/.research/`, `demo/v4-FINAL-BRIEF.md`, `demo/DEFERRED-v4.md`, visual baseline `*.spec.ts-snapshots/`, evidence dirs)
- v4 single-user patterns stripped: direct `localStorage.getItem/setItem` calls removed from stores (will be re-added via adapter in Stage A5)
- `mvp/README.md` written explaining: this is the MVP build per `docs/goals/build-firekaro-mvp-v5.md`, independent of v4 demo at `demo/`
- `mvp/package.json` with project name `firekaro-mvp`, port 5175 (5173=production, 5174=v4 demo, 5175=v5 mvp)
- `mvp/vite.config.ts` with port + base path configuration
- Dev server runs cleanly on 5175

**DoD:**
- [ ] `mvp/` exists, builds cleanly via `npm install && npm run dev`
- [ ] No imports reference `demo/` or `src/` (verified via grep)
- [ ] localStorage direct access points identified and commented out (re-added in A5)
- [ ] Commit: `feat(mvp-v5): A0 — scaffold mvp/ via clone+strip`

### Stage A1 — `lib/cashflow.ts` (Concern #3 — Cashflow value object)

**Deliverables:**
- `mvp/src/lib/cashflow.ts` exports:
  - `Cashflow = { amount: number; period: 'M' | 'Q' | 'A' }`
  - Pure functions: `toMonthly(cf)`, `toAnnual(cf)`, `inflate(cf, years, rate)`, `add(...cfs)`
- Schema enum standardization: all `frequency` fields in `mvp/src/types/household.ts` use `'M' | 'Q' | 'A'` (no `"monthly" | "annual"` variant — that v4 convention is removed)
- Existing v4 helpers (`recurringToMonthly`, `monthlyOrAnnualToAnnual`) deleted from their 5 duplicate sites; all consumers import from `lib/cashflow.ts`
- Unit tests covering: monthly→annual, quarterly→annual, inflation compounding, sum across periods

**DoD:**
- [ ] `lib/cashflow.ts` exists with all 4 pure functions
- [ ] Zero references to `recurringToMonthly` / `monthlyOrAnnualToAnnual` outside `lib/cashflow.ts`
- [ ] Frequency enum is `'M' | 'Q' | 'A'` everywhere in schemas
- [ ] Unit tests pass (≥80% coverage on the module)
- [ ] Commit: `feat(mvp-v5): A1 — lib/cashflow.ts + frequency enum standardization`

### Stage A2 — `lib/investment-traits.ts` (Concern #1)

**Deliverables:**
- `mvp/src/types/household.ts` `Investment` schema converted to discriminated union `InvestmentRecord` keyed by `type` discriminator
- Per-type schemas: `StocksHolding`, `MutualFundsHolding`, `EsopHolding`, `NpsHolding`, `RealEstateHolding`, `GoldHolding`, `FdHolding`, `CryptoHolding`, `EpfVpfHolding`, plus NEW `InternationalHolding` + `ReitHolding` (per audit Entry #18 + #20)
- `mvp/src/lib/investment-traits.ts` exports:
  - `liquidity(inv): 'liquid' | 'moderate' | 'illiquid'`
  - `expectedReturn(inv, assumptions): number`
  - `taxBucket(inv): 'EEE' | 'EET' | 'ETT' | 'slab'`
  - `inflationRoute(inv): 'general' | 'healthcare' | 'education' | 'housing'`
  - `accumulationRule(inv)` and `withdrawalRule(inv)` (stub interfaces; bodies in Phase 2)
- Every consumer of v4's `Investment` flat schema migrated to consume traits via `lib/investment-traits.ts`

**DoD:**
- [ ] `InvestmentRecord` discriminated union in `types/household.ts`
- [ ] `lib/investment-traits.ts` exports all 6 trait functions
- [ ] Zero inline `switch (inv.type)` outside `lib/investment-traits.ts`
- [ ] Unit tests cover all 12 per-type behaviors
- [ ] Commit: `feat(mvp-v5): A2 — investment-traits seam + discriminated union`

### Stage A3 — `lib/assumption-layers.ts` (Concern #4 + R1)

**Deliverables:**
- `mvp/src/lib/assumption-layers.ts` exports:
  - `AssumptionMap` — typed key-value of all overridable planning assumptions (SWR, inflation per bucket, returns per investment type, Plan-to age per member, etc.)
  - `AssumptionLayer = { id: string; scope: 'global' | 'household' | 'scenario'; userId: string; values: Partial<AssumptionMap> }`
  - `resolveAssumption<K extends keyof AssumptionMap>(key: K, layers: AssumptionLayer[]): AssumptionMap[K]` — scenario > household > global priority
  - `assumptionDefaults: AssumptionMap` — research-grounded defaults from audit (SWR by horizon, inflation 4-bucket, return per type, etc.)
- v4's `useAssumptionsStore` rewritten to consume layers: global defaults from `assumptionDefaults`, household overrides from `/preferences`, scenario overrides from WhatIf
- `swrOverride` field deleted (replaced by household layer)

**DoD:**
- [ ] `AssumptionMap` typed; defaults populated from audit research values
- [ ] Resolver respects scope priority; unit-tested across all 3 scopes
- [ ] No inline `if (assumptions.swrOverride)` patterns remain
- [ ] Commit: `feat(mvp-v5): A3 — assumption layers + resolver (R1 runtime mechanism)`

### Stage A4 — `lib/features.ts` (Concern #6 — feature registry)

**Deliverables:**
- `mvp/src/lib/features.ts` exports:
  - `Feature = { key: string; defaultEnabled: boolean; gateQuestion: string; questionnaireSection: 1|2|3|4|5|6; routes: string[]; sidebarSection?: string; discoveryCopy?: string; dependsOn?: string[] }`
  - `featureRegistry: Feature[]` — populated with all gateable features per audit (Stocks, MF, NPS, EPF, ESOP, RE, REIT, Gold, FD, Crypto, International, SCSS, Sukanya, Home loan, Personal loan, CC, Car loan, Health insurance, Life insurance, Vehicle insurance, Parents bucket, Education target, Marriage event, Extended-contingency, Coast FIRE, Barista FIRE, Stress testing, Estate planning, Sandwich-gen tax nudges, Income-bucket method [glossary stub only — deferred MVP-2])
  - `useFeatures(userId: string)` composable exposing `isEnabled(key)`, `enable(key)`, `disable(key)`, `enableAll()`, `disabledFeatureKeysForRoute(routeName)`
- `mvp/src/stores/features.ts` Pinia store backed by localStorage adapter (per Stage A5), keyed by userId
- Vue Router `meta.feature` field defined for routes that gate on a feature
- Router-level guard hides routes with disabled features (404 or redirect to /preferences)

**DoD:**
- [ ] `lib/features.ts` + `featureRegistry` with ≥30 features defined
- [ ] `useFeatures()` composable signature stable + tested
- [ ] Router guard redirects disabled-feature routes
- [ ] Commit: `feat(mvp-v5): A4 — features registry + useFeatures composable`

### Stage A5 — `lib/storage-adapter.ts` + AuthProvider stub (ADR-0001)

**Deliverables:**
- `mvp/src/lib/storage-adapter.ts` defines adapter interfaces:
  - `StorageAdapter` (generic) with `get<T>(key)`, `set<T>(key, value)`, `remove(key)`, `clear()`
  - `LocalStorageAdapter implements StorageAdapter` — wraps `localStorage`, namespaces by `userId` (e.g., key `firekaro-mvp:${userId}:household`)
- `mvp/src/lib/auth-provider.ts`:
  - `AuthProvider` interface with `getCurrentUserId(): string` and `isAuthenticated(): boolean`
  - `LocalAuthProvider implements AuthProvider` — returns `'self'` constant; `isAuthenticated()` returns `true`
- All Pinia stores (`household`, `ui`, `assumptions`, `scenarios`, `features`) migrated to consume `StorageAdapter` and `AuthProvider`
- Zero direct `localStorage.getItem/setItem` calls outside `lib/storage-adapter.ts`

**DoD:**
- [ ] Adapter interfaces typed; LocalStorageAdapter passes all store integration tests
- [ ] Every entity in schemas carries `userId: string` field (default `'self'` in seeds)
- [ ] `AuthProvider.getCurrentUserId()` returns `'self'` in v5 runtime
- [ ] Grep for `localStorage\.` outside `lib/storage-adapter.ts` returns zero hits
- [ ] Commit: `feat(mvp-v5): A5 — storage-adapter + AuthProvider stub (ADR-0001)`

**Phase 0 ratification:** All 6 stages green · `mvp/` dev server runs · all lib modules unit-tested · Rule 26 cross-page sweep clean.

---

## §4. Phase 1 — Schema foundation

**Goal:** All schema extensions per audit ride along on the multi-tenant-ready foundation from Phase 0.

### Stage B — Schema extensions (17+ fields per audit + Phase 0 dependencies)

**Deliverables (per `docs/audit/demo-v5-action-items.md` Phase 1 table):**
- `Member.planToAge?: number` (default 90 per Entry #1 A1.2)
- `Member.userId: string` (ADR-0001)
- `recurringExpenseLine.inflationBucket: 'general'|'healthcare'|'education'|'housing'` (Entry #3 A3.6)
- `recurringExpenseLine.kind: 'general'|'parents'|'extended-contingency'|'medical'` (Entry #6 A6.1 + Entry #10 A10.2)
- `plannedFutureLine.inflationBucket: ...` (Entry #3 A3.6)
- `plannedFutureLine.kind: 'general'|'education'|'marriage'|'medical'` (Entry #6 A6.2 + Entry #10 A10.3)
- `householdSchema.extendedFamilyContingencyPercent: number` (default 7.5%, Entry #6 A6.3)
- `householdSchema.healthcareCorpusReservationPercent: number` (default 20%, Entry #10 A10.1)
- `householdSchema.glidePath: GlidePathConfig` (Entry #7 A7.1)
- `InvestmentRecord.bucket?: 1|2|3|4` (Entry #8 A8.1)
- New investment types: `International` (Entry #18 A18.1) + `REIT` (Entry #20 A20.3)
- `InvestmentRecord.internationalRoute?: 'FoF'|'LRS-Direct'|'GIFT-City'` (Entry #18 A18.1)
- `InvestmentRecord.realEstateRole?: 'PrimaryResidence'|'Investment'|'Inherited'` (Entry #20 A20.1)
- `InvestmentRecord.grantorCountry?: 'India'|'US'|'Other'` (ESOP, Entry #24 A24.1)
- `InvestmentRecord.exercisePrice?: number` + `fmvAtVest?: number` + `vestedValueINR?: number` (ESOP, Entry #24 A24.2)
- `InvestmentRecord.isAutomated?: boolean` (Entry #28 A28.3)
- `liabilitySchema.coBorrowers: string[]` (memberId[], Entry #23 A23.1)
- Estate-planning schema (Entry #35 A35.2): `EstateChecklistItem[]` with `key`, `completed: boolean`, `date?: string`, `notes?: string`
- userId-aware migrations for each schema change (versioned)

**DoD:**
- [ ] All schemas extend with new fields per audit Phase 1 table
- [ ] Zod validation passes for all new fields with defaults
- [ ] Migration tests cover old → new shape transitions
- [ ] Commit: `feat(mvp-v5): B — schema extensions (17 fields per audit)`

**Phase 1 ratification:** Schema-only changes; no UI work; type-check + lint + unit tests pass; Rule 26 cross-page sweep clean.

---

## §5. Phase 2 — Math libraries

**Goal:** All pure-function math modules per audit, consuming Phase 0 seams.

### Stage C — Core math (replaces v4's god composable)

**Deliverables:**
- `mvp/src/lib/derive.ts` — pure `derive(household, layers, lens) → DerivedFinancials` kernel (Concern #2 split)
- `mvp/src/lib/fire-math.ts` — extends v4 with horizon-driven SWR resolver per Entry #1 A1.1, variant-multiplier model per Entry #2 A2.1, 4-bucket inflation per Entry #3 A3.1, per-type returns per Entry #4 A4.1 (consumes investment-traits)
- `mvp/src/lib/glide-path.ts` — Pfau-Kitces algorithm per Entry #7 A7.2
- `mvp/src/lib/withdrawal-strategy.ts` — Constant + Floor/Ceiling rules per Entry #9 A9.2 (Income-bucket method DEFERRED MVP-2 per Q5)
- `mvp/src/lib/coast-fire.ts` — formula per Entry #2 A2.3
- `useFireDerive` rewritten as 30-line Pinia-aware wrapper around `derive()`

**DoD:**
- [ ] `lib/derive.ts` is a pure function; unit-testable with plain JS objects
- [ ] All math libs consume `InvestmentRecord` traits, not flat `Investment`
- [ ] SWR horizon-resolver returns correct value across 5 bracket boundaries
- [ ] Floor/Ceiling withdrawal triggers fire at 90% and 110% thresholds
- [ ] `useFireDerive` reduced to ≤50 lines
- [ ] Commit: `feat(mvp-v5): C — core math libs (derive kernel + fire-math + glide + withdrawal + coast)`

### Stage D — Tax + instrument libs

**Deliverables:**
- `mvp/src/lib/tax.ts` extends v4 multi-FY engine with FY 2026-27+ tracking
- `mvp/src/lib/tax-deductions.ts` — `deriveDeductions(household, fy)` auto-summing 80C/80CCD(1B)/80CCD(2)/80D/Sec24/HRA/standard (Entry #12 A12.2)
- Marginal-relief trap detection per Entry #13 A13.1
- `mvp/src/lib/nps-withdrawal.ts` — PFRDA 2025 60/20/20 split modeling (Entry #14 A14.1)
- `mvp/src/lib/epf-vpf.ts` — ₹2.5L threshold + tax-on-excess (Entry #15 A15.1-3)
- `mvp/src/lib/esop-tax.ts` — Layer 1 perquisite + Layer 2 capital gains (Entry #24 A24.3-4)

**DoD:**
- [ ] All 5 tax/instrument libs implemented + unit-tested
- [ ] Marginal-relief detection triggers at ₹12L–₹12.6L band
- [ ] NPS withdrawal split correct for corpus thresholds
- [ ] VPF excess-interest after-tax yield correct
- [ ] Commit: `feat(mvp-v5): D — tax + instrument libs`

### Stage E — Family + behavioral libs

**Deliverables:**
- `mvp/src/lib/derived-records.ts` — derives family-layer auto-flow records (parents bucket, education target, marriage event, extended-contingency) per Q3 split-by-vintage; pure function consumed at read time
- `mvp/src/lib/nudge-engine.ts` (renamed from `family-nudges.ts` per audit Entry #11 broader-than-family) — all ~15 nudge types per audit nudge table (family / sandwich-gen / LTCG / under-utilization / international / RE / joint loan / ESOP / auto-debit / lifestyle / goal-post / estate / healthcare buffer / marginal-relief mitigations / glide-path warning)
- `mvp/src/lib/expense-history.ts` — annual snapshot infrastructure for Entry #29 + #30 (lifestyle inflation + goal-post tracking)

**DoD:**
- [ ] `derived-records.ts` returns family-layer items at read time; no store mutators added for family flows
- [ ] Nudge engine fires correct nudges given seed-data input fixtures
- [ ] Snapshot infrastructure persists to userId-scoped localStorage via adapter
- [ ] Commit: `feat(mvp-v5): E — family + behavioral libs (derived-records + nudge-engine + expense-history)`

**Phase 2 ratification:** All math libs pure-fn unit-testable · ≥80% coverage · Rule 26 sweep clean.

---

## §6. Phase 3 — Onboarding + `/preferences` page

**Goal:** First-run experience + canonical assumption home.

### Stage F — 6-step gating questionnaire (Wizard reuse)

**Deliverables:**
- `mvp/src/pages/Wizard.vue` — extended v4 Wizard with 6 new steps replacing v4's intake steps:
  1. **Investments you hold** — checkbox list of all investment types from `featureRegistry`
  2. **Liabilities you have**
  3. **Insurance you have**
  4. **Your family situation** (spouse · children · aging parents · HUF · daughter <10)
  5. **Your tax situation** (salaried · business · HRA · foreign income · HUF)
  6. **Planning concerns** — defaults all ON; user opts OUT (Coast/Barista/stress-test/estate/healthcare-buffer/sandwich-gen-nudges/etc.)
- **Sticky "Skip — show me everything" affordance** on EVERY step (Principle 3 alignment; degrades to v4-like exposure)
- Each step writes to `useFeatures()` enable/disable
- Wizard completion → land on `/fire-goals/dashboard`

**DoD:**
- [ ] All 6 steps render correctly with full checkbox lists
- [ ] Skip affordance always visible; one-click enables every feature
- [ ] Wizard state persisted to localStorage via adapter
- [ ] Returning users (`wizardCompleted=true`) skip wizard
- [ ] Commit: `feat(mvp-v5): F — 6-step gating questionnaire wizard`

### Stage G — `/preferences` page (10 sections, section-anchored sticky-nav)

**Deliverables:**
- `mvp/src/pages/Preferences.vue` — new top-level route `/preferences`
- 10 sections per `docs/audit/preferences-page-spec.md`: Core FIRE Assumptions · Inflation · Expected Returns · FIRE Variants · Family Layer · Glide Path · Withdrawal Strategy · Tax · Statutory Reference · Estate Planning
- **Sticky LEFT nav (desktop) / TOP nav (mobile)** with section anchors (Q4 lock)
- Section anchors align with deep-link IDs (`#core`, `#inflation`, `#returns`, etc. matching R1.3 patterns)
- Each section: header + reset-section button + collapsible advanced subsections (e.g., Glide Path per-year table)
- Statutory Reference section: distinct visual treatment (muted bg, "official source" badge per R1.4)
- Global "Reset ALL assumptions to research defaults" button at page top
- Feature-flag toggles surfaced in a special section (§ Features) with re-run-questionnaire affordance

**DoD:**
- [ ] All 10 sections render with editable controls per spec
- [ ] Sticky nav works on desktop + mobile; anchor jumps land correctly
- [ ] Reset buttons (per-row + per-section + global) all functional + confirm before destructive action
- [ ] Statutory Reference rows are NOT editable (validate R1.4)
- [ ] All preference writes go through assumption-layer resolver (Stage A3)
- [ ] Commit: `feat(mvp-v5): G — /preferences page (10 sections + sticky nav)`

### Stage H — Feature-flag wiring (sidebar + route + content gating)

**Deliverables:**
- Router-level guards: routes with `meta.feature` disabled → redirect to `/preferences#features` with toast "This section is hidden. Enable it on Preferences."
- Sidebar nav (`mvp/src/layouts/SidebarLayout.vue`) ALWAYS shows all 12 top-level items (Q3 Hybrid lock)
- Within each page, sub-sections / forms / cards conditionally render based on `useFeatures().isEnabled(key)`
- **Discovery footer component** (`mvp/src/components/shared/DiscoveryFooter.vue`) — context-aware: takes a route prop, renders "Looking for X, Y, Z? Enable in Preferences →" listing disabled features for that route
- Footer mounted on every page that has gateable content

**DoD:**
- [ ] Disabling a feature in Preferences → its content disappears from its host page on next route nav
- [ ] Discovery footer lists exactly the disabled features for the current route
- [ ] Sidebar items never disappear (12 always shown)
- [ ] Commit: `feat(mvp-v5): H — feature-flag wiring (router + sidebar + content + discovery footer)`

**Phase 3 ratification:** Wizard end-to-end works · /preferences renders + edits persist · feature gating respected across all routes · Rule 26 sweep clean.

---

## §7. Phase 4 — Surface integrations

**Goal:** All Dashboard/route surfaces consume the new libs + display per audit.

### Stage I — FIRE Dashboard hero rewrite

**Deliverables (audit Entries #1-#10 surface items):**
- `mvp/src/pages/fire-goals/Dashboard.vue` hero rewritten:
  - 3 end-state variant chips (Lean/Regular/Fat) per Entry #2 A2.5 expense-multiplier model
  - Coast FIRE milestone callout per Entry #2 A2.5
  - Barista FIRE alternative-path card per Entry #2 A2.5
  - Glide-path summary chip per Entry #7 A7.4
  - `<FamilyLayerCard>` aggregating parents-kind + education + marriage + contingency per Entry #6 A6.7
  - Resolved-value displays + `?` deep-links to `/preferences` per R1.3 (SWR, Plan-to age, household inflation 7.9%, weighted return)
  - Stress-test slider per Entry #1 A1.8 (SWR ±0.5% live impact on corpus)
  - Estate completion chip per Entry #36 A36.1
  - Stress-test red-flag chip per Entry #27 A27.3

**DoD:**
- [ ] All chips/cards render with correct resolved values
- [ ] Deep-link clicks land on correct `/preferences` anchor
- [ ] Stress-test slider live-updates corpus projection
- [ ] Rule 24 screenshot verification on Dashboard hero
- [ ] Commit: `feat(mvp-v5): I — FIRE Dashboard hero rewrite`

### Stage J — `/tax-planning` surface

**Deliverables:**
- `/tax-planning/Index.vue` updated per Entries #12 + #13:
  - Replace hardcoded `deductions: 150000 + 25000` with call to `deriveDeductions()` from Stage D
  - Decision rule-of-thumb display per Entry #12 A12.5
  - 80CCD(1B) + 80CCD(2) callout per Entry #12 A12.6
  - Sec 87A marginal-relief warning chip per Entry #13 A13.2
  - Tax-cliff visualization chart per Entry #13 A13.3 (old-regime overlay toggle)
  - Mitigation suggestions per Entry #13 A13.4

**DoD:**
- [ ] Deductions auto-derived from user data; breakdown table shown
- [ ] Decision rule message correct given user's deduction total
- [ ] Marginal-relief chip fires when income in ₹12L-₹12.6L band
- [ ] Cliff chart renders with band highlighted + old-regime overlay
- [ ] Commit: `feat(mvp-v5): J — /tax-planning surface`

### Stage K — `/investments` surfaces (Overview, Holdings, NEW Buckets)

**Deliverables:**
- Overview, Holdings: form per Entries #18 (International route selector) + #19 (Gold subtype tax) + #20 (RE role + REIT)
- ESOP form per Entry #24 fields (grantorCountry + exercisePrice + fmvAtVest)
- NPS withdrawal planning card per Entry #14 A14.3
- EPF/VPF threshold breakdown card per Entry #15 A15.4-5
- LRS warning copy + Statutory Reference deep-link per Entry #18 A18.2

**DoD:**
- [ ] All 12 investment types renderable in Holdings form
- [ ] NPS planning card shows correct cap suggestion based on user's projected NPS corpus
- [ ] VPF threshold breakdown shows correct after-tax yield for high-basic earners
- [ ] Commit: `feat(mvp-v5): K — /investments surfaces`

### Stage L — `/expenses` + `/liabilities` surfaces

**Deliverables:**
- `/expenses/recurring` + `/expenses/planned` forms gain `kind` selector per Entries #6 + #10 (auto-routes inflation bucket)
- `/expenses/overview` adds YoY expense chart per Entry #29 A29.3
- Family-layer entries created from `derivedFamilyLayer(household)` (Stage E), not from store mutators
- `/liabilities/loans` form gains co-borrower selector per Entry #23 A23.2 (multi-select of EARNER members)
- Tax calculation respects co-borrowers (joint home loan = 2× deductions) per Entry #23 A23.3

**DoD:**
- [ ] Selecting `kind: 'parents'` on a recurring expense auto-sets `inflationBucket: 'healthcare'`
- [ ] YoY chart renders historical snapshots
- [ ] Co-borrower selector populates from members; deduction doubles in tax calc
- [ ] Commit: `feat(mvp-v5): L — /expenses + /liabilities surfaces`

### Stage M — `/financial-health` + `/fire-goals` (excl new routes) surfaces

**Deliverables:**
- `/financial-health/*` pages consume `derive()` kernel directly (no useFireDerive wrapping)
- `/fire-goals/dashboard` (Stage I already covered)
- `/fire-goals/goals` form gains `kind` selector per Entry #6 A6.5
- `/fire-goals/what-if` extends with 6 seed scenarios per Entry #26 A26.1 (3 positive + 3 stress-tests)
- Scenario UI grouped by category ("Positive variations" / "Stress tests") per Entry #26 A26.3

**DoD:**
- [ ] WhatIf scenarios dropdown shows 6 grouped entries
- [ ] Each stress-test scenario triggers correct lever overrides
- [ ] Commit: `feat(mvp-v5): M — /financial-health + /fire-goals surfaces`

**Phase 4 ratification:** All consumer surfaces render correctly · Rule 24 screenshot pass per route · Rule 25 UI→DB persist verified per form · Rule 26 sweep clean.

---

## §8. Phase 5 — New routes

**Goal:** Three new top-level routes per audit.

### Stage N — `/investments/buckets`

**Deliverables (Entry #8):**
- New sub-route `mvp/src/pages/investments/Buckets.vue` alongside Overview + Holdings
- 4 bucket cards (B1 0-3yr · B2 3-10yr · B3 10-25yr · B4 25+yr) with rupee sum + years-of-coverage
- Unassigned holdings section + nudge
- Highlight when B1 < 1yr (SORR-vulnerable warning)
- Holdings form gains `bucket` selector

**DoD:**
- [ ] Route accessible via sidebar
- [ ] Bucket totals compute correctly from user holdings
- [ ] SORR warning visible when B1 < 1yr expenses
- [ ] Commit: `feat(mvp-v5): N — /investments/buckets`

### Stage O — `/fire-goals/stress-test`

**Deliverables (Entry #27):**
- New sub-route `mvp/src/pages/fire-goals/StressTest.vue`
- Batch runner for all 10 Ch 05 §5.14 stress scenarios
- Pass/fail per scenario with explanation + remediation links

**DoD:**
- [ ] All 10 stress scenarios runnable; verdicts correct given user state
- [ ] Failures link to specific remediation actions
- [ ] Commit: `feat(mvp-v5): O — /fire-goals/stress-test`

### Stage P — `/estate-planning` (NEW top-level route)

**Deliverables (Entries #35 + #36):**
- New top-level route `mvp/src/pages/EstatePlanning.vue`
- 7-step Ch 05 §5.7 checklist: Will · Nominees · POA · Joint accts · Digital · HUF karta · Term life bypass
- Per-item: boolean + optional date + notes
- Each item links to glossary entry
- Dashboard chip "Estate: X of 7" per Entry #36 A36.1

**DoD:**
- [ ] Route accessible via sidebar (only if estate feature enabled per Q3 Hybrid)
- [ ] Checklist persists per item with date + notes
- [ ] Dashboard chip reflects completion ratio
- [ ] Commit: `feat(mvp-v5): P — /estate-planning route`

**Phase 5 ratification:** All 3 new routes accessible · feature-gated correctly · Rule 24+25+26 pass.

---

## §9. Phase 6 — Nudge engine

**Goal:** Activate the cross-cutting nudge surface.

### Stage Q — Nudge engine consolidation + all ~15 nudge types

**Deliverables:**
- `mvp/src/lib/nudge-engine.ts` (renamed from family-nudges) finalized with all triggers
- Nudge types per audit nudge table (family / sandwich-gen / LTCG / under-utilization / international / RE / joint loan / ESOP cliff / foreign-RSU / auto-debit / lifestyle inflation / goal-post shift / estate gaps / healthcare buffer / marginal-relief mitigations / glide-path warning)
- Trigger conditions tested with seed fixtures (Sharmas + Iyers + Mehtas + Empty)
- Nudge cards render on Dashboard + per-route surfaces

**DoD:**
- [ ] All ~15 nudge types fire correctly given seed fixtures
- [ ] Sharmas seed triggers sandwich-gen + family + estate nudges
- [ ] Mehtas seed (DINK) does NOT trigger family/sandwich-gen nudges
- [ ] Commit: `feat(mvp-v5): Q — nudge engine consolidation`

### Stage R — Nudge dismissal persistence + Preferences §Family controls

**Deliverables:**
- Dismissed nudge state persisted to localStorage via adapter, keyed by userId
- `/preferences §Family` exposes "Re-enable dismissed nudges" + "Show family-layer nudges" toggle (Entry #6 A6.9)
- Dismissals respect feature-flag state changes

**DoD:**
- [ ] Dismissed nudges stay dismissed across reloads
- [ ] Re-enable button restores them
- [ ] Commit: `feat(mvp-v5): R — nudge dismissal + preferences controls`

**Phase 6 ratification:** Nudge engine alive across all seeds · dismissal works · Rule 26 sweep.

---

## §10. Phase 7 — Glossary + microcopy

### Stage S — Glossary audit + ~55 entries

**Deliverables:**
- `mvp/src/lib/glossary.ts` cumulative from all audit entries (~50) + 5 net-new per Entry #33 A33.2 (AY · AMFI · PFRDA · RBI Master Direction · Schedule FA)
- Cross-references between entries
- Categorization (Tax / Instruments / Strategy / Risk / Behavioral)
- Glossary search

**DoD:**
- [ ] ≥55 entries; no duplicates; categorization rendered in UI
- [ ] Search filters across title + body
- [ ] Commit: `feat(mvp-v5): S — glossary ~55 entries`

### Stage T — Microcopy audit + replacement (Entry #32)

**Deliverables:**
- Microcopy audit across Dashboard / /tax-planning / /investments / /fire-goals / /preferences / glossary
- US-FIRE framing replaced with Indian-planner voice ("4% rule" → "horizon-driven SWR"; "25× rule" → "28-33× corpus multiple"; "early retirement at 35" → "FIRE at 47-50 with family layer accounted")
- Research chapter citations added to tooltips

**DoD:**
- [ ] Grep for "4% rule", "25× rule", "retirement at 35" returns zero
- [ ] Tooltips on key assumption surfaces cite chapter references
- [ ] Commit: `feat(mvp-v5): T — microcopy + research citations`

### Stage U — Trust pill extension (Entry #34)

**Deliverables:**
- Splash + Dashboard footer trust pill extended:
  - Existing: "All data stays on your device — no login, no backend, no telemetry."
  - Added: "Research-grounded methodology (60+ sources cited)"
  - Added: "No financial-product affiliations or commissions"
  - Added: "Planner voice, not promotional"
- Link from trust pill to glossary's research bibliography

**DoD:**
- [ ] Trust pill renders all 4 claims on Splash + Dashboard
- [ ] Link to glossary bibliography works
- [ ] Commit: `feat(mvp-v5): U — trust pill extension`

**Phase 7 ratification:** Glossary searchable · microcopy audit complete · trust pill live · Rule 24 sweep.

---

## §11. Phase 8 — Seeds + tour + verification

### Stage V — Updated seeds (4 personas including new "Iyers" sandwich-gen late-30s)

**Deliverables:**
- **Sharmas seed updated** per Entry #31:
  - Add city "Bangalore" explicitly
  - planToAge propagates to 90
  - Add ₹50L Parents bucket (recurring kind:'parents' @ ₹40K/mo)
  - Add Aarav education target (kind:'education', ₹1.5Cr by 2040 overseas Masters)
- **NEW "Iyers" seed** (Q7 lock — late-30s sandwich-gen):
  - Earner 1: 38yo IT lead, ₹35L CTC
  - Earner 2: 36yo teacher/freelance, ₹8L
  - 2 kids: age 10 + 8 (primary/secondary school)
  - 2 parents: age 68 + 65 (basic medical, no major care yet)
  - Corpus: ~₹2.5Cr; mid-accumulation
  - Home loan ~₹50L outstanding (joint with both spouses as coBorrowers — demonstrates Entry #23)
  - Family floater + parents senior cover (demonstrates Entry #10 + #15 80D parents)
- **Mehtas seed preserved** (DINK power-user demonstration)
- **Empty seed preserved**

**DoD:**
- [ ] All 4 seeds loadable; trigger correct nudges per fixtures
- [ ] Iyers seed demonstrates sandwich-gen + 80D parents + joint home loan + glide-path
- [ ] Sharmas updates per Entry #31 verified
- [ ] Commit: `feat(mvp-v5): V — 4 seed personas (Sharmas updated + Iyers new + Mehtas kept + Empty)`

### Stage W — Tour extension (Coast + Barista + estate steps)

**Deliverables:**
- `mvp/src/lib/tour-steps.ts` extended with new steps for Coast FIRE, Barista FIRE, estate-planning route, stress-test route, /preferences page
- Tour respects feature gating (skip steps for disabled features)

**DoD:**
- [ ] Tour steps cover all new routes + concepts
- [ ] Disabled-feature steps auto-skip
- [ ] Commit: `feat(mvp-v5): W — tour extension`

### Stage X — Verification + Vercel deploy (gated on VERCEL_TOKEN)

**Deliverables:**
- **Verification:**
  - `npm run type-check` → 0 errors
  - `npm run lint` → 0 errors
  - `npm run test:unit` → all green
  - `npm run build` → succeeds, bundle ≤200KB gzip main (v4 was 153KB; v5 has more code, budget bumped)
  - `npm run test:e2e` → all green (extends v4 e2e suite with new routes)
  - Lighthouse audit per route (target A11y 95+, BP 95+, Perf 75+)
  - axe-core a11y audit per route (zero Critical violations)
- **Vercel deploy (gated):**
  - If `VERCEL_TOKEN` env var present: `vercel deploy --prod` for `mvp/` as `firekaro-mvp.vercel.app`
  - If not: produce deploy-ready artifact, document manual deploy steps in `mvp/POST-RUN-NOTES-v5.md`

**DoD:**
- [ ] All quality gates green
- [ ] Bundle size within budget
- [ ] Lighthouse + axe-core per route within target
- [ ] Vercel URL live OR manual deploy docs ready
- [ ] Commit: `feat(mvp-v5): X — verification + deploy`

**Phase 8 ratification:** All seeds work · tour complete · verification gates green · Vercel deployed or deploy-ready.

---

## §12. Final DoD checklist (~65 criteria, aggregated)

### Phase 0 (6) · Phase 1 (1) · Phase 2 (3) · Phase 3 (3) · Phase 4 (5) · Phase 5 (3) · Phase 6 (2) · Phase 7 (3) · Phase 8 (3)

- [ ] All 27 per-stage DoD checkboxes from §3-§11 green
- [ ] Zero references to v4-specific paths in `mvp/`
- [ ] ADR-0001 invariants enforced: every entity has `userId`; localStorage only via adapter; AuthProvider stubbed
- [ ] R1 invariants: every planning assumption editable on `/preferences`; statutory facts read-only
- [ ] R2 invariants: no proposals/diffs without verifying v4 source
- [ ] Cross-cutting Rule 24 (UI screenshot) pass per route
- [ ] Cross-cutting Rule 25 (UI→DB persist) pass per form
- [ ] Cross-cutting Rule 26 (post-phase sweep) pass per Phase boundary
- [ ] 4 seeds loadable + correct nudges per seed fixtures
- [ ] All 9 phases' commits land cleanly + chronologically
- [ ] `mvp/DEFERRED-v5.md` lists any deferrals with reasons (Rule 24/25/26/7a/7b)
- [ ] `mvp/POST-RUN-NOTES-v5.md` captures judgment-call rationale + lessons

---

## §13. MVP-2+ deferred list (out of scope for this run)

Per `docs/audit/demo-v5-action-items.md` MVP-2+ section + grill resolutions:

- A1.7 income-bucket method (Pattu) — deferred Q5
- Concern #2 derive-kernel split — already in Phase 2 Stage C ✓
- Concern #5 autoFlow* lift for existing v4 paths — deferred per Q3 split-by-vintage
- A8.8 dynamic bucket rebalance recommendations
- A8.9 automated bucket-based withdrawal sequencing (MVP-3)
- A9.6 Guyton-Klinger + VPW withdrawal rules
- A10.7 senior-citizen insurance flag
- A10.8 insurance-recommendation engine
- A11.5 dedicated sandwich-gen Dashboard card
- A14.x Tier-2 NPS modeling
- A16.4 per-holding LTCG harvest calculator (requires cost-basis tracking)
- A17.x dedicated /preferences §Optimization page
- A18.6 LRS-TCS tracking + DTAA-credit modeling
- A19.6 SGB issuance-window reminders
- A20.7 RE yield-test calculator + reverse-mortgage modeling
- A22.4 full HUF schema modeling
- A23.x dedicated /sandwich-gen-tax page
- A24.8 month-by-month vest-schedule modeling
- A34.3 dedicated /trust page
- Progressive disclosure as alternative to "Skip = all-on" — alternative onboarding mode
- v5→production migration plan (when ready to incorporate)

---

## §14. Final acceptance criteria

This run is **complete and acceptable** when:

1. `mvp/` is a self-contained, runnable, isolated Vue 3 + Vuetify 3 + Pinia app distinct from `demo/` and production `src/`
2. All 27 per-stage DoD items green
3. All 4 seed personas (Sharmas updated · Iyers new · Mehtas preserved · Empty) load cleanly
4. Onboarding wizard's 6-step gating questionnaire works end-to-end with "Skip" path
5. `/preferences` page renders all 10 sections with sticky nav; every editable value resolves through assumption-layer resolver; statutory facts are read-only
6. ADR-0001 multi-tenant-ready architecture is live: zero direct localStorage access; every entity carries `userId`; AuthProvider stubbed returning `'self'`
7. All ~15 nudge types fire on appropriate seed fixtures
8. Stress-test route runs all 10 Ch 05 §5.14 scenarios with pass/fail verdicts
9. Estate planning route shows 7-step checklist with persistence
10. Glossary has ≥55 entries with categorization + search
11. Microcopy audit complete — zero references to "4% rule" / "25× rule" / "early retirement at 35"
12. Trust pill extended with 4 claims on Splash + Dashboard
13. Type-check + lint + unit tests + build + e2e all green
14. Lighthouse + axe-core per route within target (A11y 95+, BP 95+, Perf 75+, zero a11y Critical)
15. Vercel deploy live OR deploy-ready artifact + manual deploy docs

This run is **NOT acceptable** if:

- Any item in §12 DoD checklist is red
- `mvp/` accidentally writes to `demo/`, `src/`, or other isolation-violations
- ADR-0001 invariants are violated (direct localStorage access, missing userId, etc.)
- The 6-step gating questionnaire is unusable (e.g., Skip path missing)
- Statutory facts are user-editable anywhere

---

## §15. Final brief on run end (REQUIRED — per §0 directive 10g)

Emit comprehensive end-of-run brief listing:

- All 9 Phases × ~22 Stages: completed / partially-completed / deferred-with-reason
- All `mvp/DEFERRED-v5.md` entries with rule status (24/25/26/7a/7b)
- DoD final tally — green / amber / red counts (~65 criteria)
- Commit hashes of every per-task commit
- Lighthouse scores per route (best + worst)
- a11y violation summary (critical/serious/moderate per route)
- Bundle size vs target (≤200KB main gzip)
- Live Vercel URL (if Stage X succeeded) or manual deploy docs
- Suggested next-morning actions (which DEFERRED items to tackle first; MVP-2 candidates ready for grilling)

---

*End of contract — `docs/goals/build-firekaro-mvp-v5.md` · 2026-05-28 · /goal-ready · clone+strip+extend baseline · ADR-0001-compliant · 4-skill-synthesized*

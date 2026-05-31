# FireKaro v5 — Research-Audit Implementation Gap & Punch-List

**Created:** 2026-05-30
**Source of truth for "what was promised":** `docs/audit/demo-v4-vs-research-audit.md` (36-decision CFP audit) → `docs/audit/demo-v5-action-items.md` (~215 MVP-1 items).
**Purpose:** Track which audit action items actually reached the MVP code, and sequence the remainder. Built from a per-cluster code cross-check (6 parallel verifications against `mvp/src/`) on 2026-05-30.

## Headline finding (why this doc exists)

The research-grounded **pure libraries, schema, glossary, and `/preferences` scaffolding largely shipped and are unit-tested — but most were never wired into the FIRE number the user sees.** The `derive()`/`useFireDerive` integration that `DEFERRED-v5.md` punted to "Stage I" never fully landed, so the headline math was substantially still the v4 calculation. MVP-1 implementation rate at cross-check time: **~38% done · ~32% partial · ~32% missing** (171 MVP-1-scoped items).

## ✅ DONE 2026-05-30 — Workstream 1 (the spine), verified

Commits `757392a` (engine) + `a698f08` (milestone reconciliation). 401 unit tests pass; dashboard renders the corrected number with zero console errors.

| Item | What landed | Verified |
|---|---|---|
| A1.1 / A1.3 | Horizon-driven SWR (`getHorizonSWR`); Sharmas retire@47/planTo@90/43yr → **3.25%** (was age-based 3.0%) | `useFireDerive.seed.spec.ts` |
| A3.1 | 4-bucket inflation blend (`blendedInflation`, 6/14/9/6 @ 60/20/10/10 ≈ **7.9%**); projection uses blend; healthcare default **8%→14%** | `fire-math.spec.ts` |
| A6.10 | Family-layer corpus folded into FIRE target (education+marriage lumps + capitalized contingency; parents NOT double-counted) | seed spec |
| A10.5 | Healthcare reservation (20% of base) added on top | seed spec |
| A20.2 | Primary-residence real estate excluded from FIRE corpus + blended-return weighting | engine |
| A4.1 | Return defaults corrected: gold 8→7%, real estate 8→6%, crypto →0% | `assumption-layers.spec.ts` |
| A2.1 | Milestone variant chips reconciled to headline (Regular = full target; Lean/Fat scale lifestyle only, buffers fixed) | screenshot |

**Net Sharmas effect:** headline FIRE ≈ ₹7.33 Cr → **₹8.57 Cr** (base 6.72 + family 0.51 + healthcare reservation 1.34). Family layer is small only because the Sharmas seed isn't yet `kind`-tagged — see A31.x below.

## ✅ DONE 2026-05-30 — Workstream P1–P5 (research-gap run)

Run contract: `docs/goals/2026-05-30-mvp-v5-research-gap-p1-p5.md`. 8 commits,
all type-check 0 / 436 unit tests / build ~163 KB gzip; every UI/persistence
change verified live with the Rule 24/25/26 sweep at :5175. Deferrals logged in
`docs/goals/.run/2026-05-30-mvp-v5-research-gap-p1-p5-DEFERRED.md`.

| Item | What landed | Commit |
|---|---|---|
| A15.3 | EPF/VPF after-tax effective yield in `blendedReturn` (no-op below ₹2.5L) | `6ba8127` |
| A29.1/A30.1/A29.3/A30.3 | Monthly snapshot capture on hydrate + 2 real charts (FIRE-trajectory, YoY-expense); all synthetic trend series removed | `ac2594a` |
| A16.3, A17.2, A29.2, A30.2, A24.6 | 5 declared-but-dead nudges given real firing bodies (every NudgeKind now has a construction site) | `4490075` |
| A18.2, A20.x, A24.1/2, A8.4, A6.5/A10.3 | Form capture: International+route+LRS warning, REIT, RealEstate role+illiquidity, ESOP grant details, horizon bucket, planned-future kind | `cccb7c3` |
| A3.2, A4.6, A4.2/A4.9 | /preferences 4-bucket inflation + blend; PPF/EPF moved read-only to §Statutory (R1.4 fix); weighted nominal/real return | `223594b` |
| A31.1/A31.3/A31.4 | Sharmas seed kind-tagged (Bengaluru, ₹40K/mo parents, ₹1.5Cr education) → headline ₹8.57Cr→₹12.86Cr | `93dc996` |
| A36.1/A36.2, A5.1/A5.2/A5.3 (display) | Dashboard estate-readiness chip + red-flag; planning-horizon chip | `6e4693d` |
| A2.4 | Editable Lean/Fat variant multipliers feeding the milestone chips; + router-guard assumptions-hydrate root-cause fix | `a76bf6e` |

**Deferred (logged):** A14.2 (NPS-annuity projection), A9.1 (withdrawal selector
into projection), A3.2-weights, A5.x member-form validation, A33.3 glossary
search, A35.3 estate→glossary, A12.5/A13.3 tax-cliff chart, NetWorthOverTime
synthetic series. See the DEFERRED file for per-item reasons.

## ✅ DONE 2026-05-31 — Workstream Stage-T0 STAGE A (deferred surface items)

Run contract: `docs/goals/2026-05-31-mvp-v5-stage-t0-finish-and-derive-kernel.md`.
All STAGE-A deferred + preflight-gated items shipped; type-check 0, build
164.78 KB gzip; live Rule 24/25/26 sweep passed at :5175 (Preferences,
Dashboard, Glossary, tax-planning — 0 console errors; localStorage round-trip
confirmed for the new assumption fields).

| Item | What landed | Commit |
|---|---|---|
| A3.2 | Editable 4-bucket inflation WEIGHTS on /preferences (sum-to-100, live blend) | `e81c4ff` |
| A5.x | Member-form plan-to age + horizon sanity validation (block/soft-warn) | `ca35d94` |
| A33.3 | Glossary category (5-way) + search + /glossary route + Cmd-K deep-links | `a4f60f1` |
| A35.3 | 6 estate glossary terms + per-item estate→glossary deep-link chips | `a4f60f1` |
| A12.5 | Corrected regime decision-rule (≥5L→Old, >50L→New, else compare) | `6b3b8ad` |
| A13.3 | Tax-cliff income-vs-tax chart + 12L–12.75L rebate band + old-regime toggle | `6b3b8ad` |
| (honesty) | NetWorthOverTime synthetic series → real snapshot series + empty-state | `ea1c6e3` |
| A27.3 | Stress-test "fails X of 10" Dashboard chip + pure stress-test lib (DRY) | `a452f02` |
| (S1) | Education goal-funding adequacy (FV + required SIP + on-track) on FamilyLayerCard | `a885642` |
| A21.1 | Coast FIRE corpus-vs-trajectory chart in FireMilestonesCard | `a002cb7` |
| A9.1 | Withdrawal selector (Constant/Floor-Ceiling) wired into projection decumulation | `0e6e719` |

Test count 436 → 471 (+35 new unit tests across the items).

## ✅ DONE 2026-05-31 — Workstream Stage-T0 STAGE B (Tier-0 architecture)

Behaviour-preserving refactor; the Sharmas headline FIRE stayed **₹12.86 Cr /
age 53, by 2049** byte-identical through every step (seed spec + new derive.spec
green; live-verified at :5175, 0 console errors). type-check 0 · 481 unit tests ·
build 164.91 KB gzip.

| Item | What landed | Commit |
|---|---|---|
| B-1 derive() kernel | Pure `derive(household, assumptions, lens)` extracted; `useFireDerive` is a thin wrapper; 3 store methods → pure `lib/assumption-math`; `derive.spec` proves wrapper≡kernel | `bcee2b2` |
| B-2 A14.2 NPS annuity | 40% annuity offsets net expenses + excluded from withdrawable corpus; `projectCorpus` retirement-income stream; >₹5L fixture proves corpus reduction (Sharmas ₹4L → no change) | `6f8ed3a` |
| B-3 return buckets | Intl/REIT/Crypto first-class buckets + rates (10/8/0%) reach the blend; ESOP stays "other" | `a2f99eb` |

**DEFERRED (logged):** B-4 assumptions-store → layered-resolver migration —
the contract's "swrOverride is dead" premise is false (it has live UI writers),
and the flat `Assumptions` vs `AssumptionMap` shapes have diverged, so the
literal migration cannot be done behaviour-identically without an architecture
shape-reconciliation. Surfaced per §4.6 rather than regressing the live SWR
override. Full rationale + recommended follow-up: `docs/goals/.run/2026-05-31-mvp-v5-stage-t0-DEFERRED.md`.

## ✅ DONE 2026-05-30 — Workstream Stage-T0b (retire the layered assumption resolver)

Run contract: `docs/goals/2026-06-01-mvp-v5-stage-t0b-retire-resolver.md`. The
architecture call deferred at Stage-T0 B-4 is now **made and implemented**:
**retire the unused layered resolver; the flat `types/assumptions.ts`
`Assumptions` store is the single canonical R1 model.** Behaviour-identical
deletion/consolidation — Sharmas headline FIRE **₹12.86 Cr unchanged**; full unit
suite green (481 → 463, −18 = the removed resolver spec, no failures);
type-check 0; build 164.93 KB gzip. Recorded as **ADR-0002**.

| Item | What landed | Commit |
|---|---|---|
| Stage 1 — retire dead resolver | Deleted `resolveAssumption`/`resolveAllAssumptions`/`AssumptionMap`/`AssumptionLayer`/`AssumptionScope`/`make{Household,Scenario,Global}Layer` + `assumption-layers.spec.ts` (verified zero consumers outside the spec) | `44c1786` |
| Stage 2 — one defaults source (DRY) | Repointed `/preferences` resets to `DEFAULT_ASSUMPTIONS` (flat) + new exported `DEFAULT_{EXTENDED_FAMILY_CONTINGENCY,HEALTHCARE_CORPUS_RESERVATION}_PERCENT` household constants; deleted `assumption-layers.ts` + `assumptionDefaults`; removed stale `TODO(G)`. `swrOverride` untouched. Live Rule 24/25/26 sweep PASS | `7db508d` |
| Stage 3 — ADR-0002 | `docs/adr/0002-retire-layered-assumption-resolver.md` (Context/Decision/Consequences); ledger + memory updated | this commit |

## ▶ REMAINING PUNCH-LIST (prioritized, with dependencies)

### P1 — finish spine accuracy (projection refinements)
- **A14.2 NPS annuity in projection** — needs a projection that models retirement income (the 40% annuitised NPS portion offsets net expenses). Requires extending `projectCorpus` beyond its single-rate model. *Blocked on: projection-engine income support.*
- **A15.3 EPF/VPF after-tax yield** — use `epf-vpf.calculateEpfVpfYear().effectiveYield` for the EPF bucket in `assumptions.blendedReturn` instead of raw `epfReturn`, when contribution > ₹2.5L. Needs the member's annual EPF/VPF contribution + marginal slab rate (from `fyTax`). *Localized; lower risk than A14.2.*

### P2 — Workstream 2: nudge engine firing logic ("lies by enum")
`nudge-engine.ts` declares these `NudgeKind`s with **no firing body**:
- **A16.3 LTCG harvest** — date-based (Mar-15 reminder). Independent. *Quick.*
- **A17.2 under-utilization** — PPF<₹1.5L / NPS 80CCD(1B)<₹50K / 80CCD(2) not maxed. Independent. *Quick.*
- **A29.2 lifestyle-inflation** & **A30.2 goal-post-shift** — analysis fns exist in `expense-history.ts` but **depend on P3 (snapshots)**.
- **A24.6 foreign-RSU** — needs ESOP `grantorCountry` capture (P4).

### P3 — Workstream 3: snapshot wiring + charts (unblocks P2 nudges)
- **A29.1 / A30.1** `captureSnapshot()` is never called at runtime → snapshot store always empty. Wire a trigger on hydrate / FY-rollover. *This unblocks A29.2, A30.2, A29.3, A30.3.*
- **A29.3 YoY expense chart**, **A30.3 FIRE-trajectory chart** — replace synthetic sparkline data with snapshot-driven series.

### P4 — Workstream 4: form capture fields (strand-fixing)
Schema fields exist but no form writes them:
- **A18.2** International selectable in `InvestmentForm` + `internationalRoute` + LRS warning.
- **A20.x** REIT selectable; Investment-RE illiquidity chip.
- **A24.1/2** ESOP `grantorCountry`/`exercisePrice`/`fmvAtVest` capture (feeds `esop-tax.ts`).
- **A8.4** bucket selector on holdings (unstrands `/investments/buckets`).
- **A6.5 / A10.3** planned-future `kind` selector (education/marriage/medical).

### P5 — Workstream 5: /preferences controls, surfacing, seeds, glossary
- **A3.2** 4-bucket inflation editable (education + housing + weights + blend display) on `/preferences`.
- **A4.2/A4.9** weighted nominal/real display; **A4.6** move PPF/EPF to read-only Statutory (R1.4 violation today).
- **A2.4** editable variant multipliers; **A9.1** Floor/Ceiling withdrawal selector.
- **A5.1/A5.2/A5.3** horizon display + sanity validation (planToAge>retirementAge etc.).
- **A36.1/A36.2** estate Dashboard chip + corpus>₹1Cr-AND-<4/7 red-flag; **A35.3** estate→glossary links.
- **A31.1/A31.3/A31.4** update the **Sharmas seed**: real city, `kind:'parents'` bucket, `kind:'education'` target (makes the family layer reflect the research ₹3.1 Cr).
- **A33.3** glossary categorization + search; **A13.3** tax-cliff chart; **A12.5** correct decision-rule thresholds.

## Verification protocol for each remaining item
TDD (failing spec first) for math/logic; rule 24 (screenshot + ARIA + console at :5175) + rule 25 (localStorage round-trip) for any UI/persistence change. Run `npm run type-check && npx vitest run` before each commit.

---

## Coverage ledger — what's covered vs deferred (keep current every stage)

**Standing instruction (2026-05-30):** every goal/stage MUST keep this ledger accurate —
when an item ships, move it to COVERED with its commit SHA; when an item is consciously
left out, record it in DEFERRED with *why* and *which future stage* should pick it up.
Nothing is dropped silently.

### Prioritization lens: the Sharma persona (decided 2026-05-30)
Scope is ranked by value to the **default Sharma persona** (Rohit 30 / Priya 29, dual-income,
retire 47/50, **2 young kids Aarav 4 + Meera 2**, ₹25L ESOP grant, Pvt Ltd consulting, ₹95L
primary home). Key finding: their **₹1.3 Cr of education + marriage goals already exist in the
seed but are `kind`-untagged**, so they are invisible to the FIRE number — the highest-value
fix is wiring those in. Decision **(A)**: the Sharma seed gains **dependent parents** so the
flagship persona is a true sandwich-gen and exercises the research's headline feature.

### COVERED (done + verified)
| Item | Where | SHA |
|---|---|---|
| Spine: horizon SWR, 4-bucket inflation, family-layer fold-in, healthcare reservation, primary-residence exclusion, return-default corrections | engine | `757392a` |
| Milestone variant chips reconciled to headline | dashboard | `a698f08` |

### IN THE REVISED P1–P5 GOAL (persona-ranked — `docs/goals/2026-05-30-mvp-v5-research-gap-p1-p5.md`)
**S1 — changes the Sharmas' actual FIRE number / core decisions**
- Tag the existing education+marriage goals + `kind` selector (A6.5, A31.4) — folds in ₹1.3 Cr
- Education goal-funding adequacy (on-track-for-Aarav math)
- ESOP perquisite + capital-gains tax capture + display (A24.x) — they hold a ₹25L grant
- Dual-income tax optimization (joint loan done; per-earner 80C/80CCD under-util nudge A17.2)
- **Coast FIRE projection chart (A21.1)** — *promoted from MVP-2*; young accumulators' key metric
- EPF/VPF after-tax yield (A15.3 / P1)

**S2 — guardrails fit to their profile**
- Lifestyle-inflation tracking (P3 snapshots + P2 nudge)
- Estate + **minor-children guardianship** framing + Dashboard chip/red-flag (A35/A36)
- **Stress-test SORR red-flag (A27.3)** — *promoted*; 43-yr horizon
- Add **dependent parents to the Sharma seed** (sandwich-gen fidelity, decision A)

Plus the cross-cutting P1–P5 infrastructure that benefits every persona: snapshot capture
wiring, /preferences editable controls (inflation buckets/weights, returns nominal/real,
variant multipliers, withdrawal selector, horizon display+validation), PPF/EPF→read-only
Statutory, glossary categorization, corrected tax decision-rule + cliff chart.

### DEFERRED to later stages (recorded so they are NOT lost)
| Item | Why left now | Future stage / trigger |
|---|---|---|
| ~~**A14.2 NPS-annuity in projection**~~ | ✅ DONE Stage-T0 B-2 (`6f8ed3a`) | — |
| ~~**`derive()` kernel extraction**~~ (DEFERRED-v5 Concern #2) | ✅ DONE Stage-T0 B-1 (`bcee2b2`) | — |
| ~~**8-bucket `blendedReturn` limitation**~~ (Intl/REIT/Crypto) | ✅ DONE Stage-T0 B-3 (`a2f99eb`) | — |
| ~~**assumptions-store → layered-resolver migration**~~ | ✅ RESOLVED Stage-T0b: the architecture call was made — **RETIRE** the unused layered resolver (zero consumers; `AssumptionMap` mis-decomposes the domain) rather than migrate to it. Flat `Assumptions` is the single canonical R1 model; `swrOverride` kept. Recorded as **ADR-0002** | — (retired — see `docs/adr/0002-retire-layered-assumption-resolver.md`; Stage-T0b `44c1786`/`7db508d`) |
| **S3 — parents-bucket/SCSS/80D-parents/senior-insurance** | LOW until parents in seed; rises once decision-A seed lands | Re-evaluate after parents added; likely next persona stage |
| **S3 — HUF (A22.x)** | unlikely for the Sharma profile | Build on demand (persona with HUF) |
| **S3 — foreign-RSU (A24.6) / International+LRS (A18.x) / Crypto (A19/A4 crypto)** | not in Sharma holdings | Build on demand (persona that holds them) |
| **MVP-2/3 audit items** (income-bucket/Pattu A1.7, stress-test slider A1.8, Guyton-Klinger/VPW A9.6, per-holding LTCG calc A16.4, full HUF A22.4, month-by-month vest A24.8, conservative-tail A3.7, per-parent/child A6.13) | intentionally beyond MVP-1 | Post-MVP-1 feature stages, by demand |
| **v5 hardening** (E2E for new surfaces, visual-regression lock, Vercel deploy + prod Lighthouse) | quality, not features; deploy gated on `VERCEL_TOKEN` | Stage H — hardening goal |
| **Tier-3 strategic: mvp/ vs production-app consolidation; v5→v6 SaaS** | portfolio-level decision (ADR-0001) | `TODO(5W):` — 5Wealths session, not repo-level |

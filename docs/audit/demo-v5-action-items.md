# FIREKaro Demo v5 — Action Items (Sequenced)

**Source:** `docs/audit/demo-v4-vs-research-audit.md` (36-entry audit, ratified 2026-05-27 → 2026-05-28)
**Purpose:** Execution-ready sequence of ~215 MVP-1 action items + ~40 deferred MVP-2/3+ items, with dependencies + file paths.
**How to use:** Work top-down. Items within a tier can run in parallel UNLESS a `← depends-on` arrow exists. Bold IDs (e.g., **A1.1**) cross-reference the audit doc entries.

---

## Sequencing principle

Build foundation first, then layers that depend on it. Concretely:
1. **Schema extensions** (no functional change yet — pure type/store work)
2. **Library modules** (math, derivations, tax — pure functions)
3. **`/preferences` page** (canonical home for all R1 overrides; load-bearing for every entry)
4. **Surface integrations** (Dashboard chips, glossary, nudges, tooltips)
5. **New routes** (/preferences, /investments/buckets, /fire-goals/stress-test, /estate-planning)
6. **Behavioral guardrails** (Cluster E snapshots/nudges — depends on everything above)
7. **Framing pass** (Cluster F microcopy + trust pill)

---

## MVP-1 Sequence

### Phase 1 — Schema foundation (week 1)
*Pure type changes. Zero functional change. Enables all subsequent work.*

| Action | What | File | Depends on |
|---|---|---|---|
| **A1.2** | Add per-member `planToAge` field (default 90, R1) | `types/household.ts` | — |
| **A3.6** | Add `inflationBucket` to recurring + planned expenses | `types/household.ts` | — |
| **A6.1** | Extend recurring `kind: general/parents/extended-contingency` | `types/household.ts` | — |
| **A6.2** | Extend planned `kind: general/education/marriage` | `types/household.ts` | — |
| **A6.3** | Add `extendedFamilyContingencyPercent` (default 7.5%) | `types/household.ts` | — |
| **A7.1** | Add `glidePath` schema (algorithm + perYearOverrides) | `types/household.ts` | — |
| **A8.1** | Add `bucket: 1\|2\|3\|4\|undefined` to investments | `types/household.ts` | — |
| **A10.1** | Add `healthcareCorpusReservationPercent` (default 20%) | `types/household.ts` | — |
| **A10.2** | Extend recurring kind with `'medical'` | `types/household.ts` | A6.1 |
| **A10.3** | Extend planned kind with `'medical'` | `types/household.ts` | A6.2 |
| **A18.1** | Add `'International'` to investmentType + `internationalRoute` | `types/household.ts` | — |
| **A19.2** | SGB purchase-year tracking | `types/household.ts` | — |
| **A20.1** | Add `realEstateRole` field (PrimaryResidence/Investment/Inherited) | `types/household.ts` | — |
| **A20.3** | Add `'REIT'` to investmentType | `types/household.ts` | — |
| **A23.1** | Add `coBorrowers: memberId[]` to liabilities | `types/household.ts` | — |
| **A24.1-2** | Add ESOP `grantorCountry` + `exercisePrice` + `fmvAtVest` + `vestedValueINR` | `types/household.ts` | — |
| **A28.3** | Add `isAutomated` flag to investments | `types/household.ts` | — |
| **A35.2** | Estate planning checklist schema (7-step) | `types/household.ts` | — |

### Phase 2 — Library modules (week 2)
*Pure functions. Math + derivations. Drive all UI surfaces.*

| Action | What | File | Depends on |
|---|---|---|---|
| **A1.1** | Horizon-driven SWR resolver (5-step bracket) | `lib/fire-math.ts` (replace getAdjustedSWR) | A1.2 |
| **A2.1** | Replace calculateFIREVariants (expense-base multipliers) | `lib/fire-math.ts` | A1.1 |
| **A2.2** | Barista hybrid (simple + active-income toggle) | `lib/fire-math.ts` | A2.1 |
| **A2.3** | Coast FIRE calculator | new `lib/coast-fire.ts` | A1.1, A3.1 |
| **A3.1** | 4-bucket inflation + computed blend (7.9% default) | `lib/fire-math.ts` | A3.6 |
| **A4.1** | Per-type return defaults; FD per-instance honored | `lib/fire-math.ts` (constants) | — |
| **A4.3** | Replace DEFAULT_RETURNS with portfolio-weighted | `lib/fire-math.ts` projection | A4.1, A4.7 |
| **A4.7** | Allocation auto-derive from holdings | `lib/fire-math.ts` | — |
| **A5.3** | Horizon sanity validation | Pinia validators | A1.2 |
| **A7.2** | Pfau-Kitces glide-path algorithm | new `lib/glide-path.ts` | A7.1 |
| **A9.2** | Floor/Ceiling withdrawal rule | new `lib/withdrawal-strategy.ts` | — |
| **A10.5** | Healthcare-corpus reservation in FIRE target | `lib/fire-math.ts` | A10.1 |
| **A12.2** | `deriveDeductions` function | new `lib/tax-deductions.ts` | — |
| **A13.1** | Marginal-relief trap detection | `lib/tax-deductions.ts` | A12.2 |
| **A14.1** | NPS withdrawal modeling (PFRDA 2025) | new `lib/nps-withdrawal.ts` | — |
| **A14.2** | Annuity income in retirement projections | `lib/fire-math.ts` | A14.1 |
| **A15.1-3** | EPF/VPF threshold + tax on excess | new `lib/epf-vpf.ts` | — |
| **A19.1** | Per-subtype Gold tax | `lib/fire-math.ts` projection | A4.1 |
| **A24.3-4** | ESOP perquisite + capital-gains layers | new `lib/esop-tax.ts` | A24.1, A24.2 |
| **A29.1, A30.1** | Snapshot infrastructure | new `lib/expense-history.ts` | — |
| **A1.7** | Income-bucket method (Pattu) | new `lib/income-bucket-math.ts` | A3.1 |
| **A6.10** | Family-layer aggregate on top of FIRE | `lib/fire-math.ts` | A6.1, A6.3 |
| **A8.5** | Bucket years-of-coverage math | derived | A8.1, A3.1 |

### Phase 3 — `/preferences` page (week 3)
*Canonical home. Every R1 override lives here. Required by every consumer surface.*

| Action | What | Where | Depends on |
|---|---|---|---|
| **R1.2** | Create `/preferences` route | new `pages/preferences/Index.vue` + router | — |
| **A1.6 / A4.2 / A6.6 / A7.5 / A8.x / A10.x / A12.4 / A18.3 / A20.2 / A35.2** | Sections: Core / Inflation / Returns / FIRE Variants / Family / Glide Path / Withdrawal / Tax / Statutory Reference / Estate | sections within /preferences | Phase 1 schemas |
| **R1.5** | Per-row + global "Reset to default" | UI controls | section infrastructure |
| **R1.4** | Statutory Reference (read-only) populated: PPF / EPF / 80C / 80CCD(1B) / 80D / VPF threshold / LTCG / Sec 87A / PFRDA 2025 / LRS / SGB / Sec 24 / 17(2)(vi) | UI display | Phase 2 lib data |
| **A14.5** | PFRDA 2025 in Statutory Ref | UI | — |
| See: `preferences-page-spec.md` for full schema. | | | |

### Phase 4 — Surface integrations (week 4-5)
*Consumer surfaces (Dashboard, /tax-planning, /investments, /expenses, /fire-goals).*

| Action group | What | Where | Depends on |
|---|---|---|---|
| **A1.5, A2.5, A3.3, A4.8, A5.2, A7.4** | Dashboard hero displays + chips + deep-links to /preferences | `pages/fire-goals/Dashboard.vue` | Phase 3 |
| **A2.5** | Variant chip layout (3 chips + Coast callout + Barista card) | Dashboard | A2.1, A2.2, A2.3 |
| **A6.7** | `<FamilyLayerCard>` on Dashboard | Dashboard | A6.1-3 |
| **A8.2, A8.3** | New `/investments/buckets` sub-route | new `pages/investments/Buckets.vue` + router | A8.1 |
| **A12.1, A12.3, A12.5, A12.6** | /tax-planning auto-deductions + decision rule + 80CCD callout | `pages/tax-planning/Index.vue` | A12.2 |
| **A13.2, A13.3, A13.4** | Marginal-relief chip + cliff chart + mitigations | `pages/tax-planning/Index.vue` | A13.1 |
| **A14.3** | NPS planning recommendation card | `pages/investments/Holdings.vue` | A14.1 |
| **A15.4, A15.5** | EPF/VPF threshold display + mitigation guidance | `pages/investments/Holdings.vue` | A15.1-3 |
| **A17.2** | Under-utilization nudges (PPF/NPS/80CCD(2)) | `lib/family-nudges.ts` | — |
| **A18.2** | International route selector + LRS warning | `components/forms/InvestmentForm.vue` | A18.1 |
| **A20.4** | Illiquidity warning on Investment RE | Holdings | A20.1 |
| **A23.2-3** | Loan form co-borrower selector + tax doubling | `components/forms/LoanForm.vue` + tax calc | A23.1 |
| **A24.5, A24.6** | Cliff-bunching + foreign-RSU nudges | nudge engine | A24.1-4 |
| **A29.3** | YoY expense chart | `pages/expenses/Overview.vue` | A29.1 |
| **A30.3** | FIRE-number trajectory chart | Dashboard | A30.1 |

### Phase 5 — New routes (week 5)
*Three additional new routes beyond /preferences.*

| Action | What | Where | Depends on |
|---|---|---|---|
| **A8.2** | `/investments/buckets` | new sub-route | A8.1 |
| **A27.1** | `/fire-goals/stress-test` | new sub-route | Phase 2 math + A26.1 |
| **A35.1** | `/estate-planning` top-level | new route + sidebar entry | A35.2 |
| **A21.1** | Coast FIRE projection (chart on /preferences OR new sub-route) | TBD | A2.3 |

### Phase 6 — Nudge engine extensions (week 6)
*Cluster B/C/D/E/F nudges fanning out from `lib/family-nudges.ts` (rename to `lib/nudge-engine.ts` — broader than family).*

| Action group | Coverage |
|---|---|
| **A6.8** | Family-layer nudges (children → education, married+35+ → parents, dependents → marriage) |
| **A6.12** | First-time family-layer banner |
| **A10.4** | Healthcare buffer nudge |
| **A11.2** | Sandwich-gen nudges (SCSS / Sukanya / 80D parents / joint family loan) |
| **A16.3** | Mar 15 LTCG harvesting reminder |
| **A17.2** | Under-utilization (PPF / NPS / 80CCD(2)) |
| **A18.4** | International exposure nudge |
| **A20.6** | Primary-residence exclusion nudge |
| **A22.2** | HUF qualifier nudge |
| **A23.4** | Joint home loan nudge |
| **A24.5, A24.6** | ESOP cliff + foreign-RSU |
| **A28.2** | Auto-debit nudges |
| **A29.2** | Lifestyle inflation nudge |
| **A30.2** | Goal-post-shift nudge |
| **A35.x** | Estate gap nudges |

### Phase 7 — Glossary + microcopy (week 7)
*Final framing pass.*

| Action group | What |
|---|---|
| Cumulative glossary entries from every cluster (A33.1 audit) | ~50 entries |
| **A33.2** | 5 missing high-value terms (AY / AMFI / PFRDA / RBI Master Direction / Schedule FA) |
| **A33.3** | Glossary search + categorization |
| **A32.1-3** | Microcopy audit + replacement (US → Indian-planner voice + research citations) |
| **A34.1-2** | Extend trust pill (research / no-affiliations / planner-voice) |
| **A4.4, A6.11, A7.6, A8.6, A9.3, A10.6, A11.1, A14.6, A15.7, A16.2, A17.1, A18.5, A19.5, A20.5, A22.1, A23.5, A24.7, A26.2, A27.5, A28.1, A29.4, A30.4** | Per-entry glossary additions |

### Phase 8 — Seeds + tour (week 7)
| Action | What |
|---|---|
| **A26.1** | WhatIf 6 seed scenarios (3 positive + 3 stress-test) |
| **A31.1-4** | Sharmas seed update (city, planToAge propagation, parents bucket, education target) |
| **A21.4, A36.5** | Tour extensions (Coast/Barista paths + estate planning step) |

---

## MVP-2+ Deferred (~30 items)
*Validated user demand or external integrations required.*

- **A1.7** Income-bucket alternative computation engine (Pattu) — actually scheduled MVP-1 per Entry #1 Point 4 lock; verify scope feasibility during implementation
- **A1.8** Stress-test slider on Dashboard — same situation
- **A3.7** Conservative-tail toggle (healthcare 16%)
- **A6.13** Per-parent / per-child specialized breakdown
- **A8.8** Dynamic bucket rebalance recommendations
- **A9.6** Guyton-Klinger + VPW withdrawal rules
- **A10.7** Senior-citizen insurance flag
- **A10.8** Insurance-recommendation engine
- **A11.5** Sandwich-gen Dashboard card
- **A14.x** (Tier-2 NPS modeling)
- **A16.4** Per-holding LTCG harvest calculator (requires cost-basis tracking)
- **A17.x** Dedicated /preferences§Optimization page
- **A18.6** LRS-TCS tracking + DTAA-credit modeling
- **A19.6** SGB issuance-window reminders
- **A20.7** RE yield-test calculator + reverse-mortgage modeling
- **A22.4** Full HUF schema modeling
- **A23.x** Dedicated /sandwich-gen-tax page
- **A24.8** Month-by-month vest-schedule modeling
- **A34.3** Dedicated /trust page

## MVP-3+ Deferred (~8 items)
- **A3.8** Auto-classification routing (requires expense `category` field)
- **A8.9** Automated bucket-based withdrawal sequencing

---

## Implementation timeline (estimate)

| Phase | Duration | Cumulative |
|---|---|---|
| 1 Schema | 1 week | 1 week |
| 2 Libraries | 1 week | 2 weeks |
| 3 /preferences | 1 week | 3 weeks |
| 4 Surface integrations | 2 weeks | 5 weeks |
| 5 New routes | 1 week | 6 weeks |
| 6 Nudge engine | 1 week | 7 weeks |
| 7 Glossary + microcopy | 1 week | 8 weeks |
| 8 Seeds + tour | 0.5 week | 8.5 weeks |
| **Total MVP-1** | | **~8-9 weeks** |

This assumes 1 full-time dev. Two devs could parallelize Phases 1+2 with Phases 4+6, compressing to ~6 weeks.

---

## Cross-cutting rules (locked through audit)
- **R1** — Default + Override; every planning assumption editable on /preferences
- **R1.4** — Statutory facts strictly read-only, never editable even in scenarios
- **R1.5** — Per-row + global Reset affordances
- **R2** — Verify Before Propose (every entry reads v4 source first; observed across 36 entries)

---

## Open questions / coordination notes
- **Income-bucket method (A1.7)** scope feasibility within MVP-1 — flagged at lock time as MVP-1, but is a non-trivial second computation engine. May slip to MVP-2 if scope pressure emerges.
- **Glide-path projection integration with Coast FIRE (Entry #2 A2.3)** — Coast formula assumes static real return; projection chart uses year-by-year glide. Document the inconsistency in glossary so users don't conflate.
- **Real estate `realEstateRole` migration** for existing v4 users with RE holdings — backfill prompt on first MVP-1 load: "Tag your real estate as PrimaryResidence or Investment to apply research-grounded inclusion rules."
- **Nudge engine UX** — risk of nudge fatigue. Cap at 3-4 active nudges at once; rotate; allow global dismiss-all in /preferences §Family (A6.6 already includes this).

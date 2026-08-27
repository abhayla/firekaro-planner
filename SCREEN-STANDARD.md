# FIREKaro MVP — Screen Standard (LIVING DOCUMENT)

> **Status:** v1.1 (all header-bearing screens conformed to `LeafPageHeader`; the table/form sub-standard (§10b) is the only remaining open item). Still a living document — see §0.
> **Last updated:** 2026-05-29
> **Scope:** the `mvp/` tree (v5 MVP) — every user-facing screen under `src/pages/`.
> **Canonical SoT:** this file. If a screen and this doc disagree, this doc wins (and the screen is a conformance bug to fix).

---

## 0. Governance — how this standard evolves (READ FIRST)

This is a **living document**, not a one-time spec. The rules:

1. **Single source of truth.** This file defines the look & structure of *every* MVP screen. All screens conform to it.
2. **Improvements flow UP then OUT.** When we improve any screen and the change is a *reusable pattern* (not screen-specific content), we:
   - (a) add/update the rule here, bump the version,
   - (b) add a row to the **Changelog** (§12),
   - (c) propagate the change to **all already-conformed screens** (see Conformance Matrix §11), and
   - (d) mark any not-yet-conformed screens to pick it up when they're done.
3. **No silent divergence.** A screen MUST NOT introduce a new visual/layout pattern that isn't in this doc. Either it reuses an existing rule, or the new pattern is promoted into this doc first (then applied everywhere).
4. **Versioning.** `v0.x` was the iteration phase on the reference screen. **Ratified `v1.0` on 2026-05-29** — tax-planning was user-approved and the standard was applied cleanly to all 28 screens. Post-v1.0, bump **minor** (`v1.1`, `v1.2`, …) for a new/changed reusable pattern propagated per rule 2, and **major** (`v2.0`) only for a baseline visual-language overhaul.
5. **Reference screen.** `/tax-planning` is the ratified baseline — whatever look was approved there is what every other screen is held to. Future patterns are still prototyped on one screen, approved, then promoted here and propagated.

**For future Claude sessions:** before touching ANY `mvp/` screen, read this file. Conform to it. If the user approves a new pattern on a screen, update this doc + propagate per rule 2 in the same session.

---

## 1. Foundations (already built — reuse, don't reinvent)

- **Tokens:** `src/styles/tokens.css` — type scale (`--type-*`), spacing (`--space-1..8` = 4–64px), radii (`--radius-md` 8px cards), shadows (`--shadow-sm/md`), PL-blue primary, semantic `success/error/warning/info`, gray scale, surfaces, text, borders, focus ring.
- **Motion:** `src/styles/motion.css` + `@vueuse/motion`.
- **Fonts:** Inter (UI / display, tracking-tight on headings) + JetBrains Mono (all numerics).
- **Design-system primitives:** `src/components/income-layout/` — `StatDashboard` (KPI strip + donut + viz), `LeafPageHeader`, `CashflowStrip`, `RankedBars`, `FeaturedRail`, `AddTypeChips`, `EntryDialog`; `src/components/shared/` — **`PanelCard`** (content card — §5), **`MetricCard`** (KPI tile — §4a), **`ProportionBar`** + **`LimitMeter`** (data-viz — §5a), `DiscoveryFooter`, `EmptyState`, `LoadingSkeleton`, `ErrorRetry`; `src/components/income-layout/RankedBars.vue` (ranked share bars).

## 2. Page shell
`fluid` container, `py-6`, consistent max-width + side padding. One vertical rhythm via spacing tokens.

## 3. Page header
`LeafPageHeader` (or equivalent): eyebrow + H1 (display font, `--tracking-tight`) + one-line description. Identical pattern on every screen. `LeafPageHeader` exposes an optional `#actions` slot for header-level controls (right-aligned, wraps below on mobile) — used by the FIRE Dashboard / What-If screens for their edit-profile / reset-levers buttons, and by `/tax-planning` for its **page-local "Tax year" picker** (the only manual FY control in the app; the Financial Year is otherwise auto-derived from the wall clock, not a global app-bar selector — see `.claude/rules/financial-year-handling.md`).

## 4. Hero stat strip
Every screen opens with a `StatDashboard`-style KPI strip: 3–5 tiles (`eyebrow` + mono `value` + `meta`), **exactly one `accent` primary metric**, optional donut/viz on the right.

## 4a. Metric tiles
KPI/metric tiles (label + big mono value + optional delta + optional sparkline) **use the `MetricCard` component** (`src/components/shared/MetricCard.vue`) — do NOT hand-roll `metric-card` divs. Props: `label`, `value`, `unit?`, `valueColor?`, `delta?`/`deltaFormat?`/`deltaInvert?`/`deltaMeta?`, `sparkline?`/`sparklineColor?`, `footnote?`; `#footer` slot for chips. Lay tiles out in a `v-row dense` with `<v-col cols="12" sm="6" md="3">`.

## 5a. Data-viz primitives (turn lists into glanceable visuals)
Prefer these over flat lists/grids wherever the data fits — they're the standard's visual language:
- **`RankedBars`** (`income-layout/`) — a breakdown of amounts → icon + label + amount + share bar + %. Use for any "by source / by category" list (income sources, expense categories, holdings).
- **`ProportionBar`** (`shared/`) — a composition → one stacked bar + legend. Use for any "where it goes" split (tax breakdown, take-home, net-worth allocation, cash-flow in/out).
- **`LimitMeter`** (`shared/`) — used vs cap → label + `used / limit` + progress bar. Use for any headroom (deduction limits, budget vs cap, score vs max-weight, goal funding).

## 5b. Entity lists
Lists of records (holdings, policies, loans, recurring expenses, …) **use `EntityRow`** (`shared/EntityRow.vue`) inside a `PanelCard` under a `section-eyebrow` — NOT cramped `v-list-item` titles. `EntityRow` = leading icon/chip (`#leading`) + bold `title` + `#meta` line + prominent mono `value` + `#trailing` (chip + edit/delete), with dividers + hover. Pass `accent` (theme name or raw CSS color) for a category-colored left stripe — colour-code lists by category (asset class, policy type, …) so they're not monochrome. Pair with an "Add …" `PanelCard` form above it.

## 5c. Toggle rows
A `v-switch` in a list row goes in **`#append`** (trailing/right), never `#prepend` — the prepend slot reserves only icon-width (~40px) and a switch is wider, so it overlaps the label. Label + description on the left, toggle on the right (conventional settings layout). A global guard in `tokens.css` (`.v-list-item .v-switch { flex: 0 0 auto }`) keeps any toggle list safe regardless.

## 5. Cards
**Use the `PanelCard` component (`src/components/shared/PanelCard.vue`) — do NOT hand-roll `<v-card variant="outlined">` + a `card-head` div.** PanelCard is the canonical content card: outlined, `--radius-md` (8px), `pa-4`, with a standardized header (`icon` + `title` + optional `eyebrow` + `#actions` slot, title as a real heading element via `headingLevel` for a11y) and a single body region resolved in strict priority **loading → error → empty → body** (composing `LoadingSkeleton` / `ErrorRetry` / `EmptyState`; emits `@retry` / `@cta`). Pass `to` to make the whole card an interactive link (hover lift, keyboard nav, focus ring). The precedence logic is unit-tested in `src/lib/panel-card-region.spec.ts`.

A `section-eyebrow` label groups a row of PanelCards above them. Header-less PanelCards (no `title`/`icon`) are fine when the section-eyebrow already labels a lone card.

```vue
<PanelCard title="Income consolidation" icon="mdi-cash-multiple" icon-color="success"
           :loading="q.isPending" :error="q.error?.message" :empty="rows.length === 0">
  <template #actions><v-btn size="small" variant="text">Edit</v-btn></template>
  …body…
</PanelCard>
```

## 6. Numerics
**All** money / percent / counts render in JetBrains Mono via `.text-currency` / `.font-mono` (tabular-nums). Sign positive deltas with `+`. Format via `formatINRCompact` / `formatINR` / `formatPercent` from `src/lib/formatters.ts`.

## 7. Color & semantics
Token-driven only — **no ad-hoc hex**. `success`=gains/positive, `error`=losses/negative, `warning`=caution, `info`=notes/explanations, primary-blue=emphasis/CTA.

## 8. Motion
Staggered section/card entrance via `motion.css` / `@vueuse/motion`. **Always** guarded by `prefers-reduced-motion`.

## 9. States
Three-state render: content / loading skeleton / `EmptyState`. Defensive throughout: `?.`, `?? 0`, `isFinite()`, ÷0 guards (denominator `> 0`).

## 10. Responsive & A11y
**The app is responsive (desktop + mobile).** Below the `md` breakpoint (<960px) the 260px sidebar collapses to a **temporary overlay drawer** toggled by an app-bar hamburger (`SidebarLayout.vue`, driven by `useDisplay().smAndDown`; drawer state tracks the breakpoint — open on desktop, closed on narrow); on desktop it stays a permanent rail. Content grids use `cols 12 / sm / md` to flex across widths, and the `StatDashboard` / `dash-kpi` grids already reflow to 2-up under 900px.

A11y: WCAG-AA contrast (token `--text-secondary`), `aria-label` on every icon-only button (incl. the nav toggle), token focus ring, axe-clean.

---

## 10b. Screen archetypes (scope of this standard)

This standard's **hero + PanelCard + MetricCard** patterns target **dashboard-overview** screens (a section landing page summarizing data). Other archetypes legitimately differ and should NOT be force-fit:

- **Settings** (`/preferences`): sticky section-nav + editable rows. Uses tokens + states, but not the hero/card components.
- **Score/diagnostic** (`/financial-health` score): a unique score visualization — header conformed, viz kept custom.
- **Data-table / form** child pages (loans, policies, holdings, salary grid, recurring, etc.): a future **table/form sub-standard** (not yet defined).
- **Wizard** (`/wizard/*`): its own onboarding flow.
- **Express intake** (`/quick`, T-378): the ten-card front door. Layout-less like Splash/Login, one
  question per card, a lakh-denominated money input with a live ₹ preview, progress dots, and a
  Back/Next pair — deliberately NOT the hero/MetricCard language, because a question is not a
  verdict. Its RESULT screen is the exception: it renders the SAME `<FireHero />` the dashboard
  shows (never a copy), so the express number and the planner number cannot drift.

**All archetypes still share:** the page header pattern (LeafPageHeader where a header exists), tokens, numerics, motion, three-state rendering, a11y, and the global `.section-eyebrow`.

## 11. Conformance Matrix (per-screen status)

| Screen | Route | Status | Notes |
|---|---|---|---|
| **Tax Planning** | `/tax-planning` | ✅ **reference baseline** | User-approved 2026-05-29. LeafPageHeader + StatDashboard hero + RankedBars + LimitMeter + ProportionBar + per-earner table + chip DiscoveryFooter. The look every other screen is held to. |
| Income Overview | `/income/overview` | ✅ conformed | Origin of the design-system primitives. |
| Income leaves (salary, business, other-sources) | `/income/*` | ✅ conformed | On the shared income design-system (StatDashboard hero + FeaturedRail — richer than EntityRow, intentionally kept). |
| Profile | `/profile` | ✅ conformed | Redesign + empty-states + staggered entrance. |
| Expenses (overview + recurring + planned) | `/expenses/*` | ✅ conformed | LeafPageHeader + PanelCard + MetricCard ×4; recurring/planned on colour-coded EntityRow; overview timeline → EntityRow (v0.21). |
| Investments (overview + holdings + buckets) | `/investments/*` | ✅ conformed | Overview: LeafPageHeader + MetricCard ×5 + bespoke corpus hero (one-off). Holdings + Buckets: asset-class colour-coded EntityRow via shared `typeColor()`. |
| Liabilities (overview + loans) | `/liabilities/*` | ✅ conformed | Overview MetricCard ×4; Loans colour-coded EntityRow by loan type. |
| Insurance (overview + policies) | `/insurance/*` | ✅ conformed | Overview MetricCard ×4 (icon labels + #footer adequacy chips); Policies cover-type colour-coded EntityRow. |
| Financial Health (all 6 pages) | `/financial-health/*` | ✅ conformed | Score page: LeafPageHeader + freedom-score hero + factor cards (unique score viz, intentionally custom per §10b). Net-worth/cash-flow/banking/emergency-fund/reports on MetricCard / EntityRow / LimitMeter / PanelCard. |
| FIRE Goals (roadmap) | `/fire-goals/goals` | ✅ conformed | LeafPageHeader + PanelCard per goal. |
| Preferences | `/preferences` | ✅ N/A (settings archetype) | Sticky section-nav + editable rows; toggles in `#append` (§5c). Tokens/states only — hero/cards don't apply (§10b). |
| FIRE Dashboard | `/fire-goals/dashboard` | ✅ conformed (**Option-D pattern** + **gap hero**, v1.3) | The Option-D verdict-dashboard archetype (design SSOT: `docs/design/2026-06-10-fire-dashboard-redesign/option-d-merged.html` — outranks prose). Anatomy: `LeafPageHeader` → slim badge+horizon chip line → **gap hero** (`FireHero`, v1.3 — design SSOT `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html`, which outranks this prose: eyebrow "To retire at" + big **target** age + need line showing today's ₹ AND the nominal figure **once each** + optional gut-feel line + four solver numbers [need · you'll-have-by-target · gap · **do this** ₹/month] + a live 40–75 retirement-age **slider** (dynamic floor `max(40, anchor+1)`, shared with WhatIf's pre-existing ceiling — #64 class) with the "+3 years → ₹X" hint and a "Set as my target" persist CTA + the DEMOTED current-pace annotation carrying the confidence range and the since-you-were-away delta + the 3-slot KPI strip [vs-plan w/ canonical lock CTA · corpus progress · biggest win] + compact stats; tint by plan-variance tone — success/warning/neutral, never red) → paired `v-row dense` viz-card rows (bridge **unlock-timeline** \| runway **gauge**; plan-variance **waterfall** \| wins **impact bars**) → milestone **ladder** → individual-FIRE \| donut → family-layer (full-width, self-hides without sandwich-gen commitments; the Iyers tour anchors `.family-layer-card`) → projection chart (md-8) \| severity-coded suggestions (md-4, estate+stress folded in) → trajectory → SectionCard tiles → TrustPill + DiscoveryFooter. The reusable SVG primitives live in `src/components/dashboard/viz/` (`BridgeUnlockTimeline`, `RunwayGauge`, `PlanVarianceWaterfall`, `WinsImpactBars`, `MilestoneLadder`) — pure props-in/SVG-out, the Phase-2 propagation source for Readiness/Decumulation/Stress-test/Goals. Honesty surfaces are NON-REMOVABLE: confidence band, household-primary headline, bridge verdict, runway market-warning, waterfall all-zero fallback, milestone explainers — and (v1.3) the demoted current-pace age, both today's-₹ and nominal shown once each, the `unknown` gap tone making NO claim, and "Move the age" instead of a fabricated amount when the target is unreachable. Every hero number comes from `src/lib/required-contribution.ts` (which solves through `derive()`) — the component computes no money of its own. |
| FIRE What-If | `/fire-goals/what-if` | ✅ conformed | On `LeafPageHeader` (`#actions` = saved-count chip + Reset-to-baseline) + `delta-hero` + lever controls. **v1.3:** its retirement-age slider reads/writes the SAME session-only `ui.whatIfTargetAge` as the dashboard gap hero — one field, two controls, no drift (#64 class). |
| FIRE Stress-Test | `/fire-goals/stress-test` | ✅ conformed | On `LeafPageHeader`; results list → colour-accented `EntityRow` (pass/fail icon + accent + delta chip) in a `PanelCard`. |
| Estate Planning | `/estate-planning` | ✅ conformed | On `LeafPageHeader`; checklist archetype rows kept as-is (intentional per §10b). |

Legend: ✅ conformed · 🔄 v1.x follow-up (token-consistent, header not yet on LeafPageHeader) · ⚠️ diverged (needs re-conform)

**v1.x backlog:** cleared 2026-05-29 — all header-bearing screens are on `LeafPageHeader`. Open: the table/form sub-standard (§10b) remains undefined.

---

## 12. Changelog

| Version | Date | Change | Propagated to |
|---|---|---|---|
| **v1.5** | 2026-08-27 | **Move-picker pattern** (`LeverPicker`, T-379 / QN-5; same mockup SSOT `option-c-merged.html`): the card that turns the hero's shock into something actionable — a row per move (checkbox + one-line note + its effect), the plan-summary sentence, and the verbatim honesty line. Rules established: (a) it is ONE component mounted twice — the `/quick` result and the BODY of the dashboard `AccelerationCard` — so the two screens cannot drift, and the retained years-saved KPI sits ABOVE it (two questions, two views: "when can I stop?" vs "what must I find each month?"); (b) **nothing is switched on by default** — a silently-on lever would inflate the headline; (c) an unavailable move is greyed and STATES ITS REASON, never a silent blank; (d) the effect metric adapts to honesty rather than always printing a rupee figure — `saving` (₹ less to find), `rescue` ("makes it reachable"), `not-enough-alone` ("helps, not alone") — because on an unreachable baseline five identical "−₹0/mo" rows read as *nothing you do matters*; (e) a lever's copy states its NOMINAL headline and its REAL value in the same breath ("10% a year (about 3.8% after inflation)") whenever the kernel consumes a real-frame figure; (f) no commit button is offered for a plan the same card just called impossible. | quick (✅), fire-goals/dashboard (`AccelerationCard` body ✅). |
| **v1.4** | 2026-08-27 | **Express-intake pattern** (`/quick`, T-378 / QN-1+QN-4; same mockup SSOT `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html`): ten single-question cards → the gap hero. Rules established: (a) card copy lives in ONE testable module (`src/lib/quick-number-copy.ts`) because a "total" question written as a list reads as exclusive — a spec now asserts every total question says ALL, names stocks, and states the single exclusion; (b) the result screen REUSES `<FireHero />` rather than restating it, so rule-26 coherence is structural; (c) the QN-4 explainer ("why so big" + "how we got this") is one component rendered on the quick result AND collapsed inside the dashboard hero, and its steps must ADD UP to the headline beside them; (d) a simplification the screen makes (the single equity line) is stated on the screen, not buried. | quick (✅ new), fire-goals/dashboard (explainer panel ✅). |
| **v1.3** | 2026-08-27 | **Gap-hero pattern** for the FIRE dashboard (T-377 / QN-2; mockup SSOT `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html`): the headline is the age the user WANTS, not the age the current pace produces — "To retire at 50 you'll need ₹X (today's) / ₹Y (2046)" — with need / have-by-target / gap / do-this and a live retirement-age slider bound to the session-only `ui.whatIfTargetAge` shared with `/fire-goals/what-if`. The old headline claim is demoted to the pace annotation; every prior honesty surface is retained. New `GapTone` sits ALONGSIDE the untouched plan-variance `HeroTone` — two signals, two types. | fire-goals/dashboard (✅), fire-goals/what-if (slider binding). |
| **v1.2** | 2026-06-10 | **Option-D FIRE-dashboard pattern** (Abhay-approved 2026-06-10; mockup SSOT `docs/design/2026-06-10-fire-dashboard-redesign/option-d-merged.html`): verdict hero w/ KPI strip + five reusable SVG viz primitives (`src/components/dashboard/viz/`) replacing the prose-card wall; estate/stress chips → severity suggestions; LifecycleDigest delta folded into the hero subline (card unmounted from the dashboard, deep-link anchor on the hero). Phase-2 propagation of the viz language to Readiness/Decumulation/Stress-test/Goals is the open follow-up. | fire-goals/dashboard (✅). |
| **v1.1** | 2026-05-29 | Added optional `#actions` slot to `LeafPageHeader` (right-aligned, wraps on mobile, backward-compatible with all existing consumers); brought the 4 bespoke-header screens (FIRE Dashboard, What-If, Stress-Test, Estate Planning) onto it. Stress-Test results list → `EntityRow`. All header-bearing screens now share the standard header (§10b). | fire-dashboard, what-if, stress-test, estate-planning (✅). |
| v0.1 | 2026-05-29 | Initial standard codified from existing income + Profile design language. | — (baseline) |
| **v1.0** | **2026-05-29** | **Ratified.** `/tax-planning` user-approved as the baseline; rule-4 criteria met and far exceeded (applied across the app, not just ≥1 screen). All overview/leaf/list screens conformed to the primitives; final-review sweep clean (28/28 routes 0 console errors, no affordance/hardcoded-colour/redundant-copy issues). 4 bespoke-header screens (FIRE Dashboard, What-If, Stress-Test, Estate Planning) are token/state/a11y-consistent but not yet on `LeafPageHeader` — tracked as v1.x follow-ups in §11. The standard graduates from draft; living-document governance (§0) continues. | — (milestone). |
| v0.21 | 2026-05-29 | Final-review consistency sweep: two flat `v-list` holding/timeline lists → standard `EntityRow` (Expenses overview "Planned future timeline" + Investments Buckets per-bucket holdings — both now match the icon/accent/mono-value treatment used everywhere else). Extracted the per-asset-class colour to a single `typeColor()` in `investment-traits.ts` (alongside `typeLabel()`); InvestmentForm now imports it instead of a local copy (DRY). Confirmed app-wide: 28/28 routes 0 console errors, no poor-affordance Cancel buttons, no hardcoded hex in templates, all EmptyStates meaningful. | expenses-overview, investments-buckets (✅); investment colour now single-sourced. |
| v0.20 | 2026-05-29 | **DiscoveryFooter** ("Looking for something else?") redesigned: plain `<ul>` of `label — copy` (the copy often just restated the label) → flex-wrap of clickable outlined `+ <label>` chips, each deep-linking to `/preferences#pref-section-features`; richer `discoveryCopy` kept as a hover tooltip only when it adds info beyond the label (`meaningfulCopy()`). Shared component → propagates to all 8 pages that mount it. | discovery-footer (✅) — tax-planning, fire-goals×3, investments×2, estate-planning. |
| v0.19 | 2026-05-29 | **Toggle-row convention (§5c):** a `v-switch` in a list row goes in `#append` (right), never `#prepend` (overlapped the label). Fixed Preferences feature toggles; added a global `tokens.css` guard (`.v-list-item .v-switch { flex: 0 0 auto }`) so any toggle list is safe app-wide. | preferences (✅); global guard covers all screens. |
| v0.18 | 2026-05-29 | Conformed the last 6 child pages: Planned (EntityRow), Banking (MetricCard + EntityRow), NetWorth (MetricCard + breakdown EntityRows), CashFlow (MetricCard ×4), EmergencyFund (LimitMeter vs 6-mo target), Reports (PanelCard sections). All on LeafPageHeader + standard components. **Every screen now conformed.** | planned, banking, net-worth, cash-flow, emergency-fund, reports (✅). |
| v0.17 | 2026-05-29 | Applied the EntityRow+PanelCard-form+colour treatment to Loans (LoanForm — colour by loan type) and Recurring (RecurringExpenseForm — amber commitments + source-coded auto-flowed). Salary left as-is (already on FeaturedRail + StatDashboard — richer). | loans, recurring (✅). |
| v0.16 | 2026-05-29 | `EntityRow` gained an `accent` left-stripe (theme name / raw CSS) for category colour-coding. Holdings colour-coded by asset class (equity/debt/RE/gold), Policies by cover type (Health green / Life blue / Vehicle amber) + colored chips/icons. | holdings, policies (✅). |
| v0.15 | 2026-05-29 | First table/form-archetype conformance + new `EntityRow` (§5b). investments/Holdings + insurance/Policies: LeafPageHeader, "Add …" PanelCard forms, and cramped v-list rows → EntityRow (icon + title + meta + mono value + chip/actions). | holdings, policies (✅). |
| v0.14 | 2026-05-29 | Propagated data-viz: investments → asset-allocation `ProportionBar` (ProportionBar gained raw-CSS-color support for the gold hex); insurance → adequacy `LimitMeter` (cover vs 10×income / family-floater min). Skipped liabilities DTI (lower-is-better — LimitMeter's "maxed ✓" would mislead) and financial-health (already bar-based). | investments, insurance (✅). |
| v0.13 | 2026-05-29 | Data-viz uplift (§5a): new `ProportionBar` + `LimitMeter` components. tax-planning lower sections rebuilt — income→RankedBars, deductions→LimitMeter headroom, tax-breakdown & take-home→ProportionBar, per-earner table redesigned (avatar + eff-rate + semantic colors). To propagate across pages. | tax-planning (✅). |
| v0.12 | 2026-05-29 | FIRE Dashboard "Sections at a glance" label → global `.section-eyebrow` (already component-driven otherwise). What-If flagged: needs LeafPageHeader actions-slot before conforming. | fire-goals/dashboard (✅). |
| v0.11 | 2026-05-29 | Added §10b screen archetypes — the hero/card patterns target dashboard-overview screens; settings/score/table/wizard screens differ and aren't force-fit. Matrix marks Preferences N/A, child pages pending a table/form sub-standard. | doc-only |
| v0.10 | 2026-05-29 | DRY cleanup: removed 4 redundant scoped `.section-eyebrow` copies (Business, OtherSources, income/Overview, Salary) — global utility now applies. Profile + MembersForm keep intentional local margin overrides (allowed). | 4 income/profile screens (✅ neutral). |
| v0.9 | 2026-05-29 | financial-health/Score on the standard header; score hero + factor cards kept intentionally custom (unique viz). | financial-health score (✅ header). |
| v0.8 | 2026-05-29 | fire-goals/Goals conformed (LeafPageHeader + PanelCard per goal w/ progress bars). | fire-goals/goals (✅). |
| v0.7 | 2026-05-29 | `MetricCard` gained `icon`/`iconColor` (leading label icon). insurance/overview conformed (LeafPageHeader + MetricCard ×4 with icons + #footer adequacy chips). | insurance overview (✅). |
| v0.6 | 2026-05-29 | MetricCard adopted on expenses (×4) + investments (×5) overviews; per-screen `metric-card` scoped CSS removed. | expenses, investments overviews (✅). |
| v0.5 | 2026-05-29 | New canonical **`MetricCard`** KPI tile (`shared/MetricCard.vue`) — §4a mandates it over hand-rolled `metric-card` divs. liabilities/overview conformed (LeafPageHeader + MetricCard ×4). | liabilities (✅). TODO: adopt MetricCard on expenses + investments overviews (they have the same hand-rolled tiles). |
| v0.4 | 2026-05-29 | **Reversed v0.3** (Abhay changed the call): app is now responsive. `SidebarLayout.vue` collapses to a temporary overlay drawer + hamburger below md (<960px); permanent on desktop. §10 rewritten. | SidebarLayout (✅, benefits every screen). |
| v0.3 | 2026-05-29 | ~~§10 locked to desktop-only~~ — SUPERSEDED by v0.4. | doc-only |
| v0.2 | 2026-05-29 | `.section-eyebrow` promoted to a global utility in `tokens.css` (was scoped-copy in 6 screens). New canonical **`PanelCard`** component (`shared/PanelCard.vue`, smart container: header + loading/error/empty states + interactive `to`) — §5 now mandates it over hand-rolled cards. Region precedence unit-tested (`panel-card-region.spec.ts`). | tax-planning (✅ uses PanelCard ×5). TODO on next conform of each screen: replace hand-rolled cards + remove the per-screen `.section-eyebrow` copy. |

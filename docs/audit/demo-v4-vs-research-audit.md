# FIREKaro Demo v4 — Research Audit

**Created:** 2026-05-27
**Audit purpose:** Stress-test every v4 design decision against the 6-chapter research pack at `docs/research/fire-india/` (chapters 01–05 + README). Identify US-FIRE framing leaks, missing India-specific surfaces, and assumption defaults that contradict the planner-grade consensus the research establishes.
**Author voice:** Senior CFP / NISM-XV-certified planner (per `docs/research/fire-india/README.md` author-voice directive).
**Inventory:** 36 decisions across 6 clusters (A–F).
**Status legend:** ✅ Survives · 🔄 Change · ❌ Cut · ➕ Add · ⏸ Pending
**Authority:** Each verdict cites the specific research chapter(s) it relies on. Direct quotes use blockquotes; my-judgment synthesis is flagged inline as 🟡.

---

## Cross-cutting Rule R1 — Default + Override

*Locked 2026-05-27 after Entry #1 point-by-point review. Applies to every entry below.*

- **R1.1** Every planning assumption ships with a research-defensible default AND a user-editable override.
- **R1.2** All overrides live on a single canonical `/preferences` page (full route, not a panel or drawer).
- **R1.3** Surfaces that USE an assumption display the resolved value read-only, with a small affordance (`?` or `✎`) that deep-links to the corresponding row on `/preferences`.
- **R1.4** Statutory facts (tax slabs, statutory limits, regulatory rules, statutory rates, government-set indices and interest rates) are read-only on `/preferences`, displayed with source + version + FY, and **NEVER user-editable — even within What-If or scenario modes**. The What-If sandbox at `/fire-goals/what-if` and any future scenario mode is restricted to planning assumptions only.
- **R1.5** Every overridable assumption has a "Reset to default" affordance both per-row AND a global "Reset all assumptions to research defaults" button on `/preferences`.

### What R1.4 marks as read-only (the line)

| Category | Examples | Overridable? |
|---|---|---|
| **Planning assumptions** | SWR, inflation (general / healthcare / education), expected returns (equity / debt / gold), retirement age, plan-to age, glide path, bucket allocations, family-layer line items, FIRE variant multipliers | **Yes** — per R1.1 |
| **Statutory facts** | Tax slabs (old + new regime), 80C ₹1.5L, 80CCD(1B) ₹50K, 80D limits, VPF ₹2.5L threshold, NPS 60/40 withdrawal split, LTCG ₹1.25L exemption + 12.5% rate, STCG 20% rate, Sec 87A ₹12L rebate ceiling, CII values, EPF/PPF interest rates, LRS $250K cap, LRS-TCS thresholds | **No** — read-only display with source + FY (R1.4) |
| **Derived values** | FIRE number, years-to-crossover, freedom score, asset allocation drift, DTI, savings rate, tax liability, expense coverage months | **No** — live-recompute from upstream overrides |
| **Identity data** | User name, family member DOB, employer, account numbers, holdings | **User-owned** (this is data, not assumption) |

### Cross-cutting implication
Regime-change stress-testing is **out of scope** for FIREKaro. If tax law changes (new Budget Act, new slab structure), the app ships updated statutory values in code. Users cannot model hypothetical future regimes themselves. Chapter 05 §5.2 policy-risk modeling is acknowledged as a planner concern but not a product feature.

---

## Cross-cutting Rule R2 — Verify Before Propose

*Locked 2026-05-28 during Entry #8 review after user directive: "always verify existing demo before suggesting changes."*

Before issuing any verdict or action item that proposes structural changes to v4 (new routes, new components, new schema fields, new tabs, new sections, new functions), the CFP-auditor MUST first read the actual v4 implementation in code. No proposals based on inferred structure, fading memory of earlier reads, or research-only framing.

Every entry from #8 forward includes a `### Verification (R2)` micro-section listing the files read and what they confirmed.

### Why R2 exists
Entry #8 Point 2's initial draft proposed "3rd tab under /investments" — but `/investments` actually uses sibling sub-routes (Overview.vue + Holdings.vue accessed via the sidebar), not in-page tabs. The R2 verification step caught this on its first invocation and the entry was corrected to "3rd sub-route `/investments/buckets`."

Without R2, the audit risks shipping action items that don't match v4's actual structure — wasting downstream implementation effort. Verification is cheap (a Grep or Read of the affected file). Re-implementation against wrong assumptions is expensive.

### Preferences page skeleton (referenced by every entry below)

```
/preferences
├── § Core FIRE Assumptions
│   • Safe Withdrawal Rate (horizon-resolved)        [editable per R1.1]
│   • Plan-to age (per member)                       [editable per R1.1]
│   • Target Retirement Age (per member)             [editable per R1.1]
│   • Conservative longevity tail toggle             [toggle, bumps plan-to age to 95]
├── § Inflation                                       [populated in Cluster A #3]
├── § Expected Returns                                [populated in Cluster A #4]
├── § FIRE Variants                                   [populated in Cluster A #2 + Cluster E #25]
├── § Family Layer                                    [populated in Cluster B #6]
├── § Glide Path                                      [populated in Cluster B #7]
├── § Withdrawal Strategy                             [populated in Cluster B #9 + Entry #1's A1.7]
│   • Income-bucket method (Pattu) toggle             [off by default]
├── § Statutory Reference (read-only per R1.4)        [populated through Cluster C entries]
│   • Tax slabs FY 2025-26 (display)
│   • Statutory limits + thresholds (display)
│   • Statutory rates (display)
└── [Reset ALL assumptions to research defaults]      [global R1.5 button]
```

---

## Entry #1 — SWR default

**Cluster:** A — Core FIRE math defaults
**Item:** 1 of 5
**Status:** 🔄 CHANGE (significant — value, function signature, UX surface)
**Ratified:** 2026-05-27 (5-point review: R1.4 stance · bracket shape · plan-to age default · MVP-tier of bucket+slider · trivial-row scan)

### v4 current position
File: `demo/src/lib/fire-math.ts:4–23`

```ts
export const INDIA_SWR = 0.035;                  // 3.5% global fallback
export const SWR_AGE_TABLE = [
  { maxAge: 40,       swr: 0.030 },
  { maxAge: 50,       swr: 0.0325 },
  { maxAge: 60,       swr: 0.035 },
  { maxAge: 70,       swr: 0.040 },
  { maxAge: Infinity, swr: 0.045 },
];
export function getAdjustedSWR(age?: number): number { /* picks from table; defaults to INDIA_SWR */ }
```

**Resolver treats current age as the SWR driver.** No `lifeExpectancy` or `planToAge` field exists anywhere in v4.

### Research position

Chapter 02 §2.3 (direct quotes):
> "30-year horizon: ~95–100% success at 4% SWR ... Dropping the withdrawal rate to 3.5% restores the success rate to >95% even at 50 years in most credible backtests on US-quality data. For India, with its worse inflation regime and shallower bond market, the empirical convergence is to **3.0% for 50-year horizons, 3.5% for 30-year horizons**."

Chapter 01 §1.4 (direct quote):
> "The Indian FIRE community has converged on a 3.0% to 3.5% SWR for early retirees with retirement horizons of 40+ years."

Chapter 05 §5.1 mitigation #4 (Pattu's income-bucket alternative):
> "Allocate 15–25 years of inflation-protected expected expenses in a dedicated bucket ... Let the remaining corpus run at higher risk for late-retirement support."

### Verdict reasoning

1. **The 3.5% default is wrong for the locked primary user.** Sandwich-gen working professional retiring 45–50 faces 40–50-year horizon. Research says 3.0–3.25% for that horizon, not 3.5%. The current default systematically under-states required corpus.
2. **`getAdjustedSWR(age)` treats current age as the driver — conceptually wrong.** SWR is a function of *retirement horizon*, not current age. Same age can mean very different horizons depending on retirement age + plan-to age. The function signature is wrong.
3. **Thresholds rise as age rises in v4 — but a 70-year-old healthy upper-middle-class Indian still faces 20–25 years and shouldn't be drawing 4%.** The age-up = SWR-up table is calibrated for US-Trinity assumptions.
4. **No user-facing transparency.** The 3.5% choice is buried in a constant. No glossary, no tooltip, no explanation of why it's not 4%.
5. **Pattu's income-bucket alternative is the most-cited Indian alternative to SWR** — v4 doesn't acknowledge it exists.

### Action items

| # | Action | Default | Where it lives | MVP scope |
|---|---|---|---|---|
| A1.1 | Replace `getAdjustedSWR(age)` → `getAdjustedSWR({retirementAge, planToAge})` — horizon-driven resolver | 5-step bracket: **≥50yr→3.0% · 40-49yr→3.25% · 30-39yr→3.5% · 20-29yr→4.0% · <20yr→4.5%** (🟡 brackets 40-49, 20-29, <20 are FireKaro interpolation; only ≥50 and 30-39 are research-quoted) | `demo/src/lib/fire-math.ts` (constant table + resolver function) | MVP-1 |
| A1.2 | Add per-member `planToAge` field; surface on `/preferences` § Core; deep-link from Dashboard. Field name "Plan-to age" (not "Life expectancy" — clearer this is the planning horizon end). Optional toggle "⚠️ Use Ch 05 §5.12 conservative tail (95)" | 90 (Ch 02 §2.3 lower bound) | `/preferences` § Core Assumptions + per-member control on `/profile` | MVP-1 |
| A1.3 | Verify Sharmas seed: Rohit retire@47 + planToAge@90 → 43yr horizon → resolves to 3.25% SWR | n/a (verification) | `demo/src/lib/seed-persona.ts` + integration test | MVP-1 |
| A1.4 | Glossary entry "SWR" — Trinity caveats + India adjustment + horizon-not-age framing + "you own this number" microcopy + **interpolation disclosure** (3 of 5 brackets are FireKaro synthesis, not research quotes) | static content | `demo/src/lib/glossary.ts` | MVP-1 |
| A1.5 | Dashboard hero displays resolved SWR with `?` tooltip → deep-link to `/preferences#swr`. Same affordance on every surface that uses SWR (`/fire-goals/dashboard`, `/financial-health/*`, `/fire-goals/what-if`). | n/a (display) | `demo/src/pages/fire-goals/Dashboard.vue` + all SWR consumers | MVP-1 |
| A1.6 | Per-row + global "Reset to default" on `/preferences` (R1.5) | n/a (UX control) | new `/preferences` page | MVP-1 |
| A1.7 | **Income-bucket method (Pattu/FREEFINCAL) as alternative computation engine, toggleable on `/preferences` § Withdrawal Strategy.** Parallel to SWR model — when on, FIRE number computed as expense-years-in-bucket × inflation-protected + residual-corpus-at-risk. | Off by default | `/preferences` § Withdrawal Strategy toggle + `demo/src/lib/income-bucket-math.ts` (new) | **MVP-1** |
| A1.8 | **Stress-test slider on Dashboard hero:** live SWR ±0.5% impact on corpus. Visceral surfacing of Ch 05 §5.1 SORR sensitivity. | Range default ±0.5% around resolved SWR | Dashboard hero + reactive corpus computation | **MVP-1** |
| A1.9 | When user crosses a horizon-bracket boundary (e.g., turns 50 and bracket shifts), show one-time tooltip explaining the SWR change with override option | trigger-driven | resolver-side event + UI tooltip | MVP-1 |
| A1.10 | Statutory Reference section on `/preferences` (read-only per R1.4). Entry #1 establishes the section; Cluster C entries populate it with tax / threshold values. | per R1.4 | new `/preferences` § Statutory Reference | MVP-1 |

### Cross-references
- **Statutory inputs touched:** none directly (resolver uses planning assumptions only)
- **Related entries (will follow):** #3 inflation, #5 retirement horizon, #9 variable withdrawal strategy, all Cluster C tax surfaces
- **R1 sub-rules invoked:** R1.1 (default + override), R1.2 (/preferences canonical), R1.3 (read-only display + deep-link), R1.4 (statutory section scaffolded), R1.5 (reset affordances)

### Ratification log
| Point | Question | Decision |
|---|---|---|
| 1 | R1.4 statutory immutability stance | Locked **strict read-only, never editable, even in scenarios** |
| 2 | Horizon-table bracket shape | Locked **5-step bracket** with conservative interpolation; glossary discloses research-quoted vs interpolated |
| 3 | Plan-to age default + UX shape | Locked **90 default**, per-member, /preferences-only entry, "Plan-to age" field name, conservative-tail toggle to 95 |
| 4 | A1.7 + A1.8 MVP tiering | Locked **both MVP-1** — CFP-grade depth from day 1 |
| 5 | Trivial row (A1.4 glossary, A1.5 tooltip, A1.6 reset) + new items A1.9, A1.10 | Ratified as mechanical R1-consequences |

---

## Entry #2 — Corpus multiple + FIRE variants

**Cluster:** A — Core FIRE math defaults
**Item:** 2 of 5
**Status:** 🔄 CHANGE (significant — semantic model + new variants + Dashboard layout)
**Ratified:** 2026-05-27 (4-point review: variant model · default multipliers · Barista formula · Dashboard layout)

### v4 current position
File: `demo/src/lib/fire-math.ts:41–48`

```ts
export function calculateFIREVariants(annualExpenses: number, swr = INDIA_SWR): FireVariants {
  const fireNumber = calculateFIRENumber(annualExpenses, swr);
  return {
    leanFIRE:    fireNumber * 0.6,   // 0.6× of Regular corpus
    regularFIRE: fireNumber,
    fatFIRE:     fireNumber * 1.5,   // 1.5× of Regular corpus
  };
}
```

**v4 treats variants as multipliers on the Regular corpus** (same expense base, scaled corpus). At SWR=3.5%, v4 produces: Lean = 17.1× expenses, Regular = 28.6×, Fat = 42.9×.

**No Barista or Coast variant exists in v4** — both are research-quoted ("the two variants that matter most for Indian working professionals" per Ch 01 §1.3) but absent from the product.

### Research position

**Ch 01 §1.3 table (direct quote — Indian 3.5% column):**

| Variant | Spending profile | Indian equivalent (3.5%) |
|---|---|---|
| Lean FIRE | Bare-minimum living costs; rural/LCOL; often single | **28–30×** of lean expenses |
| Regular FIRE | Median household lifestyle for your region | **28–33×** of normal expenses |
| Fat FIRE | Affluent lifestyle, travel, premium healthcare | **33–35× of fat expenses** |
| Coast FIRE | Stop adding to investments; let compound math finish | Same shape, longer timeline (formula-based, not target) |
| Barista FIRE | Partial FI: passive income covers core; part-time work covers discretionary | **~18–22×** of full expenses |

Research treats variants as **different expense profiles with similar corpus multiples**, NOT as multipliers on a single corpus number.

**Ch 04 §4.2 — Coast FIRE formula:**
> "Coast FIRE number = F × (1 + r)^-(R - C)" — where F = target corpus, r = real return, R = retirement age, C = current age.

**Ch 04 §4.3 — Indian Barista pattern:**
> "Passive: corpus generating ~₹40K/month at 3.5% SWR (₹12L/year corpus = ₹1.4 crore corpus). Active: part-time consulting ₹40K – ₹1L/month (10–20 hours/week)."

### Verdict reasoning

1. **Semantic model is wrong, not just numerically off.** v4's "multiplier on Regular corpus" approach produces Lean = 17× and Fat = 43× — Lean is below even Barista's 18× floor (research lower bound for full expenses), and Fat exceeds Ch 01's 33-35× upper bound.

2. **Concrete failure mode** for a sandwich-gen Sharmas-like user with ₹15L/yr expenses:
   - v4 shows Lean = ₹2.57 Cr (17×) — research says Lean should be 28–30× of lean expenses (≈ ₹2.5 Cr for ₹9L lean expenses, or ₹4.2 Cr for full ₹15L expenses at lean multiple). Either interpretation under-funds.
   - v4 shows Fat = ₹6.43 Cr (43×) — research says 33–35× of fat expenses (≈ ₹7.65 Cr for ₹22.5L fat). v4 understates because expense base wasn't bumped.

3. **Coast and Barista are absent** — Ch 01 §1.3 explicitly names them as "the two variants that matter most for Indian working professionals" because they map to common Indian life patterns (the "FIRE-but-still-take-startup-equity" trajectory and the "consulting after 45" trajectory).

4. **No glossary or tooltip for variants** — user sees "Lean / Regular / Fat" with no explanation of what lifestyle each represents or how the multipliers were derived.

### Action items

| # | Action | Default / spec | Where it lives | MVP scope |
|---|---|---|---|---|
| A2.1 | Replace `calculateFIREVariants` — variants are now **expense-base multipliers** (same SWR for all). Function signature: `(expenses, swr, multipliers) → { lean, regular, fat }` | Lean 0.6× / Regular 1.0× / Fat 1.5× expenses, R1-customizable | `demo/src/lib/fire-math.ts` | MVP-1 |
| A2.2 | Add Barista FIRE — **Hybrid model**. Default: simple 20× full expenses. Power-user toggle on `/preferences` § Withdrawal Strategy activates active-income model: `(expenses − annualActiveIncome) / SWR` | Simple 20× default (research midpoint 18-22×); toggle exposes activeIncome input | `lib/fire-math.ts` (new Barista function) + `/preferences` toggle | MVP-1 |
| A2.3 | Add Coast FIRE calculator: `Coast = targetCorpus × (1 + r)^-(yearsToRetirement)` per Ch 04 §4.2 | Real return r = (user's equity return − general inflation), pulled from /preferences (default ~6% real) | new `lib/coast-fire.ts` + Dashboard milestone callout | MVP-1 |
| A2.4 | Variant multipliers + Barista toggle + Coast inputs exposed on `/preferences` § FIRE Variants — all editable per R1 | Lean 0.6 / Regular 1.0 / Fat 1.5 / Barista hybrid toggle off | new `/preferences` section | MVP-1 |
| A2.5 | **Dashboard hero layout** — 3 end-state chips (Lean/Regular/Fat) in primary strip + **inline Coast milestone callout** ("you'll reach Coast at age N, then can stop adding") + **separate Barista alternative-path card** ("or work part-time and need ₹Z Cr") | n/a (display) | `pages/fire-goals/Dashboard.vue` | MVP-1 |
| A2.6 | Glossary entries for Lean / Regular / Fat / Coast / Barista — research-quoted multiples + concrete sandwich-gen examples + "you own these multipliers" microcopy | static content | `lib/glossary.ts` | MVP-1 |
| A2.7 | Tooltip on each variant chip explaining the multiplier semantics (e.g., "Lean assumes 60% of current expenses") + deep-link to `/preferences§fire-variants` | n/a | Dashboard chips | MVP-1 |
| A2.8 | Visual calibration nudge: indicator on Dashboard when user's stated expenses are unusually high/low vs sandwich-gen baseline (helps user assess whether their Lean/Fat assumptions are realistic) | n/a (display) | Dashboard | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** none directly
- **Related entries (will follow):** #3 inflation (drives Coast real-return calculation), #5 retirement horizon (drives Coast formula), Cluster E #25 (variant explicit targets), Cluster E #28 (automation defaults)
- **R1 sub-rules invoked:** R1.1 (multipliers customizable), R1.2 (/preferences canonical), R1.3 (deep-link from chips), R1.5 (reset)

### Ratification log
| Point | Question | Decision |
|---|---|---|
| 1 | Variant model (X / Y / Z) | Locked **Option X** — expense-base multipliers, same SWR for all variants |
| 2 | Default multipliers | Locked **0.6 / 1.0 / 1.5** — sandwich-gen-defensible midpoint, R1-customizable |
| 3 | Barista formula | Locked **Option D Hybrid** — simple 20× default + active-income toggle for power users |
| 4 | Dashboard layout | Locked **Option C** — 3 end-state chips + Coast milestone callout + Barista alt-path card (different visual treatment for different conceptual roles) |

---

## Entry #3 — Inflation assumption

**Cluster:** A — Core FIRE math defaults
**Item:** 3 of 5
**Status:** 🔄 CHANGE (significant — healthcare value, missing buckets, no routing, R1.1 violation)
**Ratified:** 2026-05-28 (4-point review: healthcare default · bucket count · routing approach · display strategy)

### v4 current position
File: `demo/src/lib/fire-math.ts:5-6`

```ts
export const INDIA_INFLATION = 0.06;              // 6% general
export const INDIA_HEALTHCARE_INFLATION = 0.08;   // 8% healthcare — DANGEROUSLY LOW
```

Two hardcoded constants. No education, no housing, no per-bucket weights, no /preferences exposure, no per-category routing. v4's healthcare rate (8%) is explicitly flagged by Ch 02 §2.2 as "catastrophically under-funded."

### Research position — Ch 02 §2.2 (direct quotes)

> "**6% is a defensible baseline assumption for general inflation, not 4%**."

> "Indian medical inflation: **2024: ~12%; 2025: 12.9% – 14%**. Top in Asia. ... A FIRE plan that uses the official 3.4% will be catastrophically under-funded for the medical line item."

> "University and overseas-education costs inflate at **8–10%**, often higher."

> "Indian expense base inflates at a weighted blend: general (60% weight @ 6%) + healthcare (20% weight @ 12%) + education (10% weight @ 9%) + housing (10% weight @ 5–6%) ≈ **7.2–7.5% effective inflation** through the retirement horizon."

### Verdict reasoning

1. **Healthcare 8% default is in the "catastrophic" zone** — Ch 02 §2.2 explicitly warns against under-defaulting here. Should be at least 12% (lower bound) or 14% (2025 actual).
2. **Education inflation entirely missing** — for sandwich-gen primary user with kids, overseas Masters in 14 years is ~₹3 crore at 8-10% inflation. Largest single discretionary line item.
3. **Housing inflation missing** — smaller (5-6%) but persistent across retirement.
4. **No blended-rate computation** — single rate applied to all expenses under-represents the differential cost structure.
5. **R1.1 violation** — constants hardcoded; no /preferences exposure.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A3.1 | Replace single inflation constants with **4-bucket structure** + computed household blend function. Locked values: General **6%** · Healthcare **14%** · Education **9%** · Housing **6%**. Weights default 60/20/10/10. Household blend = `60×6 + 20×14 + 10×9 + 10×6 = 7.9%`. | All rates + weights R1-customizable | `demo/src/lib/fire-math.ts` | MVP-1 |
| A3.2 | `/preferences` § Inflation — 4 bucket rates + 4 weights (sum-to-100 validation) + computed household blend display + per-row reset + global reset | values from A3.1 | new `/preferences` § Inflation | MVP-1 |
| A3.3 | Dashboard hero (and every surface using inflation) shows resolved household rate (**7.9%** by default) with `?` deep-link to `/preferences#inflation` | n/a (display) | Dashboard + all consumers | MVP-1 |
| A3.4 | Glossary entries: "Inflation buckets" / "Healthcare inflation (why 14%, NOT 3.4%)" / "Education inflation" / "Household blend formula" — research-quoted source per entry; explicit disclosure of MoSPI vs Tier-2-actual gap | static content | `demo/src/lib/glossary.ts` | MVP-1 |
| A3.5 | All FIRE projections / expense forecasts / corpus targets use the household blended rate in MVP-1 (single rate applied to all expenses) | n/a | `lib/fire-math.ts` projection functions | MVP-1 |
| A3.6 | **Schema groundwork for MVP-2:** add nullable `inflationBucket: 'general' \| 'healthcare' \| 'education' \| 'housing' \| undefined` field to recurring + planned expense schemas. Not consumed by MVP-1; lights up in MVP-2. | undefined for all existing/new expenses | `demo/src/types/household.ts` | MVP-1 (schema-only) |
| A3.7 | "Conservative tail" toggle on /preferences: bumps healthcare to 16% (1.5× research upper) for stress-test users who want a healthcare-shock scenario | Off | /preferences § Inflation | MVP-2+ |
| A3.8 | Document MVP-2 (per-expense routing via `inflationBucket`) + MVP-3 (auto-classification via expense `category` field) in `docs/audit/demo-v5-action-items.md` (cluster-extraction phase) | n/a | post-audit | post-audit |

### Cross-references

- **Statutory inputs touched:** none — inflation is a planning assumption, not a statutory fact (RBI target is a band, not a binding value)
- **Related entries (will follow):** #4 expected returns (real return = nominal equity − household inflation = 12% − 7.9% ≈ 4.1%, materially lower than research's ~6% example) · #5 retirement horizon (inflation compounds over horizon)
- **R1 sub-rules invoked:** R1.1 (every bucket + weight customizable), R1.2 (/preferences canonical), R1.3 (Dashboard read-only + deep-link), R1.5 (reset affordances)
- **Cross-impact on Entry #2 Coast FIRE:** Coast formula's real-return input now resolves to ~4.1% (not the research-example 6%). Coast target corpora become **higher** as a result. Glossary entry should note this.

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Healthcare inflation default | Locked **14%** (research upper / 2025 actual) — consistent with conservative-tail stance from Entry #1 plan-to age decision |
| 2 | Inflation bucket count | Locked **4 buckets** (general / healthcare / education / housing) — matches Ch 02 §2.2 blend formula |
| 3 | Routing approach | Locked **Option D staged** — single blended rate in MVP-1; per-expense `inflationBucket` field in MVP-2; auto-classification via expense `category` in MVP-3. Schema field added in MVP-1 (A3.6) to ease MVP-2 transition. |
| 4 | Display strategy | Locked **Option C** — blended household rate on Dashboard with `?` deep-link; 4-bucket components on /preferences |

---

## Entry #4 — Expected returns

**Cluster:** A — Core FIRE math defaults
**Item:** 4 of 5
**Status:** 🔄 CHANGE (significant — asset-class breakdown, real-return derivation, R1.1 violation)
**Ratified:** 2026-05-28 (4-point review: asset-class structure · default values · nominal-vs-real display · allocation source)

### v4 current position
File: `demo/src/lib/fire-math.ts:7`

```ts
export const DEFAULT_RETURNS = 0.12;   // 12% single nominal rate
```

Single nominal constant. No asset-class differentiation. No real-return derivation. No /preferences exposure. Used as default for `expectedReturns` parameter across all projection functions.

### Research position

- **Ch 03 §3.11 portfolio template:** equity ~12% nominal
- **Ch 03 §3.2:** EPF 8.25% (FY 25-26 statutory), PPF 7.1% (statutory)
- **Ch 03 §3.7:** gold 6-8% INR over multi-decade
- **Ch 02 §2.2:** *"the effective real return on a 70-30 equity-debt portfolio drops from ~6% (US frame) to ~4% (India frame)"*
- **Ch 03 §3.13:** crypto is "structurally tax-disadvantaged" — no defensible long-term projection

### Verdict reasoning

1. **Single 12% nominal is equity-only return** treated as portfolio-wide — wrong for any mixed allocation.
2. **No real-return derivation** — Coast FIRE (Entry #2 A2.3) needs it; v4 can't compute correctly.
3. **R1.1 violation** — hardcoded; not overridable.
4. **Concrete over-projection:** 70/20/10 (typical accumulator) yields weighted nominal 10.6%, real 2.7%. v4's 12% over-projects nominal by ~1.4pp; with Entry #3's 7.9% inflation, over-projects real by ~1.4pp. Stacked over 20 years, projected corpus inflates by ~30% over reality. User believes they can retire ~3-5 years earlier than they actually can.

### Action items

| # | Action | Default / spec | Where it lives | MVP scope |
|---|---|---|---|---|
| A4.1 | Add per-investment-type return defaults using v4's existing 10-type enum. Stocks/MutualFunds/ESOP **12%**, NPS Tier 1 **10%**, Gold **7%**, RealEstate **6%**, Crypto **0%**. FD reads from per-instance `interestRate` (already in schema). PPF + EPF_VPF go to Statutory Reference (R1.4). | per-type table; all R1-customizable except statutory | `demo/src/lib/fire-math.ts` (constants + type→rate mapper) | MVP-1 |
| A4.2 | `/preferences` § Expected Returns: 7 editable per-type rates + auto-derived allocation display + computed weighted nominal + computed weighted real + per-row reset + global reset | values from A4.1 | new `/preferences` § Expected Returns | MVP-1 |
| A4.3 | Replace all projection function usage of `DEFAULT_RETURNS` with portfolio-weighted nominal + real, derived from per-type rates × current allocation | n/a | `lib/fire-math.ts` projection functions (`calculateYearsToTarget`, `projectCorpus`, `findCrossovers`, Coast FIRE) | MVP-1 |
| A4.4 | Glossary entries: "Nominal vs Real return" / "Portfolio-weighted return" / "Why crypto = 0%" / "Why gold/RE real return can be negative under household inflation" | static content | `demo/src/lib/glossary.ts` | MVP-1 |
| A4.5 | FD per-instance `interestRate` continues working as-is. FDs lacking the field fall back to a debt-class default (suggested type-default 6.5% for FD without explicit rate) | no schema change | existing FD form | MVP-1 (no work needed) |
| A4.6 | Add PPF (7.1%) + EPF_VPF (8.25%) to /preferences **Statutory Reference** section (read-only per R1.4) with source + FY + quarterly-revision note (PPF) / annually-set note (EPF) | per R1.4 | /preferences § Statutory Reference | MVP-1 |
| A4.7 | Allocation source: **auto-derive** from `householdStore.investments[]` sum-by-type / total. User override available on /preferences "Use target allocation instead" (R1.1). Glide-path / time-varying allocation deferred to Cluster B #7. | auto-derive default | /preferences § Expected Returns | MVP-1 |
| A4.8 | Reactive recompute: when any rate or allocation changes on /preferences, every dependent display updates live (Dashboard hero, FIRE crossover year, Coast/Barista milestones, projection chart) | n/a | Pinia + Vue reactivity | MVP-1 |
| A4.9 | Real-return derivation surfaced visibly inline: `Equity 12% ↳ real: 4.1%`. **Highlight when real return is negative** (gold/RE at current household 7.9% inflation) — this is a load-bearing insight that surfaces over-allocation risk | n/a (display) | /preferences | MVP-1 |

### Cross-references

- **Statutory inputs touched:** PPF 7.1%, EPF_VPF 8.25% → Statutory Reference (R1.4); further populated by Cluster C entries
- **Related entries (will follow):** #5 retirement horizon (compounds returns over years), Cluster B #7 glide-path (target-allocation evolution over time), Cluster D #16-24 (per-instrument detail / overrides)
- **R1 sub-rules invoked:** R1.1 (per-type rates editable), R1.2 (/preferences canonical), R1.3 (Dashboard read-only + deep-link), R1.4 (statutory rates separated to Stat Ref), R1.5 (reset affordances)
- **Cross-impact on Entry #2 Coast FIRE:** real-return input resolves to portfolio-weighted real (~3-4% for typical accumulator), not the research-example 6%. Coast target corpora will be **higher** as a result.
- **Cross-impact on Entry #1 SWR:** corpus-projection math now uses weighted nominal + real consistently; FIRE crossover year shifts vs v4 (later by ~3-5 years for typical mixed allocations because the real return is ~1.4pp lower than v4 was assuming).

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Asset-class structure | Locked **Option A — per-existing-type hybrid**: leverages v4's 10 types; PPF/EPF as Statutory Reference (R1.4); FD respects per-instance rate; other 6 types get R1-customizable defaults |
| 2 | Default values per type | Locked **research-midpoint**: 12/12/12/10/7/6/0% for Stocks/MF/ESOP/NPS/Gold/RE/Crypto |
| 3 | Nominal vs real display | Locked **Option C** — nominal primary, real derived alongside; negative-real cases visually highlighted |
| 4 | Allocation source | Locked **Option C** — auto-derive from holdings + R1 override; glide-path deferred to Cluster B #7 |

---

## Entry #5 — Retirement horizon

**Cluster:** A — Core FIRE math defaults
**Item:** 5 of 5 *(final Cluster A item)*
**Status:** ➕ ADD (additive — v4's default 50 stays; new: horizon display + sanity validation)
**Ratified:** 2026-05-28 (2-point review: default retirementAge value · horizon surfacing + sanity)

### v4 current position
File: `demo/src/types/household.ts:44` + `demo/src/components/wizard/ProfileStep.vue` + seeds

- Schema: `targetRetirementAge: z.number().int().min(30).max(80).optional()`
- Wizard default for EARNER: **50**; DEPENDENT: null
- Seeds: Sharmas Rohit=47, Priya=50; Mehtas Vikram=47, Aanya=48
- **Horizon concept never surfaced** — derived implicitly inside SWR resolver only
- **No sanity validation** between planToAge and retirementAge

### Research position

- **Ch 02 §2.9:** *"Crossover targeted at age 45-50, occasionally 40 (for aggressive single high-earners)"*
- **Ch 01 §1.6 phases:** FIRE crossover is the phase 3/4 transition; the 5-year window on either side is the most fragile (sequence-of-returns risk)
- **Ch 05 §5.12:** longevity tail modeling discussed (covered in Entry #1 plan-to age)

### Verdict reasoning
v4's default 50 sits at the upper end of Ch 02 §2.9's FIRE-pursuer range (45-50). Research-aligned and conservative-but-defensible. **No change to the default value needed.**

What's missing is **surfacing** — the user never sees their derived horizon, so the relationship between retirementAge + planToAge + SWR (Entry #1's bracket table) is opaque. Also missing: sanity validation to prevent illogical combinations (e.g., planToAge ≤ retirementAge).

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A5.1 | Display derived horizon read-only on `/preferences` § Core for each member: e.g., "Rohit: retire@50, plan-to@90 → **40-year horizon** (drives SWR = 3.25%)" | n/a (derived computed) | new `/preferences` § Core Assumptions | MVP-1 |
| A5.2 | Display household-summary horizon (longest among members) on Dashboard hero with `?` deep-link to `/preferences#core` | n/a | `pages/fire-goals/Dashboard.vue` | MVP-1 |
| A5.3 | Sanity validation rules on member form: `planToAge > retirementAge` (**block**) · `horizon ≥ 5` (**block** with "Plan-to age must be at least 5 years after retirement age") · `horizon < 20` (**soft warn** — "Short horizon; most FIRE planning assumes 20+ years of retirement") · `horizon > 60` (**soft warn** — "Unusually long horizon; verify both ages are realistic") · `retirementAge < 35` (**soft warn** — "Very early retirement; verify corpus assumptions account for this") | n/a (validation) | member form (`/profile` + wizard `ProfileStep`) + Pinia validators | MVP-1 |
| A5.4 | Glossary entry "Retirement horizon" — explains SWR-driver relationship; cross-references Entry #1 (SWR brackets) + Entry #2 (Coast FIRE formula) | static content | `demo/src/lib/glossary.ts` | MVP-1 |
| A5.5 | Confirm default `targetRetirementAge = 50` preserved across wizard `ProfileStep.vue` (lines 68-73, 77-78) and seed personas. **No code change.** | 50 (unchanged) | confirmation only | MVP-1 (no work) |
| A5.6 | Wizard `ProfileStep.vue` + `/profile` form integrate sanity rules at form validation time with clear inline messaging | n/a | both member forms | MVP-1 |

### Cross-references
- **Statutory inputs touched:** none
- **Related entries:** #1 plan-to age (horizon = planToAge − retirementAge); #2 Coast FIRE formula `F × (1+r)^-(R-C)` uses retirementAge directly; #3 inflation (compounds over horizon); #4 expected returns (compound over horizon)
- **R1 sub-rules invoked:** R1.1 (retirementAge editable), R1.2 (/preferences canonical), R1.3 (Dashboard read-only + deep-link), R1.5 (reset to 50)

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Default targetRetirementAge | Locked **50 unchanged** — research-aligned upper end of FIRE-pursuer range; conservative anchor; users dial down via R1 |
| 2 | Horizon surfacing + sanity | Locked **Option B** — display derived horizon on /preferences + Dashboard; sanity validation with 2 blocking rules + 3 soft warnings; no preset toggle (over-engineering) |

---

## ✅ Cluster A — Complete (5/5 items audited)

**Summary verdict:**
- **3 of 5 entries: 🔄 CHANGE significant** (Entry #1 SWR, #2 corpus multiple, #3 inflation, #4 expected returns)
- **1 of 5: ➕ ADD** (Entry #5 horizon — additive only)
- All 5 entries are MVP-1 scope
- Rule R1 (default + override on `/preferences`) is invoked by every entry — `/preferences` is now a load-bearing artifact for MVP-1
- Statutory Reference section scaffolded; PPF (7.1%) + EPF_VPF (8.25%) populated; further populated by Cluster C
- Cross-cluster dependencies identified: Cluster B #7 (glide-path) extends Entry #4's allocation source; Cluster D (instruments) deepens Entry #4's per-type rates

**Total MVP-1 action items from Cluster A:** ~40 across the 5 entries.

Next: **Cluster B — Modeling completeness** (Entry #6: Family layer)

---

## Entry #6 — Family layer modeling

**Cluster:** B — Modeling completeness
**Item:** 1 of 6 *(Cluster B opener — THE sandwich-gen differentiator)*
**Status:** ➕ ADD (significant new feature — load-bearing for primary user)
**Ratified:** 2026-05-28 (4-point review: sub-layer scope · modeling approach · UX placement · default values)

### v4 current position
`Member` captures: relation (string), educationStage (4 levels), marital. `plannedFutureLine` exists for one-shot future expenses (generic). **No concrete family-load modeling:** no parents bucket, no education target projection, no marriage placeholder, no extended-family contingency reserve. Entry #3 A3.6 added `inflationBucket` to expense schemas as groundwork.

### Research position — Ch 02 §2.7 Family Layer (direct quote)

> "Indian FIRE math runs into four additional layers: **Parents** ... **Marriage and dowry-adjacent expenses** ... **Children's education (Indian + overseas)** ... **Siblings and extended family**."

> "For a hypothetical 35-year-old urban professional with one child (age 5) and dependent parents (age 65, no retirement corpus of their own): **Sub-total: family layer ≈ ₹3.1 crore**. This is on top of, not part of, the retirement FIRE number. A planner who computes 'I need ₹5 crore for FIRE' and ignores this layer is **underfunded by ~60%**."

### Verdict reasoning

Ignoring the family layer **underfunds the FIRE corpus by ~60%** for the sandwich-gen primary user we locked. This single gap dwarfs every Cluster A optimization. Without family-layer modeling in v5, the entire research-alignment story collapses for the primary user.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A6.1 | Extend `recurringExpenseLine` with `kind: 'general'|'parents'|'extended-contingency'`. `kind` auto-sets `inflationBucket` (parents→healthcare). | 'general' for existing/new | `demo/src/types/household.ts` | MVP-1 |
| A6.2 | Extend `plannedFutureLine` with `kind: 'general'|'education'|'marriage'`. `kind` auto-sets `inflationBucket`. | 'general' | `demo/src/types/household.ts` | MVP-1 |
| A6.3 | Add `extendedFamilyContingencyPercent` to `householdSchema` (research midpoint 5-10%, R1-customizable) | 7.5% | `types/household.ts` + `/preferences` | MVP-1 |
| A6.4 | `/expenses/recurring` form: add `kind` selector. Selecting 'parents' surfaces context + auto-routes inflation | 'general' | recurring expense form | MVP-1 |
| A6.5 | `/fire-goals/goals` form: add `kind` selector. Selecting 'education'/'marriage' auto-routes inflation | 'general' | goal form | MVP-1 |
| A6.6 | `/preferences` § Family — extended-contingency % editable + glossary + nudge-display toggle | 7.5% / nudges-on | new /preferences section | MVP-1 |
| A6.7 | **`<FamilyLayerCard>` on FIRE Dashboard** — aggregates parents-kind recurring + education+marriage-kind planned + contingency-%; displays breakdown with "on top of FIRE" framing per Ch 02 §2.7 | n/a (display) | `pages/fire-goals/Dashboard.vue` | MVP-1 |
| A6.8 | **Nudge engine** — scans profile for trigger conditions (children <22 → education nudge; married+35+ → parents nudge; dependents → marriage nudge) and surfaces dismissable cards on Dashboard with [Accept] [Customize] [Dismiss] | trigger table per ratification log | new `lib/family-nudges.ts` + Dashboard UI | MVP-1 |
| A6.9 | Nudge dismissals persisted to localStorage; user can re-enable from /preferences §Family | persist on dismiss | localStorage + /preferences toggle | MVP-1 |
| A6.10 | Per-bucket FIRE math integration: family-layer aggregate added to corpus target **on top of** FIRE retirement number (Ch 02 §2.7 "on top of, not part of"). Coast/Barista variants also adjust. | n/a | `lib/fire-math.ts` + variant calculators | MVP-1 |
| A6.11 | Glossary entries: "Family Layer", "Sandwich Generation", "Parents bucket", "Education target", "Marriage event", "Extended-family contingency" — with research-quoted ₹3.1 Cr benchmark | static content | `lib/glossary.ts` | MVP-1 |
| A6.12 | If user has DEPENDENT members but zero family-layer entries after profile complete, surface one-time informational banner: "Most sandwich-gen households model parents + education — see suggested items" | trigger-driven | Dashboard banner | MVP-1 |
| A6.13 | Per-parent / per-child specialized breakdown — document as MVP-2 candidate when user demand validates need; not in MVP-1 scope | n/a | post-audit deferred list | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** none (planning concerns; sandwich-gen-specific tax items go to Entry #11)
- **Related entries:** #3 inflation (`kind` routes to inflationBucket), #11 sandwich-gen tax surfaces, Cluster E #25 (variant adjustments to include family layer), Cluster F #34 (estate planning — extended family ties in)
- **R1 sub-rules invoked:** R1.1 (contingency% + nudges editable), R1.2 (/preferences §Family canonical), R1.5 (reset)

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Sub-layer scope MVP-1 | Locked **Option B** — Parents + Education first-class; Marriage as planned-event; Extended-family as buffer % on /preferences. Full 4-layer coverage with appropriate fidelity per layer. |
| 2 | Modeling approach | Locked **Option C** — Hybrid: extend existing schemas with `kind` field in MVP-1; migrate to dedicated schemas in MVP-2 if per-parent/per-child demand emerges |
| 3 | UX placement | Locked **Option A** — Distributed input (Expenses/Goals/Preferences) + aggregated `<FamilyLayerCard>` on Dashboard with "on top of FIRE" framing |
| 4 | Default values | Locked **Option C** — Nudge cards with one-click accept (educational + non-polluting; CFP-grade) |

---

## Entry #7 — Glide path

**Cluster:** B — Modeling completeness
**Item:** 2 of 6
**Status:** ➕ ADD (research's #1 SORR mitigation; currently absent from v4)
**Ratified:** 2026-05-28 (3-point review: algorithmic vs user-defined · coverage scope · visualization)

### v4 current position
- `Member.riskAppetite` field exists but doesn't drive computation
- Allocation (Entry #4) is auto-derived from current holdings — snapshot, not glide
- **No pre-crossover rebalance logic; no post-crossover rising equity**

### Research position — Ch 05 §5.1 (direct quote)

> "**The single highest-conviction mitigation [for sequence-of-returns risk].** Starting 5-7 years pre-crossover, rebalance ~5%/year from equity to debt. Land at the crossover at 40-50% equity (down from 70-80% in mid-accumulation). Then optionally rise back up to 60-70% equity over the first 10 years of retirement (the 'rising-equity glide path' from Wade Pfau's research)."

### Verdict reasoning
SORR is Ch 05's named **#1 dominant FIRE risk**. Without glide-path modeling, projections assume constant 70-80% equity through crossover — the exact failure mode research warns against. v4 has none of this logic.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A7.1 | Add `glidePath` schema: `{ algorithm: 'pfau-kitces'\|'static'\|'custom', perYearOverrides: Record<year, equityPercent>, riskProfileSource: 'member'\|'override' }` | `pfau-kitces` / `{}` | `demo/src/types/household.ts` | MVP-1 |
| A7.2 | Implement Pfau-Kitces algorithm in `demo/src/lib/glide-path.ts`: deep accumulation **65/75/85% by risk profile**; linear glide DOWN to 50% over 7 yrs pre-crossover; 50% trough at crossover; linear glide UP to 65% over 10 yrs post-crossover; sustained 65% thereafter | algorithm spec | new `lib/glide-path.ts` | MVP-1 |
| A7.3 | Integrate glide-path with portfolio-weighted return (Entry #4): each projection year's return uses that year's equity % | n/a | `lib/fire-math.ts` projection functions | MVP-1 |
| A7.4 | Dashboard chip: "🛡️ Glide path: X% today → 50% at age N → 65% post-retirement" with `?` deep-link to `/preferences#glide-path` | n/a | Dashboard hero | MVP-1 |
| A7.5 | `/preferences` § Glide Path: Pfau-Kitces curve chart (vue-chartjs) + per-year override table + risk-profile selector + R1.5 reset (per-row + global) | values from A7.1+A7.2 | new /preferences section | MVP-1 |
| A7.6 | Glossary entries: "Glide path", "Sequence-of-returns risk (SORR)", "Bond tent", "Rising-equity glide path", "Pfau-Kitces research" | static content | `lib/glossary.ts` | MVP-1 |
| A7.7 | Per-year overrides persisted to household store; warning surfaced when user override creates risky shapes (e.g., 90% equity through retirement, 0% equity in accumulation) | n/a | /preferences UI | MVP-1 |
| A7.8 | Cross-impact note: Coast FIRE (Entry #2 A2.3) assumes static real return — does NOT use year-by-year glide; projection chart DOES use glide. Document in glossary. | n/a | docs only | MVP-1 |

### Cross-references
- **Statutory inputs touched:** none
- **Related entries:** #4 expected returns (year-by-year allocation drives weighted return), #9 variable withdrawal (post-crossover allocation interacts with withdrawal strategy), Cluster E #27 (in-app stress tests should include SORR scenarios that exercise the glide)
- **R1 sub-rules invoked:** R1.1 (per-year override editable), R1.2 (/preferences canonical), R1.3 (Dashboard read-only + deep-link), R1.5 (reset)

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Algorithmic vs user-defined | Locked **Option B** — Hybrid: algorithmic Pfau-Kitces default + per-year override on /preferences |
| 2 | Coverage scope | Locked **Option B** — Full Pfau-Kitces lifecycle (pre-glide down + post-rise up) |
| 3 | Visualization | Locked **Option C** — Chart on /preferences + scannable summary chip on Dashboard (R1.3 pattern) |

---

## Entry #8 — Bucket strategy

**Cluster:** B — Modeling completeness
**Item:** 3 of 6
**Status:** ➕ ADD (research mitigation #2 for the #1 risk — SORR)
**Ratified:** 2026-05-28 (2-point review: modeling depth · UX placement)

### v4 current position
**Zero bucket-strategy modeling.** Holdings displayed by `type` (asset class), not by time-horizon. No `bucket` field on `investmentSchema`.

### Research position — Ch 05 §5.1 Mitigation #2 (direct quote)

> "Allocate the corpus into time-horizon buckets:
> - Bucket 1: 0–3 years of expenses — Cash + liquid funds + sweep-in FD
> - Bucket 2: 3–10 years of expenses — Short-term debt MF + RBI FRS bonds + bank FDs
> - Bucket 3: 10–25 years of expenses — Balanced equity-debt (50/50)
> - Bucket 4: 25+ years — Equity-heavy (70/30 or higher)"

**Indian critique:** *"the static-bucket version doesn't adjust well to India's higher inflation. A dynamic variant where bucket sizes re-evaluate annually is better."*

### Verdict reasoning
SORR-mitigation #2 (alongside glide path #1 = Entry #7). Awareness-level modeling unblocks the user's ability to reason about SORR survival ("can I withdraw from B1 for 3 years while B3/B4 recover?"). Automation deferred to MVP-2/3 per research's Indian-critique acknowledgment that static buckets are mechanical.

### Verification (R2)
Read: `demo/src/pages/investments/` (lists `Holdings.vue`, `Overview.vue`); `demo/src/router/index.ts` (confirms `/investments` parent redirects to `/overview`, with `/holdings` as sibling sub-route). **Confirmed:** /investments uses sub-routes (sidebar navigation), not in-page tabs. Adding `/investments/buckets` follows established pattern.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A8.1 | Add optional `bucket: 1 \| 2 \| 3 \| 4 \| undefined` to `investmentSchema` | undefined (unassigned) | `demo/src/types/household.ts` | MVP-1 |
| A8.2 | New sub-route `/investments/buckets` (`Buckets.vue`) alongside Overview + Holdings. Sidebar nav gets 3rd Investments entry. | n/a (new route) | new `demo/src/pages/investments/Buckets.vue` + router entry | MVP-1 |
| A8.3 | `/investments/buckets` page: 4 bucket cards (B1-B4) per research targets (B1 0-3yr · B2 3-10yr · B3 10-25yr · B4 25+yr). Each card: rupee sum + years-of-expenses + assigned holdings list. Unassigned section nudges classification. | research targets | new page | MVP-1 |
| A8.4 | Holdings form (`/investments/holdings`) gains optional `bucket` selector | undefined default | existing form | MVP-1 |
| A8.5 | Compute bucket totals: `bucketSum / annualExpenses = years-of-coverage`. Highlight when B1 < 1 year (SORR-vulnerable warning). | n/a | derived | MVP-1 |
| A8.6 | Glossary entries: "Bucket strategy", "Time-horizon bucket", "Bond tent (vs bucket)" — research-quoted with Indian-critique acknowledgment | static content | `lib/glossary.ts` | MVP-1 |
| A8.7 | Cross-link from FIRE Dashboard SORR-risk callout: "Your Bucket 1 holds X years of expenses — see /investments/buckets" | n/a | Dashboard | MVP-1 |
| A8.8 | Dynamic bucket rebalance recommendations | n/a | post-audit deferred | MVP-2+ |
| A8.9 | Automated bucket-based withdrawal sequencing during decumulation | n/a | post-audit deferred | MVP-3+ |

### Cross-references
- **Statutory inputs touched:** none
- **Related entries:** #7 glide path (allocation evolution; bucket assignment is a different lens), #9 variable withdrawal (decumulation strategy leverages buckets), Cluster D #20 RealEstate (RE often in B3/B4 due to illiquidity per Ch 04 §4.6)
- **R1 sub-rules invoked:** R1.1 (bucket assignment editable), R1.5 (reset)
- **R2 invoked:** verified v4's `/investments` structure before proposing /buckets sub-route

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Modeling depth MVP-1 | Locked **Option A — Awareness only**. Recommendations MVP-2; automation MVP-3. |
| 2 | UX placement | Locked **Option B (corrected via R2)** — sub-route `/investments/buckets` alongside Overview + Holdings; NOT in-page tabs |

---

## Entry #9 — Variable withdrawal rules

**Cluster:** B — Modeling completeness
**Item:** 4 of 6
**Status:** ➕ ADD (research SORR-mitigation #3; extends Entry #1 A1.7's withdrawal-strategy section)
**Ratified:** 2026-05-28 (single-point review: which strategies for MVP-1)

### v4 current position
Constant SWR only. Entry #1 A1.7 already added income-bucket (Pattu) as toggleable alternative for MVP-1. **No** VPW, Guyton-Klinger, or floor/ceiling rules.

### Research position — Ch 05 §5.1 Mitigation #3 (direct quote)
> "Rather than fixed inflation-indexed withdrawal, use rules that flex with portfolio performance:
> - Guyton-Klinger: Adjust withdrawal by ±10% based on whether portfolio crossed certain thresholds
> - VPW (Variable Percentage Withdrawal): Compute annual withdrawal as a function of remaining corpus and remaining horizon
> - 3.5% with floor/ceiling: Default 3.5% withdrawal, but cap at 4% in good years and floor at 2.5% in bad years
>
> Variable rules deliver higher expected lifetime withdrawal at the cost of lower predictability."

### Verdict reasoning
Floor/Ceiling is the simplest variable rule with the highest insight-to-complexity ratio. Users immediately understand "bad market → draw 2.5%, good market → draw 4%." Guyton-Klinger and VPW are valuable but defer to MVP-2 (formula complexity + UI for thresholds).

### Verification (R2)
Read: `demo/src/lib/fire-math.ts` (no withdrawal-rule code); grep for `VPW|Guyton|variable.*withdrawal|withdrawalStrategy` across `demo/src` (only 1 mention — `lib/tour-steps.ts` copy). **Confirmed:** no existing variable-withdrawal infrastructure; this entry creates `lib/withdrawal-strategy.ts` fresh.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A9.1 | Extend `/preferences` § Withdrawal Strategy with **Floor/Ceiling rule** alongside Constant SWR (default) + Income-bucket (Entry #1 A1.7) | Default = Constant SWR | `/preferences` § Withdrawal Strategy | MVP-1 |
| A9.2 | Implement Floor/Ceiling logic: 3.5% baseline · cap 4% when corpus > 110% of expected · floor 2.5% when corpus < 90% of expected. Both thresholds R1-customizable. | research thresholds | new `demo/src/lib/withdrawal-strategy.ts` | MVP-1 |
| A9.3 | Glossary entries: "Variable withdrawal", "Floor/Ceiling rule" (active in MVP-1), "Guyton-Klinger (planned MVP-2)", "VPW (planned MVP-2)" — research-quoted | static content | `lib/glossary.ts` | MVP-1 |
| A9.4 | Dashboard chip when non-constant mode is active: "Withdrawal: Floor/Ceiling (3.5% base · 2.5%–4% range)" | n/a | Dashboard | MVP-1 |
| A9.5 | Projection chart visualizes year-by-year actual withdrawal under selected strategy (so user sees the visible difference between Constant and Floor/Ceiling in stressed market years) | n/a | projection chart on Dashboard / /fire-goals | MVP-1 |
| A9.6 | Guyton-Klinger + VPW deferred to MVP-2 with placeholder glossary entries explaining they're coming | n/a | post-audit deferred-items | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** none
- **Related entries:** #1 A1.7 income-bucket method (sibling withdrawal option), #7 glide path (interacts with decumulation), #8 buckets (interacts with which bucket to draw from in bad years)
- **R1 sub-rules invoked:** R1.1 (strategy + thresholds editable), R1.2 (/preferences canonical)
- **R2 invoked:** verified absence of any v4 withdrawal-rule infrastructure

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Which variable-withdrawal strategies for MVP-1? | Locked **Option B** — Add Floor/Ceiling (alongside Constant + Income-bucket); Guyton-Klinger + VPW deferred to MVP-2 |

---

## Entry #10 — Healthcare as separate line item

**Cluster:** B — Modeling completeness
**Item:** 5 of 6
**Status:** ➕ ADD (extends v4's partial healthcare coverage to first-class status; Ch 05 §5.3 #2-ranked failure mode after SORR)
**Ratified:** 2026-05-28 (single-point review: MVP-1 scope depth)

### v4 current position
Partial coverage: insurance section auto-routes premium to recurring expenses (`source: 'auto-insurance'`); `Member.health` enum exists; Entry #3 + Entry #6 already established healthcare inflation bucket (14%) and parents-kind routing. **Missing:** out-of-pocket medical category, dedicated healthcare-corpus reservation, healthcare-shock event modeling.

### Research position — Ch 05 §5.3 (direct quote)
> "Mitigations:
> - Separate healthcare line item in the plan with its own inflation assumption (10-12%, not 6%)
> - **Dedicated healthcare corpus of 20-25% of total retirement corpus**, kept separate and conservative
> - Family floater coverage sized to 5-10× current annual income
> - Senior-citizen-specific health policies for parents"

### Verdict reasoning
Healthcare is Ch 05's named **#2 failure mode** after SORR. v4 partially handles it via existing infrastructure but lacks the load-bearing piece: **dedicated healthcare corpus reservation** (20-25% on top of base FIRE corpus). Also missing: out-of-pocket medical category (distinct from insurance premium).

### Verification (R2)
Read: `demo/src/types/household.ts` healthcare-related fields. **Confirmed:** v4 has `Member.health` (Healthy/Chronic/Special), insurance types (Vehicle/Health/Life), insurance→recurring auto-routing. No `healthcareCorpusReservationPercent`, no `'medical'` kind on expense schemas.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A10.1 | Add `healthcareCorpusReservationPercent` to `householdSchema` (research range 20-25%, R1-editable) | 20% (lower bound) | `demo/src/types/household.ts` + `/preferences` § Family | MVP-1 |
| A10.2 | Extend `kind` enum on `recurringExpenseLine` to include `'medical'` (out-of-pocket; distinct from auto-insurance) | extends Entry #6 A6.1 | `types/household.ts` | MVP-1 |
| A10.3 | Extend `kind` enum on `plannedFutureLine` to include `'medical'` (healthcare-shock events like major surgery, critical illness) | extends Entry #6 A6.2 | `types/household.ts` | MVP-1 |
| A10.4 | Nudge in family-nudge engine (Entry #6 A6.8): when user is 35+ AND has zero medical-kind entries, surface "Have you sized your healthcare buffer? Research says 20-25% of FIRE corpus..." | trigger-driven | `lib/family-nudges.ts` | MVP-1 |
| A10.5 | Healthcare-corpus reservation applied to FIRE target: `effective_corpus = base_FIRE + family_layer + (base_FIRE × healthcareCorpusReservationPercent)` | n/a | `lib/fire-math.ts` | MVP-1 |
| A10.6 | Glossary entries: "Healthcare corpus reservation" / "Healthcare-shock event" / "Why 20-25%" — research-quoted Ch 05 §5.3 | static content | `lib/glossary.ts` | MVP-1 |
| A10.7 | Senior-citizen-specific insurance flag deferred to Cluster D (instrument coverage) | n/a | post-audit | Cluster D scope |
| A10.8 | Insurance-recommendation engine (suggests floater sizing per family composition) deferred | n/a | post-audit deferred | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** none directly (tax §80D is in Cluster C)
- **Related entries:** #3 inflation (healthcare bucket 14%), #6 family layer (parents-kind routes to healthcare), Cluster D #16+ (senior-citizen insurance flag), Cluster F #32 (health-status display)
- **R1 sub-rules invoked:** R1.1 (reservation % editable, nudge dismissable), R1.2 (/preferences §Family canonical), R1.5 (reset)
- **R2 invoked:** verified v4's existing healthcare modeling before proposing additions

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Healthcare line-item scope for MVP-1 | Locked **Option B** — Healthcare-corpus % + 'medical' kind extension + nudge. ~70% Ch 05 §5.3 coverage; senior-flag + recommendation engine deferred. |

---

## Entry #11 — Sandwich-gen specific surfaces

**Cluster:** B — Modeling completeness
**Item:** 6 of 6 *(Cluster B closer)*
**Status:** ➕ ADD (meta-surface; specifics implemented in natural clusters)
**Ratified:** 2026-05-28 (single-point review: scope depth)

### v4 current position
None. Zero references to SCSS, Sukanya, sandwich-gen-specific edges.

### Research position — Ch 04 §4.17 (direct quotes — abbreviated)
> "**SCSS in parents' name** — 8.2% interest (FY 25-26), ₹30L cap per individual senior. Tax in parents' hand at their slab."
> "**Parents' Section 80D** — pay parents' health insurance from your bank; ₹50K deduction."
> "**Sukanya Samriddhi Yojana** for daughters under 10 — 8% interest, EEE, ₹1.5L/year cap."
> "These individually small (₹10K-₹30K). Together they can add 1-2% to family-level effective savings rate."

### Verdict reasoning
v4 lacks the full sandwich-gen opportunity bundle. This entry establishes the **meta-concept** (these are a coherent strategy, not independent items); specific implementations live in Cluster C (tax), D (instruments), F (advanced).

### Verification (R2)
Grep across `demo/src` for `SCSS|sukanya|sandwich` (case-insensitive) — **zero matches**.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A11.1 | Glossary entries — Ch 04 §4.17 quoted: "SCSS", "Sukanya Samriddhi Yojana", "Senior-citizen FD premium", "Parents' Section 80D", "Joint family loan (income-shifting)", "Sandwich-generation opportunities (overview)" | static content | `demo/src/lib/glossary.ts` | MVP-1 |
| A11.2 | Extend family-nudge engine (Entry #6 A6.8) with sandwich-gen triggers: (a) parent member + 30%-slab earner → "Consider SCSS"; (b) daughter <10 → "Consider Sukanya"; (c) parents-kind expense + no 80D parent claim → "Claim parents' 80D"; (d) dual-income with slab gap → "Consider joint family loan (consult CA)" | trigger table from research §4.17 | `lib/family-nudges.ts` | MVP-1 |
| A11.3 | Each nudge cites Ch 04 §4.17 + "Learn more" link to corresponding glossary entry | n/a | nudge UI | MVP-1 |
| A11.4 | Specific implementations cross-routed: SCSS → Cluster D (new instrument type) · Sukanya → Cluster D · 80D parents → Cluster C tax · Senior-FD premium → Cluster D FD instance field · Joint family loan → Cluster F advanced/estate | n/a (downstream) | other cluster entries | varies |
| A11.5 | Dedicated "Sandwich-gen card" on Dashboard deferred to MVP-2 (validate user demand) | n/a | post-audit deferred | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** Sec 80D limits (Cluster C); SCSS interest rate (Statutory Ref); Sukanya 80C eligibility (Statutory Ref); senior-citizen FD premium rates
- **Related entries:** #6 family layer (nudge engine extended), Cluster C #12-15 (tax surfaces), Cluster D #16-24 (instruments), Cluster F #34 (estate)
- **R1 sub-rules invoked:** R1.1 (nudges dismissable), R1.4 (statutory rates for SCSS/Sukanya in Statutory Reference)
- **R2 invoked:** verified absence before proposing

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Sandwich-gen surface scope MVP-1 | Locked **Option B** — Glossary + nudge engine extension. Specifics routed to natural clusters (C tax, D instruments, F estate). Dashboard card deferred to MVP-2. |

---

## ✅ Cluster B — Complete (6/6 items audited)

**Summary verdict:**
- **6 of 6 entries: ➕ ADD** — every Cluster B item is net-new feature (family layer, glide path, buckets, variable withdrawal, healthcare reservation, sandwich-gen nudges)
- All MVP-1 scope
- Rule R2 (Verify Before Propose) introduced; corrected one structural assumption (Entry #8 sub-route vs in-page tabs)
- Cluster B layers cross-link heavily into Cluster A (#6 family↔#3 inflation, #7 glide↔#4 returns, #8 buckets↔#7 glide, #10 healthcare↔#3+#6) — these MUST all be implemented together for the math to work
- New code surfaces: `lib/glide-path.ts`, `lib/withdrawal-strategy.ts`, `lib/family-nudges.ts`; new route `/investments/buckets`; schema extensions for `kind`, `bucket`, `healthcareCorpusReservationPercent`, `extendedFamilyContingencyPercent`, `glidePath`

**Total MVP-1 action items from Cluster B:** ~50 across 6 entries.

Next: **Cluster C — Tax surfaces** (Entry #12: Old vs new regime comparison)

---

## Entry #12 — Old vs new regime comparison

**Cluster:** C — Tax surfaces
**Item:** 1 of 4 *(Cluster C opener)*
**Status:** 🔄 CHANGE (significant — hardcoded deductions misrepresent user reality; missing educational surfaces)
**Ratified:** 2026-05-28 (2-point review: deduction sourcing · educational surfacing)

### v4 current position
- Multi-FY tax engine in `demo/src/lib/tax.ts` (260 lines, FY 24-25 to 26-27, slabs + surcharge + cess + marginal-relief flag)
- `demo/src/pages/tax-planning/Index.vue` (308 lines): AUTO/OLD/NEW regime toggle, per-earner comparison, "Save ₹X with [Better] regime" recommendation, active-cell highlight
- **Critical gap (line 99):** `deductions: 150000 + 25000` hardcoded baseline; does NOT use user's actual deductions
- No decision rule-of-thumb display
- No 80CCD(1B)/80CCD(2) survives-new-regime callout

### Research position — Ch 03 §3.9 + §3.10 (direct quote)
> "**Rule of thumb:**
> - If deductions ≥ ₹5L: old regime usually wins for incomes ₹15L–₹30L
> - If deductions < ₹3L: new regime almost always wins
> - For incomes above ₹50L, new regime tends to win regardless"
> "**80CCD(1B) NPS ₹50,000 DEDUCTION STILL APPLIES** (this is the key exception)"
> "**80CCD(2) employer NPS contribution still deductible** (the other key exception)"

### Verification (R2)
Read: `demo/src/lib/tax.ts` (multi-FY tax engine confirmed); `demo/src/pages/tax-planning/Index.vue` (regime comparison surface confirmed, hardcoded deduction at line 99 confirmed). **Confirmed:** v4 foundation is solid; gap is in deduction sourcing + educational surfacing.

### Verdict reasoning
v4's hardcoded ₹1.75L deduction baseline gives wrong recommendation to any user not at that exact value (which is most users). Sandwich-gen with significant insurance + NPS + PPF + home-loan-interest will routinely have ₹5-7L of deductions — the recommendation flips. Plus, common misunderstanding ("I lose NPS in new regime" — wrong) is not addressed.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A12.1 | Replace hardcoded `deductions: 150000 + 25000` at `Index.vue:99` with call to new `deriveDeductions(household, fy)` | n/a | `pages/tax-planning/Index.vue` | MVP-1 |
| A12.2 | New `deriveDeductions(household, fy)` — aggregates 80C (PPF + EPF self + ELSS + life-insurance premium, capped ₹1.5L), 80CCD(1B) (NPS up to ₹50K), 80CCD(2) (employer NPS), 80D self+family (₹25K), 80D parents (₹50K if senior parent member exists), Sec 24 (home-loan interest up to ₹2L), HRA (computed from rent if exists), standard deduction (FY-specific) | per-FY values | new `demo/src/lib/tax-deductions.ts` | MVP-1 |
| A12.3 | Display deduction breakdown on /tax-planning with line-items + "Override on /preferences §Tax →" link | n/a | `pages/tax-planning/Index.vue` | MVP-1 |
| A12.4 | `/preferences` § Tax — editable deduction-category overrides per R1.1; auto-derived defaults | auto-derive | new /preferences section | MVP-1 |
| A12.5 | Decision rule-of-thumb display: "Your deductions: ₹X. Rule: ≥₹5L → Old wins for ₹15-30L income; <₹3L → New wins; >₹50L → New wins regardless. Recommendation: [REGIME]." | research Ch 03 §3.9 quote | `pages/tax-planning/Index.vue` | MVP-1 |
| A12.6 | 80CCD callout: "💡 Note: 80CCD(1B) ₹50K and 80CCD(2) employer NPS survive in new regime — both regimes give you these." | static copy | `pages/tax-planning/Index.vue` | MVP-1 |
| A12.7 | Glossary entries: "Old vs New regime decision", "80CCD(1B) — the new-regime exception", "Decision rule-of-thumb", "Deduction sourcing" — research-quoted | static content | `lib/glossary.ts` | MVP-1 |
| A12.8 | Sec 87A marginal-relief edge case → Entry #13 (dedicated entry) | n/a | downstream | Entry #13 |

### Cross-references
- **Statutory inputs touched:** Sec 80C, 80CCD(1B), 80CCD(2), 80D, Sec 24, HRA, standard deduction — all stay R1.4 read-only in Statutory Reference
- **Related entries:** #13 Sec 87A marginal-relief, #14 NPS withdrawal, #11 sandwich-gen (80D parents nudge), Cluster D #16 LTCG harvesting (offsets income for regime decision)
- **R1 sub-rules invoked:** R1.1 (deduction overrides), R1.4 (statutory limits read-only)
- **R2 invoked:** verified v4's tax engine + regime-comparison surface before proposing changes

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Deduction sourcing | Locked **Option B** — Auto-sum from user data + R1 override on /preferences §Tax |
| 2 | Educational surfacing | Locked **Option A** — Both decision rule + 80CCD(1B)/80CCD(2) callout inline on /tax-planning (not glossary-only) |

---

## Entry #13 — Sec 87A marginal-relief edge

**Cluster:** C — Tax surfaces
**Item:** 2 of 4
**Status:** ➕ ADD (math works; missing awareness + mitigation + visualization)
**Ratified:** 2026-05-28 (single-point review: surfacing depth)

### v4 current position
**v4 has solid marginal-relief math:**
- `marginalRelief: boolean` flag (true for FY 25-26+ new regime), `rebateLimit: 1200000`
- Tax engine computes rebate WITH marginal relief
- Unit tests cover zero-at-12L + marginal-relief-cap-above (tax.spec.ts:54-64)
- UI line for "Rebate u/s 87A" on /tax-planning (Index.vue:233)
- Glossary entry exists

**Missing per Ch 04 §4.9:** awareness of the "100% marginal rate trap" (₹12L-₹12.6L), active mitigation suggestions, cliff visualization.

### Research position — Ch 04 §4.9 (direct quote)
> "For incomes ₹12L–₹12.6L: every extra rupee earned is matched by a rupee of tax — **effective marginal rate is 100%** on income in this band. ... Mitigations:
> - Deferring income if possible (RSU sale timing, performance-bonus deferral)
> - Increasing 80CCD(1B) contribution to pull taxable income back below ₹12L
> - Switching to old regime if deductions are sufficient"

Research calls this **"the most-likely-to-be-missed edge case in current Indian tax planning."**

### Verification (R2)
Grep for `marginalRelief|87A|rebate` across `demo/src`. **Confirmed:** v4 math is correct; gap is awareness/visualization/mitigation surfaces.

### Verdict reasoning
v4 already does the math right. What's missing is the CFP-grade behavior: telling the user "you're in the trap, here's how to get out." The trap is silent — without active surfacing, users will hit it without realizing.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A13.1 | Detection: when any earner's taxable income falls in ₹12L–₹12.6L band (new regime FY 25-26+), flag the trap | n/a (computed) | `lib/tax-deductions.ts` (extended) | MVP-1 |
| A13.2 | Warning chip on /tax-planning: "⚠️ Sec 87A marginal-relief band — your effective marginal tax rate is ~100% in ₹X-₹Y range" | n/a (UI) | `pages/tax-planning/Index.vue` | MVP-1 |
| A13.3 | Tax-cliff visualization chart on /tax-planning (vue-chartjs line: income on X, tax on Y, ₹12L-₹12.6L band highlighted, also shows old-regime curve for comparison) | n/a | `pages/tax-planning/Index.vue` | MVP-1 |
| A13.4 | Mitigation suggestions when in trap, each with concrete numbers: (a) "Increase 80CCD(1B) by ₹X (NPS) to drop taxable income below ₹12L"; (b) "Switch to old regime — your ₹Y deductions yield lower tax"; (c) "Defer ₹X variable/RSU income to next FY" | research Ch 04 §4.9 quote | `pages/tax-planning/Index.vue` | MVP-1 |
| A13.5 | Update existing glossary entry "Marginal relief" to cross-reference new chip + chart + mitigations | static content | `lib/glossary.ts` | MVP-1 |
| A13.6 | Tax-cliff chart toggleable "show old regime overlay" — surfaces regime decision visually within the cliff context | n/a | chart component | MVP-1 |

### Cross-references
- **Statutory inputs touched:** Sec 87A rebate ceiling ₹12L (R1.4 Statutory Reference), Sec 80CCD(1B) ₹50K (used in mitigations)
- **Related entries:** #12 regime comparison (one mitigation = regime switch), #14 NPS withdrawal (80CCD(1B) is the NPS top-up mitigation)
- **R1 sub-rules invoked:** R1.4 (statutory ceiling read-only)
- **R2 invoked:** verified v4's existing marginal-relief math before proposing additions

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | Surfacing depth | Locked **Option D** — Awareness chip + cliff visualization + active mitigation suggestions. Full CFP-grade for the research-named "most-likely-to-be-missed edge." |

---

## Entry #14 — NPS withdrawal rules (PFRDA 2025)

**Cluster:** C — Tax surfaces
**Item:** 3 of 4
**Status:** ➕ ADD (accurate FIRE projection requires PFRDA 2025 withdrawal split modeling)
**Ratified:** 2026-05-28 (single-point review: modeling depth)

### v4 current position
NPS as investment type (Tier 1/2 schema fields) — accumulation-side coverage only. **No withdrawal modeling, no PFRDA 2025 rules, no annuity income projection.**

### Research position — Ch 03 §3.3 (direct quote)
> "At normal exit (age 60+), for non-government subscribers:
> - Corpus > ₹12L: Up to 80% lump-sum, at least 20% to annuity
> - Tax: 60% lump-sum is tax-free, 40% taxable as income at slab.
> - ***Unverified:*** the tax treatment of the 20% extra above the historical 60%/40% split is awaiting CBDT clarification.
> - Annuity portion: taxable as income each year when received."

### Verification (R2)
Grep `NPS|PFRDA|annuity` across `demo/src` (10 hits — all accumulation-side); `withdraw|lumpSum|60.*40` (no NPS withdrawal logic). **Confirmed:** v4 has zero NPS withdrawal modeling.

### Verdict reasoning
A user with significant NPS corpus (typical: ₹40-80L by age 60 from ₹50K/yr 80CCD(1B)) faces:
- 60% tax-free = ₹24-48L
- 20% taxable lump @ slab = additional one-time tax event
- 20% annuity = ongoing slab-taxed income each retirement year

Without modeling this, FIRE projection over-states the usable post-tax NPS corpus.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A14.1 | NPS withdrawal modeling per PFRDA 2025: corpus > ₹12L → 80% lump-sum (60% tax-free + 20% taxable lump) + 20% annuity. Lower corpus uses earlier rules. | n/a | new `demo/src/lib/nps-withdrawal.ts` | MVP-1 |
| A14.2 | Annuity income added to retirement-year taxable income in FIRE projection (impacts decumulation tax calc) | n/a | `lib/fire-math.ts` projection | MVP-1 |
| A14.3 | Planning recommendation: "Cap NPS contribution at ₹X to maximize tax-free portion at age 60" — compute X based on user's projected NPS growth trajectory | n/a | Dashboard or /investments/holdings (NPS card) | MVP-1 |
| A14.4 | **Uncertainty flag** on the "unverified" extra 20%: tooltip + glossary note "CBDT clarification pending — currently treated as taxable per Tier-2 sources" | static + UI | UI + `lib/glossary.ts` | MVP-1 |
| A14.5 | Add PFRDA 2025 rules to /preferences §Statutory Reference (60/40 historical split, 80% lump-sum threshold at ₹12L corpus, annuity-as-taxable-income) | per R1.4 | /preferences | MVP-1 |
| A14.6 | Glossary entries: "NPS withdrawal at 60", "PFRDA 2025 rules", "Annuity tax treatment", "NPS tax-free cap optimization" | static content | `lib/glossary.ts` | MVP-1 |

### Cross-references
- **Statutory inputs touched:** PFRDA 2025 withdrawal rules → R1.4 Statutory Reference
- **Related entries:** #4 expected returns (NPS Tier 1 default 10%), #13 marginal-relief mitigation (NPS top-up suggested as ₹12L escape), Cluster D #18 international equity (LRS interaction)
- **R1 sub-rules invoked:** R1.4 (PFRDA rules read-only)
- **R2 invoked:** verified v4's NPS coverage before proposing additions

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | NPS withdrawal modeling depth | Locked **Option C** — Withdrawal math + planning recommendation + uncertainty flag for CBDT-pending portion |

---

## Entry #15 — VPF ₹2.5L threshold + EPF mandatory cliff

**Cluster:** C — Tax surfaces
**Item:** 4 of 4 *(Cluster C closer)*
**Status:** ➕ ADD (high-basic earners face cliff regardless of VPF choices; projection inaccurate without modeling)
**Ratified:** 2026-05-28 (single-point review: surfacing depth)

### v4 current position
`vpfTopUpPercent` field on `memberSalary`; auto-derived EPF/VPF contribution via `autoFlowSalaryToEPF()`; EPF_VPF combined instrument type. **Zero threshold modeling, zero tax-on-excess interest, zero mitigation surfaces.**

### Research position — Ch 03 §3.2 + Ch 04 §4.10 (direct quotes)
> "The ₹2.5L combined employee-contribution threshold caps the tax-free shelter. Contributions above generate interest **taxed at slab rate annually**. For a 30%-slab earner, after-tax yield drops from 8.25% to ~5.78%."

> "Basic ₹3.5L/month × 12 = ₹42L/year. Mandatory EPF: 12% of basic = ₹5.04L/year. **Mandatory alone is already ₹5.04L — well above the ₹2.5L threshold.** All interest on the ₹2.54L excess is taxable annually. **There is no way to avoid this short of reducing the basic salary component of CTC.**"

### Verification (R2)
Grep `VPF|2.5L|EPF.*threshold`. **Confirmed:** v4 has accumulation-side EPF/VPF infrastructure but no threshold/tax/mitigation logic.

### Verdict reasoning
For high-basic earners (typical IT senior leadership, ₹35L+ basic), mandatory EPF alone exceeds ₹2.5L — the cliff is unavoidable via VPF settings. v4 treats all EPF interest as tax-free in projections, systematically over-stating corpus growth for this cohort. Plus, the CTC-restructuring mitigation is non-obvious — needs surfacing.

### Action items

| # | Action | Default / spec | Where it lives | MVP |
|---|---|---|---|---|
| A15.1 | Calculate annual EPF+VPF employee contribution: `12% × basic + vpfTopUpPercent% × basic` | n/a (derived) | new `demo/src/lib/epf-vpf.ts` | MVP-1 |
| A15.2 | Compute excess over ₹2.5L threshold: `max(0, totalContrib - 250000)` | n/a | same module | MVP-1 |
| A15.3 | Apply slab-rate tax on excess interest in FIRE projection: after-tax yield = `8.25% × (1 - slabRate × (excess/total))` blended | n/a | `lib/fire-math.ts` projection | MVP-1 |
| A15.4 | Display threshold breakdown on /investments/holdings EPF_VPF card: "Your EPF+VPF: ₹X / yr | Threshold: ₹2.5L | Excess: ₹Y → taxed at slab → effective after-tax yield ~Z%" | n/a (display) | `pages/investments/Holdings.vue` | MVP-1 |
| A15.5 | Mitigation guidance: (a) **High-basic alert** when mandatory EPF alone > ₹2.5L: "Your mandatory EPF alone exceeds ₹2.5L — only CTC restructuring (lower basic, higher allowances) helps"; (b) **VPF-cap recommendation**: "Cap VPF top-up at ₹X% to stay below threshold (you're currently at ₹Y%)" | trigger-driven | Holdings page or nudge | MVP-1 |
| A15.6 | Add ₹2.5L threshold to /preferences §Statutory Reference (R1.4 read-only) with source: Sec 10(11)(12) post-2021 amendment | per R1.4 | /preferences | MVP-1 |
| A15.7 | Glossary entries: "VPF threshold (₹2.5L)", "EPF excess-interest tax", "CTC restructuring for high earners (Ch 04 §4.10)" | static content | `lib/glossary.ts` | MVP-1 |

### Cross-references
- **Statutory inputs touched:** ₹2.5L VPF threshold → R1.4 Statutory Reference
- **Related entries:** #4 expected returns (EPF default 8.25% needs after-tax correction for high earners), #12 regime decision (excess interest is taxable income → affects deduction-vs-tax balance)
- **R1 sub-rules invoked:** R1.4 (₹2.5L threshold read-only)
- **R2 invoked:** verified v4's EPF/VPF infrastructure before proposing additions

### Ratification log

| Point | Question | Decision |
|---|---|---|
| 1 | VPF threshold modeling depth | Locked **Option C** — Threshold calc + CTC-restructuring mitigation + VPF-cap recommendation. After-tax yield correction in projection. |

---

## ✅ Cluster C — Complete (4/4 items audited)

**Summary verdict:**
- 1× CHANGE (Entry #12 regime comparison — hardcoded deductions), 3× ADD (#13 marginal-relief surfacing, #14 NPS withdrawal, #15 VPF cliff)
- All MVP-1 scope
- Statutory Reference section significantly populated: Sec 87A, PFRDA 2025 NPS rules, ₹2.5L VPF threshold, joins PPF + EPF rates from Cluster A
- Decision rule + 80CCD callout + marginal-relief cliff visualization make `/tax-planning` materially more CFP-grade
- Cross-cluster: tax surfaces interlock with Cluster B Entry #6 family-nudge engine (sandwich-gen 80D, SCSS routes here) and Cluster D #16+ (LTCG harvesting, instrument-specific tax treatment)

**Total MVP-1 action items from Cluster C:** ~30 across 4 entries.

Next: **Cluster D — Instrument coverage** (Entry #16: LTCG harvesting nudges) — 9 entries, the largest remaining cluster.

---

## Entry #16 — LTCG harvesting nudges

**Cluster:** D — Instrument coverage
**Item:** 1 of 9 *(Cluster D opener)*
**Status:** ➕ ADD (awareness-only MVP-1; cost-basis-aware calculator deferred to MVP-2)
**Ratified:** 2026-05-28

### v4 current position
Capital gains as `OtherIncome` type. **No LTCG harvesting nudge, no per-holding cost basis, no annual reminder.**

### Research position — Ch 03 §3.4
> "Post-2024: ₹1.25L threshold; harvesting saves up to ₹15,625/year. Compounded over 20 years at 12% return, a consistent harvesting practice adds **~₹10-15L to the eventual after-tax FIRE corpus**. Worth the 15 minutes / year."

### Verification (R2)
Grep `LTCG|STCG|harvest|capitalGains|125000` — 3 hits (form, types, glossary). **Confirmed:** zero harvesting logic in v4.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A16.1 | Add ₹1.25L LTCG annual exemption to /preferences §Statutory Reference (R1.4 read-only, source: Sec 112A post-Budget-2024) | per R1.4 | /preferences | MVP-1 |
| A16.2 | Glossary entry "LTCG harvesting" — research-quoted ~₹10-15L impact + 15-min/yr technique + worked example | static | `lib/glossary.ts` | MVP-1 |
| A16.3 | Annual reminder nudge fires Mar 15: "FY ends in 2 weeks. Consider harvesting LTCG up to ₹1.25L (could save ~₹15,625/yr; ~₹10-15L over 20 yrs)" | trigger Mar 15 | nudge engine | MVP-1 |
| A16.4 | Per-holding harvest calculator deferred to MVP-2 (requires cost-basis tracking infrastructure) | n/a | post-audit | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** ₹1.25L LTCG exemption (R1.4), 12.5% LTCG rate (R1.4)
- **Related entries:** Cluster B #6 family-nudge engine extended, Cluster A #4 expected returns (LTCG affects equity after-tax yield)
- **R1 sub-rules invoked:** R1.4 (statutory threshold)
- **R2 invoked:** verified zero coverage in v4

### Ratification log
| Point | Question | Decision |
|---|---|---|
| 1 | LTCG harvesting scope MVP-1 | Locked **Option A** — Awareness-level: glossary + Statutory Ref + Mar 15 nudge. Cost-basis-aware calc deferred MVP-2. |

---

## Entry #17 — EEE front-loading order

**Cluster:** D · **Item:** 2 of 9
**Status:** ➕ ADD (research's "highest-conviction tactical rule"; absent from v4)
**Ratified:** 2026-05-28

### v4 current position
Some glossary EEE mentions; **no under-utilization detection, no front-loading strategy logic**.

### Research position — Ch 04 §4.14
> "**The more years of tax-free compounding an instrument provides, the earlier in the journey it should be loaded.** ₹1.5L into PPF compounded at 7.1% for 20 yrs = ₹5.92L tax-free. Same ₹1.5L into debt MF at 7% taxed at 30% slab = ~₹3.55L. **Difference: ₹2.37L per year of contribution.**"

### Verification (R2)
Grep `EEE|frontload`. v4 has glossary mentions only.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A17.1 | Glossary entry "EEE front-loading rule" — research-quoted "highest-conviction tactical rule" + worked example | static | `lib/glossary.ts` | MVP-1 |
| A17.2 | Under-utilization nudges in nudge engine: (a) PPF contribution < ₹1.5L → "Top up PPF to ₹1.5L → adds ~₹2.37L/yr value over 20 yrs"; (b) NPS 80CCD(1B) < ₹50K → "Top up NPS to ₹50K"; (c) employer offers NPS-corporate but `80CCD(2)` not maxed → "Discuss 80CCD(2) with HR" | trigger thresholds | `lib/family-nudges.ts` (extended; not just family) | MVP-1 |
| A17.3 | Cross-link to Entry #15 (VPF threshold) — VPF nudge respects ₹2.5L cap | n/a | nudge engine | MVP-1 |

### Cross-references
- **Statutory inputs touched:** 80C ₹1.5L, 80CCD(1B) ₹50K, VPF ₹2.5L (all R1.4)
- **Related entries:** #15 VPF cliff (interplay), #12 regime decision (deduction values), #14 NPS withdrawal (NPS optimization)
- **R1 sub-rules invoked:** R1.4 (statutory limits read-only)
- **R2 invoked:** verified absence

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option A** — Glossary + under-utilization nudges (PPF, NPS 80CCD(1B), 80CCD(2) employer NPS). Dedicated optimization page deferred. |

---

## Entry #18 — International equity

**Cluster:** D · **Item:** 3 of 9
**Status:** ➕ ADD (research-recommended 10-20% allocation; absent as first-class in v4)
**Ratified:** 2026-05-28

### v4 current position
No dedicated international type. International holdings lumped into Stocks/MutualFunds. No LRS/TCS/DTAA modeling.

### Research position — Ch 03 §3.6
> "Three routes: India-domiciled FoF · LRS to foreign broker · GIFT City. Recommended allocation: **10–20% of growth allocation in international equity**."

### Verification (R2)
Grep `international|LRS|GIFT|FoF|FANG|nasdaq` — no investmentType match. **Confirmed:** lumped into Stocks/MF.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A18.1 | Add `'International'` to `investmentTypeSchema` with optional `internationalRoute: 'FoF'\|'LRS-Direct'\|'GIFT-City'` subfield | undefined route for legacy | `types/household.ts` | MVP-1 |
| A18.2 | Investment form shows `internationalRoute` selector when type=International + LRS warning copy ("$250K/yr cap; 5% TCS above ₹10L cumulative") | undefined | `components/forms/InvestmentForm.vue` | MVP-1 |
| A18.3 | Add LRS $250K cap + TCS ₹10L threshold + 5% TCS rate to /preferences §Statutory Reference (R1.4) | per R1.4 | /preferences | MVP-1 |
| A18.4 | Nudge: if user has growth allocation ≥ ₹50L AND 0% international → "Research recommends 10-20% international allocation for currency + concentration diversification (Ch 03 §3.6)" | trigger | nudge engine | MVP-1 |
| A18.5 | Glossary entries: "International equity routes (FoF/LRS/GIFT City)", "LRS-TCS", "Indirect vs direct international exposure" | static | `lib/glossary.ts` | MVP-1 |
| A18.6 | LRS-TCS tracking + DTAA-credit modeling deferred to MVP-2 | n/a | post-audit | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** LRS $250K cap, LRS-TCS ₹10L threshold, 5% TCS rate (all R1.4)
- **Related entries:** #4 expected returns (international as 4th class), Cluster F #34 (estate planning — US estate tax on direct holdings)
- **R1 sub-rules invoked:** R1.4 (statutory limits)
- **R2 invoked:** verified absence

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option B** — New `International` instrument type + route subfield + LRS/TCS to Statutory Ref + nudge. DTAA-credit modeling deferred. |

---

## Entry #19 — SGB / Gold allocation defaults

**Cluster:** D · **Item:** 4 of 9
**Status:** ➕ ADD (per-subtype tax differentiation + allocation guidance)
**Ratified:** 2026-05-28

### v4 current position
Gold instrument with `goldSubtypeSchema = ["Physical", "SGB", "ETF"]` (confirmed `types/household.ts:147`). **No per-subtype tax treatment in projection; no allocation guidance; no SGB maturity tracking.**

### Research position — Ch 03 §3.7
> "SGB is **structurally the best** gold-allocation vehicle because of the tax-free maturity. Target allocation: **5–10% of total portfolio**."

### Verification (R2)
v4 has subtype schema. Confirmed gap is in tax treatment + allocation nudge + maturity awareness.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A19.1 | Per-subtype tax in projection: SGB → tax-free at 8yr maturity · ETF → slab-rate (post-Budget-2024 debt-MF treatment) · Physical → 12.5% LTCG >24mo, slab STCG | research rates | `lib/fire-math.ts` projection | MVP-1 |
| A19.2 | Add SGB `purchaseYear` field tracking to investment schema (or use `openingYear`); compute years-to-maturity | n/a | `types/household.ts` | MVP-1 |
| A19.3 | Allocation guidance nudge: if gold allocation < 5% OR > 10% of total portfolio → "Research suggests 5-10% gold (inflation hedge, low correlation)" | trigger | nudge engine | MVP-1 |
| A19.4 | SGB-specific nudge: "SGB tax-free at 8yr maturity — your SGB matures in N years" + warning if user is considering selling pre-maturity | trigger | nudge engine | MVP-1 |
| A19.5 | Glossary entries: "SGB vs Gold ETF vs Physical", "8-year SGB maturity", "Gold as inflation hedge", "Why SGB issuance is irregular" | static | `lib/glossary.ts` | MVP-1 |
| A19.6 | SGB issuance-window reminders deferred (requires external data feed) | n/a | post-audit | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** SGB 8yr tax-free maturity (R1.4), Gold LTCG 12.5%>24mo (R1.4)
- **Related entries:** #4 expected returns (Gold default 7%; subtype-level rates), Cluster A #3 inflation (gold's real return at 7.9% household inflation is -0.9%; surface this)
- **R1 sub-rules invoked:** R1.4 (statutory tax rates)
- **R2 invoked:** verified existing Gold subtype schema

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option A** — Per-subtype tax + allocation nudge + SGB maturity. Issuance-window reminders deferred (external data feed). |

---

## Entry #20 — Real estate treatment

**Cluster:** D · **Item:** 5 of 9
**Status:** 🔄 CHANGE + ➕ ADD (significant — current treatment over-states corpus by including primary residence; new REIT type + illiquidity warning)
**Ratified:** 2026-05-28

### v4 current position
RealEstate instrument with `ownership: 'Self'|'Rented'|'Co-owned'`. **All RE counts toward FIRE corpus indiscriminately.** No primary-residence-vs-investment distinction, no REIT type, no illiquidity warning.

### Research position — Ch 04 §4.6 + Ch 05 §5.6
> "**Don't treat residential real estate as part of the FIRE corpus** — it's a lifestyle asset."
> "Real estate's appeal as 'bond allocation' only holds if: market with above-average rental yield (4–5%+); bought below replacement cost; significant capital appreciation expected."
> "**REITs** (Embassy, Mindspace, Brookfield, Nexus Select) — listed, liquid, regulated, modest yield ~6-8%. Treat as a quasi-equity / quasi-debt vehicle."

### Verification (R2)
Confirmed v4's RealEstate schema (ownership enum) — no role/purpose differentiation.

### Verdict reasoning
Sandwich-gen primary user typically has ₹1-2 Cr primary residence. v4 includes that in FIRE corpus; research is unambiguous that it shouldn't be. Misleading user toward earlier-than-feasible retirement.

### Action items

| # | Action | Default / spec | Where | MVP |
|---|---|---|---|---|
| A20.1 | Add `realEstateRole: 'PrimaryResidence' \| 'Investment' \| 'Inherited' \| undefined` field to investment schema (only meaningful when type=RealEstate) | undefined for legacy; nudge user to classify | `types/household.ts` | MVP-1 |
| A20.2 | Exclude `PrimaryResidence` from FIRE corpus by default in projection math; R1-customizable on /preferences ("Include primary residence?") | Excluded | `lib/fire-math.ts` + /preferences | MVP-1 |
| A20.3 | Add `'REIT'` to `investmentTypeSchema` (listed, liquid, ~6-8% yield) | new type | `types/household.ts` | MVP-1 |
| A20.4 | Illiquidity warning chip on Investment-role RE: "Real estate is illiquid in retirement — selling takes 6-12 months. Consider REIT for liquid RE exposure." | n/a | Holdings page | MVP-1 |
| A20.5 | Glossary entries: "Primary residence vs Investment RE", "REIT (Indian)", "Rental yield as bond equivalent (Ch 04 §4.6 yield test)", "RE illiquidity in retirement (Ch 05 §5.6)" | static | `lib/glossary.ts` | MVP-1 |
| A20.6 | Nudge for users with PrimaryResidence-role RE: "Your primary residence (₹X) is now excluded from FIRE corpus per research. Override on /preferences if you plan to sell at retirement." | trigger | nudge engine | MVP-1 |
| A20.7 | Yield-test calculator + reverse-mortgage modeling deferred to MVP-2 | n/a | post-audit | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** none directly (Sec 54 RE LTCG reinvestment is Cluster F estate scope)
- **Related entries:** #4 expected returns (RE 6% default), Cluster A #3 inflation (RE real return -1.9% at household 7.9%), Cluster B #8 buckets (RE often Bucket 3/4 due to illiquidity)
- **R1 sub-rules invoked:** R1.1 (include-PrimaryResidence editable on /preferences)
- **R2 invoked:** verified existing v4 RE schema

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option B** — realEstateRole field + REIT instrument type + illiquidity warning. Yield-test calculator + reverse-mortgage modeling deferred. |

---

## Entry #21 — Coast FIRE + Barista FIRE explicit calculators

**Cluster:** D · **Item:** 6 of 9
**Status:** ➕ ADD (light extension — Entry #2 already locked core Coast/Barista work)
**Ratified:** 2026-05-28 (no question — gaps after Entry #2 are minor)

### Status note
This entry was **substantially covered by Entry #2** (A2.2 Barista hybrid + A2.3 Coast formula + A2.5 Dashboard layout). Adding only gaps not covered there.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A21.1 | Coast FIRE projection chart on `/preferences§FIRE-Variants` or dedicated `/fire-goals/coast`: current corpus trajectory + Coast number trajectory; intersection = "you can stop saving" date | n/a | new chart component | MVP-1 |
| A21.2 | Barista FIRE income-scenario calculator: 3 preset active-income levels (₹40K · ₹70K · ₹1L/mo) with corresponding corpus needs | n/a | extends Entry #2 A2.5 Barista card | MVP-1 |
| A21.3 | Cross-reference glossary entries between Coast/Barista/Lean/Regular/Fat | static | `lib/glossary.ts` | MVP-1 |
| A21.4 | Extend tour to walk through Coast + Barista paths | n/a | `lib/tour-steps.ts` | MVP-1 |

### Cross-references
- **Major dependency:** Entry #2 (A2.2, A2.3, A2.5, A2.6) are prerequisites
- **R2 invoked:** confirmed Entry #2 coverage; this entry only fills gaps

---

## Entry #22 — HUF (Hindu Undivided Family)

**Cluster:** D · **Item:** 7 of 9
**Status:** ➕ ADD (awareness-only; full modeling MVP-2+)
**Ratified:** 2026-05-28

### v4 current position
**No HUF modeling.** Research README TODO(5W) flags this as a known gap.

### Research position — Ch 04 §4.4
> "HUF is one of the most powerful — and most underused — tax tools. ... For salaried-only working professional with no ancestral assets and no business income, the HUF benefit is **modest**. For families with mixed income sources, HUF can be worth a **10–15% reduction in family-level effective tax**."

### Verification (R2)
Grep `HUF|Hindu` — no v4 references. Confirmed absent.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A22.1 | Glossary entry "HUF" — research-quoted use cases, qualifying conditions, limitations (clubbing rules, no LRS access, partition mechanics) | static | `lib/glossary.ts` | MVP-1 |
| A22.2 | Qualifying-condition nudge: when user has Business income (existing `businesses[]`) OR signals inherited property → "Your family may benefit from HUF — Ch 04 §4.4 suggests 10-15% effective tax reduction for families with ancestral/business income. Consult CA." | trigger | nudge engine | MVP-1 |
| A22.3 | Caveats explicitly surfaced: HUF needs CA-grade advice; clubbing rules; cannot use LRS; partition can be triggered by any coparcener | static (within glossary + nudge) | nudge UI + glossary | MVP-1 |
| A22.4 | Full HUF modeling (separable sub-household, separate PAN, separate ITR) deferred to MVP-2+ | n/a | post-audit | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** HUF separate slab/exemption (R1.4)
- **Related entries:** #11 sandwich-gen (HUF nudge fits the family-nudge-engine pattern), Cluster F #34 (estate planning — HUF partition + karta succession)
- **R1 sub-rules invoked:** R1.4 (HUF tax provisions read-only)
- **R2 invoked:** verified absence

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option A** — Glossary + qualifying-condition nudge. Full HUF modeling deferred to MVP-2. |

---

## Entry #23 — Dual-income joint home loan optimization

**Cluster:** D · **Item:** 8 of 9
**Status:** ➕ ADD (~₹25L corpus impact for dual-income couples with home loan)
**Ratified:** 2026-05-28

### v4 current position
**No co-borrower/co-owner modeling.** Loans single-member. Joint-home-loan optimization invisible.

### Research position — Ch 04 §4.5
> "If both spouses are co-borrowers AND co-owners: each can claim ₹2L Sec 24 + ₹1.5L 80C. **Total deduction: ₹7L vs ₹3.5L** for single-borrower. ... ₹35K/yr × 20 yrs × 12% reinvestment = **~₹25L additional corpus**."

### Verification (R2)
Grep `coBorrow|coOwner|jointLoan` — zero results. Confirmed absent.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A23.1 | Add `coBorrowers: memberId[]` field to `liabilitySchema` (meaningful for home loans only) | empty array | `types/household.ts` | MVP-1 |
| A23.2 | Loan form gains co-borrower selector (multi-select of EARNER members) when type=HomeLoan | empty | `components/forms/LoanForm.vue` | MVP-1 |
| A23.3 | Tax calculation respects co-borrowers: per-borrower Sec 24 + 80C deduction split by co-borrower count (research's "₹2L each + ₹1.5L each") | n/a | `lib/tax-deductions.ts` (Entry #12) | MVP-1 |
| A23.4 | Nudge: married dual-income couples with home loan but single borrower → "Consider joint-borrower structure — saves ₹35K/yr at 30% slab; ~₹25L corpus over 20yrs" + caveat ("Requires both as co-owners on title deed; consult CA before restructuring") | trigger | nudge engine | MVP-1 |
| A23.5 | Glossary entry "Joint home loan tax structure (Ch 04 §4.5)" — worked example | static | `lib/glossary.ts` | MVP-1 |

### Cross-references
- **Statutory inputs touched:** Sec 24 (₹2L per borrower), Sec 80C (₹1.5L per borrower) — both R1.4
- **Related entries:** #12 regime decision (joint deductions affect old-vs-new), Cluster F #34 (joint title is estate-planning concern)
- **R1 sub-rules invoked:** R1.4 (statutory caps)
- **R2 invoked:** verified absence

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option A** — coBorrowers field + auto-double deductions + nudge. Dedicated optimization page deferred to MVP-2. |

---

## Entry #24 — ESOP/RSU dual-layer taxation

**Cluster:** D · **Item:** 9 of 9 *(Cluster D closer)*
**Status:** 🔄 CHANGE + ➕ ADD (mid-fidelity → full dual-layer + foreign-RSU specifics)
**Ratified:** 2026-05-28

### v4 current position
ESOP mid-fidelity (`totalGrantValue` + `vestedPercent`). **No perquisite tax at vest, no capital gains layer, no cliff-bunching warning, no foreign-RSU handling.**

### Research position — Ch 04 §4.12
> "Layer 1 — Perquisite tax at vesting (Sec 17(2)(vi)): FMV minus exercise price, slab-taxed. Layer 2 — Capital gains on sale: STCG 20% / LTCG 12.5%. ... Cliff schedules bunch as single-year tax event (25% at month 12). ... Foreign RSUs: India perquisite + Schedule FA + **US estate tax exposure above $60K** for non-residents."

### Verification (R2)
Confirmed v4's ESOP schema has only `totalGrantValue` + `vestedPercent` at `types/household.ts:165-166`.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A24.1 | Add to ESOP investment schema: `grantorCountry: 'India' \| 'US' \| 'Other' \| undefined` (drives tax treatment) | undefined | `types/household.ts` | MVP-1 |
| A24.2 | Add to ESOP: `exercisePrice` (per-share), `fmvAtVest` (per-share), `vestedValueINR` (computed: FMV-at-vest × shares × exchange-rate-if-foreign) | undefined | `types/household.ts` | MVP-1 |
| A24.3 | Compute Layer 1 perquisite tax at vest events: `(fmvAtVest - exercisePrice) × shares × marginalSlabRate` — added to user's annual taxable income | n/a | new `lib/esop-tax.ts` | MVP-1 |
| A24.4 | Compute Layer 2 capital gains on sale projections: STCG 20% / LTCG 12.5% on (`salePrice - fmvAtVest`) | n/a | same module | MVP-1 |
| A24.5 | Cliff-bunching warning: detect 25%-at-month-12 cliff pattern, surface "Your large vest in [month/year] will bunch ₹X of perquisite tax in that FY. Consider deferring other income events." | trigger | nudge engine | MVP-1 |
| A24.6 | Foreign-RSU specific nudge when `grantorCountry === 'US'`: (a) Schedule FA disclosure reminder for ITR; (b) US estate tax warning if vested USD value > $60K — "Consider Irish-domiciled ETFs instead per Ch 04 §4.12" | trigger | nudge engine | MVP-1 |
| A24.7 | Glossary entries: "ESOP/RSU dual-layer", "Perquisite tax at vest", "Cliff-bunching trap", "Foreign RSU + US estate tax", "Schedule FA" | static | `lib/glossary.ts` | MVP-1 |
| A24.8 | Full month-by-month vest-schedule modeling deferred MVP-2 | n/a | post-audit | MVP-2+ |

### Cross-references
- **Statutory inputs touched:** Sec 17(2)(vi) perquisite, LTCG/STCG rates (R1.4)
- **Related entries:** #12 regime decision (perquisite tax is income — affects regime calc), #13 marginal-relief (vest could push income into ₹12-12.6L trap), Cluster F #34 (Schedule FA is estate-adjacent compliance)
- **R1 sub-rules invoked:** R1.4 (statutory rates)
- **R2 invoked:** verified v4's mid-fidelity ESOP schema

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option B** — Dual-layer (perquisite + capital gains) + cliff-bunching warning + foreign-RSU handling (Schedule FA reminder, US estate tax warning). Full vest-schedule modeling deferred. |

---

## ✅ Cluster D — Complete (9/9 items audited)

**Summary verdict:**
- 7× ADD + 2× CHANGE+ADD (Entries #20 RE treatment, #24 ESOP/RSU)
- All MVP-1 scope
- New instrument type added: International + REIT
- Schema extensions: realEstateRole, coBorrowers, grantorCountry + ESOP detail fields, internationalRoute, ESOP exercise/FMV fields
- Statutory Reference significantly populated: LRS cap, LRS-TCS, ₹1.25L LTCG, SGB maturity, Sec 17(2)(vi), Sec 24, Sec 80C
- New nudges added across the cluster: LTCG harvesting (Mar 15), under-utilization (PPF/NPS/EPF), international exposure, primary-residence exclusion, joint-borrower, cliff-bunching, foreign-RSU compliance, HUF qualifier
- Cluster D heavily cross-references Cluster C (tax) — all instrument-level tax calculations feed the /tax-planning regime decision

**Total MVP-1 action items from Cluster D:** ~50 across 9 entries.

Next: **Cluster E — Variants, scenarios, behavioral** (Entry #25: Lean/Regular/Fat explicit targets)

---

## Entry #25 — Lean/Regular/Fat explicit targets

**Cluster:** E · **Item:** 1 of 6
**Status:** ➕ ADD (light — extends Entry #2's variant work)
**Ratified:** 2026-05-28 (no question — additive to existing Entry #2 framework)

### Status note
Substantially covered by Entry #2 (variant model + multipliers + Dashboard layout). This entry adds the gaps:
- Per-variant years-to-target tracking
- Active-target selection by user

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A25.1 | Per-variant years-to-target shown on each Lean/Regular/Fat Dashboard chip | computed | Dashboard chips from Entry #2 A2.5 | MVP-1 |
| A25.2 | "Pick your target variant" educational microcopy on first Dashboard visit + glossary cross-link | static | Dashboard onboarding | MVP-1 |
| A25.3 | User marks one variant as "active target" on /preferences §FIRE-Variants — drives downstream recommendations | Regular | /preferences | MVP-1 |

### Cross-references
- **Major dependency:** Entry #2 (variant model + chips), Entry #6 (family layer added on top)
- **R1 sub-rules invoked:** R1.1 (active target editable)

---

## Entry #26 — WhatIf scenario seeds

**Cluster:** E · **Item:** 2 of 6
**Status:** 🔄 CHANGE (augment seeds with research stress-tests)
**Ratified:** 2026-05-28

### v4 current position
3 seed scenarios in `stores/scenarios.ts`: "Aggressive savings" / "Conservative outlook" / "Windfall received". All positive variations — **no stress-tests**.

### Research position — Ch 05 §5.14
> "Run plan against: 2008-style 50% drawdown year 1 · 7% sustained inflation 5 yrs · parent ₹10L/yr 8 yrs · child ₹2Cr Masters · spouse career ends early · living to 100 · ₹15L surgery uncovered · RE drops 30% · 80CCD(1B) removed · health premium triples."

### Verification (R2)
Read `stores/scenarios.ts` (12 LeverValues incl. healthcareInflation, equityAllocationPct, lumpSumWindfall, kidsCollegeYears); `pages/fire-goals/WhatIf.vue` (lever panel + scenario manager confirmed). **Confirmed:** infrastructure supports stress-test scenarios cleanly.

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A26.1 | Update `seedScenarios()`: keep 3 positive + add 3 stress — "50% drawdown year 1" + "Healthcare shock" + "Longevity tail (planToAge 100)" | research-grounded values | `stores/scenarios.ts` | MVP-1 |
| A26.2 | Glossary entry "Stress-test scenarios (Ch 05 §5.14)" | static | `lib/glossary.ts` | MVP-1 |
| A26.3 | ScenarioManager UI groups seeds by category: "Positive variations" + "Stress tests" | n/a | WhatIf UI | MVP-1 |
| A26.4 | Entry #27 extends stress-test surfacing beyond WhatIf | n/a | downstream | Entry #27 |

### Cross-references
- Major dependency: WhatIf scenario infrastructure (already in v4); Entry #27 (in-app stress tests)
- **R2 invoked:** verified scenarios store and WhatIf UI before proposing additions

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option B** — 6 scenarios: 3 positive (kept from v4) + 3 stress-tests (50% drawdown · healthcare shock · longevity tail). Grouped by category in UI. |

---

## Entry #27 — In-app stress tests

**Cluster:** E · **Item:** 3 of 6
**Status:** ➕ ADD (batch runner converts §5.14 checklist into one-button pass/fail summary)
**Ratified:** 2026-05-28

### Differential value over Entry #26
#26 = stress scenarios as WhatIf presets. #27 = batch runner that auto-runs all 10 §5.14 stress tests and shows pass/fail summary.

### Research position — Ch 05 §5.14
> "A plan that passes all of these at 28-33× expenses is a robust Indian FIRE plan. Anything less is hopeful arithmetic."

### Action items

| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A27.1 | New route `/fire-goals/stress-test` (sub-route of FIRE Goals) — batch-runs all 10 Ch 05 §5.14 stress scenarios against user's current plan | n/a | new `pages/fire-goals/StressTest.vue` + router | MVP-1 |
| A27.2 | Pass/fail summary per scenario with explanation: "Scenario 1 (50% drawdown year 1): FAIL — corpus depleted by year N. Cause: high equity allocation at crossover. Fix: glide-path adjustment per Entry #7." | trigger | StressTest page | MVP-1 |
| A27.3 | Dashboard red-flag chip when failures > 0: "⚠️ Plan fails X of 10 stress tests — review /fire-goals/stress-test" | trigger | Dashboard | MVP-1 |
| A27.4 | Each failing scenario links to remediation action items (e.g., bucket strategy, glide path adjustment, healthcare buffer increase) | n/a | StressTest page | MVP-1 |
| A27.5 | Glossary entry "Stress-test batch runner (Ch 05 §5.14)" — research-quoted | static | `lib/glossary.ts` | MVP-1 |

### Cross-references
- Major dependency: Entry #26 (scenarios infrastructure), all Cluster B entries (glide path #7, buckets #8, healthcare #10) provide the remediation actions
- **R2 invoked:** WhatIf scenario infrastructure verified in Entry #26

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option B** — Dedicated /fire-goals/stress-test route + Dashboard red-flag chip. Most actionable. |

---

## Entry #28 — Automation defaults

**Cluster:** E · **Item:** 4 of 6
**Status:** ➕ ADD (research's #1 behavioral mitigation)
**Ratified:** 2026-05-28

### v4 current position
v4 auto-flows salary → EPF/VPF. No SIP/NPS/PPF auto-contribution suggestions.

### Research position — Ch 05 §5.8
> "Automate everything — SIPs, NPS contribution, PPF, recurring deposits. Remove the monthly decision."

### Action items
| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A28.1 | Glossary entry "Automation as behavioral mitigation" — research-quoted Ch 05 §5.8 | static | `lib/glossary.ts` | MVP-1 |
| A28.2 | Nudge engine: when user has manual PPF/NPS/equity-MF contributions (monthlyContribution > 0 but no flag indicating auto), surface "Set up auto-debit for [X] — research §5.8 #1 behavioral fix" | trigger | nudge engine | MVP-1 |
| A28.3 | Add optional `isAutomated: boolean` field to Investment schema (suppresses nudge when true) | false | `types/household.ts` | MVP-1 |

### Cross-references
- Related: Cluster B #6 (nudge engine), Entry #15 (EPF/VPF auto-flow precedent)

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option A** — Glossary + auto-debit nudges. External wizard out of scope. |

---

## Entry #29 — Lifestyle inflation tracking

**Cluster:** E · **Item:** 5 of 6
**Status:** ➕ ADD (behavioral guardrail absent in v4)
**Ratified:** 2026-05-28 (bundled with #30)

### v4 current position
No year-over-year expense tracking. Lifestyle inflation invisible.

### Research position — Ch 05 §5.8
> "Lifestyle inflation (silent killer): 10% raise → 8% lifestyle inflation → 2% extra savings. Repeated over 15 years, corpus delta vs flat-lifestyle is massive."

### Action items
| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A29.1 | Auto-snapshot annual total expenses on FY rollover (Apr 1) — store history with date stamps | n/a | new `lib/expense-history.ts` + localStorage | MVP-1 |
| A29.2 | Lifestyle-inflation nudge: when YoY expense growth > household-inflation-blend + 2pp, surface "Your expenses grew X% YoY — outpacing inflation by Y%. Consider whether this is lifestyle inflation worth reviewing." | trigger | nudge engine | MVP-1 |
| A29.3 | YoY expense chart on /expenses/overview showing actual vs research-inflation trajectory | n/a | new chart component | MVP-1 |
| A29.4 | Glossary entry "Lifestyle inflation (Ch 05 §5.8)" | static | `lib/glossary.ts` | MVP-1 |

### Ratification log
| Point | Decision |
|---|---|
| 1 (bundled) | **Option A** — YoY tracking + nudge + chart |

---

## Entry #30 — Goal-post-moving guardrails

**Cluster:** E · **Item:** 6 of 6 *(Cluster E closer)*
**Status:** ➕ ADD (behavioral guardrail absent in v4)
**Ratified:** 2026-05-28 (bundled with #29)

### v4 current position
No FIRE-number-change history. Goal-post moving invisible.

### Research position — Ch 05 §5.8
> "Goal posts moving: 'My FIRE number is ₹5 crore' → corpus reaches ₹4 crore → 'Actually I need ₹7 crore'. Endless goal-post moving means the FIRE crossover never arrives."

### Action items
| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A30.1 | Auto-snapshot FIRE number monthly (or on each major recompute) — store history | n/a | extends `lib/expense-history.ts` (now broader) | MVP-1 |
| A30.2 | Goal-post-shift nudge: when FIRE number raised by > 5% in past 6 months, surface "You've raised your FIRE target by ₹X (Y%) in the past 6 months. Is this justified by new data, or unconscious deferral?" | trigger | nudge engine | MVP-1 |
| A30.3 | FIRE-number trajectory chart on Dashboard showing target over time | n/a | Dashboard | MVP-1 |
| A30.4 | Glossary entry "Goal-post moving (Ch 05 §5.8)" | static | `lib/glossary.ts` | MVP-1 |

### Cross-references
- Major dependency: Entry #29 (shared snapshot/history infrastructure)
- Related: every Cluster A entry that changes the FIRE number (#1 SWR, #2 corpus multiple, #3 inflation, #4 returns) feeds the history

### Ratification log
| Point | Decision |
|---|---|
| 1 (bundled with #29) | **Option A** — Monthly FIRE-number snapshot + shift nudge + trajectory chart |

---

## ✅ Cluster E — Complete (6/6 items audited)

**Summary verdict:**
- 5× ADD + 1× CHANGE (Entry #26 augmented seeds)
- All MVP-1 scope
- Stress-test routes (#27) + scenario seeds (#26) + behavioral guardrails (#29, #30) introduce a substantial CFP-grade behavioral safety net
- Cluster E heavily depends on Clusters A+B (math defaults + modeling) — stress-tests are only meaningful with correct underlying math
- Snapshot infrastructure (`lib/expense-history.ts`) is new — touches multiple entries

**Total MVP-1 action items from Cluster E:** ~20 across 6 entries.

Next: **Cluster F — Framing, UX, estate** (Entry #31: Sharmas seed realism) — final cluster.

---

## Entry #31 — Sharmas seed realism

**Cluster:** F · **Item:** 1 of 6
**Status:** ✅ Survives (minor framing adjustments)
**Ratified:** 2026-05-28

### v4 current position (verified)
Sharmas: Rohit 30 / Priya 29 / Aarav 4 / Meera 2; combined CTC ~₹43L; retire @47/@50; Metro; ~₹50L EPF + other holdings.

### Research baseline — Ch 02 §2.9
> "Age 28-40 median ~33, income ₹25-80L, married + 0-2 children, IT/banking/consulting, Bangalore/Hyderabad/Pune/Gurgaon/Mumbai. Savings rate 30-80% (median 45-55%). Crossover 45-50."

### Verdict reasoning
Sharmas already fits the research baseline well. Minor tweaks only.

### Action items
| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A31.1 | Add explicit city: "Bangalore" or "Hyderabad" instead of abstract "Metro" — adds realism + connects to geo-arbitrage discussions (Ch 04 §4.1) | "Bangalore" | `lib/seed-persona.ts` | MVP-1 |
| A31.2 | Confirm Sharmas plan-to age propagates to 90 via Entry #1 A1.2 default (when planToAge field is added) | 90 | seed | MVP-1 |
| A31.3 | Add ₹50L Parents bucket (recurring kind:'parents' @ ₹40K/mo) to Sharmas seed — demonstrates Entry #6 family layer | ₹40K/mo | `lib/seed-persona.ts` | MVP-1 |
| A31.4 | Add Aarav education target (kind:'education', ₹1.5Cr by 2040 for overseas Masters at 22) to Sharmas plannedFuture — demonstrates Entry #6 nudge resolution | ₹1.5Cr by 2040 | `lib/seed-persona.ts` | MVP-1 |

### Cross-references
- Major dependency: All Cluster A/B locks (seed must illustrate the new defaults)
- **R2 invoked:** verified seed values

---

## Entry #32 — Microcopy framing (US-blog vs Indian-planner voice)

**Cluster:** F · **Item:** 2 of 6
**Status:** 🔄 CHANGE (microcopy replacement across surfaces)
**Ratified:** 2026-05-28

### v4 current position
Mixed framing — some US-FIRE-flavored, some Indian-planner. Tour copy is solid; other surfaces inconsistent.

### Research position — README author-voice directive
> "Senior CFP / NISM-XV-certified planner; advisory tone, not promotional."

### Action items
| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A32.1 | Microcopy audit across Dashboard / /tax-planning / /investments / /fire-goals / glossary | n/a | all consumer surfaces | MVP-1 |
| A32.2 | Replace US-FIRE terms: "4% rule" → "horizon-driven SWR (3.0-3.5% Indian range)"; "25× rule" → "28-33× corpus multiple (Indian)"; "early retirement at 35" → "FIRE at 47-50 with family layer accounted" | n/a | text replacements | MVP-1 |
| A32.3 | Add research chapter citations to tooltips (e.g., "Why 3.5% not 4%? See Ch 02 §2.2") | n/a | tooltip system | MVP-1 |
| A32.4 | Voice/style-guide doc deferred (MVP-2 candidate if multiple contributors emerge) | n/a | post-audit | MVP-2+ |

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option A** — Full microcopy audit + replacement across consumer surfaces. Style-guide doc deferred. |

---

## Entry #33 — Glossary coverage of India-specific concepts

**Cluster:** F · **Item:** 3 of 6
**Status:** ✅ Survives (consolidation/integrity check; substance added across all prior entries)
**Ratified:** 2026-05-28

### Action items
| # | Action | Where | MVP |
|---|---|---|---|
| A33.1 | Consolidated glossary audit — verify ~50 entries added across Entries #1-#32 are present, deduped, cross-linked, research-citation-correct | `lib/glossary.ts` + glossary.spec.ts | MVP-1 |
| A33.2 | Add 5 missing high-value India-specific terms: "AY (Assessment Year)", "AMFI", "PFRDA", "RBI Master Direction", "Schedule FA" | static | `lib/glossary.ts` | MVP-1 |
| A33.3 | Glossary search + categorization (Tax / Instruments / Strategy / Risk / Behavioral) for navigation | n/a | glossary UI | MVP-1 |

### Cross-references
- All prior entries (#1-#32) feed glossary content; this entry validates aggregate quality

---

## Entry #34 — Trust pill claims

**Cluster:** F · **Item:** 4 of 6
**Status:** ➕ ADD (extend trust pill with CFP-grade trust signals)
**Ratified:** 2026-05-28

### v4 current position
Trust pill: *"All data stays on your device — no login, no backend, no telemetry."* (technically accurate; narrow scope)

### Action items
| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A34.1 | Extend trust pill on Splash + Dashboard: current technical claim + "Research-grounded methodology (60+ sources)" + "No financial-product affiliations or commissions" + "Planner voice, not promotional" | static | Splash + Dashboard footer | MVP-1 |
| A34.2 | Link from trust pill to glossary's research bibliography | n/a | UI link | MVP-1 |
| A34.3 | Dedicated /trust page deferred to MVP-2 | n/a | post-audit | MVP-2+ |

### Ratification log
| Point | Decision |
|---|---|
| 1 | **Option A** — Extended trust pill with research / no-affiliations / planner-voice claims. /trust page deferred. |

---

## Entry #35 — Will / nominee / POA tracking

**Cluster:** F · **Item:** 5 of 6
**Status:** ➕ ADD (estate planning surface — research's most-under-discussed failure mode)
**Ratified:** 2026-05-28 (bundled with #36)

### v4 current position
**Zero estate planning.** No will tracker, no nominee tracking, no POA, no digital asset inventory.

### Research position — Ch 05 §5.7
> "The most under-discussed FIRE failure mode. ... Mitigations checklist: registered will, update nominees on EVERY account, POA, digital asset inventory, joint accounts with 'either or survivor', HUF karta succession, term life insurance bypass."

### Verification (R2)
Grep `will|nominee|POA|estate` — most hits unrelated. **Confirmed:** zero estate planning surfaces.

### Action items
| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A35.1 | New top-level route `/estate-planning` with 7-step Ch 05 §5.7 checklist | empty | new route + page | MVP-1 |
| A35.2 | Checklist items: (a) Will registered? + date · (b) Nominees updated within 12 months? + per-account check · (c) POA executable? · (d) Digital inventory in password manager? · (e) Joint accounts with survivorship clause? · (f) HUF karta succession documented (if HUF exists)? · (g) Term life proceeds bypass via nominee? | per-item: boolean + optional date + notes | new schema field | MVP-1 |
| A35.3 | Each item links to a glossary entry explaining the why + the how (e.g., "Why a registered will matters", "How to update nominee on PPF") | static | `lib/glossary.ts` | MVP-1 |

### Cross-references
- **Statutory inputs touched:** Hindu Succession Act 2005, Indian Succession Act (R1.4 read-only summary in glossary)
- **Related entries:** #22 HUF (karta succession), #11 sandwich-gen (joint family loan tied to estate)
- **R2 invoked:** verified absence

---

## Entry #36 — Estate gap surfacing

**Cluster:** F · **Item:** 6 of 6 *(FINAL audit entry)*
**Status:** ➕ ADD (Dashboard chip + nudges drive completion)
**Ratified:** 2026-05-28 (bundled with #35)

### v4 current position
N/A (Entry #35 creates the infrastructure)

### Action items
| # | Action | Default | Where | MVP |
|---|---|---|---|---|
| A36.1 | Dashboard chip: "Estate: X of 7 complete" — links to /estate-planning | trigger | Dashboard | MVP-1 |
| A36.2 | Red-flag style when corpus > ₹1Cr AND estate completion < 4/7: "Your corpus exceeds ₹1Cr but estate planning is incomplete — Ch 05 §5.7 ranks this as the most under-discussed FIRE failure mode" | trigger | Dashboard | MVP-1 |
| A36.3 | Estate gap nudges integrated into family-nudge engine: e.g., when user adds significant insurance policy, nudge "Confirm nominee updated on this policy" | trigger | nudge engine | MVP-1 |
| A36.4 | Glossary entry "Estate planning under-discussion (Ch 05 §5.7)" — research-quoted with the corpus-stuck-in-probate failure mode | static | `lib/glossary.ts` | MVP-1 |
| A36.5 | Dedicated estate-planning tour step (extends v4 tour) | n/a | `lib/tour-steps.ts` | MVP-1 |

### Cross-references
- Major dependency: Entry #35 (infrastructure)
- Related: every Cluster D entry (per-instrument nominee tracking would be MVP-2 extension)
- **R2 invoked:** verified through #35

### Ratification log (bundled #35 + #36)
| Point | Decision |
|---|---|
| 1 (bundled) | **Option A** — Dedicated /estate-planning route with 7-step Ch 05 §5.7 checklist + Dashboard chip + red-flag for high-corpus low-completion + nudge engine integration |

---

## ✅ Cluster F — Complete (6/6 items audited)

**Summary verdict:**
- 4× ADD (#31 seed, #34 trust pill extend, #35 estate route, #36 estate surfacing)
- 1× CHANGE (#32 microcopy framing replacement)
- 1× Survives (#33 glossary — consolidation)
- All MVP-1 scope
- Estate planning gets first-class /estate-planning route — addresses research's "most under-discussed failure mode"
- Microcopy audit ensures CFP-grade voice across all surfaces
- Trust pill extended with research-grounded + no-affiliations + planner-voice claims

**Total MVP-1 action items from Cluster F:** ~25 across 6 entries.

---

# 🏆 AUDIT COMPLETE — 36/36 entries · 100%

## Final Tally

| Cluster | Entries | Verdicts | MVP-1 actions |
|---|---|---|---|
| A — Core FIRE math | 5 | 4× CHANGE, 1× ADD | ~40 |
| B — Modeling completeness | 6 | 6× ADD | ~50 |
| C — Tax surfaces | 4 | 1× CHANGE, 3× ADD | ~30 |
| D — Instrument coverage | 9 | 7× ADD, 2× CHANGE+ADD | ~50 |
| E — Variants, scenarios, behavioral | 6 | 5× ADD, 1× CHANGE | ~20 |
| F — Framing, UX, estate | 6 | 4× ADD, 1× CHANGE, 1× Survives | ~25 |
| **Total** | **36** | **0× Cut · 6× CHANGE · 22× ADD · 6× CHANGE+ADD · 2× Survives** | **~215** |

## Cross-cutting rules locked
- **R1** — Default + Override (every planning assumption editable on `/preferences`)
- **R1.4** — Statutory facts strictly read-only, never editable even in scenarios
- **R2** — Verify Before Propose (every entry reads v4 source first)

## Major new artifacts introduced
- `/preferences` page (full route) — canonical home for ~30+ assumption types
- `/investments/buckets` sub-route — Cluster B #8
- `/fire-goals/stress-test` sub-route — Cluster E #27
- `/estate-planning` top-level route — Cluster F #35
- New libs: `lib/glide-path.ts`, `lib/withdrawal-strategy.ts`, `lib/family-nudges.ts`, `lib/nps-withdrawal.ts`, `lib/epf-vpf.ts`, `lib/esop-tax.ts`, `lib/tax-deductions.ts`, `lib/coast-fire.ts`, `lib/expense-history.ts`, `lib/income-bucket-math.ts`
- Schema extensions: `kind`/`inflationBucket`/`bucket`/`coBorrowers`/`realEstateRole`/`internationalRoute`/`grantorCountry`/ESOP detail/`planToAge`/`glidePath`/`extendedFamilyContingencyPercent`/`healthcareCorpusReservationPercent`/`isAutomated`

## Next step
Open Task #7: extract action items into `docs/audit/demo-v5-action-items.md` sequenced by MVP-1 / MVP-2+ / backlog, surface `/preferences` page schema as separate spec doc.

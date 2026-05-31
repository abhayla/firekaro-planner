# `/preferences` Page — Schema Spec

**Source:** Cross-cutting Rule R1 from `docs/audit/demo-v4-vs-research-audit.md`
**Purpose:** The canonical home for every editable planning assumption + read-only statutory fact in FIREKaro v5. Every audit entry's action items reference this page; this spec is the single source of truth for what lives where.

---

## Architecture

- **Single route:** `/preferences` (full route, not a panel/drawer)
- **Sectioned layout** by domain (Core / Inflation / Returns / Variants / Family / Glide Path / Withdrawal / Tax / Statutory Reference / Estate)
- **Per-row affordances:** edit control + per-row "Reset" + research-citation tooltip
- **Per-section reset:** "Reset all in this section"
- **Global reset:** "Reset ALL assumptions to research defaults" (with confirm dialog)
- **R1.3:** Every consumer surface shows the *resolved* value read-only with `?` deep-link to the corresponding /preferences row

---

## Sections

### § Core FIRE Assumptions

| Field | Type | Default | R1 sub-rule | Validation | Source |
|---|---|---|---|---|---|
| Safe Withdrawal Rate (resolved) | derived (read-only) | 3.25% via horizon resolver | display only | — | Entry #1 A1.1 |
| Per-member Plan-to Age | number | 90 | R1.1 editable | ≥ retirement age + 5 | Entry #1 A1.2 |
| Per-member Target Retirement Age | number | 50 | R1.1 editable | 30-80 | Entry #5 |
| Per-member Horizon (derived display) | derived | planToAge − retirementAge | display only | sanity warnings | Entry #5 A5.1 |
| Conservative Longevity Tail toggle | boolean | Off | R1.1 | bumps plan-to age to 95 | Entry #1 A1.2 |

### § Inflation

| Field | Type | Default | R1 sub-rule | Source |
|---|---|---|---|---|
| General inflation | percent | 6% | R1.1 | Entry #3 A3.1 |
| Healthcare inflation | percent | 14% | R1.1 | Entry #3 A3.1 |
| Education inflation | percent | 9% | R1.1 | Entry #3 A3.1 |
| Housing inflation | percent | 6% | R1.1 | Entry #3 A3.1 |
| General weight | percent | 60% | R1.1 | Entry #3 A3.1 |
| Healthcare weight | percent | 20% | R1.1 | Entry #3 A3.1 |
| Education weight | percent | 10% | R1.1 | Entry #3 A3.1 |
| Housing weight | percent | 10% | R1.1 | Entry #3 A3.1 |
| Household blend (derived) | percent | 7.9% | display only | computed |
| Conservative-tail toggle (healthcare → 16%) | boolean | Off | R1.1 | Entry #3 A3.7 |

Weights MUST sum to 100% (validation).

### § Expected Returns (per investment type)

| Field | Type | Default | Notes | Source |
|---|---|---|---|---|
| Stocks (Equity direct) | percent nominal | 12% | shown with real `↳ 4.1%` | Entry #4 A4.1 |
| MutualFunds | percent nominal | 12% | shown with real | Entry #4 A4.1 |
| ESOP | percent nominal | 12% | shown with real | Entry #4 A4.1 |
| NPS Tier 1 | percent nominal | 10% | shown with real | Entry #4 A4.1 |
| Gold (default) | percent nominal | 7% | per-subtype refinement in section | Entry #4 A4.1 |
| Real Estate | percent nominal | 6% | warning if negative real | Entry #4 A4.1 |
| Crypto | percent nominal | 0% | with warning copy | Entry #4 A4.1 |
| FD | per-instance only | n/a | uses existing `interestRate` field | Entry #4 A4.5 |
| Allocation source toggle | enum | `auto-derive-from-holdings` | `target-allocation` alternative | Entry #4 A4.7 |
| Portfolio-weighted nominal (derived) | derived | computed | display | computed |
| Portfolio-weighted real (derived) | derived | nominal − household-inflation | display + negative-real highlight | Entry #4 A4.9 |

### § FIRE Variants

| Field | Type | Default | Notes | Source |
|---|---|---|---|---|
| Lean multiplier (on expenses) | decimal | 0.6 | R1.1 | Entry #2 A2.4 |
| Regular multiplier (on expenses) | decimal | 1.0 | R1.1 (typically fixed) | Entry #2 A2.4 |
| Fat multiplier (on expenses) | decimal | 1.5 | R1.1 | Entry #2 A2.4 |
| Barista multiplier (simple mode) | decimal | 20× | R1.1 | Entry #2 A2.2 |
| Barista mode toggle | enum | `simple` | `active-income` mode reveals income input | Entry #2 A2.2 |
| Barista annual active income (when in active-income mode) | number | — | R1.1 | Entry #2 A2.2 |
| Active target variant | enum | `Regular` | drives downstream recommendations | Entry #25 A25.3 |
| Coast FIRE real return | percent | computed from inflation+returns | R1.1 override allowed | Entry #2 A2.3 |

### § Family Layer

| Field | Type | Default | Source |
|---|---|---|---|
| Extended-family contingency % | percent | 7.5% | Entry #6 A6.3 |
| Healthcare corpus reservation % | percent | 20% | Entry #10 A10.1 |
| Show family-layer nudges | boolean | On | Entry #6 A6.6 |
| Re-enable dismissed nudges | button | — | Entry #6 A6.9 |

### § Glide Path

| Field | Type | Default | Source |
|---|---|---|---|
| Algorithm | enum | `pfau-kitces` | `static` or `custom` alternatives | Entry #7 A7.1 |
| Risk profile source | enum | `member` | `override` alternative | Entry #7 A7.1 |
| Risk profile override | enum | — | `Aggressive`/`Moderate`/`Conservative` | Entry #7 A7.1 |
| Per-year overrides | table | empty | R1.1 customizable per year | Entry #7 A7.1 |
| Glide curve chart | display | — | vue-chartjs Pfau curve | Entry #7 A7.5 |

### § Withdrawal Strategy

| Field | Type | Default | Source |
|---|---|---|---|
| Strategy | enum | `constant` | `floor-ceiling` / `income-bucket-pattu` alternatives | Entry #1 A1.7 + Entry #9 A9.1 |
| Floor (when in floor-ceiling) | percent | 2.5% | R1.1 | Entry #9 A9.2 |
| Ceiling (when in floor-ceiling) | percent | 4.0% | R1.1 | Entry #9 A9.2 |
| Floor trigger (corpus < %expected) | percent | 90% | R1.1 | Entry #9 A9.2 |
| Ceiling trigger (corpus > %expected) | percent | 110% | R1.1 | Entry #9 A9.2 |
| Income-bucket years-of-expenses | number | 15-25 (range) | R1.1 when bucket mode | Entry #1 A1.7 |

### § Tax

| Field | Type | Default | Notes | Source |
|---|---|---|---|---|
| Regime mode | enum | `AUTO` | `OLD` or `NEW` overrides | v4 existing + Entry #12 |
| Deduction overrides (per category) | table | auto-derived from data | R1.1 | Entry #12 A12.4 |
| Show marginal-relief chip | boolean | On | Entry #13 |
| Show sandwich-gen tax nudges | boolean | On | Entry #11 A11.2 |

### § Statutory Reference (R1.4 — read-only)

All fields display value + source + FY. No edit affordances.

| Item | Value | Source / FY |
|---|---|---|
| Tax slabs — Old regime | 0/5/20/30% | Sec 4 / FY 25-26 |
| Tax slabs — New regime | 0/5/10/15/20/25/30% | Finance Act 2025 / FY 25-26 |
| 80C limit | ₹1,50,000 | Sec 80C |
| 80CCD(1B) limit | ₹50,000 | Sec 80CCD(1B) |
| 80D self+family | ₹25,000 | Sec 80D |
| 80D parents (senior) | ₹50,000 | Sec 80D |
| Standard deduction (Old / New) | ₹50K / ₹75K | Finance Act 2025 |
| VPF tax-free threshold | ₹2,50,000 | Sec 10(11)(12) post-2021 |
| LTCG exemption (equity) | ₹1,25,000 | Sec 112A / Budget 2024 |
| LTCG rate (equity) | 12.5% | Sec 112A / Budget 2024 |
| STCG rate (equity) | 20% | Sec 111A / Budget 2024 |
| Sec 87A rebate ceiling (New) | ₹12,00,000 | Budget 2025 |
| Sec 24 home-loan interest cap | ₹2,00,000 | Sec 24(b) |
| PPF annual cap | ₹1,50,000 | PPF Act |
| EPF interest rate | 8.25% | EPFO notification FY 25-26 |
| PPF interest rate | 7.1% | Govt quarterly notification |
| NPS withdrawal split (corpus >₹12L) | 80% lump-sum (60% tax-free / 20% taxable / 20% annuity) | PFRDA 2025 circular |
| LRS cap | $250,000/FY | RBI Master Direction |
| LRS-TCS threshold | ₹10,00,000 / 5% rate | Budget 2025 |
| CII (FY 24-25) | 363 | CBDT notification |
| SGB tax-free at maturity | 8 years | RBI SGB scheme |
| ESOP perquisite section | Sec 17(2)(vi) | IT Act |
| Schedule FA disclosure threshold | foreign assets disclosure | IT Act |

### § Estate Planning

| Field | Type | Default | Source |
|---|---|---|---|
| Will registered | boolean + date + notes | unset | Entry #35 A35.2 |
| Nominees up-to-date (within 12 mo) | boolean + check | unset | Entry #35 A35.2 |
| POA executable | boolean + date + notes | unset | Entry #35 A35.2 |
| Joint accounts with survivorship | boolean + count | unset | Entry #35 A35.2 |
| Digital asset inventory | boolean + storage location | unset | Entry #35 A35.2 |
| HUF karta succession documented | boolean (visible only if HUF exists) | n/a | Entry #35 A35.2 |
| Term-life proceeds bypass via nominee | boolean | unset | Entry #35 A35.2 |
| Completion: X of 7 | derived | display + chip | Entry #36 A36.1 |

---

## Global controls

| Control | Action |
|---|---|
| Global "Reset all assumptions to research defaults" | R1.5 — confirm dialog before applying |
| Per-section "Reset section" | R1.5 |
| Per-row "Reset" | R1.5 |
| "Show source" tooltips | Research-chapter citations on every value |

---

## Notes for implementation

- The page is **section-scrollable** with a fixed sidebar nav for quick jumps
- Each section header has anchor links matching the deep-link pattern (`/preferences#core`, `/preferences#inflation`, etc.) so consumer surfaces' "?" affordances land precisely
- **R1.4 visual distinction**: read-only Statutory Reference rows use a distinct theme (muted background, no edit affordance, "official source" badge) so users immediately understand they're not editable
- **Statutory Reference is grouped LAST** to communicate that planning assumptions (editable) are the primary product surface; statutory facts are reference material
- Sanity validations (e.g., inflation weights summing to 100%, plan-to age > retirement age) surface inline; can't save invalid values

---

## Out of scope for this spec (covered by audit entries)

- The /preferences page is *just* the surface. The math behind it lives in lib modules per Phase 2 of `demo-v5-action-items.md`
- Statutory Reference values are facts; their accuracy is maintained by the dev team, not editable by users (R1.4)
- This spec doesn't cover the consumer surfaces that *read* /preferences (Dashboard, /tax-planning, etc.) — they're covered per-entry in the audit doc

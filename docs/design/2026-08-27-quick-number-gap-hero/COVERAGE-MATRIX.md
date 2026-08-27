# Coverage matrix — Dezerv video (FbYnFUwdODQ) → FireKaro "Quick Number" front door

Purpose: the single checklist the mockup, the implementation spec, the worker and the checker are all
measured against. A row is DONE only when the mockup column AND the plan column are both ✓.
Legend: ✓ covered · ◐ partial · ✗ missing · — deliberately out of scope (reason given).

Source of truth for the left column: `D:\Abhay\Ventures\transcripts\FbYnFUwdODQ.md` (transcript) and
`FbYnFUwdODQ-firekaro-crosscheck.md` (feature cross-check). FireKaro column verified against `main` 2026-08-27. **Pinned with the spec: this matrix, `option-c-merged.html` and `docs/goals/2026-08-27-quick-number-front-door.md` are versioned together — the dispatch pin is the commit that carries this sentence.**

## A. Inputs the advisor collected (video Part 1)

| # | Video item | FireKaro today | Mockup C (before this pass) | Mockup C (now) | Plan item |
|---|---|---|---|---|---|
| A1 | Current age | Members | ✓ | ✓ | QN-1 |
| A2 | Target retirement age (advisor picks 50) | `targetRetirementAge` default 50 | ✓ | ✓ | QN-1 |
| A3 | Monthly spend, all-in incl. EMI + school fees, rounded (2.5–3 → 2.8) | avgMonthly + recurring | ✓ | ✓ | QN-1 |
| A4 | Own house? EMI inside spend? Home-loan rate (7.2%) | Liabilities → auto-EMI | **✗** (no loan question; "no-prepay" lever used a placeholder ₹50K) | ✓ Q10 home loan: EMI + rate + years left | QN-1, QN-5 |
| A5 | Financial savings (MF), then PF/NPS added, rounded to 80 L | 12 asset types | ◐ ("MF + EPF + NPS + PPF + FDs" read as exclusive — Abhay left stocks out) | ✓ "ALL investments" incl. stocks/ETF/gold/crypto/bonds **and investment property/plots** | QN-1 |
| A6 | Monthly SIP incl. PF contributions | salary→EPF auto-flow | ◐ (stocks not named) | ✓ | QN-1 |
| A7 | Kids: count, ages | DEPENDENT members | ✓ | ✓ | QN-1 |
| A8 | Education (today ₹; advisor bumps 60→75 L for abroad) | plannedFuture `education` | ✓ | ✓ | QN-1 |
| A9 | Post-grad | plannedFuture `education` | ✓ | ✓ | QN-1 |
| A10 | Wedding (today ₹, ~25 yrs out, "at the age of 30") | plannedFuture `marriage` | ✓ amount · ✗ timing | ✓ amount · timing derived from kids' age (wedding at 30, per transcript) | QN-1 |
| A11 | House upgrade, net ₹1 Cr, 5–8 yrs | plannedFuture `general` — **NOT in FIRE number** (#165) | ✓ + delta hint | ✓ | QN-3 (Tier-0 fix) |
| A12 | Lifestyle inflation 8% (advisor-set) | 4-bucket inflation | ✓ (assumptions) | ✓ | QN-4 |
| A13 | Investment real estate (plot ₹1.2 Cr, 8% IRR outlook) | realEstate asset type | **✗** (copy said "leave out the house" — implied all property) | ✓ counted in A5 copy; outlook — (needs market data) | QN-1 |
| A14 | Spouse's investments (₹70 L) — the "missed then added" moment | Members | ✓ | ✓ | QN-1 |
| A15 | Household income sanity check (spend + SIP ≈ income?) | Income section | **✗** | ✓ income asked with spend; "₹4.55 L of your ₹5 L — sound right?" line | QN-1 |
| A17 | "I withdrew from my MFs every 2–3 years… missed the cumulative impact" — broken-compounding aside | — | **✗** | ✓ 6th "why so big" bullet | QN-4 |
| A16 | User's own guess ("8–10 Cr") vs the math ("32 Cr") — the hook | — | **✗** | ✓ Q1 gut-feel chips; hero shows "you guessed ₹10 Cr · the math says ₹13.3 Cr" | QN-1, QN-2 |

## B. Assumptions the tool used (Part 2)

| # | Video item | FireKaro today | Mockup before | Mockup now | Plan |
|---|---|---|---|---|---|
| B1 | Inflation 8% compounded to retirement | 6% general / 14% health / 9% edu | ✓ 6% shown | ✓ | QN-4 |
| B2 | Live to 90 → 40-yr drawdown | `planToAge` | ✓ | ✓ | QN-4 |
| B3 | Return 14% ("a little aggressive") | 12% | ✓ 12% + "not sales defaults" | ✓ | QN-4 |
| B4 | Step-up 10%/yr baked in | step-up assumption default 0 | ✓ as an opt-in lever | ✓ | QN-5 ✅ shipped 2026-08-27 (in-session, `LeverPicker.vue`) |
| B5 | Survey story: people under-estimate 4–6× (1986/2006), lifestyle creep, taxes, healthcare, longevity | #119 education hub (open) | **✗** | ✓ "Why is the number so big?" explainer card (5 lines) | QN-4 |
| B6 | Don't prepay a 7.2% loan; invest instead | — | ◐ placeholder | ✓ lever uses the real EMI/rate from Q10 | QN-5 ✅ shipped 2026-08-27 (in-session, `LeverPicker.vue`) |

## C. Outputs shown (Part 3)

| # | Video item | Mockup before | Mockup now | Plan |
|---|---|---|---|---|
| C1 | Need (₹32 Cr → ₹38 Cr) | ✓ today-₹ + nominal once | ✓ | QN-2 |
| C2 | Existing grows to X (₹6 Cr → ₹20 Cr) | ✓ "You'll have" | ✓ | QN-2 |
| C3 | Gap | ✓ | ✓ | QN-2 |
| C4 | Required SIP at target (₹3.8 L, rejected) | ✓ "Do this" | ✓ | QN-2 |
| C5 | Change age 50→53, required SIP → ₹2.1 L live | ✓ slider + hint | ✓ | QN-2 |
| C6 | Closing: "₹35 Cr in 15 years" with 2 L + 10% step-up + direct | ✓ levers card (added after Abhay's correction) | ✓ | QN-5 ✅ shipped 2026-08-27 (in-session, `LeverPicker.vue`) |
| C7 | "It's mathematics — what can go wrong is your discipline" honesty framing | ◐ | ✓ line under the plan summary | QN-5 ✅ shipped 2026-08-27 (in-session, `LeverPicker.vue`) |

## D. Portfolio review — ASAR (Part 4)

| # | Video item | FireKaro today | Mockup now | Plan |
|---|---|---|---|---|
| D1 | XIRR vs benchmark (13.3 vs 13.4) | #146 open | listed in "What the full planner adds" | — (#146, separate) |
| D2 | Access: direct vs regular TER (+80 bps) | none | ✓ lever (+0.8%) gated by the Direct/Regular/Not-sure chip on the investments card | QN-5 ✅ shipped 2026-08-27 (in-session, `LeverPicker.vue`) (household-level toggle) ; per-holding flag → #NEW |
| D3 | Selection: 72/18/9 vs 60/25–27/13–15 | none | listed | — (#141) |
| D4 | Allocation: 65% funds underperform; 20 funds = index; keep 5–10 | none | listed ("we'll count your funds") | #NEW fund-count warning (good-to-have) |
| D5 | Gold ~7% = ideal uncorrelated asset | goldReturn 7% | listed | — |
| D6 | Rebalance 60/15/10/5 on ±5-pt drift; LTCG 12.5%, ₹1.25 L exempt | #141 open | listed | — (#141) |

## E. UX lessons (Part 5)

| # | Lesson | Mockup now | Plan |
|---|---|---|---|
| E1 | ~10 conversational questions, aggressive rounding | ✓ 10 cards, lakh inputs, live ₹ preview | QN-1 |
| E2 | Goals in today's ₹, tool inflates | ✓ | QN-3 |
| E3 | One headline + one gap + one action | ✓ (fixed after review 1) | QN-2 |
| E4 | Live what-if on retirement age | ✓ | QN-2 |
| E5 | Opinionated defaults explained with a story | ✓ B5 explainer | QN-4 |
| E6 | Shock then reassure | ✓ hero → levers | QN-5 ✅ shipped 2026-08-27 (in-session, `LeverPicker.vue`) |
| E7 | Three concrete fixes | ✓ levers + full-planner list | QN-5 ✅ shipped 2026-08-27 (in-session, `LeverPicker.vue`) |

## F. Cross-check recommendation items (FbYnFUwdODQ-firekaro-crosscheck.md)

| # | Item | Mockup | Plan |
|---|---|---|---|
| F1 | Tier-0: `general` planned goals must enter the FIRE number | ✓ demonstrated | QN-3 |
| F2 | Quick Number express path | ✓ | QN-1 |
| F3 | Solve-for-required-monthly + gap hero + slider | ✓ | QN-2 |
| F4 | Explain defaults | ✓ | QN-4 |
| F5 | Simplify `InvestmentForm` (55 fields → fast add) | — (full planner, not the front door) | QN-6 |
| F6 | TER lever / fund-count / benchmark / drift | ◐ D2 in; rest listed | QN-5 ✅ shipped 2026-08-27 (in-session, `LeverPicker.vue`) + issues |

## Process lesson (2026-08-27)
The first mockup pass was built from memory of the capture, not against this matrix — the whole "how to
get there" half (C6/C7, B4/B6, D2) and five inputs (A4/A13/A15/A16, A10 timing) were missing until Abhay
asked. Mechanism: this matrix exists BEFORE the first screen; the blind reviewer's first check is
"every row with a ✓ in the plan column is visibly present in the artifact". Registered in
`GetWorkDone\MECHANISM-DUE.md` (class `artifact-built-without-coverage-matrix`).

# ADR-0003: Tax-modelling scope for a FIRE *planner* (not a tax-return tracker)

- Status: Accepted
- Date: 2026-06-02
- Deciders: Abhay (delegated the scope calls), Claude (Systems Architect role)
- Supersedes/relates: gh-issues #6, #7, #8 (the FinTech-domain-analyst correctness sweep, 2026-06-02)

## Context

A proactive independent FinTech-domain audit of the calculation layer (`src/lib/*.ts`) confirmed
**no critical wrong-rupee bug** in the configured tax + retirement + ESOP-rate math, but surfaced
three coverage/scope questions. Resolving them requires a decision about *what kind of product this
is*.

FireKaro is a **research-grounded FIRE (Financial Independence, Retire Early) *planning* SaaS** —
per `CLAUDE.md`, "**planning & tracking only — not financial advice, no bank connections, no
transaction execution**." It projects a household's path to financial independence (corpus, FIRE
number, years-to-FIRE, withdrawal sustainability). Crucially, **the old tax/transaction tracker is
being retired in favour of this planner** — so per-transaction tax accounting is explicitly the
*retired* app's job, not this one's.

The scope test applied below: *does this serve forward FIRE planning, or is it tax-return /
transaction-level tracking that belongs to the retired app?*

## Decision

### 1. Realized capital-gains-on-sale taxation — OUT of scope (gh-issue #8)

Per-transaction realized capital-gains tax (lot-by-lot cost basis, holding periods, acquisition
dates, the annual ₹1.25L s.112A exemption aggregated across lots, equity-vs-debt-MF discrimination)
is **transaction-level accounting** — the retired tracker's domain. FIRE-planning convention models
post-tax outcomes through a **conservative Safe Withdrawal Rate**; India's 3.5% SWR (vs the US 4%
rule) already builds in that headroom. Building a CG engine would drag the planner back toward the
tracker it replaces, and the schema deliberately lacks the lot/acquisition-date fields such an engine
needs.

- The `taxBucket` "phantom CG engine" comment is corrected (commit f1c0d99).
- The SWR's tax-absorbing role is now documented in `fire-math.ts` (`INDIA_SWR`).
- The existing `esop-tax.ts` two-layer functions stay as-is — correct and harmless. ESOP
  *perquisite-as-income* (taxable salary at vest) is planning-relevant and MAY later be wired into
  the income/tax-planning surface; ESOP *capital-gain-on-sale* stays out.

### 2. Accurate historical-FY tax — OUT of scope; the *silent* wrong-number — FIXED (gh-issue #6)

A planner needs current + projected tax (to optimise regime/deductions and project take-home), not
recomputed multi-year-old returns. So FY 2022-23 / 2023-24 configs are **not** added. However,
silently serving the *newest* slabs for an *old* year is a real defect. `getTaxConfigForFY` now
falls back to the **nearest configured FY** (oldest config for past years, newest for future) plus a
dev warning, instead of always the newest (commit on this ADR).

- Still in scope as real tax-planning-accuracy enhancements (kept open on #6): the **80D parents
  bucket** (currently returns ₹0 → over-taxes users paying parents' health premium — needs an
  insurance relationship field) and the **old-regime senior basic-exemption variant**.

### 3. EPF employer/EPS split + PPF ₹1.5L cap — DEFER (gh-issue #7)

Pure YAGNI: the accumulation engine (`investment-traits.ts` `accumulationRule`) is a Phase-2 stub
and EPF/PPF corpus is currently user-entered, so nothing computes wrong today. The EPS ₹1,250/mo
ceiling (8.33% of the ₹15k wage cap) and PPF ₹1.5L/yr cap are **tracked requirements that gate the
Stage-C accumulation engine** — to be honored when that engine is built, not before.

## Consequences

- **Positive:** scope stays true to "planner, not tracker"; the FIRE number remains a post-tax,
  conservatively-derived target; no speculative engines are built before their consumers exist; the
  one genuine defect (silent historical-FY substitution) is fixed and regression-locked.
- **Negative / accepted:** the FIRE number is not a per-transaction-tax-accurate figure (acceptable
  and standard for FIRE tools — documented at `INDIA_SWR`); historical-year tax views are
  approximate; ESOP CG functions remain dead code (kept for a possible future perquisite-income wire).
- **Revisit if:** the product later targets a segment that needs explicit realized-CG tax
  (e.g. heavy-ESOP earners planning a sale) or historical tax-return accuracy — at which point the
  retired tracker's scope would be partially re-absorbed, which is a portfolio-level decision
  (`TODO(5W)`), not a repo-level one.

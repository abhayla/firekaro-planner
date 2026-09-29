# Goal: Per-member accessible-money bridge gate (+ the reservation-leg inflation fix)

**Status:** SPEC ONLY — nothing below is started.
**Tracking issue:** gh #162 **part 2** (labels `must-have`, `enhancement`). Part 1 (the healthcare reservation in the member target) shipped 2026-09-29 (`6259454`, PR #199).
**Tier:** must-have — Tier-0 honesty for the LOCKED persona (an optimistic member number makes the user under-save; `goal-anchored-decisions.md` rule 30, D-2026-09-29-03/04).
**Read first:** `src/lib/individual-fire.ts`, `src/lib/bridge.ts`, `src/lib/accessibility.ts`, `src/lib/derive.ts` (the `computeBridge()` block ~l.1206–1315 and the reservation schedule ~l.1131), `docs/goals/2026-06-03-accessible-money-bridge.md`, `docs/adr/0006-*`.

**Core:** `computeBridgeCoverage` invoked per member on a per-member accessibility split, composed as `max(memberAdequacyAge, memberBridgeAge)`.
**Proof:** one real run of the member path on the **Sharmas** seed printing Rohit's pre-gate vs gated age, and the household's, read back and recorded.

---

## 1. Why (the defect, stated as a class)

**RCA (one sentence):** `computeIndividualFire` solves a member's FIRE age from corpus **adequacy alone** — it never asks whether the money attributed to that member is *spendable* in the early retirement years — while the household path pushes its headline later via `max(adequacy, bridge.effectiveFireAge)`, so the member number is optimistic by exactly the liquidity gate it skips.

**Class (as a data filter, rows before AND after the fix):** every adult member of every household where (a) that member's attributed corpus contains any holding whose `accessibilityClass` is `ppf`, `nps`, or `realEstate` (investment property), AND (b) the member's own solved FIRE age is below that holding's unlock age (PPF maturity, or 60 for an undated PPF / an NPS early exit). Concretely: any member retiring before 60 holding PPF or NPS. **Members NOT in the class** (must stay byte-identical): a member whose attributed holdings are all `liquid` + `epf` (EPF unlocks at the FIRE age), and any member solving to ≥ 60 with no PPF maturity beyond it.

**Why it is worse than the household case, not equal to it.** Lock is *concentrated by owner*. The household pools every liquid rupee against every locked one; a member pools only their own. In the Sharmas, PPF **and** NPS are both Rohit's — so the locked share of *his* attributed corpus is ~1.3× the household's, against a liquid pool ~25% smaller. A gate that is slack at household level can bind on one member. This is the mechanism, and it is why "the household gate already covers it" is false.

**Second defect in the same file (the reservation-leg inflation asymmetry).** `derive.ts` grows the healthcare reservation leg at `assumptions.healthcareInflation` (14% live) on its own schedule (`healthcareReservationNominalAt`), while `individual-fire.ts` grows the member's **whole** target — reservation included — at `resolveHouseholdBasket(assumptions)`. Where `healthcareInflation > basket` (the normal case), the member's reservation share rises slower than the household's, so the member target understates the household-grade reservation, and understates it **more the further out the member's FIRE date is**. Small, monotone, optimistic. Its own docblock discloses it as a residual bound; this spec closes it.

## 2. Worked example — the Sharmas (which numbers are read, which are estimated)

**Read from the seed** (`src/lib/seed-persona.ts`, exact): Rohit age 30, target 47, CTC ₹25L; Priya 29, target 50, CTC ₹18L; `householdSplitPercent` default 50. Rohit-owned: EPF ₹15L, Stocks ₹18L, MutualFunds ₹25L, **PPF ₹6L (no `openingYear` set)**, **NPS ₹4L**, ESOP ₹15L (60% vested of ₹25L) = **₹83L**. Joint: gold ₹4L, FD ₹2L, primary residence ₹95L (excluded from the FIRE corpus). Priya-owned: EPF ₹9L, MutualFunds ₹12L = **₹21L**. Expenses: `avgMonthly` ₹45k + rent ₹35k/mo + society ₹12k/qtr + property tax ₹18k/yr + parents support ₹40k/mo — **all five carry no `ownerId`**, so every one of them is ring-2 shared today.

**Derived by hand from those reads (arithmetic on read values — not yet a code run):**

| Quantity | Rohit | Priya | Household |
|---|---|---|---|
| Attributable FIRE corpus (primary residence out) | ₹83L + 50%×₹6L = **₹86L** | ₹21L + ₹3L = **₹24L** | ₹1.10 Cr |
| Locked past an age-47 / age-50 exit (PPF ₹6L + NPS ₹4L) | **₹10L = 11.6%** | ₹0 = 0% | ₹10L = 9.1% |
| Liquid pool that must bridge it | ₹76L | ₹24L | ₹1.00 Cr |
| Shared ring-2 monthly (45 + 35 + 4 + 1.5 + 40) | ₹125.5k | — | ₹125.5k |
| Attributable annual expenses (ring 1 = ₹0, + 50% × ring 2) | **≈ ₹7.53 L** | ≈ ₹7.53 L | ₹15.06 L |

**STEP 1 CORE PROOF — RUN 2026-09-29, real numbers replacing the estimates above.** A throwaway
per-member bridge prototype (§4.1–4.3 attribution, member DOB, member expenses with the
`annualExpensesAt` resolver, member marginal rate, member EPS/gratuity, member `corpusScale`) was
run across all five seeds × every adult. **Result: the gate is COVERED for every adult on every
seed — Δ = 0 years everywhere.**

| Seed | Adult | Pre-gate age | Gated age | Δ | lockedCorpus | reachableCorpus | shortfallYears | Window | corpusScale |
|---|---|---|---|---|---|---|---|---|---|
| sharmas | rohit | 47 | 47 | **0** | ₹35L | ₹428L | 0 | 47→60 (PPF) | 5.854 |
| sharmas | priya | 46 | 46 | **0** | ₹0 | ₹286L | 0 | none | 12.231 |
| mehtas | vikram | 45 | 45 | **0** | ₹176L | ₹286L | 0 | 45→60 (PPF) | 0.866 |
| mehtas | aanya | 59 | 59 | **0** | ₹372L | ₹116L | 0 | 59→60 (PPF) | 1.859 |
| iyers | ashwin | 47 | 47 | **0** | ₹0 | ₹382L | 0 | none | 2.776 |
| iyers | lakshmi | 77 | 77 | **0** | ₹0 | ₹254L | 0 | none | 10.621 |
| mauryas | abhay | 55 | 55 | **0** | ₹145L | ₹442L | 0 | 55→60 (PPF) | 2.645 |
| mauryas | madhu | ∞ (unreachable) | ∞ | n/a | — | — | — | — | — |
| ravi | ravi | 40 | 40 | **0** | ₹0 | ₹1L | 0 | none | 1.000 |

Household bridge on the same run, for contrast: **covered on all five seeds too** (sharmas eff=50
corpusOnly=50; mehtas 50/50; iyers 55/55; mauryas 65/65; ravi 63/63).

**Why the estimate was wrong (the mechanism, measured).** §2's estimate assumed the member's ₹76L
liquid pool faced ~₹7.5L/yr for 13 years. Two reads were wrong:

1. **Attributable expenses are ₹13.12L/yr, not ₹7.53L** — the seed's `avgMonthly` ₹45k is the
   shared lump AND the five recurring lines add on top; the printed figure is the real one.
2. **`corpusScale` dominates everything.** A member 17 years from FIRE must grow their corpus
   5.85× to hit the drifted target, and the bridge scales *every* holding by that one multiplier.
   So Rohit's PPF ₹6L scales to ₹35L locked while his liquid slice scales to ₹428L — against a
   13-year window costing ≈ ₹175L. The locked *share* is unchanged by scaling, but the absolute
   liquid pool is ~2.4× the whole bridge bill. The gate can only bind when the locked share is
   high **and** `corpusScale` ≈ 1 (an already-FIRE member), which no current seed is.

**Confirmed the bridge itself is not broken.** A minimal direct fixture (PPF ₹200L + liquid ₹50L,
retire 48, ₹13.5L/yr, scale 1) returns `covered: false`, `effectiveFireAge: 57`,
`shortfallYears: 9`, `shortfallAmount: ₹1.16 Cr` — so `computeBridgeCoverage` does bind when the
liquidity really is short. The zero deltas above are a property of the seeds, not a dead gate.

**Consequences for the rest of this spec, which the owner must rule on before step 2:**

- **§7's acceptance criterion "Rohit's member age ≥ his pre-change age, delta matching step 1's
  printed gate" is satisfied trivially at Δ0.** There is no seed on which this change moves a
  single rendered number. The gate would ship as pure insurance.
- **T4 (the strongest instrument) cannot be written as specified.** The spec names the Mauryas as
  "single-earner ⇒ member gate === household gate", but the Mauryas have **two adults**
  (single-*income*, not single-*adult*): Madhu owns ₹83L and the Joint holdings split 50/50, so the
  member path is correctly a strict subset of the household and the two ages differ (abhay 55 vs
  household 65). **Ravi** is the only true single-adult household — and Ravi holds **zero locked
  money**, so both bridges are trivially covered and T4 would assert `47 === 47` on two no-ops.
  There is no seed that makes T4 a real coherence test. A new fixture would have to be authored.
- **A separate, larger optimism surfaced and is NOT this spec's scope:** Aanya's ₹372L
  `lockedCorpus` is dominated by an **illiquid investment property**, which `classifyRealEstate`
  marks illiquid so it never enters the unlock timeline — yet the adequacy solve counts its full
  value in `attributableCorpus`. Money that is counted toward the target but can never be spent is
  an optimism the bridge structurally cannot catch (no tranche ⇒ no window ⇒ trivially covered).
  This applies to the **household** path identically. Worth its own finding row.

**STEP 1 RE-RUN 2026-09-29 (late night), on the post-#213/#214 bridge.** Same per-member construction,
re-run after the per-tranche projection (#213) and the property sale event (#214) landed. First print
showed **Rohit 48→55 (Δ7)**; an independent FinTech review (Opus, read-only) traced it to the
prototype's expense repricer — it fed the bridge the member's **nominal two-leg** target curve
(base at basket 6.24% + reservation at healthcare 9%, never deflated by CPI) instead of the §4.2
real-frame base-leg ratio `((1+basket)/(1+CPI))^t`. At t=18 the ratio was 3.26 instead of 1.04, so
the 13-year bill was ≈₹820L instead of ≈₹178L. With the §4.2 formula restored the re-run gives
**Δ = 0 for every adult on every seed again** (Rohit pre=48 gated=48, locked ₹36.7L, reachable
₹471L, covered; Priya 47; Vikram 45; Aanya 63; Ashwin 47; Lakshmi 84; Abhay 56; Ravi 41; Madhu
unreachable). Households all covered. The §2 finding stands: the gate moves no current seed. Two
notes for whoever builds §4.1–4.3 later: (1) T2 must assert the expense repricer's FRAME
(`annualExpensesAt(t)/annualExpenses ≤ ((1+basket)/(1+CPI))^t + ε`) — that assertion would have gone
red on the prototype instantly; (2) a Joint holding's `contributionSchedule` must be weighted by the
split like its value, or the member gets 100% of Joint contributions against 50% of Joint value.

The §4.4 reservation-leg inflation fix is unaffected by all of the above: it is a real, measurable
target-trajectory change (healthcareInflation 9% vs basket 6.24% on a 20% reservation share) and
moves member ages later on its own arithmetic, independent of the gate.

## 3. Product rules

1. **A member's FIRE age can never be EARLIER than what that member's own accessible money supports.** The member age is `max(memberAdequacyAge, memberBridgeAge)` — the same shape as the household headline. Never a blend, never an average.
2. **The gate only ever moves the number later.** `covered === true` ⇒ output byte-identical to today; no rounding artefact from the bridge's integer age math may leak into a covered member.
3. **Household stays primary.** The member view remains the clearly-caveated secondary; a member gate never feeds back into `derive()`'s household number.
4. **The member caveat copy retires when the gate lands.** The member hero caveat (shipped `3bbf809`) names two omissions — "skips the healthcare reserve and locked-money bridge check". Part 1 removed the first; this removes the second, so both clauses drop and only the ring-3 / shared-split exclusion remains. **Copy and kernel ship in the same PR** — the lesson of `9ec6c11` (#207): a meaning-changing kernel fix ships with its copy.
5. **Transparency notes are per member.** Each member's `AssumptionNote[]` carries that member's own notes (their undated PPF, their NPS early exit) — never the household's list re-rendered under a member's name.
6. **A member with no locked money sees no bridge language at all** — no "covered" badge, no empty timeline. The absence of a gate is not a feature to advertise.

## 4. Design

### 4.1 Splitting each holding's accessibility schedule per member

The bridge consumes `BridgeHolding[]` (`{ asset, ownerDob }`). Split **by value on the same weights the corpus path already uses**, so the money inside the gate is exactly the money inside the target — one attribution, not two:

- `ownerId === memberId` → **100%** of `asset.value`.
- `ownerId === "Joint"` → **`split` × value** — the identical `corpusWeightOf` weight (`assumptions.householdSplitPercent`).
- any other owner → **0%**, excluded exactly as the corpus path excludes it.
- EPF / NPS / PPF are statutorily single-holder and arrive owner-tagged, so the ownership rule already routes each to its earner. **Do not add a type-based override** — it would diverge from `corpusWeightOf` and re-introduce a second attribution.
- `ownerDob` = **that member's own DOB**, always. The household path anchors "Joint" to `earners[0]` because it is household-scoped; the member path has an unambiguous owner, which is the entire point of the change.
- Primary residence is already filtered out by `fireInvestments`. An investment property flows through and `classifyRealEstate` marks it `illiquid` — counted in `lockedCorpus`, never in the runway.

**Scaling a fractional holding.** A Joint holding enters as a fraction of its value, and `computeBridgeCoverage` then applies `corpusScale` on top. So pass `{ ...asset, value: split * asset.value }`. Two traps that must be honoured: the **ESOP** branch of `accessibleAtAge` reads `vestedValueINR ?? value`, so a split ESOP must scale `vestedValueINR` by the same weight or the split silently does not apply; and the **₹1.25L equity LTCG exemption** threaded inside `classifyAt` is a **per-person** allowance — correct for a member run, over-generous nowhere.

### 4.2 Invoking `computeBridgeCoverage` per member

Inside `computeIndividualFire`, after the existing adequacy solve and only when `reachable` is true (an unreachable target has no age to gate):

- `retirementAge` = `Math.round(anchorAge + rawYearsToFire)` — the member's own adequacy age, as `derive.ts` does with `adequacyAge`.
- `annualExpenses` = the member's **`attributableAnnualExpenses`** (ring 1 + split × ring 2; ring 3 excluded — exactly how the target was built). **Gross, never net:** the NPS annuity is credited once, inside `computeBridgeCoverage`, via the holding's own income stream. A net figure double-subtracts it and is the optimistic direction.
- `annualExpensesAt` = those expenses re-priced along the member's own target growth, mirroring `derive.ts`'s base-leg resolver: `t => attributableAnnualExpenses × ((1 + householdBasket) / (1 + inflation))^t`. **Required, not optional** — omitting it reproduces the pre-Phase-1d mixed frame that `bridge.ts`'s header forbids (a rising target making the bridge look better covered).
- `income` = the member's **attributable** streams only: post-tax rental from their own + split Joint rental lines (`bridgeRentalPostTaxAnnual` on the member's slice at the **member's** marginal rate), and **their own** EPS pension; `epsStartAge` unchanged.
- `exitLumpNet` = **their own** gratuity, not the household sum.
- `marginalRate` = the member's own `marginalRate` (already computed in this file for the EPF bucket) — a member's liquidation tax is their own.
- `corpusScale` = `memberDriftedTargetReal / attributableCorpus`, the numerator being the member's target drifted to the adequacy age by its own growth and deflated at CPI — the same construction as the household's, on member quantities. Guard `attributableCorpus <= 0` → `1`.
- `anchorAge`, `planToAge` = the member's own.

### 4.3 Where the gate composes

```
memberBridge = reachable ? computeBridgeCoverage({ ...member inputs }) : null
memberFireAge = memberBridge && !memberBridge.covered
  ? Math.max(adequacyAge, memberBridge.effectiveFireAge)
  : adequacyAge          // byte-identical when covered
```

This mirrors `derive.ts` l.1215–1218 exactly, including the "only a genuine shortfall moves it" guard. `yearsToIndividualFire` is recomputed **from the gated age** so age and years never disagree (the `feedback_cross_screen_figure_coherence` class). `IndividualFireResult` gains `bridgeCoverage: BridgeCoverage | null`, and `individualFireAge` becomes the **gated** age — so all three existing consumers (`IndividualFireCard`, `memberFinancials.fireProgressPercent`, the member hero `heroHeadline`) are healed by the one root fix, with no consumer edit beyond the caveat copy.

**Reachability interaction:** re-apply the `anchorAge + years <= planToAge` clamp to the **gated** age. A member whose gate pushes them past their own plan horizon is "not within horizon", never a rendered age 91.

### 4.4 The reservation-leg inflation fix

Split the member target into the same two legs the household already uses and grow each at its own rate:

```
memberTargetNominalAt(t) = base_today · (1 + basket)^t
                         + reservation_today · (1 + healthcareInflation)^t
```

with `base_today = individualBaseFireNumber` and `reservation_today = base_today × healthcareReservationPercent` — the two components `calculateFireTarget` already sums at t = 0, kept as components instead of collapsed. At `t = 0` the target is **byte-identical** to today's, so only the trajectory moves; the member's age moves **later** wherever `healthcareInflation > basket`. Planned goals stay out (ring 3, `familyLayerCorpus: 0`). This replaces the single `individualFireNumber × (1 + householdBasket)^yearIndex` schedule handed to `calculateYearsToTarget`.

**Order matters:** 4.4 lands **before** 4.3, because it moves the adequacy age the gate is tested at.

## 5. Test instruments — written and red BEFORE the change

| # | Instrument | File | What it locks |
|---|---|---|---|
| T1 | **Diagnostic print (throwaway)** — every seed × every adult: pre-gate age, gated age, `lockedCorpus`, `shortfallYears`, `shortfallAmount`, bridge window | scratch script, not committed | The §2 real numbers. Run FIRST; amend §2 from its output. |
| T2 | **Per-seed member bounds** — one row per (seed, adult): gated age inside a named band, `lockedCorpus ≥ 0`, `shortfallYears` an integer ≥ 0, no `NaN`/`Infinity` reaching any field | `src/lib/individual-fire.spec.ts` | The fixed-fixture substance lock. Bands **derived from T2's own red run**, never invented (D-2026-09-29-03: a lock is never widened to admit a number). |
| T3 | **Property — `memberGatedAge ≥ memberNoGateAge`** — fast-check over perturbations of the real seeds (values, split %, target ages, PPF `openingYear` present/absent) | `src/lib/kernel-invariants.property.spec.ts` | The gate is monotone-later, never earlier — §3 rule 1 made machine-checked. |
| T4 | **Coherence — single-earner household ⇒ member gate === household gate.** Mauryas (single-income, full-spread portfolio): where the sole adult owns the whole attributed corpus and expenses, the member `effectiveFireAge` must **equal** the household `bridge.effectiveFireAge` | `src/lib/individual-fire.spec.ts` | The member path is the household path restricted to one person, not a second methodology. **The strongest instrument here** — it would have caught the original omission. |
| T5 | **Catch-test for 4.4** — the two-leg member schedule equals the single-rate one at `t = 0` and exceeds it at `t > 0` by exactly the reservation leg's rate gap | `src/lib/individual-fire.spec.ts` | Byte-identical now, correctly steeper later. |
| T6 | **Covered ⇒ unchanged** — a member holding only liquid + EPF reproduces the pre-change age exactly | `src/lib/individual-fire.spec.ts` | §3 rule 2: no collateral movement outside the class. |
| T7 | **Headline plausibility** — the member gated age within persona-sane bounds on the default lens | `src/lib/headline-plausibility.spec.ts` | rule 31; the member hero is a flagship surface. |

T4 and T6 must exist before any kernel line is written. T2's bands are filled from the red run, never guessed.

## 6. Build steps

| # | Step | Tier / model | Budget | Reversible |
|---|---|---|---|---|
| 1 | **Core proof** — T1 diagnostic across all seeds; amend §2's estimate table to the printed numbers; record as an evidence row | C, Sonnet | 15 min / 30 calls | yes |
| 2 | Test instruments T2/T4/T5/T6/T7 + the T3 property, **red on main** | B, Sonnet | 30 min / 60 calls | yes |
| 3 | **§4.4 reservation-leg split** + golden-master re-baseline; FinTech ∥ independent code review | **A, Opus** (Why Opus: FIRE-math schedule change whose two-leg frame must stay coherent with ADR-0006/0007) | 60 min / 120 calls + reviewer 20/40 | code yes; member numbers move |
| 4 | **§4.1–4.3 per-member bridge gate** (split, invoke, compose, `bridgeCoverage` on the result, reachability re-clamp); FinTech ∥ independent code review; mutation run on `individual-fire` + `bridge` | **A, Opus** (Why Opus: multi-surface kernel gate with several defensible per-member attribution splits) | 60 min / 120 calls + reviewer 20/40 ×2 | code yes; every member number may move later |
| 5 | Caveat copy retired (member hero) + per-member assumption notes surfaced; rules 24/26/32 UI sweep on the member lens | B, Sonnet | 30 min / 60 calls | yes |
| 6 | PROJECT-LOG entry, close #162, `.claude/tasks/lessons.md` line for the detection gap ("no gate compares a member number against the household methodology applied to the same person") | C | 15 min / 30 calls | yes |

Steps 3 + 4 land as **one PR** (4 depends on 3's adequacy age) with both review rounds in the body; step 5 rides the same PR per §3 rule 4.

## 7. Acceptance

- T2–T7 green; **T4 exact-equal**, not within-tolerance.
- On the Sharmas: Rohit's member age **≥** his pre-change age, delta matching step 1's printed gate to the year; Priya's **unchanged to the rupee**.
- `npm run type-check && npm run test:unit` green in both trees; golden-master re-baseline reviewed line by line, never accepted wholesale.
- Mutation run on `individual-fire` + `bridge`: at least one KILLED mutant inside the new `max` composition and inside the reservation split.
- Member hero caveat no longer mentions the bridge or the healthcare reserve; a member with no locked money shows no bridge language.
- FinTech verdict explicitly answers "does this cover the class" (every PPF/NPS-holding member retiring before 60) yes/no.
- PROJECT-LOG entry + registry row recorded; #162 closed with an evidence table.

## 8. Open facts (each blocks the step named)

0. **[RAISED BY STEP 1, BLOCKS STEPS 2–6] Is a gate that moves no current seed worth building?**
   The prototype run (§2) shows Δ0 for every adult on every seed. The gate is correct-by-design
   insurance against a member who is locked-heavy AND near-FIRE (`corpusScale` ≈ 1) — a real
   persona (the mid-40s PPF/NPS-heavy accumulator who is nearly there), just not one any seed
   represents today. Options: (a) build it anyway as insurance and author the locked-heavy fixture
   that makes T2/T4 real; (b) build **§4.4 only** (which does move numbers) and defer §4.1–4.3
   until a fixture or a real user exhibits the class; (c) drop it. **Recommended: (a)** — the class
   is real and the fix is the same `max()` the household already uses, but it needs a new
   near-FIRE locked-heavy fixture, which is scope the spec did not budget. **Owner call.**
1. **Does the parents-support line belong to Rohit?** It is labelled "Rohit's parents" but carries no `ownerId`, so it is ring-2 and each adult bears 50%. If it is really his ring 1, his attributable expenses rise ~₹2.4L/yr and the gate binds harder. **Blocks:** §2's final numbers — step 1 prints both readings. Owner call, not an engineering one.
2. **Member's marginal rate or the household's for the member bridge?** This spec says the member's (a member's liquidation tax is their own). That is an **Assumption**, and needs the FinTech verdict in step 4; the household rate would be the conservative choice only for the higher earner.
3. **Will a member-owned dated goal ever be modelled?** Today ring 3 is excluded by design, so the member target has exactly two legs. If a member-owned goal appears, §4.4 grows to three. **Blocks:** nothing now — noted so step 3 does not hard-code "two".
4. **`corpusScale` on a fractional Joint holding** — confirm in step 1 that pre-scaling `value` (and `vestedValueINR`) composes with the internal `corpusScale` multiply rather than double-applying. **Blocks:** step 4.

## 9. Not in scope

- The household headline, `derive.ts`'s own bridge, and the household caveat — untouched.
- Ring-3 (dependent) expenses or a family-layer overlay in the member target — excluded by contract §3 of `individual-fire.ts`.
- The rental §24(a) collapse in the member tax path — a disclosed **conservative** simplification; fixing it makes the member number earlier, so it is not this change's business.
- The household split % over-allocation for N > 2 adults (documented bound, non-target persona).
- The zero-return-on-the-drawn-pool simplification in `bridge.ts` — net-pessimistic by design; its header forbids re-opening it as a "pair".
- Any DB/schema change. `IndividualFireResult` is derived, never persisted.
- `#185` step 5/6 work, and `salary.hikePercent` in the member path.

## 10. Revisions

- **2026-09-29 (step 1, core proof run)** — §2's estimate table replaced with the real printed
  numbers from the T1 prototype across all five seeds × every adult. **The core did not prove as
  the spec predicted: the gate is covered (Δ0) for every adult on every seed.** Three blockers
  raised for the owner: (a) the gate ships as pure insurance with no seed moving, (b) T4 as written
  is unwritable (Mauryas is two-adult; Ravi has no locked money) so a new fixture is needed, and
  (c) a separate illiquid-investment-property optimism surfaced that affects the household path
  too. Steps 2–6 are **HELD** pending that ruling; §4.4 (the reservation-leg inflation fix) is
  unaffected and remains buildable on its own arithmetic. Per the Prove-the-core-first rule R3, no
  scaffolding was built around an unproven core.
- **2026-09-29** — created. Splits #162 part 2 into the per-member bridge gate (§4.1–4.3) and the reservation-leg inflation asymmetry (§4.4) that the `individual-fire.ts` docblock currently discloses as a residual bound.

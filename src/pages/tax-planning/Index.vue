<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFireDerive } from "@/lib/useFireDerive";
import { useUiStore } from "@/stores/ui";
import { useAssumptionsStore } from "@/stores/assumptions";
import { todayIsoLocal } from "@/lib/as-of-date";
import { npsCeilingFor, AVAILABLE_FYS, getTaxConfigForFY } from "@/lib/tax";
import { getCurrentFinancialYear } from "@/lib/expense-history";
import { toAnnual } from "@/lib/cashflow";
import {
  netCashSalary,
  pfFromInvestmentRows,
  PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
} from "@/lib/salary-cash";
import { formatINRCompact, formatPercent, formatINR } from "@/lib/formatters";
import {
  deriveDeductions,
  deductionsForMember,
  computeEarnerTaxCard,
  isInMarginalReliefBand,
  marginalReliefMitigations,
  LIMIT_80C,
  LIMIT_80CCD_1B,
  LIMIT_80D_SELF,
  LIMIT_80D_PARENTS,
  LIMIT_SECTION_24,
  perAssesseeHouseholdTax,
} from "@/lib/tax-deductions";
import { householdTaxUnderRegime } from "@/lib/household-tax-regime";
import { buildDonutSegments } from "@/lib/donut";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import StatDashboard, { type KpiTile } from "@/components/income-layout/StatDashboard.vue";
import RankedBars, { type RankedBar } from "@/components/income-layout/RankedBars.vue";
import DiscoveryFooter from "@/components/shared/DiscoveryFooter.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import ProportionBar, { type ProportionSegment } from "@/components/shared/ProportionBar.vue";
import LimitMeter from "@/components/shared/LimitMeter.vue";
import TaxCliffChart from "@/components/charts/TaxCliffChart.vue";

const household = useHouseholdStore();
const fire = useFireDerive();
const ui = useUiStore();
const assumptions = useAssumptionsStore();

// gh #86 — lens the tax screen to the selected member (D-2026-06-08-05). FinTech "B'-fallback":
// recompute at the page-local selectedFY over the MEMBER-SCOPED sets so income AND deductions are
// SAME-SCOPE — never member-income ÷ household-deductions (the #23 honesty leak). Default = whole
// household (byte-identical to before). Each adult files their own ITR, so a member's individual tax
// on their own income + own deductions is the honest figure; "Joint" lines count on BOTH sides.
const lensActive = computed(() => ui.viewingMemberId != null && !household.isSolo);
const scopedHousehold = computed<typeof household.data>(() =>
  lensActive.value
    ? {
        ...household.data,
        // earners-set (NOT lensedMembers) — matches derive.ts:295-305: deductions' 80CCD(2)/employer-NPS
        // basis must be the same earners the income is built from, else a non-earner lens would deduct
        // against ~zero income. For a single earner-lens the two sets are identical (FinTech-confirmed).
        members: fire.lensedEarners.value,
        investments: fire.lensedInvestments.value,
        liabilities: fire.lensedLiabilities.value,
        insurance: fire.lensedInsurance.value,
      }
    : household.data,
);

// Page-local tax-year selector — drives ONLY this screen's regime comparison
// and cliff chart. It NEVER mutates global state: the dashboard FIRE plan always
// uses the auto current FY (getCurrentFinancialYear), independent of this pick.
const autoCurrentFY = getCurrentFinancialYear();
// Options = current + next configured FY (forward tax planning). If the current
// FY is beyond all configured years, fall back to the newest configured FY.
const fyOptions = computed<string[]>(() => {
  const forward = AVAILABLE_FYS.filter((fy) => fy >= autoCurrentFY);
  return forward.length > 0 ? forward : [AVAILABLE_FYS[AVAILABLE_FYS.length - 1]];
});
const selectedFY = ref(
  AVAILABLE_FYS.includes(autoCurrentFY) ? autoCurrentFY : AVAILABLE_FYS[AVAILABLE_FYS.length - 1],
);

type RegimeMode = "AUTO" | "OLD" | "NEW";
const mode = ref<RegimeMode>("AUTO");

// Recommend the regime that is actually cheaper under THIS screen's
// audit-grounded deductions (deriveDeductions: 80C + 80CCD(1B) + 80D + Sec 24).
// Defined below `oldResult`/`newResult`; referenced lazily so the order is safe.
const effectiveRegime = computed<"OLD" | "NEW">(() => {
  if (mode.value === "AUTO") return pageRecommended.value;
  return mode.value;
});

// Income consolidation
type IncomeRow = { label: string; amount: number; isTaxable: boolean; icon: string; color: string };
const OTHER_INCOME_VIS: Record<string, { icon: string; color: string }> = {
  Rental: { icon: "mdi-home-city-outline", color: "warning" },
  Dividend: { icon: "mdi-chart-line", color: "info" },
  Interest: { icon: "mdi-bank-outline", color: "info" },
};
const incomeRows = computed<IncomeRow[]>(() => {
  const rows: IncomeRow[] = [];
  // gh #86 — member-scoped income when a lens is active (same-scope with the deductions below).
  for (const m of fire.lensedEarners.value) {
    if (m.salary?.annualCTC) {
      rows.push({
        label: `Salary — ${m.name || "Earner"}`,
        amount: m.salary.annualCTC,
        isTaxable: true,
        icon: "mdi-cash-multiple",
        color: "success",
      });
    }
  }
  for (const b of fire.lensedBusinesses.value) {
    const annual = toAnnual({ amount: b.annualProfit, period: b.frequency });
    const share = annual * (b.sharePercent / 100);
    const exemptKinds: string[] = ["LLP", "Partnership", "HUF"];
    rows.push({
      label: `Business — ${b.name} (${b.legalKind})`,
      amount: share,
      isTaxable: !exemptKinds.includes(b.legalKind),
      icon: "mdi-domain",
      color: "primary",
    });
  }
  for (const o of fire.lensedOtherIncome.value) {
    const annual = toAnnual({ amount: o.amount, period: o.frequency });
    const vis = OTHER_INCOME_VIS[o.type] ?? { icon: "mdi-cash", color: "info" };
    rows.push({
      label: `${o.type} — ${o.label || (o.sourceEntityId ? household.data.businesses.find((b) => b.id === o.sourceEntityId)?.name : "Direct")}`,
      amount: annual,
      isTaxable: !o.isTaxExempt,
      icon: vis.icon,
      color: vis.color,
    });
  }
  return rows;
});

// Phase 4 Stage J — replace v4's hardcoded `150000 + 25000` dummy with the
// audit-grounded auto-deductions derivation (audit Entry #12 A12.2).
// gh #86 — deductions over the SAME member scope as the income above (FinTech B'-fallback; deriveDeductions
// is scope-agnostic, so a member-scoped household yields member-scoped 80C/80CCD/80D/§24/80CCD(2)). This is
// the load-bearing same-scope fix: lensing income but keeping household deductions would be the #23 leak.
const derivedDeductions = computed(() =>
  deriveDeductions(scopedHousehold.value, { asOfDate: todayIsoLocal() }),
);

// 80CCD(2) employer-NPS is the one deduction allowed in BOTH regimes — show the CAPPED value
// at the displayed regime's ceiling (per-member), so the tax-reducing figure is visible (gh-issue #4).
const employerNps80CCD2 = computed(() => {
  const regime = effectiveRegime.value;
  const list = derivedDeductions.value.employerNpsByMember;
  // Per-member, sector-aware ceiling (npsCeilingFor — same source as the engine) so a govt
  // member's 14% OLD figure displays correctly, matching what computeTax deducts (gh-issue #4).
  const used = list.reduce(
    (s, m) => s + (m.basic > 0 ? Math.min(m.nps, npsCeilingFor(regime, m.sector) * m.basic) : m.nps),
    0,
  );
  const limit = list.reduce(
    (s, m) => s + (m.basic > 0 ? npsCeilingFor(regime, m.sector) * m.basic : m.nps),
    0,
  );
  return { used: Math.round(used), limit: Math.round(limit) };
});

const totalTaxable = computed(() =>
  incomeRows.value.filter((r) => r.isTaxable).reduce((s, r) => s + r.amount, 0),
);

// totalTaxable is the CASH-basis figure (take-home + the income bars — the landlord receives full
// rent). The tax base nets let-out rent per person (§24a/§24b, §71) inside the per-assessee returns
// below, the same helper derive.ts uses (gh-issue #65, #87).

// Phase 4 Stage J — marginal-relief band detection (audit Entry #13 A13.2-4).
// The MR band is a NEW-regime 87A rebate-cliff construct, so test it against the actual
// new-regime taxable income (gross − standard deduction − 80CCD(2) employer NPS), which
// newResult already computes — not an old-regime totalDeductions proxy (gh-issue #2 review).
const marginalReliefActive = computed(() =>
  isInMarginalReliefBand(newResult.value.taxableIncome, selectedFY.value),
);
const marginalReliefSuggestions = computed(() =>
  marginalReliefMitigations(newResult.value.taxableIncome, selectedFY.value),
);

// Decision rule-of-thumb (audit Entry #12 A12.5), corrected to the research rule:
//   deductions ≥ ₹5L  → OLD regime usually wins (deduction value beats the
//                        lower new-regime slabs)
//   income     > ₹50L  → NEW regime usually wins (its surcharge is capped lower,
//                        and the deductions rarely close the gap at that income)
//   otherwise          → compute-and-compare (neither rule-of-thumb dominates;
//                        the recommendation comes from the actual totals below)
// The headline recommendation always comes from the computed comparison; this is
// only the plain-language heuristic shown alongside it.
const decisionRuleMessage = computed(() => {
  const ded = derivedDeductions.value.totalDeductions;
  const income = totalTaxable.value;
  const k = (n: number) => Math.round(n / 100_000);
  if (ded >= 500_000) {
    return `Your ₹${k(ded)}L of deductions clears the ₹5L mark — at this level the OLD regime almost always wins, as the deduction value exceeds the NEW regime's lower-slab advantage. (Confirm against the computed comparison below.)`;
  }
  if (income > 5_000_000) {
    return `Income above ₹50L usually favours the NEW regime — its surcharge is capped lower and ₹${k(ded)}L of deductions rarely closes the gap at this income. (Confirm against the computed comparison below.)`;
  }
  return `Income ₹${k(income)}L with ₹${k(ded)}L deductions sits in the compute-and-compare zone — neither rule-of-thumb dominates, so the recommendation below comes from the actual computed totals.`;
});
const totalExempt = computed(() =>
  incomeRows.value.filter((r) => !r.isTaxable).reduce((s, r) => s + r.amount, 0),
);

/**
 * #87 — THE PER-ASSESSEE RETURNS BEHIND EVERY FIGURE ON THIS SCREEN.
 *
 * India taxes each adult separately. This page used to run ONE `computeTax` over the POOLED
 * household income for its Old/New comparison AND its headline total, while the per-earner table
 * below ran a SECOND, per-member computation — so the household total and the sum of the cards
 * could (and for every dual-earner seed did) disagree by lakhs, and the kernel's `annualTax`
 * agreed with neither. `perAssesseeHouseholdTax` is the SINGLE derivation `derive.ts` now uses,
 * so this page's total, its per-earner cards and the dashboard headline are one number.
 */
const perAssessee = computed(() =>
  // #87 round 1 — RENDER the kernel's own per-assessee result (same pinned asOfDate, same member
  // lens, same attribution), never a second derivation with its own clock and earner list. Only a
  // forward FY picked on this page (the kernel always runs the current FY) re-runs the SAME helper
  // with the kernel's own inputs at that FY.
  selectedFY.value === ui.currentFY
    ? fire.perAssesseeTax.value
    : perAssesseeHouseholdTax(
        household.data,
        {
          members: fire.lensedMembers.value,
          businesses: fire.lensedBusinesses.value,
          otherIncome: fire.lensedOtherIncome.value,
        },
        selectedFY.value,
        assumptions.values.householdSplitPercent ?? 50,
        new Date(todayIsoLocal()),
      ),
);

// #87 round 3 — every figure comes from the ONE exported `householdTaxUnderRegime` (src/lib), the
// same function the page-vs-kernel lock calls. Forcing OLD/NEW still goes assessee by assessee:
// one pooled return would answer a question about a filer that does not exist.
const oldResult = computed(() =>
  householdTaxUnderRegime(perAssessee.value.perAssessee, "OLD", selectedFY.value),
);
const newResult = computed(() =>
  householdTaxUnderRegime(perAssessee.value.perAssessee, "NEW", selectedFY.value),
);
// #87 round 4 — the headline is ONE direct binding to the kernel helper for the selected mode.
// AUTO = each adult's OWN cheaper regime (= kernel `annualTax`), never min(all-Old, all-New).
const activeResult = computed(() =>
  householdTaxUnderRegime(perAssessee.value.perAssessee, mode.value, selectedFY.value),
);
const regimeFootnote = computed(() =>
  mode.value === "AUTO"
    ? "Each adult files their own return; each person's tax uses their own cheaper regime."
    : `Each adult files their own return. Shown under the ${mode.value === "OLD" ? "Old" : "New"} regime for everyone.`,
);
const savings = computed(() => Math.abs(oldResult.value.totalTax - newResult.value.totalTax));

// The cheaper regime per the displayed Old/New comparison. This supersedes
// useFireDerive's taxRec on this screen — taxRec used an incomplete deduction
// estimate (omitting 80CCD(1B) + Section 24) and could disagree with the
// numbers shown here. See mvp/SCREEN-STANDARD.md changelog (v0.2).
const pageRecommended = computed<"OLD" | "NEW">(() =>
  oldResult.value.totalTax <= newResult.value.totalTax ? "OLD" : "NEW",
);

const monthlyTakeHome = computed(() => {
  // gh #86 — savings contribution is the member's own (lensed) investments when a lens is active.
  // gh #218 — EPF/VPF rows are excluded HERE because PF is already subtracted inside the cash
  // figure below. Netting the auto-flowed EPF row off again would take the same rupees twice and
  // show a discretionary figure several thousand ₹/month too low.
  const annualNonPfInvesting = scopedHousehold.value.investments
    .filter((i) => i.type !== "EPF_VPF")
    .reduce((s, i) => s + (i.monthlyContribution ?? 0) * 12, 0);
  const annualGrossPostTax = totalTaxable.value - activeResult.value.totalTax;
  // gh #218 — the CASH figure: gross minus the PF the household's EPF_VPF rows already carry,
  // income tax and professional tax, from the ONE shared helper the dashboard headline and the
  // per-earner cards use.
  const annualPf = pfFromInvestmentRows(scopedHousehold.value, null);
  const earnerCount = scopedHousehold.value.members.filter(
    (m) => (m.salary?.annualCTC ?? 0) > 0,
  ).length;
  const annualTake = netCashSalary({
    annualCTC: totalTaxable.value,
    annualPf,
    annualTax: activeResult.value.totalTax,
    professionalTax: earnerCount * PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
  }).annual;
  return {
    annualGross: totalTaxable.value,
    annualTax: activeResult.value.totalTax,
    annualGrossPostTax,
    annualNonPfInvesting,
    annualTake,
    monthlyTake: Math.round(annualTake / 12),
    // Cash left after ALL PLANNED (non-PF) investing — a different concept from take-home.
    monthlyDiscretionaryAfterInvesting: Math.round(
      Math.max(0, annualTake - annualNonPfInvesting) / 12,
    ),
  };
});

// gh-issue #157: the per-earner tax computation is the shared, sector-aware
// computeEarnerTaxCard (src/lib/tax-deductions.ts) — extracted from this screen so a
// behaviour spec can call the exact function the screen renders from, and so the SAME sector
// handling as the LimitMeter above (npsCeilingFor(regime, m.sector)) applies here too.
//
// gh-issue #201: derivedDeductions.value.totalDeductions is the WHOLE household's 80C/80D/
// §24 pool — passing it to EVERY earner's card meant a two-earner household double-claimed the
// shared deductions (each card claimed 100% of the pool, so an earner with none of a given
// deduction still showed it, understating their tax). Each earner's card now uses the SAME
// per-member attribution the headline computeIndividualFire() path uses
// (src/lib/individual-fire.ts: deriveDeductions scoped to that member's own investments/
// liabilities/insurance) — one shared attribution, not a second formula.
/**
 * #87 — the cards are now a RENDERING of `perAssessee` above, not a second computation. Each
 * row's `gross` is that adult's ATTRIBUTED taxable income (own salary + own/Joint-split other
 * income and business share − their share of the rental collapse), which is what they actually
 * file on; it used to be salary CTC alone, so the card sum could never equal the household total
 * for a household with business or rental income. `Σ row.tax === kernel annualTax` is spec-locked.
 */
const perEarner = computed(() =>
  // #87 round 1 — every adult who FILES gets a card (an adult with only rent/interest income files
  // too), so the card sum equals the headline; earners keep their card even at ₹0.
  household.data.members
    .filter(
      (m) =>
        household.earners.some((e) => e.id === m.id) ||
        perAssessee.value.perAssessee.some((a) => a.memberId === m.id),
    )
    .map((m) => {
    // #204: own-owned (100%) + Joint-owned (× householdSplitPercent) — the SAME shared
    // `deductionsForMember` builder the headline path (`individual-fire.ts`) and the salary-form
    // preview (`previewEarnerTakeHome`) use, so a Joint PPF/ELSS/NPS or shared home loan is no
    // longer dropped from every earner's card.
    const earnerDeductions = deductionsForMember(
      scopedHousehold.value,
      m.id,
      assumptions.values.householdSplitPercent ?? 50,
      { asOfDate: todayIsoLocal() },
    );
    const assessee = perAssessee.value.perAssessee.find((a) => a.memberId === m.id);
    const card = computeEarnerTaxCard(
      m,
      selectedFY.value,
      earnerDeductions.totalDeductions,
      effectiveRegime.value,
      // gh #218 — that earner's OWN PF outflow, read from their EPF_VPF rows.
      pfFromInvestmentRows(scopedHousehold.value, m.id),
    );
    if (!assessee) return card;
    // #87 — override the card's salary-only gross/tax with this adult's REAL assessed position,
    // so the table sums to the household total shown above it. `takeHome` keeps the #218 cash
    // formula (CTC − PF − tax − professional tax) but on the real tax figure.
    const pf = pfFromInvestmentRows(scopedHousehold.value, m.id);
    const ctc = m.salary?.annualCTC ?? 0;
    // #87 round 3 — a forced Old/New shows this person's tax under THAT regime, so the cards sum
    // to the headline; "Better regime" stays their own cheaper one.
    const tax = mode.value === "OLD" ? assessee.oldTax : mode.value === "NEW" ? assessee.newTax : assessee.tax;
    return {
      ...card,
      gross: assessee.grossIncome,
      tax,
      rec: assessee.regime,
      effRate: assessee.grossIncome > 0 ? (tax / assessee.grossIncome) * 100 : 0,
      takeHome: netCashSalary({
        annualCTC: ctc,
        annualPf: pf,
        annualTax: tax,
        professionalTax: ctc > 0 ? PROFESSIONAL_TAX_ANNUAL_PER_EARNER : 0,
      }).annual,
    };
  }),
);

// Per-earner avatar visuals (mirror the Profile per-member colour language).
const EARNER_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#6366f1", "#ef4444"];
function earnerColor(i: number): string {
  return EARNER_COLORS[i % EARNER_COLORS.length];
}
function earnerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Standard hero (StatDashboard) ────────────────────────────────────────────
const kpis = computed<KpiTile[]>(() => {
  const r = activeResult.value;
  const mt = monthlyTakeHome.value;
  return [
    {
      eyebrow: "Effective rate",
      value: formatPercent(r.effectiveRate, 1),
      accent: true,
      meta: `${effectiveRegime.value === "OLD" ? "Old" : "New"} regime · FY ${selectedFY.value}`,
    },
    {
      eyebrow: "Total tax · per year",
      value: formatINRCompact(r.totalTax),
      meta: `${formatINRCompact(Math.round(r.totalTax / 12))} / mo`,
    },
    {
      eyebrow: "Take-home · per year",
      value: formatINRCompact(mt.annualTake),
      meta: `${formatINRCompact(mt.monthlyTake)} / mo`,
    },
    {
      eyebrow: "Better regime",
      icon: "mdi-scale-balance",
      iconColor: "primary",
      text: pageRecommended.value === "OLD" ? "Old regime" : "New regime",
      meta: savings.value > 0 ? `Saves ${formatINRCompact(savings.value)}` : "Regimes tie",
    },
  ];
});

const donutSegments = computed(() =>
  buildDonutSegments(
    [
      { key: "take", value: monthlyTakeHome.value.annualTake, color: "success" },
      { key: "tax", value: activeResult.value.totalTax, color: "error" },
    ],
    totalTaxable.value,
  ),
);
const takeHomePctLabel = computed(() =>
  formatPercent(Math.max(0, 100 - activeResult.value.effectiveRate), 0),
);

const regimeBars = computed<RankedBar[]>(() => {
  const oldTax = oldResult.value.totalTax;
  const newTax = newResult.value.totalTax;
  const max = Math.max(oldTax, newTax, 1);
  return [
    {
      key: "old",
      label: "Old regime",
      amount: formatINRCompact(oldTax),
      share: (oldTax / max) * 100,
      color: oldTax <= newTax ? "success" : "warning",
      icon: effectiveRegime.value === "OLD" ? "mdi-check-circle" : "mdi-circle-outline",
    },
    {
      key: "new",
      label: "New regime",
      amount: formatINRCompact(newTax),
      share: (newTax / max) * 100,
      color: newTax <= oldTax ? "success" : "warning",
      icon: effectiveRegime.value === "NEW" ? "mdi-check-circle" : "mdi-circle-outline",
    },
  ];
});

// Income consolidation as ranked share bars (taxable sources).
const incomeBars = computed<RankedBar[]>(() => {
  const taxable = incomeRows.value.filter((r) => r.isTaxable);
  const max = Math.max(...taxable.map((r) => r.amount), 1);
  return taxable.map((r, i) => ({
    key: String(i),
    label: r.label,
    amount: formatINRCompact(r.amount),
    share: (r.amount / max) * 100,
    color: r.color,
    icon: r.icon,
  }));
});

// Tax breakdown as a stacked proportion bar (segments sum to total tax).
const taxBreakdownSegments = computed<ProportionSegment[]>(() => {
  const r = activeResult.value;
  return [
    { key: "slab", label: "Slab tax", value: Math.max(0, r.slabTax - r.rebate), color: "primary" },
    { key: "surcharge", label: "Surcharge", value: r.surcharge, color: "warning" },
    { key: "cess", label: "Cess", value: r.cess, color: "info" },
  ].filter((s) => s.value > 0);
});

// Take-home split of gross: in-hand vs auto-invested vs tax.
const takeHomeSegments = computed<ProportionSegment[]>(() => {
  const mt = monthlyTakeHome.value;
  // gh #218 — the invested slice is the NON-PF investing only; PF gets its own segment, because
  // `annualTake` is already net of it (double-subtracting it made "in hand" too small).
  const inHand = Math.max(0, mt.annualTake - mt.annualNonPfInvesting);
  const pfSlice = Math.max(0, mt.annualGrossPostTax - mt.annualTake);
  return [
    { key: "inhand", label: "In hand", value: inHand, color: "success" },
    { key: "invested", label: "Auto-invested", value: mt.annualNonPfInvesting, color: "info" },
    { key: "pf", label: "PF + prof. tax", value: pfSlice, color: "secondary" },
    { key: "tax", label: "Tax", value: mt.annualTax, color: "error" },
  ].filter((s) => s.value > 0);
});

// gh #185 step 7 — zero-tax collapse (income-path kernel spec §7, "tax section collapses to
// 'you pay zero tax' below ₹12L"). The LOCKED persona spans ₹2.5L-₹1Cr; a ₹3-10L earner under the
// new-regime ₹12L rebate (u/s 87A, FY config `rebateLimit`) owes ZERO tax, so the whole
// deduction-optimisation machinery below (80C/80D/§24 meters, the old/new regime picker, the tax
// cliff chart, per-earner table) is noise that cannot move a number that is already zero — it reads
// as "this app is not for me" for exactly the persona this app exists to serve (goal-anchored
// rule 30). Honesty guard: this NEVER collapses a non-zero figure — it gates on the CURRENTLY
// DISPLAYED regime's own computed tax being zero (`activeResult`, which already respects an
// explicit OLD/NEW pick via `mode`), never a hardcoded income threshold. A household that has
// actively chosen a regime with real tax due always sees the full section; a genuine ₹0-₹0 tie
// (both regimes zero, e.g. Ravi at ₹3L) collapses regardless of which side the tie-break in
// `pageRecommended` (`<=`) happens to land on, because the number shown either way is honestly
// zero. The rebate threshold shown in the card copy is read from the FY config
// (`getTaxConfigForFY`), never hardcoded, so a future Budget change flows through automatically.
//
// Independent-review CRITICAL fix (per-earner class, gh #185 step 7 round 2): tax is per
// ASSESSEE, not per household. The household-pooled `activeResult.totalTax` can be ₹0 while one
// earner's OWN bill is non-zero (e.g. a two-earner household where one earner's large §24/80C
// claims zero out the pool while the other earner, taxed on their own income+deductions via
// `computeEarnerTaxCard`, still owes real tax) — collapsing on the pooled figure alone would hide
// that earner's real bill (the exact per-earner table this collapse would otherwise remove). The
// gate now ALSO requires every row in `perEarner` (already per-member-correct, l.266) to be zero.
const newRegimeRebateLimit = computed(
  () => getTaxConfigForFY(selectedFY.value).newRegime.rebateLimit,
);
const isZeroTaxRecommended = computed(
  () => activeResult.value.totalTax === 0 && perEarner.value.every((row) => row.tax === 0),
);
// Round-2 LOW fix: the "deduction planning can't move a zero" sentence was duplicated verbatim
// across the New/Old regime copy branches — one string, read by both.
const zeroTaxDeductionPlanningNote =
  "Deduction planning (80C, 80D, home-loan interest, and the Old-vs-New comparison) cannot lower a tax bill that is already ₹0, so we've hidden it below.";
// Power-user escape hatch (SCREEN-STANDARD §9 three-state render — collapsed is a THIRD state,
// not a dead end): defaults closed each time the collapse condition re-triggers (e.g. FY switch),
// so stale "expanded" state never silently survives onto a different zero-tax household/year.
const showFullSectionAnyway = ref(false);
watch(isZeroTaxRecommended, (isZero) => {
  if (!isZero) showFullSectionAnyway.value = false;
});
const zeroTaxSectionVisible = computed(() => !isZeroTaxRecommended.value || showFullSectionAnyway.value);
</script>

<template>
  <v-container fluid class="py-6 taxes-page">
    <LeafPageHeader
      :eyebrow="`Tax Planning · FY ${selectedFY}`"
      title="Taxes"
      description="High-level only. For filing, use your CA or Cleartax — this surface is for planning, not submission."
    >
      <template #actions>
        <v-select
          v-model="selectedFY"
          :items="fyOptions"
          density="compact"
          hide-details
          prepend-inner-icon="mdi-calendar"
          label="Tax year"
          style="min-width: 130px; max-width: 140px"
        />
      </template>
    </LeafPageHeader>

    <!-- Marginal-relief cliff warning (audit Entry #13 A13.2). -->
    <v-alert
      v-if="marginalReliefActive"
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      data-testid="marginal-relief-warning"
    >
      <div class="font-weight-bold mb-1">Marginal-relief band — rebate cliff</div>
      <ul class="mb-0">
        <li v-for="(s, idx) in marginalReliefSuggestions" :key="idx">{{ s }}</li>
      </ul>
    </v-alert>

    <!-- gh #185 step 7 — zero-tax collapse: a single honest card replaces the whole
         deduction-optimisation section for a household whose CURRENTLY DISPLAYED regime already
         computes to ₹0 tax. Never fires on a real, non-zero figure (activeResult respects an
         explicit OLD/NEW pick via `mode`, so a household that has chosen a regime with tax due
         always sees the full section). -->
    <PanelCard
      v-if="isZeroTaxRecommended && !showFullSectionAnyway"
      data-testid="tax-zero-collapse"
      icon="mdi-emoticon-happy-outline"
      icon-color="success"
      class="mb-5 zero-tax-card"
    >
      <div class="zero-tax-card__headline">You pay ₹0 income tax</div>
      <p class="zero-tax-card__scope text-caption text-medium-emphasis mb-3">
        On salary, business and other slab income — capital gains, if any, are taxed separately and
        not shown here; TDS already deducted is recovered on filing.
      </p>
      <p v-if="effectiveRegime === 'NEW'" class="zero-tax-card__reason text-body-2 mb-4">
        Your taxable income of {{ formatINRCompact(newResult.taxableIncome) }} is within the New
        regime's ₹{{ Math.round(newRegimeRebateLimit / 100000) }}L rebate (Section 87A) for FY
        {{ selectedFY }} — the New regime is your {{ pageRecommended === "NEW" ? "recommended" : "selected" }} regime, and its rebate brings your tax
        to zero. {{ zeroTaxDeductionPlanningNote }}
      </p>
      <p v-else class="zero-tax-card__reason text-body-2 mb-4">
        Your taxable income of {{ formatINRCompact(oldResult.taxableIncome) }} falls within the Old
        regime's basic exemption and Section 87A rebate for FY {{ selectedFY }} — the Old regime is
        your {{ pageRecommended === "OLD" ? "recommended" : "selected" }} regime here, and it already brings your tax to zero<template v-if="newResult.totalTax === 0"> (the New regime also computes to ₹0 at this income)</template>.
        The New regime is the statutory default; choosing Old is an opt-in at filing. {{ zeroTaxDeductionPlanningNote }}
      </p>
      <div class="row-line mb-1">
        <span class="text-medium-emphasis">Effective rate</span>
        <span class="text-currency font-weight-bold">{{ formatPercent(activeResult.effectiveRate, 1) }}</span>
      </div>
      <div class="row-line">
        <span class="text-medium-emphasis">Income after tax (before PF)</span>
        <span class="text-currency font-weight-bold">{{
          formatINRCompact(monthlyTakeHome.annualGrossPostTax)
        }}</span>
      </div>
      <v-btn
        variant="text"
        color="primary"
        size="small"
        class="mt-4"
        data-testid="tax-zero-collapse-toggle"
        @click="showFullSectionAnyway = true"
      >
        Show the full section anyway
      </v-btn>
    </PanelCard>
    <div v-if="isZeroTaxRecommended && showFullSectionAnyway" class="mb-4">
      <v-btn
        variant="tonal"
        color="secondary"
        size="small"
        data-testid="tax-zero-collapse-toggle"
        @click="showFullSectionAnyway = false"
      >
        Your tax is ₹0 — collapse back to the summary
      </v-btn>
    </div>

    <!-- Hero: effective rate / tax / take-home + income split donut + regime comparison -->
    <StatDashboard
      v-if="zeroTaxSectionVisible"
      :kpis="kpis"
      :donut-segments="donutSegments"
      donut-eyebrow="Income split"
      donut-center-eyebrow="Take-home"
      :donut-center-value="takeHomePctLabel"
      viz-eyebrow="Regime comparison"
    >
      <template #viz>
        <RankedBars :bars="regimeBars" />
        <div class="regime-controls">
          <v-btn-toggle v-model="mode" mandatory density="compact" color="primary">
            <v-btn value="AUTO" size="small">Auto ({{ pageRecommended === "OLD" ? "Old" : "New" }})</v-btn>
            <v-btn value="OLD" size="small">Old</v-btn>
            <v-btn value="NEW" size="small">New</v-btn>
          </v-btn-toggle>
          <span v-if="savings > 0" class="regime-save text-success">
            <v-icon icon="mdi-arrow-down-bold" size="x-small" />
            Save {{ formatINRCompact(savings) }} on the {{ pageRecommended === "OLD" ? "Old" : "New" }} regime
          </span>
        </div>
      </template>
    </StatDashboard>

    <!-- gh #185 step 7 — the deduction-optimisation machinery (income/deduction meters, tax
         breakdown, tax cliff, per-earner table, filing disclaimer) is exactly what cannot move an
         already-zero tax bill; hidden while collapsed, restored verbatim via the toggle above. -->
    <template v-if="zeroTaxSectionVisible">
    <!-- ───── Income & deductions ───── -->
    <div class="section-eyebrow">Income &amp; deductions</div>
    <v-row dense>
      <v-col cols="12" md="6">
        <PanelCard title="Income consolidation" icon="mdi-cash-multiple" icon-color="success" class="h-100">
          <RankedBars :bars="incomeBars" />
          <v-divider class="my-3" />
          <div class="row-line">
            <span class="font-weight-bold">Total income (before rental relief)</span>
            <span class="text-currency font-weight-bold">{{ formatINRCompact(totalTaxable) }}</span>
          </div>
          <div v-if="totalExempt > 0" class="row-line text-caption text-medium-emphasis mt-1">
            <span>Total exempt (informational)</span>
            <span class="text-currency">{{ formatINRCompact(totalExempt) }}</span>
          </div>
        </PanelCard>
      </v-col>

      <v-col cols="12" md="6">
        <PanelCard title="Deductions &amp; regime tip" icon="mdi-tag-multiple-outline" icon-color="info" class="h-100">
          <p class="text-body-2 mb-3">{{ decisionRuleMessage }}</p>
          <div class="meters">
            <LimitMeter label="80C" :used="derivedDeductions.section80C" :limit="LIMIT_80C" color="primary" :format-value="formatINRCompact" />
            <LimitMeter label="80CCD(1B) · NPS" :used="derivedDeductions.section80CCD1B" :limit="LIMIT_80CCD_1B" color="info" :format-value="formatINRCompact" />
            <LimitMeter label="80D · Health" :used="derivedDeductions.section80D" :limit="LIMIT_80D_SELF + LIMIT_80D_PARENTS" color="success" :format-value="formatINRCompact" />
            <LimitMeter label="Sec 24 · Home-loan interest" :used="derivedDeductions.section24" :limit="LIMIT_SECTION_24" color="warning" :format-value="formatINRCompact" />
            <LimitMeter v-if="employerNps80CCD2.used > 0" label="80CCD(2) · Employer NPS (both regimes)" :used="employerNps80CCD2.used" :limit="employerNps80CCD2.limit" color="info" :format-value="formatINRCompact" />
          </div>
          <v-divider class="my-3" />
          <div class="row-line">
            <span class="font-weight-bold">Total deductions</span>
            <span class="text-currency font-weight-bold">{{ formatINRCompact(derivedDeductions.totalDeductions) }}</span>
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            See <router-link to="/preferences#pref-section-statutory">Statutory reference</router-link> for limits.
          </div>
        </PanelCard>
      </v-col>
    </v-row>

    <!-- ───── Your tax ───── -->
    <div class="section-eyebrow">Your tax</div>
    <v-row dense>
      <v-col cols="12" md="6">
        <PanelCard
          :title="`Tax breakdown · ${effectiveRegime === 'OLD' ? 'Old' : 'New'} regime`"
          icon="mdi-calculator-variant-outline"
          icon-color="primary"
          class="h-100"
        >
          <ProportionBar :segments="taxBreakdownSegments" :format-value="formatINRCompact" class="mb-3" />
          <v-list density="compact" class="bg-transparent">
            <v-list-item class="px-0">
              <v-list-item-title>Slab tax</v-list-item-title>
              <template #append><span class="text-currency">{{ formatINR(activeResult.slabTax) }}</span></template>
            </v-list-item>
            <v-list-item v-if="activeResult.rebate > 0" class="px-0">
              <v-list-item-title>Rebate u/s 87A</v-list-item-title>
              <template #append><span class="text-currency text-success">−{{ formatINR(activeResult.rebate) }}</span></template>
            </v-list-item>
            <v-list-item v-if="activeResult.surcharge > 0" class="px-0">
              <v-list-item-title>Surcharge</v-list-item-title>
              <template #append><span class="text-currency">{{ formatINR(activeResult.surcharge) }}</span></template>
            </v-list-item>
            <v-list-item class="px-0">
              <v-list-item-title>Cess (4%)</v-list-item-title>
              <template #append><span class="text-currency">{{ formatINR(activeResult.cess) }}</span></template>
            </v-list-item>
          </v-list>
          <v-divider class="my-2" />
          <div class="row-line">
            <span class="font-weight-bold">Total tax</span>
            <span class="text-currency font-weight-bold">{{ formatINR(activeResult.totalTax) }}</span>
          </div>
        </PanelCard>
      </v-col>

      <v-col cols="12" md="6">
        <PanelCard title="Take-home" icon="mdi-wallet-outline" icon-color="success" class="h-100">
          <ProportionBar :segments="takeHomeSegments" :format-value="formatINRCompact" class="mb-3" />
          <div class="row-line mb-1">
            <span>Annual (after tax + PF)</span>
            <span class="text-currency font-weight-bold">{{ formatINRCompact(monthlyTakeHome.annualTake) }}</span>
          </div>
          <div class="row-line">
            <span>Monthly</span>
            <span class="text-currency font-weight-bold">{{ formatINRCompact(monthlyTakeHome.monthlyTake) }}</span>
          </div>
          <v-divider class="my-3" />
          <div class="row-line text-caption text-medium-emphasis">
            <span>Less investing ({{ formatINRCompact(monthlyTakeHome.annualNonPfInvesting) }}/yr)</span>
            <span class="text-currency"
              >{{ formatINRCompact(monthlyTakeHome.monthlyDiscretionaryAfterInvesting) }} / mo</span
            >
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            Cash in hand each month after your automatic investment contributions.
          </div>
        </PanelCard>
      </v-col>
    </v-row>

    <!-- ───── Tax cliff (A13.3) ───── -->
    <div class="section-eyebrow">Tax cliff</div>
    <v-row dense>
      <v-col cols="12">
        <TaxCliffChart :fy="selectedFY" :old-deductions="derivedDeductions.totalDeductions" />
      </v-col>
    </v-row>

    <!-- ───── Per earner (household view only — the whole-household breakdown; the lensed view
             already IS a single member, so this comparison table is hidden then). gh #86. ───── -->
    <template v-if="!lensActive && perEarner.length >= 2">
      <div class="section-eyebrow">Per earner</div>
      <PanelCard>
        <v-table density="comfortable" class="bg-transparent earner-table">
          <thead>
            <tr>
              <th>Earner</th>
              <th class="text-right">Gross</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Eff. rate</th>
              <th class="text-right">Take-home</th>
              <th class="text-center">Cheaper regime</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in perEarner" :key="row.name">
              <td>
                <div class="earner-cell">
                  <span class="earner-avatar" :style="{ background: earnerColor(i) }">{{ earnerInitials(row.name) }}</span>
                  <span class="font-weight-medium">{{ row.name }}</span>
                </div>
              </td>
              <td class="text-right text-currency">{{ formatINRCompact(row.gross) }}</td>
              <td class="text-right text-currency text-error">{{ formatINRCompact(row.tax) }}</td>
              <td class="text-right text-currency text-medium-emphasis">{{ formatPercent(row.effRate, 1) }}</td>
              <td class="text-right text-currency font-weight-bold text-success">{{ formatINRCompact(row.takeHome) }}</td>
              <td class="text-center">
                <v-chip size="x-small" variant="tonal" :color="row.rec === 'OLD' ? 'info' : 'primary'">{{ row.rec }}</v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
        <div class="text-caption text-medium-emphasis mt-3">
          {{ regimeFootnote }}
        </div>
        <div
          v-for="a in perAssessee.attributedNonEarners"
          :key="a.memberId"
          class="text-caption text-medium-emphasis mt-1"
        >
          {{ a.name }}'s income is counted on {{ a.toName }}'s return (no own salary or business).
        </div>
      </PanelCard>
    </template>

    <v-alert type="info" variant="tonal" density="compact" class="mt-5">
      This is an estimate — for filing, use your CA / Cleartax. Standard deduction, 80C (EPF + PPF + ELSS + life premium),
      80D (health premium), and Section 24 (home-loan interest) are auto-applied.
    </v-alert>
    </template>

    <DiscoveryFooter
      :also-show-keys="[
        'tax.sandwichGenNudges',
        'family.parentsBucket',
        'investments.international',
        'investments.esop',
      ]"
    />
  </v-container>
</template>

<style scoped>
.row-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.meters {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.earner-table :deep(tbody tr) {
  transition: background 120ms ease;
}
.earner-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
.earner-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.earner-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  flex: 0 0 auto;
}
.regime-controls {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.regime-save {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}
.zero-tax-card__headline {
  font-size: var(--type-3xl, 1.75rem);
  font-weight: 700;
  color: rgb(var(--v-theme-success));
  margin-bottom: 12px;
}
.zero-tax-card__reason {
  max-width: 62ch;
}
</style>

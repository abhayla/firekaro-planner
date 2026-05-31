/**
 * Q7 (v3) — typed glossary registry for InfoTip. ~25 financial-jargon terms used across
 * the demo. Each entry has a short user-facing explanation in plain language; some have
 * a one-line formula for the curious.
 *
 * To add a term: append a key + entry here, then reference it via <InfoTip term="…">.
 * TermKey is exported so consumers get type-checked tooltip references.
 */

/** Audit A33.3 — top-level glossary categories for filtering + search. */
export type GlossaryCategory = "Tax" | "Instruments" | "Strategy" | "Risk" | "Behavioral";

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  "Tax",
  "Instruments",
  "Strategy",
  "Risk",
  "Behavioral",
];

export interface GlossaryEntry {
  label: string;
  explanation: string;
  formula?: string;
  /** A33.3 — optional category; resolved via GLOSSARY_CATEGORY for entries that omit it inline. */
  category?: GlossaryCategory;
}

export const TERM_GLOSSARY = {
  "fire-number": {
    label: "FIRE Number",
    explanation:
      "The corpus you need to live off investment returns indefinitely. Hit it and you're financially independent.",
    formula: "FIRE Number = Annual expenses ÷ Safe Withdrawal Rate",
  },
  swr: {
    label: "Safe Withdrawal Rate (SWR)",
    explanation:
      "The percentage of your corpus you can withdraw each year, adjusted for inflation, without running out of money over 30-50 years.",
    formula: "Indian SWR ≈ 3-3.5% (vs 4% in the US, due to inflation + lower expected returns)",
  },
  dti: {
    label: "Debt-to-Income (DTI)",
    explanation:
      "Total monthly EMIs as a percentage of monthly income. Banks consider 40% the safe upper limit; over 60% is high stress.",
    formula: "DTI = (Monthly EMI total ÷ Monthly income) × 100",
  },
  "freedom-score": {
    label: "Freedom Score",
    explanation:
      "A 0-100 composite of savings rate, FIRE progress, emergency-fund coverage, debt load, and insurance adequacy. Aims to summarise overall financial health in a single number.",
  },
  "emergency-fund-coverage": {
    label: "Emergency Fund Coverage",
    explanation:
      "How many months of essential expenses your liquid savings can cover. Personal-finance rule of thumb: 3-6 months for salaried, 6-12 months for self-employed.",
    formula: "Coverage = Liquid corpus ÷ Monthly essential expenses",
  },
  "savings-rate": {
    label: "Savings Rate",
    explanation:
      "The share of your take-home income that you save and invest each year. Mr. Money Mustache's well-known table maps savings rate directly to years to FIRE.",
    formula: "Savings Rate = (Annual income - Annual spending) ÷ Annual income",
  },
  "net-worth": {
    label: "Net Worth",
    explanation:
      "Total assets (corpus + real estate + gold + cash) minus total liabilities (loans, credit-card balances).",
  },
  ctc: {
    label: "CTC (Cost to Company)",
    explanation:
      "Your total annual compensation as the employer accounts for it — includes basic, HRA, PF, gratuity, employer NPS, perks, and ESOPs. Your in-hand pay is significantly lower after tax + deductions.",
  },
  "hike-percent": {
    label: "Annual Hike %",
    explanation:
      "Your expected year-on-year CTC increase. Drives the multi-year projection. Indian techies typically see 8-15%; conservative estimate is 8-9%.",
  },
  hlv: {
    label: "Human Life Value (HLV)",
    explanation:
      "A method to size life insurance based on the future income an earner's family would lose. Rough rule: 10× annual income for an earner aged 30, less for older earners.",
    formula: "HLV ≈ Annual income × (years to retirement) × discount factor",
  },
  "80c": {
    label: "Section 80C",
    explanation:
      "Indian Income Tax Act section allowing up to ₹1.5L deduction per FY across instruments like ELSS, PPF, EPF, NPS Tier-I, tax-saver FDs, life insurance premiums, principal repayment of home loan.",
  },
  "80d": {
    label: "Section 80D",
    explanation:
      "Tax deduction on health-insurance premiums. ₹25K for self+family, +₹25K (₹50K if senior) for parents. Preventive health check-up up to ₹5K within these caps.",
  },
  "section-24": {
    label: "Section 24",
    explanation:
      "Tax deduction on home-loan interest. ₹2L cap per FY for self-occupied property; uncapped for rented property (but loss set-off capped at ₹2L).",
  },
  surcharge: {
    label: "Surcharge",
    explanation:
      "An additional levy on top of income tax for higher earners. Slabs (FY 2025-26): 10% above ₹50L, 15% above ₹1Cr, 25% above ₹2Cr, 37% above ₹5Cr (old regime; new regime caps at 25%).",
  },
  cess: {
    label: "Health & Education Cess",
    explanation:
      "A 4% additional charge on (income tax + surcharge) that funds healthcare and education infrastructure. Applies under both old and new regimes.",
  },
  "marginal-relief": {
    label: "Marginal Relief",
    explanation:
      "FY 2025-26 new regime: when income just exceeds the ₹12L rebate limit, the tax cannot exceed the income above ₹12L. Prevents a small bump in salary causing disproportionate tax.",
  },
  "epf-vpf": {
    label: "EPF / VPF",
    explanation:
      "Employees' Provident Fund (statutory 12% of basic + employer match) and Voluntary Provident Fund (voluntary top-up). Tax-free corpus growth; withdrawn tax-free after 5 years of service.",
  },
  ppf: {
    label: "PPF",
    explanation:
      "Public Provident Fund — government-backed 15-year scheme, current rate ~7.1%, full 80C deduction, fully tax-free at maturity. ₹1.5L/year cap.",
  },
  nps: {
    label: "NPS",
    explanation:
      "National Pension System — market-linked retirement scheme. Tier-I locks until 60 (with 60% lump-sum + 40% mandatory annuity). Extra ₹50K deduction available under 80CCD(1B).",
  },
  elss: {
    label: "ELSS",
    explanation:
      "Equity Linked Savings Scheme — equity mutual funds with 3-year lock-in, eligible for ₹1.5L 80C deduction. LTCG above ₹1L/year taxed at 10%.",
  },
  esop: {
    label: "ESOP",
    explanation:
      "Employee Stock Option Plan. You get the right to buy company shares at a fixed price (strike) after vesting. Tax fires twice: on vest (perquisite at FMV-strike) and on sale (capital gain).",
  },
  "lean-fire": {
    label: "Lean FIRE",
    explanation:
      "Reaching financial independence with a smaller corpus, typically funding a modest lifestyle. In the demo, Lean FIRE corpus ≈ FIRE Number × 0.6.",
  },
  "fat-fire": {
    label: "Fat FIRE",
    explanation:
      "Financial independence with a larger corpus that funds a comfortable / luxurious lifestyle. In the demo, Fat FIRE corpus ≈ FIRE Number × 1.5.",
  },
  "coast-fire": {
    label: "Coast FIRE",
    explanation:
      "You've saved enough that, even with zero new contributions, your existing corpus compounds to the FIRE Number by retirement age. You can coast — still work, but no more investing needed.",
  },
  "inflated-rupees": {
    label: "Inflated ₹",
    explanation:
      "Future-year amounts adjusted for inflation. ₹1L of today's spending costs ~₹1.79L in 10 years at 6% inflation. Future projections in the demo show inflated values unless noted otherwise.",
  },
  "asset-allocation": {
    label: "Asset Allocation",
    explanation:
      "The split of your corpus across equity, debt, real estate, gold, etc. Rule of thumb: equity % = (110 - age). Higher equity early, more conservative as retirement approaches.",
  },
  // ---------- Phase 7 Stage S — v5 audit additions (~30 net-new) ----------
  "barista-fire": {
    label: "Barista FIRE",
    explanation:
      "An alternative FIRE path: hit a smaller corpus, then transition to part-time / passion work that covers half of expenses while the corpus covers the rest. Lower-target than Regular FIRE.",
  },
  "swr-horizon": {
    label: "Horizon-driven SWR",
    explanation:
      "Safe Withdrawal Rate that adjusts to the horizon: shorter horizons can support higher SWR (4-4.5%), longer ones need lower (3-3.5%). The Indian default at age 50 is ~3.25-3.5%.",
    formula: "Resolved via SWR_AGE_TABLE in lib/fire-math.ts",
  },
  "variant-multiplier": {
    label: "Variant Multiplier (28× / 30× / 50×)",
    explanation:
      "FIRE corpus expressed as a multiple of annual expenses. Lean = 28× annual expenses, Regular = 30×, Fat = 50×. Equivalent to SWR-based corpus but easier to reason about.",
  },
  "inflation-bucket": {
    label: "4-bucket Inflation",
    explanation:
      "Different expense classes grow at different rates: general CPI ~6%, healthcare ~8%, education ~10%, housing ~5%. Routing each expense line to its bucket avoids the v4 single-rate undercount.",
  },
  "family-layer": {
    label: "Family Layer",
    explanation:
      "Sandwich-gen-specific commitments — parents bucket, kids' education target, marriage event, extended-family contingency. Each routes to the correct inflation bucket.",
  },
  "parents-bucket": {
    label: "Parents Bucket",
    explanation:
      "Dedicated expense line for aging-parent costs (medical, support, in-home care). Routes to healthcare inflation (8%). A 4-5% buffer of annual expenses is the audit-grounded floor.",
  },
  "extended-contingency": {
    label: "Extended-family Contingency",
    explanation:
      "Buffer (~7.5% of annual expenses) for unexpected obligations from extended family. Indian sandwich-gen reality — siblings, in-laws, ancestral property events.",
  },
  "education-target": {
    label: "Education Target",
    explanation:
      "Lump-sum goal for child's higher education. ~₹50L for domestic UG; ~₹1.5Cr for overseas Masters. Auto-routes to education inflation (10%).",
  },
  "glide-path": {
    label: "Glide Path (Pfau-Kitces)",
    explanation:
      "Pre-retirement, taper equity DOWN as retirement nears (de-risking). The Pfau-Kitces 2014 research shows a 75% → 40% taper over the last 10 years materially reduces sequence-of-returns risk.",
  },
  "sorr": {
    label: "SORR (Sequence of Returns Risk)",
    explanation:
      "The risk that poor returns in the FIRST 3-5 years of retirement permanently impair your corpus, even if the long-run average is healthy. Bucket 1 (cash) protects against this.",
  },
  "withdrawal-rule-constant": {
    label: "Constant Withdrawal",
    explanation:
      "Withdraw SWR × starting-corpus, then inflate by inflation every year. Simple and predictable; ignores actual corpus path (no downside protection).",
  },
  "withdrawal-rule-floor-ceiling": {
    label: "Floor/Ceiling Withdrawal",
    explanation:
      "Audit-mandated downside protection. Default: when corpus drops below 80% of starting, cut spending 10%. When corpus exceeds 120%, hold spending flat (no ratchet). Smooths spending across market cycles.",
  },
  "healthcare-corpus": {
    label: "Healthcare Corpus Reservation",
    explanation:
      "Earmark ~20% of FIRE corpus specifically for healthcare expenses. Healthcare inflation (8%) outpaces general inflation (6%), so this slice needs its own protection.",
  },
  "joint-loan-deduction": {
    label: "Joint Home Loan Deduction",
    explanation:
      "If your home loan has 2+ co-borrowers (e.g., spouse joint loan), EACH can independently claim ₹2L Sec 24 interest deduction — total ₹4L/yr instead of ₹2L for a single borrower.",
  },
  "80ccd-1b": {
    label: "Section 80CCD(1B)",
    explanation:
      "Additional ₹50k tax deduction for NPS Tier-I contributions, OVER AND ABOVE the ₹1.5L 80C cap. Unique to NPS — no other instrument unlocks this.",
  },
  "80ccd-2": {
    label: "Section 80CCD(2)",
    explanation:
      "Employer's NPS contribution (up to 10% of basic + DA, or 14% for govt employees) is deductible. NEW REGIME compatible — one of the only deductions that survives in new regime.",
  },
  "ltcg-equity-12-5": {
    label: "LTCG (Equity 12.5%)",
    explanation:
      "Long-term capital gains on listed equity / equity MF / ESOP held > 12 months. Post FY 2024-25: 12.5% rate (was 10%) above ₹1.25L exemption (was ₹1L) per FY.",
  },
  "stcg-equity-20": {
    label: "STCG (Equity 20%)",
    explanation:
      "Short-term capital gains on listed equity / equity MF held <= 12 months. Post FY 2024-25: 20% flat (was 15%).",
  },
  "perquisite-tax": {
    label: "Perquisite Tax (ESOP/RSU Layer 1)",
    explanation:
      "ESOP/RSU triggers tax at vest/exercise on (FMV − exercise price), taxed at your marginal slab rate. This is the first of TWO tax events; capital gains at sale is the second.",
  },
  "lrs-tcs": {
    label: "LRS + TCS",
    explanation:
      "Liberalised Remittance Scheme — up to $250k/yr foreign remittance per person. TCS (Tax Collected at Source) at 20% above ₹7L threshold from FY 2023-24. Adjustable against income tax.",
  },
  "reit": {
    label: "REIT",
    explanation:
      "Real Estate Investment Trust — listed instrument that owns commercial real estate + pays out 90% of cash flow as distributions. Liquid, divisible, and largely debt-like in yield (7-8%).",
  },
  "international-equity": {
    label: "International Equity",
    explanation:
      "Foreign equity exposure via FoF (Fund-of-Funds, simplest), LRS-Direct (US brokerage), or GIFT City (rupee-denominated). 15-25% allocation reduces correlation with India equity and INR depreciation risk.",
  },
  "sgb": {
    label: "Sovereign Gold Bond (SGB)",
    explanation:
      "Government-issued bonds tracking gold price + paying 2.5% annual interest. Tax-free at maturity (8 years). The audit-preferred gold form vs physical (storage + assay) or ETF (no interest).",
  },
  "scss": {
    label: "SCSS (Senior Citizens Savings Scheme)",
    explanation:
      "Post-60 savings scheme — current rate ~8.2%, ₹30L max corpus per senior. Quarterly interest payouts. 80C deduction eligible. Useful for parents in retirement.",
  },
  "sukanya-samriddhi": {
    label: "Sukanya Samriddhi",
    explanation:
      "Government scheme for girl child under 10 — current rate ~8.2%, ₹1.5L/yr cap, EEE tax treatment. Matures at 21 (or marriage post-18). 80C eligible.",
  },
  "estate-planning": {
    label: "Estate Planning",
    explanation:
      "7-step checklist: will · nominees · POA · joint accounts · digital estate · HUF karta succession · term life nominee. Sandwich-gen households especially need ALL 7 in place.",
  },
  "lifestyle-inflation": {
    label: "Lifestyle Inflation",
    explanation:
      "Expense growth exceeding general inflation — typically driven by income hikes leading to lifestyle upgrades. Watch for YoY expense growth > general+2pp; that's the lifestyle-creep flag.",
  },
  "goal-post-shift": {
    label: "Goal-post Shift",
    explanation:
      "Behavioral red flag — repeatedly moving the FIRE target year further out to keep the plan 'achievable'. Two+ shifts in successive snapshots suggests the plan is calibrated to feel comfortable rather than honest.",
  },
  "auto-debit-gap": {
    label: "Auto-debit Gap",
    explanation:
      "Manual (non-automated) recurring contributions have a 30-40% lower follow-through rate than auto-debited ones. Automating closes the gap between intention and behavior.",
  },
  "ay": {
    label: "Assessment Year (AY)",
    explanation:
      "The year following the Financial Year in which income is assessed for tax. FY 2025-26 income is assessed in AY 2026-27.",
  },
  "amfi": {
    label: "AMFI",
    explanation:
      "Association of Mutual Funds in India — issues ARN (AMFI Registration Number) to mutual fund distributors and maintains industry standards.",
  },
  "pfrda": {
    label: "PFRDA",
    explanation:
      "Pension Fund Regulatory and Development Authority — regulates NPS (National Pension System). The 2025 Master Direction sets the 60/40 lump-sum/annuity split rules.",
  },
  "rbi-master-direction": {
    label: "RBI Master Direction",
    explanation:
      "Top-level RBI regulatory directives. The Master Direction on LRS governs foreign remittance limits and reporting for Indian residents.",
  },
  "schedule-fa": {
    label: "Schedule FA",
    explanation:
      "Foreign Assets disclosure schedule in the Indian Income Tax Return. Required for holders of foreign equity / RSU / bank accounts / property. Penalty for non-disclosure is steep — ₹10L per year.",
  },
  "plan-to-age": {
    label: "Plan-to Age",
    explanation:
      "The age you plan your corpus to last to. Default 90 (research Ch 02 §2.9: Indian sandwich-gen longevity median 88-92). Per-member override on Profile.",
  },
  "rebate-87a": {
    label: "Section 87A Rebate",
    explanation:
      "Tax rebate for low/mid-income taxpayers. New regime: full rebate up to ₹12L taxable income (FY 2025-26). Old regime: rebate up to ₹5L taxable. Marginal relief applies just above the threshold.",
  },
  "tier-2-nps": {
    label: "NPS Tier-II",
    explanation:
      "Voluntary NPS account with NO lock-in (vs Tier-I locked until 60). Lower tax benefits but full liquidity. Useful as an equity-debt-blended liquid investment with low expense ratio.",
  },
  "huf": {
    label: "HUF",
    explanation:
      "Hindu Undivided Family — separate Indian tax entity with own PAN, ITR, and exemption slabs. Can split income across family members for tax efficiency; subject to specific Hindu law rules.",
  },
  "sandwich-gen": {
    label: "Sandwich-gen",
    explanation:
      "The demographic simultaneously supporting children's education AND aging parents. Median age 28-40, income ₹25-80L. The dual-load shapes the entire v5 FIRE math (family layer, healthcare bucket, contingency).",
  },
  // ---------- A35.3 — estate-checklist terms (each links from /estate-planning) ----------
  will: {
    label: "Will",
    explanation:
      "A registered legal document distributing your assets per your intent and naming an executor. Without one, intestate succession law applies — a court process prone to family disputes and delay.",
  },
  guardianship: {
    label: "Guardianship (minor children)",
    explanation:
      "Naming a legal guardian for minor children in your will. If both parents pass without a named guardian, the court decides — the single most important reason sandwich-gen households with young kids need a will.",
  },
  nominee: {
    label: "Nominee",
    explanation:
      "The person you register on a bank, demat, mutual-fund, EPF, NPS or insurance account to receive it on your death. Nomination is the lowest-friction transfer; keep nominees current (e.g. post-marriage).",
  },
  "power-of-attorney": {
    label: "Power of Attorney (POA)",
    explanation:
      "A document authorising a trusted person to act on your financial or medical behalf if you're incapacitated. Financial + medical POA routes around weeks of paperwork during a crisis.",
  },
  "joint-survivor": {
    label: "Either-or-Survivor",
    explanation:
      "A joint-account mode where either holder can operate the account and, on one holder's death, the survivor automatically retains it — bypassing succession on the joint share at first death.",
  },
  "digital-estate": {
    label: "Digital Estate",
    explanation:
      "An inventory of digital accounts, passwords, 2FA recovery codes and crypto wallets, stored for emergency access. Without it, digital assets (and crypto) can be permanently lost on death.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type TermKey = keyof typeof TERM_GLOSSARY;

/**
 * A33.3 — category tag per term. Exhaustive `Record<TermKey, …>` so adding a
 * glossary entry without a category is a compile error (the safety net).
 * Categories: Tax · Instruments · Strategy · Risk · Behavioral.
 */
export const GLOSSARY_CATEGORY: Record<TermKey, GlossaryCategory> = {
  "fire-number": "Strategy",
  swr: "Strategy",
  dti: "Risk",
  "freedom-score": "Strategy",
  "emergency-fund-coverage": "Risk",
  "savings-rate": "Strategy",
  "net-worth": "Strategy",
  ctc: "Tax",
  "hike-percent": "Strategy",
  hlv: "Risk",
  "80c": "Tax",
  "80d": "Tax",
  "section-24": "Tax",
  surcharge: "Tax",
  cess: "Tax",
  "marginal-relief": "Tax",
  "epf-vpf": "Instruments",
  ppf: "Instruments",
  nps: "Instruments",
  elss: "Instruments",
  esop: "Instruments",
  "lean-fire": "Strategy",
  "fat-fire": "Strategy",
  "coast-fire": "Strategy",
  "inflated-rupees": "Strategy",
  "asset-allocation": "Strategy",
  "barista-fire": "Strategy",
  "swr-horizon": "Strategy",
  "variant-multiplier": "Strategy",
  "inflation-bucket": "Strategy",
  "family-layer": "Strategy",
  "parents-bucket": "Strategy",
  "extended-contingency": "Strategy",
  "education-target": "Strategy",
  "glide-path": "Strategy",
  sorr: "Risk",
  "withdrawal-rule-constant": "Strategy",
  "withdrawal-rule-floor-ceiling": "Strategy",
  "healthcare-corpus": "Strategy",
  "joint-loan-deduction": "Tax",
  "80ccd-1b": "Tax",
  "80ccd-2": "Tax",
  "ltcg-equity-12-5": "Tax",
  "stcg-equity-20": "Tax",
  "perquisite-tax": "Tax",
  "lrs-tcs": "Tax",
  reit: "Instruments",
  "international-equity": "Instruments",
  sgb: "Instruments",
  scss: "Instruments",
  "sukanya-samriddhi": "Instruments",
  "estate-planning": "Strategy",
  "lifestyle-inflation": "Behavioral",
  "goal-post-shift": "Behavioral",
  "auto-debit-gap": "Behavioral",
  ay: "Tax",
  amfi: "Instruments",
  pfrda: "Instruments",
  "rbi-master-direction": "Tax",
  "schedule-fa": "Tax",
  "plan-to-age": "Strategy",
  "rebate-87a": "Tax",
  "tier-2-nps": "Instruments",
  huf: "Tax",
  "sandwich-gen": "Strategy",
  will: "Strategy",
  guardianship: "Strategy",
  nominee: "Strategy",
  "power-of-attorney": "Strategy",
  "joint-survivor": "Strategy",
  "digital-estate": "Strategy",
};

export interface GlossaryItem {
  key: TermKey;
  label: string;
  explanation: string;
  formula?: string;
  category: GlossaryCategory;
}

/** All glossary entries as a flat, category-resolved, label-sorted list. */
export function glossaryItems(): GlossaryItem[] {
  return (Object.entries(TERM_GLOSSARY) as [TermKey, GlossaryEntry][])
    .map(([key, e]) => ({
      key,
      label: e.label,
      explanation: e.explanation,
      formula: e.formula,
      category: e.category ?? GLOSSARY_CATEGORY[key],
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Resolve the category for a term key (inline field wins; else the map). */
export function glossaryCategory(key: TermKey): GlossaryCategory {
  return (TERM_GLOSSARY[key] as GlossaryEntry).category ?? GLOSSARY_CATEGORY[key];
}

/**
 * A33.3 — filter the glossary by free-text query (label + explanation) and an
 * optional category. Pure; used by the /glossary index route and the palette.
 */
export function searchGlossary(
  items: GlossaryItem[],
  query: string,
  category: GlossaryCategory | "All" = "All",
): GlossaryItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (category !== "All" && it.category !== category) return false;
    if (!q) return true;
    return (
      it.label.toLowerCase().includes(q) ||
      it.explanation.toLowerCase().includes(q) ||
      it.key.toLowerCase().includes(q)
    );
  });
}

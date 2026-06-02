// Ported from server/lib/tax-config.ts (multi-FY tax engine, slabs + surcharge + cess + marginal relief)
// Demo subset: FY 2024-25 through 2026-27 (current FY by default).

export interface TaxSlabEntry {
  min: number;
  max: number;
  rate: number;
}

export interface SurchargeSlab {
  min: number;
  max: number;
  rate: number;
}

export interface RegimeConfig {
  slabs: TaxSlabEntry[];
  standardDeduction: number;
  rebateLimit: number;
  maxRebate: number;
  marginalRelief: boolean;
  isDefault: boolean;
}

export interface FYTaxConfig {
  financialYear: string;
  assessmentYear: string;
  oldRegime: RegimeConfig;
  newRegime: RegimeConfig;
  surchargeSlabs: SurchargeSlab[];
  surchargeCapNewRegime: number | null;
  cessRate: number;
}

const OLD_REGIME_SLABS: TaxSlabEntry[] = [
  { min: 0, max: 250000, rate: 0 },
  { min: 250000, max: 500000, rate: 0.05 },
  { min: 500000, max: 1000000, rate: 0.2 },
  { min: 1000000, max: Infinity, rate: 0.3 },
];

const OLD_REGIME_BASE: Omit<RegimeConfig, "isDefault"> = {
  slabs: OLD_REGIME_SLABS,
  standardDeduction: 50000,
  rebateLimit: 500000,
  maxRebate: 12500,
  marginalRelief: false,
};

const SURCHARGE_SLABS: SurchargeSlab[] = [
  { min: 5000000, max: 10000000, rate: 0.1 },
  { min: 10000000, max: 20000000, rate: 0.15 },
  { min: 20000000, max: 50000000, rate: 0.25 },
  { min: 50000000, max: Infinity, rate: 0.37 },
];

const TAX_CONFIGS: Record<string, FYTaxConfig> = {
  "2024-25": {
    financialYear: "2024-25",
    assessmentYear: "2025-26",
    oldRegime: { ...OLD_REGIME_BASE, isDefault: false },
    newRegime: {
      slabs: [
        { min: 0, max: 300000, rate: 0 },
        { min: 300000, max: 700000, rate: 0.05 },
        { min: 700000, max: 1000000, rate: 0.1 },
        { min: 1000000, max: 1200000, rate: 0.15 },
        { min: 1200000, max: 1500000, rate: 0.2 },
        { min: 1500000, max: Infinity, rate: 0.3 },
      ],
      standardDeduction: 75000,
      rebateLimit: 700000,
      maxRebate: 25000,
      marginalRelief: false,
      isDefault: true,
    },
    surchargeSlabs: SURCHARGE_SLABS,
    surchargeCapNewRegime: 0.25,
    cessRate: 0.04,
  },
  "2025-26": {
    financialYear: "2025-26",
    assessmentYear: "2026-27",
    oldRegime: { ...OLD_REGIME_BASE, isDefault: false },
    newRegime: {
      slabs: [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 0.05 },
        { min: 800000, max: 1200000, rate: 0.1 },
        { min: 1200000, max: 1600000, rate: 0.15 },
        { min: 1600000, max: 2000000, rate: 0.2 },
        { min: 2000000, max: 2400000, rate: 0.25 },
        { min: 2400000, max: Infinity, rate: 0.3 },
      ],
      standardDeduction: 75000,
      rebateLimit: 1200000,
      maxRebate: Infinity,
      marginalRelief: true,
      isDefault: true,
    },
    surchargeSlabs: SURCHARGE_SLABS,
    surchargeCapNewRegime: 0.25,
    cessRate: 0.04,
  },
  // 2026-27: pre-emptive mirror of 2025-26 (Budget 2026 unknown at build time)
  "2026-27": {
    financialYear: "2026-27",
    assessmentYear: "2027-28",
    oldRegime: { ...OLD_REGIME_BASE, isDefault: false },
    newRegime: {
      slabs: [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 0.05 },
        { min: 800000, max: 1200000, rate: 0.1 },
        { min: 1200000, max: 1600000, rate: 0.15 },
        { min: 1600000, max: 2000000, rate: 0.2 },
        { min: 2000000, max: 2400000, rate: 0.25 },
        { min: 2400000, max: Infinity, rate: 0.3 },
      ],
      standardDeduction: 75000,
      rebateLimit: 1200000,
      maxRebate: Infinity,
      marginalRelief: true,
      isDefault: true,
    },
    surchargeSlabs: SURCHARGE_SLABS,
    surchargeCapNewRegime: 0.25,
    cessRate: 0.04,
  },
};

export const AVAILABLE_FYS = Object.keys(TAX_CONFIGS);
export const DEFAULT_FY = "2026-27";

export function getTaxConfigForFY(fy: string): FYTaxConfig {
  const direct = TAX_CONFIGS[fy];
  if (direct) return direct;
  // gh-issue #6 / ADR-0003: accurate historical-year tax is OUT of scope (FireKaro is a FIRE
  // planner, not a tax-return tracker). But an unconfigured FY must NOT silently receive the
  // NEWEST slabs for an OLD year — fall back to the NEAREST configured FY (least-wrong): the
  // oldest config for past years, the newest for future years.
  const fys = Object.keys(TAX_CONFIGS).sort(); // "YYYY-YY" sorts chronologically
  const oldest = fys[0];
  const newest = fys[fys.length - 1];
  const startYear = parseInt(fy.slice(0, 4), 10);
  const nearest =
    Number.isNaN(startYear) || startYear >= parseInt(oldest.slice(0, 4), 10) ? newest : oldest;
  if (import.meta.env?.DEV && import.meta.env?.MODE !== "test") {
    console.warn(
      `[tax] No tax config for FY ${fy}; using nearest configured FY ${nearest}. ` +
        `Historical/forward tax is approximate — see gh-issue #6.`,
    );
  }
  return TAX_CONFIGS[nearest];
}

export function calculateSlabTax(taxableIncome: number, slabs: TaxSlabEntry[]): number {
  let tax = 0;
  for (const slab of slabs) {
    if (taxableIncome <= slab.min) break;
    const taxableInSlab = Math.min(taxableIncome, slab.max) - slab.min;
    tax += taxableInSlab * slab.rate;
  }
  return Math.round(tax);
}

/**
 * OLD-regime basic exemption rises with the taxpayer's age (Indian law, gh-issue #6):
 * ₹2.5L below 60, ₹3L for a senior (60–79), ₹5L for a super-senior (80+). The 0% bracket
 * top is raised to the exemption and any lower taxable band is absorbed into it (so a
 * super-senior loses the 5% ₹2.5–5L band entirely). The NEW regime is age-agnostic — do
 * NOT call this for it. `age` undefined / below 60 returns the slabs unchanged.
 * Assumes `slabs` begins with a single 0% bracket whose `max` ≤ the senior exemption
 * (true for every OLD-regime config here).
 */
export function oldRegimeSlabsForAge(slabs: TaxSlabEntry[], age?: number): TaxSlabEntry[] {
  const exemption = age != null && age >= 80 ? 500000 : age != null && age >= 60 ? 300000 : 250000;
  if (exemption === 250000) return slabs;
  const adjusted: TaxSlabEntry[] = [{ min: 0, max: exemption, rate: 0 }];
  for (const slab of slabs) {
    if (slab.max <= exemption) continue; // fully absorbed by the higher exemption
    adjusted.push({ min: Math.max(slab.min, exemption), max: slab.max, rate: slab.rate });
  }
  return adjusted;
}

/**
 * Top marginal slab rate (decimal) the taxable income reaches, read off the
 * regime's slab table. Used by the EPF/VPF after-tax-yield drag (A15.3) to tax
 * excess-interest at the household's top applicable rate — NOT an invented rate.
 * Surcharge/cess are deliberately excluded: the EPF excess-interest rule taxes
 * at the slab rate, and surcharge only bites above ₹50L taxable (a separate edge).
 */
export function marginalSlabRate(taxableIncome: number, slabs: TaxSlabEntry[]): number {
  let rate = 0;
  for (const slab of slabs) {
    if (taxableIncome > slab.min) rate = slab.rate;
    else break;
  }
  return rate;
}

export function calculateSurcharge(
  tax: number,
  taxableIncome: number,
  slabs: SurchargeSlab[],
  cap: number | null,
  // Income-tax slabs for the same regime. When provided, surcharge marginal
  // relief is applied (gh #1). Optional for backward-compatibility with any
  // caller that only needs the raw band surcharge.
  incomeSlabs?: TaxSlabEntry[],
): number {
  if (taxableIncome <= 5000000) return 0;
  let rate = 0;
  let bandMin = 0;
  let prevRate = 0; // surcharge rate applicable AT the band's lower threshold
  for (let i = 0; i < slabs.length; i++) {
    const slab = slabs[i];
    if (taxableIncome > slab.min && taxableIncome <= slab.max) {
      rate = slab.rate;
      bandMin = slab.min;
      prevRate = i > 0 ? slabs[i - 1].rate : 0;
      break;
    }
  }
  if (rate === 0) {
    const lastIdx = slabs.length - 1;
    const last = slabs[lastIdx];
    if (taxableIncome > last.min) {
      rate = last.rate;
      bandMin = last.min;
      prevRate = lastIdx > 0 ? slabs[lastIdx - 1].rate : 0;
    }
  }
  if (cap !== null && rate > cap) rate = cap;
  if (cap !== null && prevRate > cap) prevRate = cap;
  let surcharge = Math.round(tax * rate);

  // Marginal relief on surcharge (Indian law): for income just above a
  // threshold, total (tax + surcharge) must not exceed the total at the
  // threshold (taxed at the previous band's surcharge rate) plus the income
  // above the threshold. Without this, crossing ₹50L/₹1Cr/₹2Cr/₹5Cr by ₹1
  // over-taxes by the full surcharge.
  if (incomeSlabs && rate > 0 && bandMin > 0) {
    const taxAtThreshold = calculateSlabTax(bandMin, incomeSlabs);
    const totalAtThreshold = taxAtThreshold * (1 + prevRate);
    const allowedMaxTotal = totalAtThreshold + (taxableIncome - bandMin);
    if (tax + surcharge > allowedMaxTotal) {
      surcharge = Math.max(0, Math.round(allowedMaxTotal - tax));
    }
  }
  return surcharge;
}

export interface FullTaxResult {
  grossIncome: number;
  standardDeduction: number;
  estimatedDeductions: number;
  taxableIncome: number;
  slabTax: number;
  rebate: number;
  taxAfterRebate: number;
  surcharge: number;
  cess: number;
  totalTax: number;
  effectiveRate: number;
}

export interface ComputeTaxArgs {
  grossIncome: number;
  regime: "OLD" | "NEW";
  fy: string;
  // Pre-computed deductions (auto-resolved in demo: EPF + PPF + ELSS + life premium + 80D).
  // OLD regime only — the new regime ignores these.
  deductions?: number;
  // Sec 80CCD(2) employer-NPS contribution. Unlike `deductions`, this is allowed under
  // BOTH regimes, so it is a separate input and is subtracted in both. Pass it separately
  // (it is NOT inside `deductions`) to avoid double-counting in the old regime. gh-issue #2.
  employerNps?: number;
  // Member basic salary (Basic+DA) used to cap 80CCD(2) at the statutory ceiling
  // (10% basic OLD / 14% basic NEW). When omitted, `employerNps` is used uncapped
  // (we do not fabricate basic from CTC). gh-issue #3.
  employerNpsBasic?: number;
  // Per-member {nps, basic} pairs for the 80CCD(2) cap. When provided, each member's employer
  // NPS is capped at the regime ceiling of THEIR OWN basic and summed — an over-contributor
  // cannot borrow an under-contributor's headroom (more correct than the aggregate `employerNps`
  // + `employerNpsBasic` scalars for a multi-earner household). gh-issue #4.
  employerNpsByMember?: { nps: number; basic: number }[];
  isSalaried?: boolean;
  // Taxpayer's age in years (caller-resolved — FireKaro anchors it to the earner's current
  // age, consistent with the forward projection's age basis; historical-FY accuracy is out of
  // scope per ADR-0003). OLD regime only: raises the basic exemption to ₹3L at 60+ (senior) /
  // ₹5L at 80+ (super-senior). Omitted/<60 ⇒ standard ₹2.5L. NEW regime ignores it. gh-issue #6.
  taxpayerAge?: number;
}

export function computeTax(args: ComputeTaxArgs): FullTaxResult {
  const { grossIncome, regime, fy, isSalaried = true } = args;
  const config = getTaxConfigForFY(fy);
  const regimeConfig = regime === "NEW" ? config.newRegime : config.oldRegime;

  // Standard deduction applies only to salaried income (we treat all demo income as salaried-like
  // for the simplified UI; per D17 the user never sees this knob).
  const sd = isSalaried ? regimeConfig.standardDeduction : 0;

  // Old regime allows chapter VI-A; New regime ignores them — EXCEPT 80CCD(2) employer
  // NPS, which is deductible under both regimes and is passed separately (gh-issue #2).
  const ded = regime === "OLD" ? Math.max(0, args.deductions ?? 0) : 0;
  // 80CCD(2): cap the employer-NPS deduction at the statutory ceiling — 14% of basic in
  // the NEW regime, 10% in the OLD — when a basic salary is supplied. Absent a basic we
  // trust the entered figure rather than fabricate basic from CTC (gh-issue #3).
  // TODO(gh-issue #4): central/state GOVERNMENT employees get 14% under the OLD regime too;
  // we under-cap them here (conservative — never over-deducts). Needs an employer-sector
  // field on Member to branch on.
  const npsCeiling = regime === "NEW" ? 0.14 : 0.1;
  let employerNps: number;
  if (args.employerNpsByMember && args.employerNpsByMember.length > 0) {
    // Per-member cap (gh-issue #4): cap each member's employer NPS at the ceiling of their OWN
    // basic, then sum — no cross-member headroom borrowing.
    employerNps = args.employerNpsByMember.reduce((sum, m) => {
      const nps = Math.max(0, m.nps);
      const basic = Math.max(0, m.basic);
      return sum + (basic > 0 ? Math.min(nps, npsCeiling * basic) : nps);
    }, 0);
  } else {
    // Aggregate fallback (single earner, or callers that pass scalars).
    const rawEmployerNps = Math.max(0, args.employerNps ?? 0);
    const basicForCap = Math.max(0, args.employerNpsBasic ?? 0);
    employerNps = basicForCap > 0 ? Math.min(rawEmployerNps, npsCeiling * basicForCap) : rawEmployerNps;
  }

  const taxableIncome = Math.max(0, grossIncome - sd - ded - employerNps);

  // OLD regime: apply the age-based basic-exemption variant (senior ₹3L / super-senior ₹5L).
  // NEW regime is age-agnostic, so its slabs pass through unchanged. gh-issue #6.
  const effectiveSlabs =
    regime === "OLD" ? oldRegimeSlabsForAge(regimeConfig.slabs, args.taxpayerAge) : regimeConfig.slabs;
  const slabTax = calculateSlabTax(taxableIncome, effectiveSlabs);

  let rebate = 0;
  if (taxableIncome <= regimeConfig.rebateLimit) {
    if (regimeConfig.maxRebate === Infinity) rebate = slabTax;
    else rebate = Math.min(slabTax, regimeConfig.maxRebate);
  } else if (regimeConfig.marginalRelief && taxableIncome > regimeConfig.rebateLimit) {
    const above = taxableIncome - regimeConfig.rebateLimit;
    if (slabTax > above) rebate = slabTax - above;
  }
  const taxAfterRebate = Math.max(0, slabTax - rebate);

  const surcharge = calculateSurcharge(
    taxAfterRebate,
    taxableIncome,
    config.surchargeSlabs,
    regime === "NEW" ? config.surchargeCapNewRegime : null,
    effectiveSlabs,
  );
  const cess = Math.round((taxAfterRebate + surcharge) * config.cessRate);
  const totalTax = taxAfterRebate + surcharge + cess;
  const effectiveRate = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0;

  return {
    grossIncome: Math.round(grossIncome),
    standardDeduction: sd,
    estimatedDeductions: ded,
    taxableIncome: Math.round(taxableIncome),
    slabTax,
    rebate,
    taxAfterRebate,
    surcharge,
    cess,
    totalTax,
    effectiveRate: Math.round(effectiveRate * 100) / 100,
  };
}

export function recommendRegime(args: Omit<ComputeTaxArgs, "regime">): {
  recommended: "OLD" | "NEW";
  oldTax: number;
  newTax: number;
  savings: number;
} {
  const oldR = computeTax({ ...args, regime: "OLD" });
  const newR = computeTax({ ...args, regime: "NEW" });
  const recommended = oldR.totalTax <= newR.totalTax ? "OLD" : "NEW";
  return {
    recommended,
    oldTax: oldR.totalTax,
    newTax: newR.totalTax,
    savings: Math.abs(oldR.totalTax - newR.totalTax),
  };
}

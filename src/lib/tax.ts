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
  return TAX_CONFIGS[fy] ?? TAX_CONFIGS[DEFAULT_FY];
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
): number {
  if (taxableIncome <= 5000000) return 0;
  let rate = 0;
  for (const slab of slabs) {
    if (taxableIncome > slab.min && taxableIncome <= slab.max) {
      rate = slab.rate;
      break;
    }
  }
  if (rate === 0) {
    const last = slabs[slabs.length - 1];
    if (taxableIncome > last.min) rate = last.rate;
  }
  if (cap !== null && rate > cap) rate = cap;
  return Math.round(tax * rate);
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
  // Pre-computed deductions (auto-resolved in demo: EPF + PPF + ELSS + life premium + 80D)
  deductions?: number;
  isSalaried?: boolean;
}

export function computeTax(args: ComputeTaxArgs): FullTaxResult {
  const { grossIncome, regime, fy, isSalaried = true } = args;
  const config = getTaxConfigForFY(fy);
  const regimeConfig = regime === "NEW" ? config.newRegime : config.oldRegime;

  // Standard deduction applies only to salaried income (we treat all demo income as salaried-like
  // for the simplified UI; per D17 the user never sees this knob).
  const sd = isSalaried ? regimeConfig.standardDeduction : 0;

  // Old regime allows chapter VI-A; New regime ignores them (except 80CCD(2) employer NPS — not modeled).
  const ded = regime === "OLD" ? Math.max(0, args.deductions ?? 0) : 0;

  const taxableIncome = Math.max(0, grossIncome - sd - ded);

  const slabTax = calculateSlabTax(taxableIncome, regimeConfig.slabs);

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

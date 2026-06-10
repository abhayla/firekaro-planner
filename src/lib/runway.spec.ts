/**
 * #140 — Job-loss / layoff runway. Substance proofs (the honest/conservative direction):
 *  - Runway DECREASES when the numerator is POST-TAX net vs gross market value (selling
 *    equity/crypto to live on triggers real tax — ignoring it overstates the runway).
 *  - Runway DECREASES when burn includes EMIs + insurance premiums vs expenses-only
 *    (those obligations DON'T stop at a layoff — omitting them is optimistic).
 *  - The conservative (FD-only) line is never larger than the headline liquid line.
 *  - EPF is excluded from the day-1 runway and surfaced as a separate later line.
 *  - A debt-heavy household (higher fixed burn) has a materially shorter runway.
 */
import { describe, it, expect } from "vitest";
import { computeRunway } from "@/lib/runway";
import type { Investment } from "@/types/household";

let _id = 0;
function inv(type: Investment["type"], value: number): Investment {
  return { id: `i${_id++}`, type, value, ownerId: "self" } as Investment;
}

// A mixed liquid portfolio: FD (stable, tax-free principal), Stocks (equity-LTCG), Crypto (30% VDA),
// EPF (locked, tax-free, NOT day-1), RealEstate (illiquid — excluded entirely).
const PORTFOLIO: Investment[] = [
  inv("FD", 300_000),
  inv("Stocks", 1_000_000),
  inv("Crypto", 500_000),
  inv("EPF_VPF", 800_000),
  inv("RealEstate", 5_000_000),
];

const GROSS_LIQUID = 300_000 + 1_000_000 + 500_000; // FD + Stocks + Crypto (RealEstate/EPF not liquid)

describe("#140 computeRunway — post-tax-net liquidity & full-obligation burn", () => {
  it("numerator is POST-TAX net, strictly below gross liquid market value (honest haircut)", () => {
    const r = computeRunway({ investments: PORTFOLIO, monthlyBurn: 100_000, marginalRate: 0.3 });
    // selling equity (12.5% LTCG over ₹1.25L) + crypto (30% VDA) owes real tax → net < gross.
    expect(r.liquidNet).toBeLessThan(GROSS_LIQUID);
    expect(r.liquidNet).toBeGreaterThan(0);
    // and the runway computed on net is below the naive gross runway — the honest direction.
    const grossRunway = GROSS_LIQUID / 100_000;
    expect(r.runwayMonths).toBeLessThan(grossRunway);
  });

  it("runway DECREASES when burn includes EMIs/premiums vs expenses-only (obligations don't stop)", () => {
    const expensesOnly = computeRunway({ investments: PORTFOLIO, monthlyBurn: 80_000, marginalRate: 0.3 });
    const fullObligation = computeRunway({ investments: PORTFOLIO, monthlyBurn: 130_000, marginalRate: 0.3 }); // + EMI + premium
    expect(fullObligation.runwayMonths).toBeLessThan(expensesOnly.runwayMonths);
  });

  it("the conservative (FD-only) line is never larger than the headline liquid line", () => {
    const r = computeRunway({ investments: PORTFOLIO, monthlyBurn: 100_000, marginalRate: 0.3 });
    expect(r.liquidNetConservative).toBeLessThanOrEqual(r.liquidNet);
    expect(r.runwayMonthsConservative).toBeLessThanOrEqual(r.runwayMonths);
    // FD is tax-free principal → conservative == the FD value exactly.
    expect(r.liquidNetConservative).toBe(300_000);
  });

  it("EPF is excluded from day-1 runway but adds a strictly-larger with-EPF line", () => {
    const r = computeRunway({ investments: PORTFOLIO, monthlyBurn: 100_000, marginalRate: 0.3 });
    expect(r.epfValue).toBe(800_000); // EPF is exit-tax-free → net == value
    expect(r.runwayMonthsWithEpf).toBeGreaterThan(r.runwayMonths);
    // day-1 runway must NOT silently include EPF.
    expect(r.runwayMonths).toBeCloseTo(r.liquidNet / 100_000, 5);
  });

  it("surfaces the market-linked share of liquid net as a fraction 0..1", () => {
    const r = computeRunway({ investments: PORTFOLIO, monthlyBurn: 100_000, marginalRate: 0.3 });
    expect(r.volatilePortion).toBeGreaterThan(0); // Stocks + Crypto present
    expect(r.volatilePortion).toBeLessThanOrEqual(1);
    // FD-only portfolio has zero volatile share.
    const fdOnly = computeRunway({ investments: [inv("FD", 500_000)], monthlyBurn: 50_000, marginalRate: 0.3 });
    expect(fdOnly.volatilePortion).toBe(0);
  });

  it("counts equity MUTUAL FUNDS / International / REIT as market-linked (FinTech HIGH — no SIP-accumulator undercount)", () => {
    // The typical salaried accumulator holds equity via MFs/SIPs, not direct stocks. A portfolio of
    // MF + International + REIT (zero direct Stocks) MUST report a HIGH volatile share — reporting ~0%
    // would optimistically hide market risk in a safety feature.
    const sipHousehold = computeRunway({
      investments: [inv("MutualFunds", 2_000_000), inv("International", 500_000), inv("REIT", 300_000), inv("FD", 200_000)],
      monthlyBurn: 100_000,
      marginalRate: 0.3,
    });
    // MF+Intl+REIT are ~93% of gross liquid → after-tax share must be clearly market-linked-dominant.
    expect(sipHousehold.volatilePortion).toBeGreaterThan(0.8);
  });

  it("counts only the VESTED ESOP slice, never the full grant (mirrors the #15 bridge contract)", () => {
    const withUnvested = computeRunway({
      investments: [{ id: "e", type: "ESOP", value: 2_000_000, vestedValueINR: 800_000, ownerId: "self" } as Investment],
      monthlyBurn: 100_000,
      marginalRate: 0.3,
    });
    // Only the ₹8L vested slice can fund a layoff (unvested grant is forfeited on exit) — net ≈ vested,
    // never the ₹20L full grant. Equity-LTCG tax may shave a little off the 8L gross.
    expect(withUnvested.liquidNet).toBeLessThanOrEqual(800_000);
    expect(withUnvested.liquidNet).toBeGreaterThan(700_000);
  });

  it("a debt-heavy household (higher fixed burn) has a materially shorter runway", () => {
    const debtFree = computeRunway({ investments: PORTFOLIO, monthlyBurn: 70_000, marginalRate: 0.3 });
    const debtHeavy = computeRunway({ investments: PORTFOLIO, monthlyBurn: 140_000, marginalRate: 0.3 }); // big EMI load
    expect(debtHeavy.runwayMonths).toBeLessThan(debtFree.runwayMonths * 0.6);
  });

  it("guards a zero/non-finite burn (no Infinity months reaching a user)", () => {
    const r = computeRunway({ investments: PORTFOLIO, monthlyBurn: 0, marginalRate: 0.3 });
    expect(Number.isFinite(r.runwayMonths)).toBe(true);
    expect(r.runwayMonths).toBe(0);
  });

  it("an empty portfolio yields a zero, finite runway (three-state safe)", () => {
    const r = computeRunway({ investments: [], monthlyBurn: 100_000, marginalRate: 0.3 });
    expect(r.liquidNet).toBe(0);
    expect(r.runwayMonths).toBe(0);
    expect(r.volatilePortion).toBe(0);
  });
});

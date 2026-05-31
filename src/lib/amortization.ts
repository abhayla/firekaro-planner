// Loan amortization helpers — derives end-year from outstanding balance + EMI + interest rate.

export function monthsRemaining(
  outstandingBalance: number,
  monthlyEMI: number,
  annualRatePercent: number,
): number {
  if (monthlyEMI <= 0 || outstandingBalance <= 0) return 0;
  const r = annualRatePercent / 12 / 100;
  if (r === 0) return Math.ceil(outstandingBalance / monthlyEMI);
  if (monthlyEMI <= outstandingBalance * r) return Infinity;
  // n = ln(EMI / (EMI - r*P)) / ln(1+r)
  const n = Math.log(monthlyEMI / (monthlyEMI - r * outstandingBalance)) / Math.log(1 + r);
  return Math.ceil(n);
}

export function derivedEndYear(
  outstandingBalance: number,
  monthlyEMI: number,
  annualRatePercent: number,
  startYear: number = new Date().getFullYear(),
  startMonth: number = new Date().getMonth() + 1,
): number | null {
  const n = monthsRemaining(outstandingBalance, monthlyEMI, annualRatePercent);
  if (!Number.isFinite(n)) return null;
  const endMonth = startMonth + n;
  const endYear = startYear + Math.floor((endMonth - 1) / 12);
  return endYear;
}

export interface AmortStep {
  monthIndex: number;
  interest: number;
  principal: number;
  balance: number;
}

export function amortize(
  outstandingBalance: number,
  monthlyEMI: number,
  annualRatePercent: number,
  maxMonths = 600,
): AmortStep[] {
  const steps: AmortStep[] = [];
  const r = annualRatePercent / 12 / 100;
  let balance = outstandingBalance;
  for (let i = 1; i <= maxMonths && balance > 0; i++) {
    const interest = Math.max(0, balance * r);
    const principal = Math.max(0, monthlyEMI - interest);
    balance = Math.max(0, balance - principal);
    steps.push({ monthIndex: i, interest, principal, balance });
    if (monthlyEMI <= interest) break; // can never amortize
  }
  return steps;
}

/** Returns annual home-loan interest paid in this calendar year (used for Section 24 in tax math). */
export function annualInterestForYear(
  outstandingBalance: number,
  monthlyEMI: number,
  annualRatePercent: number,
  yearsFromNow = 0,
): number {
  const startMonth = yearsFromNow * 12;
  const endMonth = startMonth + 12;
  const steps = amortize(outstandingBalance, monthlyEMI, annualRatePercent, endMonth);
  return Math.round(
    steps.slice(startMonth, endMonth).reduce((sum, s) => sum + s.interest, 0),
  );
}

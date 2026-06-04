// The Maurya Family — single-income mid-40s accumulator with a homemaker spouse.
// A real-shape persona (Abhay/Madhu/Myra) requested for the sample switcher: one
// salaried earner (~₹42L CTC) + a spouse who left the corporate workforce in 2023
// (her 18-year EPF + investments live on), one school-age child, a full-spread
// portfolio that exercises ALL 12 investment types, a side Pvt-Ltd entity, two
// loans, and the family-layer education/marriage goals. Owns its primary home in
// Pune + a second let-out flat. Target retire age 50 is an ASPIRATION — the honest
// derived FIRE age lands in the mid-60s (~23 yrs out): one ₹42L income supporting a
// homemaker spouse + child + parents, carrying ₹1.6Cr of education/wedding goals on
// top of the retirement corpus, genuinely can't FIRE at 50 — and the planner says so
// (objective 1: tell the truth, not a flattering number).
import type { useHouseholdStore } from "@/stores/household";
import type { useAssumptionsStore } from "@/stores/assumptions";
import { derivedEndYear } from "@/lib/amortization";

type HStore = ReturnType<typeof useHouseholdStore>;
type AStore = ReturnType<typeof useAssumptionsStore>;

export function loadMauryasSeed(household: HStore, assumptions: AStore) {
  household.resetAll();
  assumptions.reset();

  household.setHouseholdName("The Maurya Family");
  household.setSetupMode("Couple+Children");

  // ----- Members (explicit DOBs — a real-shape persona, not age-derived) -----
  const abhay = household.addMember({
    id: "abhay",
    name: "Abhay Maurya",
    dateOfBirth: "1981-12-28",
    role: "EARNER",
    targetRetirementAge: 50, // aspiration — the headline FIRE age is derived, not this (see derive.ts)
    planToAge: 90,
    // Hike is a blended long-run average (good-year-8 / lean-year-5 / no-hike-0
    // years average out) — the model carries one forward rate, not a per-year sequence.
    salary: {
      annualCTC: 4200000,
      hikePercent: 5,
      employerNpsAnnual: 120000, // corporate-NPS 80CCD(2) line (deductible in both regimes)
      basicAnnual: 1680000, // 40% of CTC — caps the 80CCD(2) deduction
      employerSector: "private",
    },
    city: "Metro", // Wakad, Pune
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
    employmentStatus: "Employed",
  });
  const madhu = household.addMember({
    id: "madhu",
    name: "Madhu Kushwaha",
    dateOfBirth: "1981-04-15",
    role: "DEPENDENT", // left the corporate workforce in 2023 — homemaker, no current income
    relation: "Spouse",
    planToAge: 92,
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
  });
  household.addMember({
    id: "myra",
    name: "Myra Maurya",
    dateOfBirth: "2014-09-01",
    role: "DEPENDENT",
    relation: "Child",
    city: "Metro",
    health: "Healthy",
    educationStage: "Secondary", // 7th standard
    riskAppetite: "Conservative",
    marital: "Single",
  });

  // ----- EPF/VPF (type 1 of 12) -----
  // Auto-flow creates Abhay's EPF line (12%+12% of basic); then set the accrued balance.
  household.autoFlowSalaryToEPF();
  const abhayEPF = household.data.investments.find(
    (i) => i.type === "EPF_VPF" && i.ownerId === "abhay",
  );
  if (abhayEPF) abhayEPF.value = 4500000; // ~22 yrs (Infosys 2003-2018 + Cognizant 2018→)
  // Madhu's EPF is frozen — 18 corporate years (Wipro 3 + Accenture 10 + Infosys 5, till 2023),
  // no ongoing contribution. Added manually (no salary ⇒ auto-flow skips her).
  household.addInvestment({
    type: "EPF_VPF",
    label: "EPF (frozen — corporate years)",
    value: 3000000,
    monthlyContribution: 0,
    ownerId: "madhu",
  });

  // ----- The other 11 investment types -----
  // SIP amounts sized so total household contributions (incl. the ₹33.6k EPF
  // auto-flow) stay within the single-income surplus — the #12 invariant: a
  // household cannot invest more than it saves.
  household.addInvestment({
    type: "Stocks",
    label: "Direct equity portfolio",
    value: 2500000,
    monthlyContribution: 20000,
    ownerId: "abhay",
    holdingsCount: 25,
  });
  household.addInvestment({
    type: "MutualFunds",
    label: "Mutual fund SIPs (multi-cap)",
    value: 6000000,
    monthlyContribution: 25000,
    ownerId: "abhay",
  });
  household.addInvestment({
    type: "MutualFunds",
    label: "Madhu's mutual funds (corporate years)",
    value: 3500000,
    monthlyContribution: 0,
    ownerId: "madhu",
  });
  household.addInvestment({
    type: "PPF",
    label: "PPF account",
    value: 2500000,
    monthlyContribution: 12500,
    ownerId: "abhay",
  });
  household.addInvestment({
    type: "PPF",
    label: "PPF account",
    value: 1800000,
    monthlyContribution: 12500,
    ownerId: "madhu",
  });
  household.addInvestment({
    type: "NPS",
    label: "NPS Tier-I",
    value: 1200000,
    monthlyContribution: 10000,
    ownerId: "abhay",
    npsTier: "I",
  });
  household.addInvestment({
    type: "RealEstate",
    label: "3BHK Wakad, Pune",
    value: 13000000,
    ownerId: "Joint",
    realEstateRole: "PrimaryResidence",
    city: "Metro",
  });
  household.addInvestment({
    type: "RealEstate",
    label: "2BHK (let out)",
    value: 6000000,
    ownerId: "Joint",
    realEstateRole: "Investment",
    city: "Metro",
  });
  household.addInvestment({
    type: "Gold",
    label: "Family gold + SGB",
    value: 1500000,
    ownerId: "Joint",
    subtype: "Physical",
  });
  household.addInvestment({
    type: "FD",
    label: "Emergency fund FD",
    value: 1000000,
    ownerId: "Joint",
  });
  household.addInvestment({
    type: "Crypto",
    label: "Crypto (BTC/ETH)",
    value: 200000,
    ownerId: "abhay",
    coin: "BTC/ETH",
  });
  household.addInvestment({
    type: "ESOP",
    label: "Cognizant RSUs",
    value: Math.round((2000000 * 60) / 100), // 60% vested of ₹20L
    ownerId: "abhay",
    totalGrantValue: 2000000,
    vestedPercent: 60,
    grantorCountry: "US",
  });
  household.addInvestment({
    type: "International",
    label: "US index FoF (LRS)",
    value: 800000,
    ownerId: "abhay",
    internationalRoute: "FoF",
  });
  household.addInvestment({
    type: "REIT",
    label: "Listed REIT",
    value: 300000,
    ownerId: "abhay",
  });

  // ----- Side entity + other income -----
  const pifs = household.addBusiness({
    name: "PIFS Pvt Ltd",
    legalKind: "PvtLtd",
    annualProfit: 500000,
    frequency: "A",
    sharePercent: 100,
    ownerId: "abhay",
    isOperated: true,
  });
  household.addOtherIncome({
    type: "Rental",
    source: "Direct",
    label: "Let-out flat rental",
    amount: 18000,
    frequency: "M",
    ownerId: "Joint",
    isTaxExempt: false,
  });
  household.addOtherIncome({
    type: "Dividend",
    source: pifs.id,
    sourceEntityId: pifs.id,
    label: "PIFS Pvt Ltd dividend",
    amount: 50000,
    frequency: "A",
    ownerId: "abhay",
    isTaxExempt: false, // Pvt Ltd dividend taxed at slab post-DDT abolition
  });
  household.addOtherIncome({
    type: "Interest",
    source: "Direct",
    label: "Savings + FD interest",
    amount: 40000,
    frequency: "A",
    ownerId: "Joint",
    isTaxExempt: false,
  });

  // ----- Expenses (avg discretionary EXCLUDES rent/EMI/insurance/SIPs) -----
  household.setAvgMonthly(85000);
  household.addRecurring({
    label: "Society maintenance",
    amount: 7000,
    frequency: "M",
    source: "manual",
  });
  household.addRecurring({
    label: "Property tax",
    amount: 25000,
    frequency: "A",
    source: "manual",
  });
  // Sandwich-gen parents support → healthcare inflation bucket (grows at the 14% medical rate).
  household.addRecurring({
    label: "Parents support (Abhay's parents)",
    amount: 25000,
    frequency: "M",
    source: "manual",
    kind: "parents",
    inflationBucket: "healthcare",
  });
  household.addRecurring({
    label: "Myra's school fees",
    amount: 15000,
    frequency: "M",
    source: "manual",
    inflationBucket: "education",
  });

  // ----- Family-layer goals -----
  household.addPlannedFuture({
    label: "Myra's higher education",
    todayAmount: 12000000,
    targetYear: 2032, // Myra ~18
    isMultiYear: true,
    durationYears: 4,
    kind: "education",
    inflationBucket: "education",
  });
  household.addPlannedFuture({
    label: "Myra's wedding",
    todayAmount: 4000000,
    targetYear: 2040,
    isMultiYear: false,
    kind: "marriage",
  });
  household.addPlannedFuture({
    label: "Car replacement",
    todayAmount: 1500000,
    targetYear: 2029,
    isMultiYear: false,
  });
  household.addPlannedFuture({
    label: "Foreign vacation",
    todayAmount: 400000,
    targetYear: 2027,
    isMultiYear: false,
  });

  // ----- Liabilities -----
  const homeBalance = 3500000;
  const homeEMI = 45000;
  const homeRate = 8.5;
  household.addLiability({
    name: "SBI Home Loan",
    type: "HomeLoan",
    outstandingBalance: homeBalance,
    monthlyEMI: homeEMI,
    interestRate: homeRate,
    ownerId: "abhay",
    isSharedWithSpouse: true,
    derivedEndYear: derivedEndYear(homeBalance, homeEMI, homeRate) ?? undefined,
  });
  const carBalance = 600000;
  const carEMI = 18000;
  const carRate = 9.5;
  household.addLiability({
    name: "Car Loan",
    type: "CarLoan",
    outstandingBalance: carBalance,
    monthlyEMI: carEMI,
    interestRate: carRate,
    ownerId: "abhay",
    isSharedWithSpouse: false,
    derivedEndYear: derivedEndYear(carBalance, carEMI, carRate) ?? undefined,
  });

  // ----- Insurance -----
  household.addInsurance({
    type: "Health",
    provider: "Family floater",
    sumAssured: 1500000,
    annualPremium: 35000,
    insuredPersonId: "abhay",
  });
  household.addInsurance({
    type: "Life",
    provider: "HDFC Click2Protect (term)",
    sumAssured: 30000000,
    annualPremium: 25000,
    insuredPersonId: "abhay",
  });
  // Token term on the homemaker spouse — intentionally trips the "cover for a
  // non-earner is uncommon" adequacy advisory (a live demo of that chip).
  household.addInsurance({
    type: "Life",
    provider: "LIC term",
    sumAssured: 5000000,
    annualPremium: 8000,
    insuredPersonId: "madhu",
  });
  household.addInsurance({
    type: "Vehicle",
    provider: "HDFC Ergo Comprehensive",
    sumAssured: 800000,
    annualPremium: 18000,
    insuredPersonId: "abhay",
  });

  household.markProfileComplete();
  household.markWizardComplete();

  void abhay;
  void madhu;
}

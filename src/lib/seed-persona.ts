// Indian techie household persona for "Explore with sample data" (D20a).
// Tuned so Lean FIRE is comfortably crossed and Regular FIRE is approached in ~17 years.
import type { useHouseholdStore } from "@/stores/household";
import type { useAssumptionsStore } from "@/stores/assumptions";
import { genId } from "@/lib/id";
import { derivedEndYear } from "@/lib/amortization";
import { dobFromAge } from "@/lib/age";

type HStore = ReturnType<typeof useHouseholdStore>;
type AStore = ReturnType<typeof useAssumptionsStore>;

export function loadSeedPersona(household: HStore, assumptions: AStore) {
  // Reset to clean state then build the persona via store methods so auto-flow runs.
  household.resetAll();
  assumptions.reset();

  household.setHouseholdName("The Sharma Family");
  household.setSetupMode("Couple+Children");

  const rohit = household.addMember({
    id: "rohit",
    name: "Rohit",
    dateOfBirth: dobFromAge(30),
    role: "EARNER",
    targetRetirementAge: 47,
    salary: { annualCTC: 2500000, hikePercent: 9 },
    // Q2.1 — Indian techie persona defaults
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
    employmentStatus: "Employed",
  });
  const priya = household.addMember({
    id: "priya",
    name: "Priya",
    dateOfBirth: dobFromAge(29),
    role: "EARNER",
    targetRetirementAge: 50,
    salary: { annualCTC: 1800000, hikePercent: 8 },
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
    employmentStatus: "Employed",
  });
  household.addMember({
    id: "aarav",
    name: "Aarav",
    dateOfBirth: dobFromAge(4),
    role: "DEPENDENT",
    relation: "Child",
    city: "Metro",
    health: "Healthy",
    educationStage: "Preschool",
    riskAppetite: "Conservative",
    marital: "Single",
  });
  household.addMember({
    id: "meera",
    name: "Meera",
    dateOfBirth: dobFromAge(2),
    role: "DEPENDENT",
    relation: "Child",
    city: "Metro",
    health: "Healthy",
    educationStage: "Preschool",
    riskAppetite: "Conservative",
    marital: "Single",
  });

  // Investments (per seed in goal §4 Stage 9). Run auto-flow first so EPF lines exist;
  // then enrich values + add other instruments.
  household.autoFlowSalaryToEPF();
  // EPF balances
  const abhayEPF = household.data.investments.find(
    (i) => i.type === "EPF_VPF" && i.ownerId === "rohit",
  );
  if (abhayEPF) abhayEPF.value = 1500000;
  const priyaEPF = household.data.investments.find(
    (i) => i.type === "EPF_VPF" && i.ownerId === "priya",
  );
  if (priyaEPF) priyaEPF.value = 900000;

  household.addInvestment({
    type: "Stocks",
    label: "My equity portfolio",
    value: 1200000,
    monthlyContribution: 20000,
    ownerId: "rohit",
    holdingsCount: 18,
  });
  household.addInvestment({
    type: "MutualFunds",
    label: "SIP basket",
    value: 800000,
    monthlyContribution: 30000,
    ownerId: "rohit",
  });
  household.addInvestment({
    type: "PPF",
    label: "PPF account",
    value: 600000,
    monthlyContribution: 12500,
    ownerId: "rohit",
  });
  household.addInvestment({
    type: "RealEstate",
    label: "2BHK Whitefield Bengaluru",
    value: 9500000,
    ownerId: "Joint",
    realEstateRole: "PrimaryResidence",
  });
  household.addInvestment({
    type: "Gold",
    label: "Family gold",
    value: 400000,
    ownerId: "Joint",
  });
  household.addInvestment({
    type: "FD",
    label: "Emergency fund FD",
    value: 500000,
    ownerId: "Joint",
  });
  // Q19C — NPS for Abhay
  household.addInvestment({
    type: "NPS",
    label: "NPS Tier-I",
    value: 400000,
    monthlyContribution: 5000,
    ownerId: "rohit",
  });
  // Q19C — ESOP grant for Abhay (Q20B mid-fidelity: total + vested%)
  household.addInvestment({
    type: "ESOP",
    label: "Company ESOPs",
    value: Math.round((2500000 * 60) / 100), // derived: 60% vested of ₹25L
    ownerId: "rohit",
    totalGrantValue: 2500000,
    vestedPercent: 60,
  });

  // Q3 (v3) — unified entity store: Sharma Consulting is a single Business record. The
  // "side consulting" income flows through it; we no longer keep a separate ownerEntities row.
  const sharmaConsulting = household.addBusiness({
    name: "Sharma Consulting",
    legalKind: "PvtLtd",
    annualProfit: 600000,
    frequency: "A",
    sharePercent: 100,
    ownerId: "rohit",
    isOperated: true,
  });

  // Q19C — Other income (3 entries): rental + Pvt Ltd dividend + savings interest
  household.addOtherIncome({
    type: "Rental",
    source: "Direct",
    label: "1BHK rental",
    amount: 15000,
    frequency: "M",
    ownerId: "Joint",
    isTaxExempt: false,
  });
  household.addOtherIncome({
    type: "Dividend",
    source: sharmaConsulting.id,
    sourceEntityId: sharmaConsulting.id,
    label: "Pvt Ltd dividend",
    amount: 50000,
    frequency: "A",
    ownerId: "rohit",
    isTaxExempt: false, // Pvt Ltd dividend taxed at slab post-DDT abolition (Q9 default)
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

  // Expenses — a disciplined urban-salaried accumulator: discretionary living burn (excl
  // rent/EMIs/parents, which are recurring lines below) kept modest so the savings surplus
  // realistically funds the SIPs and yields a sensible FIRE path (gh-issue #11 seed reconciliation;
  // the old ₹95k left a ₹9.5k/mo surplus that couldn't fund the ₹1L/mo of contributions).
  household.setAvgMonthly(45000);
  household.addRecurring({
    label: "Rent",
    amount: 35000,
    frequency: "M",
    source: "manual",
  });
  household.addRecurring({
    label: "Society maintenance",
    amount: 12000,
    frequency: "Q",
    source: "manual",
  });
  household.addRecurring({
    label: "Property tax",
    amount: 18000,
    frequency: "A",
    source: "manual",
  });
  // A31.x — sandwich-gen parents support (~₹40K/mo), routed to the healthcare
  // inflation bucket via kind='parents' so it grows at the 14% medical rate.
  household.addRecurring({
    label: "Parents support (Rohit's parents)",
    amount: 40000,
    frequency: "M",
    source: "manual",
    kind: "parents",
    inflationBucket: "healthcare",
  });

  // A31.x — Aarav's overseas Masters (the headline education goal, ₹1.5Cr today).
  // kind='education' routes it to the 9% education-inflation bucket.
  household.addPlannedFuture({
    label: "Aarav's overseas Masters",
    todayAmount: 15000000,
    targetYear: 2040,
    isMultiYear: true,
    durationYears: 2,
    kind: "education",
    inflationBucket: "education",
  });
  household.addPlannedFuture({
    label: "Meera's college",
    todayAmount: 4000000,
    targetYear: 2042,
    isMultiYear: true,
    durationYears: 4,
    kind: "education",
    inflationBucket: "education",
  });
  household.addPlannedFuture({
    label: "Aarav's wedding",
    todayAmount: 2500000,
    targetYear: 2050,
    isMultiYear: false,
    kind: "marriage",
  });
  household.addPlannedFuture({
    label: "Meera's wedding",
    todayAmount: 2500000,
    targetYear: 2052,
    isMultiYear: false,
    kind: "marriage",
  });
  household.addPlannedFuture({
    label: "Foreign vacation (every 3 yrs)",
    todayAmount: 500000,
    targetYear: 2028,
    isMultiYear: false,
  });

  // Liabilities — home loan with derived end-year computed live
  const homeLoanRate = 8.5;
  const homeLoanBalance = 3800000;
  const homeLoanEMI = 42000;
  household.addLiability({
    name: "SBI Home Loan",
    type: "HomeLoan",
    outstandingBalance: homeLoanBalance,
    monthlyEMI: homeLoanEMI,
    interestRate: homeLoanRate,
    ownerId: "rohit",
    isSharedWithSpouse: true,
    derivedEndYear: derivedEndYear(homeLoanBalance, homeLoanEMI, homeLoanRate) ?? undefined,
  });

  // Insurance
  household.addInsurance({
    type: "Health",
    provider: "Star Health Family Floater",
    sumAssured: 1000000,
    annualPremium: 22000,
    insuredPersonId: "rohit",
  });
  household.addInsurance({
    type: "Life",
    provider: "HDFC Click2Protect (term)",
    sumAssured: 25000000,
    annualPremium: 15000,
    insuredPersonId: "rohit",
  });
  household.addInsurance({
    type: "Life",
    provider: "ICICI iProtect Smart (term)",
    sumAssured: 18000000,
    annualPremium: 12000,
    insuredPersonId: "priya",
  });
  household.addInsurance({
    type: "Vehicle",
    provider: "HDFC Ergo Comprehensive",
    sumAssured: 800000,
    annualPremium: 18000,
    insuredPersonId: "rohit",
  });

  household.markProfileComplete();
  household.markWizardComplete();

  // Silence unused warnings (members consumed for side effect)
  void rohit;
  void priya;
  void genId;
}

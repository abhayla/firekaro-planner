// The Mehta Family — DINK couple near FIRE.
// Anonymized power-user seed: 45/43 DINK, ~₹4.2Cr corpus, ~18 months to FIRE.
// Showcases rich data for 8a Net Worth / 8b Income-Expenses / 8c Cashflow charts.
import type { useHouseholdStore } from "@/stores/household";
import type { useAssumptionsStore } from "@/stores/assumptions";
import { dobFromAge } from "@/lib/age";

type HStore = ReturnType<typeof useHouseholdStore>;
type AStore = ReturnType<typeof useAssumptionsStore>;

export function loadMehtasSeed(household: HStore, assumptions: AStore) {
  household.resetAll();
  assumptions.reset();

  household.setHouseholdName("The Mehta Family");
  household.setSetupMode("Couple");

  const vikram = household.addMember({
    id: "vikram",
    name: "Vikram",
    dateOfBirth: dobFromAge(45),
    role: "ADULT",
    targetRetirementAge: 47,
    salary: { annualCTC: 4500000, hikePercent: 6 },
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Aggressive",
    marital: "Married",
    employmentStatus: "Employed",
  });
  const aanya = household.addMember({
    id: "aanya",
    name: "Aanya",
    dateOfBirth: dobFromAge(43),
    role: "ADULT",
    targetRetirementAge: 48,
    salary: { annualCTC: 2800000, hikePercent: 5 },
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Aggressive",
    marital: "Married",
    employmentStatus: "Employed",
  });

  household.autoFlowSalaryToEPF();

  // Sizable corpus reflecting ~15 years of disciplined saving + EPF maturity
  const vEPF = household.data.investments.find(
    (i) => i.type === "EPF_VPF" && i.ownerId === "vikram",
  );
  if (vEPF) vEPF.value = 6500000;
  const aEPF = household.data.investments.find(
    (i) => i.type === "EPF_VPF" && i.ownerId === "aanya",
  );
  if (aEPF) aEPF.value = 3800000;

  household.addInvestment({
    type: "Stocks",
    label: "Direct equity (large + mid cap)",
    value: 8500000,
    monthlyContribution: 50000,
    ownerId: "vikram",
    holdingsCount: 24,
  });
  household.addInvestment({
    type: "MutualFunds",
    label: "Mutual fund SIPs (multi-cap)",
    value: 9200000,
    monthlyContribution: 80000,
    ownerId: "vikram",
  });
  household.addInvestment({
    type: "PPF",
    label: "PPF (matured + re-extended)",
    value: 2800000,
    monthlyContribution: 12500,
    ownerId: "vikram",
  });
  household.addInvestment({
    type: "PPF",
    label: "PPF (matured)",
    value: 2500000,
    monthlyContribution: 12500,
    ownerId: "aanya",
  });
  household.addInvestment({
    type: "RealEstate",
    label: "3BHK Bandra Mumbai",
    value: 35000000,
    ownerId: "Joint",
  });
  household.addInvestment({
    type: "Gold",
    label: "Family gold + SGB",
    value: 1200000,
    ownerId: "Joint",
  });
  household.addInvestment({
    type: "FD",
    label: "Retirement bucket FD",
    value: 2500000,
    ownerId: "Joint",
  });
  household.addInvestment({
    type: "NPS",
    label: "NPS Tier-I",
    value: 1800000,
    monthlyContribution: 8000,
    ownerId: "vikram",
  });
  household.addInvestment({
    type: "ESOP",
    label: "Tech company ESOPs",
    value: Math.round((8000000 * 85) / 100),
    ownerId: "vikram",
    totalGrantValue: 8000000,
    vestedPercent: 85,
  });

  // Discretionary trimmed to keep the household internally consistent — a DINK
  // near-FIRE couple lives well but still saves more than it invests (#12 lock).
  household.setAvgMonthly(162000);
  household.addRecurring({
    label: "Society maintenance",
    amount: 35000,
    frequency: "M",
    source: "manual",
  });
  household.addRecurring({
    label: "Property tax",
    amount: 45000,
    frequency: "A",
    source: "manual",
  });
  household.addRecurring({
    label: "Health insurance premium",
    amount: 38000,
    frequency: "A",
    source: "manual",
  });

  // Home loan already paid off — no liabilities. Defining trait of "near FIRE".

  household.addInsurance({
    type: "Health",
    provider: "Apollo Munich Optima Restore",
    sumAssured: 2500000,
    annualPremium: 38000,
    insuredPersonId: "vikram",
  });
  household.addInsurance({
    type: "Life",
    provider: "Term cover — HDFC Click2Protect",
    sumAssured: 50000000,
    annualPremium: 28000,
    insuredPersonId: "vikram",
  });
  household.addInsurance({
    type: "Life",
    provider: "Term cover — ICICI iProtect",
    sumAssured: 35000000,
    annualPremium: 22000,
    insuredPersonId: "aanya",
  });

  household.addPlannedFuture({
    label: "Retirement world tour",
    todayAmount: 1500000,
    targetYear: 2027,
    isMultiYear: false,
  });
  household.addPlannedFuture({
    label: "Switzerland residency (sabbatical)",
    todayAmount: 2500000,
    targetYear: 2029,
    isMultiYear: false,
  });

  household.markProfileComplete();
  household.markWizardComplete();

  void vikram;
  void aanya;
}

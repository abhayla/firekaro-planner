// The Iyer Family — late-30s sandwich-gen (Q7 grill resolution).
// Earner 1: 38yo IT lead, ₹35L CTC
// Earner 2: 36yo teacher / freelance, ₹8L
// 2 kids: ages 10 and 8 (primary/secondary)
// 2 parents: ages 68 and 65 (basic medical, no major care yet)
// Corpus: ~₹2.5Cr mid-accumulation
// Joint home loan with both spouses as coBorrowers (audit Entry #23)
// Demonstrates: sandwich-gen + 80D parents + joint home loan + glide-path

import type { useHouseholdStore } from "@/stores/household";
import type { useAssumptionsStore } from "@/stores/assumptions";
import { dobFromAge } from "@/lib/age";

type HStore = ReturnType<typeof useHouseholdStore>;
type AStore = ReturnType<typeof useAssumptionsStore>;

export function loadIyersSeed(household: HStore, assumptions: AStore) {
  household.resetAll();
  assumptions.reset();

  household.setHouseholdName("The Iyer Family");
  household.setSetupMode("Couple+Children");

  const ashwin = household.addMember({
    id: "ashwin",
    name: "Ashwin",
    dateOfBirth: dobFromAge(38),
    role: "ADULT",
    targetRetirementAge: 55,
    salary: { annualCTC: 3500000, hikePercent: 10 },
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
    employmentStatus: "Employed",
  });
  const lakshmi = household.addMember({
    id: "lakshmi",
    name: "Lakshmi",
    dateOfBirth: dobFromAge(36),
    role: "ADULT",
    targetRetirementAge: 55,
    salary: { annualCTC: 800000, hikePercent: 8 },
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
    employmentStatus: "Self-employed",
  });
  // 2 kids
  household.addMember({
    id: "ananya",
    name: "Ananya",
    dateOfBirth: dobFromAge(10),
    role: "DEPENDENT",
    relation: "Daughter",
    city: "Metro",
    health: "Healthy",
    educationStage: "Primary",
    riskAppetite: "Conservative",
    marital: "Single",
  });
  household.addMember({
    id: "rohan",
    name: "Rohan",
    dateOfBirth: dobFromAge(8),
    role: "DEPENDENT",
    relation: "Son",
    city: "Metro",
    health: "Healthy",
    educationStage: "Primary",
    riskAppetite: "Conservative",
    marital: "Single",
  });
  // 2 parents (audit Entry #6 — sandwich-gen parents bucket)
  household.addMember({
    id: "ramesh",
    name: "Ramesh (father)",
    dateOfBirth: dobFromAge(68),
    role: "DEPENDENT",
    relation: "Father",
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Conservative",
    marital: "Married",
  });
  household.addMember({
    id: "sudha",
    name: "Sudha (mother)",
    dateOfBirth: dobFromAge(65),
    role: "DEPENDENT",
    relation: "Mother",
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Conservative",
    marital: "Married",
  });

  household.autoFlowSalaryToEPF();

  // Mid-accumulation corpus ~ ₹2.5Cr across MF + EPF + PPF
  household.addInvestment({
    type: "MutualFunds",
    label: "Index + Flexi-cap MF",
    value: 12_000_000,
    monthlyContribution: 50_000,
    ownerId: "ashwin",
    isAutomated: true,
  });
  household.addInvestment({
    type: "MutualFunds",
    label: "ELSS",
    value: 2_000_000,
    monthlyContribution: 12_500,
    ownerId: "lakshmi",
    isAutomated: true,
  });
  household.addInvestment({
    type: "PPF",
    label: "Ashwin PPF",
    value: 1_500_000,
    monthlyContribution: 12_500,
    ownerId: "ashwin",
    openingYear: 2014,
  });
  household.addInvestment({
    type: "NPS",
    label: "Ashwin NPS T1",
    value: 800_000,
    monthlyContribution: 4_200,
    ownerId: "ashwin",
    npsTier: "I",
  });
  household.addInvestment({
    type: "Gold",
    label: "Sovereign Gold Bonds",
    value: 500_000,
    ownerId: "Joint",
    subtype: "SGB",
  });
  household.addInvestment({
    type: "FD",
    label: "Emergency FD",
    value: 600_000,
    ownerId: "Joint",
    interestRate: 6.5,
  });

  // Joint home loan — audit Entry #23 demonstration.
  // NOTE (#12 tuning): this is a DUAL co-borrower loan, so the Section-24(b)
  // interest deduction cap is ₹4L (2 × ₹2L), not ₹2L. At ₹36L × 8.5% ≈ ₹3.06L
  // interest the deduction is now interest-bound (below the ₹4L cap), so further
  // changing the balance DOES move the deduction → tax → surplus. The reconciled
  // figures below already reflect that; don't assume the loan is tax-neutral.
  household.addLiability({
    name: "Home Loan (SBI)",
    type: "HomeLoan",
    outstandingBalance: 3_600_000,
    monthlyEMI: 34_000,
    interestRate: 8.5,
    ownerId: "ashwin",
    isSharedWithSpouse: true,
    coBorrowers: ["ashwin", "lakshmi"],
  });

  // Insurance — family floater + parents senior cover (audit Entry #10)
  household.addInsurance({
    type: "Life",
    provider: "LIC Term",
    sumAssured: 20_000_000,
    annualPremium: 22_000,
    insuredPersonId: "ashwin",
  });
  household.addInsurance({
    type: "Health",
    provider: "Star Family Floater",
    sumAssured: 1_500_000,
    annualPremium: 28_000,
    insuredPersonId: "ashwin",
  });
  household.addInsurance({
    type: "Health",
    provider: "Senior Floater (Parents)",
    sumAssured: 1_000_000,
    annualPremium: 45_000,
    insuredPersonId: "ramesh",
  });

  // Expenses — sandwich-gen reality: parents bucket + education target.
  // Discretionary trimmed (and the home loan part-prepaid above) so the family
  // saves more than it invests and clears a ~40% savings rate (#12 reconciliation).
  household.setAvgMonthly(45_000);
  household.addRecurring({
    label: "Home rent (until home loan ends)",
    amount: 32_000,
    frequency: "M",
    source: "manual",
    kind: "general",
    inflationBucket: "housing",
  });
  household.addRecurring({
    label: "Parents medical + support",
    amount: 18_000,
    frequency: "M",
    source: "manual",
    kind: "parents",
    inflationBucket: "healthcare",
  });
  household.addRecurring({
    label: "Kids school fees",
    amount: 25_000,
    frequency: "M",
    source: "manual",
    kind: "general",
    inflationBucket: "education",
  });

  household.addPlannedFuture({
    label: "Ananya's undergrad (Indian Tier-1)",
    todayAmount: 5_000_000,
    targetYear: 2034,
    isMultiYear: false,
    kind: "education",
    inflationBucket: "education",
  });
  household.addPlannedFuture({
    label: "Rohan's undergrad",
    todayAmount: 5_000_000,
    targetYear: 2036,
    isMultiYear: false,
    kind: "education",
    inflationBucket: "education",
  });

  // Glide path enabled, audit-grounded defaults
  if (household.data) {
    household.data.glidePath = {
      enabled: true,
      startEquityPercent: 75,
      endEquityPercent: 40,
      taperWindowYears: 10,
    };
    household.data.extendedFamilyContingencyPercent = 0.075;
    household.data.healthcareCorpusReservationPercent = 0.20;
  }

  household.markProfileComplete();
  household.markWizardComplete();
}

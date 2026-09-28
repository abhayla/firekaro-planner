// Ravi — the lower-band accumulator acceptance fixture (gh #185, income-path kernel spec §2).
// Single, 22, ₹3.0L CTC, ₹2.5L annual expenses, no non-EPF assets. This is the household the
// income-path goal exists to serve — the persona's low end (₹2.5L household income), where the
// savings-step-up proxy massively understates future surplus (spec §1 RCA). See
// `docs/goals/2026-09-13-income-path-kernel.md` §2 for the full worked example and expected
// FIRE-age bands under the conservative/expected income paths (NOT built yet — this seed is the
// red-first proof fixture per spec §4.5/§5 step 3).
import type { useHouseholdStore } from "@/stores/household";
import type { useAssumptionsStore } from "@/stores/assumptions";
import { dobFromAge } from "@/lib/age";

type HStore = ReturnType<typeof useHouseholdStore>;
type AStore = ReturnType<typeof useAssumptionsStore>;

export function loadRaviSeed(household: HStore, assumptions: AStore) {
  household.resetAll();
  assumptions.reset();

  household.setHouseholdName("Ravi");
  household.setSetupMode("Solo");

  const ravi = household.addMember({
    id: "ravi",
    name: "Ravi",
    dateOfBirth: dobFromAge(22),
    role: "ADULT",
    targetRetirementAge: 50,
    salary: { annualCTC: 300000, hikePercent: 12 },
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Single",
    employmentStatus: "Employed",
  });

  // EPF on (spec §2) — auto-flow creates the EPF_VPF investment line from the salary.
  household.autoFlowSalaryToEPF();

  // No non-EPF assets (spec §2 — "no assets"). Year-0 saves ~₹0.5L (₹3.0L income − ₹2.5L expenses).
  household.setAvgMonthly(Math.round(250000 / 12));

  household.markProfileComplete();
  household.markWizardComplete();

  void ravi;
}

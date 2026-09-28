// Ravi — the lower-band accumulator acceptance fixture (gh #185, income-path kernel spec §2).
// Single, 22, ₹3.0L CTC, ₹2.5L annual expenses. This is the household the income-path goal exists
// to serve — the persona's low end (₹2.5L household income), where the savings-step-up proxy
// massively understates future surplus (spec §1 RCA). See
// `docs/goals/2026-09-13-income-path-kernel.md` §2 for the full worked example and expected
// FIRE-age bands under the conservative/expected income paths (NOT built yet — this seed is the
// red-first proof fixture per spec §4.5/§5 step 3).
//
// gh #194 (2026-09-29, FinTech-adjudicated): the spec's §2 worked example prices Ravi's surplus at
// "nominal return 12%" — i.e. it assumes the surplus is INVESTED, not left uninvested. The seed
// originally had no non-EPF holding at all, so once #194's engine fix stopped defaulting a
// zero-value portfolio to the all-equity rate, Ravi's ₹32k/yr of unallocated surplus was priced at
// the EPF rate instead — understating the spec's own modeled outcome. The SIP line below
// (moderate equity/debt mix, consistent with `riskAppetite: "Moderate"`) puts that surplus to work
// the way the spec assumes, while still using `value: 0` (a fresh SIP, no accumulated corpus yet)
// so the #194 zero-value-fallback path is still the one being exercised — it now resolves off a
// CONTRIBUTION mix that actually includes non-EPF instruments, per the fix's own design.
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

  // Year-0 saves ~₹0.5L (₹3.0L income − ₹2.5L expenses).
  household.setAvgMonthly(Math.round(250000 / 12));

  // gh #194 (supervisor follow-up, 2026-09-29) — the surplus left after EPF is INVESTED (spec §2
  // models the whole surplus growing at a nominal 12% return), not left sitting uninvested. The
  // equity/debt split is NOT ad hoc: searched for a `riskAppetite` -> allocation mapping (the only
  // candidate is `src/lib/glide-path.ts`'s `computeGlidePath`/`equityPercentAtYear`) and found NONE
  // — `riskAppetite` is captured on the member profile (`src/types/household.ts:91`) and displayed
  // (`MembersForm.vue:114`) but is never read by `derive.ts`, `glide-path.ts`, or any allocation
  // logic; a household's `glidePath` config is `enabled: false` unless the user turns it on, and
  // Ravi's seed does not. Per the fallback instruction, this uses the ONE allocation ratio the app
  // itself documents as a default: `glidePathConfigSchema.startEquityPercent` (`household.ts:487`,
  // default 75 — the Pfau-Kitces "rising equity" path's START-of-horizon equity %, the natural
  // choice for a 22-year-old at the very start of their horizon even with the glide path off).
  // 75/25 equity/debt of the ~₹4,100/mo surplus-after-EPF => ₹3,075 MF (equity) + ₹1,025 FD (debt).
  // `value: 0` — a fresh SIP with no accumulated corpus yet, same as the EPF line. NOTE: these
  // `monthlyContribution` values feed ONLY the #194 zero-value RETURN/VOLATILITY blend weighting
  // (`returnBucketKey` in `assumption-math.ts`) — they are display/weighting metadata, never
  // additive to the corpus inflow, which stays the single household savings residual
  // (`derive.ts` gh-issue #11 lock, ~line 400-408).
  household.addInvestment({
    type: "MutualFunds",
    label: "Starter SIP (equity, 75% per glide-path start allocation)",
    value: 0,
    monthlyContribution: 3075,
    ownerId: "ravi",
    isAutomated: true,
  });
  household.addInvestment({
    type: "FD",
    label: "Starter SIP (debt, 25% per glide-path start allocation)",
    value: 0,
    monthlyContribution: 1025,
    ownerId: "ravi",
    isAutomated: true,
  });

  household.markProfileComplete();
  household.markWizardComplete();

  void ravi;
}

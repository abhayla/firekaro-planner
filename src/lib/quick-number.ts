/**
 * T-378 (QN-1) — turn the ten `/quick` answers into REAL household data.
 *
 * The 5W principle-2 rule and the storage invariant both say the same thing: the express path may
 * NOT keep a private side-store of answers. Everything the user tells us becomes the same members /
 * investments / liabilities / expense lines the seven-step wizard would have produced, so the
 * dashboard, the Goals screen and `/api/planner/household` all agree by construction (rule 26).
 *
 * PURE: takes a Household, returns a NEW Household. The page calls `store.replaceAll()` and then the
 * store's own auto-flow runners — which regenerate the very rows this module writes (same ids, same
 * shape), so running them twice is a no-op rather than a duplicate.
 *
 * THE ONE NON-OBVIOUS DECISION — why we solve for a salary instead of just storing the answer.
 * `derive()` grows the corpus from the household SAVINGS RESIDUAL (income − tax − expenses), NOT
 * from `investments[].monthlyContribution` (gh #11 fixed a ~10× double-count by making that field
 * display-only). So "I invest ₹1.75 L a month" only reaches the FIRE number if the recorded income
 * leaves exactly that much after tax and spending. We therefore bisect on the salary CTC — through
 * the real `derive()` kernel, never a parallel formula — until the residual equals what the user
 * said they actually invest. The alternative (store their take-home answer verbatim) would make the
 * plan assume every unspent rupee is invested: for the reference household that is ₹2.2 L/month
 * against ₹1.75 L actually invested — a 26% optimism error in the pace, which is precisely the
 * failure mode the honesty mandate exists to prevent.
 */
import type { Assumptions } from "@/types/assumptions";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";
import type {
  EducationStage,
  Household,
  Investment,
  Liability,
  Member,
  PlannedFutureLine,
  RecurringExpenseLine,
} from "@/types/household";
import type { QuickAnswers } from "@/types/quick-number";
import { derive } from "@/lib/derive";

/** Every row the quick path owns carries this id prefix — that is what makes a re-run idempotent. */
export const QUICK_ID_PREFIX = "quick-";
export const QUICK_INVESTMENT_LABEL = "All investments (quick estimate)";
/** Ages the goal timings come from (transcript: education at 18, weddings "at the age of 30"). */
export const EDUCATION_AT_AGE = 18;
export const POSTGRAD_AT_AGE = 22;
export const WEDDING_AT_AGE = 30;
/** Bisection budget for the salary solve — the residual is monotone in CTC. */
const SALARY_SOLVE_ITERATIONS = 44;
const SALARY_SOLVE_TOLERANCE = 500; // rupees/month

export interface ApplyQuickAnswersOptions {
  /** Needed because the salary solve runs the real kernel. Defaults to the research defaults. */
  assumptions?: Assumptions;
  /** Injectable clock so every date the mapping derives is deterministic in tests. */
  now?: Date;
  /** `ui.quick.createdIds` from a previous run — those rows are replaced, never duplicated. */
  previousCreatedIds?: string[];
}

export interface ApplyQuickAnswersResult {
  household: Household;
  /** Ids of every row this run owns — persisted into `ui.quick.createdIds`. */
  createdIds: string[];
  /** The CTC the solve landed on (0 when there was nothing to anchor on). */
  salaryAnnualCTC: number;
  /** What `derive()` actually reports as the monthly contribution for the returned household. */
  solvedContributionMonthly: number;
}

const n = (v: number | undefined | null): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

/** Jan-1 birthday keeps the derived age exact for every day of the year. */
function birthDateFor(age: number, now: Date): string {
  const year = now.getFullYear() - Math.max(0, Math.round(age));
  return `${year}-01-01`;
}

export function educationStageForAge(age: number): EducationStage {
  if (age < 5) return "Preschool";
  if (age <= 10) return "Primary";
  if (age <= 17) return "Secondary";
  return "College";
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Mirror of `useHouseholdStore().autoFlowEMIToRecurring` for the liabilities this module creates.
 * Same id scheme (`auto-loan-<liabilityId>`) and same `source`, so when the store runs its own
 * auto-flow after `replaceAll` it rebuilds an identical line instead of adding a second one.
 */
function autoLoanRecurringLine(loan: Liability): RecurringExpenseLine {
  return {
    id: `auto-loan-${loan.id}`,
    label: `EMI — ${loan.name}`,
    amount: loan.monthlyEMI,
    frequency: "M",
    source: "auto-loan",
    sourceRefId: loan.id,
    endYear: loan.derivedEndYear ?? undefined,
    ownerId: "Household",
  };
}

/** Mirror of the store's salary→EPF auto-flow (12% of an estimated 40%-of-CTC basic, both sides). */
function autoEpfInvestment(member: Member): Investment | null {
  const ctc = n(member.salary?.annualCTC);
  if (!ctc) return null;
  const basic = ctc * 0.4;
  const topUp = (member.salary?.vpfTopUpPercent ?? 0) / 100;
  const monthly = Math.round((basic * 0.12 * (1 + topUp) + basic * 0.12) / 12);
  return {
    id: `${QUICK_ID_PREFIX}epf-${member.id}`,
    type: "EPF_VPF",
    label: "EPF",
    value: 0,
    monthlyContribution: monthly,
    ownerId: member.id,
  };
}

/**
 * Bisect the salary CTC until `predicate(derive(...))` first turns true. Monotone by construction:
 * more CTC ⇒ more take-home ⇒ more residual. Returns the SMALLEST qualifying CTC rounded DOWN to
 * the nearest ₹1,000, so the recorded pace can only ever be a touch under what the user claimed —
 * never over it.
 */
function solveSalary(
  base: Household,
  memberId: string,
  assumptions: Assumptions,
  target: number,
  read: (k: ReturnType<typeof deriveOnce>) => number,
): { ctc: number; value: number } {
  const withCtc = (ctc: number) => {
    const hh = clone(base);
    const member = hh.members.find((m) => m.id === memberId);
    if (member) {
      member.salary = { ...(member.salary ?? { hikePercent: 0 }), annualCTC: ctc, hikePercent: 0 };
      const epf = autoEpfInvestment(member);
      hh.investments = hh.investments.filter((i) => i.id !== `${QUICK_ID_PREFIX}epf-${memberId}`);
      if (epf) hh.investments.push(epf);
    }
    return hh;
  };
  const at = (ctc: number) => read(deriveOnce(withCtc(ctc), assumptions));

  let lo = 0;
  let hi = Math.max(target * 12 * 2, 1_000_000);
  for (let expand = 0; expand < 10 && at(hi) < target; expand += 1) hi *= 2;
  if (at(hi) < target) return { ctc: Math.round(hi), value: at(hi) }; // unreachable: report honestly

  for (let i = 0; i < SALARY_SOLVE_ITERATIONS && hi - lo > SALARY_SOLVE_TOLERANCE; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= target) hi = mid;
    else lo = mid;
  }
  const ctc = Math.floor(hi / 1000) * 1000;
  return { ctc, value: at(ctc) };
}

function deriveOnce(hh: Household, assumptions: Assumptions) {
  return derive(hh, assumptions, {
    isFamilyView: false,
    viewingMemberId: null,
    currentFY: currentFinancialYearLabel(),
  });
}

/** Local FY label — the lens only needs a well-formed year, and this keeps the module store-free. */
function currentFinancialYearLabel(now: Date = new Date()): string {
  const y = now.getFullYear();
  const start = now.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function applyQuickAnswers(
  household: Household,
  answers: QuickAnswers,
  options: ApplyQuickAnswersOptions = {},
): ApplyQuickAnswersResult {
  const assumptions = options.assumptions ?? DEFAULT_ASSUMPTIONS;
  const now = options.now ?? new Date();
  const year = now.getFullYear();
  const previous = new Set(options.previousCreatedIds ?? []);

  const hh = clone(household);

  // ---- 1. clear out whatever a previous quick run owned (never duplicate) ----
  const isOurs = (id: string) => id.startsWith(QUICK_ID_PREFIX) || previous.has(id);
  const removedMemberIds = new Set(hh.members.filter((m) => isOurs(m.id)).map((m) => m.id));
  hh.members = hh.members.filter((m) => !isOurs(m.id));
  hh.investments = hh.investments.filter(
    (i) => !isOurs(i.id) && i.quickSource !== true && !removedMemberIds.has(i.ownerId),
  );
  const removedLoanIds = new Set(hh.liabilities.filter((l) => isOurs(l.id)).map((l) => l.id));
  hh.liabilities = hh.liabilities.filter((l) => !isOurs(l.id));
  hh.expenses.plannedFuture = hh.expenses.plannedFuture.filter((p) => !isOurs(p.id));
  hh.expenses.recurring = hh.expenses.recurring.filter(
    (r) => !isOurs(r.id) && !(r.sourceRefId != null && removedLoanIds.has(r.sourceRefId)),
  );

  const createdIds: string[] = [];
  const track = <T extends { id: string }>(row: T): T => {
    createdIds.push(row.id);
    return row;
  };

  // ---- 2. people ----
  const selfId = `${QUICK_ID_PREFIX}self`;
  const self: Member = {
    id: selfId,
    name: "You",
    dateOfBirth: birthDateFor(answers.age, now),
    role: "ADULT",
    targetRetirementAge: answers.targetAge,
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: answers.includeSpouse ? "Married" : "Single",
  };
  hh.members.push(track(self));

  let spouse: Member | null = null;
  if (answers.includeSpouse) {
    // The express path never asks the spouse's age — assuming the user's own keeps it to ten
    // cards, and the spouse card says so out loud ("we'll assume they're your age").
    spouse = {
      id: `${QUICK_ID_PREFIX}spouse`,
      name: "Spouse",
      dateOfBirth: birthDateFor(answers.age, now),
      role: "ADULT",
      targetRetirementAge: answers.targetAge,
      city: "Metro",
      health: "Healthy",
      riskAppetite: "Moderate",
      marital: "Married",
    };
    hh.members.push(track(spouse));
  }

  const kidCount = Math.max(0, Math.round(n(answers.kids)));
  const kidAge = Math.max(0, Math.round(n(answers.kidsAge)));
  for (let k = 0; k < kidCount; k += 1) {
    const kid: Member = {
        id: `${QUICK_ID_PREFIX}kid-${k + 1}`,
        name: `Child ${k + 1}`,
        dateOfBirth: birthDateFor(kidAge, now),
        role: "DEPENDENT",
        city: "Metro",
        health: "Healthy",
        riskAppetite: "Moderate",
        marital: "Single",
        educationStage: educationStageForAge(kidAge),
    };
    hh.members.push(track(kid));
  }
  hh.setupMode = answers.includeSpouse
    ? kidCount > 0
      ? "Couple+Children"
      : "Couple"
    : "Solo";

  // ---- 3. investments — ONE line per adult, holding everything they told us about ----
  const quickInvestment = (owner: Member, value: number, monthly: number): Investment => ({
    id: `${QUICK_ID_PREFIX}inv-${owner.id}`,
    // MutualFunds is the equity-classified catch-all (investment-traits.ts); the full planner is
    // where a real portfolio gets split into its actual instruments.
    type: "MutualFunds",
    label: QUICK_INVESTMENT_LABEL,
    value,
    monthlyContribution: monthly,
    ownerId: owner.id,
    quickSource: true,
  });
  // Display-only split of the stated monthly investing across the adults who hold money.
  const selfCorpus = n(answers.corpus);
  const spouseCorpus = answers.includeSpouse ? n(answers.spouseCorpus) : 0;
  const sip = n(answers.sip);
  const totalCorpus = selfCorpus + spouseCorpus;
  const selfShare = totalCorpus > 0 ? selfCorpus / totalCorpus : 1;
  hh.investments.push(track(quickInvestment(self, selfCorpus, Math.round(sip * selfShare))));
  if (spouse) {
    hh.investments.push(
      track(quickInvestment(spouse, spouseCorpus, Math.round(sip * (1 - selfShare)))),
    );
  }

  // ---- 4. spending + the loan (the ONLY place the EMI enters spending) ----
  hh.expenses.avgMonthly = n(answers.spend);
  if (answers.hasLoan && n(answers.emi) > 0) {
    const yearsLeft = Math.max(0, Math.round(n(answers.loanYearsLeft)));
    const emi = n(answers.emi);
    const loan: Liability = track({
      id: `${QUICK_ID_PREFIX}home-loan`,
      name: "Home loan",
      type: "HomeLoan",
      // Balance is not asked (it is not needed for the FIRE number — the EMI is). A simple
      // undiscounted remaining-payments figure is honest about what we know and is refined in
      // the full planner rather than invented with a false precision.
      outstandingBalance: Math.round(emi * 12 * yearsLeft),
      monthlyEMI: emi,
      // The schema stores the rate as a PERCENT; the card collects it as one too.
      interestRate: Math.round(n(answers.loanRate) * 1000) / 10,
      ownerId: self.id,
      isSharedWithSpouse: Boolean(spouse),
      derivedEndYear: year + yearsLeft,
    });
    hh.liabilities.push(loan);
    hh.expenses.recurring.push(autoLoanRecurringLine(loan));
  }

  // ---- 5. planned goals (T-376/#165: EVERY kind now moves the FIRE number) ----
  const goal = (
    suffix: string,
    label: string,
    todayAmount: number,
    targetYear: number,
    kind: PlannedFutureLine["kind"],
    bucket: PlannedFutureLine["inflationBucket"],
  ): PlannedFutureLine =>
    track({
      id: `${QUICK_ID_PREFIX}goal-${suffix}`,
      label,
      todayAmount,
      targetYear,
      isMultiYear: false,
      kind,
      inflationBucket: bucket,
      ownerId: kind === "general" ? "Household" : "Dependents",
    });

  const yearsUntilKidAge = (age: number) => Math.max(0, age - kidAge);
  if (kidCount > 0 && n(answers.education) > 0) {
    hh.expenses.plannedFuture.push(
      goal(
        "education",
        "Education — all kids",
        n(answers.education),
        year + yearsUntilKidAge(EDUCATION_AT_AGE),
        "education",
        "education",
      ),
    );
  }
  if (kidCount > 0 && n(answers.postgrad) > 0) {
    hh.expenses.plannedFuture.push(
      goal(
        "postgrad",
        "Post-grad — all kids",
        n(answers.postgrad),
        year + yearsUntilKidAge(POSTGRAD_AT_AGE),
        "education",
        "education",
      ),
    );
  }
  if (kidCount > 0 && n(answers.wedding) > 0) {
    hh.expenses.plannedFuture.push(
      goal(
        "wedding",
        "Weddings — all kids",
        n(answers.wedding),
        year + yearsUntilKidAge(WEDDING_AT_AGE),
        "marriage",
        "general",
      ),
    );
  }
  if (answers.includeHouse && n(answers.house) > 0) {
    hh.expenses.plannedFuture.push(
      goal(
        "purchase",
        "Big purchase (home upgrade / car)",
        n(answers.house),
        year + Math.max(0, Math.round(answers.houseInYears ?? 6)),
        "general",
        "housing",
      ),
    );
  }

  // ---- 6. the salary solve (see the module header for why this exists) ----
  let salaryAnnualCTC = 0;
  let solvedContributionMonthly = 0;
  if (sip > 0) {
    const solved = solveSalary(hh, self.id, assumptions, sip, (k) => k.monthlyContribution);
    salaryAnnualCTC = solved.ctc;
    solvedContributionMonthly = solved.value;
  } else if (n(answers.income) > 0) {
    // Nothing invested to anchor on — fall back to matching the take-home they DID give us.
    const solved = solveSalary(hh, self.id, assumptions, n(answers.income), (k) => k.monthlyTakeHome);
    salaryAnnualCTC = solved.ctc;
    solvedContributionMonthly = 0;
  }
  if (salaryAnnualCTC > 0) {
    self.salary = { annualCTC: salaryAnnualCTC, hikePercent: 0 };
    const epf = autoEpfInvestment(self);
    if (epf) {
      hh.investments = hh.investments.filter((i) => i.id !== epf.id);
      hh.investments.push(epf);
      createdIds.push(epf.id);
      // The stated monthly investing ALREADY includes PF (card 5 says so). The EPF line the
      // salary auto-flow adds is therefore part of that same total, not extra — so the quick
      // line carries the remainder. Display-only, but a visible double-count would still read
      // as "we think you invest more than you do".
      const quickSelf = hh.investments.find((i) => i.id === `${QUICK_ID_PREFIX}inv-${self.id}`);
      if (quickSelf) {
        quickSelf.monthlyContribution = Math.max(
          0,
          Math.round(n(quickSelf.monthlyContribution) - n(epf.monthlyContribution)),
        );
      }
    }
  }

  hh.profileComplete = true;
  hh.wizardCompleted = true;
  if (!hh.name) hh.name = "My household";

  return {
    household: hh,
    createdIds,
    salaryAnnualCTC,
    solvedContributionMonthly:
      solvedContributionMonthly || deriveOnce(hh, assumptions).monthlyContribution,
  };
}
